import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class WhisperTranscriptionError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "WhisperTranscriptionError";
    this.status = status;
  }
}

const MAX_AUDIO_BYTES = 300 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 170_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 3_600_000;
const DEFAULT_CHUNK_SECONDS = 600;
const MIN_CHUNK_SECONDS = 60;
const MAX_CHUNK_SECONDS = 1_800;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/aiff",
  "audio/aac",
  "audio/ac3",
  "audio/ogg",
  "audio/flac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm"
]);

const WHISPER_SCRIPT = `
import json
import os
import sys

try:
    import whisper
except ModuleNotFoundError as error:
    print(json.dumps({"error": "missing_whisper", "detail": str(error)}))
    sys.exit(42)

audio_paths = sys.argv[1:]
model_name = os.environ.get("WHISPER_MODEL", "turbo")
language = os.environ.get("WHISPER_LANGUAGE") or None
device = os.environ.get("WHISPER_DEVICE") or None
download_root = os.environ.get("WHISPER_MODEL_DIR") or None

model = whisper.load_model(model_name, device=device, download_root=download_root)
options = {
    "task": "transcribe",
    "verbose": False,
    "fp16": False,
}

if language:
    options["language"] = language

total = len(audio_paths)

for index, audio_path in enumerate(audio_paths):
    result = model.transcribe(audio_path, **options)
    print(json.dumps({
        "index": index,
        "total": total,
        "transcript": (result.get("text") or "").strip()
    }, ensure_ascii=False), flush=True)
`;

interface WhisperPayload {
  index?: number;
  total?: number;
  transcript?: string;
  transcripts?: string[];
  error?: string;
  detail?: string;
}

export interface WhisperTranscriptChunk {
  index: number;
  total: number;
  transcript: string;
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

  if (fileName.endsWith(".aac")) {
    return "audio/aac";
  }

  if (fileName.endsWith(".ac3")) {
    return "audio/ac3";
  }

  if (fileName.endsWith(".m4a")) {
    return "audio/mp4";
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

  if (fileName.endsWith(".webm")) {
    return "audio/webm";
  }

  return declaredType || "application/octet-stream";
}

function safeExtension(fileName: string) {
  const extension = extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");

  return extension || ".audio";
}

function whisperTimeoutMs() {
  const value = Number(process.env.WHISPER_TIMEOUT_MS);

  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function whisperTotalTimeoutMs() {
  const value = Number(process.env.WHISPER_TOTAL_TIMEOUT_MS);

  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOTAL_TIMEOUT_MS;
}

function whisperChunkSeconds() {
  const value = Number(process.env.WHISPER_CHUNK_SECONDS);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_CHUNK_SECONDS;
  }

  return Math.min(MAX_CHUNK_SECONDS, Math.max(MIN_CHUNK_SECONDS, Math.trunc(value)));
}

function whisperProcessEnv() {
  const pathPrefix = process.env.WHISPER_PATH_PREFIX;

  return {
    ...process.env,
    PATH: pathPrefix ? `${pathPrefix}:${process.env.PATH ?? ""}` : process.env.PATH
  };
}

function ffmpegBin() {
  return process.env.WHISPER_FFMPEG_BIN || "ffmpeg";
}

function parseWhisperPayload(stdout: string) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]) as WhisperPayload;
    } catch {
      // Whisper and its dependencies may emit progress text; keep scanning for JSON.
    }
  }

  throw new WhisperTranscriptionError("Whisper returned invalid output.", 502);
}

function parseWhisperLine(line: string) {
  try {
    return JSON.parse(line) as WhisperPayload;
  } catch {
    return undefined;
  }
}

function compactProcessOutput(stdout?: string, stderr?: string) {
  return [stderr, stdout]
    .filter(Boolean)
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join(" ");
}

function isExecError(error: unknown): error is Error & {
  code?: number | string | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
} {
  return error instanceof Error;
}

