export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3001",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  openAiResponsesUrl: process.env.OPENAI_RESPONSES_URL ?? "https://api.openai.com/v1/responses",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.1:8b",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseIntSafe(process.env.SMTP_PORT, 587),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "",
  smtpTransport: normalizeSmtpTransport(process.env.SMTP_TRANSPORT),
  sendmailPath: process.env.SENDMAIL_PATH ?? "/usr/sbin/sendmail",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramApiBase: process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org",
  allowResetTokenInResponse: parseBoolean(process.env.ALLOW_RESET_TOKEN_IN_RESPONSE),
  secretsEncryptionKey: process.env.SECRETS_ENCRYPTION_KEY ?? "",
  enableAttachmentScan: parseBoolean(process.env.ENABLE_ATTACHMENT_SCAN),
  enforceCleanAttachmentAccess: parseBoolean(
    process.env.ENFORCE_CLEAN_ATTACHMENT_ACCESS
  )
};

export function assertEnv() {
  const missing: string[] = [];
  if (!env.databaseUrl) missing.push("DATABASE_URL");
  if (!env.jwtAccessSecret) missing.push("JWT_ACCESS_SECRET");
  if (!env.jwtRefreshSecret) missing.push("JWT_REFRESH_SECRET");

  if (missing.length > 0) {
    throw new Error(`Variáveis ausentes: ${missing.join(", ")}`);
  }
}

function parseBoolean(value: string | undefined) {
  if (!value) return false;
  return value.trim().toLowerCase() === "true";
}

function parseIntSafe(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSmtpTransport(value: string | undefined) {
  const parsed = (value ?? "auto").trim().toLowerCase();
  if (parsed === "smtp") return "smtp" as const;
  if (parsed === "sendmail") return "sendmail" as const;
  return "auto" as const;
}
