ALTER TABLE "ExamBoardProfile"
ADD COLUMN IF NOT EXISTS "styles" "ExamBoardStyle"[] NOT NULL DEFAULT ARRAY[]::"ExamBoardStyle"[];

UPDATE "ExamBoardProfile"
SET "styles" = ARRAY["style"]
WHERE cardinality("styles") = 0;
