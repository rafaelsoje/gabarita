"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/app-toast";

export function PreferencesOllamaTestButton() {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const response = await fetch("/api/preferences/test-ollama", {
        method: "POST",
        cache: "no-store"
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; model?: string; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        const reason = payload?.reason || payload?.message || `http_${response.status}`;
        toastError("Preferências", `Falha no teste Ollama: ${reason}`);
        return;
      }

      toastSuccess("Preferências", `Conexão Ollama OK (${payload.model || "modelo não informado"}).`);
    } catch {
      toastError("Preferências", "Falha de rede ao testar conexão Ollama.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="secondaryBtn" type="button" onClick={handleClick} disabled={busy}>
      {busy ? "Testando..." : "Testar conexão Ollama"}
    </button>
  );
}
