import { GoogleGenAI, Type } from "@google/genai";
import { uploadLectureAudioToNcpObjectStorage } from "@/lib/server/ncpObjectStorage";
import { transcribeWithWhisper, WhisperTranscriptionError } from "@/lib/server/whisperTranscription";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

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

interface StudyMaterials {
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
}

function parseStudyMaterials(text: string) {
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(text) as StudyMaterials;
}

async function generateStudyMaterialsFromTranscript(
  ai: GoogleGenAI,
  title: string,
  courseName: string,
  transcript: string
) {
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_STUDY_MODEL || "gemini-3-flash-preview",
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
    const transcript = await transcribeWithWhisper(audio);
    const studyMaterials = await generateStudyMaterialsFromTranscript(ai, title, courseName, transcript);
    const audioPath = await uploadLectureAudioToNcpObjectStorage({ audio, userId });

    return NextResponse.json({
      transcript,
      audioPath,
      ...studyMaterials
    });
  } catch (error) {
    if (error instanceof WhisperTranscriptionError) {
      return errorResponse(error.message, error.status);
    }

    if (error instanceof Error) {
      return errorResponse(error.message, 502);
    }

    return errorResponse("Lecture processing failed.", 502);
  }
}
