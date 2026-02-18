import { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { StatisticsPerformanceChart } from "@/components/statistics-performance-chart";

type StatisticsPageProps = {
  searchParams: Promise<{
    period?: string;
    subjectId?: string;
    topicId?: string;
    start?: string;
    end?: string;
  }>;
};

type StatsPeriod = "all" | "7d" | "30d" | "month" | "custom";

function safePct(correct: number, wrong: number) {
  const total = Math.max(0, correct + wrong);
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

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

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLabel(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export default async function StatisticsPage({ searchParams }: StatisticsPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const allowedPeriods: StatsPeriod[] = ["all", "7d", "30d", "month", "custom"];
  const period = allowedPeriods.includes((params.period as StatsPeriod) ?? "all")
    ? ((params.period as StatsPeriod) ?? "all")
    : "all";
  const requestedSubjectId = (params.subjectId ?? "").trim();
  const requestedTopicId = (params.topicId ?? "").trim();
  const startDateInput = params.start?.trim() ?? "";
  const endDateInput = params.end?.trim() ?? "";

  const subjects = await prisma.subject.findMany({
    where: { plan: { userId, isArchived: false } },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  const safeSubjectId = subjects.some((subject) => subject.id === requestedSubjectId) ? requestedSubjectId : "";

  const topics = await prisma.topic.findMany({
    where: {
      subject: { plan: { userId, isArchived: false } },
      ...(safeSubjectId ? { subjectId: safeSubjectId } : {})
    },
    select: {
      id: true,
      title: true,
      subject: { select: { name: true } }
    },
    orderBy: [{ subject: { name: "asc" } }, { title: "asc" }]
  });

  const safeTopicId = topics.some((topic) => topic.id === requestedTopicId) ? requestedTopicId : "";

  const now = new Date();
  let range: Prisma.DateTimeFilter | undefined;

  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    const start = startOfDay(now);
    start.setDate(start.getDate() - (days - 1));
    range = { gte: start };
  } else if (period === "month") {
    range = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
  } else if (period === "custom") {
    const customStart = parseDateInput(startDateInput);
    const customEnd = parseDateInput(endDateInput);
    if (customStart || customEnd) {
      range = {};
      if (customStart) range.gte = startOfDay(customStart);
      if (customEnd) {
        const exclusiveEnd = startOfDay(customEnd);
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
        range.lt = exclusiveEnd;
      }
    }
  }

  const questionRefFilter: Prisma.QuestionWhereInput = {
    ...(safeSubjectId ? { subjectId: safeSubjectId } : {}),
    ...(safeTopicId ? { topicId: safeTopicId } : {})
  };

  const questionFilter: Prisma.QuestionWhereInput = {
    userId,
    ...questionRefFilter,
    ...(range ? { createdAt: range } : {})
  };

  const responseFilter: Prisma.QuestionResponseWhereInput = {
    userId,
    question: questionRefFilter,
    ...(range ? { createdAt: range } : {})
  };

  const mockAttemptFilter: Prisma.MockExamAttemptWhereInput = {
    userId,
    ...(range ? { finishedAt: range } : {}),
    ...(safeSubjectId || safeTopicId
      ? {
          responses: {
            some: {
              question: questionRefFilter
            }
          }
        }
      : {})
  };

  const [
    totalQuestions,
    totalPracticeResponses,
    practiceCorrect,
    totalMockExams,
    totalMockAttempts,
    mockAggregate,
    recentMockAttempts,
    responsesForChart
  ] = await Promise.all([
    prisma.question.count({ where: questionFilter }),
    prisma.questionResponse.count({ where: { ...responseFilter, context: "PRACTICE" } }),
    prisma.questionResponse.count({ where: { ...responseFilter, context: "PRACTICE", isCorrect: true } }),
    prisma.mockExam.count({
      where: {
        userId,
        ...(safeSubjectId || safeTopicId
          ? {
              items: {
                some: {
                  question: questionRefFilter
                }
              }
            }
          : {}),
        ...(range ? { createdAt: range } : {})
      }
    }),
    prisma.mockExamAttempt.count({ where: mockAttemptFilter }),
    prisma.mockExamAttempt.aggregate({
      where: mockAttemptFilter,
      _avg: { scorePct: true },
      _sum: { correctCount: true, wrongCount: true, blankCount: true }
    }),
    prisma.mockExamAttempt.findMany({
      where: mockAttemptFilter,
      orderBy: { finishedAt: "desc" },
      take: 10,
      include: {
        mockExam: { select: { title: true } }
      }
    }),
    prisma.questionResponse.findMany({
      where: responseFilter,
      select: {
        createdAt: true,
        isCorrect: true,
        selectedOptionId: true
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const practiceWrong = Math.max(0, totalPracticeResponses - practiceCorrect);
  const practiceAccuracy = safePct(practiceCorrect, practiceWrong);

  const mockCorrect = mockAggregate._sum.correctCount ?? 0;
  const mockWrong = mockAggregate._sum.wrongCount ?? 0;
  const mockBlank = mockAggregate._sum.blankCount ?? 0;
  const mockQuestionsResolved = mockCorrect + mockWrong + mockBlank;
  const mockAccuracy = safePct(mockCorrect, mockWrong);
  const mockAvgScore = Math.round(mockAggregate._avg.scorePct ?? 0);

  const chartMap = new Map<string, { dateKey: string; label: string; total: number; correct: number; wrong: number }>();
  for (const response of responsesForChart) {
    const day = startOfDay(response.createdAt);
    const key = formatDateKey(day);
    const entry = chartMap.get(key) ?? { dateKey: key, label: formatLabel(day), total: 0, correct: 0, wrong: 0 };

    entry.total += 1;
    if (response.selectedOptionId) {
      if (response.isCorrect) entry.correct += 1;
      else entry.wrong += 1;
    }

    chartMap.set(key, entry);
  }

  const chartPoints = Array.from(chartMap.values())
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
    .map((point) => ({
      dateKey: point.dateKey,
      label: point.label,
      total: point.total,
      accuracy: safePct(point.correct, point.wrong)
    }));

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Estatísticas</h1>
          <p>Resumo de desempenho em questões e simulados resolvidos.</p>
        </div>
      </section>

      <section className="dashboardCard historyFiltersCard">
        <form method="get" className="historyFiltersForm">
          <label className="historyFilterField">
            <span>Período</span>
            <select name="period" defaultValue={period}>
              <option value="all">Todo período</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="month">Mês atual</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>

          <label className="historyFilterField">
            <span>Disciplina</span>
            <select name="subjectId" defaultValue={safeSubjectId}>
              <option value="">Todas</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>

          <label className="historyFilterField">
            <span>Tópico</span>
            <select name="topicId" defaultValue={safeTopicId}>
              <option value="">Todos</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.subject.name} · {topic.title}
                </option>
              ))}
            </select>
          </label>

          <label className="historyFilterField">
            <span>Início</span>
            <input type="date" name="start" defaultValue={startDateInput} />
          </label>

          <label className="historyFilterField">
            <span>Fim</span>
            <input type="date" name="end" defaultValue={endDateInput} />
          </label>

          <div className="historyFilterActions">
            <button className="primaryBtn" type="submit">
              Filtrar
            </button>
            <Link className="ghostButton" href="/estatisticas">
              Limpar
            </Link>
          </div>
        </form>
      </section>

      <section className="statsKpiGrid">
        <article className="dashboardCard">
          <h3>Banco de questões</h3>
          <p className="subjectDetailBigNumber">{totalQuestions}</p>
          <small>Questões cadastradas no filtro</small>
        </article>

        <article className="dashboardCard">
          <h3>Questões práticas</h3>
          <p className="subjectDetailBigNumber">{totalPracticeResponses}</p>
          <small>{practiceAccuracy}% de acerto</small>
        </article>

        <article className="dashboardCard">
          <h3>Simulados</h3>
          <p className="subjectDetailBigNumber">{totalMockExams}</p>
          <small>{totalMockAttempts} tentativa(s)</small>
        </article>

        <article className="dashboardCard">
          <h3>Nota média simulados</h3>
          <p className="subjectDetailBigNumber">{mockAvgScore}%</p>
          <small>{mockAccuracy}% de acerto sem contar brancos</small>
        </article>
      </section>

      <section className="dashboardCard statsChartCard">
        <h2>Evolução no período</h2>
        <StatisticsPerformanceChart points={chartPoints} />
      </section>

      <section className="dashboardCard">
        <h2>Detalhes acumulados</h2>
        <div className="subscriptionTableWrap">
          <table className="subscriptionTable statsTable">
            <thead>
              <tr>
                <th>Métrica</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Acertos em questões práticas</td>
                <td>{practiceCorrect}</td>
              </tr>
              <tr>
                <td>Erros em questões práticas</td>
                <td>{practiceWrong}</td>
              </tr>
              <tr>
                <td>Questões resolvidas em simulados</td>
                <td>{mockQuestionsResolved}</td>
              </tr>
              <tr>
                <td>Acertos em simulados</td>
                <td>{mockCorrect}</td>
              </tr>
              <tr>
                <td>Erros em simulados</td>
                <td>{mockWrong}</td>
              </tr>
              <tr>
                <td>Brancos em simulados</td>
                <td>{mockBlank}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboardCard">
        <h2>Últimas tentativas de simulado</h2>
        {recentMockAttempts.length === 0 ? <p className="emptyState">Nenhuma tentativa registrada.</p> : null}

        {recentMockAttempts.length > 0 ? (
          <div className="subscriptionTableWrap">
            <table className="subscriptionTable statsTable">
              <thead>
                <tr>
                  <th>Simulado</th>
                  <th>Data</th>
                  <th>Acertos</th>
                  <th>Erros</th>
                  <th>Brancos</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {recentMockAttempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{attempt.mockExam.title || "Simulado"}</td>
                    <td>{new Date(attempt.finishedAt).toLocaleString("pt-BR")}</td>
                    <td>{attempt.correctCount}</td>
                    <td>{attempt.wrongCount}</td>
                    <td>{attempt.blankCount}</td>
                    <td>{attempt.scorePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
