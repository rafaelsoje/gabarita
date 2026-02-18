import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/auth/schemas";
import { compareToken, hashPassword } from "@/lib/auth/password";
import { isTrustedAuthRequest } from "@/lib/auth/csrf";
import { checkRateLimit, getClientIp } from "@/lib/auth/rate-limit";

export async function POST(request: Request) {
  try {
    if (!isTrustedAuthRequest(request)) {
      return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
    }

    const ip = getClientIp(request);
    const ipRate = await checkRateLimit(`reset:ip:${ip}`, 10, 60_000, { failClosed: true });
    if (!ipRate.allowed) {
      return NextResponse.json({ message: "Muitas tentativas. Tente novamente em 1 minuto." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });
    }

    const { token, password } = parsed.data;
    const tokenFingerprint = token.slice(0, 24);
    const tokenRate = await checkRateLimit(`reset:token:${tokenFingerprint}:${ip}`, 5, 60_000, { failClosed: true });
    if (!tokenRate.allowed) {
      return NextResponse.json({ message: "Token inválido ou expirado." }, { status: 400 });
    }

    const [userId] = token.split(".");
    if (!userId) {
      return NextResponse.json({ message: "Token inválido." }, { status: 400 });
    }

    const pendingResets = await prisma.passwordReset.findMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    let matchingReset: { id: string } | null = null;
    for (const reset of pendingResets) {
      const isMatch = await compareToken(token, reset.tokenHash);
      if (isMatch) {
        matchingReset = { id: reset.id };
        break;
      }
    }

    if (!matchingReset) {
      return NextResponse.json({ message: "Token inválido ou expirado." }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash }
      }),
      prisma.passwordReset.update({
        where: { id: matchingReset.id },
        data: { usedAt: new Date() }
      }),
      prisma.passwordReset.updateMany({
        where: {
          userId,
          usedAt: null
        },
        data: { usedAt: new Date() }
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);

    return NextResponse.json({ message: "Senha redefinida com sucesso." });
  } catch {
    return NextResponse.json({ message: "Erro interno." }, { status: 500 });
  }
}
