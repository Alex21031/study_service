"use client";

import { LectureUploader } from "@/components/LectureUploader";
import { listenToLectures, listenToQuizzes } from "@/lib/lectures";
import type { Lecture, QuizQuestion } from "@study-helper/shared/types";
import type { User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";

interface StudyWorkspaceProps {
  user: User;
  onSignOut: () => Promise<void>;
}

const statusLabel: Record<Lecture["status"], string> = {
  uploaded: "업로드 완료",
  transcribing: "텍스트 변환 중",
  summarizing: "요약 생성 중",
  generating_quiz: "퀴즈 생성 중",
  ready: "학습 준비 완료",
  failed: "처리 실패"
};

export function StudyWorkspace({ user, onSignOut }: StudyWorkspaceProps) {
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [quizzes, setQuizzes] = useState<QuizQuestion[]>([]);
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    return listenToLectures(
      user.uid,
      (nextLectures) => {
        setError("");
        setLectures(nextLectures);
        setSelectedLectureId((current) => current ?? nextLectures[0]?.id ?? null);
      },
      (listenError) => setError(listenError.message)
    );
  }, [user.uid]);

  useEffect(() => {
    if (!selectedLectureId) {
      setQuizzes([]);
      return undefined;
    }

    return listenToQuizzes(
      selectedLectureId,
      (nextQuizzes) => {
        setError("");
        setQuizzes(nextQuizzes);
      },
      (listenError) => setError(listenError.message)
    );
  }, [selectedLectureId]);

  const selectedLecture = useMemo(
    () => lectures.find((lecture) => lecture.id === selectedLectureId) ?? null,
    [lectures, selectedLectureId]
  );

  return (
    <main className="shell">
      <div className="workspace">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Major Study Helper</h1>
              <p>{user.displayName || user.email}님의 학습 공간</p>
            </div>
          </div>
          <button className="ghost-button" type="button" onClick={onSignOut}>
            로그아웃
          </button>
        </header>

        {error ? <p className="error">{error}</p> : null}

        <div className="grid">
          <aside className="study-area">
            <LectureUploader userId={user.uid} />

            <section className="panel">
              <div className="panel-header">
                <h2>강의 목록</h2>
                <span className="status">{lectures.length}개</span>
              </div>

              <div className="lecture-list">
                {lectures.map((lecture) => (
                  <button
                    className="lecture-card"
                    data-selected={lecture.id === selectedLectureId}
                    key={lecture.id}
                    type="button"
                    onClick={() => setSelectedLectureId(lecture.id)}
                  >
                    <span className="status" data-state={lecture.status}>
                      {statusLabel[lecture.status]}
                    </span>
                    <h3>{lecture.title}</h3>
                    <div className="lecture-meta">
                      <span>{lecture.courseName}</span>
                      <span>{new Date(lecture.createdAt).toLocaleDateString("ko-KR")}</span>
                    </div>
                  </button>
                ))}

                {lectures.length === 0 ? <div className="empty-state">아직 녹음한 강의가 없습니다.</div> : null}
              </div>
            </section>
          </aside>

          <section className="study-area">
            {selectedLecture ? (
              <>
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>{selectedLecture.title}</h2>
                      <div className="lecture-meta">
                        <span>{selectedLecture.courseName}</span>
                        <span className="status" data-state={selectedLecture.status}>
                          {statusLabel[selectedLecture.status]}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="summary-grid">
                    <article>
                      <h3>원문 요약</h3>
                      <div className="text-box">
                        {selectedLecture.summaryOriginal || "강의 처리가 완료되면 요약이 표시됩니다."}
                      </div>
                    </article>

                    <article>
                      <h3>Русское резюме</h3>
                      <div className="text-box">
                        {selectedLecture.summaryRussian || "После обработки здесь появится резюме."}
                      </div>
                    </article>
                  </div>

                  <article>
                    <h3>전사 텍스트</h3>
                    <div className="text-box">
                      {selectedLecture.transcript || "AI 전사가 완료되면 텍스트가 표시됩니다."}
                    </div>
                  </article>
                </section>

                <section className="panel">
                  <div className="panel-header">
                    <h2>전공 용어</h2>
                  </div>

                  <div className="term-list">
                    {selectedLecture.keyTerms.length > 0 ? (
                      selectedLecture.keyTerms.map((term) => (
                        <article className="term" key={term.term}>
                          <strong>{term.term}</strong>
                          <span>{term.russianExplanation || term.originalExplanation}</span>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">핵심 용어가 생성되면 여기에 표시됩니다.</div>
                    )}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header">
                    <h2>퀴즈</h2>
                    <span className="status">{quizzes.length}문항</span>
                  </div>

                  <div className="quiz-list">
                    {quizzes.map((quiz, index) => (
                      <article className="quiz-card" key={quiz.id}>
                        <h3>
                          {index + 1}. {quiz.question}
                        </h3>
                        {quiz.options && quiz.options.length > 0 ? (
                          <div className="options">
                            {quiz.options.map((option) => (
                              <div className="option" key={option}>
                                {option}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <strong>정답: {quiz.answer}</strong>
                        <span>{quiz.explanation}</span>
                      </article>
                    ))}

                    {quizzes.length === 0 ? <div className="empty-state">퀴즈가 생성되면 여기에 표시됩니다.</div> : null}
                  </div>
                </section>
              </>
            ) : (
              <div className="empty-state">강의를 녹음하면 학습 화면이 열립니다.</div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
