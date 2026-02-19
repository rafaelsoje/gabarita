import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { dispatchDailyDigest } from "@/lib/notifications/daily-digest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";

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

function getUtcDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

const CONCURSO_REGIONS = new Set([
  "NACIONAL",
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO"
]);

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const planId = request.nextUrl.searchParams.get("planId")?.trim() || "";
  const { items, total } = await loadTodaySnapshot(userId, planId, true);

  return NextResponse.json({
    authenticated: true,
    total,
    items
  });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
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
    loadTodaySnapshot(userId, "", true),
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

async function loadTodaySnapshot(userId: string, planId: string, updateConcursoNotificationState: boolean) {
  const todayStart = startOfToday();
  const todayEnd = endOfToday(todayStart);

  const [todayStudyRows, todayReviewRows, todayMockRows, concursoNotification] = await Promise.all([
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
    }),
    loadConcursoNotifications(userId, { todayStart, todayEnd, updateState: updateConcursoNotificationState })
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
    },
    {
      id: "concursos_open_new",
      title: "Novos concursos abertos",
      description:
        concursoNotification.newOpenCount > 0
          ? `${concursoNotification.newOpenCount} concurso(s) aberto(s) novo(s) nas regiões selecionadas.`
          : "Nenhum novo concurso aberto para notificar.",
      count: concursoNotification.newOpenCount,
      href: "/concursos?status=OPEN"
    },
    {
      id: "concursos_last_day",
      title: "Concursos encerrando hoje",
      description:
        concursoNotification.newLastDayCount > 0
          ? `${concursoNotification.newLastDayCount} concurso(s) no último dia de inscrição hoje.`
          : "Nenhum concurso encerra inscrições hoje.",
      count: concursoNotification.newLastDayCount,
      href: "/concursos?status=OPEN"
    }
  ];

  const visibleItems = items.filter((item) => item.count > 0);
  const total = visibleItems.reduce((acc, item) => acc + item.count, 0);
  return { items: visibleItems, total };
}

async function loadConcursoNotifications(
  userId: string,
  params: { todayStart: Date; todayEnd: Date; updateState: boolean }
) {
  type PreferencesShape = {
    notifyConcursosEnabled: boolean;
    notifyConcursosRegions: string[];
    notifyConcursosNotifiedOpen: string[];
    notifyConcursosNotifiedLastDay: string[];
  };

  let prefs: PreferencesShape;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        notifyConcursosEnabled: true,
        notifyConcursosRegions: true,
        notifyConcursosNotifiedOpen: true,
        notifyConcursosNotifiedLastDay: true
      }
    });
    prefs = {
      notifyConcursosEnabled: Boolean(user?.notifyConcursosEnabled ?? true),
      notifyConcursosRegions: normalizeConcursoRegions(user?.notifyConcursosRegions ?? ["ALL", "NACIONAL"]),
      notifyConcursosNotifiedOpen: Array.isArray(user?.notifyConcursosNotifiedOpen) ? user.notifyConcursosNotifiedOpen : [],
      notifyConcursosNotifiedLastDay: Array.isArray(user?.notifyConcursosNotifiedLastDay) ? user.notifyConcursosNotifiedLastDay : []
    };
  } catch (error) {
    if (!hasMissingConcursoNotificationColumns(error)) throw error;
    return { newOpenCount: 0, newLastDayCount: 0 };
  }

  if (!prefs.notifyConcursosEnabled) {
    if (params.updateState && (prefs.notifyConcursosNotifiedOpen.length > 0 || prefs.notifyConcursosNotifiedLastDay.length > 0)) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          notifyConcursosNotifiedOpen: [],
          notifyConcursosNotifiedLastDay: []
        }
      });
    }
    return { newOpenCount: 0, newLastDayCount: 0 };
  }

  const regionFilter = createConcursoRegionFilter(prefs.notifyConcursosRegions);
  if (!regionFilter) return { newOpenCount: 0, newLastDayCount: 0 };
  const todayUtcStart = new Date(
    Date.UTC(params.todayStart.getUTCFullYear(), params.todayStart.getUTCMonth(), params.todayStart.getUTCDate())
  );
  const todayUtcKey = getUtcDateKey(params.todayStart);

  const whereOpen = {
    status: "OPEN" as const,
    source: {
      startsWith: "PCI"
    },
    AND: [
      regionFilter === "ALL" ? {} : regionFilter,
      { OR: [{ registrationEnd: null }, { registrationEnd: { gte: todayUtcStart } }] }
    ]
  };

  const openConcursos = await prisma.concursoListing.findMany({
    where: whereOpen,
    select: {
      source: true,
      externalId: true,
      registrationEnd: true
    }
  });

  const activeKeys = new Set(openConcursos.map((item) => `${item.source}::${item.externalId}`));
  const activeLastDayKeys = new Set(
    openConcursos
      .filter((item) => item.registrationEnd && getUtcDateKey(item.registrationEnd) === todayUtcKey)
      .map((item) => `${item.source}::${item.externalId}`)
  );

  const prevOpen = new Set(prefs.notifyConcursosNotifiedOpen);
  const prevLastDay = new Set(prefs.notifyConcursosNotifiedLastDay);
  const newOpenKeys = Array.from(activeKeys).filter((key) => !prevOpen.has(key));
  const newLastDayKeys = Array.from(activeLastDayKeys).filter((key) => !prevLastDay.has(key));
  const newOpenCount = newOpenKeys.length;
  const newLastDayCount = newLastDayKeys.length;

  if (params.updateState) {
    const nextOpen = Array.from(activeKeys).sort();
    const nextLastDay = Array.from(activeLastDayKeys).sort();
    const didChange =
      nextOpen.length !== prefs.notifyConcursosNotifiedOpen.length ||
      nextLastDay.length !== prefs.notifyConcursosNotifiedLastDay.length ||
      nextOpen.some((item, index) => item !== prefs.notifyConcursosNotifiedOpen[index]) ||
      nextLastDay.some((item, index) => item !== prefs.notifyConcursosNotifiedLastDay[index]);
    if (didChange) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          notifyConcursosNotifiedOpen: nextOpen,
          notifyConcursosNotifiedLastDay: nextLastDay
        }
      });
    }
  }

  return { newOpenCount, newLastDayCount };
}

function createConcursoRegionFilter(regions: string[]) {
  const normalized = normalizeConcursoRegions(regions);
  const allStates = normalized.includes("ALL");
  const includeNational = normalized.includes("NACIONAL");
  if (allStates && includeNational) return "ALL" as const;
  if (allStates) {
    return { state: { not: null as string | null } };
  }
  const ufList = normalized.filter((value) => value !== "NACIONAL");
  if (includeNational && ufList.length > 0) {
    return { OR: [{ state: { in: ufList } }, { state: null }] };
  }
  if (includeNational) {
    return { state: null };
  }
  if (ufList.length > 0) {
    return { state: { in: ufList } };
  }
  return null;
}

function normalizeConcursoRegions(regions: string[]) {
  const normalized = Array.from(
    new Set(
      regions
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value === "ALL" || CONCURSO_REGIONS.has(value))
    )
  );
  return normalized.length > 0 ? normalized : ["ALL", "NACIONAL"];
}

function hasMissingConcursoNotificationColumns(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("notifyConcursosEnabled") ||
    error.message.includes("notifyConcursosRegions") ||
    error.message.includes("notifyConcursosNotifiedOpen") ||
    error.message.includes("notifyConcursosNotifiedLastDay")
  );
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
