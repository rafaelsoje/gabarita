import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const EXAM_RESULTS_ROOT = path.join(process.cwd(), "storage", "exam-results");
const EXAM_RESULT_FILES_ROOT = path.join(process.cwd(), "storage", "exam-result-files");

export type StoredExamResultStatus =
  | "APPROVED"
  | "CLASSIFIED"
  | "NOT_CLASSIFIED"
  | "PENDING_RESULT";

export type StoredExamResult = {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  planId: string | null;
  planTitle: string | null;
  examName: string;
  boardName: string | null;
  examDate: string | null;
  score: number | null;
  cutoffScore: number | null;
  rankPosition: number | null;
  totalParticipants: number | null;
  totalApproved: number | null;
  status: StoredExamResultStatus;
  notes: string | null;
  sourceFile: {
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
};

type SaveExamResultInput = Omit<StoredExamResult, "id" | "createdAt" | "updatedAt" | "sourceFile"> & {
  sourceFile?: {
    originalName: string;
    mimeType: string;
    bytes: Buffer;
  } | null;
};

export async function saveExamResult(input: SaveExamResultInput) {
  const userId = sanitizeUserId(input.userId);
  const id = randomUUID();
  const nowIso = new Date().toISOString();
  const sourceFile = input.sourceFile
    ? await writeSourceFile({
        userId,
        examResultId: id,
        ...input.sourceFile
      })
    : null;

  const record: StoredExamResult = {
    id,
    userId,
    createdAt: nowIso,
    updatedAt: nowIso,
    planId: normalizeNullableId(input.planId),
    planTitle: normalizeNullableText(input.planTitle, 160),
    examName: normalizeText(input.examName, 180),
    boardName: normalizeNullableText(input.boardName, 120),
    examDate: normalizeDateString(input.examDate),
    score: normalizeNullableNumber(input.score, 0, 1000),
    cutoffScore: normalizeNullableNumber(input.cutoffScore, 0, 1000),
    rankPosition: normalizeNullableInt(input.rankPosition, 1, 10_000_000),
    totalParticipants: normalizeNullableInt(input.totalParticipants, 1, 10_000_000),
    totalApproved: normalizeNullableInt(input.totalApproved, 1, 10_000_000),
    status: normalizeStatus(input.status),
    notes: normalizeNullableText(input.notes, 3000),
    sourceFile
  };

  await fs.mkdir(userExamResultDir(userId), { recursive: true });
  await fs.writeFile(examResultPath(userId, id), JSON.stringify(record), "utf8");
  return record;
}

export async function listExamResults(userId: string, limit = 800) {
  const safeUserId = sanitizeUserId(userId);
  const dir = userExamResultDir(safeUserId);
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter((file) => file.endsWith(".json")).slice(0, Math.max(1, limit * 3));
    const records: StoredExamResult[] = [];
    for (const fileName of jsonFiles) {
      const parsed = await readExamResult(path.join(dir, fileName));
      if (parsed) records.push(parsed);
    }
    return records
      .sort((a, b) => (a.examDate || a.createdAt) < (b.examDate || b.createdAt) ? 1 : -1)
      .slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

export async function deleteExamResult(userId: string, examResultId: string) {
  const safeUserId = sanitizeUserId(userId);
  const safeId = sanitizeId(examResultId);
  if (!safeId) return false;

  const existing = await getExamResult(safeUserId, safeId);
  if (!existing) return false;

  try {
    await fs.unlink(examResultPath(safeUserId, safeId));
    if (existing.sourceFile?.fileName) {
      await fs.unlink(examResultSourceFilePath(safeUserId, existing.sourceFile.fileName)).catch(() => undefined);
    }
    return true;
  } catch {
    return false;
  }
}

export async function getExamResult(userId: string, examResultId: string) {
  const safeUserId = sanitizeUserId(userId);
  const safeId = sanitizeId(examResultId);
  if (!safeId) return null;
  return readExamResult(examResultPath(safeUserId, safeId));
}

export async function readExamResultSourceFile(userId: string, fileName: string) {
  const safeUserId = sanitizeUserId(userId);
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) return null;
  try {
    return await fs.readFile(examResultSourceFilePath(safeUserId, safeFileName));
  } catch {
    return null;
  }
}

function readExamResult(filePath: string) {
  return fs
    .readFile(filePath, "utf8")
    .then((raw) => normalizeLoadedRecord(JSON.parse(raw) as Partial<StoredExamResult>))
    .catch(() => null);
}

function normalizeLoadedRecord(raw: Partial<StoredExamResult>) {
  return {
    id: sanitizeId(raw.id) || "",
    userId: sanitizeUserId(String(raw.userId ?? "")),
    createdAt: String(raw.createdAt ?? new Date(0).toISOString()),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? new Date(0).toISOString()),
    planId: normalizeNullableId(raw.planId),
    planTitle: normalizeNullableText(raw.planTitle, 160),
    examName: normalizeText(raw.examName, 180),
    boardName: normalizeNullableText(raw.boardName, 120),
    examDate: normalizeDateString(raw.examDate),
    score: normalizeNullableNumber(raw.score, 0, 1000),
    cutoffScore: normalizeNullableNumber(raw.cutoffScore, 0, 1000),
    rankPosition: normalizeNullableInt(raw.rankPosition, 1, 10_000_000),
    totalParticipants: normalizeNullableInt(raw.totalParticipants, 1, 10_000_000),
    totalApproved: normalizeNullableInt(raw.totalApproved, 1, 10_000_000),
    status: normalizeStatus(raw.status),
    notes: normalizeNullableText(raw.notes, 3000),
    sourceFile:
      raw.sourceFile && typeof raw.sourceFile === "object"
        ? {
            fileName: sanitizeFileName(raw.sourceFile.fileName) || "",
            originalName: sanitizeDownloadName(raw.sourceFile.originalName || "prova.pdf"),
            mimeType: String(raw.sourceFile.mimeType || "application/pdf"),
            sizeBytes: normalizeNullableInt(raw.sourceFile.sizeBytes, 0, 100_000_000) ?? 0
          }
        : null
  } satisfies StoredExamResult;
}

