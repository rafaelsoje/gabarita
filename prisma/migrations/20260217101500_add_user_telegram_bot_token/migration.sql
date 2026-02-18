ALTER TABLE "User"
ADD COLUMN "notifyTelegramBotToken" TEXT;

ALTER TABLE "User"
DROP CONSTRAINT IF EXISTS "user_notify_telegram_bot_token_encrypted_chk";

ALTER TABLE "User"
ADD CONSTRAINT "user_notify_telegram_bot_token_encrypted_chk"
CHECK ("notifyTelegramBotToken" IS NULL OR "notifyTelegramBotToken" ~ '^enc:v1:');
