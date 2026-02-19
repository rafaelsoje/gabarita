ALTER TABLE "User"
  ADD COLUMN "notifyConcursosEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyConcursosRegions" TEXT[] NOT NULL DEFAULT ARRAY['ALL', 'NACIONAL']::TEXT[],
  ADD COLUMN "notifyConcursosNotifiedOpen" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "notifyConcursosNotifiedLastDay" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
