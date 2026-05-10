# Study Helper App Todo

## Plan

- [x] Create project metadata and workspace structure.
- [x] Build the Next.js TypeScript web app shell.
- [x] Add Firebase client helpers for Auth, Firestore, and Storage.
- [x] Implement lecture upload and study dashboard UI.
- [x] Add shared TypeScript models for users, lectures, quizzes, and attempts.
- [x] Build Firebase Functions entry points for lecture creation, processing, and quiz attempts.
- [x] Add Firestore and Storage security rules.
- [x] Document environment variables and local setup steps.
- [x] Verify changes with diff and the best available build/test command.

## Review

- Created a TypeScript monorepo with `apps/web`, `functions`, and `shared`.
- Implemented Firebase Auth login/signup, lecture audio upload, lecture status tracking, summary display, key-term display, and quiz display.
- Implemented Firebase Functions for lecture creation, Storage-triggered lecture processing, and quiz attempt scoring.
- Added Firestore rules, Storage rules, and a composite Firestore index for lecture listing.
- Added README setup instructions and `.env.example`.
- Verified JSON syntax with Ruby JSON parsing.
- Verified all edited text files decode as UTF-8.
- `npm run typecheck` passed using local Node v24.15.0 installed under `.tools/`.
- `npm run build` passed for Next.js and Firebase Functions.
- `curl -I http://localhost:3000` returned `HTTP/1.1 200 OK`.
- `git diff -- .` could not run because this workspace is not a Git repository. Used `git diff --no-index` for spot diff/stat verification instead.
- `npm audit --audit-level=moderate` reported only low-severity transitive findings; the suggested fix is breaking, so it was not applied automatically.

## Recording AI MVP Plan

- [x] Remove Firebase Storage from the web recording flow.
- [x] Add a browser recording UI with preview and file fallback.
- [x] Add a Next.js API route that transcribes temporary audio and generates a Russian study pack.
- [x] Store only transcript, summaries, key terms, and quizzes in Firestore.
- [x] Update Firestore rules for client-created processed lectures and quizzes.
- [x] Document OpenAI environment variables and verify typecheck/build.

## Recording AI MVP Review

- Added `/api/lectures/process-audio` for temporary audio transcription and study-pack generation.
- The route uses Gemini audio understanding plus structured JSON study-pack generation, and does not persist audio files.
- Replaced the Storage upload UI with browser recording, audio preview, reset, and file fallback.
- Browser recordings are converted to WAV before upload because Gemini officially supports WAV/MP3/OGG/AAC/AIFF/FLAC audio formats.
- Firestore now stores transcript, original summary, Russian summary, key terms, and quizzes.
- Updated Firestore rules to allow authenticated users to create their processed lecture and quiz documents.
- Added `GEMINI_API_KEY` and `GEMINI_STUDY_MODEL` documentation.
- `npm run typecheck` passed.
- `npm run build` passed.
- `curl -I http://localhost:3000` returned `HTTP/1.1 200 OK`.
- API health check returns a clear missing-key error until `GEMINI_API_KEY` is added.
- Firestore rules deployment was attempted but blocked because Firebase CLI is not logged in.

## Gemini Migration Review

- Replaced the OpenAI SDK dependency with `@google/genai`.
- Updated the audio processing route to use `gemini-2.5-flash` by default.
- Removed OpenAI environment variable documentation in favor of Gemini environment variables.
- `npm run typecheck` passed after migration.
- `npm run build` passed after migration.
- `curl -X POST /api/lectures/process-audio` returns `GEMINI_API_KEY is missing` as expected before a key is configured.

## Audio File Upload Review

- Promoted audio file upload as a first-class path for users without a microphone.
- Added selected audio label and preview display.
- Kept microphone recording available, but upload no longer feels like a secondary test-only path.
- Added browser-side WAV conversion for uploaded files when their MIME type is not directly supported by Gemini.

## Transcription Only Review

