"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/app-toast";

type PreferencesNotificationTestButtonsProps = {
  formId: string;
};

export function PreferencesNotificationTestButtons({ formId }: PreferencesNotificationTestButtonsProps) {
  const [busyChannel, setBusyChannel] = useState<"" | "email" | "telegram" | "discord">("");

  async function testChannel(channel: "email" | "telegram" | "discord") {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) {
      toastError("Preferências", "Não foi possível localizar o formulário.");
      return;
    }

    const formData = new FormData(form);
    const telegramBotToken = String(formData.get("notifyTelegramBotToken") ?? "").trim();
    const telegramChatId = String(formData.get("notifyTelegramChatId") ?? "").trim();
    const discordWebhookUrl = String(formData.get("notifyDiscordWebhookUrl") ?? "").trim();

    setBusyChannel(channel);
    try {
      const response = await fetch("/api/preferences/test-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          telegramBotToken,
          telegramChatId,
          discordWebhookUrl
        }),
        cache: "no-store"
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; reason?: string; channel?: string } | null;
      if (!response.ok || !payload?.ok) {
        toastError("Preferências", `Falha no teste ${channel}: ${payload?.reason || `http_${response.status}`}`);
        return;
      }

      toastSuccess("Preferências", `Teste de ${channel} enviado com sucesso.`);
    } catch {
      toastError("Preferências", `Falha de rede ao testar ${channel}.`);
    } finally {
      setBusyChannel("");
    }
  }

  return (
    <div className="preferencesTestChannels">
      <button className="secondaryBtn" type="button" onClick={() => testChannel("email")} disabled={Boolean(busyChannel)}>
        {busyChannel === "email" ? "Testando e-mail..." : "Testar e-mail"}
      </button>
      <button className="secondaryBtn" type="button" onClick={() => testChannel("telegram")} disabled={Boolean(busyChannel)}>
        {busyChannel === "telegram" ? "Testando Telegram..." : "Testar Telegram"}
      </button>
      <button className="secondaryBtn" type="button" onClick={() => testChannel("discord")} disabled={Boolean(busyChannel)}>
        {busyChannel === "discord" ? "Testando Discord..." : "Testar Discord"}
      </button>
    </div>
  );
}
