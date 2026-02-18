import fs from "node:fs/promises";
import path from "node:path";

const PRIVATE_TOPIC_FILES_DIR = path.join(process.cwd(), "storage", "topic-files");
const LEGACY_TOPIC_FILES_DIR = path.join(process.cwd(), "public", "uploads", "topic-files");

function sanitizeFileName(fileName: string) {
  const safe = path.posix.basename(fileName || "");
  if (!safe || safe === "." || safe === "..") return null;
  return safe;
}

function privatePathFor(fileName: string) {
  return path.join(PRIVATE_TOPIC_FILES_DIR, fileName);
}

function legacyPathFor(fileName: string) {
  return path.join(LEGACY_TOPIC_FILES_DIR, fileName);
}

export function attachmentContentUrl(fileId: string, download = false) {
  return download
    ? `/api/topics/files/${fileId}?download=1`
    : `/api/topics/files/${fileId}`;
}

export async function writeTopicFile(fileName: string, buffer: Buffer) {
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) {
    throw new Error("Invalid file name");
  }

  await fs.mkdir(PRIVATE_TOPIC_FILES_DIR, { recursive: true });
  await fs.writeFile(privatePathFor(safeFileName), buffer);
}

export async function readTopicFile(fileName: string) {
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) return null;

  const existingPath = await resolveTopicFilePath(safeFileName);
  if (!existingPath) {
    return null;
  }

  try {
    const bytes = await fs.readFile(existingPath);
    return bytes;
  } catch {
    return null;
  }
}

export async function deleteTopicFile(fileName: string | null | undefined) {
  const safeFileName = sanitizeFileName(fileName ?? "");
  if (!safeFileName) return;

  await fs.unlink(privatePathFor(safeFileName)).catch(() => undefined);
  await fs.unlink(legacyPathFor(safeFileName)).catch(() => undefined);
}

export async function deleteTopicFiles(fileNames: Array<string | null | undefined>) {
  const unique = [
    ...new Set(
      fileNames.filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  ];
  for (const fileName of unique) {
    await deleteTopicFile(fileName);
  }
}

export async function resolveTopicFilePath(fileName: string) {
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) return null;

  const privatePath = privatePathFor(safeFileName);
  try {
    await fs.access(privatePath);
    return privatePath;
  } catch {}

  const legacyPath = legacyPathFor(safeFileName);
  try {
    await fs.access(legacyPath);
    return legacyPath;
  } catch {
    return null;
  }
}