function createProcessError(message: string, code: number | string | null, signal: string | null, stderr: string) {
  const error = new Error(message) as Error & {
    code?: number | string | null;
    signal?: string | null;
    stderr?: string;
  };

  error.code = code;
  error.signal = signal;
  error.stderr = stderr;

  return error;
}

function mapProcessExecError(error: unknown, fallbackMessage: string, missingExecutableMessage: string): WhisperTranscriptionError {
  if (!isExecError(error)) {
    return new WhisperTranscriptionError(fallbackMessage, 502);
  }

  const stdout = error.stdout ?? "";
  const stderr = error.stderr ?? "";
  const output = compactProcessOutput(stdout, stderr);

  if (error.code === "ENOENT") {
    return new WhisperTranscriptionError(missingExecutableMessage, 501);
  }

  if (error.signal === "SIGTERM") {
    return new WhisperTranscriptionError("Whisper transcription timed out. Try a shorter audio file.", 504);
  }

  if (error.code === 42 || stdout.includes("missing_whisper") || stderr.includes("No module named")) {
    return new WhisperTranscriptionError(
      "OpenAI Whisper is not installed. Run `python3 -m pip install git+https://github.com/openai/whisper.git`.",
      501
    );
  }

  if (output.toLowerCase().includes("ffmpeg")) {
    return new WhisperTranscriptionError("ffmpeg is required for Whisper audio decoding. Install ffmpeg locally.", 501);
  }

  return new WhisperTranscriptionError(`${fallbackMessage}${output ? `: ${output}` : "."}`, 502);
}

function mapWhisperExecError(error: unknown) {
  return mapProcessExecError(
    error,
    "Whisper transcription failed",
    "Python is not available. Install Python and set WHISPER_PYTHON_BIN if needed."
  );
}

function mapFfmpegExecError(error: unknown) {
  return mapProcessExecError(
    error,
    "Audio chunking failed",
    "ffmpeg is required for Whisper audio chunking. Install ffmpeg locally or set WHISPER_PATH_PREFIX."
  );
}

async function splitAudioIntoChunks(inputPath: string, chunkDirectory: string) {
  await mkdir(chunkDirectory, { recursive: true });

  try {
    await execFileAsync(
      ffmpegBin(),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-f",
        "segment",
        "-segment_time",
        String(whisperChunkSeconds()),
        "-reset_timestamps",
        "1",
        "-ac",
        "1",
        "-ar",
        "16000",
        join(chunkDirectory, "chunk-%05d.wav")
      ],
      {
        env: whisperProcessEnv(),
        maxBuffer: 10 * 1024 * 1024,
        timeout: whisperTotalTimeoutMs()
      }
    );
  } catch (error) {
    throw mapFfmpegExecError(error);
  }

  const chunkFileNames = (await readdir(chunkDirectory))
    .filter((fileName) => fileName.endsWith(".wav"))
    .sort();

  if (!chunkFileNames.length) {
    throw new WhisperTranscriptionError("Audio chunking produced no audio chunks.", 502);
  }

  return chunkFileNames.map((fileName) => join(chunkDirectory, fileName));
}

