import { prisma } from "@/lib/prisma";

type SessionRefs = {
  planId?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
};

type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

export async function validateStudySessionReferences(
  userId: string,
  refs: SessionRefs
): Promise<ValidationResult> {
  const planId = normalizeRef(refs.planId);
  const subjectId = normalizeRef(refs.subjectId);
  const topicId = normalizeRef(refs.topicId);

  let subjectPlanId: string | null = null;
  let topicPlanId: string | null = null;
  let topicSubjectId: string | null = null;

  if (planId) {
    const plan = await prisma.plan.findFirst({
      where: { id: planId, userId, isArchived: false },
      select: { id: true }
    });
    if (!plan) {
      return { ok: false, message: "Plano inválido para este usuário." };
    }
  }

  if (subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, plan: { userId, isArchived: false } },
      select: { id: true, planId: true }
    });
    if (!subject) {
      return { ok: false, message: "Disciplina inválida para este usuário." };
    }
    subjectPlanId = subject.planId;
  }

  if (topicId) {
    const topic = await prisma.topic.findFirst({
      where: { id: topicId, subject: { plan: { userId, isArchived: false } } },
      select: { id: true, subjectId: true, subject: { select: { planId: true } } }
    });
    if (!topic) {
      return { ok: false, message: "Tópico inválido para este usuário." };
    }
    topicSubjectId = topic.subjectId;
    topicPlanId = topic.subject.planId;
  }

  if (planId && subjectPlanId && subjectPlanId !== planId) {
    return {
      ok: false,
      message: "A disciplina informada não pertence ao plano informado."
    };
  }

  if (subjectId && topicSubjectId && topicSubjectId !== subjectId) {
    return {
      ok: false,
      message: "O tópico informado não pertence à disciplina informada."
    };
  }

  if (planId && topicPlanId && topicPlanId !== planId) {
    return {
      ok: false,
      message: "O tópico informado não pertence ao plano informado."
    };
  }

  return { ok: true };
}

function normalizeRef(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