- Added a transcription-only API route using Gemini Files API for larger audio files.
- Added a "텍스트만 변환" button that returns transcript text without Firestore writes.
- Kept the full "전사 및 요약 생성" path separate for shorter files.
- Avoided browser WAV conversion for large unsupported files so long recordings are not expanded in memory.

## CLOVA Recording Transcription Plan

- [x] Add NAVER CLOVA Speech environment variable examples.
- [x] Add a server route that sends recorded or uploaded audio to CLOVA Speech local-file recognition.
- [x] Route the "텍스트만 변환" button through CLOVA first, with Gemini as a local fallback when CLOVA is not configured.
- [x] Keep the browser recording path producing audio Blob/File input that can use the same transcription route.
- [x] Verify touched files with `git diff -- <file>` and run the relevant TypeScript/build checks.

## CLOVA Recording Transcription Review

- Added `NAVER_CLOVA_SPEECH_INVOKE_URL`, `NAVER_CLOVA_SPEECH_SECRET`, and `NAVER_CLOVA_SPEECH_LANGUAGE` examples.
- Added a server-only CLOVA Speech helper that calls the local-file recognition API with `media` and JSON `params`.
- Added `/api/lectures/transcribe-clova` for transcription-only requests.
- Updated transcription-only flow to try CLOVA first and fall back to Gemini only when CLOVA is not configured or the file format needs the existing Gemini path.
- Updated full lecture processing so configured CLOVA transcription feeds Gemini summary, Russian notes, key terms, and quiz generation.
- Kept browser recordings converted to WAV, so recorded audio can use the same CLOVA pipeline as uploads.
- `npm run typecheck` passed.
- `npm run build` passed.
- `curl -I http://localhost:3000` returned `HTTP/1.1 200 OK`.
- `POST /api/lectures/transcribe-clova` returned the expected multipart-form error for an empty request.
- `git diff -- <file>` was run for each touched file, but this workspace is not a Git repository, so Git could not show diffs.

## NCP Object Storage Plan

- [x] Add the S3-compatible AWS SDK dependency to the web workspace.
- [x] Add NAVER Cloud Object Storage environment variable examples.
- [x] Add a server-only upload helper for lecture audio.
- [x] Upload original audio during full lecture processing when Object Storage is configured.
- [x] Return and persist the NCP object path in Firestore `audioPath`.
- [x] Verify touched files with `git diff -- <file>` and run the relevant TypeScript/build checks.

## NCP Object Storage Review

- Added `@aws-sdk/client-s3` to the web workspace for NCP's S3-compatible Object Storage API.
- Added NCP Object Storage environment variable examples for endpoint, region, bucket, access key, secret key, and object prefix.
- Added a server-only upload helper that stores lecture audio under `lectures/{userId}/{date}/{timestamp}-{uuid}.{extension}`.
- Updated full lecture processing to upload original audio after AI processing when NCP Object Storage is configured.
- Updated the process response and Firestore write so `audioPath` stores an `ncp://bucket/key` reference.
- `npm --workspace apps/web install @aws-sdk/client-s3` completed with 0 vulnerabilities.
- `npm run typecheck` passed.
- `npm run build` passed.
- Restarted the local dev server at `http://localhost:3000`.
- `curl -I http://localhost:3000` returned `HTTP/1.1 200 OK`.
- `POST /api/lectures/process-audio` returned the expected multipart-form error for an empty request.
- `git diff -- <file>` was run for touched files, but this workspace is not a Git repository, so Git could not show diffs.

## Local Server Restart and NCP Smoke Test Review

- Restarted the Next.js dev server at `http://localhost:3000`.
- Confirmed required env presence without printing secrets: Gemini and NCP Object Storage were set; CLOVA Speech was still missing.
- `curl -I http://localhost:3000` returned `HTTP/1.1 200 OK`.
- Generated a short local WAV test lecture using macOS speech tools.
- `POST /api/lectures/process-audio` returned transcript, Korean summary, Russian summary, key terms, quizzes, and an `ncp://...wav` audio path.
- This verifies the API route can process a small audio file and upload the original audio to NCP Object Storage.
- The browser-side Firestore write was not tested from curl because it requires an authenticated web session.

