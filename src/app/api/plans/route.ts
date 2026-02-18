import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { createPlanSchema } from "@/lib/study/schemas";
import { badRequest, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const plans = await prisma.plan.findMany({
      where: { userId, isArchived: false },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            subjects: true,
            studySessions: true
          }
        }
      }
    });

    return NextResponse.json({ plans });
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
      scope: "plans:create"
    });
    if (limitResponse) return limitResponse;

    const body = await request.json();
    const parsed = createPlanSchema.safeParse(body);
    if (!parsed.success) return badRequest();

    const plan = await prisma.plan.create({
      data: {
        userId,
        ...parsed.data
      }
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch {
    return serverError();
  }
}
