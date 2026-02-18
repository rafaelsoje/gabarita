import crypto from "crypto";

export function generateRawToken(size = 48) {
  return crypto.randomBytes(size).toString("hex");
}
