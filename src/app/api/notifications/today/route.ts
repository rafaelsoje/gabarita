import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { env } from "@/lib/env";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { dispatchDailyDigest } from "@/lib/notifications/daily-digest";
import { prisma } from "@/lib/prisma";

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function endOfToday(base = startOfToday()) {
  const end = new Date(base);
  end.setDate(end.getDate() + 1);
  return end;
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  count: number;
  href: string;
};

type NotificationUser = {
  id: string;
  name: string | null;
  email: string;
  notifyEmailEnabled: boolean;
  notifyTelegramEnabled: boolean;
  notifyDiscordEnabled: boolean;
  notifyTelegramBotToken: string | null;
  notifyTelegramChatId: string | null;
  notifyDiscordWebhookUrl: string | null;
  notifyDailySentAt: Date | null;
};

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserIdFromCookie();
  if (!userId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const planId = request.nextUrl.searchParams.get("planId")?.trim() || "";
  const { items, total } = await loadTodaySnapshot(userId, planId);

  return NextResponse.json({
    authenticated: true,
    total,
    items
  });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserIdFromCookie();
  if (!userId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const limitResponse = await enforceMutationRateLimit({
    request,
    userId,
    scope: "notifications:dispatch"
  });
  if (limitResponse) return limitResponse;

  const body = (await request.json().catch(() => ({}))) as { planId?: string };
  const planId = String(body.planId ?? "").trim();
  if (planId) {
    return NextResponse.json(
      { message: "Envio de digest disponível apenas para todos os planos." },
      { status: 400 }
    );
  }

  const [snapshot, user] = await Promise.all([
    loadTodaySnapshot(userId, ""),
    loadNotificationUser(userId)
  ]);

  if (!user) {
    return NextResponse.json({ message: "Usuário não encontrado." }, { status: 404 });
  }
  if (snapshot.total <= 0) {
    return NextResponse.json({ ok: true, sent: false, reason: "no_items" });
  }

  const alreadySentToday = user.notifyDailySentAt ? isSameDay(user.notifyDailySentAt, new Date()) : false;
  if (alreadySentToday) {
    return NextResponse.json({ ok: true, sent: false, reason: "already_sent" });
  }

  const dispatch = await dispatchDailyDigest({
    user,
    items: snapshot.items,
    total: snapshot.total,
    appUrl: env.appUrl,
    planScopeLabel: "todos os planos"
  });

  if (dispatch.sentAny) {
    await prisma.user.update({
      where: { id: user.id },
      data: { notifyDailySentAt: new Date() }
    });
  }

  return NextResponse.json({ ok: true, sent: dispatch.sentAny });
}

async function getAuthenticatedUserIdFromCookie() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  if (!accessToken) return null;

  const payload = await verifyAccessToken(accessToken);
  if (!payload?.sub) return null;
  return payload.sub;
}

async function loadTodaySnapshot(userId: string, planId: string) {
  const todayStart = startOfToday();
  const todayEnd = endOfToday(todayStart);

  const [todayStudyRows, todayReviewRows, todayMockRows] = await Promise.all([
    prisma.planStudyPlanDay.findMany({
      where: {
        userId,
        date: { gte: todayStart, lt: todayEnd },
        ...(planId ? { planId } : {}),
        plan: { isArchived: false }
      },
      select: {
        id: true,
        plannedMinutes: true,
        questionsTarget: true
      }
    }),
    prisma.planStudyPlanDay.findMany({
      where: {
        userId,
        reviewsTarget: { gt: 0 },
        source: { in: ["LLM", "USER_REVIEW"] },
        date: { gte: todayStart, lt: todayEnd },
        ...(planId ? { planId } : {}),
        plan: { isArchived: false }
      },
      select: { id: true }
    }),
    prisma.planStudyPlanDay.findMany({
      where: {
        userId,
        source: "LLM",
        mockExamsTarget: { gt: 0 },
        date: { gte: todayStart, lt: todayEnd },
        ...(planId ? { planId } : {}),
        plan: { isArchived: false }
      },
      select: {
        id: true,
        mockExamsTarget: true
      }
    })
  ]);

  const totalStudyMinutes = todayStudyRows.reduce((acc, row) => acc + Math.max(0, row.plannedMinutes), 0);
  const totalQuestionsTarget = todayStudyRows.reduce((acc, row) => acc + Math.max(0, row.questionsTarget), 0);
  const totalReviews = todayReviewRows.length;
  const totalMocks = todayMockRows.reduce((acc, row) => acc + Math.max(0, row.mockExamsTarget), 0);

  const items: NotificationItem[] = [
    {
      id: "study_today",
      title: "O que estudar hoje",
      description:
        totalStudyMinutes > 0
          ? `${todayStudyRows.length} bloco(s) · ${totalStudyMinutes} min · ${totalQuestionsTarget} questão(ões)`
          : "Nenhum estudo planejado para hoje.",
      count: todayStudyRows.length,
      href: "/"
    },
    {
      id: "review_today",
      title: "O que revisar hoje",
      description: totalReviews > 0 ? `${totalReviews} revisão(ões) programada(s).` : "Nenhuma revisão para hoje.",
      count: totalReviews,
      href: "/revisoes?tab=scheduled"
    },
    {
      id: "mock_today",
      title: "Simulado para hoje",
      description: totalMocks > 0 ? `${totalMocks} simulado(s) planejado(s).` : "Nenhum simulado para hoje.",
      count: totalMocks,
      href: "/simulados"
    }
  ];

  const total = items.reduce((acc, item) => acc + item.count, 0);
  return { items, total };
}

async function loadNotificationUser(userId: string): Promise<NotificationUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      notifyEmailEnabled: true,
      notifyTelegramEnabled: true,
      notifyDiscordEnabled: true,
      notifyTelegramBotToken: true,
      notifyTelegramChatId: true,
      notifyDiscordWebhookUrl: true,
      notifyDailySentAt: true
    }
  });
}
