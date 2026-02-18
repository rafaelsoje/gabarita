import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const SECRET_PREFIX = "enc:v1:";
const IV_BYTES = 12;
const prisma = new PrismaClient();

const applyChanges = process.argv.includes("--apply");
const dryRun = !applyChanges;

const encryptionKey = resolveKey();
if (!encryptionKey) {
  console.error("[reencrypt-user-secrets] SECRETS_ENCRYPTION_KEY não configurada.");
  process.exit(1);
}

console.log(`[reencrypt-user-secrets] modo: ${dryRun ? "dry-run" : "apply"}`);

try {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      openAiApiKey: true,
      notifyTelegramBotToken: true,
      notifyTelegramChatId: true,
      notifyDiscordWebhookUrl: true
    }
  });

  let affectedUsers = 0;
  let updatedFields = 0;

  for (const user of users) {
    const patch = {};

    const nextOpenAiApiKey = maybeEncrypt(user.openAiApiKey, encryptionKey);
    if (nextOpenAiApiKey.changed) patch.openAiApiKey = nextOpenAiApiKey.value;

    const nextTelegramBotToken = maybeEncrypt(user.notifyTelegramBotToken, encryptionKey);
    if (nextTelegramBotToken.changed) patch.notifyTelegramBotToken = nextTelegramBotToken.value;

    const nextTelegram = maybeEncrypt(user.notifyTelegramChatId, encryptionKey);
    if (nextTelegram.changed) patch.notifyTelegramChatId = nextTelegram.value;

    const nextDiscord = maybeEncrypt(user.notifyDiscordWebhookUrl, encryptionKey);
    if (nextDiscord.changed) patch.notifyDiscordWebhookUrl = nextDiscord.value;

    const fieldsChanged = Object.keys(patch).length;
    if (fieldsChanged === 0) continue;

    affectedUsers += 1;
    updatedFields += fieldsChanged;

    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: patch
      });
    }
  }

  console.log(
    `[reencrypt-user-secrets] ${dryRun ? "seriam" : "foram"} atualizados ${updatedFields} campo(s) em ${affectedUsers} usuário(s).`
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[reencrypt-user-secrets] erro: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

function resolveKey() {
  const raw = (process.env.SECRETS_ENCRYPTION_KEY ?? "").trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

function maybeEncrypt(value, key) {
  const plain = String(value ?? "").trim();
  if (!plain) return { changed: false, value };
  if (plain.startsWith(SECRET_PREFIX)) return { changed: false, value };

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sealed = `${SECRET_PREFIX}${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
  return { changed: true, value: sealed };
}
