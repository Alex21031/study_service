"use client";

import { processLectureAudio, transcribeLectureAudio } from "@/lib/lectures";
import { FormEvent, useEffect, useRef, useState } from "react";

interface LectureUploaderProps {
  userId: string;
}

interface WindowWithWebkitAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function chooseRecordingMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function isDirectTranscriptionAudioFile(file: File) {
  const type = file.type.split(";")[0];
  const fileName = file.name.toLowerCase();
  const supportedTypes = [
    "audio/wav",
    "audio/x-wav",
    "audio/mp3",
    "audio/mpeg",
    "audio/aiff",
    "audio/aac",
    "audio/ac3",
    "audio/ogg",
    "audio/flac",
    "audio/mp4",
    "audio/x-m4a"
  ];
  const supportedExtensions = [".wav", ".mp3", ".aiff", ".aif", ".aac", ".ac3", ".ogg", ".oga", ".flac", ".m4a"];

  return supportedTypes.includes(type) || supportedExtensions.some((extension) => fileName.endsWith(extension));
}

function shouldAvoidBrowserConversion(file: File) {
  return file.size > 25 * 1024 * 1024;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function audioBufferToWav(audioBuffer: AudioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples * blockAlign);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples * blockAlign, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples * blockAlign, true);

  let offset = 44;
  const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));

  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][sampleIndex]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

async function convertBlobToWav(blob: Blob) {
  const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("이 브라우저는 오디오 변환을 지원하지 않습니다. WAV/MP3 파일 업로드를 사용해 주세요.");
  }

  const audioContext = new AudioContextClass();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    return audioBufferToWav(audioBuffer);
  } finally {
    await audioContext.close();
  }
}

export function LectureUploader({ userId }: LectureUploaderProps) {
  const [title, setTitle] = useState("");
  const [courseName, setCourseName] = useState("");
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioLabel, setAudioLabel] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparingFile, setIsPreparingFile] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!isRecording) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioUrl]);

  function setAudioBlob(blob: Blob, label: string) {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setRecordedAudio(blob);
    setAudioLabel(label);
    setAudioUrl(URL.createObjectURL(blob));
  }

  async function prepareAudioFile(file: File) {
    setError("");
    setIsPreparingFile(true);

    try {
      if (isDirectTranscriptionAudioFile(file)) {
        setAudioBlob(file, file.name);
        return;
      }

      if (shouldAvoidBrowserConversion(file)) {
        setAudioBlob(file, `${file.name} -> 원본 파일로 텍스트 변환`);
        return;
      }

      const wavBlob = await convertBlobToWav(file);
      setAudioBlob(wavBlob, `${file.name} -> WAV 변환됨`);
    } catch (conversionError) {
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : "이 음성 파일을 처리할 수 없습니다. WAV, MP3, OGG, AAC, AC3, M4A, AIFF, FLAC 파일을 사용해 주세요."
      );
    } finally {
      setIsPreparingFile(false);
    }
  }

  async function startRecording() {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("이 브라우저는 녹음 기능을 지원하지 않습니다. 오디오 파일 선택을 사용해 주세요.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = chooseRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      chunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm"
        });

        void convertBlobToWav(blob)
          .then((wavBlob) => setAudioBlob(wavBlob, "브라우저 녹음 -> WAV 변환됨"))
          .catch((conversionError) => {
            setError(conversionError instanceof Error ? conversionError.message : "녹음 파일 변환에 실패했습니다.");
          })
          .finally(() => {
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            mediaRecorderRef.current = null;
          });
      });

      setElapsedSeconds(0);
      setIsRecording(true);
      recorder.start();
    } catch (recordingError) {
      setError(recordingError instanceof Error ? recordingError.message : "마이크 권한을 가져오지 못했습니다.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function resetAudio() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setRecordedAudio(null);
    setAudioLabel("");
    setAudioUrl("");
    setElapsedSeconds(0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    setError("");

    if (!recordedAudio) {
      setError("강의를 녹음하거나 오디오 파일을 선택해 주세요.");
      return;
    }

    setSubmitting(true);

    try {
      await processLectureAudio({
        userId,
        title: title.trim(),
        courseName: courseName.trim(),
        audio: recordedAudio
      });

      setTitle("");
      setCourseName("");
      resetAudio();
      form.reset();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Lecture processing failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTranscribeOnly() {
    setError("");
    setTranscriptText("");

    if (!recordedAudio) {
      setError("텍스트로 변환할 음성 파일을 선택해 주세요.");
      return;
    }

    setTranscribing(true);

    try {
      const transcriptChunks: string[] = [];
      const transcript = await transcribeLectureAudio({
        title: title.trim() || "Untitled lecture",
        courseName: courseName.trim() || "Course",
        audio: recordedAudio,
        onTranscriptChunk: (chunk) => {
          transcriptChunks[chunk.index] = chunk.transcript;
          setTranscriptText(transcriptChunks.filter(Boolean).join("\n\n"));
        }
      });

      setTranscriptText(transcript);
    } catch (transcriptionError) {
      setError(transcriptionError instanceof Error ? transcriptionError.message : "Lecture transcription failed.");
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>강의 녹음</h2>
      </div>

      <form className="upload-form" onSubmit={handleSubmit}>
        <label>
          강의 제목
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 자료구조 3주차"
          />
        </label>

        <label>
          과목명
          <input
            required
            value={courseName}
            onChange={(event) => setCourseName(event.target.value)}
            placeholder="예: Computer Science"
          />
        </label>

        <div className="recorder-box">
          <div className="recorder-meter" data-recording={isRecording}>
            <span />
            <strong>{isRecording ? "녹음 중" : recordedAudio ? "녹음 준비 완료" : "대기 중"}</strong>
            <em>
              {Math.floor(elapsedSeconds / 60)
                .toString()
                .padStart(2, "0")}
              :{(elapsedSeconds % 60).toString().padStart(2, "0")}
            </em>
          </div>

          <div className="recorder-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={startRecording}
              disabled={isRecording || submitting}
            >
              녹음 시작
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={stopRecording}
              disabled={!isRecording || submitting}
            >
              정지
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={resetAudio}
              disabled={!recordedAudio || isRecording || submitting}
            >
              다시 녹음
            </button>
          </div>

          {audioUrl ? (
            <div className="audio-preview-box">
              <span>{audioLabel}</span>
              <audio className="audio-preview" controls src={audioUrl}>
                <track kind="captions" />
              </audio>
            </div>
          ) : null}
        </div>

        <label className="file-input">
          음성 파일 업로드
          <input
            type="file"
            accept="audio/*"
            disabled={isRecording || isPreparingFile || submitting}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void prepareAudioFile(file);
              }
            }}
          />
          <small>마이크가 없어도 WAV, MP3, OGG, AAC, AC3, M4A, AIFF, FLAC 파일을 업로드할 수 있습니다.</small>
        </label>

        {isPreparingFile ? <p className="helper-text">음성 파일을 준비하는 중입니다...</p> : null}

        <button
          className="secondary-button"
          type="button"
          onClick={handleTranscribeOnly}
          disabled={!recordedAudio || isPreparingFile || submitting || transcribing}
        >
          {transcribing ? "텍스트 변환 중" : "텍스트만 변환"}
        </button>

        {transcriptText ? (
          <label>
            전사 결과
            <textarea className="transcript-area" readOnly value={transcriptText} />
          </label>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <button className="primary-button" type="submit" disabled={submitting || transcribing}>
          {submitting ? "AI 처리 중" : "전사 및 요약 생성"}
        </button>
      </form>
    </section>
  );
}
