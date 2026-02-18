import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { CSSProperties } from "react";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { SubjectPlanSelector } from "@/components/subject-plan-selector";
import { PlanningCreateModal } from "@/components/planning-create-modal";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { buildAndStorePlanSchedule, clearPlanSchedule, parseStoredConfig } from "@/lib/planning/service";

type PlanningPageProps = {
  searchParams: Promise<{ planId?: string; reason?: string }>;
};

function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hours}h${String(mins).padStart(2, "0")}min`;
}

function parseMinutes(value: FormDataEntryValue | null, fallback: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;

  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmmMatch) {
    const hours = Number.parseInt(hhmmMatch[1], 10);
    const minutes = Number.parseInt(hhmmMatch[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
    if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return fallback;
    const total = hours * 60 + minutes;
    return Math.max(0, Math.min(24 * 60, total));
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(24 * 60, parsed));
}

function parseDifficulty(value: FormDataEntryValue | null) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "BAIXA" || normalized === "ALTA") return normalized;
  return "MEDIA";
}

function toIsoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDaysUntilExam(examDate: Date | null) {
  if (!examDate) return 0;
  const today = toMidnight(new Date());
  const exam = toMidnight(examDate);
  const diffMs = exam.getTime() - today.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86_400_000) + 1;
}

function getAvailabilityMinutes(daysUntilExam: number, weekdayMinutes: number, weekendMinutes: number) {
  const today = toMidnight(new Date());
  let weekdays = 0;
  let weekends = 0;
  for (let i = 0; i < daysUntilExam; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const day = date.getDay();
    if (day === 0 || day === 6) weekends += 1;
    else weekdays += 1;
  }
  return {
    totalMinutes: weekdays * weekdayMinutes + weekends * weekendMinutes
  };
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const reason = typeof params.reason === "string" ? decodeURIComponentSafe(params.reason).slice(0, 240) : "";

  const plans = await prisma.plan.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      examDate: true,
      studyWeekdayMinutes: true,
      studyWeekendMinutes: true,
      subjects: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          importance: true,
          knowledgeLevel: true,
          topics: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { id: true, title: true }
          }
        }
      }
    }
  });

  if (plans.length === 0) {
    return (
      <main className="dashboard">
        <section className="dashboardCard dashboardHeader">
          <div>
            <h1>Planejamento</h1>
            <p>Crie um plano para começar seu ciclo de estudos.</p>
          </div>
        </section>
      </main>
    );
  }

  const selectedPlan = plans.find((plan) => plan.id === params.planId) ?? plans[0];
  const todayStart = toMidnight(new Date());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const planOptions = plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    targetUrl: `/planejamento?planId=${plan.id}`,
    imageUrl: plan.imageUrl
  }));

  async function createPlanningAction(formData: FormData) {
    "use server";
    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planId = String(formData.get("planId") ?? "").trim();
    if (!planId) redirect("/planejamento?reason=Plano inválido.");

    const plan = await prisma.plan.findFirst({
      where: { id: planId, userId: currentUserId, isArchived: false },
      select: {
        id: true,
        subjects: {
          select: {
            id: true,
            name: true,
            importance: true,
            knowledgeLevel: true,
            topics: {
              select: { id: true, title: true }
            }
          }
        }
      }
    });
    if (!plan) redirect("/planejamento?reason=Plano inválido.");

    const weekdayMinutes = parseMinutes(formData.get("studyWeekdayMinutes"), 120);
    const weekendMinutes = parseMinutes(formData.get("studyWeekendMinutes"), 180);

    const selectedSubjects = plan.subjects
      .map((subject) => {
        const enabled = formData.get(`subject_enabled_${subject.id}`) === "on";
        if (!enabled) return null;
        const weight = parseMinutes(formData.get(`subject_weight_${subject.id}`), subject.importance || 3);
        const difficulty = parseDifficulty(formData.get(`subject_difficulty_${subject.id}`));
        const selectedTopics = subject.topics.filter((topic) => formData.get(`topic_enabled_${topic.id}`) === "on");
        const topics = (selectedTopics.length > 0 ? selectedTopics : subject.topics).map((topic) => ({
          topicId: topic.id,
          topicTitle: topic.title
        }));
        return {
          subjectId: subject.id,
          subjectName: subject.name,
          weight: Math.max(1, Math.min(10, weight)),
          difficulty,
          topics
        };
      })
      .filter((item): item is { subjectId: string; subjectName: string; weight: number; difficulty: "BAIXA" | "MEDIA" | "ALTA"; topics: Array<{ topicId: string; topicTitle: string }> } =>
        Boolean(item)
      );

    if (selectedSubjects.length === 0) {
      redirect(`/planejamento?planId=${encodeURIComponent(planId)}&reason=Selecione ao menos uma disciplina.`);
    }

    try {
      await buildAndStorePlanSchedule({
        userId: currentUserId,
        planId,
        weekdayMinutes,
        weekendMinutes,
        subjects: selectedSubjects
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao gerar planejamento.";
      redirect(`/planejamento?planId=${encodeURIComponent(planId)}&reason=${encodeURIComponent(message)}`);
    }

    revalidatePath("/planejamento");
    redirect(`/planejamento?planId=${encodeURIComponent(planId)}`);
  }

  async function clearCycleAction(formData: FormData) {
    "use server";
    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");
    const planId = String(formData.get("planId") ?? "").trim();
    if (!planId) redirect("/planejamento?reason=Plano inválido.");
    await clearPlanSchedule(currentUserId, planId);
    revalidatePath("/planejamento");
    redirect(`/planejamento?planId=${encodeURIComponent(planId)}`);
  }

  const [configRow, scheduleRows, todayReviewSchedule, sessionsFromToday, mockAttemptsFromToday] = await Promise.all([
    prisma.planStudyPlanConfig.findFirst({
      where: { userId, planId: selectedPlan.id },
      select: { payload: true, updatedAt: true }
    }),
    prisma.planStudyPlanDay.findMany({
      where: { userId, planId: selectedPlan.id },
      orderBy: [{ date: "asc" }, { position: "asc" }],
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
        source: true,
        llmModel: true
      }
    }),
    prisma.planStudyPlanDay.findMany({
      where: {
        userId,
        reviewsTarget: { gt: 0 },
        source: { in: ["LLM", "USER_REVIEW"] },
        date: {
          gte: todayStart,
          lt: tomorrowStart
        },
        planId: selectedPlan.id
      },
      orderBy: [{ date: "asc" }, { position: "asc" }],
      select: {
        id: true,
        date: true,
        subjectName: true,
        topicTitle: true
      }
    }),
    prisma.studySession.findMany({
      where: {
        userId,
        planId: selectedPlan.id,
        startedAt: {
          gte: todayStart
        }
      },
      select: {
        startedAt: true,
        durationMinutes: true,
        category: true
      }
    }),
    prisma.mockExamAttempt.count({
      where: {
        userId,
        finishedAt: {
          gte: todayStart
        },
        mockExam: {
          planId: selectedPlan.id
        }
      }
    })
  ]);

  const parsedConfig = configRow ? parseStoredConfig(configRow.payload as Prisma.JsonValue) : null;
  const configSeed = parsedConfig
    ? {
        weekdayMinutes: parsedConfig.weekdayMinutes,
        weekendMinutes: parsedConfig.weekendMinutes,
        subjects: parsedConfig.subjects.map((subject) => ({
          subjectId: subject.subjectId,
          weight: subject.weight,
          difficulty: subject.difficulty,
          topicIds: subject.topics.map((topic) => topic.topicId)
        }))
      }
    : null;

  const today = new Date();
  const todayIso = toIsoDay(today);
  const upcomingRows = scheduleRows.filter((row) => toIsoDay(row.date) >= todayIso);
  const totalMinutes = upcomingRows.reduce((acc, row) => acc + row.plannedMinutes, 0);
  const totalQuestions = upcomingRows.reduce((acc, row) => acc + row.questionsTarget, 0);
  const totalReviews = upcomingRows.reduce((acc, row) => acc + row.reviewsTarget, 0);
  const totalMocks = upcomingRows.reduce((acc, row) => acc + row.mockExamsTarget, 0);
  const totalDays = new Set(upcomingRows.map((row) => toIsoDay(row.date))).size;
  const daysUntilExam = getDaysUntilExam(selectedPlan.examDate);
  const availability = getAvailabilityMinutes(daysUntilExam, selectedPlan.studyWeekdayMinutes, selectedPlan.studyWeekendMinutes);
  const studiedTotalMinutes = sessionsFromToday.reduce((acc, session) => acc + Math.max(0, session.durationMinutes), 0);
  const studyProgressPct = totalMinutes > 0 ? Math.max(0, Math.min(100, Math.round((studiedTotalMinutes / totalMinutes) * 100))) : 0;
  const plannedVsAvailabilityPct =
    availability.totalMinutes > 0 ? Math.max(0, Math.min(100, Math.round((totalMinutes / availability.totalMinutes) * 100))) : 0;
  const completedReviews = sessionsFromToday.filter((session) => session.category === "REVIEW").length;
  const completedMocksFromSessions = sessionsFromToday.filter((session) => session.category === "MOCK_EXAM").length;
  const completedMocks = Math.max(mockAttemptsFromToday, completedMocksFromSessions);
  const reviewProgressPct = totalReviews > 0 ? Math.max(0, Math.min(100, Math.round((completedReviews / totalReviews) * 100))) : 0;
  const mockProgressPct = totalMocks > 0 ? Math.max(0, Math.min(100, Math.round((completedMocks / totalMocks) * 100))) : 0;
  const reviewMockTotal = totalReviews + totalMocks;
  const reviewsPct = reviewMockTotal > 0 ? Math.max(0, Math.min(100, Math.round((totalReviews / reviewMockTotal) * 100))) : 0;
  const reviewsVsMocksStyle: CSSProperties = {
    ["--rev-mock" as string]: `${reviewsPct}%`
  };
  const timeUsageStyle: CSSProperties = {
    ["--planning-time-usage" as string]: `${studyProgressPct}%`
  };
  const source = upcomingRows[0]?.source ?? "-";
  const model = upcomingRows[0]?.llmModel ?? "";
  const grouped = new Map<
    string,
    {
      date: Date;
      weekdayLabel: string;
      items: typeof upcomingRows;
      totalMinutes: number;
    }
  >();

  for (const row of upcomingRows) {
    const key = toIsoDay(row.date);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        date: row.date,
        weekdayLabel: row.weekdayLabel,
        items: [row],
        totalMinutes: row.plannedMinutes
      });
      continue;
    }
    current.items.push(row);
    current.totalMinutes += row.plannedMinutes;
  }
  const studiedByDay = new Map<string, number>();
  for (const session of sessionsFromToday) {
    const key = toIsoDay(session.startedAt);
    studiedByDay.set(key, (studiedByDay.get(key) ?? 0) + Math.max(0, session.durationMinutes));
  }
  const dailyPlanned = Array.from(grouped.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 7)
    .map((day) => ({
      key: toIsoDay(day.date),
      label: new Date(day.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      minutes: day.totalMinutes,
      studiedMinutes: studiedByDay.get(toIsoDay(day.date)) ?? 0
    }));

  const todayLabel = `${todayStart.toLocaleDateString("pt-BR")} · ${capitalize(
    todayStart.toLocaleDateString("pt-BR", { weekday: "long" })
  )}`;

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Planejamento</h1>
          <p>Monte e replaneje seu ciclo com apoio de LLM até a data da prova.</p>
        </div>
        <div className="subjectDetailHeaderActions">
          <PlanningCreateModal
            title="Gerar novo ciclo"
            planId={selectedPlan.id}
            subjects={selectedPlan.subjects}
            action={createPlanningAction}
          />
          <PlanningCreateModal
            title="Ajustar ciclo atual"
            planId={selectedPlan.id}
            subjects={selectedPlan.subjects}
            initialConfig={configSeed}
            action={createPlanningAction}
          />
          <form action={clearCycleAction}>
            <input type="hidden" name="planId" value={selectedPlan.id} />
            <ConfirmSubmitButton
              className="dangerBtn"
              label="Remover"
              confirmTitle="Remover planejamento"
              confirmMessage="Tem certeza que deseja remover o cronograma deste plano? Você poderá gerar um novo depois."
              confirmActionLabel="Remover planejamento"
              ariaLabel="Remover planejamento"
            />
          </form>
          <SubjectPlanSelector options={planOptions} currentPlanId={selectedPlan.id} />
        </div>
      </section>

      {reason ? (
        <section className="dashboardCard">
          <p className="errText">{reason}</p>
        </section>
      ) : null}

      <section className="planningTopStats">
        <article className="dashboardCard planningMiniCard">
          <h3>Dias planejados</h3>
          <div className="planningCycleCount">{totalDays}</div>
        </article>
        <article className="dashboardCard planningMiniCard planningTimeCard">
          <h3>Tempo total</h3>
          <div className="planningTimeVisualRow">
            <div className="planningTimeRadial" style={timeUsageStyle}>
              <span>{studyProgressPct}%</span>
            </div>
            <div>
              <p className="planningTimeValue">{formatDuration(totalMinutes)}</p>
              <small>
                {formatDuration(studiedTotalMinutes)} estudados de {formatDuration(totalMinutes)} planejados
              </small>
            </div>
          </div>
          <div className="planningKpiTrack" aria-label={`Progresso de estudo ${studyProgressPct}%`}>
            <span style={{ width: `${studyProgressPct}%` }} />
          </div>
          <small>{studyProgressPct}% da meta concluída · plano ocupa {plannedVsAvailabilityPct}% da disponibilidade total</small>
          <div className="planningTimeTrend">
            {dailyPlanned.map((day) => (
              <div key={day.key} className="planningTimeTrendBar">
                <div className="planningTimeTrendTrack">
                  <div
                    className="planningTimeTrendFill"
                    style={{ width: `${day.minutes > 0 ? Math.max(0, Math.min(100, Math.round((day.studiedMinutes / day.minutes) * 100))) : 0}%` }}
                  />
                </div>
                <small>{formatDuration(day.studiedMinutes)} / {formatDuration(day.minutes)}</small>
                <span>{day.label}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="dashboardCard planningMiniCard">
          <h3>Questões</h3>
          <div className="planningCycleCount">{totalQuestions}</div>
        </article>
        <article className="dashboardCard planningMiniCard planningRevMockCard">
          <h3>Revisões / Simulados</h3>
          <div className="planningRevMockGraphic">
            <div className="planningRevMockDonut" style={reviewsVsMocksStyle}>
              <span>{reviewMockTotal}</span>
            </div>
            <div className="planningRevMockLegend">
              <p>
                <b>R</b> {completedReviews}/{totalReviews}
              </p>
              <p>
                <b>S</b> {completedMocks}/{totalMocks}
              </p>
            </div>
          </div>
          <div className="planningRevMockCompare">
            <div>
              <small>Revisões ({reviewProgressPct}%)</small>
              <div className="planningRevMockCompareTrack">
                <span style={{ width: `${totalReviews > 0 ? reviewProgressPct : 0}%` }} />
              </div>
            </div>
            <div>
              <small>Simulados ({mockProgressPct}%)</small>
              <div className="planningRevMockCompareTrack mock">
                <span style={{ width: `${totalMocks > 0 ? mockProgressPct : 0}%` }} />
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboardCard">
        <div className="planningSequenceHeader">
          <h3>Cronograma até a prova</h3>
          <span>
            Fonte: {source === "LLM" ? `LLM${model ? ` · ${model}` : ""}` : "Fallback local"}
            {configRow ? ` · atualizado em ${new Date(configRow.updatedAt).toLocaleString("pt-BR")}` : ""}
          </span>
        </div>
        {upcomingRows.length === 0 ? (
          <p className="emptyState">Nenhum cronograma gerado. Clique em &quot;Criar planejamento&quot;.</p>
        ) : (
          <div className="planningScheduleDays">
            {Array.from(grouped.values()).map((day) => (
              <article key={toIsoDay(day.date)} className="planningScheduleDayCard">
                <header className="planningScheduleDayHeader">
                  <strong>{new Date(day.date).toLocaleDateString("pt-BR")} · {capitalize(day.weekdayLabel)}</strong>
                  <span>{formatDuration(day.totalMinutes)}</span>
                </header>
                <div className="planningScheduleRows">
                  {day.items.map((item) => (
                    <div key={item.id} className="planningScheduleRow">
                      <div>
                        <strong>{item.subjectName}</strong>
                        <small>{item.topicTitle ?? "Sem tópico específico"}</small>
                      </div>
                      <div className="planningScheduleMeta">
                        <span>{formatDuration(item.plannedMinutes)}</span>
                        <span>Q {item.questionsTarget}</span>
                        <span>R {item.reviewsTarget}</span>
                        <span>S {item.mockExamsTarget}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboardCard planningTodayList">
        <h3>Revisões de hoje (agenda real)</h3>
        <small>{todayLabel} · baseado no histórico de revisões.</small>
        {todayReviewSchedule.length === 0 ? (
          <p className="emptyState">Nenhuma revisão agendada para hoje.</p>
        ) : (
          <ul>
            {todayReviewSchedule.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.topicTitle ?? "Sem tópico específico"}</strong> · {item.subjectName}
                </span>
                <span>{new Date(item.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
