import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/auth/schemas";
import { generateRawToken } from "@/lib/auth/tokens";
import { hashToken } from "@/lib/auth/password";
import { isTrustedAuthRequest } from "@/lib/auth/csrf";
import { checkRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  try {
    if (!isTrustedAuthRequest(request)) {
      return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
    }

    const ip = getClientIp(request);
    const ipRate = await checkRateLimit(`forgot:ip:${ip}`, 8, 60_000, { failClosed: true });
    if (!ipRate.allowed) {
      return NextResponse.json({ message: "Muitas tentativas. Tente novamente em 1 minuto." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Se o e-mail existir, enviaremos as instruções." });
    }

    const { email } = parsed.data;
    const emailRate = await checkRateLimit(`forgot:email:${email}:${ip}`, 5, 60_000, { failClosed: true });
    if (!emailRate.allowed) {
      return NextResponse.json({ message: "Se o e-mail existir, enviaremos as instruções." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ message: "Se o e-mail existir, enviaremos as instruções." });
    }

    const rawToken = `${user.id}.${generateRawToken(32)}`;
    const tokenHash = await hashToken(rawToken);

    await prisma.$transaction([
      prisma.passwordReset.updateMany({
        where: {
          userId: user.id,
          usedAt: null
        },
        data: {
          usedAt: new Date()
        }
      }),
      prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 1000 * 60 * 30)
        }
      })
    ]);

    return NextResponse.json({
      message: "Solicitação registrada. Verifique seu e-mail.",
      resetToken:
        process.env.NODE_ENV !== "production" && env.allowResetTokenInResponse
          ? rawToken
          : undefined
    });
  } catch {
    return NextResponse.json({ message: "Erro interno." }, { status: 500 });
  }
}
