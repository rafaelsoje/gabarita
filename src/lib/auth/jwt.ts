import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";

type TokenType = "access" | "refresh";

export type AuthJWTPayload = JWTPayload & {
  sub: string;
  email: string;
  type: TokenType;
};

const accessKey = new TextEncoder().encode(env.jwtAccessSecret);
const refreshKey = new TextEncoder().encode(env.jwtRefreshSecret);

export async function signAccessToken(sub: string, email: string) {
  return new SignJWT({ email, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(accessKey);
}

export async function signRefreshToken(sub: string, email: string) {
  return new SignJWT({ email, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(refreshKey);
}

export async function verifyAccessToken(token: string) {
  try {
    const verified = await jwtVerify(token, accessKey);
    const payload = verified.payload as AuthJWTPayload;
    if (payload.type !== "access") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string) {
  try {
    const verified = await jwtVerify(token, refreshKey);
    const payload = verified.payload as AuthJWTPayload;
    if (payload.type !== "refresh") return null;
    return payload;
  } catch {
    return null;
  }
}
