import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/auth/schemas";
import { generateRawToken } from "@/lib/auth/tokens";
import { hashToken } from "@/lib/auth/password";
import { isTrustedAuthRequest } from "@/lib/auth/csrf";
import { checkRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";
import { sendEmailText } from "@/lib/notifications/channels";
import { buildPasswordResetEmailHtml } from "@/lib/notifications/email-templates";

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

    const firstName = user.name?.trim().split(/\s+/)[0] || "Aluno";
    const appOrigin = env.appUrl.trim() || new URL(request.url).origin;
    const resetUrl = `${appOrigin.replace(/\/+$/, "")}/redefinir-senha?token=${encodeURIComponent(rawToken)}`;
    const textLines = [
      `Olá, ${firstName}.`,
      "",
      "Recebemos uma solicitação para redefinir sua senha no Gabarita.",
      `Use o link a seguir (válido por 30 minutos): ${resetUrl}`,
      "",
      "Se você não solicitou, ignore este e-mail."
    ];
    const mail = await sendEmailText({
      to: user.email,
      subject: "[Gabarita] Redefinição de senha",
      text: textLines.join("\n"),
      html: buildPasswordResetEmailHtml({
        firstName,
        resetUrl,
        expiresInMinutes: 30
      })
    });
    if (!mail.ok) {
      // Keep a non-enumerating response contract, but surface the issue in server logs.
      console.error("forgot_password_email_error", mail.reason);
    }

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