## CLOVA Smoke Test Review

- Confirmed required env presence without printing secrets: Gemini, CLOVA Speech, and NCP Object Storage were set.
- Restarted the Next.js dev server at `http://localhost:3000`.
- `curl -I http://localhost:3000` returned `HTTP/1.1 200 OK`.
- `POST /api/lectures/transcribe-clova` with a short WAV returned transcript text, verifying CLOVA Invoke URL and Secret are working.
- The English test phrase was transcribed phonetically in Korean because the current CLOVA language is `ko-KR`.
- `POST /api/lectures/process-audio` successfully used CLOVA transcription, Gemini study-pack generation, and NCP Object Storage upload.
- The full route returned transcript, Korean summary, Russian summary, key terms, quizzes, and an `ncp://...wav` audio path.

## Quiz Creation Bugfix Plan

- [x] Fix the form reset bug caused by reading React `currentTarget` after an async operation.
- [x] Verify local Firestore rules allow lecture quiz subcollection reads and writes.
- [x] Deploy Firestore rules if Firebase CLI credentials are available.
- [x] Verify with typecheck/build and a running dev server.
- [x] Document the result and any remaining console-side action.

## Quiz Creation Bugfix Review

- Fixed the form reset crash by capturing the form element before awaiting lecture processing.
- Confirmed local `firestore.rules` includes `lectures/{lectureId}/quizzes` read/create permissions for the lecture owner.
- Deployed Firestore rules to project `major-study-helper` with `firebase deploy --only firestore:rules`.
- Added successful listener callbacks that clear stale top-level permission errors once lecture or quiz snapshots load.
- Added lessons for async React form event handling and Firestore rules deployment.
- `npm run typecheck` passed.
- `npm run build` passed.
- Restarted the local dev server at `http://localhost:3000`.
- `curl -I http://localhost:3000` returned `HTTP/1.1 200 OK`.
- `git diff -- <file>` was run for touched files, but this workspace is not a Git repository, so Git could not show diffs.

## GitHub Commit Plan

- [x] Suppress the browser-extension hydration warning shown on the root body element.
- [x] Verify the app with typecheck and build before committing.
- [x] Initialize a local Git repository without committing secret `.env.local` files.
- [x] Commit the current project state locally.
- [ ] Push to GitHub after GitHub authentication is configured locally.

## GitHub Commit Review

- Added `suppressHydrationWarning` to the root body element to avoid browser-extension hydration overlay noise.
- Verified `.env.local`, `apps/web/.env.local`, build caches, logs, and dependencies are ignored before committing.
- Added `*.tsbuildinfo` to `.gitignore` and removed the TypeScript build cache from the staged files.
- `npm run typecheck` passed before commit.
- `npm run build` passed before commit.
- Initialized a local Git repository.
- Created local commit `73b5497` with message `Initial major study helper app`.
- Amended the local commit to `f08ba4c` after recording the GitHub commit review.
- Added GitHub remote `origin` as `https://github.com/Alex21031/study_service.git`.
- Push is blocked because this terminal has no GitHub HTTPS credentials configured: `could not read Username for 'https://github.com': Device not configured`.

## Whisper Transcription Migration Plan

- [x] Add a server-only OpenAI Whisper transcription helper that runs the local Python Whisper package against temporary audio files.
- [x] Replace CLOVA usage in full lecture processing with Whisper transcripts feeding Gemini study-material generation.
- [x] Route the transcription-only button to the Whisper-backed transcription endpoint.
- [x] Update environment examples and setup docs from NAVER CLOVA Speech to local Whisper requirements.
- [x] Verify touched-file diffs, TypeScript checks, and the best available local Whisper smoke test.

## Whisper Transcription Migration Review

