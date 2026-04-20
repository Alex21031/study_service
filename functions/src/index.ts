import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { generateStudyPack, transcribeLecture } from "./services/ai.service.js";

initializeApp();
setGlobalOptions({ region: "asia-northeast3", maxInstances: 10 });

const db = getFirestore();

function assertSignedIn(auth: { uid: string } | undefined) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  return auth.uid;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  return value.trim();
}

function parseAudioPath(path: string) {
  const [root, userId, lectureId] = path.split("/");

  if (root !== "audio" || !userId || !lectureId) {
    return null;
  }

  return { userId, lectureId };
}

export const createLecture = onCall(async (request) => {
  const userId = assertSignedIn(request.auth);
  const title = requireString(request.data?.title, "title");
  const courseName = requireString(request.data?.courseName, "courseName");

  const lectureRef = db.collection("lectures").doc();

  await lectureRef.set({
    userId,
    title,
    courseName,
    audioPath: "",
    status: "uploaded",
    keyTerms: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return {
    lectureId: lectureRef.id
  };
});

export const onLectureAudioFinalized = onObjectFinalized(async (event) => {
  const objectName = event.data.name;

  if (!objectName) {
    logger.warn("Storage object finalized without a name.");
    return;
  }

  const audioPath = parseAudioPath(objectName);

  if (!audioPath) {
    logger.info("Ignoring non-lecture storage object.", { objectName });
    return;
  }

  const lectureRef = db.collection("lectures").doc(audioPath.lectureId);
  const lectureSnapshot = await lectureRef.get();

  if (!lectureSnapshot.exists) {
    logger.warn("Uploaded audio has no matching lecture document.", audioPath);
    return;
  }

  const lecture = lectureSnapshot.data();

  if (lecture?.userId !== audioPath.userId) {
    logger.error("Lecture owner does not match uploaded audio path.", audioPath);
    await lectureRef.update({
      status: "failed",
      errorMessage: "Uploaded audio path does not match lecture owner.",
      updatedAt: FieldValue.serverTimestamp()
    });
    return;
  }

  try {
    await lectureRef.update({
      status: "transcribing",
      updatedAt: FieldValue.serverTimestamp()
    });

    const transcript = await transcribeLecture({
      storagePath: objectName,
      contentType: event.data.contentType
    });

    await lectureRef.update({
      transcript,
      status: "summarizing",
      updatedAt: FieldValue.serverTimestamp()
    });

    const studyPack = await generateStudyPack(transcript);

    await lectureRef.update({
      summaryOriginal: studyPack.summaryOriginal,
      summaryRussian: studyPack.summaryRussian,
      keyTerms: studyPack.keyTerms,
      status: "generating_quiz",
      updatedAt: FieldValue.serverTimestamp()
    });

    const batch = db.batch();

    studyPack.quizzes.forEach((quiz) => {
      const quizRef = lectureRef.collection("quizzes").doc();
      batch.set(quizRef, {
        ...quiz,
        lectureId: audioPath.lectureId,
        createdAt: FieldValue.serverTimestamp()
      });
    });

    batch.update(lectureRef, {
      status: "ready",
      updatedAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
  } catch (error) {
    logger.error("Failed to process lecture audio.", error);
    await lectureRef.update({
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown processing error.",
      updatedAt: FieldValue.serverTimestamp()
    });
  }
});

export const submitQuizAttempt = onCall(async (request) => {
  const userId = assertSignedIn(request.auth);
  const lectureId = requireString(request.data?.lectureId, "lectureId");
  const answers = request.data?.answers;

  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new HttpsError("invalid-argument", "answers must be an object.");
  }

  const lectureRef = db.collection("lectures").doc(lectureId);
  const lectureSnapshot = await lectureRef.get();

  if (!lectureSnapshot.exists || lectureSnapshot.data()?.userId !== userId) {
    throw new HttpsError("permission-denied", "You do not have access to this lecture.");
  }

  const quizzesSnapshot = await lectureRef.collection("quizzes").get();
  let correct = 0;

  quizzesSnapshot.forEach((quizSnapshot) => {
    const quiz = quizSnapshot.data();
    const submittedAnswer = String((answers as Record<string, unknown>)[quizSnapshot.id] ?? "")
      .trim()
      .toLocaleLowerCase();
    const correctAnswer = String(quiz.answer ?? "")
      .trim()
      .toLocaleLowerCase();

    if (submittedAnswer && submittedAnswer === correctAnswer) {
      correct += 1;
    }
  });

  const total = quizzesSnapshot.size;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const attemptRef = await db.collection("quizAttempts").add({
    userId,
    lectureId,
    answers,
    score,
    createdAt: FieldValue.serverTimestamp()
  });

  return {
    attemptId: attemptRef.id,
    correct,
    total,
    score
  };
});
