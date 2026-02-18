import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const SUBMISSIONS_ROOT = path.join(process.cwd(), "storage", "discursive-submissions");
const SUBMISSION_FILES_ROOT = path.join(process.cwd(), "storage", "discursive-submission-files");

export type StoredDiscursiveSubmission = {
  id: string;
  userId: string;
  createdAt: string;
  rubric: string;
  proposedTheme: string;
  sourceType: "TEXT" | "IMAGE" | "PDF";
  title: string;
  overallScore: number;
  originalText: string;
  summary: string;
  transcription: string;
  criteria: Array<{ name: string; score: number; feedback: string }>;
  strengths: string[];
  improvements: string[];
  correctedVersion: string;
  finalAdvice: string;
  model: string;
  sourceFile: {
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
};

type SaveDiscursiveSubmissionInput = Omit<StoredDiscursiveSubmission, "id" | "createdAt" | "sourceFile"> & {
  sourceFile?: {
    originalName: string;
    mimeType: string;
    bytes: Buffer;
  } | null;
};

export async function saveDiscursiveSubmission(input: SaveDiscursiveSubmissionInput) {
  const userId = sanitizeUserId(input.userId);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const sourceFile = input.sourceFile
    ? await writeSourceFile({
        userId,
        submissionId: id,
        ...input.sourceFile
      })
    : null;

  const record: StoredDiscursiveSubmission = {
    id,
    userId,
    createdAt,
    rubric: input.rubric.trim().slice(0, 120),
    proposedTheme: input.proposedTheme.trim().slice(0, 300),
    sourceType: input.sourceType,
    title: input.title.trim().slice(0, 120),
    overallScore: clampScore(input.overallScore),
    originalText: input.originalText.trim().slice(0, 15000),
    summary: input.summary.trim().slice(0, 1200),
    transcription: input.transcription.trim().slice(0, 15000),
    criteria: sanitizeCriteria(input.criteria),
    strengths: sanitizeList(input.strengths, 8, 220),
    improvements: sanitizeList(input.improvements, 10, 220),
    correctedVersion: input.correctedVersion.trim().slice(0, 15000),
    finalAdvice: input.finalAdvice.trim().slice(0, 2400),
    model: input.model.trim().slice(0, 100),
    sourceFile
  };

  await fs.mkdir(userSubmissionDir(userId), { recursive: true });
  await fs.writeFile(submissionPath(userId, id), JSON.stringify(record), "utf8");

  return record;
}

export async function listDiscursiveSubmissions(userId: string, limit = 100) {
  const safeUserId = sanitizeUserId(userId);
  const dir = userSubmissionDir(safeUserId);
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter((file) => file.endsWith(".json")).slice(0, Math.max(1, limit * 3));
    const records: StoredDiscursiveSubmission[] = [];
    for (const fileName of jsonFiles) {
      const parsed = await readSubmissionFile(path.join(dir, fileName));
      if (parsed) records.push(parsed);
    }
    return records
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

export async function getDiscursiveSubmission(userId: string, submissionId: string) {
  const safeUserId = sanitizeUserId(userId);
  const safeId = sanitizeId(submissionId);
  if (!safeId) return null;
  return readSubmissionFile(submissionPath(safeUserId, safeId));
}

export async function deleteDiscursiveSubmission(userId: string, submissionId: string) {
  const safeUserId = sanitizeUserId(userId);
  const safeId = sanitizeId(submissionId);
  if (!safeId) return false;

  const existing = await getDiscursiveSubmission(safeUserId, safeId);
  if (!existing) return false;

  await fs.unlink(submissionPath(safeUserId, safeId)).catch(() => undefined);
  if (existing.sourceFile?.fileName) {
    await fs.unlink(sourceFilePath(safeUserId, existing.sourceFile.fileName)).catch(() => undefined);
  }
  return true;
}

export async function readDiscursiveSubmissionSourceFile(userId: string, fileName: string) {
  const safeUserId = sanitizeUserId(userId);
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) return null;
  try {
    const bytes = await fs.readFile(sourceFilePath(safeUserId, safeFileName));
    return bytes;
  } catch {
    return null;
  }
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sanitizeList(items: string[], maxItems: number, maxLen: number) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLen));
}

function sanitizeCriteria(
  criteria: Array<{ name: string; score: number; feedback: string }>
): Array<{ name: string; score: number; feedback: string }> {
  return (Array.isArray(criteria) ? criteria : [])
    .map((item) => ({
      name: String(item?.name ?? "").trim().slice(0, 120),
      score: clampScore(Number(item?.score ?? 0)),
      feedback: String(item?.feedback ?? "").trim().slice(0, 800)
    }))
    .filter((item) => item.name.length > 0 && item.feedback.length > 0)
    .slice(0, 12);
}

async function writeSourceFile(params: {
  userId: string;
  submissionId: string;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const extension = extensionFor(params.originalName, params.mimeType);
  const fileName = `${params.submissionId}.${extension}`;
  await fs.mkdir(userSourceFileDir(params.userId), { recursive: true });
  await fs.writeFile(sourceFilePath(params.userId, fileName), params.bytes);
  return {
    fileName,
    originalName: sanitizeDownloadName(params.originalName),
    mimeType: params.mimeType || "application/octet-stream",
    sizeBytes: params.bytes.length
  };
}

function extensionFor(originalName: string, mimeType: string) {
  const ext = path.extname(originalName || "").toLowerCase().replace(".", "");
  if (ext && /^[a-z0-9]{1,8}$/.test(ext)) return ext;
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/plain") return "txt";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  return "bin";
}

function readSubmissionFile(filePath: string) {
  return fs
    .readFile(filePath, "utf8")
    .then((raw) => JSON.parse(raw) as StoredDiscursiveSubmission)
    .catch(() => null);
}

function sanitizeUserId(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function sanitizeId(id: string) {
  const value = id.trim();
  if (!/^[a-zA-Z0-9-]{8,120}$/.test(value)) return null;
  return value;
}

function sanitizeFileName(fileName: string) {
  const base = path.posix.basename(fileName || "");
  if (!base || base === "." || base === "..") return null;
  return base;
}

function sanitizeDownloadName(fileName: string) {
  return fileName.replace(/[\r\n"]/g, "_").slice(0, 180) || "arquivo";
}

function userSubmissionDir(userId: string) {
  return path.join(SUBMISSIONS_ROOT, userId);
}

function submissionPath(userId: string, id: string) {
  return path.join(userSubmissionDir(userId), `${id}.json`);
}

function userSourceFileDir(userId: string) {
  return path.join(SUBMISSION_FILES_ROOT, userId);
}

function sourceFilePath(userId: string, fileName: string) {
  return path.join(userSourceFileDir(userId), fileName);
}