async function writeSourceFile(params: {
  userId: string;
  examResultId: string;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const extension = extensionFor(params.originalName, params.mimeType);
  const fileName = `${params.examResultId}.${extension}`;
  await fs.mkdir(userExamResultFilesDir(params.userId), { recursive: true });
  await fs.writeFile(examResultSourceFilePath(params.userId, fileName), params.bytes);
  return {
    fileName,
    originalName: sanitizeDownloadName(params.originalName),
    mimeType: params.mimeType || "application/octet-stream",
    sizeBytes: params.bytes.length
  };
}

function normalizeText(value: string | null | undefined, maxLength: number) {
  const parsed = String(value ?? "").trim().replace(/\s+/g, " ");
  return parsed.slice(0, maxLength);
}

function normalizeNullableText(value: string | null | undefined, maxLength: number) {
  const parsed = normalizeText(value, maxLength);
  return parsed ? parsed : null;
}

function normalizeNullableNumber(value: number | null | undefined, min: number, max: number) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

function normalizeNullableInt(value: number | null | undefined, min: number, max: number) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeDateString(value: string | null | undefined) {
  const parsed = String(value ?? "").trim();
  if (!parsed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return null;
  return parsed;
}

function normalizeStatus(value: string | null | undefined): StoredExamResultStatus {
  const parsed = String(value ?? "").trim().toUpperCase();
  if (parsed === "APPROVED") return "APPROVED";
  if (parsed === "CLASSIFIED") return "CLASSIFIED";
  if (parsed === "NOT_CLASSIFIED") return "NOT_CLASSIFIED";
  return "PENDING_RESULT";
}

function normalizeNullableId(value: string | null | undefined) {
  const parsed = String(value ?? "").trim();
  if (!parsed) return null;
  return sanitizeId(parsed);
}

function sanitizeId(id: string | null | undefined) {
  const value = String(id ?? "").trim();
  if (!/^[a-zA-Z0-9-]{8,120}$/.test(value)) return null;
  return value;
}

function sanitizeFileName(fileName: string | null | undefined) {
  const base = path.posix.basename(String(fileName ?? ""));
  if (!base || base === "." || base === "..") return null;
  return base;
}

function sanitizeDownloadName(fileName: string) {
  return fileName.replace(/[\r\n"]/g, "_").slice(0, 180) || "arquivo";
}

function sanitizeUserId(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function userExamResultDir(userId: string) {
  return path.join(EXAM_RESULTS_ROOT, userId);
}

function examResultPath(userId: string, id: string) {
  return path.join(userExamResultDir(userId), `${id}.json`);
}

function userExamResultFilesDir(userId: string) {
  return path.join(EXAM_RESULT_FILES_ROOT, userId);
}

function examResultSourceFilePath(userId: string, fileName: string) {
  return path.join(userExamResultFilesDir(userId), fileName);
}

function extensionFor(originalName: string, mimeType: string) {
  const ext = path.extname(originalName || "").toLowerCase().replace(".", "");
  if (ext && /^[a-z0-9]{1,8}$/.test(ext)) return ext;
  if (mimeType === "application/pdf") return "pdf";
  return "bin";
}
