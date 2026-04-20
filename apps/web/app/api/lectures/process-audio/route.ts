import { GoogleGenAI, Type } from "@google/genai";
import { ClovaSpeechError, isClovaSpeechConfigured, transcribeWithClovaSpeech } from "@/lib/server/clovaSpeech";
import { uploadLectureAudioToNcpObjectStorage } from "@/lib/server/ncpObjectStorage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_AUDIO_BYTES = 14 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/aiff",
  "audio/aac",
  "audio/ogg",
  "audio/flac"
]);

const studyPackSchema = {
  type: Type.OBJECT,
  required: ["summaryOriginal", "summaryRussian", "keyTerms", "quizzes"],
  properties: {
    transcript: {
      type: Type.STRING,
      description: "Detailed transcript of the lecture audio in the original spoken language."
    },
    summaryOriginal: {
      type: Type.STRING,
      description: "Concise Korean summary of the lecture."
    },
    summaryRussian: {
      type: Type.STRING,
      description: "Concise Russian summary for a Russian-speaking international student."
    },
    keyTerms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["term", "originalExplanation", "russianExplanation"],
        properties: {
          term: { type: Type.STRING },
          originalExplanation: { type: Type.STRING },
          russianExplanation: { type: Type.STRING }
        }
      }
    },
    quizzes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["type", "question", "options", "answer", "explanation", "difficulty"],
        properties: {
          type: {
            type: Type.STRING,
            enum: ["multiple_choice", "short_answer", "blank"]
          },
          question: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          answer: { type: Type.STRING },
          explanation: { type: Type.STRING },
          difficulty: {
            type: Type.STRING,
            enum: ["easy", "medium", "hard"]
          }
        }
      }
    }
  }
} as const;

const studyMaterialsSchema = {
  type: Type.OBJECT,
  required: ["summaryOriginal", "summaryRussian", "keyTerms", "quizzes"],
  properties: {
    summaryOriginal: {
      type: Type.STRING,
      description: "Concise Korean summary of the lecture."
    },
    summaryRussian: {
      type: Type.STRING,
      description: "Concise Russian summary for a Russian-speaking international student."
    },
    keyTerms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["term", "originalExplanation", "russianExplanation"],
        properties: {
          term: { type: Type.STRING },
          originalExplanation: { type: Type.STRING },
          russianExplanation: { type: Type.STRING }
        }
      }
    },
    quizzes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["type", "question", "options", "answer", "explanation", "difficulty"],
        properties: {
          type: {
            type: Type.STRING,
            enum: ["multiple_choice", "short_answer", "blank"]
          },
          question: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          answer: { type: Type.STRING },
          explanation: { type: Type.STRING },
          difficulty: {
            type: Type.STRING,
            enum: ["easy", "medium", "hard"]
          }
        }
      }
    }
  }
} as const;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getAudioMimeType(file: File) {
  const fileName = file.name.toLowerCase();
  const declaredType = file.type.split(";")[0];

  if (SUPPORTED_AUDIO_TYPES.has(declaredType)) {
    return declaredType;
  }

  if (fileName.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  if (fileName.endsWith(".aac") || fileName.endsWith(".m4a")) {
    return "audio/aac";
  }

  if (fileName.endsWith(".wav")) {
    return "audio/wav";
  }

  if (fileName.endsWith(".ogg") || fileName.endsWith(".oga")) {
    return "audio/ogg";
  }

  if (fileName.endsWith(".flac")) {
    return "audio/flac";
  }

  if (fileName.endsWith(".aiff") || fileName.endsWith(".aif")) {
    return "audio/aiff";
  }

  return declaredType || "application/octet-stream";
}

function parseStudyPack(text: string) {
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(text) as {
    transcript: string;
    summaryOriginal: string;
    summaryRussian: string;
    keyTerms: Array<{
      term: string;
      originalExplanation: string;
      russianExplanation: string;
    }>;
    quizzes: Array<{
      type: "multiple_choice" | "short_answer" | "blank";
      question: string;
      options: string[];
      answer: string;
      explanation: string;
      difficulty: "easy" | "medium" | "hard";
    }>;
  };
}

type StudyMaterials = Omit<ReturnType<typeof parseStudyPack>, "transcript">;

function parseStudyMaterials(text: string) {
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(text) as StudyMaterials;
}

async function generateStudyPackFromAudio(ai: GoogleGenAI, title: string, courseName: string, audio: File) {
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large for inline Gemini testing. Keep it under 14 MB.");
  }

  const mimeType = getAudioMimeType(audio);

  if (!SUPPORTED_AUDIO_TYPES.has(mimeType)) {
    throw new Error(
      `Gemini does not support ${mimeType || "this audio format"} in this MVP. Use WAV, MP3, OGG, AAC, AIFF, or FLAC.`
    );
  }

  const audioBuffer = Buffer.from(await audio.arrayBuffer());
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_STUDY_MODEL || "gemini-2.5-flash",
    contents: [
      {
        text: [
          "You create study materials for Russian-speaking international students studying university lectures in Korean or English.",
          `Course: ${courseName}`,
          `Lecture title: ${title}`,
          "Listen to the audio and return a JSON object with:",
          "1. A detailed transcript in the original spoken language.",
          "2. A concise original-language or Korean summary.",
          "3. A concise Russian summary using student-friendly language.",
          "4. Two to eight key academic terms with original-language and Russian explanations.",
          "5. Two to six quiz questions for review.",
          "For short test recordings, still produce useful output from the available audio."
        ].join("\n")
      },
      {
        inlineData: {
          mimeType,
          data: audioBuffer.toString("base64")
        }
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: studyPackSchema
    }
  });

  return parseStudyPack(response.text ?? "");
}

