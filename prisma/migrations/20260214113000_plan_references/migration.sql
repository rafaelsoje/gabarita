CREATE TABLE "PlanReferenceLink" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanReferenceLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanReferenceFile" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "scanStatus" "AttachmentScanStatus" NOT NULL DEFAULT 'CLEAN',
    "scannedAt" TIMESTAMP(3),
    "scanResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanReferenceFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanReferenceLink_planId_createdAt_idx" ON "PlanReferenceLink"("planId", "createdAt");
CREATE INDEX "PlanReferenceFile_planId_createdAt_idx" ON "PlanReferenceFile"("planId", "createdAt");
CREATE INDEX "PlanReferenceFile_scanStatus_createdAt_idx" ON "PlanReferenceFile"("scanStatus", "createdAt");

ALTER TABLE "PlanReferenceLink"
  ADD CONSTRAINT "PlanReferenceLink_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanReferenceFile"
  ADD CONSTRAINT "PlanReferenceFile_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
