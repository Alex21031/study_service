"use client";

import { authenticatedFetch, getApiBaseUrl } from "@/lib/backend";
import type { KeyTerm, Lecture, QuizQuestion } from "@study-helper/shared/types";

interface ProcessLectureAudioParams {
  title: string;
  courseName: string;
  audio: Blob;
}

interface TranscribeLectureAudioParams {
  title: string;
  courseName: string;
  audio: Blob;
  onTranscriptChunk?: (chunk: TranscriptChunk) => void;
}

interface TranscriptResponse {
  transcript: string;
}

interface BackendLecture {
  id: string;
  userId: number | string;
  title: string;
  courseName: string;
  audioPath: string;
  status: Lecture["status"];
  transcript?: string | null;
  summaryOriginal?: string | null;
  summaryRussian?: string | null;
  keyTerms?: KeyTerm[];
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackendQuiz {
  id: string;
  lectureId: string;
  type: QuizQuestion["type"];
  question: string;
  options?: string[] | null;
  answer: string;
  explanation: string;
  difficulty: QuizQuestion["difficulty"];
  createdAt: string;
}

interface LectureDetailResponse {
  lecture: BackendLecture;
  quizzes: BackendQuiz[];
}

interface ProcessLectureResponse {
  lecture: BackendLecture;
  quizzes: BackendQuiz[];
}

interface TranscriptChunk {
  index: number;
  total: number;
  transcript: string;
}

type TranscriptStreamEvent =
  | ({
      type: "chunk";
    } & TranscriptChunk)
  | {
      type: "done";
      transcript: string;
    }
  | {
      type: "error";
      error: string;
    };

function normalizeLecture(lecture: BackendLecture): Lecture {
  return {
    id: lecture.id,
    userId: String(lecture.userId),
    title: lecture.title,
    courseName: lecture.courseName,
    audioPath: lecture.audioPath,
    status: lecture.status,
    transcript: lecture.transcript || undefined,
    summaryOriginal: lecture.summaryOriginal || undefined,
    summaryRussian: lecture.summaryRussian || undefined,
    keyTerms: lecture.keyTerms ?? [],
    errorMessage: lecture.errorMessage || undefined,
    createdAt: lecture.createdAt,
    updatedAt: lecture.updatedAt
  };
}

function normalizeQuiz(quiz: BackendQuiz): QuizQuestion {
  return {
    id: quiz.id,
    lectureId: quiz.lectureId,
    type: quiz.type,
    question: quiz.question,
    options: quiz.options ?? [],
    answer: quiz.answer,
    explanation: quiz.explanation,
    difficulty: quiz.difficulty,
    createdAt: quiz.createdAt
  };
}

function audioExtension(type: string) {
  switch (type.split(";")[0]) {
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/mp3":
    case "audio/mpeg":
      return "mp3";
    case "audio/aac":
      return "aac";
    case "audio/ac3":
      return "ac3";
    case "audio/ogg":
      return "ogg";
    case "audio/flac":
      return "flac";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/aiff":
      return "aiff";
    default:
      return "webm";
  }
}

function createAudioFormData(title: string, courseName: string, audio: Blob) {
  const formData = new FormData();
  const audioType = audio.type || "audio/webm";
  const audioFile =
    audio instanceof File
      ? audio
      : new File([audio], `lecture-${Date.now()}.${audioExtension(audioType)}`, {
          type: audioType
        });

  formData.set("audio", audioFile);
  formData.set("title", title);
  formData.set("courseName", courseName);

  return formData;
}

async function parseApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as {
      detail?: string;
      error?: string;
    };

    return payload.detail || payload.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function requestTranscript(title: string, courseName: string, audio: Blob) {
  const response = await fetch(`${getApiBaseUrl()}/lectures/transcribe-audio`, {
    method: "POST",
    body: createAudioFormData(title, courseName, audio)
  });

  const payload = (await response.json()) as Partial<TranscriptResponse> & {
    detail?: string;
    error?: string;
  };

  return {
    response,
    payload
  };
}

function parseTranscriptStreamLine(line: string) {
  try {
    return JSON.parse(line) as TranscriptStreamEvent;
  } catch {
    return undefined;
  }
}

async function requestTranscriptStream(
  title: string,
  courseName: string,
  audio: Blob,
  onTranscriptChunk?: (chunk: TranscriptChunk) => void
) {
  const response = await fetch(`${getApiBaseUrl()}/lectures/transcribe-audio?stream=1`, {
    method: "POST",
    body: createAudioFormData(title, courseName, audio)
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Lecture transcription failed."));
  }

  if (!response.body) {
    throw new Error("Lecture transcription stream is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalTranscript = "";

  async function handleLine(line: string) {
    const payload = parseTranscriptStreamLine(line);

    if (!payload) {
      return;
    }

    if (payload.type === "error") {
      throw new Error(payload.error || "Lecture transcription failed.");
    }

    if (payload.type === "chunk") {
      onTranscriptChunk?.({
        index: payload.index,
        total: payload.total,
        transcript: payload.transcript
      });
      return;
    }

    finalTranscript = payload.transcript;
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines.map((value) => value.trim()).filter(Boolean)) {
      await handleLine(line);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    await handleLine(buffer.trim());
  }

  return finalTranscript;
}

export async function processLectureAudio({ title, courseName, audio }: ProcessLectureAudioParams) {
  const response = await authenticatedFetch("/lectures/process-audio", {
    method: "POST",
    body: createAudioFormData(title, courseName, audio)
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Lecture processing failed."));
  }

  const payload = (await response.json()) as ProcessLectureResponse;

  return payload.lecture.id;
}

export async function transcribeLectureAudio({
  title,
  courseName,
  audio,
  onTranscriptChunk
}: TranscribeLectureAudioParams) {
  const transcript = await requestTranscriptStream(title, courseName, audio, onTranscriptChunk);

  if (transcript) {
    return transcript;
  }

  const whisperResult = await requestTranscript(title, courseName, audio);

  if (!whisperResult.response.ok) {
    throw new Error(whisperResult.payload.detail || whisperResult.payload.error || "Lecture transcription failed.");
  }

  return whisperResult.payload.transcript ?? "";
}

export async function fetchLectures() {
  const response = await authenticatedFetch("/lectures");

  if (!response.ok) {
    throw new Error(await parseApiError(response, "강의 목록을 불러오지 못했습니다."));
  }

  const payload = (await response.json()) as BackendLecture[];

  return payload.map(normalizeLecture);
}

export async function fetchLectureDetail(lectureId: string) {
  const response = await authenticatedFetch(`/lectures/${lectureId}`);

  if (!response.ok) {
    throw new Error(await parseApiError(response, "강의 상세 정보를 불러오지 못했습니다."));
  }

  const payload = (await response.json()) as LectureDetailResponse;

  return {
    lecture: normalizeLecture(payload.lecture),
    quizzes: payload.quizzes.map(normalizeQuiz)
  };
}
