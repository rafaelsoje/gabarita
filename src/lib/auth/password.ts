import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH =
  "$2a$12$PsiIhu2sRj/7BDzaj/GK5.l5WY1EdRTvegItPxTP0KLDQ15m6KkFy";

export function hashPassword(rawPassword: string) {
  return bcrypt.hash(rawPassword, SALT_ROUNDS);
}

export function comparePassword(rawPassword: string, passwordHash: string) {
  return bcrypt.compare(rawPassword, passwordHash);
}

export function comparePasswordAgainstDummyHash(rawPassword: string) {
  return bcrypt.compare(rawPassword, DUMMY_PASSWORD_HASH);
}

export function hashToken(rawToken: string) {
  return bcrypt.hash(rawToken, 10);
}

export function compareToken(rawToken: string, tokenHash: string) {
  return bcrypt.compare(rawToken, tokenHash);
}
