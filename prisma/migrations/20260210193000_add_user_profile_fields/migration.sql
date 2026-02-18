-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "birthDate" TIMESTAMP(3),
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT;
