import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TopicStatus } from "@prisma/client";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteSubjectWithFiles, deleteTopicWithFiles } from "@/lib/storage/study-cleanup";

type PageProps = {
  params: Promise<{ planId: string }>;
};

const SUBJECT_COLORS = [
  "#8fd3c7",
  "#9dd9cf",
  "#a8e0d7",
  "#b7e6de",
  "#ffd3c4",
  "#ffc9b7",
  "#ffbfab",
  "#f9d8b7",
  "#f2dfb3",
  "#e9e4b2",
  "#dce6b4",
  "#cfe2b6",
  "#c8e9c8",
  "#bfe4d3",
  "#b8dff0",
  "#b2d4f2",
  "#c2c9f7",
  "#d1c1f2",
  "#dfc0eb",
  "#eec7de",
  "#f4c3d2",
  "#d6dbe0",
  "#c9d2da",
  "#c0ccd5"
];

function getRandomSubjectColor() {
  return SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)];
}

function toNextStatus(status: TopicStatus) {
  if (status === TopicStatus.PENDING) return TopicStatus.IN_PROGRESS;
  if (status === TopicStatus.IN_PROGRESS) return TopicStatus.COMPLETED;
  return TopicStatus.PENDING;
}

function topicStatusLabel(status: TopicStatus) {
  if (status === TopicStatus.PENDING) return "Pendente";
  if (status === TopicStatus.IN_PROGRESS) return "Em andamento";
  return "Concluído";
}

