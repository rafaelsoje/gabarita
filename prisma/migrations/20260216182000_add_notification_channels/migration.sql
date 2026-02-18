-- AlterTable
ALTER TABLE "User"
ADD COLUMN "notifyEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notifyTelegramEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notifyDiscordEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notifyTelegramChatId" TEXT,
ADD COLUMN "notifyDiscordWebhookUrl" TEXT,
ADD COLUMN "notifyDailySentAt" TIMESTAMP(3);
