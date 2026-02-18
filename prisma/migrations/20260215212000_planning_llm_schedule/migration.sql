-- CreateTable
CREATE TABLE "PlanStudyPlanConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanStudyPlanConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanStudyPlanDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weekdayLabel" TEXT NOT NULL,
    "subjectId" TEXT,
    "subjectName" TEXT NOT NULL,
    "topicId" TEXT,
    "topicTitle" TEXT,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "questionsTarget" INTEGER NOT NULL DEFAULT 0,
    "reviewsTarget" INTEGER NOT NULL DEFAULT 0,
    "mockExamsTarget" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'FALLBACK',
    "llmModel" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanStudyPlanDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanStudyPlanConfig_planId_key" ON "PlanStudyPlanConfig"("planId");

-- CreateIndex
CREATE INDEX "PlanStudyPlanConfig_userId_updatedAt_idx" ON "PlanStudyPlanConfig"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "PlanStudyPlanDay_userId_date_idx" ON "PlanStudyPlanDay"("userId", "date");

-- CreateIndex
CREATE INDEX "PlanStudyPlanDay_planId_date_position_idx" ON "PlanStudyPlanDay"("planId", "date", "position");

-- AddForeignKey
ALTER TABLE "PlanStudyPlanConfig" ADD CONSTRAINT "PlanStudyPlanConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStudyPlanConfig" ADD CONSTRAINT "PlanStudyPlanConfig_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStudyPlanDay" ADD CONSTRAINT "PlanStudyPlanDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStudyPlanDay" ADD CONSTRAINT "PlanStudyPlanDay_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
