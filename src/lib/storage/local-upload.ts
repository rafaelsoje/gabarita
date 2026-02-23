import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type UploadKind = "avatars" | "plans" | "topic-files";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

function sanitizeOwnerId(ownerId: string) {
  return ownerId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function getUploadDir(kind: UploadKind, ownerId?: string) {
  return ownerId
    ? path.join(UPLOADS_ROOT, kind, sanitizeOwnerId(ownerId))
    : path.join(UPLOADS_ROOT, kind);
}

function publicUrlFor(kind: UploadKind, fileName: string, ownerId?: string) {
  return ownerId
    ? `/uploads/${kind}/${sanitizeOwnerId(ownerId)}/${fileName}`
    : `/uploads/${kind}/${fileName}`;
}

function resolveUploadPath(publicUrl: string, kind: UploadKind) {
  const expectedPrefix = `/uploads/${kind}/`;
  if (!publicUrl.startsWith(expectedPrefix)) return null;

  const relative = publicUrl.slice(expectedPrefix.length);
  const parts = relative.split("/").filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;

  const ownerId = parts.length === 2 ? sanitizeOwnerId(parts[0]) : null;
  const fileName = path.posix.basename(parts[parts.length - 1]);
  if (!fileName || fileName === "." || fileName === "..") return null;

  const dir = getUploadDir(kind, ownerId || undefined);
  const absolutePath = path.join(dir, fileName);
  if (!absolutePath.startsWith(`${dir}${path.sep}`) && absolutePath !== dir) return null;

  return { absolutePath, fileName, ownerId };
}

export async function saveUploadBuffer(params: {
  kind: UploadKind;
  prefix: string;
  extension: string;
  buffer: Buffer;
  ownerId?: string;
}) {
  const { kind, prefix, extension, buffer, ownerId } = params;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "file";
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "bin";
  const fileName = `${safePrefix}-${randomUUID()}.${safeExt}`;
  const dir = getUploadDir(kind, ownerId);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), buffer);

  return {
    fileName,
    publicUrl: publicUrlFor(kind, fileName, ownerId)
  };
}

export async function deleteUploadByUrl(publicUrl: string | null | undefined, kind: UploadKind) {
  if (!publicUrl) return;
  const resolved = resolveUploadPath(publicUrl, kind);
  if (!resolved) return;
  await fs.unlink(resolved.absolutePath).catch(() => undefined);
}

export async function deleteUploadsByUrls(publicUrls: Array<string | null | undefined>, kind: UploadKind) {
  const uniqueUrls = [...new Set(publicUrls.filter((value): value is string => typeof value === "string" && value.length > 0))];
  for (const url of uniqueUrls) {
    await deleteUploadByUrl(url, kind);
  }
}
