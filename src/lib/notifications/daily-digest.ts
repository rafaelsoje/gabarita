import { sendDiscordText, sendEmailText, sendTelegramText } from "@/lib/notifications/channels";
import { buildDailyDigestEmailHtml } from "@/lib/notifications/email-templates";

export type DailyNotificationItem = {
  title: string;
  description: string;
  count: number;
  href: string;
};

export type DailyDigestUser = {
  name: string | null;
  email: string;
  notifyEmailEnabled: boolean;
  notifyTelegramEnabled: boolean;
  notifyDiscordEnabled: boolean;
  notifyTelegramBotToken: string | null;
  notifyTelegramChatId: string | null;
  notifyDiscordWebhookUrl: string | null;
};

type DispatchInput = {
  user: DailyDigestUser;
  items: DailyNotificationItem[];
  total: number;
  appUrl: string;
  planScopeLabel: string;
};

export async function dispatchDailyDigest(input: DispatchInput) {
  if (input.total <= 0) return { sentAny: false };

  const firstName = (input.user.name ?? "").trim().split(/\s+/)[0] || "Aluno";
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date());
  const summaryLine = `Você tem ${input.total} pendência(s) de estudo hoje em ${input.planScopeLabel}.`;

  const lines = [
    `Olá, ${firstName}!`,
    "",
    summaryLine,
    "",
    ...input.items.map((item) => `• ${item.title}: ${item.description}`),
    "",
    `Abrir plataforma: ${input.appUrl}/`,
    "Bons estudos."
  ];
  const plainText = lines.join("\n");
  const html = buildDailyDigestEmailHtml({
    firstName,
    appUrl: input.appUrl,
    dateLabel,
    summaryLine,
    planScopeLabel: input.planScopeLabel,
    items: input.items
  });

  const sentResults = await Promise.all([
    sendByEmailIfEnabled(input.user, `[Gabarita] Plano de hoje • ${dateLabel}`, plainText, html),
    sendByTelegramIfEnabled(input.user, plainText),
    sendByDiscordIfEnabled(input.user, plainText)
  ]);

  return { sentAny: sentResults.some(Boolean) };
}

async function sendByEmailIfEnabled(user: DailyDigestUser, subject: string, text: string, html: string) {
  if (!user.notifyEmailEnabled) return false;
  const result = await sendEmailText({ to: user.email, subject, text, html });
  return result.ok;
}

async function sendByTelegramIfEnabled(user: DailyDigestUser, text: string) {
  if (!user.notifyTelegramEnabled) return false;
  const result = await sendTelegramText({
    botToken: user.notifyTelegramBotToken ?? "",
    chatId: user.notifyTelegramChatId ?? "",
    text
  });
  return result.ok;
}

async function sendByDiscordIfEnabled(user: DailyDigestUser, text: string) {
  if (!user.notifyDiscordEnabled) return false;
  const result = await sendDiscordText({ webhookUrl: user.notifyDiscordWebhookUrl ?? "", text });
  return result.ok;
}
