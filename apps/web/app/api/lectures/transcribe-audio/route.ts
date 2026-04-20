import { createPartFromUri, createUserContent, GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_AUDIO_BYTES = 300 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/aiff",
  "audio/aac",
  "audio/ogg",
  "audio/flac"
]);

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

function safeExtension(fileName: string) {
  const extension = extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");

  return extension || ".audio";
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

  if (!(audio instanceof File)) {
    return errorResponse("Audio file is required.");
  }

  if (audio.size <= 0) {
    return errorResponse("Audio file is empty.");
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return errorResponse("Audio file is too large for this local transcription test. Keep it under 300 MB.");
  }

  const mimeType = getAudioMimeType(audio);

  if (!SUPPORTED_AUDIO_TYPES.has(mimeType)) {
    return errorResponse("Use WAV, MP3, OGG, AAC, AIFF, or FLAC for Gemini transcription.", 400);
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });
  const tempDirectory = join(tmpdir(), "major-study-helper");
  const tempPath = join(tempDirectory, `${randomUUID()}${safeExtension(audio.name)}`);
  let uploadedFileName = "";

  try {
    await mkdir(tempDirectory, { recursive: true });
    await writeFile(tempPath, Buffer.from(await audio.arrayBuffer()));

    const uploadedFile = await ai.files.upload({
      file: tempPath,
      config: {
        mimeType,
        displayName: audio.name || title
      }
    });

    uploadedFileName = uploadedFile.name ?? "";

    if (!uploadedFile.uri || !uploadedFile.mimeType) {
      throw new Error("Gemini file upload did not return a usable file URI.");
    }

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_STUDY_MODEL || "gemini-2.5-flash",
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        [
          "Generate a faithful transcript of this lecture audio.",
          "Keep the transcript in the original spoken language.",
          "Preserve academic terms, formulas, names, and technical vocabulary as accurately as possible.",
          "Do not summarize yet. Only return the transcript text.",
          `Course: ${courseName}`,
          `Lecture title: ${title}`
        ].join("\n")
      ])
    });

    const transcript = response.text?.trim();

    if (!transcript) {
      return errorResponse("Gemini returned no transcript text.", 502);
    }

    return NextResponse.json({
      transcript
    });
  } finally {
    await unlink(tempPath).catch(() => undefined);

    if (uploadedFileName) {
      await ai.files.delete({ name: uploadedFileName }).catch(() => undefined);
    }
  }
}
