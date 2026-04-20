export interface TranscribeLectureInput {
  storagePath: string;
  contentType?: string;
}

export interface GeneratedKeyTerm {
  term: string;
  originalExplanation: string;
  russianExplanation: string;
}

export interface GeneratedQuizQuestion {
  type: "multiple_choice" | "short_answer" | "blank";
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface StudyPack {
  summaryOriginal: string;
  summaryRussian: string;
  keyTerms: GeneratedKeyTerm[];
  quizzes: GeneratedQuizQuestion[];
}

export async function transcribeLecture(input: TranscribeLectureInput): Promise<string> {
  const fileName = input.storagePath.split("/").at(-1) ?? "lecture audio";

  return [
    `Transcript placeholder for ${fileName}.`,
    "Connect a speech-to-text provider here to convert the uploaded lecture audio into text.",
    "The rest of the pipeline already expects a full transcript and can be replaced without changing the UI."
  ].join(" ");
}

export async function generateStudyPack(transcript: string): Promise<StudyPack> {
  const shortenedTranscript = transcript.slice(0, 280);

  return {
    summaryOriginal: [
      "이 요약은 AI 제공자 연결 전까지 표시되는 임시 결과입니다.",
      `강의 원문 일부: ${shortenedTranscript}`
    ].join("\n\n"),
    summaryRussian: [
      "Это временное резюме до подключения AI-провайдера.",
      "После подключения сервис будет создавать краткое резюме лекции на русском языке."
    ].join("\n\n"),
    keyTerms: [
      {
        term: "Transcript",
        originalExplanation: "Audio lecture content converted into searchable text.",
        russianExplanation: "Текстовая версия аудиолекции, которую можно искать и анализировать."
      },
      {
        term: "Summary",
        originalExplanation: "A compressed version of the lecture focused on core concepts.",
        russianExplanation: "Краткая версия лекции с акцентом на ключевые понятия."
      }
    ],
    quizzes: [
      {
        type: "multiple_choice",
        question: "이 앱의 첫 번째 처리 단계는 무엇인가요?",
        options: ["오디오 업로드", "시험 제출", "출석 확인", "성적 정정"],
        answer: "오디오 업로드",
        explanation: "학생이 강의 오디오를 올리면 텍스트 변환과 요약 생성이 이어집니다.",
        difficulty: "easy"
      },
      {
        type: "short_answer",
        question: "러시아어 요약은 어떤 학생을 돕기 위한 기능인가요?",
        answer: "러시아어권 유학생",
        explanation: "전공 강의를 모국어에 가까운 언어로 복습할 수 있게 돕는 기능입니다.",
        difficulty: "easy"
      }
    ]
  };
}
