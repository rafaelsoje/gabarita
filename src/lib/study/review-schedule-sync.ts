import { StudyCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNextReviewDate } from "@/lib/study/review-schedule";

type SessionSlice = {
  category: StudyCategory;
  startedAt: Date;
  questionsCorrect: number;
  questionsWrong: number;
};

function computeTopicSnapshot(sessions: SessionSlice[]) {
  if (sessions.length === 0) return null;

  const lastStudyAt = sessions[0].startedAt;
  let reviewCount = sessions[0].category === StudyCategory.REVIEW ? 1 : 0;
  let solved = sessions[0].questionsCorrect + sessions[0].questionsWrong;
  let accuracy = solved > 0 ? (sessions[0].questionsCorrect / solved) * 100 : 70;

  let next = getNextReviewDate({
    studiedAt: lastStudyAt,
    accuracyPercent: accuracy,
    previousReviews: reviewCount
  });

  for (let index = 1; index < sessions.length; index += 1) {
    const session = sessions[index];
    if (session.category !== StudyCategory.REVIEW) continue;

    reviewCount += 1;
    solved = session.questionsCorrect + session.questionsWrong;
    accuracy = solved > 0 ? (session.questionsCorrect / solved) * 100 : 70;
    next = getNextReviewDate({
      studiedAt: lastStudyAt,
      accuracyPercent: accuracy,
      previousReviews: reviewCount
    });
  }

  return {
    lastStudyAt,
    nextReviewAt: next.nextReviewAt,
    intervalDays: next.intervalDays,
    reviewCount
  };
}

export async function recomputeTopicReviewSchedule(userId: string, topicId: string | null | undefined) {
  const safeTopicId = String(topicId ?? "").trim();
  if (!safeTopicId) return;

  try {
    const sessions = await prisma.studySession.findMany({
      where: {
        userId,
        topicId: safeTopicId,
        topic: {
          is: {
            subject: {
              plan: {
                isArchived: false
              }
            }
          }
        }
      },
      orderBy: { startedAt: "desc" },
      select: {
        category: true,
        startedAt: true,
        questionsCorrect: true,
        questionsWrong: true
      }
    });

    const snapshot = computeTopicSnapshot(sessions);
    if (!snapshot) {
      await prisma.topicReviewSchedule.deleteMany({
        where: { userId, topicId: safeTopicId }
      });
      return;
    }

    await prisma.topicReviewSchedule.upsert({
      where: {
        userId_topicId: {
          userId,
          topicId: safeTopicId
        }
      },
      create: {
        userId,
        topicId: safeTopicId,
        lastStudyAt: snapshot.lastStudyAt,
        nextReviewAt: snapshot.nextReviewAt,
        reviewCount: snapshot.reviewCount,
        intervalDays: snapshot.intervalDays
      },
      update: {
        lastStudyAt: snapshot.lastStudyAt,
        nextReviewAt: snapshot.nextReviewAt,
        reviewCount: snapshot.reviewCount,
        intervalDays: snapshot.intervalDays
      }
    });
  } catch (error) {
    if (hasMissingReviewScheduleSchema(error)) return;
    throw error;
  }
}

function hasMissingReviewScheduleSchema(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("TopicReviewSchedule") ||
    error.message.includes("topicReviewSchedule") ||
    error.message.includes("Unknown argument")
  );
}
