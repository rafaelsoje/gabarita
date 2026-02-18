import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const SECRET_PREFIX = "enc:v1:";
const IV_BYTES = 12;

function resolveKey() {
  const raw = env.secretsEncryptionKey.trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

export function sealSecret(value: string | null | undefined) {
  const plain = String(value ?? "").trim();
  if (!plain) return "";
  if (plain.startsWith(SECRET_PREFIX)) return plain;

  const key = resolveKey();
  if (!key) {
    throw new Error("SECRETS_ENCRYPTION_KEY ausente: não é permitido salvar segredo em texto puro.");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${SECRET_PREFIX}${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function unsealSecret(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!raw.startsWith(SECRET_PREFIX)) return raw;

  const key = resolveKey();
  if (!key) return "";

  const payload = raw.slice(SECRET_PREFIX.length);
  const [ivPart, dataPart, tagPart] = payload.split(".");
  if (!ivPart || !dataPart || !tagPart) return "";

  try {
    const iv = Buffer.from(ivPart, "base64url");
    const data = Buffer.from(dataPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8").trim();
  } catch {
    return "";
  }
}
