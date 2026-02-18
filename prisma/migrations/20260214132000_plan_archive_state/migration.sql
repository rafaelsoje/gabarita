ALTER TABLE "Plan"
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Plan_userId_isArchived_idx" ON "Plan"("userId", "isArchived");