- Added a server-only Whisper transcription helper that writes uploaded audio to a temp file and invokes local Python OpenAI Whisper.
- Replaced the transcription-only `/api/lectures/transcribe-audio` route with Whisper-backed transcription.
- Replaced full lecture processing transcription with Whisper, while keeping Gemini for Russian summaries, key terms, and quizzes.
- Removed the CLOVA transcription API route and removed CLOVA env examples from docs.
- Updated `.gitignore` so source files under `apps/web/lib` are no longer hidden by the broad `lib/` ignore pattern.
- Verified tracked touched-file diffs with `git diff -- ...`.
- Verified new/untracked `apps/web/lib` files with `git diff --no-index` because that directory was not previously tracked by Git.
- `npm run typecheck` passed using the local Node binary in `.tools/node-v24.15.0-darwin-arm64/bin`.
- `npm run build` passed using the same local Node binary.
- `python3 -c "import whisper"` failed because OpenAI Whisper is not installed in the current shell.
- `ffmpeg -version` failed because ffmpeg is not installed in the current shell.
- `POST /api/lectures/transcribe-audio` with a generated WAV returned `501` and the expected Whisper installation guidance.

## Local Whisper Runtime Setup Plan

- [x] Create a project-local Python virtual environment for Whisper under `.tools/whisper-venv`.
- [x] Install OpenAI Whisper and a local ffmpeg binary provider into the virtual environment.
- [x] Expose the local ffmpeg binary through `.tools/bin/ffmpeg` so Whisper can decode audio without Homebrew.
- [x] Update the server helper and local env so Next.js uses the project-local Whisper runtime.
- [x] Verify with import checks, ffmpeg checks, typecheck/build, and an API smoke test.

## Local Whisper Runtime Setup Review

- Created `.tools/whisper-venv` with Python 3.9 and installed `openai-whisper==20250625`, `torch==2.8.0`, and `imageio-ffmpeg==0.6.0`.
- Added `/Users/alex/.major-study-helper/bin/python3` and `/Users/alex/.major-study-helper/bin/ffmpeg` runtime wrappers so Turbopack does not inspect project-internal Python symlinks during build.
- Updated `apps/web/.env.local` without printing secrets: `WHISPER_PYTHON_BIN=python3`, `WHISPER_PATH_PREFIX=/Users/alex/.major-study-helper/bin`, `WHISPER_MODEL=tiny`, and `WHISPER_TIMEOUT_MS=300000`.
- Updated the Whisper helper to prepend `WHISPER_PATH_PREFIX` to the Python child process PATH.
- Verified Whisper import: `.tools/whisper-venv/bin/python -c "import whisper"` reported version `20250625`.
- Verified local ffmpeg: `.tools/bin/ffmpeg -version` reported ffmpeg `7.1`.
- `npm run typecheck` passed using local Node from `.tools/node-v24.15.0-darwin-arm64/bin`.
- `npm run build` passed after removing build-time project `.tools` path probing from the helper.
- Started the Next.js dev server at `http://localhost:3001`.
- `POST /api/lectures/transcribe-audio` with an English macOS `say` AIFF test returned HTTP `200` and transcript `This is a local whisper transcription test for the study helper app.`

## Long Lecture Whisper Plan

- [x] Add ffmpeg audio chunking so long lectures are split before Whisper transcription.
- [x] Transcribe chunks sequentially and join transcripts in order.
- [x] Add environment controls for chunk length, total timeout, and per-chunk timeout.
- [x] Update docs and env examples for one-hour lecture settings.
- [x] Verify with typecheck/build and a forced multi-chunk API smoke test.

## Long Lecture Whisper Review

