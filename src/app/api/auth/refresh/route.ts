import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compareToken, hashToken } from "@/lib/auth/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/auth/jwt";
import { setAuthCookies } from "@/lib/auth/cookies";
import { isTrustedAuthRequest } from "@/lib/auth/csrf";
import { checkRateLimit, getClientIp } from "@/lib/auth/rate-limit";

export async function POST(request: Request) {
  try {
    if (!isTrustedAuthRequest(request)) {
      return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
    }

    const ip = getClientIp(request);
    const ipRate = await checkRateLimit(`refresh:ip:${ip}`, 30, 60_000, { failClosed: true });
    if (!ipRate.allowed) {
      return NextResponse.json({ message: "Muitas tentativas. Tente novamente em 1 minuto." }, { status: 429 });
    }

    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refresh_token")?.value;
    if (!refreshToken) {
      return NextResponse.json({ message: "Sem refresh token." }, { status: 401 });
    }

    const payload = await verifyRefreshToken(refreshToken);
    if (!payload?.sub || !payload.email) {
      return NextResponse.json({ message: "Refresh inválido." }, { status: 401 });
    }

    const activeTokens = await prisma.refreshToken.findMany({
      where: {
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    const matchingToken = await findMatchingToken(refreshToken, activeTokens);
    if (!matchingToken) {
      return NextResponse.json({ message: "Refresh não reconhecido." }, { status: 401 });
    }

    const nextAccessToken = await signAccessToken(payload.sub, payload.email);
    const nextRefreshToken = await signRefreshToken(payload.sub, payload.email);
    const nextRefreshTokenHash = await hashToken(nextRefreshToken);
    const rotated = await prisma.$transaction(async (tx) => {
      const revokeResult = await tx.refreshToken.updateMany({
        where: {
          id: matchingToken.id,
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      });
      if (revokeResult.count !== 1) return false;

      await tx.refreshToken.create({
        data: {
          userId: payload.sub,
          tokenHash: nextRefreshTokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });
      return true;
    });
    if (!rotated) {
      return NextResponse.json({ message: "Refresh não reconhecido." }, { status: 401 });
    }

    const response = NextResponse.json({ message: "Sessão renovada." });
    setAuthCookies(response, nextAccessToken, nextRefreshToken);
    return response;
  } catch {
    return NextResponse.json({ message: "Erro interno." }, { status: 500 });
  }
}

async function findMatchingToken(
  rawToken: string,
  activeTokens: Array<{ id: string; tokenHash: string }>
) {
  for (const token of activeTokens) {
    const ok = await compareToken(rawToken, token.tokenHash);
    if (ok) return token;
  }
  return null;
}
