import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { createTopicSchema } from "@/lib/study/schemas";
import { validateTopicDescriptionLinks } from "@/lib/study/topic-links";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const url = new URL(request.url);
    const subjectId = url.searchParams.get("subjectId") ?? undefined;

    const topics = await prisma.topic.findMany({
      where: {
        subject: { plan: { userId, isArchived: false } },
        ...(subjectId ? { subjectId } : {})
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }]
    });

    return NextResponse.json({ topics });
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
      scope: "topics:create"
    });
    if (limitResponse) return limitResponse;

    const body = await request.json();
    const parsed = createTopicSchema.safeParse(body);
    if (!parsed.success) return badRequest();
    const linksValidation = validateTopicDescriptionLinks(parsed.data.description);
    if (!linksValidation.valid) return badRequest(linksValidation.message);

    const subject = await prisma.subject.findFirst({
      where: {
        id: parsed.data.subjectId,
        plan: { userId, isArchived: false }
      },
      select: { id: true }
    });

    if (!subject) return notFound("Disciplina não encontrada.");

    const topic = await prisma.topic.create({
      data: parsed.data
    });

    return NextResponse.json({ topic }, { status: 201 });
  } catch {
    return serverError();
  }
}
