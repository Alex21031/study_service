"use client";

import { StudyWorkspace } from "@/components/StudyWorkspace";
import { getFirebaseServices, hasFirebaseConfig } from "@/lib/firebase";
import { createUserProfile } from "@/lib/lectures";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User
} from "firebase/auth";
import { FormEvent, useEffect, useState } from "react";

type AuthMode = "signin" | "signup";

function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Authentication failed.";

  if (message.includes("auth/configuration-not-found")) {
    return "Firebase Authentication 설정을 찾을 수 없습니다. Firebase Console에서 Authentication을 시작하고 Email/Password 제공자를 활성화해 주세요.";
  }

  if (message.includes("auth/email-already-in-use")) {
    return "이미 가입된 이메일입니다. 로그인 탭에서 다시 시도해 주세요.";
  }

  if (message.includes("auth/invalid-credential")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (message.includes("auth/weak-password")) {
    return "비밀번호는 6자 이상이어야 합니다.";
  }

  return message;
}

export function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasFirebaseConfig()) {
      setError("Firebase 환경 변수가 없습니다. .env.example을 .env.local로 복사한 뒤 값을 채워 주세요.");
      setLoading(false);
      return undefined;
    }

    const { auth } = getFirebaseServices();

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const { auth } = getFirebaseServices();

      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const name = displayName.trim() || email.split("@")[0];
        await updateProfile(credential.user, { displayName: name });
        await createUserProfile(credential.user.uid, name, credential.user.email ?? email);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="shell">
        <div className="workspace">
          <div className="empty-state">Loading workspace...</div>
        </div>
      </main>
    );
  }

  if (user) {
    return <StudyWorkspace user={user} onSignOut={() => signOut(getFirebaseServices().auth)} />;
  }

  return (
    <main className="shell">
      <div className="workspace auth-layout">
        <section className="auth-visual" aria-label="Study workspace preview">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Major Study Helper</h1>
              <p>강의 녹음, 러시아어 요약, 퀴즈 복습을 한 곳에서.</p>
            </div>
          </div>

          <div className="audio-board">
            <h2>Lecture to Russian study notes</h2>
            <div className="waveform" aria-hidden="true">
              {[44, 68, 38, 94, 62, 82, 46, 104, 74, 48, 90, 56, 72, 100, 42, 66].map((height) => (
                <span key={height} style={{ height }} />
              ))}
            </div>
            <div className="language-row">
              <span>한국어 강의</span>
              <span>Русское резюме</span>
              <span>Quiz review</span>
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="panel-header">
            <h2>{mode === "signin" ? "로그인" : "회원가입"}</h2>
          </div>

          <div className="auth-toggle" aria-label="Authentication mode">
            <button type="button" data-active={mode === "signin"} onClick={() => setMode("signin")}>
              로그인
            </button>
            <button type="button" data-active={mode === "signup"} onClick={() => setMode("signup")}>
              회원가입
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "signup" ? (
              <label>
                이름
                <input
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Alex Kim"
                />
              </label>
            ) : null}

            <label>
              이메일
              <input
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="student@example.com"
              />
            </label>

            <label>
              비밀번호
              <input
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="6자 이상"
              />
            </label>

            {error ? <p className="error">{error}</p> : null}

            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "처리 중" : mode === "signin" ? "로그인" : "계정 만들기"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
