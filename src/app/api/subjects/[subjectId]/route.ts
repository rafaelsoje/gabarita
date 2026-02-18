import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { updateSubjectSchema } from "@/lib/study/schemas";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { deleteSubjectWithFiles } from "@/lib/storage/study-cleanup";

type Params = { params: Promise<{ subjectId: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const { subjectId } = await params;
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, plan: { userId, isArchived: false } },
      include: {
        topics: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        _count: { select: { studySessions: true } }
      }
    });

    if (!subject) return notFound();
    return NextResponse.json({ subject });
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
      scope: "subjects:update"
    });
    if (limitResponse) return limitResponse;

    const { subjectId } = await params;
    const body = await request.json();
    const parsed = updateSubjectSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return badRequest();

    const existing = await prisma.subject.findFirst({
      where: { id: subjectId, plan: { userId, isArchived: false } },
      select: { id: true }
    });
    if (!existing) return notFound();

    const subject = await prisma.subject.update({
      where: { id: subjectId },
      data: parsed.data
    });

    return NextResponse.json({ subject });
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
      scope: "subjects:delete"
    });
    if (limitResponse) return limitResponse;

    const { subjectId } = await params;
    const deleted = await deleteSubjectWithFiles({ userId, subjectId });
    if (!deleted) return notFound();
    return NextResponse.json({ message: "Disciplina removida." });
  } catch {
    return serverError();
  }
}
