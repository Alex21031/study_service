# Lessons

- No project-specific corrections recorded yet.
- In this workspace, Next.js runs from `apps/web`, so Firebase `NEXT_PUBLIC_*` variables must be placed in `apps/web/.env.local`; a root `.env.local` is not loaded by the web dev server.
- When Firebase returns `auth/configuration-not-found`, first verify the app is reading env values, then check Firebase Console Authentication setup and the Email/Password provider before changing application code.
- For early Firestore MVP queries, avoid `where(...) + orderBy(...)` combinations unless the composite index has already been deployed; prefer simple owner-scoped queries and client-side sorting to keep local testing unblocked.
- In React submit handlers, capture `event.currentTarget` before any `await` if the form element is needed later; reading it after async work can produce null and break cleanup.
- When changing Firestore rules for new subcollections such as `lectures/{lectureId}/quizzes`, deploy the rules before testing the web UI or client writes will fail with `Missing or insufficient permissions`.
- When surfacing FastAPI errors in the frontend, do not assume `detail` is a string; validation failures often return arrays or objects, so normalize them into readable messages before rendering.
