import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { getDailyHomeInsight } from "@/lib/insights/daily-home-insight";
import { prisma } from "@/lib/prisma";

type Body = {
  planScopeId?: string | null;
  planScopeLabel?: string;
  hasPlans?: boolean;
  hasStudyPlan?: boolean;
  daysToExam?: number | null;
  questionsAccuracy?: number;
  mocksAccuracy?: number;
  questionsSolved?: number;
  questionsPlanned?: number;
  questionsGoalPct?: number;
  studyMinutesToday?: number;
  plannedMinutesTotal?: number;
  todayPlannedQuestions?: number;
  todayPlannedReviews?: number;
  todayPlannedMocks?: number;
  currentStreak?: number;
  consistencyRate?: number;
  overdueReviewsCount?: number;
};

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      openAiApiKey: true,
      openAiModel: true,
      llmProvider: true
    }
  });
  if (!user) {
    return NextResponse.json({ ok: false, reason: "user_not_found" }, { status: 404 });
  }

  const insight = await getDailyHomeInsight({
    userId,
    userName: user.name?.trim() || user.email,
    planScopeId: normalizeString(body.planScopeId),
    planScopeLabel: normalizeString(body.planScopeLabel) || "Todos os planos",
    hasPlans: normalizeBoolean(body.hasPlans),
    hasStudyPlan: normalizeBoolean(body.hasStudyPlan),
    daysToExam: normalizeNullableInt(body.daysToExam),
    questionsAccuracy: normalizeInt(body.questionsAccuracy),
    mocksAccuracy: normalizeInt(body.mocksAccuracy),
    questionsSolved: normalizeInt(body.questionsSolved),
    questionsPlanned: normalizeInt(body.questionsPlanned),
    questionsGoalPct: normalizeInt(body.questionsGoalPct),
    studyMinutesToday: normalizeInt(body.studyMinutesToday),
    plannedMinutesTotal: normalizeInt(body.plannedMinutesTotal),
    todayPlannedQuestions: normalizeInt(body.todayPlannedQuestions),
    todayPlannedReviews: normalizeInt(body.todayPlannedReviews),
    todayPlannedMocks: normalizeInt(body.todayPlannedMocks),
    currentStreak: normalizeInt(body.currentStreak),
    consistencyRate: normalizeInt(body.consistencyRate),
    overdueReviewsCount: normalizeInt(body.overdueReviewsCount),
    openAiApiKey: user.openAiApiKey,
    openAiModel: user.openAiModel,
    llmProvider: user.llmProvider
  });

  return NextResponse.json({ ok: true, insight });
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeInt(value: unknown) {
  const num = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num));
}

function normalizeNullableInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function normalizeBoolean(value: unknown) {
  return value === true;
}
