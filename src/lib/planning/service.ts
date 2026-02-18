import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBancaFromPlanNotes } from "@/lib/questions/plan-notes";
import { generateStudyPlan, type PlanningDifficulty, type PlanningSubjectInput } from "@/lib/planning/generator";

type BuildPlanScheduleParams = {
  userId: string;
  planId: string;
  weekdayMinutes: number;
  weekendMinutes: number;
  subjects: PlanningSubjectInput[];
  restartFromToday?: boolean;
};

type StoredPlanConfig = {
  weekdayMinutes: number;
  weekendMinutes: number;
  board: string;
  examDateIso: string;
  subjects: PlanningSubjectInput[];
  llmUsed: boolean;
  llmModel: string | null;
  llmError: string | null;
  generatedAtIso: string;
};

export async function buildAndStorePlanSchedule(params: BuildPlanScheduleParams) {
  const plan = await prisma.plan.findFirst({
    where: { id: params.planId, userId: params.userId, isArchived: false },
    select: {
      id: true,
      notes: true,
      examDate: true
    }
  });
  if (!plan) throw new Error("Plano inválido.");
  if (!plan.examDate) throw new Error("Defina a data da prova no plano para gerar o planejamento.");

  const startDate = params.restartFromToday ? new Date() : new Date();
  const examDate = new Date(plan.examDate);
  if (toMidnight(examDate).getTime() < toMidnight(startDate).getTime()) {
    throw new Error("A data da prova já passou. Ajuste a data da prova para gerar novo ciclo.");
  }

  const userPrefs = (await loadUserLlmPreferences(params.userId)) ?? { openAiApiKey: null, openAiModel: null, llmProvider: null };
  const board = parseBancaFromPlanNotes(plan.notes) || "NÃO INFORMADA";
  const generation = await generateStudyPlan({
    startDate,
    examDate,
    weekdayMinutes: params.weekdayMinutes,
    weekendMinutes: params.weekendMinutes,
    board,
    subjects: params.subjects,
    openAiApiKey: userPrefs.openAiApiKey,
    openAiModel: userPrefs.openAiModel,
    llmProvider: normalizeLlmProvider(userPrefs.llmProvider)
  });

  if (generation.items.length === 0) throw new Error("Não foi possível gerar um cronograma com os dados informados.");

  const configPayload: StoredPlanConfig = {
    weekdayMinutes: params.weekdayMinutes,
    weekendMinutes: params.weekendMinutes,
    board,
    examDateIso: examDate.toISOString(),
    subjects: params.subjects,
    llmUsed: generation.usedLlm,
    llmModel: generation.llmModel,
    llmError: generation.llmError,
    generatedAtIso: new Date().toISOString()
  };

  await prisma.$transaction(async (tx) => {
    await tx.plan.update({
      where: { id: plan.id },
      data: {
        studyWeekdayMinutes: params.weekdayMinutes,
        studyWeekendMinutes: params.weekendMinutes
      }
    });

    await tx.planStudyPlanConfig.upsert({
      where: { planId: plan.id },
      update: {
        payload: configPayload as unknown as Prisma.InputJsonValue,
        userId: params.userId
      },
      create: {
        planId: plan.id,
        userId: params.userId,
        payload: configPayload as unknown as Prisma.InputJsonValue
      }
    });

    await tx.planStudyPlanDay.deleteMany({
      where: { planId: plan.id, userId: params.userId }
    });

    await tx.planStudyPlanDay.createMany({
      data: generation.items.map((item, index) => ({
        userId: params.userId,
        planId: plan.id,
        date: item.date,
        weekdayLabel: item.weekdayLabel,
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        plannedMinutes: item.plannedMinutes,
        questionsTarget: item.questionsTarget,
        reviewsTarget: item.reviewsTarget,
        mockExamsTarget: item.mockExamsTarget,
        source: generation.usedLlm ? "LLM" : "FALLBACK",
        llmModel: generation.llmModel,
        position: index
      }))
    });
  });

  return {
    usedLlm: generation.usedLlm,
    llmModel: generation.llmModel,
    llmError: generation.llmError,
    generatedCount: generation.items.length
  };
}

