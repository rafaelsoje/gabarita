import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/http";
import { createSubjectSchema } from "@/lib/study/schemas";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const url = new URL(request.url);
    const planId = url.searchParams.get("planId") ?? undefined;

    const subjects = await prisma.subject.findMany({
      where: {
        plan: { userId, isArchived: false },
        ...(planId ? { planId } : {})
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { topics: true } }
      }
    });

    return NextResponse.json({ subjects });
  } catch {
    return serverError();
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();
    const limitResponse = await enforceMutationRateLimit({
      request,
      userId,
      scope: "subjects:create"
    });
    if (limitResponse) return limitResponse;

    const body = await request.json();
    const parsed = createSubjectSchema.safeParse(body);
    if (!parsed.success) return badRequest();

    const plan = await prisma.plan.findFirst({
      where: { id: parsed.data.planId, userId, isArchived: false },
      select: { id: true }
    });

    if (!plan) return notFound("Plano não encontrado.");

    const subject = await prisma.subject.create({
      data: parsed.data
    });

    return NextResponse.json({ subject }, { status: 201 });
  } catch {
    return serverError();
  }
}
