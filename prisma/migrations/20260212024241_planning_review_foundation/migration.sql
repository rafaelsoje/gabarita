-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "studyWeekdayMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "studyWeekendMinutes" INTEGER NOT NULL DEFAULT 180;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "importance" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "knowledgeLevel" INTEGER NOT NULL DEFAULT 50;
