import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { updatePlanSchema } from "@/lib/study/schemas";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { deletePlanWithFiles } from "@/lib/storage/study-cleanup";

type Params = { params: Promise<{ planId: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const { planId } = await params;
    const plan = await prisma.plan.findFirst({
      where: { id: planId, userId, isArchived: false },
      include: {
        subjects: {
          include: {
            _count: { select: { topics: true } }
          },
          orderBy: { position: "asc" }
        },
        _count: {
          select: { studySessions: true }
        }
      }
    });

    if (!plan) return notFound();
    return NextResponse.json({ plan });
  } catch {
    return serverError();
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();
    const limitResponse = await enforceMutationRateLimit({
      request,
      userId,
      scope: "plans:update"
    });
    if (limitResponse) return limitResponse;

    const { planId } = await params;
    const body = await request.json();
    const parsed = updatePlanSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return badRequest();
    }

    const existing = await prisma.plan.findFirst({ where: { id: planId, userId, isArchived: false }, select: { id: true } });
    if (!existing) return notFound();

    const plan = await prisma.plan.update({
      where: { id: planId },
      data: parsed.data
    });

    return NextResponse.json({ plan });
  } catch {
    return serverError();
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();
    const limitResponse = await enforceMutationRateLimit({
      request,
      userId,
      scope: "plans:delete"
    });
    if (limitResponse) return limitResponse;

    const { planId } = await params;
    const deleted = await deletePlanWithFiles({ userId, planId });
    if (!deleted) return notFound();
    return NextResponse.json({ message: "Plano removido." });
  } catch {
    return serverError();
  }
}
