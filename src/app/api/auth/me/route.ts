import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/prisma";
import { computeCurrentStreakDays, localDayKey } from "@/lib/study/activity-stats";

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload?.sub) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const streakDays = await getCurrentStudyStreakDays(payload.sub);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        phone: true,
        birthDate: true,
        city: true,
        state: true
      }
    });

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({ authenticated: true, user, streakDays });
  } catch {
    // Fallback for environments where recent profile columns were not migrated yet.
    const basicUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    if (!basicUser) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const streakDays = await getCurrentStudyStreakDays(payload.sub);
    return NextResponse.json({
      authenticated: true,
      streakDays,
      user: {
        ...basicUser,
        avatarUrl: null,
        phone: null,
        birthDate: null,
        city: null,
        state: null
      }
    });
  }
}

async function getCurrentStudyStreakDays(userId: string) {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 400);
    const [sessions, questionResponses, mockAttempts] = await Promise.all([
      prisma.studySession.findMany({
        where: {
          userId,
          startedAt: { gte: start }
        },
        select: { startedAt: true }
      }),
      prisma.questionResponse.findMany({
        where: {
          userId,
          createdAt: { gte: start }
        },
        select: { createdAt: true }
      }),
      prisma.mockExamAttempt.findMany({
        where: {
          userId,
          finishedAt: { gte: start }
        },
        select: { finishedAt: true }
      })
    ]);

    const studiedDays = new Set<string>();
    for (const item of sessions) studiedDays.add(localDayKey(item.startedAt));
    for (const item of questionResponses) studiedDays.add(localDayKey(item.createdAt));
    for (const item of mockAttempts) studiedDays.add(localDayKey(item.finishedAt));
    return computeCurrentStreakDays({ dayKeys: studiedDays, today: now, maxWindowDays: 400 });
  } catch {
    return 0;
  }
}
