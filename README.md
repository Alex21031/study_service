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
GEMINI_STUDY_MODEL=gemini-2.5-flash
```

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

That route sends temporary audio to Gemini, asks for a transcript, Russian summary, key terms, and quizzes, then stores only the resulting text data in Firestore. The audio file is not persisted.

## Data Flow

1. A student signs in with Firebase Auth.
2. The web app creates a `lectures/{lectureId}` document.
3. The web app uploads audio to `audio/{userId}/{lectureId}/{fileName}`.
4. `onLectureAudioFinalized` processes the audio.
5. Firestore stores transcript, summaries, key terms, and generated quizzes.
6. The web app listens to Firestore updates and renders the study workspace.
