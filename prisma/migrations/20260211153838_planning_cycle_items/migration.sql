-- CreateTable
CREATE TABLE "PlanCycleItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 60,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanCycleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanCycleItem_planId_position_idx" ON "PlanCycleItem"("planId", "position");

-- CreateIndex
CREATE INDEX "PlanCycleItem_subjectId_idx" ON "PlanCycleItem"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanCycleItem_planId_subjectId_key" ON "PlanCycleItem"("planId", "subjectId");

-- AddForeignKey
ALTER TABLE "PlanCycleItem" ADD CONSTRAINT "PlanCycleItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanCycleItem" ADD CONSTRAINT "PlanCycleItem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
