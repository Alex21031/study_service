import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

interface UploadLectureAudioParams {
  audio: File;
  userId: string;
}

interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

const REQUIRED_KEYS = [
  "NCP_OBJECT_STORAGE_ENDPOINT",
  "NCP_OBJECT_STORAGE_BUCKET",
  "NCP_OBJECT_STORAGE_ACCESS_KEY",
  "NCP_OBJECT_STORAGE_SECRET_KEY"
] as const;

function configuredValue(key: string) {
  const value = process.env[key]?.trim();

  return value || "";
}

function objectStorageConfig(): ObjectStorageConfig | null {
  const missingKeys = REQUIRED_KEYS.filter((key) => !configuredValue(key));
  const hasAnyKey = REQUIRED_KEYS.some((key) => configuredValue(key));

  if (!hasAnyKey) {
    return null;
  }

  if (missingKeys.length > 0) {
    throw new Error(`Missing NCP Object Storage environment variables: ${missingKeys.join(", ")}`);
  }

  return {
    endpoint: configuredValue("NCP_OBJECT_STORAGE_ENDPOINT").replace(/\/$/, ""),
    region: configuredValue("NCP_OBJECT_STORAGE_REGION") || "kr-standard",
    bucket: configuredValue("NCP_OBJECT_STORAGE_BUCKET"),
    accessKeyId: configuredValue("NCP_OBJECT_STORAGE_ACCESS_KEY"),
    secretAccessKey: configuredValue("NCP_OBJECT_STORAGE_SECRET_KEY"),
    prefix: configuredValue("NCP_OBJECT_STORAGE_PREFIX") || "lectures"
  };
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 96) || "unknown";
}

function audioExtension(file: File) {
  const fileName = file.name.toLowerCase();
  const type = file.type.split(";")[0];

  if (fileName.endsWith(".mp3") || type === "audio/mp3" || type === "audio/mpeg") {
    return "mp3";
  }

  if (fileName.endsWith(".aac") || type === "audio/aac") {
    return "aac";
  }

  if (fileName.endsWith(".ac3") || type === "audio/ac3") {
    return "ac3";
  }

  if (fileName.endsWith(".m4a") || type === "audio/mp4" || type === "audio/x-m4a") {
    return "m4a";
  }

  if (fileName.endsWith(".ogg") || fileName.endsWith(".oga") || type === "audio/ogg") {
    return "ogg";
  }

  if (fileName.endsWith(".flac") || type === "audio/flac") {
    return "flac";
  }

  if (fileName.endsWith(".aiff") || fileName.endsWith(".aif") || type === "audio/aiff") {
    return "aiff";
  }

  if (fileName.endsWith(".webm") || type === "audio/webm") {
    return "webm";
  }

  return "wav";
}

function createObjectKey(prefix: string, userId: string, audio: File) {
  const now = new Date();
  const datePrefix = now.toISOString().slice(0, 10);
  const safePrefix = prefix.replace(/^\/+|\/+$/g, "") || "lectures";
  const safeUserId = safeSegment(userId);

  return `${safePrefix}/${safeUserId}/${datePrefix}/${now.getTime()}-${randomUUID()}.${audioExtension(audio)}`;
}

export async function uploadLectureAudioToNcpObjectStorage({ audio, userId }: UploadLectureAudioParams) {
  const config = objectStorageConfig();

  if (!config) {
    return "";
  }

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  const key = createObjectKey(config.prefix, userId, audio);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: Buffer.from(await audio.arrayBuffer()),
      ContentType: audio.type || "application/octet-stream"
    })
  );

  return `ncp://${config.bucket}/${key}`;
}
