"use client";

import { useEffect, useMemo, useState } from "react";

type ToastKind = "success" | "error" | "info";

type ToastInput = {
  kind?: ToastKind;
  title: string;
  message?: string;
  durationMs?: number;
};

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  message: string;
  durationMs: number;
  leaving: boolean;
};

const EVENT_NAME = "app:toast";

function emitToast(input: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(EVENT_NAME, { detail: input }));
}

export function toastSuccess(title: string, message = "", durationMs = 3200) {
  emitToast({ kind: "success", title, message, durationMs });
}

export function toastError(title: string, message = "", durationMs = 4200) {
  emitToast({ kind: "error", title, message, durationMs });
}

export function toastInfo(title: string, message = "", durationMs = 3200) {
  emitToast({ kind: "info", title, message, durationMs });
}

function createToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AppToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function dismissToast(id: string) {
    setToasts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, leaving: true } : item))
    );
  }

  useEffect(() => {
    function onToast(event: Event) {
      const customEvent = event as CustomEvent<ToastInput>;
      const detail = customEvent.detail;
      if (!detail?.title?.trim()) return;

      const next: ToastItem = {
        id: createToastId(),
        kind: detail.kind ?? "info",
        title: detail.title.trim(),
        message: (detail.message ?? "").trim(),
        durationMs: Math.max(1200, detail.durationMs ?? 3200),
        leaving: false
      };

      setToasts((prev) => [...prev, next]);
    }

    window.addEventListener(EVENT_NAME, onToast as EventListener);
    return () => window.removeEventListener(EVENT_NAME, onToast as EventListener);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts
      .filter((toast) => !toast.leaving)
      .map((toast) =>
      window.setTimeout(() => {
        dismissToast(toast.id);
      }, toast.durationMs)
      );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts]);

  useEffect(() => {
    const leaving = toasts.filter((toast) => toast.leaving);
    if (leaving.length === 0) return;
    const timers = leaving.map((toast) =>
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, 220)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts]);

  const ordered = useMemo(() => [...toasts].slice(-4).reverse(), [toasts]);

  if (ordered.length === 0) return null;

  return (
    <div className="appToastViewport" aria-live="polite" aria-atomic="false">
      {ordered.map((toast) => (
        <div key={toast.id} className={`appToast appToast-${toast.kind} ${toast.leaving ? "leaving" : ""}`} role="status">
          <div className="appToastAccent" />
          <div className="appToastBody">
            <p className="appToastTitle">{toast.title}</p>
            {toast.message ? <p className="appToastMessage">{toast.message}</p> : null}
          </div>
          <button
            type="button"
            className="appToastClose"
            aria-label="Fechar notificação"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
