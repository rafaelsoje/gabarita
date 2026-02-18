-- CreateEnum
CREATE TYPE "ExamBoardStyle" AS ENUM ('MULTIPLE_CHOICE_5', 'TRUE_FALSE_2', 'ASSERTION_COMBINATION_5');

-- CreateTable
CREATE TABLE "ExamBoardProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "style" "ExamBoardStyle" NOT NULL DEFAULT 'MULTIPLE_CHOICE_5',
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamBoardProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamBoardProfile_userId_normalizedName_key" ON "ExamBoardProfile"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "ExamBoardProfile_normalizedName_idx" ON "ExamBoardProfile"("normalizedName");

-- CreateIndex
CREATE INDEX "ExamBoardProfile_userId_idx" ON "ExamBoardProfile"("userId");

-- AddForeignKey
ALTER TABLE "ExamBoardProfile" ADD CONSTRAINT "ExamBoardProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
