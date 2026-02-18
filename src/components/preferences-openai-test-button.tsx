"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/app-toast";

type PreferencesOpenAiTestButtonProps = {
  formId: string;
};

export function PreferencesOpenAiTestButton({ formId }: PreferencesOpenAiTestButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) {
      toastError("Preferências", "Não foi possível localizar o formulário.");
      return;
    }

    const formData = new FormData(form);
    const model = String(formData.get("openAiModel") ?? "").trim();
    const apiKey = String(formData.get("openAiApiKey") ?? "").trim();

    setBusy(true);
    try {
      const response = await fetch("/api/preferences/test-openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, apiKey }),
        cache: "no-store"
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; model?: string; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        const reason = payload?.reason || payload?.message || `http_${response.status}`;
        toastError("Preferências", `Falha no teste OpenAI: ${reason}`);
        return;
      }

      toastSuccess("Preferências", `Conexão OpenAI OK (${payload.model || model || "modelo não informado"}).`);
    } catch {
      toastError("Preferências", "Falha de rede ao testar conexão OpenAI.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="secondaryBtn" type="button" onClick={handleClick} disabled={busy}>
      {busy ? "Testando..." : "Testar conexão OpenAI"}
    </button>
  );
}
