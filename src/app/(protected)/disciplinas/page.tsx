import Image from "next/image";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TopicStatus } from "@prisma/client";
import type { CSSProperties } from "react";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { SubjectColorPicker } from "@/components/subject-color-picker";
import { SubjectPlanSelector } from "@/components/subject-plan-selector";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ActionIcon } from "@/components/action-icon";
import { deletePlanWithFiles, deleteSubjectWithFiles, deleteTopicWithFiles } from "@/lib/storage/study-cleanup";

type SubjectsPageProps = {
  searchParams: Promise<{ planId?: string; newSubject?: string; editSubject?: string }>;
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

function normalizeSubjectColor(value: string) {
  const clean = value.trim().toLowerCase();
  if (/^#([0-9a-f]{6})$/i.test(clean)) return clean;
  return "";
}

function formatDuration(totalMinutes: number) {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}min`;
}

function parseTopicLines(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 300);
}

function parseIntegerField(value: FormDataEntryValue | null, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function SubjectsPage({ searchParams }: SubjectsPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const requestedPlanId = typeof params.planId === "string" ? params.planId : "";
  const isNewSubjectOpen = params.newSubject === "1";
  const editSubjectId = typeof params.editSubject === "string" ? params.editSubject : "";

  const plans = await prisma.plan.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      notes: true,
      examDate: true,
      _count: {
        select: {
          subjects: true,
          referenceFiles: true
        }
      }
    }
  });

  const hasOnePlan = plans.length === 1;
  const selectedPlanId = hasOnePlan ? plans[0].id : plans.some((plan) => plan.id === requestedPlanId) ? requestedPlanId : "";
  const selectedPlan = selectedPlanId ? plans.find((plan) => plan.id === selectedPlanId) ?? null : null;

  async function createSubject(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const nameRaw = formData.get("name");
    const colorRaw = formData.get("color");
    const importanceRaw = formData.get("importance");
    const knowledgeRaw = formData.get("knowledgeLevel");
    const topics = parseTopicLines(formData.get("topicsText"));

    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const color = typeof colorRaw === "string" ? colorRaw.trim() : "";
    const importance = Math.min(5, Math.max(1, parseIntegerField(importanceRaw, 3)));
    const knowledgeLevel = Math.min(100, Math.max(0, parseIntegerField(knowledgeRaw, 50)));
    const selectedColor = normalizeSubjectColor(color) || getRandomSubjectColor();

    if (!planId || name.length < 2 || name.length > 160) return;

    const ownedPlan = await prisma.plan.findFirst({
      where: { id: planId, userId: currentUserId, isArchived: false },
      select: { id: true }
    });
    if (!ownedPlan) return;

    const lastPosition = await prisma.subject.findFirst({
      where: { planId },
      orderBy: { position: "desc" },
      select: { position: true }
    });

    const createdSubject = await prisma.subject.create({
      data: {
        planId,
        name,
        color: selectedColor,
        importance,
        knowledgeLevel,
        position: (lastPosition?.position ?? -1) + 1
      }
    });

    if (topics.length > 0) {
      await prisma.topic.createMany({
        data: topics.map((title, index) => ({
          subjectId: createdSubject.id,
          title,
          position: index
        }))
      });
    }

    revalidatePath("/disciplinas");
    revalidatePath(`/planos/${planId}`);
    redirect(`/disciplinas?planId=${planId}&toast=subject_created`);
  }

  async function updateSubject(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const subjectIdRaw = formData.get("subjectId");
    const nameRaw = formData.get("name");
    const colorRaw = formData.get("color");
    const importanceRaw = formData.get("importance");
    const knowledgeRaw = formData.get("knowledgeLevel");

    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    const subjectId = typeof subjectIdRaw === "string" ? subjectIdRaw : "";
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const color = typeof colorRaw === "string" ? colorRaw.trim() : "";
    const importance = Math.min(5, Math.max(1, parseIntegerField(importanceRaw, 3)));
    const knowledgeLevel = Math.min(100, Math.max(0, parseIntegerField(knowledgeRaw, 50)));
    const selectedColor = normalizeSubjectColor(color) || getRandomSubjectColor();

    if (!planId || !subjectId || name.length < 2 || name.length > 160) return;

    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        plan: {
          id: planId,
          userId: currentUserId,
          isArchived: false
        }
      },
      select: { id: true }
    });
    if (!subject) return;

    await prisma.subject.update({
      where: { id: subjectId },
      data: {
        name,
        color: selectedColor,
        importance,
        knowledgeLevel
      }
    });

    revalidatePath("/disciplinas");
    revalidatePath(`/planos/${planId}`);
    redirect(`/disciplinas?planId=${planId}&toast=subject_updated`);
  }

  async function createSubjectTopic(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const subjectIdRaw = formData.get("subjectId");
    const titleRaw = formData.get("topicTitle");

    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    const subjectId = typeof subjectIdRaw === "string" ? subjectIdRaw : "";
    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
    if (!planId || !subjectId || title.length < 2 || title.length > 220) return;

    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        plan: { id: planId, userId: currentUserId, isArchived: false }
      },
      select: { id: true }
    });
    if (!subject) return;

    const lastTopic = await prisma.topic.findFirst({
      where: { subjectId },
      orderBy: { position: "desc" },
      select: { position: true }
    });

    await prisma.topic.create({
      data: {
        subjectId,
        title,
        position: (lastTopic?.position ?? -1) + 1
      }
    });

    revalidatePath("/disciplinas");
    revalidatePath(`/planos/${planId}`);
    return;
  }

  async function updateSubjectTopic(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const subjectIdRaw = formData.get("subjectId");
    const topicIdRaw = formData.get("topicId");
    const titleRaw = formData.get("topicTitle");

    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    const subjectId = typeof subjectIdRaw === "string" ? subjectIdRaw : "";
    const topicId = typeof topicIdRaw === "string" ? topicIdRaw : "";
    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
    if (!planId || !subjectId || !topicId || title.length < 2 || title.length > 220) return;

    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        subject: {
          id: subjectId,
          plan: { id: planId, userId: currentUserId, isArchived: false }
        }
      },
      select: { id: true }
    });
    if (!topic) return;

    await prisma.topic.update({
      where: { id: topicId },
      data: { title }
    });

    revalidatePath("/disciplinas");
    revalidatePath(`/planos/${planId}`);
    return;
  }

  async function moveSubjectTopic(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const subjectIdRaw = formData.get("subjectId");
    const topicIdRaw = formData.get("topicId");
    const directionRaw = formData.get("direction");

    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    const subjectId = typeof subjectIdRaw === "string" ? subjectIdRaw : "";
    const topicId = typeof topicIdRaw === "string" ? topicIdRaw : "";
    const direction = directionRaw === "up" ? "up" : directionRaw === "down" ? "down" : "";

    if (!planId || !subjectId || !topicId || !direction) return;

    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        subject: {
          id: subjectId,
          plan: { id: planId, userId: currentUserId, isArchived: false }
        }
      },
      select: { id: true, position: true, subjectId: true }
    });
    if (!topic) return;

    const neighbor = await prisma.topic.findFirst({
      where: {
        subjectId: topic.subjectId,
        position: direction === "up" ? { lt: topic.position } : { gt: topic.position }
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
      select: { id: true, position: true }
    });
    if (!neighbor) {
      return;
    }

    await prisma.$transaction([
      prisma.topic.update({
        where: { id: topic.id },
        data: { position: neighbor.position }
      }),
      prisma.topic.update({
        where: { id: neighbor.id },
        data: { position: topic.position }
      })
    ]);

    revalidatePath("/disciplinas");
    revalidatePath(`/planos/${planId}`);
    return;
  }

  async function deleteSubjectTopic(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const subjectIdRaw = formData.get("subjectId");
    const topicIdRaw = formData.get("topicId");

    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    const subjectId = typeof subjectIdRaw === "string" ? subjectIdRaw : "";
    const topicId = typeof topicIdRaw === "string" ? topicIdRaw : "";
    if (!planId || !subjectId || !topicId) return;

    const deleted = await deleteTopicWithFiles({ userId: currentUserId, topicId });
    if (!deleted) return;

    revalidatePath("/disciplinas");
    revalidatePath(`/planos/${planId}`);
    return;
  }

  async function deleteSubject(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const subjectIdRaw = formData.get("subjectId");

    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    const subjectId = typeof subjectIdRaw === "string" ? subjectIdRaw : "";
    if (!planId || !subjectId) return;

    const deleted = await deleteSubjectWithFiles({ userId: currentUserId, subjectId });
    if (!deleted) return;

    revalidatePath("/disciplinas");
    revalidatePath(`/planos/${planId}`);
    redirect(`/disciplinas?planId=${planId}&toast=subject_deleted`);
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

    revalidatePath("/disciplinas");
    redirect("/disciplinas?toast=plan_deleted");
  }

  if (!selectedPlan) {
    if (plans.length === 0) {
      return (
        <main className="dashboard">
          <section className="dashboardCard dashboardHeader">
            <div>
              <h1>Disciplinas</h1>
              <p>Você ainda não possui planos para incluir disciplinas.</p>
            </div>
          </section>

          <section className="dashboardCard">
            <p className="emptyState">Crie seu primeiro plano para começar a cadastrar disciplinas.</p>
            <Link className="planOpenLink" href="/?tab=planos&newPlan=1">
              Criar primeiro plano
            </Link>
          </section>
        </main>
      );
    }

    redirect(`/disciplinas?planId=${plans[0].id}`);
  }

  const [subjects, studyTotals, studyBySubject] = await Promise.all([
    prisma.subject.findMany({
      where: { planId: selectedPlan.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        color: true,
        importance: true,
        knowledgeLevel: true,
        topics: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            status: true,
            title: true,
            position: true
          }
        }
      }
    }),
    prisma.studySession.aggregate({
      where: { userId, planId: selectedPlan.id },
      _sum: {
        durationMinutes: true,
        questionsCorrect: true,
        questionsWrong: true
      }
    }),
    prisma.studySession.groupBy({
      by: ["subjectId"],
      where: { userId, planId: selectedPlan.id, subjectId: { not: null } },
      _sum: {
        questionsCorrect: true,
        questionsWrong: true,
        questionsBlank: true
      }
    })
  ]);

  const subjectQuestionMap = new Map(
    studyBySubject
      .filter((item) => !!item.subjectId)
      .map((item) => [item.subjectId as string, (item._sum.questionsCorrect ?? 0) + (item._sum.questionsWrong ?? 0) + (item._sum.questionsBlank ?? 0)])
  );

  const totalMinutes = studyTotals._sum.durationMinutes ?? 0;
  const totalCorrect = studyTotals._sum.questionsCorrect ?? 0;
  const totalWrong = studyTotals._sum.questionsWrong ?? 0;
  const performance = totalCorrect + totalWrong > 0 ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0;
  const planInitials = selectedPlan.title
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const editableSubject = editSubjectId ? subjects.find((subject) => subject.id === editSubjectId) ?? null : null;
  const planOptions = plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    imageUrl: plan.imageUrl,
    targetUrl: `/disciplinas?planId=${plan.id}`
  }));

  return (
    <main className="dashboard">
      <section className="subjectsTopGrid">
        <article className={`dashboardCard subjectsPlanBadge ${selectedPlan.imageUrl ? "hasImage" : ""}`}>
          {selectedPlan.imageUrl ? (
            <Image
              className="subjectsPlanImage"
              src={selectedPlan.imageUrl}
              alt={`Imagem do plano ${selectedPlan.title}`}
              width={108}
              height={108}
            />
          ) : (
            <span>{planInitials || "PL"}</span>
          )}
        </article>

        <article className="dashboardCard subjectsPlanSummary">
          <div className="subjectsPlanSummaryHeader">
            <h1>{selectedPlan.title}</h1>
            <div className="subjectsPlanSummaryActions">
              {plans.length > 1 ? (
                <SubjectPlanSelector options={planOptions} currentPlanId={selectedPlan.id} />
              ) : null}
              <Link className="ghostButton" href={`/planos/${selectedPlan.id}/arquivos`}>
                Arquivos do plano
              </Link>
              <Link className="ghostButton" href={`/disciplinas?planId=${selectedPlan.id}&newSubject=1`}>
                Nova disciplina
              </Link>
            </div>
          </div>
          <p>
            Edital: <strong>{selectedPlan.notes?.includes("Edital:") ? "Informado" : "Nenhum"}</strong>
          </p>
          <p>
            Cargos: <strong>{selectedPlan.notes?.includes("Cargo:") ? "Informado" : "Nenhum"}</strong>
          </p>
          <p>
            Disciplinas: <strong>{subjects.length}</strong> | Tópicos:{" "}
            <strong>{subjects.reduce((acc, subject) => acc + subject.topics.length, 0)}</strong>
          </p>
          <p>
            Observações: <strong>{selectedPlan.notes ? "Com informações" : "Sem informações extras"}</strong>
          </p>
          <div className="subjectsPlanSummaryFooter">
            <div className="subjectsPlanSummaryTools">
              <form action={archivePlan}>
                <input type="hidden" name="planId" value={selectedPlan.id} />
                <ConfirmSubmitButton
                  className="planSummaryToolBtn"
                  label={<ActionIcon name="archive" />}
                  confirmTitle="Arquivar plano"
                  confirmMessage="Deseja arquivar este plano? Ele ficará indisponível no app até ser reativado no menu Arquivo."
                  confirmActionLabel="Arquivar plano"
                  ariaLabel="Arquivar plano"
                  title="Arquivar plano"
                />
              </form>
              <Link
                className="planSummaryToolBtn"
                href={`/planos/${selectedPlan.id}/arquivos`}
                aria-label={`Arquivos do plano (${selectedPlan._count.referenceFiles})`}
                title={`Arquivos do plano (${selectedPlan._count.referenceFiles})`}
              >
                <ActionIcon name="file" />
              </Link>
              <Link className="planSummaryToolBtn" href={`/?tab=planos&editPlan=${selectedPlan.id}`} aria-label="Editar plano" title="Editar plano">
                <ActionIcon name="edit" />
              </Link>
              <form action={deletePlan}>
                <input type="hidden" name="planId" value={selectedPlan.id} />
                <ConfirmSubmitButton
                  className="planSummaryToolBtn danger"
                  label={<ActionIcon name="remove" />}
                  confirmTitle="Excluir plano"
                  confirmMessage="Deseja realmente excluir este plano? Essa ação não pode ser desfeita."
                  confirmActionLabel="Excluir plano"
                  ariaLabel="Excluir plano"
                  title="Excluir plano"
                />
              </form>
            </div>
          </div>
        </article>

        <article className="dashboardCard subjectsStatsCard">
          <p className="subjectsStatsTime">{formatDuration(totalMinutes)}</p>
          <p className="subjectsStatsLabel">Horas de Estudo</p>
          <div className="subjectsStatsRow">
            <div>
              <strong>{totalCorrect + totalWrong}</strong>
              <span>Questões</span>
            </div>
            <div>
              <strong>{performance}%</strong>
              <span>Desempenho</span>
            </div>
          </div>
        </article>
      </section>

      <section className="subjectsCardsGrid">
        {subjects.length === 0 ? (
          <article className="dashboardCard">
            <p className="emptyState">Nenhuma disciplina cadastrada neste plano.</p>
          </article>
        ) : (
          subjects.map((subject) => {
            const totalTopics = subject.topics.length;
            const studiedTopics = subject.topics.filter((topic) => topic.status === TopicStatus.COMPLETED).length;
            const resolvedQuestions = subjectQuestionMap.get(subject.id) ?? 0;

            return (
              <article
                id={`subject-${subject.id}`}
                key={subject.id}
                className="dashboardCard subjectOverviewCard"
                style={{ borderLeftColor: subject.color ?? "#2ea89b" } as CSSProperties}
              >
                <Link className="subjectOverviewLinkOverlay" href={`/disciplinas/${subject.id}`} aria-label={`Abrir disciplina ${subject.name}`}>
                  <span className="srOnly">Abrir disciplina {subject.name}</span>
                </Link>
                <div className="subjectOverviewContent">
                  <h3>{subject.name}</h3>
                  <div className="subjectOverviewStats">
                    <div>
                      <strong>{studiedTopics}</strong>
                      <span>Tópicos Estudados</span>
                    </div>
                    <div>
                      <strong>{totalTopics}</strong>
                      <span>Tópicos Totais</span>
                    </div>
                    <div>
                      <strong>{resolvedQuestions}</strong>
                      <span>Questões Resolvidas</span>
                    </div>
                  </div>
                </div>
                <div className="subjectOverviewActions subjectHoverActions" style={{ backgroundColor: subject.color ?? "#2ea89b" } as CSSProperties}>
                  <Link className="subjectActionBtn subjectHoverActionBtn" href={`/disciplinas/${subject.id}`} aria-label="Visualizar disciplina">
                    <span className="subjectActionIcon">
                      <ActionIcon name="view" />
                    </span>
                    <span className="subjectActionLabel">Visualizar</span>
                  </Link>
                  <Link
                    className="subjectActionBtn subjectHoverActionBtn"
                    href={`/disciplinas?planId=${selectedPlan.id}&editSubject=${subject.id}`}
                    aria-label="Editar disciplina"
                  >
                    <span className="subjectActionIcon">
                      <ActionIcon name="edit" />
                    </span>
                    <span className="subjectActionLabel">Editar</span>
                  </Link>
                  <form action={deleteSubject}>
                    <input type="hidden" name="planId" value={selectedPlan.id} />
                    <input type="hidden" name="subjectId" value={subject.id} />
                    <ConfirmSubmitButton
                      className="subjectActionBtn subjectHoverActionBtn danger"
                      label={
                        <>
                          <span className="subjectActionIcon">
                            <ActionIcon name="remove" />
                          </span>
                          <span className="subjectActionLabel">Remover</span>
                        </>
                      }
                      confirmTitle="Remover disciplina"
                      confirmMessage="Tem certeza que deseja remover esta disciplina?"
                      confirmActionLabel="Remover"
                      ariaLabel="Remover disciplina"
                      title="Remover disciplina"
                    />
                  </form>
                </div>
              </article>
            );
          })
        )}
      </section>

      {isNewSubjectOpen ? (
        <div className="modalBackdrop">
          <section className="newPlanModal">
            <h1>Nova disciplina</h1>
            <p className="newPlanSubtitle">Adicione uma disciplina, selecione uma cor e cadastre os tópicos.</p>
            <form className="subjectCreateForm" action={createSubject}>
              <input type="hidden" name="planId" value={selectedPlan.id} />
              <div className="subjectCreateTop">
                <input className="input subjectNameInput" name="name" placeholder="Nome da disciplina" required minLength={2} maxLength={160} />
                <SubjectColorPicker name="color" colors={SUBJECT_COLORS} />
              </div>
              <div className="subjectCreateTop subjectMetaFields">
                <label className="fieldLabel">
                  Importância (1 a 5)
                  <input className="input" type="number" name="importance" min={1} max={5} step={1} defaultValue={3} />
                </label>
                <label className="fieldLabel">
                  Conhecimento (%)
                  <input className="input" type="number" name="knowledgeLevel" min={0} max={100} step={1} defaultValue={50} />
                </label>
              </div>
              <div className="subjectTopicsField">
                <label className="fieldLabel" htmlFor="new-subject-topics">
                  Tópicos
                </label>
                <textarea
                  id="new-subject-topics"
                  className="lineTextarea"
                  name="topicsText"
                  rows={8}
                  placeholder="Digite um tópico por linha"
                />
              </div>
              <div className="newPlanActions">
                <Link className="ghostButton" href={`/disciplinas?planId=${selectedPlan.id}`}>
                  Cancelar
                </Link>
                <button className="button createPlanBtn subjectCreateBtn" type="submit">
                  Criar disciplina
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editableSubject ? (
        <div className="modalBackdrop">
          <section className="newPlanModal subjectEditModal">
            <h1>Editar disciplina</h1>
            <p className="newPlanSubtitle">Atualize nome/cor e gerencie os tópicos da disciplina.</p>
            <form className="subjectCreateForm" action={updateSubject}>
              <input type="hidden" name="planId" value={selectedPlan.id} />
              <input type="hidden" name="subjectId" value={editableSubject.id} />
              <div className="subjectCreateTop">
                <input
                  className="input subjectNameInput"
                  name="name"
                  defaultValue={editableSubject.name}
                  placeholder="Nome da disciplina"
                  required
                  minLength={2}
                  maxLength={160}
                />
                <SubjectColorPicker name="color" colors={SUBJECT_COLORS} defaultColor={editableSubject.color ?? SUBJECT_COLORS[0]} />
              </div>
              <div className="subjectCreateTop subjectMetaFields">
                <label className="fieldLabel">
                  Importância (1 a 5)
                  <input
                    className="input"
                    type="number"
                    name="importance"
                    min={1}
                    max={5}
                    step={1}
                    defaultValue={editableSubject.importance}
                  />
                </label>
                <label className="fieldLabel">
                  Conhecimento (%)
                  <input
                    className="input"
                    type="number"
                    name="knowledgeLevel"
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={editableSubject.knowledgeLevel}
                  />
                </label>
              </div>
              <div className="newPlanActions">
                <Link className="ghostButton" href={`/disciplinas?planId=${selectedPlan.id}`}>
                  Cancelar
                </Link>
                <button className="button createPlanBtn subjectCreateBtn" type="submit">
                  Salvar disciplina
                </button>
              </div>
            </form>

            <section className="subjectTopicManager">
              <div className="subjectTopicManagerHeader">
                <h3>Tópicos</h3>
                <span>{editableSubject.topics.length} tópico(s)</span>
              </div>

              <form className="subjectTopicNewRow" action={createSubjectTopic}>
                <input type="hidden" name="planId" value={selectedPlan.id} />
                <input type="hidden" name="subjectId" value={editableSubject.id} />
                <input className="input" name="topicTitle" placeholder="Novo tópico" minLength={2} maxLength={220} required />
                <button className="button createPlanBtn" type="submit">
                  Adicionar tópico
                </button>
              </form>

              <div className="subjectTopicList">
                {editableSubject.topics.length === 0 ? (
                  <p className="emptyState">Sem tópicos cadastrados.</p>
                ) : (
                  editableSubject.topics.map((topic, index) => (
                    <div className="subjectTopicRow" key={topic.id}>
                      <div className="subjectTopicRowMain">
                        <div className="subjectTopicMobileLabel">Tópico {index + 1}</div>
                        <form className="subjectTopicEditForm" action={updateSubjectTopic}>
                          <input type="hidden" name="planId" value={selectedPlan.id} />
                          <input type="hidden" name="subjectId" value={editableSubject.id} />
                          <input type="hidden" name="topicId" value={topic.id} />
                          <input className="input" name="topicTitle" defaultValue={topic.title} minLength={2} maxLength={220} required />
                          <button className="secondaryBtn" type="submit" title="Salvar edição">
                            Salvar
                          </button>
                        </form>
                        <div className="subjectTopicRowActions">
                          <form action={moveSubjectTopic}>
                            <input type="hidden" name="planId" value={selectedPlan.id} />
                          <input type="hidden" name="subjectId" value={editableSubject.id} />
                          <input type="hidden" name="topicId" value={topic.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button className="planSummaryToolBtn" type="submit" disabled={index === 0} title="Mover para cima">
                            <span className="topicMoveIcon" aria-hidden="true">
                              ↑
                            </span>
                            <span className="topicMoveLabel">Subir</span>
                          </button>
                        </form>
                        <form action={moveSubjectTopic}>
                          <input type="hidden" name="planId" value={selectedPlan.id} />
                          <input type="hidden" name="subjectId" value={editableSubject.id} />
                            <input type="hidden" name="topicId" value={topic.id} />
                            <input type="hidden" name="direction" value="down" />
                            <button
                            className="planSummaryToolBtn"
                            type="submit"
                            disabled={index === editableSubject.topics.length - 1}
                            title="Mover para baixo"
                          >
                            <span className="topicMoveIcon" aria-hidden="true">
                              ↓
                            </span>
                            <span className="topicMoveLabel">Descer</span>
                          </button>
                        </form>
                        <form action={deleteSubjectTopic}>
                          <input type="hidden" name="planId" value={selectedPlan.id} />
                          <input type="hidden" name="subjectId" value={editableSubject.id} />
                            <input type="hidden" name="topicId" value={topic.id} />
                          <ConfirmSubmitButton
                            className="planSummaryToolBtn danger"
                            label={
                              <>
                                <span className="topicMoveIcon" aria-hidden="true">
                                  🗑
                                </span>
                                <span className="topicMoveLabel">Excluir</span>
                              </>
                            }
                            confirmTitle="Remover tópico"
                            confirmMessage="Deseja remover este tópico?"
                            confirmActionLabel="Remover"
                            ariaLabel="Remover tópico"
                          />
                          </form>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </section>
        </div>
      ) : null}
    </main>
  );
}
  async function archivePlan(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    if (!planId) return;

    const plan = await prisma.plan.findFirst({
      where: { id: planId, userId: currentUserId, isArchived: false },
      select: { id: true }
    });
    if (!plan) return;

    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        isArchived: true,
        archivedAt: new Date()
      }
    });

    revalidatePath("/");
    revalidatePath("/disciplinas");
    revalidatePath("/edital");
    revalidatePath("/planejamento");
    revalidatePath("/historico");
    revalidatePath("/revisoes");
    revalidatePath("/biblioteca");
    revalidatePath("/arquivo");
    redirect("/arquivo?toast=plan_archived");
  }
