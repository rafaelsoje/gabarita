-- CreateTable
CREATE TABLE "TopicAttachment" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicAttachment_topicId_createdAt_idx" ON "TopicAttachment"("topicId", "createdAt");

-- AddForeignKey
ALTER TABLE "TopicAttachment" ADD CONSTRAINT "TopicAttachment_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
