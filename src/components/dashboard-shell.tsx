"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppToastViewport, toastError, toastSuccess } from "@/components/app-toast";
import { ActionIcon } from "@/components/action-icon";
import { StudyTimerWidget } from "@/components/study-timer-widget";

function NavIcon({ name }: { name: string }) {
  const common = { className: "appNavIcon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10.5V20h14v-9.5" />
        </svg>
      );
    case "plans":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      );
    case "subjects":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
    case "topics":
      return (
        <svg {...common}>
          <path d="M6 4h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" />
          <path d="M8 9h8M8 13h6" />
        </svg>
      );
    case "boards":
      return (
        <svg {...common}>
          <path d="M5 6h14v12H5z" />
          <path d="M9 10h6M9 14h4" />
          <path d="M3 6h2M19 6h2M3 18h2M19 18h2" />
        </svg>
      );
    case "concursos":
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M6 17V9l6-3 6 3v8" />
          <path d="M12 6V3" />
          <path d="M9 12h.01M12 12h.01M15 12h.01" />
        </svg>
      );
    case "edital":
      return (
        <svg {...common}>
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case "planning":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 8.6 11.5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 3v5h5M12 8v5l3 2" />
        </svg>
      );
    case "questions":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M11 15v.01" />
          <path d="M9.5 8.5a1.7 1.7 0 1 1 2.9 1.2c-.8.8-1.4 1.2-1.4 2.1" />
          <path d="M20 20 17 17" />
        </svg>
      );
    case "discursive":
      return (
        <svg {...common}>
          <path d="M4 20h4l10-10a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L4 16v4Z" />
          <path d="M12 6l6 6" />
        </svg>
      );
    case "mock":
      return (
        <svg {...common}>
          <path d="M4 6h16v12H4z" />
          <path d="M8 10h8M8 14h5" />
          <path d="M6 3v3M18 3v3" />
        </svg>
      );
    case "stats":
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "exam":
      return (
        <svg {...common}>
          <path d="M12 3 15 9h6l-4.8 3.5L18 19l-6-4-6 4 1.8-6.5L3 9h6z" />
        </svg>
      );
    case "archive":
      return <ActionIcon name="archive" className="appNavIcon" />;
    case "library":
      return (
        <svg {...common}>
          <path d="M4 5h4v14H4zM10 5h4v14h-4zM16 5h4v14h-4z" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20a8 8 0 0 1 16 0" />
        </svg>
      );
    default:
      return null;
  }
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const webNotifiedSignatureRef = useRef("");
  const [viewer, setViewer] = useState<{ name: string | null; email: string; avatarUrl: string | null } | null>(null);
  const [streakDays, setStreakDays] = useState(0);
  const [notifications, setNotifications] = useState<{
    total: number;
    items: Array<{ id: string; title: string; description: string; count: number; href: string }>;
  }>({
    total: 0,
    items: []
  });
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const isNewPlanOpen = pathname === "/" && searchParams.get("newPlan") === "1";
  const isPlansTabOpen = pathname === "/" && searchParams.get("tab") === "planos";
  const isHomeActive = pathname === "/" && !isNewPlanOpen && !isPlansTabOpen;
  const isPlansActive = pathname.startsWith("/planos") || isNewPlanOpen || isPlansTabOpen;
  const isSubjectsActive =
    pathname === "/disciplinas" || pathname.startsWith("/topicos") || /^\/disciplinas\/[^/]+/.test(pathname);
  const isEditalActive = pathname.startsWith("/edital");
  const isBoardsActive = pathname.startsWith("/bancas");
  const isConcursosActive = pathname.startsWith("/concursos");
  const isPlanningActive = pathname.startsWith("/planejamento");
  const isReviewsActive = pathname.startsWith("/revisoes");
  const isHistoryActive = pathname.startsWith("/historico");
  const isQuestionsActive = pathname.startsWith("/questoes");
  const isDiscursiveActive = pathname.startsWith("/discursiva");
  const isMockExamsActive = pathname.startsWith("/simulados");
  const isExamsActive = pathname.startsWith("/provas");
  const isStatsActive = pathname.startsWith("/estatisticas");
  const isLibraryActive = pathname.startsWith("/biblioteca");
  const isArchiveActive = pathname.startsWith("/arquivo");
  const planIdFromPath = pathname.startsWith("/planos/") ? pathname.split("/")[2] ?? "" : "";
  const currentPlanId = searchParams.get("planId") || planIdFromPath || undefined;
  const notificationDayKey = new Date().toISOString().slice(0, 10);
  const notificationScopeKey = currentPlanId || "ALL";
  const notificationSeenStorageKey = `gabarita:seen-notifications:${notificationDayKey}:${notificationScopeKey}`;
  const seenNotificationsSet = new Set(seenNotificationIds);
  const unreadNotificationsTotal = notifications.items.reduce(
    (acc, item) => acc + (seenNotificationsSet.has(item.id) ? 0 : item.count),
    0
  );

  useEffect(() => {
    const toastCode = searchParams.get("toast");
    if (!toastCode) return;

    const map: Record<string, { kind: "success" | "error"; title: string; message: string }> = {
      plan_created: { kind: "success", title: "Plano", message: "Plano criado com sucesso." },
      plan_updated: { kind: "success", title: "Plano", message: "Plano atualizado com sucesso." },
      plan_deleted: { kind: "success", title: "Plano", message: "Plano removido com sucesso." },
      plan_archived: { kind: "success", title: "Plano", message: "Plano arquivado com sucesso." },
      plan_restored: { kind: "success", title: "Plano", message: "Plano reativado com sucesso." },
      subject_created: { kind: "success", title: "Disciplina", message: "Disciplina criada com sucesso." },
      subject_updated: { kind: "success", title: "Disciplina", message: "Disciplina atualizada com sucesso." },
      subject_deleted: { kind: "success", title: "Disciplina", message: "Disciplina removida com sucesso." },
      topic_created: { kind: "success", title: "Tópico", message: "Tópico criado com sucesso." },
      topic_updated: { kind: "success", title: "Tópico", message: "Tópico atualizado com sucesso." },
      topic_deleted: { kind: "success", title: "Tópico", message: "Tópico removido com sucesso." },
      questions_generated: { kind: "success", title: "Questões", message: "Questões geradas com sucesso." },
      questions_generated_llm: { kind: "success", title: "Questões", message: "Questões geradas via LLM." },
      questions_generated_fallback: {
        kind: "error",
        title: "Questões",
        message: "Geração local desativada. Configure a LLM em Preferências."
      },
      questions_generated_fallback_quota: {
        kind: "error",
        title: "Questões",
        message: "Quota da OpenAI excedida. A geração foi interrompida."
      },
      question_correct: { kind: "success", title: "Questão", message: "Resposta correta." },
      question_wrong: { kind: "error", title: "Questão", message: "Resposta incorreta." },
      mock_created: { kind: "success", title: "Simulado", message: "Simulado criado com sucesso." },
      mock_submitted: { kind: "success", title: "Simulado", message: "Tentativa registrada com sucesso." },
      preferences_saved: { kind: "success", title: "Preferências", message: "Configurações salvas com sucesso." },
      preferences_llm_saved: { kind: "success", title: "Conta LLM", message: "Configurações de LLM salvas com sucesso." },
      preferences_notify_saved: { kind: "success", title: "Notificações", message: "Notificações externas salvas com sucesso." },
      preferences_test_ok: { kind: "success", title: "OpenAI", message: "Conexão validada com sucesso." },
      preferences_test_fail: { kind: "error", title: "OpenAI", message: "Falha ao validar conexão. Veja o detalhe técnico na página." },
      preferences_schema_pending: {
        kind: "error",
        title: "Preferências",
        message: "Banco desatualizado para salvar LLM. Aplique as migrations e tente novamente."
      },
      preferences_encryption_key_missing: {
        kind: "error",
        title: "Preferências",
        message: "Configure SECRETS_ENCRYPTION_KEY no ambiente para salvar dados sensíveis."
      },
      board_saved: { kind: "success", title: "Bancas", message: "Banca salva com sucesso." },
      board_deleted: { kind: "success", title: "Bancas", message: "Banca removida com sucesso." },
      concursos_sync_ok: { kind: "success", title: "Concursos", message: "Lista atualizada com sucesso." },
      concursos_sync_error: { kind: "error", title: "Concursos", message: "Falha ao atualizar. Verifique o feed configurado." },
      exam_result_saved: { kind: "success", title: "Provas", message: "Resultado de prova salvo com sucesso." },
      exam_result_deleted: { kind: "success", title: "Provas", message: "Resultado de prova removido com sucesso." },
      exam_result_file_invalid: { kind: "error", title: "Provas", message: "Envie apenas arquivo PDF para a prova." },
      exam_result_file_too_large: { kind: "error", title: "Provas", message: "PDF da prova excede 12MB." },
      boards_schema_pending: {
        kind: "error",
        title: "Bancas",
        message: "Banco desatualizado para bancas. Aplique as migrations e tente novamente."
      },
      item_created: { kind: "success", title: "Cadastro", message: "Item incluído com sucesso." },
      item_updated: { kind: "success", title: "Cadastro", message: "Item atualizado com sucesso." },
      item_deleted: { kind: "success", title: "Cadastro", message: "Item removido com sucesso." },
      account_delete_validation: {
        kind: "error",
        title: "Excluir conta",
        message: "Confirme a frase, a senha e o aceite para excluir a conta."
      },
      account_delete_wrong_password: {
        kind: "error",
        title: "Excluir conta",
        message: "Senha atual inválida."
      },
      action_error: { kind: "error", title: "Erro", message: "Não foi possível concluir a ação." },
    };

    const payload = map[toastCode];
    if (payload) {
      if (payload.kind === "success") {
        toastSuccess(payload.title, payload.message);
      } else {
        toastError(payload.title, payload.message);
      }
    }

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("toast");
      url.searchParams.delete("qfb");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [searchParams]);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    setNotificationsOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      try {
        const planQuery = currentPlanId ? `?planId=${encodeURIComponent(currentPlanId)}` : "";
        const response = await fetch(`/api/notifications/today${planQuery}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          total?: number;
          items?: Array<{ id: string; title: string; description: string; count: number; href: string }>;
        };
        if (cancelled) return;
        setNotifications({
          total: Number.isFinite(payload.total) ? Math.max(0, Number(payload.total)) : 0,
          items: Array.isArray(payload.items) ? payload.items : []
        });
      } catch {
        if (!cancelled) {
          setNotifications({ total: 0, items: [] });
        }
      }
    }
    void loadNotifications();
    return () => {
      cancelled = true;
    };
  }, [currentPlanId, pathname, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(notificationSeenStorageKey);
    if (!raw) {
      setSeenNotificationIds([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as string[];
      setSeenNotificationIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSeenNotificationIds([]);
    }
  }, [notificationSeenStorageKey]);

  useEffect(() => {
    const validIds = new Set(notifications.items.map((item) => item.id));
    setSeenNotificationIds((prev) => {
      const filtered = prev.filter((id) => validIds.has(id));
      if (filtered.length === prev.length) return prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(notificationSeenStorageKey, JSON.stringify(filtered));
      }
      return filtered;
    });
  }, [notifications.items, notificationSeenStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (unreadNotificationsTotal <= 0) return;

    const dayKey = notificationDayKey;
    const scopeKey = notificationScopeKey;
    const countsSignature = notifications.items
      .filter((item) => !seenNotificationsSet.has(item.id))
      .map((item) => `${item.id}:${item.count}`)
      .join("|");
    const signature = `${dayKey}|${scopeKey}|${countsSignature}`;
    if (webNotifiedSignatureRef.current === signature) return;
    webNotifiedSignatureRef.current = signature;

    const deliveredKey = `gabarita:web-notify:${signature}`;
    if (window.localStorage.getItem(deliveredKey) === "1") return;

    const relevantItems = notifications.items.filter((item) => item.count > 0 && !seenNotificationsSet.has(item.id));
    if (relevantItems.length === 0) return;

    const primary = relevantItems[0];
    const summary = relevantItems
      .slice(0, 3)
      .map((item) => `${item.title}: ${item.count}`)
      .join(" • ");

    const showNotification = () => {
      const browserNotification = new Notification("Gabarita • Pendências de hoje", {
        body: summary,
        tag: `gabarita-day-${dayKey}-${scopeKey}`
      });
      browserNotification.onclick = () => {
        window.focus();
        window.location.href = primary.href || "/";
      };
      window.localStorage.setItem(deliveredKey, "1");
    };

    if (Notification.permission === "granted") {
      showNotification();
      return;
    }

    if (Notification.permission !== "default") return;

    const permissionAskedKey = "gabarita:web-notify:permission-asked";
    if (window.localStorage.getItem(permissionAskedKey) === "1") return;
    window.localStorage.setItem(permissionAskedKey, "1");
    void Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        showNotification();
      }
    });
  }, [notifications, currentPlanId, unreadNotificationsTotal, seenNotificationIds, notificationDayKey, notificationScopeKey]);

  function markNotificationAsSeen(itemId: string) {
    setSeenNotificationIds((prev) => {
      if (prev.includes(itemId)) return prev;
      const next = [...prev, itemId];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(notificationSeenStorageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  function markAllNotificationsAsSeen() {
    const allIds = notifications.items.map((item) => item.id);
    setSeenNotificationIds(allIds);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(notificationSeenStorageKey, JSON.stringify(allIds));
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadViewer() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          authenticated: boolean;
          user?: { name: string | null; email: string; avatarUrl: string | null };
          streakDays?: number;
        };
        if (!cancelled && payload.authenticated && payload.user) {
          setViewer(payload.user);
          setStreakDays(Number.isFinite(payload.streakDays) ? Math.max(0, Number(payload.streakDays)) : 0);
        }
      } catch {
        // ignore
      }
    }
    void loadViewer();
    return () => {
      cancelled = true;
    };
  }, [pathname, searchParams]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("theme") : null;
    const preferredDark = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
    const nextTheme = saved === "dark" || saved === "light" ? saved : preferredDark ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem("theme", nextTheme);
  }

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  async function logout() {
    const timerKeys = [
      "study_timer_elapsed_seconds",
      "study_timer_running",
      "study_timer_started_at",
      "study_timer_pause_visible",
      "study_timer_pause_elapsed_seconds",
      "study_timer_pause_started_at",
    ];

    for (const key of timerKeys) {
      window.localStorage.removeItem(key);
    }

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/entrar";
    }
  }

  return (
    <div className={`appShell ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobileOpen" : ""}`}>
      <button
        className="mobileMenuBtn"
        type="button"
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        onClick={() => setMobileOpen((prev) => !prev)}
      >
        {mobileOpen ? "✕" : "☰"}
      </button>
      {mobileOpen ? <button className="mobileMenuBackdrop" type="button" aria-label="Fechar menu" onClick={closeMobileMenu} /> : null}

      <aside className="appSidebar">
        <div className="appSidebarTop">
          <div className="appBrand">
            <Image className="appBrandFull" src="/brand/logo-gabarita.svg" alt="Gabarita" width={220} height={62} priority />
            <Image className="appBrandMini" src="/brand/logo-gabarita-mark.svg" alt="Gabarita" width={34} height={34} priority />
          </div>
          <button
            className="sidebarToggleBtn"
            type="button"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            <svg className="sidebarToggleIcon" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d={collapsed ? "M8 5l4 5-4 5" : "M12 5l-4 5 4 5"}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={collapsed ? "M4 4v12" : "M16 4v12"}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <nav className="appNav">
          <Link className={`appNavItem ${isHomeActive ? "active" : ""}`} href="/" onClick={closeMobileMenu} data-label="Início">
            <NavIcon name="home" />
            <span>Início</span>
          </Link>

          <Link
            className={`appNavItem ${isConcursosActive ? "active" : ""}`}
            href="/concursos"
            onClick={closeMobileMenu}
            data-label="Concursos"
          >
            <NavIcon name="concursos" />
            <span>Concursos</span>
          </Link>

          <Link className={`appNavItem ${isPlansActive ? "active" : ""}`} href="/?tab=planos" onClick={closeMobileMenu} data-label="Planos">
            <NavIcon name="plans" />
            <span>Planos</span>
          </Link>

          <Link className={`appNavItem ${isSubjectsActive ? "active" : ""}`} href="/disciplinas" onClick={closeMobileMenu} data-label="Disciplinas">
            <NavIcon name="subjects" />
            <span>Disciplinas</span>
          </Link>
          <Link className={`appNavItem ${isEditalActive ? "active" : ""}`} href="/edital" onClick={closeMobileMenu} data-label="Edital">
            <NavIcon name="edital" />
            <span>Edital</span>
          </Link>
          <Link className={`appNavItem ${isBoardsActive ? "active" : ""}`} href="/bancas" onClick={closeMobileMenu} data-label="Bancas">
            <NavIcon name="boards" />
            <span>Bancas</span>
          </Link>
          <Link className={`appNavItem ${isPlanningActive ? "active" : ""}`} href="/planejamento" onClick={closeMobileMenu} data-label="Planejamento">
            <NavIcon name="planning" />
            <span>Planejamento</span>
          </Link>
          <Link
            className={`appNavItem ${isReviewsActive ? "active" : ""}`}
            href="/revisoes"
            onClick={closeMobileMenu}
            data-label="Revisões"
          >
            <NavIcon name="review" />
            <span>Revisões</span>
          </Link>
          <Link
            className={`appNavItem ${isHistoryActive ? "active" : ""}`}
            href="/historico"
            onClick={closeMobileMenu}
            data-label="Histórico"
          >
            <NavIcon name="history" />
            <span>Histórico</span>
          </Link>
          <Link
            className={`appNavItem ${isQuestionsActive ? "active" : ""}`}
            href="/questoes"
            onClick={closeMobileMenu}
            data-label="Questões"
          >
            <NavIcon name="questions" />
            <span>Questões</span>
          </Link>
          <Link
            className={`appNavItem ${isDiscursiveActive ? "active" : ""}`}
            href="/discursiva"
            onClick={closeMobileMenu}
            data-label="Discursiva"
          >
            <NavIcon name="discursive" />
            <span>Discursiva</span>
          </Link>
          <Link
            className={`appNavItem ${isMockExamsActive ? "active" : ""}`}
            href="/simulados"
            onClick={closeMobileMenu}
            data-label="Simulados"
          >
            <NavIcon name="mock" />
            <span>Simulados</span>
          </Link>
          <Link className={`appNavItem ${isExamsActive ? "active" : ""}`} href="/provas" onClick={closeMobileMenu} data-label="Provas">
            <NavIcon name="exam" />
            <span>Provas</span>
          </Link>
          <Link
            className={`appNavItem ${isStatsActive ? "active" : ""}`}
            href="/estatisticas"
            onClick={closeMobileMenu}
            data-label="Estatísticas"
          >
            <NavIcon name="stats" />
            <span>Estatísticas</span>
          </Link>
          <Link className={`appNavItem ${isLibraryActive ? "active" : ""}`} href="/biblioteca" onClick={closeMobileMenu} data-label="Biblioteca">
            <NavIcon name="library" />
            <span>Biblioteca</span>
          </Link>
          <Link className={`appNavItem ${isArchiveActive ? "active" : ""}`} href="/arquivo" onClick={closeMobileMenu} data-label="Arquivo">
            <NavIcon name="archive" />
            <span>Arquivo</span>
          </Link>

        </nav>

      </aside>

      <div className="appMain">
        <header className="topSystemBar">
          <div className="topSystemActions">
            <button className="topIconBtn" type="button" aria-label="Alternar tema" onClick={toggleTheme}>
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <div className="topNotificationsWrap" ref={notificationsRef}>
              <button
                className="topIconBtn topNotificationsBtn"
                type="button"
                aria-label="Notificações"
                onClick={() => setNotificationsOpen((prev) => !prev)}
              >
                <span aria-hidden="true">🔔</span>
                {unreadNotificationsTotal > 0 ? <span className="topNotificationsCount">{unreadNotificationsTotal}</span> : null}
              </button>
              {notificationsOpen ? (
                <div className="topNotificationsDropdown">
                  {notifications.items.length === 0 ? (
                    <p className="topNotificationsEmpty">Sem notificações para hoje.</p>
                  ) : (
                    <>
                      <div className="topNotificationsHeaderActions">
                        <button type="button" className="topNotificationsMarkAllBtn" onClick={markAllNotificationsAsSeen}>
                          Marcar todas como lidas
                        </button>
                      </div>
                      {notifications.items.map((item) => (
                        <Link
                          key={item.id}
                          className={`topNotificationsItem ${seenNotificationsSet.has(item.id) ? "seen" : ""}`}
                          href={item.href}
                          onClick={() => {
                            markNotificationAsSeen(item.id);
                            setNotificationsOpen(false);
                          }}
                        >
                          <strong>{item.title}</strong>
                          <span>{item.description}</span>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <div className="topStreakBadge" title="Dias seguidos estudando">
              <span className="topStreakIcon" aria-hidden="true">
                🔥
              </span>
              <span className="topStreakValue">{streakDays} {streakDays === 1 ? "dia" : "dias"}</span>
            </div>
            <div className="topUserMenuWrap" ref={userMenuRef}>
              <button className="topUserMenuBtn" type="button" onClick={() => setUserMenuOpen((prev) => !prev)} aria-label="Menu do usuário">
                {viewer?.avatarUrl ? (
                  <Image className="topUserAvatar" src={viewer.avatarUrl} alt="Foto de perfil" width={40} height={40} />
                ) : (
                  <span className="topUserAvatar">{(viewer?.name ?? viewer?.email ?? "U").slice(0, 1).toUpperCase()}</span>
                )}
              </button>
              {userMenuOpen ? (
                <div className="topUserDropdown">
                  <Link className="topUserDropdownItem" href="/preferencias" onClick={() => setUserMenuOpen(false)}>
                    Preferências
                  </Link>
                  <Link className="topUserDropdownItem" href="/perfil" onClick={() => setUserMenuOpen(false)}>
                    Perfil
                  </Link>
                  <Link className="topUserDropdownItem" href="/assinatura" onClick={() => setUserMenuOpen(false)}>
                    Assinatura
                  </Link>
                  <button className="topUserDropdownItem danger" type="button" onClick={logout}>
                    Sair
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className="appContent">{children}</div>
      </div>
      <StudyTimerWidget currentPlanId={currentPlanId} />
      <AppToastViewport />
    </div>
  );
}
