import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  comparePassword,
  comparePasswordAgainstDummyHash,
  hashToken
} from "@/lib/auth/password";
import { loginSchema } from "@/lib/auth/schemas";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { setAuthCookies } from "@/lib/auth/cookies";
import { isTrustedAuthRequest } from "@/lib/auth/csrf";
import { checkRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import { assertEnv } from "@/lib/env";

export async function POST(request: Request) {
  try {
    assertEnv();
    if (!isTrustedAuthRequest(request)) {
      return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
    }

    const ip = getClientIp(request);
    const ipRate = await checkRateLimit(`login:ip:${ip}`, 12, 60_000, { failClosed: true });
    if (!ipRate.allowed) {
      return NextResponse.json({ message: "Muitas tentativas. Tente novamente em 1 minuto." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Credenciais inválidas." }, { status: 400 });
    }

    const emailKey = parsed.data.email.trim().toLowerCase();
    const rate = await checkRateLimit(`login:email:${emailKey}:${ip}`, 8, 60_000, { failClosed: true });
    if (!rate.allowed) {
      return NextResponse.json({ message: "Muitas tentativas. Tente novamente em 1 minuto." }, { status: 429 });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await comparePasswordAgainstDummyHash(password);
      return NextResponse.json({ message: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ message: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const accessToken = await signAccessToken(user.id, user.email);
    const refreshToken = await signRefreshToken(user.id, user.email);
    const refreshTokenHash = await hashToken(refreshToken);

    await prisma.refreshToken.create({
      data: {
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    const response = NextResponse.json({ message: "Autenticado com sucesso." });
    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch {
    return NextResponse.json({ message: "Erro interno." }, { status: 500 });
  }
}
