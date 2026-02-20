import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import { unsealSecret } from "@/lib/security/secrets";

function buildSmtpTransport() {
  if (!env.smtpHost) return null;
  const hasAuth = Boolean(env.smtpUser && env.smtpPass);
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    ...(hasAuth
      ? {
          auth: {
            user: env.smtpUser,
            pass: env.smtpPass
          }
        }
      : {})
  });
}

function buildSendmailTransport() {
  return nodemailer.createTransport({
    sendmail: true,
    newline: "unix",
    path: env.sendmailPath || "/usr/sbin/sendmail"
  });
}

function buildEmailTransport() {
  if (env.smtpTransport === "smtp") return buildSmtpTransport();
  if (env.smtpTransport === "sendmail") return buildSendmailTransport();
  return buildSmtpTransport() ?? buildSendmailTransport();
}

export async function sendEmailText(params: { to: string; subject: string; text: string; html?: string }) {
  const transporter = buildEmailTransport();
  if (!transporter) return { ok: false as const, reason: "smtp_not_configured" };
  const from = env.smtpFrom || env.smtpUser;
  if (!from) return { ok: false as const, reason: "smtp_from_missing" };

  try {
    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {})
    });
    return { ok: true as const, reason: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_error";
    return { ok: false as const, reason: `smtp_error:${message}`.slice(0, 180) };
  }
}

export async function sendTelegramText(params: { botToken?: string | null; chatId: string; text: string }) {
  const token = unsealSecret(params.botToken) || env.telegramBotToken.trim();
  const chatId = unsealSecret(params.chatId);
  if (!token) return { ok: false as const, reason: "telegram_token_missing" };
  if (!chatId) return { ok: false as const, reason: "telegram_chat_id_missing" };
  const base = env.telegramApiBase.trim().replace(/\/+$/, "");
  if (!base) return { ok: false as const, reason: "telegram_api_base_missing" };

  try {
    const response = await fetch(`${base}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: params.text
      })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { description?: string } | null;
      return {
        ok: false as const,
        reason: `telegram_http_${response.status}:${payload?.description ?? "error"}`.slice(0, 180)
      };
    }
    return { ok: true as const, reason: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_error";
    return { ok: false as const, reason: `telegram_error:${message}`.slice(0, 180) };
  }
}

export async function sendDiscordText(params: { webhookUrl: string; text: string }) {
  const webhookUrl = unsealSecret(params.webhookUrl);
  if (!isTrustedDiscordWebhookUrl(webhookUrl)) {
    return { ok: false as const, reason: "discord_webhook_invalid" };
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: params.text })
    });
    if (!response.ok) {
      return { ok: false as const, reason: `discord_http_${response.status}` };
    }
    return { ok: true as const, reason: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_error";
    return { ok: false as const, reason: `discord_error:${message}`.slice(0, 180) };
  }
}

function isTrustedDiscordWebhookUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  const isDiscordHost = host === "discord.com" || host === "discordapp.com";
  if (!isDiscordHost) return false;

  return parsed.pathname.startsWith("/api/webhooks/");
}
