import { prisma } from "@/lib/prisma";
import { deleteUploadByUrl } from "@/lib/storage/local-upload";
import { deletePlanFiles } from "@/lib/storage/plan-files";
import { deleteTopicFiles } from "@/lib/storage/topic-files";

function collectAttachmentUrlsFromPlan(plan: {
  subjects: Array<{ topics: Array<{ attachments: Array<{ fileName: string }> }> }>;
}) {
  return plan.subjects.flatMap((subject) =>
    subject.topics.flatMap((topic) =>
      topic.attachments.map((attachment) => attachment.fileName)
    )
  );
}

function collectAttachmentUrlsFromSubject(subject: {
  topics: Array<{ attachments: Array<{ fileName: string }> }>;
}) {
  return subject.topics.flatMap((topic) =>
    topic.attachments.map((attachment) => attachment.fileName)
  );
}

export async function deleteTopicWithFiles(params: { userId: string; topicId: string }) {
  const { userId, topicId } = params;
  const topic = await prisma.topic.findFirst({
    where: {
      id: topicId,
      subject: {
        plan: { userId }
      }
    },
    select: {
      id: true,
      attachments: {
        select: { fileName: true }
      }
    }
  });

  if (!topic) return false;

  const attachmentUrls = topic.attachments.map((attachment) => attachment.fileName);
  await prisma.topic.delete({ where: { id: topic.id } });
  await deleteTopicFiles(attachmentUrls);
  return true;
}

export async function deleteSubjectWithFiles(params: { userId: string; subjectId: string }) {
  const { userId, subjectId } = params;
  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      plan: { userId }
    },
    select: {
      id: true,
      topics: {
        select: {
          attachments: {
            select: { fileName: true }
          }
        }
      }
    }
  });

  if (!subject) return false;

  const attachmentUrls = collectAttachmentUrlsFromSubject(subject);
  await prisma.subject.delete({ where: { id: subject.id } });
  await deleteTopicFiles(attachmentUrls);
  return true;
}

export async function deletePlanWithFiles(params: { userId: string; planId: string }) {
  const { userId, planId } = params;
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId },
    select: {
      id: true,
      imageUrl: true,
      subjects: {
        select: {
          topics: {
            select: {
              attachments: {
                select: { fileName: true }
              }
            }
          }
        }
      },
      referenceFiles: {
        select: {
          fileName: true
        }
      }
    }
  });

  if (!plan) return false;

  const attachmentUrls = collectAttachmentUrlsFromPlan(plan);
  const referenceFileNames = plan.referenceFiles.map((file) => file.fileName);
  const planImageUrl = plan.imageUrl;

  await prisma.plan.delete({ where: { id: plan.id } });
  await deleteTopicFiles(attachmentUrls);
  await deletePlanFiles(referenceFileNames);
  await deleteUploadByUrl(planImageUrl, "plans");
  return true;
}
