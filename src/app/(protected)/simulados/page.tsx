import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MockExamSolveModal } from "@/components/mock-exam-solve-modal";
import { NewMockExamModal } from "@/components/new-mock-exam-modal";
import { createMockExamFromRules } from "@/lib/questions/service";

type MockExamsPageProps = {
  searchParams: Promise<{
    planId?: string;
    examId?: string;
  }>;
};

function parsePositiveInt(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.min(100, parsed);
}

function parseDurationMinutes(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.min(600, parsed);
}

export default async function MockExamsPage({ searchParams }: MockExamsPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const requestedPlanId = (params.planId ?? "").trim();
  const requestedExamId = (params.examId ?? "").trim();

  async function createMockExamAction(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planId = String(formData.get("planId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const durationMinutes = parseDurationMinutes(formData.get("durationMinutes"));

    const bySubject: Array<{ id: string; amount: number }> = [];
    const byTopic: Array<{ id: string; amount: number }> = [];

    for (const [key, rawValue] of formData.entries()) {
      if (typeof rawValue !== "string") continue;
      if (key.startsWith("subject_")) {
        const amount = parsePositiveInt(rawValue);
        if (amount > 0) bySubject.push({ id: key.slice("subject_".length), amount });
      }
      if (key.startsWith("topic_")) {
        const amount = parsePositiveInt(rawValue);
        if (amount > 0) byTopic.push({ id: key.slice("topic_".length), amount });
      }
    }

    let mockExamId: string;
    try {
      mockExamId = await createMockExamFromRules({
        userId: currentUserId,
        planId: planId || undefined,
        title,
        durationMinutes: durationMinutes || undefined,
        bySubject,
        byTopic
      });
    } catch {
      redirect(`/simulados${planId ? `?planId=${encodeURIComponent(planId)}&toast=action_error` : "?toast=action_error"}`);
    }
    revalidatePath("/simulados");
    redirect(`/simulados?${planId ? `planId=${encodeURIComponent(planId)}&` : ""}examId=${encodeURIComponent(mockExamId)}&toast=mock_created`);
  }

  async function deleteMockExamAction(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const mockExamId = String(formData.get("mockExamId") ?? "").trim();
    const planId = String(formData.get("planId") ?? "").trim();
    if (!mockExamId) {
      redirect(`/simulados${planId ? `?planId=${encodeURIComponent(planId)}` : ""}`);
    }

    await prisma.mockExam.deleteMany({
      where: {
        id: mockExamId,
        userId: currentUserId
      }
    });

    revalidatePath("/simulados");
    redirect(`/simulados${planId ? `?planId=${encodeURIComponent(planId)}` : ""}`);
  }

  const plans = await prisma.plan.findMany({
    where: { userId, isArchived: false },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" }
  });

  const safePlanId = plans.some((plan) => plan.id === requestedPlanId) ? requestedPlanId : "";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const subjects = await prisma.subject.findMany({
    where: {
      plan: { userId, isArchived: false },
      ...(safePlanId ? { planId: safePlanId } : {})
    },
    select: {
      id: true,
      name: true,
      planId: true,
      _count: { select: { topics: true } }
    },
    orderBy: { name: "asc" }
  });

  const topics = await prisma.topic.findMany({
    where: {
      subject: {
        plan: { userId, isArchived: false },
        ...(safePlanId ? { planId: safePlanId } : {})
      }
    },
    select: {
      id: true,
      title: true,
      subjectId: true,
      subject: { select: { id: true, name: true } }
    },
    orderBy: [{ subject: { name: "asc" } }, { title: "asc" }]
  });

  const todayLlmMockRows = await prisma.planStudyPlanDay.findMany({
    where: {
      userId,
      source: "LLM",
      mockExamsTarget: { gt: 0 },
      date: {
        gte: todayStart,
        lt: tomorrowStart
      },
      ...(safePlanId ? { planId: safePlanId } : {}),
      plan: {
        isArchived: false
      }
    },
    orderBy: [{ plan: { title: "asc" } }, { subjectName: "asc" }, { position: "asc" }],
    select: {
      id: true,
      subjectName: true,
      topicTitle: true,
      mockExamsTarget: true,
      plan: {
        select: {
          title: true
        }
      }
    }
  });

  const todayLlmMockCount = todayLlmMockRows.reduce((acc, row) => acc + row.mockExamsTarget, 0);

  const mockExams = await prisma.mockExam.findMany({
    where: {
      userId,
      ...(safePlanId ? { planId: safePlanId } : {})
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      durationMinutes: true,
      _count: { select: { items: true, attempts: true } },
      attempts: {
        select: {
          scorePct: true,
          finishedAt: true,
          correctCount: true,
          wrongCount: true,
          blankCount: true
        },
        orderBy: { finishedAt: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" },
    take: 30
  });

  const safeExamId = mockExams.some((exam) => exam.id === requestedExamId) ? requestedExamId : mockExams[0]?.id ?? "";

  const selectedExam = safeExamId
    ? await prisma.mockExam.findFirst({
        where: { id: safeExamId, userId },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: {
              question: {
                include: {
                  subject: { select: { name: true } },
                  topic: { select: { title: true } },
                  options: {
                    orderBy: { position: "asc" }
                  }
                }
              }
            }
          },
          attempts: {
            orderBy: { finishedAt: "desc" },
            take: 10
          },
          plan: {
            select: { title: true }
          }
        }
      })
    : null;

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Simulados</h1>
          <p>Monte simulados por disciplina/tópico e registre seus resultados.</p>
        </div>
        <div className="subjectDetailHeaderActions">
          <NewMockExamModal planId={safePlanId} subjects={subjects} topics={topics} action={createMockExamAction} />
        </div>
      </section>

      <section className="mockTodayPlannedStandalone">
        <div className="mockTodayPlanned">
          <strong>Programados hoje pela LLM: {todayLlmMockCount} simulado(s)</strong>
          {todayLlmMockRows.length === 0 ? (
            <small>Nenhum simulado programado para hoje.</small>
          ) : (
            <ul className="mockTodayPlannedList">
              {todayLlmMockRows.map((row) => (
                <li key={row.id}>
                  <span>{row.subjectName}{row.topicTitle ? ` · ${row.topicTitle}` : ""}</span>
                  <small>
                    {row.mockExamsTarget} simulado(s){safePlanId ? "" : ` · ${row.plan.title}`}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="dashboardCard historyFiltersCard">
        <form method="get" className="historyFiltersForm">
          <label className="historyFilterField">
            <span>Plano</span>
            <select name="planId" defaultValue={safePlanId}>
              <option value="">Todos os planos</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </label>
          <div className="historyFilterActions">
            <button className="primaryBtn" type="submit">
              Filtrar
            </button>
            <Link className="ghostButton" href="/simulados">
              Limpar
            </Link>
          </div>
        </form>
      </section>

      <section className="dashboardCard mockListCard">
        <header className="questionsSectionHeader">
          <h2>Simulados criados</h2>
          <p>{mockExams.length} simulado(s).</p>
        </header>

        {mockExams.length === 0 ? <p className="emptyState">Você ainda não criou simulados.</p> : null}

        <div className="mockListRows">
          {mockExams.map((exam) => {
            const lastAttempt = exam.attempts[0];
            return (
              <article key={exam.id} className={`mockListRow ${safeExamId === exam.id ? "active" : ""}`}>
                <div>
                  <strong>{exam.title || "Simulado"}</strong>
                  <small>
                    {exam._count.items} questão(ões) · {exam._count.attempts} tentativa(s)
                  </small>
                  <small>{exam.durationMinutes ? `Tempo planejado: ${exam.durationMinutes} min` : "Sem tempo definido"}</small>
                  {lastAttempt ? (
                    <small>
                      Última nota: {lastAttempt.scorePct}% ({lastAttempt.correctCount}/{lastAttempt.correctCount + lastAttempt.wrongCount + lastAttempt.blankCount})
                    </small>
                  ) : null}
                </div>
                <div className="mockListActions">
                  <Link
                    className="secondaryBtn small"
                    href={`/simulados?${safePlanId ? `planId=${encodeURIComponent(safePlanId)}&` : ""}examId=${encodeURIComponent(exam.id)}`}
                  >
                    Abrir
                  </Link>
                  <form action={deleteMockExamAction}>
                    <input type="hidden" name="mockExamId" value={exam.id} />
                    <input type="hidden" name="planId" value={safePlanId} />
                    <ConfirmSubmitButton
                      className="dangerBtn small"
                      label="Remover"
                      confirmTitle="Remover simulado"
                      confirmMessage="Tem certeza que deseja remover este simulado? Esta ação não pode ser desfeita."
                      confirmActionLabel="Remover"
                    />
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selectedExam ? (
        <section className="dashboardCard mockSolveCard">
          <header className="questionsSectionHeader">
            <h2>{selectedExam.title || "Simulado"}</h2>
            <p>
              {selectedExam.items.length} questão(ões) para resolver.
              {selectedExam.durationMinutes ? ` Tempo planejado: ${selectedExam.durationMinutes} min.` : ""}
            </p>
          </header>

          <div className="mockSolveIntro">
            <div>
              <p className="libraryListMeta">
                Plano: <b>{selectedExam.plan?.title ?? "Sem plano"}</b>
              </p>
              <p className="libraryListMeta">A resolução acontece em uma janela modal com navegação por questão.</p>
            </div>
            <MockExamSolveModal
              examId={selectedExam.id}
              title={selectedExam.title || "Simulado"}
              plannedDurationMinutes={selectedExam.durationMinutes ?? null}
              items={selectedExam.items.map((item) => ({
                id: item.id,
                questionId: item.questionId,
                position: item.position,
                question: {
                  id: item.question.id,
                  statement: item.question.statement,
                  subject: item.question.subject,
                  topic: item.question.topic,
                  options: item.question.options.map((option) => ({
                    id: option.id,
                    label: option.label,
                    text: option.text
                  }))
                }
              }))}
            />
          </div>

          <div className="mockAttemptsHistory">
            <h3>Últimas tentativas</h3>
            {selectedExam.attempts.length === 0 ? <p className="emptyState">Nenhuma tentativa registrada.</p> : null}
            {selectedExam.attempts.length > 0 ? (
              <table className="subscriptionTable">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Acertos</th>
                    <th>Erros</th>
                    <th>Brancos</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedExam.attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>{new Date(attempt.finishedAt).toLocaleString("pt-BR")}</td>
                      <td>{attempt.correctCount}</td>
                      <td>{attempt.wrongCount}</td>
                      <td>{attempt.blankCount}</td>
                      <td>{attempt.scorePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
