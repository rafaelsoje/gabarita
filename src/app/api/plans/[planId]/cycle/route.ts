import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";

type Params = { params: Promise<{ planId: string }> };

type RequestBody = {
  items?: Array<{
    subjectId: string;
    plannedMinutes: number;
    position?: number;
  }>;
};

export async function GET(_: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const { planId } = await params;
    const plan = await prisma.plan.findFirst({
      where: { id: planId, userId, isArchived: false },
      select: {
        id: true,
        cycleItems: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: {
            subjectId: true,
            plannedMinutes: true,
            position: true
          }
        }
      }
    });
    if (!plan) return notFound("Plano não encontrado.");

    return NextResponse.json({ items: plan.cycleItems });
  } catch {
    return serverError();
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();
    const limitResponse = await enforceMutationRateLimit({
      request,
      userId,
      scope: "plans:cycle:update"
    });
    if (limitResponse) return limitResponse;

    const { planId } = await params;
    const body = (await request.json()) as RequestBody;
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items || items.length === 0) return badRequest("Envie ao menos uma disciplina para o ciclo.");

    const plan = await prisma.plan.findFirst({
      where: { id: planId, userId, isArchived: false },
      select: {
        id: true,
        subjects: { select: { id: true } }
      }
    });
    if (!plan) return notFound("Plano não encontrado.");

    const subjectIds = new Set(plan.subjects.map((subject) => subject.id));
    const uniqueIds = new Set<string>();

    for (const [index, item] of items.entries()) {
      const subjectId = (item.subjectId || "").trim();
      const plannedMinutes = Math.floor(Number(item.plannedMinutes));

      if (!subjectId || !subjectIds.has(subjectId)) {
        return badRequest(`Disciplina inválida na posição ${index + 1}.`);
      }
      if (uniqueIds.has(subjectId)) {
        return badRequest("Não é permitido repetir disciplina no ciclo.");
      }
      if (!Number.isFinite(plannedMinutes) || plannedMinutes < 1 || plannedMinutes > 20000) {
        return badRequest(`Minutos inválidos na posição ${index + 1}.`);
      }
      uniqueIds.add(subjectId);
    }

    const normalizedItems = items.map((item, index) => ({
      subjectId: item.subjectId.trim(),
      plannedMinutes: Math.floor(Number(item.plannedMinutes)),
      position: Number.isFinite(item.position as number) ? Math.max(0, Math.floor(item.position as number)) : index
    }));

    await prisma.$transaction(async (tx) => {
      await tx.planCycleItem.deleteMany({
        where: {
          planId,
          subjectId: { notIn: normalizedItems.map((item) => item.subjectId) }
        }
      });

      for (const [index, item] of normalizedItems.entries()) {
        await tx.planCycleItem.upsert({
          where: {
            planId_subjectId: {
              planId,
              subjectId: item.subjectId
            }
          },
          create: {
            planId,
            subjectId: item.subjectId,
            plannedMinutes: item.plannedMinutes,
            position: index
          },
          update: {
            plannedMinutes: item.plannedMinutes,
            position: index
          }
        });
      }
    });

    return NextResponse.json({ message: "Ciclo atualizado." });
  } catch {
    return serverError();
  }
}