async function generateStudyMaterialsFromTranscript(
  ai: GoogleGenAI,
  title: string,
  courseName: string,
  transcript: string
) {
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_STUDY_MODEL || "gemini-2.5-flash",
    contents: [
      {
        text: [
          "You create study materials for Russian-speaking international students studying university lectures in Korean or English.",
          `Course: ${courseName}`,
          `Lecture title: ${title}`,
          "Use this transcript as the source of truth:",
          transcript,
          "Return a JSON object with:",
          "1. A concise original-language or Korean summary.",
          "2. A concise Russian summary using student-friendly language.",
          "3. Two to eight key academic terms with original-language and Russian explanations.",
          "4. Two to six quiz questions for review.",
          "Do not invent facts that are not supported by the transcript."
        ].join("\n")
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: studyMaterialsSchema
    }
  });

  return parseStudyMaterials(response.text ?? "");
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return errorResponse("GEMINI_API_KEY is missing in apps/web/.env.local.", 500);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Send audio as multipart/form-data.");
  }

  const audio = formData.get("audio");
  const title = String(formData.get("title") ?? "Lecture");
  const courseName = String(formData.get("courseName") ?? "Course");
  const userId = String(formData.get("userId") ?? "anonymous");

  if (!(audio instanceof File)) {
    return errorResponse("Audio file is required.");
  }

  if (audio.size <= 0) {
    return errorResponse("Audio file is empty.");
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  try {
    if (isClovaSpeechConfigured()) {
      const transcript = await transcribeWithClovaSpeech(audio);
      const studyMaterials = await generateStudyMaterialsFromTranscript(ai, title, courseName, transcript);
      const audioPath = await uploadLectureAudioToNcpObjectStorage({ audio, userId });

      return NextResponse.json({
        transcript,
        audioPath,
        ...studyMaterials
      });
    }

    const studyPack = await generateStudyPackFromAudio(ai, title, courseName, audio);
    const audioPath = await uploadLectureAudioToNcpObjectStorage({ audio, userId });

    return NextResponse.json({
      ...studyPack,
      audioPath
    });
  } catch (error) {
    if (error instanceof ClovaSpeechError) {
      return errorResponse(error.message, error.status);
    }

    if (error instanceof Error) {
      const status =
        error.message.startsWith("Audio file is too large") || error.message.startsWith("Gemini does not support")
          ? 400
          : 502;

      return errorResponse(error.message, status);
    }

    return errorResponse("Lecture processing failed.", 502);
  }
}
