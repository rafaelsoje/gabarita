ALTER TABLE "Question"
ADD COLUMN IF NOT EXISTS "subjectLabel" TEXT,
ADD COLUMN IF NOT EXISTS "topicLabel" TEXT,
ADD COLUMN IF NOT EXISTS "theme" TEXT,
ADD COLUMN IF NOT EXISTS "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "Question" q
SET "subjectLabel" = s."name"
FROM "Subject" s
WHERE q."subjectId" = s."id"
  AND (q."subjectLabel" IS NULL OR q."subjectLabel" = '');

UPDATE "Question" q
SET "topicLabel" = t."title"
FROM "Topic" t
WHERE q."topicId" = t."id"
  AND (q."topicLabel" IS NULL OR q."topicLabel" = '');

UPDATE "Question"
SET "theme" = COALESCE(NULLIF("topicLabel", ''), NULLIF("subjectLabel", ''), 'Geral')
WHERE "theme" IS NULL OR "theme" = '';

UPDATE "Question"
SET "keywords" = ARRAY[]::TEXT[]
WHERE "keywords" IS NULL;

CREATE INDEX IF NOT EXISTS "Question_subjectLabel_idx" ON "Question"("subjectLabel");
CREATE INDEX IF NOT EXISTS "Question_topicLabel_idx" ON "Question"("topicLabel");
CREATE INDEX IF NOT EXISTS "Question_theme_idx" ON "Question"("theme");
