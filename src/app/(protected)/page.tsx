import Image from "next/image";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudyCategory } from "@prisma/client";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { PlanImageUploadField } from "@/components/plan-image-upload-field";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubjectEvolutionChart } from "@/components/subject-evolution-chart";
import { SubjectPlanSelector } from "@/components/subject-plan-selector";
import { PlanReferenceFilesManager } from "@/components/plan-reference-files-manager";
import { PlanReferenceLinksManager } from "@/components/plan-reference-links-manager";
import { HomeInsightCard } from "@/components/home-insight-card";
import { getNextReviewDate } from "@/lib/study/review-schedule";
import { computeCurrentStreakDays } from "@/lib/study/activity-stats";
import { isFormDataFileLike } from "@/lib/http/form-data-file";
import { deleteUploadByUrl, saveUploadBuffer } from "@/lib/storage/local-upload";
import { deletePlanWithFiles } from "@/lib/storage/study-cleanup";

type DashboardPageProps = {
  searchParams: Promise<{ newPlan?: string; tab?: string; editPlan?: string; planId?: string }>;
};

const MAX_PLAN_IMAGE_SIZE = 3 * 1024 * 1024;
const ALLOWED_PLAN_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ParsedPlanNotes = {
  notes: string;
  edital: string;
  banca: string;
  role: string;
  genericStudy: boolean;
};

const BANCA_ALIASES: Record<string, string> = {
  CESPE: "CEBRASPE",
  CEBRASPE: "CEBRASPE",
  "CESPE CEBRASPE": "CEBRASPE",
  "CESPE/CEBRASPE": "CEBRASPE",
  "CEBRASPE/CESPE": "CEBRASPE",
  FGV: "FGV",
  "FUNDACAO GETULIO VARGAS": "FGV",
  FCC: "FCC",
  "FUNDACAO CARLOS CHAGAS": "FCC",
  VUNESP: "VUNESP",
  "FUNDACAO VUNESP": "VUNESP",
  AOCP: "AOCP",
  IBFC: "IBFC",
  IDECAN: "IDECAN",
  QUADRIX: "QUADRIX",
  CONSULPLAN: "CONSULPLAN",
  FUNDATEC: "FUNDATEC",
  IADES: "IADES",
  ACCESS: "INSTITUTO ACCESS",
  "INSTITUTO ACCESS": "INSTITUTO ACCESS"
};

function formatMinutesAsClock(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "0h00min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}min`;
}

function formatDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

function formatWeekdayLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

function formatPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (value >= 100) return "100%";
  return `${Math.round(value)}%`;
}

function performanceToneClass(value: number) {
  if (value > 85) return "homeKpiValueHigh";
  if (value > 70) return "homeKpiValueWarn";
  return "homeKpiValueLow";
}

function endOfToday(baseDate = new Date()) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1);
}

function toIsoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseExamDateInput(value: string) {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function examDateInputValue(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatExamDate(date: Date) {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function daysUntilExamDate(date: Date, now = new Date()) {
  const startUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const examUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diffMs = examUtc - startUtc;
  return Math.ceil(diffMs / 86_400_000);
}

type ReviewScheduleItem = {
  topicId: string;
  nextReviewAt: Date;
  status: "scheduled" | "overdue";
};

function buildReviewScheduleItems(
  sessions: Array<{
    topicId: string | null;
    category: StudyCategory;
    startedAt: Date;
    questionsCorrect: number;
    questionsWrong: number;
  }>
) {
  const byTopic = new Map<string, ReviewScheduleItem & { reviewCount: number; lastStudyAt: Date }>();

  for (const session of sessions) {
    if (!session.topicId) continue;

    const existing = byTopic.get(session.topicId);
    if (!existing) {
      const solved = session.questionsCorrect + session.questionsWrong;
      const accuracy = solved > 0 ? (session.questionsCorrect / solved) * 100 : 70;
      const reviewCount = session.category === StudyCategory.REVIEW ? 1 : 0;
      const next = getNextReviewDate({
        studiedAt: session.startedAt,
        accuracyPercent: accuracy,
        previousReviews: reviewCount
      });

      byTopic.set(session.topicId, {
        topicId: session.topicId,
        lastStudyAt: session.startedAt,
        nextReviewAt: next.nextReviewAt,
        reviewCount,
        status: "scheduled"
      });
      continue;
    }

    if (session.category === StudyCategory.REVIEW) {
      existing.reviewCount += 1;
      const solved = session.questionsCorrect + session.questionsWrong;
      const accuracy = solved > 0 ? (session.questionsCorrect / solved) * 100 : 70;
      const next = getNextReviewDate({
        studiedAt: existing.lastStudyAt,
        accuracyPercent: accuracy,
        previousReviews: existing.reviewCount
      });
      existing.nextReviewAt = next.nextReviewAt;
    }
  }

  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  return [...byTopic.values()]
    .map((item) => ({
      topicId: item.topicId,
      nextReviewAt: item.nextReviewAt,
      status: item.nextReviewAt < today ? ("overdue" as const) : ("scheduled" as const)
    }))
    .sort((a, b) => a.nextReviewAt.getTime() - b.nextReviewAt.getTime());
}

function isPlanImageFieldError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("imageUrl") || error.message.includes("Unknown argument");
}

function normalizeBancaName(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const condensed = raw.replace(/\s+/g, " ");
  const normalizedKey = condensed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const aliased = BANCA_ALIASES[normalizedKey];
  if (aliased) return aliased;
  return condensed.toUpperCase();
}

function parsePlanNotes(value: string | null | undefined): ParsedPlanNotes {
  if (!value) return { notes: "", edital: "", banca: "", role: "", genericStudy: false };

  const lines = value.split("\n");
  let notes = "";
  let edital = "";
  let banca = "";
  let role = "";
  let genericStudy = false;
  let appendingNotes = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("Observações:")) {
      notes = line.replace(/^Observações:\s*/i, "");
      appendingNotes = true;
      continue;
    }

    if (line.startsWith("Edital:")) {
      edital = line.replace(/^Edital:\s*/i, "");
      appendingNotes = false;
      continue;
    }

    if (line.startsWith("Cargo:")) {
      role = line.replace(/^Cargo:\s*/i, "");
      appendingNotes = false;
      continue;
    }

    if (line.startsWith("Banca:")) {
      banca = line.replace(/^Banca:\s*/i, "");
      appendingNotes = false;
      continue;
    }

    if (line.startsWith("Estudo genérico:")) {
      genericStudy = /sim/i.test(line);
      appendingNotes = false;
      continue;
    }

    if (appendingNotes && line.length > 0) {
      notes = notes ? `${notes}\n${rawLine}` : rawLine;
    }
  }

  return {
    notes: notes.trim(),
    edital: edital.trim(),
    banca: normalizeBancaName(banca),
    role: role.trim(),
    genericStudy
  };
}