export default async function PlanDetailPage({ params }: PageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const { planId } = await params;

  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId, isArchived: false },
    include: {
      subjects: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
          topics: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }]
          }
        }
      }
    }
  });

  if (!plan) {
    redirect("/");
  }

  async function createSubject(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const currentPlanIdRaw = formData.get("planId");
    const nameRaw = formData.get("name");
    const colorRaw = formData.get("color");

    const currentPlanId = typeof currentPlanIdRaw === "string" ? currentPlanIdRaw : "";
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const color = typeof colorRaw === "string" ? colorRaw.trim() : "";
    const selectedColor = SUBJECT_COLORS.includes(color) ? color : getRandomSubjectColor();

    if (!currentPlanId || name.length < 2 || name.length > 160) return;

    const ownedPlan = await prisma.plan.findFirst({
      where: { id: currentPlanId, userId: currentUserId, isArchived: false },
      select: { id: true }
    });

    if (!ownedPlan) return;

    const lastPosition = await prisma.subject.findFirst({
      where: { planId: currentPlanId },
      orderBy: { position: "desc" },
      select: { position: true }
    });

    await prisma.subject.create({
      data: {
        planId: currentPlanId,
        name,
        color: selectedColor,
        position: (lastPosition?.position ?? -1) + 1
      }
    });

    revalidatePath(`/planos/${currentPlanId}`);
    revalidatePath("/");
    redirect(`/planos/${currentPlanId}?toast=subject_created`);
  }

  async function deleteSubject(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const subjectIdRaw = formData.get("subjectId");
    const currentPlanIdRaw = formData.get("planId");
    const subjectId = typeof subjectIdRaw === "string" ? subjectIdRaw : "";
    const currentPlanId = typeof currentPlanIdRaw === "string" ? currentPlanIdRaw : "";

    if (!subjectId || !currentPlanId) return;

    const deleted = await deleteSubjectWithFiles({ userId: currentUserId, subjectId });
    if (!deleted) return;
    revalidatePath(`/planos/${currentPlanId}`);
    revalidatePath("/");
    redirect(`/planos/${currentPlanId}?toast=subject_deleted`);
  }

  async function createTopic(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const subjectIdRaw = formData.get("subjectId");
    const currentPlanIdRaw = formData.get("planId");
    const titleRaw = formData.get("title");

    const subjectId = typeof subjectIdRaw === "string" ? subjectIdRaw : "";
    const currentPlanId = typeof currentPlanIdRaw === "string" ? currentPlanIdRaw : "";
    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";

    if (!subjectId || !currentPlanId || title.length < 2 || title.length > 220) return;

    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        plan: {
          id: currentPlanId,
          userId: currentUserId
        }
      },
      select: { id: true }
    });

    if (!subject) return;

    const lastPosition = await prisma.topic.findFirst({
      where: { subjectId },
      orderBy: { position: "desc" },
      select: { position: true }
    });

    await prisma.topic.create({
      data: {
        subjectId,
        title,
        position: (lastPosition?.position ?? -1) + 1
      }
    });

    revalidatePath(`/planos/${currentPlanId}`);
    redirect(`/planos/${currentPlanId}?toast=topic_created`);
  }

  async function cycleTopicStatus(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const topicIdRaw = formData.get("topicId");
    const currentPlanIdRaw = formData.get("planId");

    const topicId = typeof topicIdRaw === "string" ? topicIdRaw : "";
    const currentPlanId = typeof currentPlanIdRaw === "string" ? currentPlanIdRaw : "";

    if (!topicId || !currentPlanId) return;

    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        subject: {
          plan: {
            id: currentPlanId,
            userId: currentUserId
          }
        }
      },
      select: { id: true, status: true }
    });

    if (!topic) return;

    const nextStatus = toNextStatus(topic.status);

    await prisma.topic.update({
      where: { id: topic.id },
      data: {
        status: nextStatus,
        completedAt: nextStatus === TopicStatus.COMPLETED ? new Date() : null
      }
    });

    revalidatePath(`/planos/${currentPlanId}`);
    redirect(`/planos/${currentPlanId}?toast=topic_updated`);
  }

  async function deleteTopic(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const topicIdRaw = formData.get("topicId");
    const currentPlanIdRaw = formData.get("planId");

    const topicId = typeof topicIdRaw === "string" ? topicIdRaw : "";
    const currentPlanId = typeof currentPlanIdRaw === "string" ? currentPlanIdRaw : "";

    if (!topicId || !currentPlanId) return;

    const deleted = await deleteTopicWithFiles({ userId: currentUserId, topicId });
    if (!deleted) return;
    revalidatePath(`/planos/${currentPlanId}`);
    redirect(`/planos/${currentPlanId}?toast=topic_deleted`);
  }

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1 className="planHeaderTitle">{plan.title}</h1>
          <p>
            Prova: {plan.examDate ? new Date(plan.examDate).toLocaleDateString("pt-BR") : "não informada"}
          </p>
        </div>
        <Link className="planOpenLink" href="/">
          Voltar para dashboard
        </Link>
      </section>

      <section className="dashboardCard">
        <h2>Nova disciplina</h2>
        <form className="subjectCreateForm" action={createSubject}>
          <input type="hidden" name="planId" value={plan.id} />
          <div className="subjectCreateTop">
            <input className="input subjectNameInput" name="name" placeholder="Nome da disciplina" required minLength={2} maxLength={160} />
            <fieldset className="colorPalette">
              <legend className="colorPaletteLegend">Escolha uma cor</legend>
              <div className="colorPaletteOptions">
                {SUBJECT_COLORS.map((color) => (
                  <label key={color} className="colorOption">
                    <input type="radio" name="color" value={color} />
                    <span className="colorOptionDot" style={{ background: color }} />
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <button className="button createPlanBtn subjectCreateBtn" type="submit">
            Criar disciplina
          </button>
        </form>
      </section>

      <section className="dashboardCard">
        <h2>Disciplinas</h2>
        {plan.subjects.length === 0 ? (
          <p className="emptyState">Você ainda não criou disciplinas neste plano.</p>
        ) : (
          <div className="subjectList">
            {plan.subjects.map((subject) => (
              <article key={subject.id} className="subjectCard">
                <div className="subjectHeader">
                  <h3>
                    <span className="subjectDot" style={{ background: subject.color ?? "#2ea89b" }} />
                    {subject.name}
                  </h3>
                  <form action={deleteSubject}>
                    <input type="hidden" name="subjectId" value={subject.id} />
                    <input type="hidden" name="planId" value={plan.id} />
                    <ConfirmSubmitButton
                      className="dangerBtn"
                      label="Remover disciplina"
                      confirmTitle="Remover disciplina"
                      confirmMessage="Tem certeza que deseja remover esta disciplina?"
                      confirmActionLabel="Remover"
                      ariaLabel="Remover disciplina"
                    />
                  </form>
                </div>

                <form className="topicForm" action={createTopic}>
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <input type="hidden" name="planId" value={plan.id} />
                  <input className="input" name="title" placeholder="Novo tópico" required minLength={2} maxLength={220} />
                  <button className="button createPlanBtn" type="submit">
                    Adicionar tópico
                  </button>
                </form>

                {subject.topics.length === 0 ? (
                  <p className="emptyState">Sem tópicos ainda.</p>
                ) : (
                  <ul className="topicList">
                    {subject.topics.map((topic) => (
                      <li key={topic.id} className="topicItem">
                        <div>
                          <strong>{topic.title}</strong>
                          <p className="topicMeta">Status: {topicStatusLabel(topic.status)}</p>
                        </div>
                        <div className="topicActions">
                          <form action={cycleTopicStatus}>
                            <input type="hidden" name="topicId" value={topic.id} />
                            <input type="hidden" name="planId" value={plan.id} />
                            <button className="secondaryBtn" type="submit">
                              Avançar status
                            </button>
                          </form>
                          <form action={deleteTopic}>
                            <input type="hidden" name="topicId" value={topic.id} />
                            <input type="hidden" name="planId" value={plan.id} />
                            <ConfirmSubmitButton
                              className="dangerBtn"
                              label="Excluir"
                              confirmTitle="Excluir tópico"
                              confirmMessage="Tem certeza que deseja excluir este tópico?"
                              confirmActionLabel="Excluir"
                              ariaLabel="Excluir tópico"
                            />
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
