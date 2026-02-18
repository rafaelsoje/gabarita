import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudyCategory } from "@prisma/client";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

type ReviewsPageProps = {
  searchParams: Promise<{
    tab?: "scheduled" | "overdue" | "done";
    source?: "all" | "user" | "llm";
  }>;
};

type ReviewStatus = "scheduled" | "overdue";
type ReviewSource = "USER" | "LLM";

type ReviewItem = {
  id: string;
  topicId: string | null;
  topicTitle: string;
  subjectId: string | null;
  subjectName: string;
  planName: string;
  nextReviewAt: Date;
  intervalDays: number | null;
  reviewsTarget: number | null;
  source: ReviewSource;
  status: ReviewStatus;
};

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function endOfToday() {
  const start = startOfToday();
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return end;
}

function formatDateTime(value: Date) {
  return value.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function loadUserPlannedReviewItems(userId: string): Promise<ReviewItem[]> {
  const today = startOfToday();
  const rows = await prisma.planStudyPlanDay.findMany({
    where: {
      userId,
      source: "USER_REVIEW",
      reviewsTarget: { gt: 0 },
      plan: {
        isArchived: false
      }
    },
    orderBy: [{ date: "asc" }, { position: "asc" }],
    select: {
      id: true,
      date: true,
      position: true,
      reviewsTarget: true,
      topicId: true,
      topicTitle: true,
      subjectId: true,
      subjectName: true,
      plan: {
        select: {
          title: true
        }
      }
    }
  });

  return rows.map((row) => ({
    id: row.id,
    topicId: row.topicId,
    topicTitle: row.topicTitle?.trim() || row.subjectName,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    planName: row.plan.title,
    nextReviewAt: row.date,
    intervalDays: row.position > 0 ? row.position : null,
    reviewsTarget: row.reviewsTarget,
    source: "USER",
    status: row.date < today ? ("overdue" as const) : ("scheduled" as const)
  }));
}

async function loadLlmPlannedReviewItems(userId: string): Promise<ReviewItem[]> {
  const today = startOfToday();
  const rows = await prisma.planStudyPlanDay.findMany({
    where: {
      userId,
      reviewsTarget: { gt: 0 },
      source: "LLM",
      plan: {
        isArchived: false
      }
    },
    orderBy: [{ date: "asc" }, { position: "asc" }],
    select: {
      id: true,
      date: true,
      reviewsTarget: true,
      topicId: true,
      topicTitle: true,
      subjectId: true,
      subjectName: true,
      plan: {
        select: {
          title: true
        }
      }
    }
  });

  return rows.map((row) => ({
    id: row.id,
    topicId: row.topicId,
    topicTitle: row.topicTitle?.trim() || row.subjectName,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    planName: row.plan.title,
    nextReviewAt: row.date,
    intervalDays: null,
    reviewsTarget: row.reviewsTarget,
    source: "LLM",
    status: row.date < today ? ("overdue" as const) : ("scheduled" as const)
  }));
}

function mergeReviewItems(userItems: ReviewItem[], llmItems: ReviewItem[]) {
  const merged = [...userItems, ...llmItems];
  return merged.sort((a, b) => a.nextReviewAt.getTime() - b.nextReviewAt.getTime());
}

function buildReviewsHref(tab: "scheduled" | "overdue" | "done", source: "all" | "user" | "llm") {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (source !== "all") params.set("source", source);
  return `/revisoes?${params.toString()}`;
}

function buildReviewRegisterHref(item: ReviewItem) {
  if (!item.subjectId) return null;
  const params = new URLSearchParams();
  params.set("openRegister", "1");
  params.set("registerCategory", "REVIEW");
  params.set("subjectId", item.subjectId);
  params.set("subjectName", item.subjectName);
  if (item.topicId) {
    params.set("topicId", item.topicId);
    params.set("topicTitle", item.topicTitle);
  }
  return `/disciplinas/${item.subjectId}?${params.toString()}`;
}

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const tab = params.tab ?? "scheduled";
  const source = params.source === "user" || params.source === "llm" ? params.source : "all";

  async function deleteReviewAction(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const reviewId = String(formData.get("reviewId") ?? "").trim();
    const reviewSourceRaw = String(formData.get("reviewSource") ?? "").trim();
    const nextTab =
      String(formData.get("tab") ?? "").trim() === "overdue"
        ? "overdue"
        : String(formData.get("tab") ?? "").trim() === "done"
          ? "done"
          : "scheduled";
    const nextSourceRaw = String(formData.get("source") ?? "").trim();
    const nextSource = nextSourceRaw === "user" || nextSourceRaw === "llm" ? nextSourceRaw : "all";

    if (reviewId) {
      const persistedSource = reviewSourceRaw === "LLM" ? "LLM" : "USER_REVIEW";
      await prisma.planStudyPlanDay.deleteMany({
        where: {
          id: reviewId,
          userId: currentUserId,
          source: persistedSource,
          reviewsTarget: { gt: 0 }
        }
      });
    }

    revalidatePath("/revisoes");
    revalidatePath("/planejamento");
    revalidatePath("/");
    redirect(buildReviewsHref(nextTab, nextSource));
  }

  const userItems = await loadUserPlannedReviewItems(userId);
  const llmItems = await loadLlmPlannedReviewItems(userId);
  const allItems = mergeReviewItems(userItems, llmItems);
  const filteredItems =
    source === "all" ? allItems : allItems.filter((item) => (source === "user" ? item.source === "USER" : item.source === "LLM"));
  const overdueItems = filteredItems.filter((item) => item.status === "overdue");
  const scheduledItems = filteredItems.filter((item) => item.status === "scheduled");
  const userCount = allItems.filter((item) => item.source === "USER").length;
  const llmCount = allItems.filter((item) => item.source === "LLM").length;

  const doneTodaySessions = await prisma.studySession.findMany({
    where: {
      userId,
      category: StudyCategory.REVIEW,
      startedAt: {
        gte: startOfToday(),
        lt: endOfToday()
      },
      topicId: { not: null },
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
      id: true,
      startedAt: true,
      durationMinutes: true,
      topic: {
        select: {
          title: true,
          subject: {
            select: {
              name: true,
              plan: {
                select: {
                  title: true
                }
              }
            }
          }
        }
      }
    }
  });

  const visibleScheduled = tab === "overdue" ? overdueItems : scheduledItems;

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Revisões</h1>
          <p>Agenda automática com base no desempenho e histórico de estudos.</p>
        </div>
      </section>

      <section className="dashboardCard reviewsCard">
        <div className="reviewsFiltersRow">
          <div className="reviewsTabs">
            <Link href={buildReviewsHref("scheduled", source)} className={`reviewsTab ${tab === "scheduled" ? "active" : ""}`}>
              Programadas <span>{scheduledItems.length}</span>
            </Link>
            <Link href={buildReviewsHref("overdue", source)} className={`reviewsTab ${tab === "overdue" ? "active" : ""}`}>
              Atrasadas <span>{overdueItems.length}</span>
            </Link>
            <Link href={buildReviewsHref("done", source)} className={`reviewsTab ${tab === "done" ? "active" : ""}`}>
              Concluídas hoje <span>{doneTodaySessions.length}</span>
            </Link>
          </div>
          <div className="reviewsTabs reviewsTabsRight">
            <Link href={buildReviewsHref(tab, "all")} className={`reviewsTab ${source === "all" ? "active" : ""}`}>
              Todas <span>{allItems.length}</span>
            </Link>
            <Link href={buildReviewsHref(tab, "user")} className={`reviewsTab ${source === "user" ? "active" : ""}`}>
              Usuário <span>{userCount}</span>
            </Link>
            <Link href={buildReviewsHref(tab, "llm")} className={`reviewsTab ${source === "llm" ? "active" : ""}`}>
              LLM <span>{llmCount}</span>
            </Link>
          </div>
        </div>

        {tab !== "done" ? (
          <div className="reviewsList">
            {visibleScheduled.length === 0 ? (
              <p className="emptyState">Sem revisões para este filtro.</p>
            ) : (
              visibleScheduled.map((item) => (
                <article key={`${item.source}-${item.id}`} className="reviewsItem">
                  <div className="reviewsItemMain">
                    <div className="reviewsItemTitleRow">
                      <strong>{item.topicTitle}</strong>
                      <div className="reviewsItemBadges">
                        <span className={`reviewsStatusBadge ${item.source === "LLM" ? "llm" : "manual"}`}>
                          {item.source === "LLM" ? "LLM" : "Usuário"}
                        </span>
                        <span className={`reviewsStatusBadge ${item.status}`}>{item.status === "overdue" ? "Atrasada" : "Programada"}</span>
                      </div>
                    </div>
                    <p>{item.subjectName} • {item.planName}</p>
                  </div>
                  <div>
                    <small>Origem</small>
                    <p>{item.source === "LLM" ? "Planejamento LLM" : "Registro de estudo"}</p>
                  </div>
                  <div>
                    <small>Data planejada</small>
                    <p>{formatDateTime(item.nextReviewAt)}</p>
                  </div>
                  <div>
                    <small>{item.source === "LLM" ? "Meta" : "Intervalo"}</small>
                    <p>{item.source === "LLM" ? `${item.reviewsTarget ?? 0} revisão(ões)` : `${item.intervalDays ?? 0} dia(s)`}</p>
                  </div>
                  <div className="reviewsActions">
                    {item.subjectId ? (
                      <Link className="secondaryBtn small reviewsActionBtn" href={buildReviewRegisterHref(item) ?? `/disciplinas/${item.subjectId}`}>
                        Registrar revisão
                      </Link>
                    ) : (
                      <span className="reviewsActionPlaceholder">Sem disciplina</span>
                    )}
                    <form>
                      <input type="hidden" name="reviewId" value={item.id} />
                      <input type="hidden" name="reviewSource" value={item.source} />
                      <input type="hidden" name="tab" value={tab} />
                      <input type="hidden" name="source" value={source} />
                      <ConfirmSubmitButton
                        className="dangerBtn small reviewsDeleteBtn"
                        label="Excluir"
                        confirmTitle="Excluir revisão"
                        confirmMessage="Deseja remover esta revisão programada?"
                        confirmActionLabel="Excluir"
                        formAction={deleteReviewAction}
                      />
                    </form>
                  </div>
                </article>
              ))
            )}
          </div>
        ) : (
          <div className="reviewsList">
            {doneTodaySessions.length === 0 ? (
              <p className="emptyState">Nenhuma revisão concluída hoje.</p>
            ) : (
              doneTodaySessions.map((session) => (
                <article key={session.id} className="reviewsItem">
                  <div className="reviewsItemMain">
                    <div className="reviewsItemTitleRow">
                      <strong>{session.topic?.title ?? "Tópico"}</strong>
                      <span className="reviewsStatusBadge done">Concluída</span>
                    </div>
                    <p>{session.topic?.subject.name ?? "Disciplina"} • {session.topic?.subject.plan.title ?? "Plano"}</p>
                  </div>
                  <div>
                    <small>Concluída em</small>
                    <p>{formatDateTime(session.startedAt)}</p>
                  </div>
                  <div>
                    <small>Duração</small>
                    <p>{session.durationMinutes} min</p>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}