export async function restartPlanSchedule(userId: string, planId: string) {
  const config = await prisma.planStudyPlanConfig.findFirst({
    where: { userId, planId },
    select: { payload: true }
  });
  if (!config) throw new Error("Não existe configuração salva para este plano.");

  const parsed = parseStoredConfig(config.payload);
  return buildAndStorePlanSchedule({
    userId,
    planId,
    weekdayMinutes: parsed.weekdayMinutes,
    weekendMinutes: parsed.weekendMinutes,
    subjects: parsed.subjects,
    restartFromToday: true
  });
}

export async function clearPlanSchedule(userId: string, planId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.planStudyPlanDay.deleteMany({
      where: { userId, planId }
    });
    await tx.planStudyPlanConfig.deleteMany({
      where: { userId, planId }
    });
  });
}

export function parseStoredConfig(payload: Prisma.JsonValue): {
  weekdayMinutes: number;
  weekendMinutes: number;
  subjects: PlanningSubjectInput[];
} {
  const object = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const weekdayMinutes = normalizeInt((object as Record<string, unknown>).weekdayMinutes, 120, 0, 1440);
  const weekendMinutes = normalizeInt((object as Record<string, unknown>).weekendMinutes, 180, 0, 1440);
  const rawSubjects = Array.isArray((object as Record<string, unknown>).subjects)
    ? ((object as Record<string, unknown>).subjects as unknown[])
    : [];

  const subjects: PlanningSubjectInput[] = rawSubjects
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const item = raw as Record<string, unknown>;
      const subjectId = String(item.subjectId ?? "").trim();
      const subjectName = String(item.subjectName ?? "").trim();
      if (!subjectId || !subjectName) return null;
      const weight = normalizeInt(item.weight, 3, 1, 10);
      const difficulty = normalizeDifficulty(item.difficulty);
      const topicsRaw = Array.isArray(item.topics) ? item.topics : [];
      const topics = topicsRaw
        .map((topicRaw) => {
          if (!topicRaw || typeof topicRaw !== "object" || Array.isArray(topicRaw)) return null;
          const topicObj = topicRaw as Record<string, unknown>;
          const topicId = String(topicObj.topicId ?? "").trim();
          const topicTitle = String(topicObj.topicTitle ?? "").trim();
          if (!topicId || !topicTitle) return null;
          return { topicId, topicTitle };
        })
        .filter((topic): topic is { topicId: string; topicTitle: string } => Boolean(topic));
      return { subjectId, subjectName, weight, difficulty, topics };
    })
    .filter((subject): subject is PlanningSubjectInput => Boolean(subject));

  return {
    weekdayMinutes,
    weekendMinutes,
    subjects
  };
}

async function loadUserLlmPreferences(userId: string) {
  try {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { openAiApiKey: true, openAiModel: true, llmProvider: true }
    });
  } catch (error) {
    if (hasMissingLlmColumns(error)) {
      return { openAiApiKey: null, openAiModel: null, llmProvider: null };
    }
    throw error;
  }
}

function hasMissingLlmColumns(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("openAiApiKey") ||
    error.message.includes("openAiModel") ||
    error.message.includes("llmProvider") ||
    error.message.includes("Unknown argument")
  );
}

function normalizeLlmProvider(value: string | null | undefined): "AUTO" | "OPENAI" | "OLLAMA" {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "OPENAI") return "OPENAI";
  if (normalized === "OLLAMA") return "OLLAMA";
  return "AUTO";
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeDifficulty(value: unknown): PlanningDifficulty {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "BAIXA" || normalized === "ALTA") return normalized;
  return "MEDIA";
}

function toMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
