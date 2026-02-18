-- CreateEnum
CREATE TYPE "AttachmentScanStatus" AS ENUM ('PENDING', 'SCANNING', 'CLEAN', 'INFECTED', 'ERROR');

-- AlterTable
ALTER TABLE "TopicAttachment"
ADD COLUMN "scanStatus" "AttachmentScanStatus" NOT NULL DEFAULT 'CLEAN',
ADD COLUMN "scannedAt" TIMESTAMP(3),
ADD COLUMN "scanResult" TEXT;

-- CreateIndex
CREATE INDEX "TopicAttachment_scanStatus_createdAt_idx" ON "TopicAttachment"("scanStatus", "createdAt");
