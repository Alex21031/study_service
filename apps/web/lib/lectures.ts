"use client";

import type { KeyTerm, Lecture, QuizQuestion } from "@study-helper/shared/types";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from "firebase/firestore";
import { getFirebaseServices } from "./firebase";

interface ProcessLectureAudioParams {
  userId: string;
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

type GeneratedQuizQuestion = Omit<QuizQuestion, "id" | "lectureId" | "createdAt">;

interface ProcessedLectureResponse {
  audioPath: string;
  transcript: string;
  summaryOriginal: string;
  summaryRussian: string;
  keyTerms: KeyTerm[];
  quizzes: GeneratedQuizQuestion[];
}

interface TranscriptResponse {
  transcript: string;
}

type TranscriptEndpoint = "/api/lectures/transcribe-audio";

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

function timestampToIso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  return new Date().toISOString();
}

function toLecture(snapshot: QueryDocumentSnapshot<DocumentData>): Lecture {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    userId: data.userId,
    title: data.title,
    courseName: data.courseName,
    audioPath: data.audioPath ?? "",
    status: data.status,
    transcript: data.transcript,
    summaryOriginal: data.summaryOriginal,
    summaryRussian: data.summaryRussian,
    keyTerms: (data.keyTerms ?? []) as KeyTerm[],
    errorMessage: data.errorMessage,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt)
  };
}

function toQuiz(snapshot: QueryDocumentSnapshot<DocumentData>): QuizQuestion {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    lectureId: data.lectureId,
    type: data.type,
    question: data.question,
    options: data.options,
    answer: data.answer,
    explanation: data.explanation,
    difficulty: data.difficulty,
    createdAt: timestampToIso(data.createdAt)
  };
}

function sortLecturesNewestFirst(lectures: Lecture[]) {
  return lectures.sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
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

async function requestTranscript(endpoint: TranscriptEndpoint, title: string, courseName: string, audio: Blob) {
  const response = await fetch(endpoint, {
    method: "POST",
    body: createAudioFormData(title, courseName, audio)
  });

  const payload = (await response.json()) as Partial<TranscriptResponse> & {
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
  endpoint: TranscriptEndpoint,
  title: string,
  courseName: string,
  audio: Blob,
  onTranscriptChunk?: (chunk: TranscriptChunk) => void
) {
  const response = await fetch(`${endpoint}?stream=1`, {
    method: "POST",
    body: createAudioFormData(title, courseName, audio)
  });

  if (!response.ok) {
    const payload = (await response.json()) as {
      error?: string;
    };

    throw new Error(payload.error || "Lecture transcription failed.");
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

export async function processLectureAudio({ userId, title, courseName, audio }: ProcessLectureAudioParams) {
  const { db } = getFirebaseServices();
  const formData = createAudioFormData(title, courseName, audio);

  formData.set("userId", userId);

  const response = await fetch("/api/lectures/process-audio", {
    method: "POST",
    body: formData
  });

  const payload = (await response.json()) as Partial<ProcessedLectureResponse> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Lecture processing failed.");
  }

  const lectureRef = doc(collection(db, "lectures"));

  await setDoc(lectureRef, {
    userId,
    title,
    courseName,
    audioPath: payload.audioPath ?? "",
    status: "ready",
    transcript: payload.transcript,
    summaryOriginal: payload.summaryOriginal,
    summaryRussian: payload.summaryRussian,
    keyTerms: payload.keyTerms ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await Promise.all(
    (payload.quizzes ?? []).map((quiz) =>
      addDoc(collection(db, "lectures", lectureRef.id, "quizzes"), {
        ...quiz,
        lectureId: lectureRef.id,
        createdAt: serverTimestamp()
      })
    )
  );

  return lectureRef.id;
}

export async function transcribeLectureAudio({
  title,
  courseName,
  audio,
  onTranscriptChunk
}: TranscribeLectureAudioParams) {
  const transcript = await requestTranscriptStream(
    "/api/lectures/transcribe-audio",
    title,
    courseName,
    audio,
    onTranscriptChunk
  );

  if (transcript) {
    return transcript;
  }

  const whisperResult = await requestTranscript("/api/lectures/transcribe-audio", title, courseName, audio);

  if (!whisperResult.response.ok) {
    throw new Error(whisperResult.payload.error || "Lecture transcription failed.");
  }

  return whisperResult.payload.transcript ?? "";
}

export function listenToLectures(
  userId: string,
  onChange: (lectures: Lecture[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const { db } = getFirebaseServices();
  const lecturesQuery = query(collection(db, "lectures"), where("userId", "==", userId));

  return onSnapshot(
    lecturesQuery,
    (snapshot) => onChange(sortLecturesNewestFirst(snapshot.docs.map(toLecture))),
    (error) => onError(error)
  );
}

export function listenToQuizzes(
  lectureId: string,
  onChange: (quizzes: QuizQuestion[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const { db } = getFirebaseServices();
  const quizzesQuery = query(
    collection(db, "lectures", lectureId, "quizzes"),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(
    quizzesQuery,
    (snapshot) => onChange(snapshot.docs.map(toQuiz)),
    (error) => onError(error)
  );
}

export async function createUserProfile(userId: string, displayName: string, email: string) {
  const { db } = getFirebaseServices();

  await setDoc(
    doc(db, "users", userId),
    {
      displayName,
      email,
      nativeLanguage: "ru",
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}