- Added ffmpeg-based audio splitting before Whisper transcription.
- Long audio is converted into mono 16 kHz WAV chunks using `WHISPER_CHUNK_SECONDS`, defaulting to 600 seconds.
- Whisper now loads the selected model once per request and transcribes all chunk paths in order, then joins non-empty chunk transcripts.
- Added `WHISPER_CHUNK_SECONDS` and `WHISPER_TOTAL_TIMEOUT_MS` to env examples and README.
- Updated local `apps/web/.env.local` without printing secrets: `WHISPER_MODEL=turbo`, `WHISPER_CHUNK_SECONDS=600`, `WHISPER_TIMEOUT_MS=900000`, and `WHISPER_TOTAL_TIMEOUT_MS=7200000`.
- `npm run typecheck` passed using local Node from `.tools/node-v24.15.0-darwin-arm64/bin`.
- `npm run build` passed.
- Forced multi-chunk smoke test passed by starting the dev server with `WHISPER_CHUNK_SECONDS=60` and posting a 65-second WAV to `/api/lectures/transcribe-audio`; the API returned HTTP `200` with a joined transcript.
- Restarted the normal dev server at `http://localhost:3001` with the 10-minute chunk setting from `apps/web/.env.local`.

## Streaming Transcription Plan

- [x] Stream Whisper chunk results from `/api/lectures/transcribe-audio?stream=1` as newline-delimited JSON.
- [x] Keep the existing JSON response path for non-streaming callers such as full lecture processing.
- [x] Update the transcription-only client request to read the stream and append chunk text live.
- [x] Verify typecheck/build and an API streaming smoke test with forced multi-chunk audio.

## Streaming Transcription Review

- Added `/api/lectures/transcribe-audio?stream=1` streaming output using newline-delimited JSON.
- Streaming responses emit `chunk` events as each Whisper chunk completes and a final `done` event with the joined transcript.
- Kept the non-streaming JSON path intact for callers that need one final transcript.
- Updated the transcription-only client flow to read the stream and append chunk text into the transcript textarea as chunks arrive.
- `npm run typecheck` passed using local Node from `.tools/node-v24.15.0-darwin-arm64/bin`.
- `npm run build` passed.
- Forced multi-chunk streaming smoke test passed with `WHISPER_CHUNK_SECONDS=60`; curl received chunk `0`, chunk `1`, and final `done` NDJSON events from `/api/lectures/transcribe-audio?stream=1`.
- Restarted the normal dev server at `http://localhost:3001`.

## Python Migration and Merge Plan

- [x] Inspect `Project` and `StudyService_back` to inventory current features, storage, auth, and AI integrations.
- [x] Lock the migration target architecture and document the assumptions for what "convert to Python" means.
- [x] Extend `StudyService_back` data models and schemas for lectures, key terms, quizzes, and quiz attempts.
- [x] Port the lecture transcription and study-material generation pipeline from Next.js routes to FastAPI services.
- [x] Add authenticated FastAPI endpoints for lecture create/list/detail, transcription-only streaming, and full lecture processing.
- [x] Replace Firebase/Firestore-dependent web data flows with calls to the merged FastAPI backend.
- [x] Preserve the existing `StudyService_back` features: auth, study-plan, email-translate, and solve-problem.
- [x] Verify the merged app locally with touched-file diffs plus relevant backend/frontend build or test commands.
- [x] Merge the completed work into the local `StudyService_back` repo state.
- [x] Push the merged result to `https://github.com/Alex21031/StudyService_back.git`.

## Python Migration and Merge Spec

- Source app in `Project`:
  lecture recording/upload UI, transcription-only flow, full lecture processing, lecture history, transcript view, Korean/original summary, Russian summary, key terms, and quizzes.
- Existing backend in `StudyService_back`:
  FastAPI app with JWT auth, SQLite via SQLAlchemy, and Gemini-backed study-plan, translation, and guided problem-solving features.
- Working assumption for phase 1:
  "Convert the features to Python" means migrating the server/business logic from Firebase Functions and Next.js API routes into FastAPI inside `StudyService_back`, while keeping the existing Next.js client until a separate frontend rewrite is explicitly requested.
- Why this assumption:
  the current browser app cannot become "all Python" without a full UI rewrite to a different stack such as Django templates, HTMX, or Streamlit, which is a separate architectural project with product tradeoffs.