async function* transcribeChunks(pythonBin: string, chunkPaths: string[]): AsyncGenerator<WhisperTranscriptChunk> {
  const child = spawn(pythonBin, ["-c", WHISPER_SCRIPT, ...chunkPaths], {
    env: whisperProcessEnv(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  const timeoutMs = whisperTotalTimeoutMs();
  let didTimeout = false;
  let hasExited = false;
  let stderr = "";
  let stdoutBuffer = "";

  const timeout = setTimeout(() => {
    didTimeout = true;
    child.kill("SIGTERM");
  }, timeoutMs);

  child.stderr.on("data", (chunk: Buffer) => {
    stderr = compactProcessOutput(stderr, chunk.toString("utf8"));
  });

  const exitPromise = new Promise<void>((resolve, reject) => {
    child.once("error", (error) => reject(error));
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      hasExited = true;

      if (didTimeout) {
        reject(createProcessError("Whisper transcription timed out.", null, "SIGTERM", stderr));
        return;
      }

      if (code && code !== 0) {
        reject(createProcessError("Whisper transcription failed.", code, signal, stderr));
        return;
      }

      resolve();
    });
  });

  try {
    for await (const chunk of child.stdout) {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);

      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines.map((value) => value.trim()).filter(Boolean)) {
        const payload = parseWhisperLine(line);

        if (!payload) {
          continue;
        }

        if (payload.error === "missing_whisper") {
          throw new WhisperTranscriptionError(
            "OpenAI Whisper is not installed. Run `python3 -m pip install git+https://github.com/openai/whisper.git`.",
            501
          );
        }

        if (
          typeof payload.index === "number" &&
          typeof payload.total === "number" &&
          typeof payload.transcript === "string"
        ) {
          yield {
            index: payload.index,
            total: payload.total,
            transcript: payload.transcript.trim()
          };
        }
      }
    }

    if (stdoutBuffer.trim()) {
      const payload = parseWhisperLine(stdoutBuffer.trim());

      if (
        payload &&
        typeof payload.index === "number" &&
        typeof payload.total === "number" &&
        typeof payload.transcript === "string"
      ) {
        yield {
          index: payload.index,
          total: payload.total,
          transcript: payload.transcript.trim()
        };
      }
    }

    await exitPromise;
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof WhisperTranscriptionError) {
      throw error;
    }

    throw mapWhisperExecError(error);
  } finally {
    clearTimeout(timeout);

    if (!hasExited) {
      child.kill("SIGTERM");
      await exitPromise.catch(() => undefined);
    }
  }
}

export async function* streamWhisperTranscription(audio: File): AsyncGenerator<WhisperTranscriptChunk> {
  if (audio.size <= 0) {
    throw new WhisperTranscriptionError("Audio file is empty.");
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    throw new WhisperTranscriptionError("Audio file is too large for local Whisper transcription. Keep it under 300 MB.");
  }

  const mimeType = getAudioMimeType(audio);

  if (!SUPPORTED_AUDIO_TYPES.has(mimeType)) {
    throw new WhisperTranscriptionError("Use WAV, MP3, OGG, AAC, AC3, M4A, AIFF, FLAC, or WEBM for Whisper transcription.");
  }

  const pythonBin = process.env.WHISPER_PYTHON_BIN || "python3";
  const tempDirectory = join(tmpdir(), "major-study-helper-whisper");
  const requestDirectory = join(tempDirectory, randomUUID());
  const tempPath = join(requestDirectory, `source${safeExtension(audio.name)}`);
  const chunkDirectory = join(requestDirectory, "chunks");

  try {
    await mkdir(requestDirectory, { recursive: true });
    await writeFile(tempPath, Buffer.from(await audio.arrayBuffer()));

    const chunkPaths = await splitAudioIntoChunks(tempPath, chunkDirectory);
    let hasTranscript = false;

    for await (const chunk of transcribeChunks(pythonBin, chunkPaths)) {
      if (chunk.transcript) {
        hasTranscript = true;
      }

      yield chunk;
    }

    if (!hasTranscript) {
      throw new WhisperTranscriptionError("Whisper returned no transcript text.", 502);
    }
  } catch (error) {
    if (error instanceof WhisperTranscriptionError) {
      throw error;
    }

    throw error;
  } finally {
    await unlink(tempPath).catch(() => undefined);
    await rm(requestDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function transcribeWithWhisper(audio: File) {
  const transcriptParts = [];

  for await (const chunk of streamWhisperTranscription(audio)) {
    if (chunk.transcript) {
      transcriptParts.push(chunk.transcript);
    }
  }

  return transcriptParts.join("\n\n").trim();
}
