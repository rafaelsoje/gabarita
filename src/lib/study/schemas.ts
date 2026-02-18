import { StudyCategory, TopicStatus } from "@prisma/client";
import { z } from "zod";

const positiveInt = z.number().int().nonnegative();

export const createPlanSchema = z.object({
  title: z.string().trim().min(2).max(160),
  examDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional()
});

export const updatePlanSchema = createPlanSchema.partial();

export const createSubjectSchema = z.object({
  planId: z.string().min(1),
  name: z.string().trim().min(2).max(160),
  color: z.string().trim().max(32).optional(),
  position: positiveInt.optional()
});

export const updateSubjectSchema = createSubjectSchema.omit({ planId: true }).partial();

export const createTopicSchema = z.object({
  subjectId: z.string().min(1),
  title: z.string().trim().min(2).max(220),
  description: z.string().trim().max(4000).optional(),
  status: z.nativeEnum(TopicStatus).optional(),
  position: positiveInt.optional(),
  estimatedMinutes: positiveInt.optional(),
  completedAt: z.coerce.date().optional()
});

export const updateTopicSchema = createTopicSchema.omit({ subjectId: true }).partial();

export const createStudySessionSchema = z.object({
  planId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  topicId: z.string().min(1).optional(),
  category: z.nativeEnum(StudyCategory).optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
  durationMinutes: positiveInt.optional(),
  questionsCorrect: positiveInt.optional(),
  questionsWrong: positiveInt.optional(),
  questionsBlank: positiveInt.optional(),
  pagesRead: positiveInt.optional(),
  videoMinutes: positiveInt.optional(),
  notes: z.string().trim().max(4000).optional(),
  reviewScheduleEnabled: z.boolean().optional(),
  reviewScheduleDays: z.array(z.number().int().positive().max(3650)).max(20).optional()
});

export const updateStudySessionSchema = createStudySessionSchema.partial().extend({
  planId: z.string().min(1).nullable().optional(),
  subjectId: z.string().min(1).nullable().optional(),
  topicId: z.string().min(1).nullable().optional()
});
