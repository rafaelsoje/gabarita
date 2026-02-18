import Link from "next/link";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { StudySessionRowActions } from "@/components/study-session-row-actions";

type HistoryPageProps = {
  searchParams: Promise<{
    period?: string;
    planId?: string;
    subjectId?: string;
    start?: string;
    end?: string;
  }>;
};

type HistoryPeriod = "all" | "today" | "7d" | "30d" | "month" | "custom";

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseDateInput(value: string | undefined) {
  if (!value) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDuration(totalMinutes: number) {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}min`;
}

function formatClock(totalMinutes: number) {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

function categoryLabel(category: "THEORY" | "PRACTICE" | "REVIEW" | "MOCK_EXAM") {
  if (category === "THEORY") return "TEORIA";
  if (category === "PRACTICE") return "PRÁTICA";
  if (category === "REVIEW") return "REVISÃO";
  return "SIMULADO";
}

function categoryClass(category: "THEORY" | "PRACTICE" | "REVIEW" | "MOCK_EXAM") {
  if (category === "THEORY") return "theory";
  if (category === "PRACTICE") return "practice";
  if (category === "REVIEW") return "review";
  return "mock";
}

function scoreClass(score: number) {
  if (score >= 90) return "score-good";
  if (score >= 70) return "score-warn";
  return "score-bad";
}

function parseSessionNotes(notes: string | null) {
  if (!notes) return { material: "-", comment: null as string | null, pagesStart: null as number | null, pagesEnd: null as number | null };
  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { material: "-", comment: null as string | null, pagesStart: null as number | null, pagesEnd: null as number | null };

  let pagesStart: number | null = null;
  let pagesEnd: number | null = null;
  const bodyLines = lines.filter((line) => {
    if (!line.startsWith("@meta ")) return true;
    const tokens = line.slice("@meta ".length).split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const [key, rawValue] = token.split("=");
      const value = Number.parseInt(rawValue ?? "", 10);
      if (!Number.isFinite(value)) continue;
      if (key === "pagesStart") pagesStart = value;
      if (key === "pagesEnd") pagesEnd = value;
    }
    return false;
  });

  if (bodyLines.length === 0) return { material: "-", comment: null as string | null, pagesStart, pagesEnd };

  const first = bodyLines[0];
  if (first.startsWith("Material:")) {
    const material = first.slice("Material:".length).trim() || "-";
    const comment = bodyLines.slice(1).join("\n").trim() || null;
    return { material, comment, pagesStart, pagesEnd };
  }

  return { material: "-", comment: bodyLines.join("\n") || null, pagesStart, pagesEnd };
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const allowedPeriods: HistoryPeriod[] = ["all", "today", "7d", "30d", "month", "custom"];
  const period = allowedPeriods.includes((params.period as HistoryPeriod) ?? "all")
    ? ((params.period as HistoryPeriod) ?? "all")
    : "all";
  const requestedPlanId = params.planId?.trim() ?? "";
  const selectedSubjectId = params.subjectId?.trim() ?? "";
  const startDateInput = params.start?.trim() ?? "";
  const endDateInput = params.end?.trim() ?? "";

  const now = new Date();
  const whereFilters: Prisma.StudySessionWhereInput[] = [];

  const plans = await prisma.plan.findMany({
    where: { userId, isArchived: false },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" }
  });
  const selectedPlanId = plans.some((plan) => plan.id === requestedPlanId) ? requestedPlanId : "";

  if (selectedPlanId) {
    whereFilters.push({
      OR: [
        { planId: selectedPlanId },
        { subject: { planId: selectedPlanId } },
        { topic: { subject: { planId: selectedPlanId } } }
      ]
    });
  }

  whereFilters.push({
    OR: [
      { plan: { is: { isArchived: false } } },
      { planId: null, subject: { is: { plan: { isArchived: false } } } },
      { planId: null, subjectId: null, topic: { is: { subject: { plan: { isArchived: false } } } } }
    ]
  });

  if (selectedSubjectId) {
    whereFilters.push({
      OR: [{ subjectId: selectedSubjectId }, { topic: { subjectId: selectedSubjectId } }]
    });
  }

  if (period === "today") {
    const start = startOfDay(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    whereFilters.push({ startedAt: { gte: start, lt: end } });
  } else if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    const start = startOfDay(now);
    start.setDate(start.getDate() - (days - 1));
    whereFilters.push({ startedAt: { gte: start } });
  } else if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    whereFilters.push({ startedAt: { gte: start } });
  } else if (period === "custom") {
    const customStart = parseDateInput(startDateInput);
    const customEnd = parseDateInput(endDateInput);
    if (customStart || customEnd) {
      const range: Prisma.DateTimeFilter = {};
      if (customStart) {
        range.gte = startOfDay(customStart);
      }
      if (customEnd) {
        const exclusiveEnd = startOfDay(customEnd);
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
        range.lt = exclusiveEnd;
      }
      whereFilters.push({ startedAt: range });
    }
  }

  const where: Prisma.StudySessionWhereInput = {
    userId,
    ...(whereFilters.length > 0 ? { AND: whereFilters } : {})
  };

  const [subjects, summary, sessions] = await Promise.all([
    prisma.subject.findMany({
      where: {
        plan: {
          userId,
          isArchived: false,
          ...(selectedPlanId ? { id: selectedPlanId } : {})
        }
      },
      select: {
        id: true,
        name: true,
        plan: { select: { title: true } }
      },
      orderBy: [{ name: "asc" }]
    }),
    prisma.studySession.aggregate({
      where,
      _sum: {
        durationMinutes: true,
        questionsCorrect: true,
        questionsWrong: true,
        pagesRead: true
      },
      _count: { id: true }
    }),
    prisma.studySession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: {
        plan: { select: { id: true, title: true } },
        subject: { select: { id: true, name: true } },
        topic: {
          select: {
            id: true,
            title: true,
            subject: {
              select: {
                id: true,
                name: true,
                plan: { select: { id: true, title: true } }
              }
            }
          }
        }
      }
    })
  ]);

  const totalMinutes = summary._sum.durationMinutes ?? 0;
  const totalCorrect = summary._sum.questionsCorrect ?? 0;
  const totalWrong = summary._sum.questionsWrong ?? 0;
  const totalPages = summary._sum.pagesRead ?? 0;
  const resolvedQuestions = totalCorrect + totalWrong;
  const performance = resolvedQuestions > 0 ? Math.round((totalCorrect / resolvedQuestions) * 100) : 0;

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Histórico</h1>
          <p>Atividade completa de estudos em todos os planos e disciplinas.</p>
        </div>
      </section>

      <section className="dashboardCard historyFiltersCard">
        <form method="get" className="historyFiltersForm">
          <label className="historyFilterField">
            <span>Período</span>
            <select name="period" defaultValue={period}>
              <option value="all">Todo período</option>
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="month">Mês atual</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>

          <label className="historyFilterField">
            <span>Plano</span>
            <select name="planId" defaultValue={selectedPlanId}>
              <option value="">Todos os planos</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </label>

          <label className="historyFilterField">
            <span>Disciplina</span>
            <select name="subjectId" defaultValue={selectedSubjectId}>
              <option value="">Todas as disciplinas</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} • {subject.plan.title}
                </option>
              ))}
            </select>
          </label>

          <label className="historyFilterField">
            <span>De</span>
            <input type="date" name="start" defaultValue={startDateInput} disabled={period !== "custom"} />
          </label>

          <label className="historyFilterField">
            <span>Até</span>
            <input type="date" name="end" defaultValue={endDateInput} disabled={period !== "custom"} />
          </label>

          <div className="historyFilterActions">
            <button type="submit" className="historyFilterSubmit">
              Filtrar
            </button>
            <Link className="ghostButton" href="/historico">
              Limpar
            </Link>
          </div>
        </form>
      </section>

      <section className="subjectDetailStatsGrid">
        <article className="dashboardCard">
          <h3>REGISTROS</h3>
          <p className="subjectDetailBigNumber">{summary._count.id}</p>
        </article>
        <article className="dashboardCard">
          <h3>TEMPO TOTAL</h3>
          <p className="subjectDetailBigNumber">{formatDuration(totalMinutes)}</p>
        </article>
        <article className="dashboardCard">
          <h3>DESEMPENHO GERAL</h3>
          <p>
            <span className="okText">{totalCorrect} acertos</span>
          </p>
          <p>
            <span className="errText">{totalWrong} erros</span>
          </p>
          <p className="subjectDetailBigNumber">{performance}%</p>
        </article>
        <article className="dashboardCard">
          <h3>PÁGINAS LIDAS</h3>
          <p className="subjectDetailBigNumber">{totalPages}</p>
        </article>
      </section>

      <section className="dashboardCard historyActivityCard">
        <h3>ATIVIDADE DE ESTUDO</h3>
        {sessions.length === 0 ? (
          <p className="emptyState">Nenhum registro encontrado para os filtros selecionados.</p>
        ) : (
          <div className="subscriptionTableWrap">
            <table className="subscriptionTable historyTableWide historyActivityTable">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Plano</th>
                  <th>Disciplina</th>
                  <th>Tópico</th>
                  <th>Categoria</th>
                  <th>Tempo</th>
                  <th>✓</th>
                  <th>✕</th>
                  <th>%</th>
                  <th>Páginas</th>
                  <th>Vídeos</th>
                  <th>Material</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const qTotal = session.questionsCorrect + session.questionsWrong;
                  const pct = qTotal > 0 ? Math.round((session.questionsCorrect / qTotal) * 100) : 0;
                  const parsedNotes = parseSessionNotes(session.notes);
                  const subjectRef = session.subject ?? session.topic?.subject ?? null;
                  const planRef = session.plan ?? session.topic?.subject.plan ?? null;
                  return (
                    <tr key={session.id}>
                      <td>{new Date(session.startedAt).toLocaleDateString("pt-BR")}</td>
                      <td>{planRef?.title ?? "-"}</td>
                      <td>{subjectRef?.name ?? "-"}</td>
                      <td>{session.topic?.title ?? "-"}</td>
                      <td>
                        <span className={`studyHistoryCategoryBadge ${categoryClass(session.category)}`}>
                          {categoryLabel(session.category)}
                        </span>
                      </td>
                      <td>{formatClock(session.durationMinutes)}</td>
                      <td>{session.questionsCorrect}</td>
                      <td>{session.questionsWrong}</td>
                      <td>
                        <span className={`editalScoreBadge ${scoreClass(pct)}`}>{pct}</span>
                      </td>
                      <td>{session.pagesRead}</td>
                      <td>{formatClock(session.videoMinutes)}</td>
                      <td>{parsedNotes.material}</td>
                      <td>
                        <StudySessionRowActions
                          comment={parsedNotes.comment}
                          editPayload={{
                            sessionId: session.id,
                            category: session.category,
                            studyDate: session.startedAt.toISOString(),
                            durationMinutes: session.durationMinutes,
                            subjectId: subjectRef?.id ?? null,
                            subjectName: subjectRef?.name ?? "Disciplina",
                            topicId: session.topic?.id ?? null,
                            topicTitle: session.topic?.title ?? null,
                            material: parsedNotes.material === "-" ? "" : parsedNotes.material,
                            comment: parsedNotes.comment ?? "",
                            questionsCorrect: session.questionsCorrect,
                            questionsWrong: session.questionsWrong,
                            pagesRead: session.pagesRead,
                            pagesStart: parsedNotes.pagesStart,
                            pagesEnd: parsedNotes.pagesEnd,
                            videoMinutes: session.videoMinutes
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
