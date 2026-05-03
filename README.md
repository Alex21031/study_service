# Major Study Helper

TypeScript and Firebase MVP for international students who want lecture recordings converted into Russian summaries and study quizzes.

## Stack

- Web: Next.js, React, TypeScript
- Backend: Cloud Functions for Firebase, Node.js, TypeScript
- Firebase: Auth, Firestore, Storage, Emulator Suite
- Shared contracts: TypeScript models in `shared/types`

## Project Structure

```txt
apps/web        Next.js app
functions       Firebase Functions backend
shared/types    Shared TypeScript contracts
firestore.rules Firestore access control
storage.rules   Storage access control
```

## Local Setup

Install Node.js 20.9 or newer first. Next.js 16 requires Node 20.9+.

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
```

Create a Firebase project, register a web app, and fill `apps/web/.env.local` with the Firebase web config. The Next.js app runs from the `apps/web` workspace, so the web environment file must live there.

For recording transcription and AI summaries, add a Gemini API key to `apps/web/.env.local`:

```txt
GEMINI_API_KEY=your_server_only_key
GEMINI_STUDY_MODEL=gemini-3-flash-preview
```

For local speech-to-text, install OpenAI Whisper and ffmpeg on the machine running the Next.js server:

```bash
python3 -m pip install git+https://github.com/openai/whisper.git
brew install ffmpeg
```

Optional Whisper settings in `apps/web/.env.local`:

```txt
WHISPER_PYTHON_BIN=python3
WHISPER_PATH_PREFIX=
WHISPER_MODEL=turbo
WHISPER_LANGUAGE=
WHISPER_CHUNK_SECONDS=600
WHISPER_TIMEOUT_MS=900000
WHISPER_TOTAL_TIMEOUT_MS=7200000
```

For one-hour lectures, keep `WHISPER_MODEL=turbo` and process audio in chunks. The default `WHISPER_CHUNK_SECONDS=600` splits long recordings into 10-minute WAV chunks, loads Whisper once, transcribes each chunk in order, and joins the transcript before Gemini creates study materials.

## Development

Run the web app:

```bash
npm run dev
```

Run Firebase emulators:

```bash
npm run emulators
```

Enable emulator usage in `apps/web/.env.local`:

```txt
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

## Build and Type Check

```bash
npm run typecheck
npm run build
```

## AI Integration Point

The local recording MVP uses `apps/web/app/api/lectures/process-audio/route.ts`.

That route sends temporary audio to local OpenAI Whisper for transcription, asks Gemini for a Russian summary, key terms, and quizzes from the transcript, then stores the resulting study data in Firestore.

## Data Flow

1. A student signs in with Firebase Auth.
2. The web app creates a `lectures/{lectureId}` document.
3. The web app uploads audio to `audio/{userId}/{lectureId}/{fileName}`.
4. `onLectureAudioFinalized` processes the audio.
5. Firestore stores transcript, summaries, key terms, and generated quizzes.
6. The web app listens to Firestore updates and renders the study workspace.
