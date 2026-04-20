export type NativeLanguage = "ru";

export type LectureStatus =
  | "uploaded"
  | "transcribing"
  | "summarizing"
  | "generating_quiz"
  | "ready"
  | "failed";

export type QuizType = "multiple_choice" | "short_answer" | "blank";

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  nativeLanguage: NativeLanguage;
  major?: string;
  createdAt: string;
}

export interface KeyTerm {
  term: string;
  originalExplanation: string;
  russianExplanation: string;
}

export interface Lecture {
  id: string;
  userId: string;
  title: string;
  courseName: string;
  audioPath: string;
  status: LectureStatus;
  transcript?: string;
  summaryOriginal?: string;
  summaryRussian?: string;
  keyTerms: KeyTerm[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestion {
  id: string;
  lectureId: string;
  type: QuizType;
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  lectureId: string;
  answers: Record<string, string>;
  score: number;
  createdAt: string;
}
