import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { updateTopicSchema } from "@/lib/study/schemas";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { deleteTopicWithFiles } from "@/lib/storage/study-cleanup";
import { validateTopicDescriptionLinks } from "@/lib/study/topic-links";

type Params = { params: Promise<{ topicId: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const { topicId } = await params;
    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        subject: { plan: { userId, isArchived: false } }
      },
      include: {
        _count: { select: { studySessions: true } }
      }
    });

    if (!topic) return notFound();
    return NextResponse.json({ topic });
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
      scope: "topics:update"
    });
    if (limitResponse) return limitResponse;

    const { topicId } = await params;
    const body = await request.json();
    const parsed = updateTopicSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return badRequest();
    if (parsed.data.description !== undefined) {
      const linksValidation = validateTopicDescriptionLinks(parsed.data.description);
      if (!linksValidation.valid) return badRequest(linksValidation.message);
    }

    const existing = await prisma.topic.findFirst({
      where: {
        id: topicId,
        subject: { plan: { userId, isArchived: false } }
      },
      select: { id: true }
    });
    if (!existing) return notFound();

    const topic = await prisma.topic.update({
      where: { id: topicId },
      data: parsed.data
    });

    return NextResponse.json({ topic });
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
      scope: "topics:delete"
    });
    if (limitResponse) return limitResponse;

    const { topicId } = await params;
    const deleted = await deleteTopicWithFiles({ userId, topicId });
    if (!deleted) return notFound();
    return NextResponse.json({ message: "Tópico removido." });
  } catch {
    return serverError();
  }
}
