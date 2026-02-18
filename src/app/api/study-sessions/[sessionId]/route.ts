import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { updateStudySessionSchema } from "@/lib/study/schemas";
import { validateStudySessionReferences } from "@/lib/study/session-references";

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const { sessionId } = await params;
    const session = await prisma.studySession.findFirst({
      where: { id: sessionId, userId },
      include: {
        plan: { select: { id: true, title: true } },
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, title: true } }
      }
    });

    if (!session) return notFound();
    return NextResponse.json({ session });
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
      scope: "study-sessions:update"
    });
    if (limitResponse) return limitResponse;

    const { sessionId } = await params;
    const body = await request.json();
    const parsed = updateStudySessionSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return badRequest();

    const existing = await prisma.studySession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, planId: true, subjectId: true, topicId: true }
    });
    if (!existing) return notFound();

    const refsValidation = await validateStudySessionReferences(userId, {
      planId: parsed.data.planId === undefined ? existing.planId : parsed.data.planId,
      subjectId:
        parsed.data.subjectId === undefined ? existing.subjectId : parsed.data.subjectId,
      topicId: parsed.data.topicId === undefined ? existing.topicId : parsed.data.topicId
    });
    if (!refsValidation.ok) {
      return badRequest(refsValidation.message);
    }

    const sessionData = { ...parsed.data };
    delete sessionData.reviewScheduleEnabled;
    delete sessionData.reviewScheduleDays;
    const session = await prisma.studySession.update({
      where: { id: sessionId },
      data: sessionData
    });

    return NextResponse.json({ session });
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
      scope: "study-sessions:delete"
    });
    if (limitResponse) return limitResponse;

    const { sessionId } = await params;
    const existing = await prisma.studySession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true }
    });
    if (!existing) return notFound();

    await prisma.studySession.delete({ where: { id: sessionId } });
    return NextResponse.json({ message: "Registro de estudo removido." });
  } catch {
    return serverError();
  }
}
