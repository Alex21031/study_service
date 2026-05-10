"use client";

import {
  createProblemSession,
  createStudyPlan,
  submitProblemAnswer,
  translateEmailWithBackend,
  type ProblemSessionState,
  type StudyPlanItem
} from "@/lib/backend";
import { FormEvent, useState } from "react";

const languageOptions = [
  { value: "zh", label: "中文" },
  { value: "ko", label: "한국어" },
  { value: "ru", label: "Русский" }
];

export function StudyServiceTools() {
  const [course, setCourse] = useState("");
  const [examDate, setExamDate] = useState("");
  const [scope, setScope] = useState("");
  const [startDate, setStartDate] = useState("");
  const [planLanguage, setPlanLanguage] = useState("ko");
  const [planItems, setPlanItems] = useState<StudyPlanItem[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");

  const [emailText, setEmailText] = useState("");
  const [translationLanguages, setTranslationLanguages] = useState<string[]>(["ko", "ru"]);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");

  const [problem, setProblem] = useState("");
  const [problemType, setProblemType] = useState("auto");
  const [solveLanguage, setSolveLanguage] = useState("ko");
  const [session, setSession] = useState<ProblemSessionState | null>(null);
  const [problemAnswer, setProblemAnswer] = useState("");
  const [solveLoading, setSolveLoading] = useState(false);
  const [solveError, setSolveError] = useState("");

  function toggleTranslationLanguage(language: string) {
    setTranslationLanguages((current) => {
      if (current.includes(language)) {
        return current.filter((value) => value !== language);
      }

      return [...current, language];
    });
  }

  async function handlePlanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanError("");
    setPlanLoading(true);

    try {
      const response = await createStudyPlan({
        course: course.trim(),
        examDate,
        scope: scope.trim(),
        startDate: startDate || undefined,
        language: planLanguage
      });

      setPlanItems(response.plan);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "학습 계획 생성에 실패했습니다.");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleTranslationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTranslationError("");
    setTranslationLoading(true);

    try {
      const response = await translateEmailWithBackend({
        text: emailText.trim(),
        languages: translationLanguages.length > 0 ? translationLanguages : ["ko"]
      });

      setTranslations(response.translations);
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : "이메일 번역에 실패했습니다.");
    } finally {
      setTranslationLoading(false);
    }
  }

  async function handleProblemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSolveError("");
    setSolveLoading(true);

    try {
      const response = await createProblemSession({
        problem: problem.trim(),
        problemType,
        language: solveLanguage
      });

      setProblemAnswer("");
      setSession({
        ...response,
        is_finished: false,
        attempts: 0
      });
    } catch (error) {
      setSolveError(error instanceof Error ? error.message : "문제 풀이 세션 생성에 실패했습니다.");
    } finally {
      setSolveLoading(false);
    }
  }

  async function handleAnswerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setSolveError("");
    setSolveLoading(true);

    try {
      const response = await submitProblemAnswer({
        sessionId: session.session_id,
        answer: problemAnswer.trim()
      });

      setSession(response);
      setProblemAnswer("");
    } catch (error) {
      setSolveError(error instanceof Error ? error.message : "답안 제출에 실패했습니다.");
    } finally {
      setSolveLoading(false);
    }
  }

  return (
    <section className="tool-grid">
      <section className="panel">
        <div className="panel-header">
          <h2>학습 계획</h2>
        </div>

        <form className="auth-form" onSubmit={handlePlanSubmit}>
          <div className="inline-fields">
            <label>
              과목
              <input required value={course} onChange={(event) => setCourse(event.target.value)} />
            </label>

            <label>
              시험일
              <input required type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} />
            </label>
          </div>

          <label>
            범위
            <input
              required
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              placeholder="예: chapter 1 ~ 5"
            />
          </label>

          <div className="inline-fields">
            <label>
              시작일
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>

            <label>
              출력 언어
              <select value={planLanguage} onChange={(event) => setPlanLanguage(event.target.value)}>
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {planError ? <p className="error">{planError}</p> : null}

          <button className="primary-button" type="submit" disabled={planLoading}>
            {planLoading ? "생성 중" : "학습 계획 생성"}
          </button>
        </form>

        <div className="response-box">
          {planItems.length > 0 ? (
            planItems.map((item) => (
              <div className="response-item" key={`${item.date}-${item.task}`}>
                <strong>{item.date}</strong>
                <span>{item.task}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">생성된 학습 계획이 여기에 표시됩니다.</div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>이메일 번역</h2>
        </div>

        <form className="auth-form" onSubmit={handleTranslationSubmit}>
          <label>
            원문
            <textarea
              value={emailText}
              onChange={(event) => setEmailText(event.target.value)}
              placeholder="교수님께 보낼 메일이나 받은 메일 내용을 붙여 넣으세요."
            />
          </label>

          <div className="check-grid">
            {languageOptions.map((option) => (
              <label key={option.value} className="check-option">
                <input
                  checked={translationLanguages.includes(option.value)}
                  type="checkbox"
                  onChange={() => toggleTranslationLanguage(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          {translationError ? <p className="error">{translationError}</p> : null}

          <button className="primary-button" type="submit" disabled={translationLoading}>
            {translationLoading ? "번역 중" : "번역 생성"}
          </button>
        </form>

        <div className="response-box">
          {Object.entries(translations).length > 0 ? (
            Object.entries(translations).map(([language, text]) => (
              <div className="response-item" key={language}>
                <strong>{language.toUpperCase()}</strong>
                <span>{text}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">번역 결과가 여기에 표시됩니다.</div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>단계별 문제 풀이</h2>
        </div>

        <form className="auth-form" onSubmit={handleProblemSubmit}>
          <label>
            문제
            <textarea
              required
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="예: 미분 가능한 함수의 최대값을 구하는 방법을 설명해 주세요."
            />
          </label>

          <div className="inline-fields">
            <label>
              유형
              <select value={problemType} onChange={(event) => setProblemType(event.target.value)}>
                <option value="auto">자동</option>
                <option value="math">수학</option>
                <option value="coding">코딩</option>
                <option value="theory">이론</option>
              </select>
            </label>

            <label>
              출력 언어
              <select value={solveLanguage} onChange={(event) => setSolveLanguage(event.target.value)}>
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button className="primary-button" type="submit" disabled={solveLoading}>
            {solveLoading ? "생성 중" : "풀이 세션 시작"}
          </button>
        </form>

        {solveError ? <p className="error">{solveError}</p> : null}

        <div className="response-box">
          {session ? (
            <>
              <div className="response-item">
                <strong>
                  Step {session.step_index + 1} / {session.total_steps}
                </strong>
                <span>{session.step_title || "현재 단계"}</span>
              </div>

              <div className="text-box compact-box">{session.prompt}</div>

              <form className="auth-form" onSubmit={handleAnswerSubmit}>
                <label>
                  내 답변
                  <textarea
                    required
                    value={problemAnswer}
                    onChange={(event) => setProblemAnswer(event.target.value)}
                    placeholder="현재 단계에 대한 답을 적어 보세요."
                  />
                </label>

                <button
                  className="secondary-button"
                  type="submit"
                  disabled={solveLoading || session.is_finished}
                >
                  {session.is_finished ? "세션 완료" : solveLoading ? "제출 중" : "답안 제출"}
                </button>
              </form>
            </>
          ) : (
            <div className="empty-state">문제 풀이 세션을 시작하면 단계별 질문이 여기에 표시됩니다.</div>
          )}
        </div>
      </section>
    </section>
  );
}
