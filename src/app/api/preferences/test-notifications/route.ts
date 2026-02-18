import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { sendDiscordText, sendEmailText, sendTelegramText } from "@/lib/notifications/channels";
import { prisma } from "@/lib/prisma";

type TestBody = {
  channel?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
};

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as TestBody;
  const channel = String(body.channel ?? "")
    .trim()
    .toLowerCase();
  if (!["email", "telegram", "discord"].includes(channel)) {
    return NextResponse.json({ ok: false, reason: "invalid_channel" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      notifyTelegramBotToken: true,
      notifyTelegramChatId: true,
      notifyDiscordWebhookUrl: true
    }
  });
  if (!user) {
    return NextResponse.json({ ok: false, reason: "user_not_found" }, { status: 404 });
  }

  const firstName = user.name?.trim().split(/\s+/)[0] || "Aluno";
  const text = `Olá, ${firstName}! Este é um teste de notificação do Gabarita.`;

  if (channel === "email") {
    const result = await sendEmailText({
      to: user.email,
      subject: "[Gabarita] Teste de notificação por e-mail",
      text
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true, channel });
  }

  if (channel === "telegram") {
    const botToken = String(body.telegramBotToken ?? "").trim() || (user.notifyTelegramBotToken ?? "");
    const chatId = String(body.telegramChatId ?? "").trim() || (user.notifyTelegramChatId ?? "");
    const result = await sendTelegramText({
      botToken,
      chatId,
      text
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true, channel });
  }

  const webhookUrl = String(body.discordWebhookUrl ?? "").trim() || (user.notifyDiscordWebhookUrl ?? "");
  const result = await sendDiscordText({
    webhookUrl,
    text
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, channel });
}
