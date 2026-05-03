import {
  streamWhisperTranscription,
  transcribeWithWhisper,
  WhisperTranscriptionError
} from "@/lib/server/whisperTranscription";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 7200;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function streamTranscriptionResponse(audio: File) {
  const encoder = new TextEncoder();
  const transcriptParts: string[] = [];

  return new Response(
    new ReadableStream({
      async start(controller) {
        function enqueue(payload: object) {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        }

        try {
          for await (const chunk of streamWhisperTranscription(audio)) {
            if (chunk.transcript) {
              transcriptParts.push(chunk.transcript);
            }

            enqueue({
              type: "chunk",
              ...chunk
            });
          }

          enqueue({
            type: "done",
            transcript: transcriptParts.join("\n\n").trim()
          });
        } catch (error) {
          enqueue({
            type: "error",
            error: error instanceof Error ? error.message : "Whisper transcription failed."
          });
        } finally {
          controller.close();
        }
      }
    }),
    {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/x-ndjson; charset=utf-8"
      }
    }
  );
}

export async function POST(request: Request) {
  const shouldStream = new URL(request.url).searchParams.get("stream") === "1";
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

  if (shouldStream) {
    return streamTranscriptionResponse(audio);
  }

  try {
    const transcript = await transcribeWithWhisper(audio);

    return NextResponse.json({
      transcript
    });
  } catch (error) {
    if (error instanceof WhisperTranscriptionError) {
      return errorResponse(error.message, error.status);
    }

    return errorResponse(error instanceof Error ? error.message : "Whisper transcription failed.", 502);
  }
}
