CREATE TABLE "TopicReviewSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "lastStudyAt" TIMESTAMP(3) NOT NULL,
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "intervalDays" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicReviewSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TopicReviewSchedule_userId_topicId_key" ON "TopicReviewSchedule"("userId", "topicId");
CREATE INDEX "TopicReviewSchedule_userId_nextReviewAt_idx" ON "TopicReviewSchedule"("userId", "nextReviewAt");
CREATE INDEX "TopicReviewSchedule_topicId_nextReviewAt_idx" ON "TopicReviewSchedule"("topicId", "nextReviewAt");

ALTER TABLE "TopicReviewSchedule" ADD CONSTRAINT "TopicReviewSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicReviewSchedule" ADD CONSTRAINT "TopicReviewSchedule_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
