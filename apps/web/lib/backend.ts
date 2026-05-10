"use client";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

interface UserResponse {
  id: number;
  email: string;
  is_active: boolean;
}

export interface StudyPlanItem {
  date: string;
  task: string;
}

interface StudyPlanResponse {
  course: string;
  exam_date: string;
  scope: string;
  plan: StudyPlanItem[];
}

interface EmailTranslateResponse {
  translations: Record<string, string>;
}

export interface ProblemSessionState {
  session_id: string;
  prompt: string;
  step_index: number;
  total_steps: number;
  is_finished: boolean;
  ok?: boolean | null;
  feedback?: string | null;
  hint?: string | null;
  step_title?: string | null;
  attempts: number;
}

interface ProblemSessionCreateResponse {
  session_id: string;
  prompt: string;
  step_index: number;
  total_steps: number;
  step_title?: string | null;
}

const TOKEN_STORAGE_KEY = "study-helper-access-token";

function hasWindow() {
  return typeof window !== "undefined";
}

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  return (configured || "http://127.0.0.1:8000").replace(/\/$/, "");
}

function deriveDisplayName(email: string) {
  return email.split("@")[0] || email;
}

function toAuthUser(payload: UserResponse): AuthUser {
  return {
    id: String(payload.id),
    email: payload.email,
    displayName: deriveDisplayName(payload.email)
  };
}

export function getStoredToken() {
  if (!hasWindow()) {
    return "";
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function setStoredToken(token: string) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken() {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  const token = getStoredToken();

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: authHeaders(token, init.headers)
  });
}

async function parseApiError(response: Response, fallbackMessage: string) {
  function detailToMessage(detail: unknown): string {
    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => detailToMessage(item))
        .filter(Boolean);

      return messages.join(" ");
    }

    if (detail && typeof detail === "object") {
      const detailRecord = detail as {
        msg?: unknown;
        detail?: unknown;
        loc?: unknown;
      };

      if (typeof detailRecord.msg === "string") {
        return detailRecord.msg;
      }

      if (detailRecord.detail) {
        return detailToMessage(detailRecord.detail);
      }

      if (Array.isArray(detailRecord.loc) && detailRecord.loc.length > 0) {
        return detailRecord.loc.map((value) => String(value)).join(" ");
      }
    }

    return "";
  }

  try {
    const payload = (await response.json()) as {
      detail?: unknown;
      error?: string;
    };

    return detailToMessage(payload.detail) || payload.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function authHeaders(token: string, headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);

  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }

  return nextHeaders;
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const token = getStoredToken();

  if (!token) {
    throw new Error("로그인이 필요합니다.");
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: authHeaders(token, init.headers)
  });

  if (response.status === 401) {
    clearStoredToken();
  }

  return response;
}

export async function registerWithBackend(email: string, password: string) {
  const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password
    })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "회원가입에 실패했습니다."));
  }
}

export async function signInWithBackend(email: string, password: string) {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);

  const response = await fetch(`${getApiBaseUrl()}/auth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "로그인에 실패했습니다."));
  }

  const payload = (await response.json()) as TokenResponse;
  setStoredToken(payload.access_token);

  const user = await fetchCurrentUser();

  if (!user) {
    throw new Error("로그인 후 사용자 정보를 불러오지 못했습니다.");
  }

  return user;
}

export async function signUpWithBackend(email: string, password: string) {
  await registerWithBackend(email, password);

  return signInWithBackend(email, password);
}

export async function fetchCurrentUser() {
  const token = getStoredToken();

  if (!token) {
    return null;
  }

  const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
    headers: authHeaders(token)
  });

  if (response.status === 401) {
    clearStoredToken();
    return null;
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response, "사용자 정보를 불러오지 못했습니다."));
  }

  const payload = (await response.json()) as UserResponse;

  return toAuthUser(payload);
}

export function signOutFromBackend() {
  clearStoredToken();
}

export async function createStudyPlan(input: {
  course: string;
  examDate: string;
  scope: string;
  startDate?: string;
  language: string;
}) {
  const response = await backendFetch("/study-plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      course: input.course,
      exam_date: input.examDate,
      scope: input.scope,
      start_date: input.startDate || undefined,
      language: input.language
    })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "학습 계획 생성에 실패했습니다."));
  }

  return (await response.json()) as StudyPlanResponse;
}

export async function translateEmailWithBackend(input: {
  text: string;
  languages: string[];
}) {
  const response = await backendFetch("/email-translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "이메일 번역에 실패했습니다."));
  }

  return (await response.json()) as EmailTranslateResponse;
}

export async function createProblemSession(input: {
  problem: string;
  problemType: string;
  language: string;
}) {
  const response = await backendFetch("/solve-problem/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      problem: input.problem,
      problem_type: input.problemType,
      language: input.language
    })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "문제 풀이 세션 생성에 실패했습니다."));
  }

  return (await response.json()) as ProblemSessionCreateResponse;
}

export async function submitProblemAnswer(input: {
  sessionId: string;
  answer: string;
}) {
  const response = await backendFetch(`/solve-problem/sessions/${input.sessionId}/answer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      answer: input.answer
    })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "답안 제출에 실패했습니다."));
  }

  return (await response.json()) as ProblemSessionState;
}
