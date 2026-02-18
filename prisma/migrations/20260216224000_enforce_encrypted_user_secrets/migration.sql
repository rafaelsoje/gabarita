-- In development we prefer safety over preserving plaintext secrets.
-- Clear any legacy non-encrypted values before enforcing constraints.
UPDATE "User"
SET "openAiApiKey" = NULL
WHERE "openAiApiKey" IS NOT NULL
  AND "openAiApiKey" !~ '^enc:v1:';

UPDATE "User"
SET "notifyTelegramChatId" = NULL
WHERE "notifyTelegramChatId" IS NOT NULL
  AND "notifyTelegramChatId" !~ '^enc:v1:';

UPDATE "User"
SET "notifyDiscordWebhookUrl" = NULL
WHERE "notifyDiscordWebhookUrl" IS NOT NULL
  AND "notifyDiscordWebhookUrl" !~ '^enc:v1:';

ALTER TABLE "User"
DROP CONSTRAINT IF EXISTS "user_open_ai_api_key_encrypted_chk";

ALTER TABLE "User"
ADD CONSTRAINT "user_open_ai_api_key_encrypted_chk"
CHECK ("openAiApiKey" IS NULL OR "openAiApiKey" ~ '^enc:v1:');

ALTER TABLE "User"
DROP CONSTRAINT IF EXISTS "user_notify_telegram_chat_id_encrypted_chk";

ALTER TABLE "User"
ADD CONSTRAINT "user_notify_telegram_chat_id_encrypted_chk"
CHECK ("notifyTelegramChatId" IS NULL OR "notifyTelegramChatId" ~ '^enc:v1:');

ALTER TABLE "User"
DROP CONSTRAINT IF EXISTS "user_notify_discord_webhook_url_encrypted_chk";

ALTER TABLE "User"
ADD CONSTRAINT "user_notify_discord_webhook_url_encrypted_chk"
CHECK ("notifyDiscordWebhookUrl" IS NULL OR "notifyDiscordWebhookUrl" ~ '^enc:v1:');
