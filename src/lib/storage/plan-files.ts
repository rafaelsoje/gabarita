import fs from "node:fs/promises";
import path from "node:path";

const PRIVATE_PLAN_FILES_DIR = path.join(process.cwd(), "storage", "plan-files");
const LEGACY_PLAN_FILES_DIR = path.join(process.cwd(), "public", "uploads", "plan-files");

function sanitizeFileName(fileName: string) {
  const safe = path.posix.basename(fileName || "");
  if (!safe || safe === "." || safe === "..") return null;
  return safe;
}

function sanitizeUserId(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function privatePathForUser(userId: string, fileName: string) {
  return path.join(PRIVATE_PLAN_FILES_DIR, sanitizeUserId(userId), fileName);
}

function legacyPathFor(fileName: string) {
  return path.join(LEGACY_PLAN_FILES_DIR, fileName);
}

export function planFileContentUrl(fileId: string, download = false) {
  return download ? `/api/plans/files/${fileId}?download=1` : `/api/plans/files/${fileId}`;
}

export async function writePlanFile(userId: string, fileName: string, buffer: Buffer) {
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) {
    throw new Error("Invalid file name");
  }

  const dir = path.join(PRIVATE_PLAN_FILES_DIR, sanitizeUserId(userId));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(privatePathForUser(userId, safeFileName), buffer);
}

export async function readPlanFile(userId: string, fileName: string) {
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) return null;

  const existingPath = await resolvePlanFilePath(userId, safeFileName);
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

export async function deletePlanFile(userId: string, fileName: string | null | undefined) {
  const safeFileName = sanitizeFileName(fileName ?? "");
  if (!safeFileName) return;

  await fs.unlink(privatePathForUser(userId, safeFileName)).catch(() => undefined);
  await fs.unlink(path.join(PRIVATE_PLAN_FILES_DIR, safeFileName)).catch(() => undefined);
  await fs.unlink(legacyPathFor(safeFileName)).catch(() => undefined);
}

export async function deletePlanFiles(userId: string, fileNames: Array<string | null | undefined>) {
  const unique = [
    ...new Set(
      fileNames.filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  ];
  for (const fileName of unique) {
    await deletePlanFile(userId, fileName);
  }
}

export async function resolvePlanFilePath(userId: string, fileName: string) {
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) return null;

  const privatePath = privatePathForUser(userId, safeFileName);
  try {
    await fs.access(privatePath);
    return privatePath;
  } catch {}

  const legacyPrivatePath = path.join(PRIVATE_PLAN_FILES_DIR, safeFileName);
  try {
    await fs.access(legacyPrivatePath);
    return legacyPrivatePath;
  } catch {}

  const legacyPath = legacyPathFor(safeFileName);
  try {
    await fs.access(legacyPath);
    return legacyPath;
  } catch {
    return null;
  }
}
