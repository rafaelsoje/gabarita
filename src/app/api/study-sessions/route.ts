import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { badRequest, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { createStudySessionSchema } from "@/lib/study/schemas";
import { validateStudySessionReferences } from "@/lib/study/session-references";

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDate(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatWeekdayLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const url = new URL(request.url);
    const planId = url.searchParams.get("planId") ?? undefined;
    const subjectId = url.searchParams.get("subjectId") ?? undefined;
    const topicId = url.searchParams.get("topicId") ?? undefined;

    const sessions = await prisma.studySession.findMany({
      where: {
        userId,
        OR: [
          { plan: { is: { isArchived: false } } },
          { planId: null, subject: { is: { plan: { isArchived: false } } } },
          { planId: null, subjectId: null, topic: { is: { subject: { plan: { isArchived: false } } } } }
        ],
        ...(planId ? { planId } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(topicId ? { topicId } : {})
      },
      orderBy: { startedAt: "desc" },
      include: {
        plan: { select: { id: true, title: true } },
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, title: true } }
      }
    });

    return NextResponse.json({ sessions });
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
      scope: "study-sessions:create"
    });
    if (limitResponse) return limitResponse;

    const body = await request.json();
    const parsed = createStudySessionSchema.safeParse(body);
    if (!parsed.success) return badRequest();

    const refsValidation = await validateStudySessionReferences(userId, {
      planId: parsed.data.planId,
      subjectId: parsed.data.subjectId,
      topicId: parsed.data.topicId
    });
    if (!refsValidation.ok) {
      return badRequest(refsValidation.message);
    }

    const { reviewScheduleEnabled, reviewScheduleDays, ...sessionData } = parsed.data;

    const session = await prisma.studySession.create({
      data: {
        ...sessionData,
        userId
      }
    });

    if (reviewScheduleEnabled && session.topicId) {
      const dayOffsets = Array.from(
        new Set(
          (reviewScheduleDays ?? [])
            .map((value) => Math.floor(value))
            .filter((value) => Number.isFinite(value) && value > 0 && value <= 3650)
        )
      ).sort((a, b) => a - b);

      if (dayOffsets.length > 0) {
        const topic = await prisma.topic.findFirst({
          where: {
            id: session.topicId,
            subject: {
              plan: {
                userId,
                isArchived: false
              }
            }
          },
          select: {
            id: true,
            title: true,
            subject: {
              select: {
                id: true,
                name: true,
                planId: true
              }
            }
          }
        });

        if (topic) {
          const baseDate = startOfDate(session.startedAt);
          await prisma.planStudyPlanDay.createMany({
            data: dayOffsets.map((days) => {
              const date = addDays(baseDate, days);
              return {
                userId,
                planId: topic.subject.planId,
                date,
                weekdayLabel: formatWeekdayLabel(date),
                subjectId: topic.subject.id,
                subjectName: topic.subject.name,
                topicId: topic.id,
                topicTitle: topic.title,
                plannedMinutes: 0,
                questionsTarget: 0,
                reviewsTarget: 1,
                mockExamsTarget: 0,
                source: "USER_REVIEW",
                position: days
              };
            })
          });
        }
      }
    }

    return NextResponse.json({ session }, { status: 201 });
  } catch {
    return serverError();
  }
}