async function savePlanImage(file: File, userId: string) {
  if (!ALLOWED_PLAN_IMAGE_TYPES.has(file.type) || file.size > MAX_PLAN_IMAGE_SIZE) return null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const saved = await saveUploadBuffer({
    kind: "plans",
    prefix: userId,
    ownerId: userId,
    extension,
    buffer
  });
  return saved.publicUrl;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect("/entrar");
  }
  const params = await searchParams;
  const isNewPlanOpen = params.newPlan === "1";
  const isPlansTabOpen = params.tab === "planos";
  const editPlanId = typeof params.editPlan === "string" ? params.editPlan : "";
  const requestedPlanId = typeof params.planId === "string" ? params.planId.trim() : "";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true }
  });

  if (!user) redirect("/entrar");

  const plans = await prisma.plan.findMany({
    where: { userId: user.id, isArchived: false },
    orderBy: { createdAt: "desc" },
    include: {
      subjects: {
        select: {
          _count: {
            select: {
              topics: true
            }
          }
        }
      },
      _count: {
        select: {
          subjects: true,
          studySessions: true,
          referenceLinks: true,
          referenceFiles: true
        }
      }
    }
  });
  const boardProfiles = await loadBoardProfiles(user.id);
  const selectedPlanId = plans.some((plan) => plan.id === requestedPlanId) ? requestedPlanId : "";
  const scopedPlans = selectedPlanId ? plans.filter((plan) => plan.id === selectedPlanId) : plans;
  const homePlanOptions = [
    {
      id: "",
      title: "Todos os planos",
      imageUrl: null,
      targetUrl: "/"
    },
    ...plans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      imageUrl: plan.imageUrl,
      targetUrl: `/?planId=${plan.id}`
    }))
  ];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endToday = endOfToday(now);
  const thirtyDaysAgo = new Date(startOfToday);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const activePlanIds = scopedPlans.map((plan) => plan.id);
  const hasActivePlans = activePlanIds.length > 0;
  const questionResponsesPlanScope = {
    userId: user.id,
    OR: [
      {
        question: {
          planId: { in: activePlanIds }
        }
      },
      {
        question: {
          planId: null,
          subject: {
            is: {
              planId: { in: activePlanIds }
            }
          }
        }
      }
    ]
  };

  const [sessionsLast30Days, reviewBaseSessions, topicLastStudies, questionResponsesLast30Days, mockAttemptsLast30Days, todayStudyPlanRows, upcomingStudyPlanRows] = hasActivePlans
    ? await Promise.all([
        prisma.studySession.findMany({
          where: {
            userId: user.id,
            planId: { in: activePlanIds },
            startedAt: {
              gte: thirtyDaysAgo
            }
          },
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            startedAt: true,
            durationMinutes: true,
            questionsCorrect: true,
            questionsWrong: true,
            category: true,
            plan: {
              select: {
                id: true,
                title: true
              }
            },
            subject: {
              select: {
                id: true,
                name: true
              }
            },
            topic: {
              select: {
                id: true,
                title: true
              }
            }
          }
        }),
        prisma.studySession.findMany({
          where: {
            userId: user.id,
            planId: { in: activePlanIds },
            topicId: { not: null }
          },
          orderBy: { startedAt: "desc" },
          select: {
            topicId: true,
            category: true,
            startedAt: true,
            questionsCorrect: true,
            questionsWrong: true
          }
        }),
        prisma.topic.findMany({
          where: {
            subject: {
              plan: {
                userId: user.id,
                id: { in: activePlanIds }
              }
            }
          },
          select: {
            id: true,
            title: true,
            subject: {
              select: {
                id: true,
                name: true,
                plan: {
                  select: {
                    title: true
                  }
                }
              }
            },
            studySessions: {
              where: { userId: user.id, planId: { in: activePlanIds } },
              orderBy: { startedAt: "desc" },
              take: 1,
              select: {
                startedAt: true
              }
            }
          }
        }),
        prisma.questionResponse.findMany({
          where: {
            ...questionResponsesPlanScope,
            createdAt: {
              gte: thirtyDaysAgo
            }
          },
          select: {
            createdAt: true
          }
        }),
        prisma.mockExamAttempt.findMany({
          where: {
            userId: user.id,
            mockExam: {
              planId: { in: activePlanIds }
            },
            finishedAt: {
              gte: thirtyDaysAgo
            }
          },
          select: {
            finishedAt: true
          }
        }),
        prisma.planStudyPlanDay.findMany({
          where: {
            userId: user.id,
            planId: { in: activePlanIds },
            date: {
              gte: startOfToday,
              lt: endToday
            }
          },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            date: true,
            weekdayLabel: true,
            subjectName: true,
            topicTitle: true,
            plannedMinutes: true,
            questionsTarget: true,
            reviewsTarget: true,
            mockExamsTarget: true,
            plan: {
              select: {
                title: true
              }
            }
          }
        }),
        prisma.planStudyPlanDay.findMany({
          where: {
            userId: user.id,
            planId: { in: activePlanIds },
            date: {
              gte: startOfToday
            }
          },
          orderBy: [{ date: "asc" }, { position: "asc" }],
          select: {
            id: true,
            date: true,
            plannedMinutes: true,
            questionsTarget: true,
            reviewsTarget: true,
            mockExamsTarget: true
          }
        })
      ])
    : [
        [],
        [],
        [],
        [],
        [],
        [],
        []
      ];

  const [allTimeQuestions, allTimeCorrect, mockAttemptsSummary] = hasActivePlans
    ? await Promise.all([
        prisma.questionResponse.count({
          where: questionResponsesPlanScope
        }),
        prisma.questionResponse.count({
          where: {
            ...questionResponsesPlanScope,
            isCorrect: true
          }
        }),
        prisma.mockExamAttempt.aggregate({
          where: {
            userId: user.id,
            mockExam: {
              planId: { in: activePlanIds }
            }
          },
          _count: {
            _all: true
          },
          _avg: {
            scorePct: true
          }
        })
      ])
    : [
        0,
        0,
        {
          _count: {
            _all: 0
          },
          _avg: {
            scorePct: null
          }
        }
      ];

  const allTimeWrong = Math.max(0, allTimeQuestions - allTimeCorrect);
  const allTimeAccuracy = allTimeQuestions > 0 ? Math.round((allTimeCorrect / allTimeQuestions) * 100) : 0;
  const solvedMockExams = mockAttemptsSummary._count._all ?? 0;
  const mockAverageAccuracy = Math.round(mockAttemptsSummary._avg.scorePct ?? 0);
  const questionsPerformanceClass = performanceToneClass(allTimeAccuracy);
  const mocksPerformanceClass = performanceToneClass(mockAverageAccuracy);
  const todayStudyDateLabel = startOfToday.toLocaleDateString("pt-BR");
  const todayStudyWeekdayRaw = todayStudyPlanRows[0]?.weekdayLabel ?? startOfToday.toLocaleDateString("pt-BR", { weekday: "long" });
  const todayStudyWeekdayLabel = todayStudyWeekdayRaw.slice(0, 1).toUpperCase() + todayStudyWeekdayRaw.slice(1);
  const todayPlannedTotalMinutes = todayStudyPlanRows.reduce((acc, row) => acc + row.plannedMinutes, 0);
  const todayPlannedQuestions = todayStudyPlanRows.reduce((acc, row) => acc + row.questionsTarget, 0);
  const todayPlannedReviews = todayStudyPlanRows.reduce((acc, row) => acc + row.reviewsTarget, 0);
  const todayPlannedMocks = todayStudyPlanRows.reduce((acc, row) => acc + row.mockExamsTarget, 0);
  const plannedMinutesTotal = upcomingStudyPlanRows.reduce((acc, row) => acc + row.plannedMinutes, 0);
  const plannedQuestionsTotal = upcomingStudyPlanRows.reduce((acc, row) => acc + row.questionsTarget, 0);
  const plannedReviewsTotal = upcomingStudyPlanRows.reduce((acc, row) => acc + row.reviewsTarget, 0);
  const plannedMocksTotal = upcomingStudyPlanRows.reduce((acc, row) => acc + row.mockExamsTarget, 0);

  const reviewItems = buildReviewScheduleItems(reviewBaseSessions);
  const overdueReviewsCount = reviewItems.filter((item) => item.status === "overdue").length;

  const criticalDelayTopics = topicLastStudies
    .map((topic) => {
      const lastSession = topic.studySessions[0];
      const lastStudyAt = lastSession?.startedAt ?? null;
      const daysWithoutStudy = lastStudyAt
        ? Math.floor((startOfToday.getTime() - new Date(lastStudyAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        topicId: topic.id,
        topicTitle: topic.title,
        subjectId: topic.subject.id,
        subjectName: topic.subject.name,
        planName: topic.subject.plan.title,
        daysWithoutStudy,
        score: lastStudyAt ? Math.max(0, daysWithoutStudy ?? 0) : 9999
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  let todayMinutes = 0;
  let todaySessions = 0;
  let doneReviewsFromToday = 0;
  let doneMocksFromSessionsFromToday = 0;

  const chartMap = new Map<string, { dateKey: string; label: string; minutes: number; questions: number }>();

  for (const session of sessionsLast30Days) {
    const sessionDate = new Date(session.startedAt);
    if (sessionDate >= startOfToday) {
      todayMinutes += session.durationMinutes;
      todaySessions += 1;
      if (session.category === StudyCategory.REVIEW) doneReviewsFromToday += 1;
      if (session.category === StudyCategory.MOCK_EXAM) doneMocksFromSessionsFromToday += 1;
    }

    const dateKey = formatDayKey(sessionDate);
    const label = sessionDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const chartEntry = chartMap.get(dateKey) ?? { dateKey, label, minutes: 0, questions: 0 };
    chartEntry.minutes += session.durationMinutes;
    chartEntry.questions += session.questionsCorrect + session.questionsWrong;
    chartMap.set(dateKey, chartEntry);
  }

  const chartPoints = Array.from(chartMap.values()).sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));

  const dailyStudyActivity = new Map<string, { minutes: number; interactions: number }>();
  for (const session of sessionsLast30Days) {
    const dayKey = formatDayKey(new Date(session.startedAt));
    const entry = dailyStudyActivity.get(dayKey) ?? { minutes: 0, interactions: 0 };
    entry.minutes += session.durationMinutes;
    entry.interactions += 1;
    dailyStudyActivity.set(dayKey, entry);
  }

  for (const response of questionResponsesLast30Days) {
    const dayKey = formatDayKey(new Date(response.createdAt));
    const entry = dailyStudyActivity.get(dayKey) ?? { minutes: 0, interactions: 0 };
    entry.interactions += 1;
    dailyStudyActivity.set(dayKey, entry);
  }

  for (const attempt of mockAttemptsLast30Days) {
    const dayKey = formatDayKey(new Date(attempt.finishedAt));
    const entry = dailyStudyActivity.get(dayKey) ?? { minutes: 0, interactions: 0 };
    entry.interactions += 1;
    dailyStudyActivity.set(dayKey, entry);
  }

  const mockAttemptsTodayCount = mockAttemptsLast30Days.filter((attempt) => new Date(attempt.finishedAt) >= startOfToday).length;
  const doneMocksFromToday = Math.max(mockAttemptsTodayCount, doneMocksFromSessionsFromToday);
  const homeStudyProgressPct =
    plannedMinutesTotal > 0 ? Math.max(0, Math.min(100, Math.round((todayMinutes / plannedMinutesTotal) * 100))) : 0;
  const homeReviewProgressPct =
    plannedReviewsTotal > 0 ? Math.max(0, Math.min(100, Math.round((doneReviewsFromToday / plannedReviewsTotal) * 100))) : 0;
  const homeMockProgressPct =
    plannedMocksTotal > 0 ? Math.max(0, Math.min(100, Math.round((doneMocksFromToday / plannedMocksTotal) * 100))) : 0;
  const questionsGoalPctRaw = plannedQuestionsTotal > 0 ? Math.round((allTimeQuestions / plannedQuestionsTotal) * 100) : 0;
  const questionsGoalPct = Math.max(0, Math.min(999, questionsGoalPctRaw));
  const questionsGoalToneClass = performanceToneClass(Math.max(0, Math.min(100, questionsGoalPctRaw)));
  const reviewMockPlanTotal = plannedReviewsTotal + plannedMocksTotal;
  const homeReviewVsMockPct =
    reviewMockPlanTotal > 0 ? Math.max(0, Math.min(100, Math.round((plannedReviewsTotal / reviewMockPlanTotal) * 100))) : 50;

  const studyDoneByDay = new Map<string, number>();
  for (const session of sessionsLast30Days) {
    const date = new Date(session.startedAt);
    if (date < startOfToday) continue;
    const key = formatDayKey(date);
    studyDoneByDay.set(key, (studyDoneByDay.get(key) ?? 0) + Math.max(0, session.durationMinutes));
  }

  const plannedByDay = new Map<string, number>();
  for (const row of upcomingStudyPlanRows) {
    const key = toIsoDay(row.date);
    plannedByDay.set(key, (plannedByDay.get(key) ?? 0) + Math.max(0, row.plannedMinutes));
  }
  const homeTimeTrend = Array.from(plannedByDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(0, 7)
    .map(([key, plannedMinutes]) => {
      const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
      const date = new Date(year, (month || 1) - 1, day || 1);
      const studiedMinutes = studyDoneByDay.get(key) ?? 0;
      return {
        key,
        label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        studiedMinutes,
        plannedMinutes
      };
    });

  const consistencyDays = Array.from({ length: 30 }, (_, index) => {
    const date = addDays(thirtyDaysAgo, index);
    const dayKey = formatDayKey(date);
    const day = dailyStudyActivity.get(dayKey);
    const minutes = day?.minutes ?? 0;
    const interactions = day?.interactions ?? 0;
    return {
      dayKey,
      date,
      minutes,
      interactions,
      studied: interactions > 0
    };
  });

  const studiedDaysCount = consistencyDays.filter((day) => day.studied).length;
  const consistencyRate = Math.round((studiedDaysCount / consistencyDays.length) * 100);

  const activeDayKeys = new Set<string>(
    Array.from(dailyStudyActivity.entries())
      .filter(([, value]) => value.interactions > 0)
      .map(([key]) => key)
  );
  const currentStreak = computeCurrentStreakDays({
    dayKeys: activeDayKeys,
    today: startOfToday,
    maxWindowDays: consistencyDays.length
  });

  let bestStreak = 0;
  let runningStreak = 0;
  for (const day of consistencyDays) {
    if (day.studied) {
      runningStreak += 1;
      if (runningStreak > bestStreak) bestStreak = runningStreak;
    } else {
      runningStreak = 0;
    }
  }

  const todayStartMs = startOfToday.getTime();
  const sevenDaysAgoMs = todayStartMs - 6 * 24 * 60 * 60 * 1000;
  const fifteenDaysAgoMs = todayStartMs - 14 * 24 * 60 * 60 * 1000;

  let minutes7 = 0;
  let minutes15 = 0;
  let minutes30 = 0;
  let questions7 = 0;
  let questions15 = 0;
  let questions30 = 0;

  for (const session of sessionsLast30Days) {
    const ts = new Date(session.startedAt).getTime();
    const q = session.questionsCorrect + session.questionsWrong;

    minutes30 += session.durationMinutes;
    questions30 += q;

    if (ts >= fifteenDaysAgoMs) {
      minutes15 += session.durationMinutes;
      questions15 += q;
    }
    if (ts >= sevenDaysAgoMs) {
      minutes7 += session.durationMinutes;
      questions7 += q;
    }
  }

  const upcomingExams = scopedPlans
    .filter((plan) => !!plan.examDate)
    .map((plan) => {
      const examDate = new Date(plan.examDate as Date);
      const daysLeft = daysUntilExamDate(examDate, startOfToday);
      return { id: plan.id, title: plan.title, examDate, daysLeft };
    })
    .sort((a, b) => a.examDate.getTime() - b.examDate.getTime())
    .slice(0, 4);
  const nextExam = upcomingExams[0] ?? null;
  const nextExamDaysLabel = nextExam ? (nextExam.daysLeft >= 0 ? `${nextExam.daysLeft} dias` : "Encerrada") : "--";
  const nextExamDateLabel = nextExam ? formatExamDate(nextExam.examDate) : "Data não informada";
  const selectedPlanLabel = selectedPlanId ? plans.find((plan) => plan.id === selectedPlanId)?.title ?? "Plano selecionado" : "Todos os planos";
  const insightPayload = {
    planScopeId: selectedPlanId || null,
    planScopeLabel: selectedPlanLabel,
    hasPlans: hasActivePlans,
    hasStudyPlan: upcomingStudyPlanRows.length > 0,
    daysToExam: nextExam ? nextExam.daysLeft : null,
    questionsAccuracy: allTimeAccuracy,
    mocksAccuracy: mockAverageAccuracy,
    questionsSolved: allTimeQuestions,
    questionsPlanned: plannedQuestionsTotal,
    questionsGoalPct,
    studyMinutesToday: todayMinutes,
    plannedMinutesTotal,
    todayPlannedQuestions,
    todayPlannedReviews,
    todayPlannedMocks,
    currentStreak,
    consistencyRate,
    overdueReviewsCount
  };

  async function createPlan(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const titleRaw = formData.get("title");
    const notesRaw = formData.get("notes");
    const editalRaw = formData.get("edital");
    const bancaRaw = formData.get("banca");
    const roleRaw = formData.get("role");
    const examDateRaw = formData.get("examDate");
    const genericRaw = formData.get("genericStudy");
    const planImageRaw = formData.get("planImage");

    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
    const notes = typeof notesRaw === "string" ? notesRaw.trim() : "";
    const edital = typeof editalRaw === "string" ? editalRaw.trim() : "";
    const banca = normalizeBancaName(typeof bancaRaw === "string" ? bancaRaw : "");
    const role = typeof roleRaw === "string" ? roleRaw.trim() : "";
    const examDateValue = typeof examDateRaw === "string" ? examDateRaw.trim() : "";
    const genericStudy = genericRaw === "on";
    const planImage = isFormDataFileLike(planImageRaw) ? planImageRaw : null;

    if (title.length < 2 || title.length > 160) return;

    const notesParts = [
      notes ? `Observações: ${notes}` : "",
      edital ? `Edital: ${edital}` : "",
      banca ? `Banca: ${banca}` : "",
      role ? `Cargo: ${role}` : "",
      genericStudy ? "Estudo genérico: sim" : ""
    ].filter(Boolean);

    const imageUrl = planImage && planImage.size > 0 ? await savePlanImage(planImage, currentUserId) : null;
    const examDate = examDateValue ? parseExamDateInput(examDateValue) : null;

    const baseData = {
      userId: currentUserId,
      title,
      notes: notesParts.length > 0 ? notesParts.join("\n") : undefined,
      examDate: examDate && !Number.isNaN(examDate.getTime()) ? examDate : null
    };

    try {
      await prisma.plan.create({
        data: {
          ...baseData,
          ...(imageUrl ? { imageUrl } : {})
        }
      });
    } catch (error) {
      if (imageUrl) {
        await deleteUploadByUrl(imageUrl, "plans");
      }
      if (!imageUrl || !isPlanImageFieldError(error)) throw error;
      await prisma.plan.create({ data: baseData });
    }

    revalidatePath("/");
    redirect("/?tab=planos&toast=plan_created");
  }

  async function updatePlan(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const titleRaw = formData.get("title");
    const notesRaw = formData.get("notes");
    const editalRaw = formData.get("edital");
    const bancaRaw = formData.get("banca");
    const roleRaw = formData.get("role");
    const examDateRaw = formData.get("examDate");
    const genericRaw = formData.get("genericStudy");
    const planImageRaw = formData.get("planImage");
    const removeImageRaw = formData.get("removePlanImage");

    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
    const notes = typeof notesRaw === "string" ? notesRaw.trim() : "";
    const edital = typeof editalRaw === "string" ? editalRaw.trim() : "";
    const banca = normalizeBancaName(typeof bancaRaw === "string" ? bancaRaw : "");
    const role = typeof roleRaw === "string" ? roleRaw.trim() : "";
    const examDateValue = typeof examDateRaw === "string" ? examDateRaw.trim() : "";
    const genericStudy = genericRaw === "on";
    const planImage = isFormDataFileLike(planImageRaw) ? planImageRaw : null;
    const removePlanImage = removeImageRaw === "on";

    if (!planId || title.length < 2 || title.length > 160) return;

    const ownedPlan = await prisma.plan.findFirst({
      where: { id: planId, userId: currentUserId, isArchived: false },
      select: { id: true, imageUrl: true }
    });
    if (!ownedPlan) return;

    const examDate = examDateValue ? parseExamDateInput(examDateValue) : null;
    const imageUrl = planImage && planImage.size > 0 ? await savePlanImage(planImage, currentUserId) : null;
    const notesParts = [
      notes ? `Observações: ${notes}` : "",
      edital ? `Edital: ${edital}` : "",
      banca ? `Banca: ${banca}` : "",
      role ? `Cargo: ${role}` : "",
      genericStudy ? "Estudo genérico: sim" : ""
    ].filter(Boolean);

    const baseData = {
      title,
      notes: notesParts.length > 0 ? notesParts.join("\n") : null,
      examDate: examDate && !Number.isNaN(examDate.getTime()) ? examDate : null
    };
    const nextImageUrl = imageUrl ? imageUrl : removePlanImage ? null : undefined;

    try {
      await prisma.plan.update({
        where: { id: planId },
        data: {
          ...baseData,
          ...(nextImageUrl !== undefined ? { imageUrl: nextImageUrl } : {})
        }
      });
    } catch (error) {
      if (imageUrl) {
        await deleteUploadByUrl(imageUrl, "plans");
      }
      if (!isPlanImageFieldError(error) || nextImageUrl === undefined) throw error;
      await prisma.plan.update({
        where: { id: planId },
        data: baseData
      });
    }

    if (ownedPlan.imageUrl && (imageUrl || (removePlanImage && !imageUrl))) {
      await deleteUploadByUrl(ownedPlan.imageUrl, "plans");
    }

    revalidatePath("/");
    redirect("/?tab=planos&toast=plan_updated");
  }

  async function deletePlan(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    if (!planId) return;

    const deleted = await deletePlanWithFiles({ userId: currentUserId, planId });
    if (!deleted) return;

    revalidatePath("/");
    redirect("/?tab=planos&toast=plan_deleted");
  }

  const editablePlan = editPlanId ? plans.find((plan) => plan.id === editPlanId) : null;
  const editablePlanNotes = parsePlanNotes(editablePlan?.notes);
  const bancaSuggestions = [
    ...new Set(
      [
        ...boardProfiles.map((item) => sanitizeBoardName(item.name) || sanitizeBoardName(item.normalizedName)),
        ...plans.map((plan) => sanitizeBoardName(parsePlanNotes(plan.notes).banca))
      ]
        .map((value) => normalizeBancaName(value))
        .filter((value) => value.length >= 2)
    )
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const editBancaOptions =
    editablePlanNotes.banca && !bancaSuggestions.includes(editablePlanNotes.banca)
      ? [editablePlanNotes.banca, ...bancaSuggestions]
      : bancaSuggestions;

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>{isPlansTabOpen || isNewPlanOpen ? "Planos de estudo" : "Home"}</h1>
          <p>{user.name ? `Bem-vindo, ${user.name}` : `Bem-vindo, ${user.email}`}</p>
        </div>
        {isPlansTabOpen || isNewPlanOpen ? (
          <div className="dashboardActions">
            <Link className="button createPlanBtn createPlanLink" href="/?tab=planos&newPlan=1">
              Criar novo plano
            </Link>
          </div>
        ) : (
          <div className="subjectDetailHeaderActions">
            <SubjectPlanSelector options={homePlanOptions} currentPlanId={selectedPlanId} />
          </div>
        )}
      </section>

      {isPlansTabOpen || isNewPlanOpen ? (
        <section className="dashboardCard plansSection">
          {plans.length > 0 ? (
            <div className="plansGrid">
              {plans.map((plan) => (
                <article key={plan.id} className="planCard">
                  <Link
                    className="planCardMain planCardLinkCard"
                    href={`/disciplinas?planId=${plan.id}`}
                    aria-label={`Abrir disciplinas do plano ${plan.title}`}
                  >
                    <div className="planCardMedia">
                      {plan.imageUrl ? (
                        <Image className="planCardThumb" src={plan.imageUrl} alt={`Imagem do plano ${plan.title}`} width={88} height={88} />
                      ) : (
                        <div className="planCardThumb planCardThumbPlaceholder">
                          {(plan.title || "PL")
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase())
                            .join("") || "PL"}
                        </div>
                      )}
                    </div>
                    <div className="planCardBody">
                      {(() => {
                        const parsedNotes = parsePlanNotes(plan.notes);
                        const totalTopics = plan.subjects.reduce((acc, subject) => acc + subject._count.topics, 0);
                        return (
                          <>
                            <h3>{plan.title}</h3>
                            <div className="planCardStats">
                              <p>Cargo: {parsedNotes.role || "não informado"}</p>
                              <p>Banca: {parsedNotes.banca || "não informada"}</p>
                              <p>Disciplinas: {plan._count.subjects}</p>
                              <div className="planCardStatsRow">
                                <p>Tópicos: {totalTopics}</p>
                                <p className="planCardExamDate">
                                  <span className="planCardExamIcon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" focusable="false">
                                      <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v11a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm13 10H4v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6ZM5 6a1 1 0 0 0-1 1v3h16V7a1 1 0 0 0-1-1H5Z" />
                                    </svg>
                                  </span>
                                  {plan.examDate ? formatExamDate(new Date(plan.examDate)) : "não informada"}
                                </p>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </Link>

                  <div className="planCardReferences">
                    <span className="planCardReferencesLabel">Referências:</span>
                    <PlanReferenceLinksManager planId={plan.id} initialCount={plan._count.referenceLinks} />
                    <PlanReferenceFilesManager planId={plan.id} initialCount={plan._count.referenceFiles} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="emptyState">Você ainda não tem planos cadastrados. Use o botão Criar novo plano acima.</p>
          )}
        </section>
      ) : (
        <section className="homeDashboard">
          <HomeInsightCard payload={insightPayload} />

          <div className="homeKpiGrid">
            <article className="dashboardCard homeKpiCard">
              <p className="homeKpiLabel">Prova</p>
              <strong className="homeKpiValue">{nextExamDaysLabel}</strong>
              <span className="homeKpiHint">{nextExamDateLabel}</span>
            </article>

            <article className="dashboardCard homeKpiCard">
              <p className="homeKpiLabel">% da meta de questões</p>
              <strong className={`homeKpiValue ${questionsGoalToneClass}`}>{questionsGoalPct}%</strong>
              <span className="homeKpiHint">Meta planejada: {plannedQuestionsTotal} questões</span>
            </article>

            <article className="dashboardCard homeKpiCard">
              <p className="homeKpiLabel">Desempenho em questões</p>
              <strong className={`homeKpiValue ${questionsPerformanceClass}`}>{allTimeAccuracy}%</strong>
              <span className="homeKpiHint">
                {allTimeCorrect} acertos / {allTimeWrong} erros
              </span>
            </article>

            <article className="dashboardCard homeKpiCard">
              <p className="homeKpiLabel">Desempenho em simulados</p>
              <strong className={`homeKpiValue ${mocksPerformanceClass}`}>{mockAverageAccuracy}%</strong>
              <span className="homeKpiHint">{solvedMockExams} simulado(s) realizados</span>
            </article>
          </div>

          <div className="homePlanningCharts">
            <article className="dashboardCard homePanel planningTimeCard">
              <h2>Tempo total</h2>
              <div className="planningTimeVisualRow">
                <div className="planningTimeRadial" style={{ ["--planning-time-usage" as string]: `${homeStudyProgressPct}%` }}>
                  <span>{homeStudyProgressPct}%</span>
                </div>
                <div>
                  <p className="planningTimeValue">{formatMinutesAsClock(plannedMinutesTotal)}</p>
                  <small>
                    {formatMinutesAsClock(todayMinutes)} estudados de {formatMinutesAsClock(plannedMinutesTotal)} planejados
                  </small>
                </div>
              </div>
              <div className="planningKpiTrack" aria-label={`Progresso de estudo ${homeStudyProgressPct}%`}>
                <span style={{ width: `${homeStudyProgressPct}%` }} />
              </div>
              <small>{homeStudyProgressPct}% da meta total concluída</small>
              <div className="planningTimeTrend">
                {homeTimeTrend.map((day) => (
                  <div key={day.key} className="planningTimeTrendBar">
                    <div className="planningTimeTrendTrack">
                      <div
                        className="planningTimeTrendFill"
                        style={{ width: `${day.plannedMinutes > 0 ? Math.max(0, Math.min(100, Math.round((day.studiedMinutes / day.plannedMinutes) * 100))) : 0}%` }}
                      />
                    </div>
                    <small>{formatMinutesAsClock(day.studiedMinutes)} / {formatMinutesAsClock(day.plannedMinutes)}</small>
                    <span>{day.label}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboardCard homePanel planningRevMockCard">
              <h2>Revisões / Simulados</h2>
              <div className="planningRevMockGraphic">
                <div className="planningRevMockDonut" style={{ ["--rev-mock" as string]: `${homeReviewVsMockPct}%` }}>
                  <span>{reviewMockPlanTotal}</span>
                </div>
                <div className="planningRevMockLegend">
                  <p>
                    <b>R</b> {doneReviewsFromToday}/{plannedReviewsTotal}
                  </p>
                  <p>
                    <b>S</b> {doneMocksFromToday}/{plannedMocksTotal}
                  </p>
                </div>
              </div>
              <div className="planningRevMockCompare">
                <div>
                  <small>Revisões ({homeReviewProgressPct}%)</small>
                  <div className="planningRevMockCompareTrack">
                    <span style={{ width: `${plannedReviewsTotal > 0 ? homeReviewProgressPct : 0}%` }} />
                  </div>
                </div>
                <div>
                  <small>Simulados ({homeMockProgressPct}%)</small>
                  <div className="planningRevMockCompareTrack mock">
                    <span style={{ width: `${plannedMocksTotal > 0 ? homeMockProgressPct : 0}%` }} />
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div className="homePanelsGrid">
            <article className="dashboardCard homePanel homeInsightCard">
              <header className="homePanelHeader">
                <h2>O que estudar hoje</h2>
                <p>{todayStudyDateLabel} · {todayStudyWeekdayLabel}</p>
              </header>
              <p className="homeTodayPlanSummary">
                {formatMinutesAsClock(todayPlannedTotalMinutes)} · Q {todayPlannedQuestions} · R {todayPlannedReviews} · S {todayPlannedMocks}
              </p>
              {todayStudyPlanRows.length > 0 ? (
                <ul className="homeList homeCompactList">
                  {todayStudyPlanRows.map((row) => (
                    <li key={row.id} className="homeListItem">
                      <span className="homeListTitle">{row.subjectName}{row.topicTitle ? ` · ${row.topicTitle}` : ""}</span>
                      <span className="homeListMeta">
                        {formatMinutesAsClock(row.plannedMinutes)} · Q {row.questionsTarget} · R {row.reviewsTarget} · S {row.mockExamsTarget}
                        {selectedPlanId ? "" : ` · ${row.plan.title}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="homeInsightFoot">Sem bloco planejado para hoje no cronograma.</p>
              )}
            </article>

            <article className="dashboardCard homePanel homeConsistencyPanel">
              <header className="homePanelHeader">
                <h2>Constância nos estudos</h2>
              </header>

              <div className="homeConsistencyStats">
                <div className="homeConsistencyStat">
                  <strong>{studiedDaysCount}/30</strong>
                  <span>Dias estudados</span>
                </div>
                <div className="homeConsistencyStat">
                  <strong>{currentStreak}</strong>
                  <span>Sequência atual</span>
                </div>
                <div className="homeConsistencyStat">
                  <strong>{bestStreak}</strong>
                  <span>Melhor sequência</span>
                </div>
                <div className="homeConsistencyStat">
                  <strong>{consistencyRate}%</strong>
                  <span>Constância</span>
                </div>
              </div>

              <div className="homeConsistencyGrid" aria-label="Últimos 30 dias de estudo">
                {consistencyDays.map((day) => {
                  const level =
                    day.interactions >= 8 ? "strong" : day.interactions >= 4 ? "medium" : day.interactions > 0 ? "light" : "none";
                  return (
                    <span
                      key={day.dayKey}
                      className={`homeConsistencyDay ${level}`}
                      title={`${day.date.toLocaleDateString("pt-BR")} · ${day.interactions} interação(ões) · ${formatMinutesAsClock(day.minutes)} · ${formatWeekdayLabel(day.date)}`}
                    />
                  );
                })}
              </div>
              <p className="homeConsistencyLegend">Níveis: sem atividade, leve, médio e forte (até 30 dias).</p>
            </article>

            <article className="dashboardCard homePanel">
              <header className="homePanelHeader">
                <h2>Últimas atividades</h2>
              </header>
              {sessionsLast30Days.length > 0 ? (
                <ul className="homeActivityList">
                  {sessionsLast30Days.slice(0, 8).map((session) => (
                    <li key={session.id} className="homeActivityItem">
                      <div className="homeActivityMain">
                        <strong>{session.subject?.name ?? "Disciplina não definida"}</strong>
                        <span>
                          {session.topic?.title ?? "Sem tópico"} · {session.plan?.title ?? "Plano não definido"}
                        </span>
                      </div>
                      <div className="homeActivityMeta">
                        <span>{new Date(session.startedAt).toLocaleDateString("pt-BR")}</span>
                        <span>{formatMinutesAsClock(session.durationMinutes)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="emptyState">Nenhuma atividade registrada ainda.</p>
              )}
            </article>

            <article className="dashboardCard homePanel homeInsightCard">
              <header className="homePanelHeader">
                <h2>Atrasos críticos</h2>
              </header>
              {criticalDelayTopics.length > 0 ? (
                <ul className="homeList homeCompactList">
                  {criticalDelayTopics.map((topic) => (
                    <li key={topic.topicId} className="homeListItem">
                      <span className="homeListTitle">
                        {topic.subjectName} · {topic.topicTitle}
                      </span>
                      <span className="homeListMeta">
                        {topic.daysWithoutStudy === null
                          ? "Sem estudo registrado"
                          : `${topic.daysWithoutStudy} dia(s) sem estudar`}{" "}
                        · {topic.planName}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="emptyState">Sem tópicos para analisar atrasos.</p>
              )}
            </article>

          </div>

          <article className="dashboardCard homeChartCard">
            <header className="homePanelHeader">
              <h2>Evolução no tempo</h2>
              <p>
                Últimos 30 dias · {todaySessions} sessão(ões) hoje · desempenho atual {formatPercent(allTimeAccuracy)}
              </p>
            </header>
            <div className="homePeriodStats">
              <article className="homePeriodPill">
                <strong>7 dias</strong>
                <span>{formatMinutesAsClock(minutes7)} · {questions7} questões</span>
              </article>
              <article className="homePeriodPill">
                <strong>15 dias</strong>
                <span>{formatMinutesAsClock(minutes15)} · {questions15} questões</span>
              </article>
              <article className="homePeriodPill active">
                <strong>30 dias</strong>
                <span>{formatMinutesAsClock(minutes30)} · {questions30} questões</span>
              </article>
            </div>
            {chartPoints.length > 0 ? (
              <SubjectEvolutionChart points={chartPoints} />
            ) : (
              <p className="emptyState">Ainda não há estudos suficientes para gerar o gráfico.</p>
            )}
          </article>

        </section>
      )}

      {isNewPlanOpen ? (
        <div className="modalBackdrop">
          <section className="newPlanModal">
            <h1>Novo Plano de Estudos</h1>
            <p className="newPlanSubtitle">
              Dê um nome para o seu plano de estudos e, caso queira, adicione uma imagem para identificá-lo.
            </p>

            <form action={createPlan} className="newPlanForm">
              <div className="newPlanGrid">
                <div className="newPlanImageCol">
                  <PlanImageUploadField inputId="planImageCreate" />
                </div>

                <div>
                  <label className="fieldLabel" htmlFor="title">
                    NOME DO PLANO
                  </label>
                  <input id="title" className="lineInput" name="title" placeholder="Ex: Auditor Fiscal + Inglês" required />

                  <label className="fieldLabel" htmlFor="notes">
                    OBSERVAÇÕES (OPCIONAL)
                  </label>
                  <textarea
                    id="notes"
                    className="lineInput lineTextarea"
                    name="notes"
                    placeholder="Aqui você pode escrever alguma observação sobre o seu plano"
                    rows={3}
                  />
                </div>
              </div>

              <h2>Para o que você está estudando?</h2>

              <label className="fieldLabel" htmlFor="edital">
                EDITAIS (OPCIONAL)
              </label>
              <input id="edital" className="lineInput" name="edital" />

              <label className="fieldLabel" htmlFor="role">
                CARGOS (OPCIONAL)
              </label>
              <input id="role" className="lineInput" name="role" />

              <div className="fieldLabelRow">
                <label className="fieldLabel" htmlFor="banca">
                  BANCA ORGANIZADORA (OPCIONAL)
                </label>
                <Link className="secondaryBtn small fieldLabelActionBtn" href="/bancas" target="_blank" rel="noopener noreferrer">
                  Ir para Bancas
                </Link>
              </div>
              <select id="banca" className="lineInput" name="banca" defaultValue="">
                <option value="">Selecione uma banca</option>
                {bancaSuggestions.map((banca) => (
                  <option key={banca} value={banca}>
                    {banca}
                  </option>
                ))}
              </select>

              <label className="fieldLabel" htmlFor="examDate">
                DATA DA PROVA (OPCIONAL)
              </label>
              <input id="examDate" className="lineInput" type="date" name="examDate" />

              <label className="checkboxRow" htmlFor="genericStudy">
                <input id="genericStudy" type="checkbox" name="genericStudy" />
                <span>Não estou estudando para nenhuma prova específica</span>
              </label>

              <div className="newPlanActions">
                <Link className="ghostButton" href="/?tab=planos">
                  Cancelar
                </Link>
                <button className="button createPlanBtn" type="submit">
                  Avançar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editablePlan ? (
        <div className="modalBackdrop">
          <section className="newPlanModal">
            <h1>Editar Plano de Estudos</h1>
            <p className="newPlanSubtitle">
              Atualize as informações do plano de estudos e, caso queira, altere a imagem de identificação.
            </p>

            <form action={updatePlan} className="newPlanForm">
              <input type="hidden" name="planId" value={editablePlan.id} />

              <div className="newPlanGrid">
                <div className="newPlanImageCol">
                  <PlanImageUploadField
                    inputId="edit-plan-image"
                    currentImageUrl={editablePlan.imageUrl ?? null}
                    buttonLabel="Escolher nova imagem"
                    helperText="A imagem será recortada para encaixar no card."
                    submitOnApply
                  />
                  {editablePlan.imageUrl ? (
                    <label className="checkboxRow" htmlFor="removePlanImage">
                      <input id="removePlanImage" type="checkbox" name="removePlanImage" />
                      <span>Remover imagem atual</span>
                    </label>
                  ) : null}
                </div>

                <div>
                  <label className="fieldLabel" htmlFor="edit-title">
                    NOME DO PLANO
                  </label>
                  <input id="edit-title" className="lineInput" name="title" defaultValue={editablePlan.title} required minLength={2} maxLength={160} />

                  <label className="fieldLabel" htmlFor="edit-notes">
                    OBSERVAÇÕES (OPCIONAL)
                  </label>
                  <textarea
                    id="edit-notes"
                    className="lineInput lineTextarea"
                    name="notes"
                    placeholder="Aqui você pode escrever alguma observação sobre o seu plano"
                    rows={3}
                    defaultValue={editablePlanNotes.notes}
                  />
                </div>
              </div>

              <h2>Para o que você está estudando?</h2>

              <label className="fieldLabel" htmlFor="edit-edital">
                EDITAIS (OPCIONAL)
              </label>
              <input id="edit-edital" className="lineInput" name="edital" defaultValue={editablePlanNotes.edital} />

              <label className="fieldLabel" htmlFor="edit-role">
                CARGOS (OPCIONAL)
              </label>
              <input id="edit-role" className="lineInput" name="role" defaultValue={editablePlanNotes.role} />

              <div className="fieldLabelRow">
                <label className="fieldLabel" htmlFor="edit-banca">
                  BANCA ORGANIZADORA (OPCIONAL)
                </label>
                <Link className="secondaryBtn small fieldLabelActionBtn" href="/bancas" target="_blank" rel="noopener noreferrer">
                  Ir para Bancas
                </Link>
              </div>
              <select id="edit-banca" className="lineInput" name="banca" defaultValue={editablePlanNotes.banca}>
                <option value="">Selecione uma banca</option>
                {editBancaOptions.map((banca) => (
                  <option key={banca} value={banca}>
                    {banca}
                  </option>
                ))}
              </select>

              <label className="fieldLabel" htmlFor="edit-examDate">
                DATA DA PROVA (OPCIONAL)
              </label>
              <input
                id="edit-examDate"
                className="lineInput"
                type="date"
                name="examDate"
                defaultValue={editablePlan.examDate ? examDateInputValue(new Date(editablePlan.examDate)) : ""}
              />

              <label className="checkboxRow" htmlFor="edit-genericStudy">
                <input id="edit-genericStudy" type="checkbox" name="genericStudy" defaultChecked={editablePlanNotes.genericStudy} />
                <span>Não estou estudando para nenhuma prova específica</span>
              </label>

              <div className="planReferencesManagerRow">
                <PlanReferenceLinksManager
                  planId={editablePlan.id}
                  initialCount={editablePlan._count.referenceLinks}
                />
                <PlanReferenceFilesManager
                  planId={editablePlan.id}
                  initialCount={editablePlan._count.referenceFiles}
                />
              </div>

              <div className="newPlanActions">
                <ConfirmSubmitButton
                  className="dangerBtn dangerDeletePlanBtn"
                  confirmTitle="Remover plano"
                  confirmMessage="Tem certeza que deseja remover este plano? Essa ação não pode ser desfeita."
                  confirmActionLabel="Remover plano"
                  ariaLabel="Remover plano"
                  label="Remover plano"
                  formAction={deletePlan}
                />
                <Link className="ghostButton" href="/?tab=planos">
                  Cancelar
                </Link>
                <button className="button createPlanBtn" type="submit">
                  Salvar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

async function loadBoardProfiles(userId: string) {
  try {
    const ownBoards = await prisma.examBoardProfile.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: { name: true, normalizedName: true }
    });
    if (ownBoards.length > 0) return ownBoards;

    // Fallback: evita select vazio quando as bancas foram cadastradas em outra conta/sessão.
    const systemBoards = await prisma.examBoardProfile.findMany({
      distinct: ["normalizedName"],
      orderBy: [{ normalizedName: "asc" }],
      select: { name: true, normalizedName: true }
    });
    return systemBoards;
  } catch (error) {
    if (!hasMissingBoardSchema(error)) throw error;
    return [];
  }
}

function hasMissingBoardSchema(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("ExamBoardProfile") ||
    error.message.includes("examBoardProfile") ||
    error.message.includes("ExamBoardStyle") ||
    error.message.includes("Unknown argument")
  );
}

function sanitizeBoardName(value: string | null | undefined) {
  if (!value) return "";
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
