import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type UploadKind = "avatars" | "plans" | "topic-files";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

function getUploadDir(kind: UploadKind) {
  return path.join(UPLOADS_ROOT, kind);
}

function publicUrlFor(kind: UploadKind, fileName: string) {
  return `/uploads/${kind}/${fileName}`;
}

function resolveUploadPath(publicUrl: string, kind: UploadKind) {
  const expectedPrefix = `/uploads/${kind}/`;
  if (!publicUrl.startsWith(expectedPrefix)) return null;

  const fileName = path.posix.basename(publicUrl);
  if (!fileName || fileName === "." || fileName === "..") return null;

  const dir = getUploadDir(kind);
  const absolutePath = path.join(dir, fileName);
  if (!absolutePath.startsWith(`${dir}${path.sep}`) && absolutePath !== dir) return null;

  return { absolutePath, fileName };
}

export async function saveUploadBuffer(params: {
  kind: UploadKind;
  prefix: string;
  extension: string;
  buffer: Buffer;
}) {
  const { kind, prefix, extension, buffer } = params;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "file";
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "bin";
  const fileName = `${safePrefix}-${randomUUID()}.${safeExt}`;
  const dir = getUploadDir(kind);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), buffer);

  return {
    fileName,
    publicUrl: publicUrlFor(kind, fileName)
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