- Migration target:
  `StudyService_back` becomes the single backend for auth, lecture processing, quiz data, study plans, translation, and problem solving.
- Planned backend replacements:
  Firebase Auth -> existing JWT auth in `StudyService_back`
  Firestore lecture and quiz documents -> SQLAlchemy models and FastAPI endpoints
  Next.js `/api/lectures/*` routes -> FastAPI lecture routes and Python services
  Whisper subprocess and Gemini study-pack generation -> reused in Python-native services
- Open design decisions to resolve during implementation:
  whether to keep NCP Object Storage for lecture audio or first store files locally,
  whether the Next.js frontend should be adapted incrementally or replaced later,
  whether Firebase user identities need migration or the merged app should use only FastAPI auth going forward.

## Python Migration and Merge Review

- Discovery completed and the phase-1 architecture was locked to "Python backend migration, existing test frontend retained".
- Added lecture persistence models, response schemas, a Whisper/Gemini lecture service, and FastAPI lecture routes inside `StudyService_back`.
- Verified Python syntax with `python3 -m compileall StudyService_back`.
- Verified app wiring in a temporary virtualenv with FastAPI `TestClient`: `/health` returned `200`, `/lectures` returned `401` without auth, `/lectures/transcribe-audio` returned `422` without a file, `/study-plan` returned `200`, and existing Gemini-backed routes stayed mounted and returned `503` without `GEMINI_API_KEY`.
- Committed the backend merge in `StudyService_back` as `447b27b` with message `Add lecture processing backend`.
- Pushed `main` to `https://github.com/Alex21031/StudyService_back.git`.
- The test frontend now talks directly to the merged FastAPI backend instead of Firebase Auth and Firestore.

## FastAPI Frontend Integration Plan

- [x] Inspect the current web auth and lecture flows to identify Firebase-specific dependencies.
- [x] Add a small frontend API/auth client for the merged FastAPI backend, including token persistence and current-user loading.
- [x] Replace Firebase auth usage in `AuthGate.tsx` with backend signup/signin/signout flows.
- [x] Replace Firestore-based lecture list and quiz loading with backend fetch calls and refresh hooks.
- [x] Update lecture upload/transcription actions to call the FastAPI lecture endpoints directly.
- [x] Add direct frontend test panels for study-plan, email-translate, and solve-problem.
- [x] Update environment examples and local defaults for the backend base URL.
- [x] Verify touched-file diffs and run the relevant frontend typecheck/build commands.

## FastAPI Frontend Integration Review

- Added `apps/web/lib/backend.ts` for backend base URL resolution, JWT token storage, authenticated fetches, and helper calls for auth, study plans, translation, and problem-solving sessions.
- Replaced Firebase auth in `AuthGate.tsx` with backend session loading, signup, signin, and local signout.
- Replaced Firestore lecture listeners with backend fetch calls in `apps/web/lib/lectures.ts` and `StudyWorkspace.tsx`.
- Kept the lecture recording/upload UI, but now lecture processing and transcription call the FastAPI backend directly.
- Added `StudyServiceTools.tsx` so study-plan, email-translate, and solve-problem features can be exercised directly from the frontend.
- Updated `apps/web/.env.example` for `NEXT_PUBLIC_API_BASE_URL` and added responsive UI styles for the new tool panels.
- `npm --workspace apps/web run typecheck` passed.
- `npm --workspace apps/web run build` passed.
- Started `StudyService_back` locally at `http://127.0.0.1:8000`.
- Started the Next.js frontend locally at `http://localhost:3000`.
- `curl -I http://127.0.0.1:3000` returned `HTTP/1.1 200 OK`.
- `curl http://127.0.0.1:8000/health` returned `{"status":"ok"}`.
- Backend smoke tests passed through the running app: register/login, `/auth/me`, `/study-plan`, `/email-translate`, `/solve-problem/sessions`, and `/lectures/process-audio` all returned successful responses, and lecture listing reflected the created lecture.
