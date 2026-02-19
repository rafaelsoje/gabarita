-- CreateEnum
CREATE TYPE "ConcursoStatus" AS ENUM ('OPEN', 'PLANNED');

-- CreateTable
CREATE TABLE "ConcursoListing" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "state" TEXT,
    "scope" TEXT,
    "status" "ConcursoStatus" NOT NULL,
    "registrationStart" TIMESTAMP(3),
    "registrationEnd" TIMESTAMP(3),
    "expectedNoticeDate" TIMESTAMP(3),
    "officialUrl" TEXT,
    "sourceUrl" TEXT,
    "summary" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConcursoListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConcursoListing_source_externalId_key" ON "ConcursoListing"("source", "externalId");

-- CreateIndex
CREATE INDEX "ConcursoListing_status_state_idx" ON "ConcursoListing"("status", "state");

-- CreateIndex
CREATE INDEX "ConcursoListing_updatedAt_idx" ON "ConcursoListing"("updatedAt");
