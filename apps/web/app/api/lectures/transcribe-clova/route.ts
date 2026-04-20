import { ClovaSpeechError, transcribeWithClovaSpeech } from "@/lib/server/clovaSpeech";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Send audio as multipart/form-data.");
  }

  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return errorResponse("Audio file is required.");
  }

  try {
    const transcript = await transcribeWithClovaSpeech(audio);

    return NextResponse.json({ transcript });
  } catch (error) {
    if (error instanceof ClovaSpeechError) {
      return errorResponse(error.message, error.status);
    }

    return errorResponse(error instanceof Error ? error.message : "CLOVA Speech transcription failed.", 502);
  }
}
