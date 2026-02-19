import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PreferencesNotificationTestButtons } from "@/components/preferences-notification-test-buttons";
import { PreferencesOpenAiTestButton } from "@/components/preferences-openai-test-button";
import { PreferencesConcursosForm } from "@/components/preferences-concursos-form";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sealSecret, unsealSecret } from "@/lib/security/secrets";

const LLM_MODEL_OPTIONS = [
  { value: "gpt-5-mini", label: "GPT-5 Mini (menor custo)" },
  { value: "gpt-5", label: "GPT-5 (equilibrado)" },
  { value: "gpt-5.2", label: "GPT-5.2 (maior qualidade, maior custo)" }
] as const;
const LLM_PROVIDER_OPTIONS = [
  { value: "AUTO", label: "Auto (OpenAI -> Ollama)" },
  { value: "OPENAI", label: "Forçar OpenAI" },
  { value: "OLLAMA", label: "Forçar Ollama" }
] as const;
const NOTIFY_CONCURSOS_REGIONS = [
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
] as const;

type PreferencesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PreferencesPage({ searchParams }: PreferencesPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");
  await searchParams;

  const user = await loadUserPreferences(userId);

  if (!user) redirect("/entrar");

  const emailChannelConfigured = Boolean(env.smtpHost && env.smtpUser && env.smtpPass && (env.smtpFrom || env.smtpUser));
  const telegramChannelConfigured = Boolean((user.notifyTelegramBotToken ?? "").trim() && (user.notifyTelegramChatId ?? "").trim());
  const discordChannelConfigured = Boolean((user.notifyDiscordWebhookUrl ?? "").trim().startsWith("https://"));

  async function saveLlmPreferences(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const llmEmailRaw = formData.get("openAiEmail");
    const modelRaw = formData.get("openAiModel");
    const apiKeyRaw = formData.get("openAiApiKey");
    const providerRaw = formData.get("llmProvider");
    const clearApiKeyRaw = formData.get("clearApiKey");
    const llmEmail = typeof llmEmailRaw === "string" ? llmEmailRaw.trim() : "";
    const model = typeof modelRaw === "string" ? modelRaw.trim() : "";
    const apiKey = typeof apiKeyRaw === "string" ? apiKeyRaw.trim() : "";
    const llmProvider = normalizeLlmProvider(typeof providerRaw === "string" ? providerRaw : "");
    const clearApiKey = clearApiKeyRaw === "on";

    const data: {
      openAiEmail?: string | null;
      openAiModel?: string | null;
      openAiApiKey?: string | null;
      llmProvider?: string | null;
    } = {
      openAiEmail: llmEmail ? llmEmail.slice(0, 160) : null,
      openAiModel: model ? model.slice(0, 80) : null,
      llmProvider
    };

    if (clearApiKey) {
      data.openAiApiKey = null;
    } else if (apiKey) {
      data.openAiApiKey = sealSecret(apiKey.slice(0, 300));
    }

    try {
      await prisma.user.update({
        where: { id: currentUserId },
        data
      });
    } catch (error) {
      if (isSecretsEncryptionKeyMissingError(error)) {
        redirect("/preferencias?toast=preferences_encryption_key_missing");
      }
      if (hasMissingLlmColumns(error)) {
        redirect("/preferencias?toast=preferences_schema_pending");
      }
      throw error;
    }

    revalidatePath("/preferencias");
    revalidatePath("/questoes");
    redirect(`/preferencias?toast=preferences_llm_saved&qfb=${Date.now()}`);
  }

  async function saveNotificationPreferences(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const notifyEmailEnabledRaw = formData.get("notifyEmailEnabled");
    const notifyTelegramEnabledRaw = formData.get("notifyTelegramEnabled");
    const notifyDiscordEnabledRaw = formData.get("notifyDiscordEnabled");
    const notifyTelegramBotTokenRaw = formData.get("notifyTelegramBotToken");
    const notifyTelegramChatIdRaw = formData.get("notifyTelegramChatId");
    const notifyDiscordWebhookUrlRaw = formData.get("notifyDiscordWebhookUrl");

    const notifyEmailEnabled = notifyEmailEnabledRaw === "on";
    const notifyTelegramEnabled = notifyTelegramEnabledRaw === "on";
    const notifyDiscordEnabled = notifyDiscordEnabledRaw === "on";
    const notifyTelegramBotToken = typeof notifyTelegramBotTokenRaw === "string" ? notifyTelegramBotTokenRaw.trim() : "";
    const notifyTelegramChatId = typeof notifyTelegramChatIdRaw === "string" ? notifyTelegramChatIdRaw.trim() : "";
    const notifyDiscordWebhookUrl = typeof notifyDiscordWebhookUrlRaw === "string" ? notifyDiscordWebhookUrlRaw.trim() : "";

    try {
      await prisma.user.update({
        where: { id: currentUserId },
        data: {
          notifyEmailEnabled,
          notifyTelegramEnabled,
          notifyDiscordEnabled,
          notifyTelegramBotToken: notifyTelegramBotToken ? sealSecret(notifyTelegramBotToken.slice(0, 300)) : null,
          notifyTelegramChatId: notifyTelegramChatId ? sealSecret(notifyTelegramChatId.slice(0, 100)) : null,
          notifyDiscordWebhookUrl: notifyDiscordWebhookUrl ? sealSecret(notifyDiscordWebhookUrl.slice(0, 500)) : null
        }
      });
    } catch (error) {
      if (isSecretsEncryptionKeyMissingError(error)) {
        redirect("/preferencias?toast=preferences_encryption_key_missing");
      }
      if (hasMissingLlmColumns(error)) {
        redirect("/preferencias?toast=preferences_schema_pending");
      }
      throw error;
    }

    revalidatePath("/preferencias");
    redirect(`/preferencias?toast=preferences_notify_saved&qfb=${Date.now()}`);
  }

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Preferências</h1>
          <p>Configure a integração de LLM por usuário para geração de questões.</p>
        </div>
      </section>

      <section className="dashboardCard profileCard">
        <p className="profileMeta">Conta: {user.email}</p>
        <div className="preferencesPanels">
          <form id="preferences-llm-form" className="profileForm preferencesPanel" action={saveLlmPreferences}>
              <h2 className="profileSectionTitle">Conta LLM</h2>
              <p className="profileMeta">Configura a geração por OpenAI/Ollama na sua conta.</p>

              <label className="fieldLabel" htmlFor="openAiModel">
                MODELO CHATGPT
              </label>
              <select id="openAiModel" className="input" name="openAiModel" defaultValue={user.openAiModel ?? "gpt-5-mini"}>
                {LLM_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label className="fieldLabel" htmlFor="llmProvider">
                PROVEDOR LLM
              </label>
              <select id="llmProvider" className="input" name="llmProvider" defaultValue={normalizeLlmProvider(user.llmProvider ?? "") ?? "AUTO"}>
                {LLM_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label className="fieldLabel" htmlFor="openAiEmail">
                EMAIL DA CONTA OPENAI
              </label>
              <input
                id="openAiEmail"
                className="input"
                name="openAiEmail"
                type="email"
                defaultValue={user.openAiEmail ?? ""}
                placeholder="seu-email-openai@dominio.com"
                autoComplete="email"
                maxLength={160}
              />

              <label className="fieldLabel" htmlFor="openAiApiKey">
                OPENAI API KEY
              </label>
              <input
                id="openAiApiKey"
                className="input"
                name="openAiApiKey"
                type="password"
                placeholder={user.openAiApiKey ? "******** (já configurada)" : "sk-..."}
                autoComplete="off"
                maxLength={300}
              />

              <label className="checkboxRow" htmlFor="clearApiKey">
                <input id="clearApiKey" type="checkbox" name="clearApiKey" />
                <span>Remover chave atual</span>
              </label>

              <p className="profileMeta">
                A chave é usada somente para integração OpenAI da sua conta. Se não houver chave, o sistema pode usar Ollama quando `OLLAMA_BASE_URL`
                estiver configurada no ambiente.
              </p>

              <div className="profileActions">
                <PreferencesOpenAiTestButton formId="preferences-llm-form" />
                <button className="button createPlanBtn" type="submit">
                  Salvar conta LLM
                </button>
              </div>
          </form>

          <form id="preferences-notify-form" className="profileForm preferencesPanel" action={saveNotificationPreferences}>
              <h2 className="profileSectionTitle">Notificações externas</h2>
              <p className="profileMeta">Receba o resumo diário de pendências no seu canal preferido.</p>
              <div className="profileChannelStatusRow">
                <span className={`profileChannelPill ${emailChannelConfigured ? "ok" : "warn"}`}>
                  E-mail: {emailChannelConfigured ? "configurado" : "faltando SMTP"}
                </span>
                <span className={`profileChannelPill ${telegramChannelConfigured ? "ok" : "warn"}`}>
                  Telegram: {telegramChannelConfigured ? "configurado" : "faltando token/chat id"}
                </span>
                <span className={`profileChannelPill ${discordChannelConfigured ? "ok" : "warn"}`}>
                  Discord: {discordChannelConfigured ? "configurado" : "faltando webhook"}
                </span>
              </div>

              <label className="checkboxRow" htmlFor="notifyEmailEnabled">
                <input id="notifyEmailEnabled" type="checkbox" name="notifyEmailEnabled" defaultChecked={Boolean(user.notifyEmailEnabled)} />
                <span>Enviar resumo por e-mail</span>
              </label>

              <label className="checkboxRow" htmlFor="notifyTelegramEnabled">
                <input
                  id="notifyTelegramEnabled"
                  type="checkbox"
                  name="notifyTelegramEnabled"
                  defaultChecked={Boolean(user.notifyTelegramEnabled)}
                />
                <span>Enviar resumo por Telegram</span>
              </label>

              <label className="fieldLabel" htmlFor="notifyTelegramBotToken">
                TOKEN BOT TELEGRAM
              </label>
              <input
                id="notifyTelegramBotToken"
                className="input"
                name="notifyTelegramBotToken"
                type="password"
                defaultValue={user.notifyTelegramBotToken ?? ""}
                placeholder="Ex.: 123456789:AA..."
                autoComplete="off"
                maxLength={300}
              />

              <label className="fieldLabel" htmlFor="notifyTelegramChatId">
                CHAT ID TELEGRAM
              </label>
              <input
                id="notifyTelegramChatId"
                className="input"
                name="notifyTelegramChatId"
                type="text"
                defaultValue={user.notifyTelegramChatId ?? ""}
                placeholder="Ex.: 123456789 ou -1001234567890"
                maxLength={100}
              />

              <label className="checkboxRow" htmlFor="notifyDiscordEnabled">
                <input id="notifyDiscordEnabled" type="checkbox" name="notifyDiscordEnabled" defaultChecked={Boolean(user.notifyDiscordEnabled)} />
                <span>Enviar resumo por Discord</span>
              </label>

              <label className="fieldLabel" htmlFor="notifyDiscordWebhookUrl">
                WEBHOOK DISCORD
              </label>
              <input
                id="notifyDiscordWebhookUrl"
                className="input"
                name="notifyDiscordWebhookUrl"
                type="url"
                defaultValue={user.notifyDiscordWebhookUrl ?? ""}
                placeholder="https://discord.com/api/webhooks/..."
                maxLength={500}
              />

              <p className="profileMeta">
                Envio externo: e-mail usa SMTP (`SMTP_*`), Telegram usa Token + Chat ID por usuário e Discord usa Webhook URL.
              </p>

              <PreferencesNotificationTestButtons formId="preferences-notify-form" />

              <div className="profileActions preferencesActions">
                <button className="button createPlanBtn" type="submit">
                  Salvar notificações
                </button>
              </div>
          </form>

          <PreferencesConcursosForm
            initialEnabled={Boolean(user.notifyConcursosEnabled)}
            initialRegions={user.notifyConcursosRegions}
            regions={Array.from(NOTIFY_CONCURSOS_REGIONS)}
          />
        </div>
      </section>
    </main>
  );
}

async function loadUserPreferences(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        openAiEmail: true,
        openAiApiKey: true,
        openAiModel: true,
        llmProvider: true,
        notifyEmailEnabled: true,
        notifyTelegramEnabled: true,
        notifyDiscordEnabled: true,
        notifyConcursosEnabled: true,
        notifyConcursosRegions: true,
        notifyTelegramBotToken: true,
        notifyTelegramChatId: true,
        notifyDiscordWebhookUrl: true
      }
    });
    if (!user) return null;
    return {
      ...user,
      notifyTelegramBotToken: user.notifyTelegramBotToken ? unsealSecret(user.notifyTelegramBotToken) : null,
      notifyTelegramChatId: user.notifyTelegramChatId ? unsealSecret(user.notifyTelegramChatId) : null,
      notifyDiscordWebhookUrl: user.notifyDiscordWebhookUrl ? unsealSecret(user.notifyDiscordWebhookUrl) : null
    };
  } catch (error) {
    if (!hasMissingLlmColumns(error)) throw error;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true
      }
    }).then((user) =>
      user
        ? {
            ...user,
            openAiEmail: null,
            openAiApiKey: null,
            openAiModel: null,
            llmProvider: null,
            notifyEmailEnabled: false,
            notifyTelegramEnabled: false,
            notifyDiscordEnabled: false,
            notifyConcursosEnabled: true,
            notifyConcursosRegions: ["ALL", "NACIONAL"],
            notifyTelegramBotToken: null,
            notifyTelegramChatId: null,
            notifyDiscordWebhookUrl: null
          }
        : null
    );
  }
}

function hasMissingLlmColumns(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("openAiApiKey") ||
    error.message.includes("openAiEmail") ||
    error.message.includes("openAiModel") ||
    error.message.includes("llmProvider") ||
    error.message.includes("notifyEmailEnabled") ||
    error.message.includes("notifyTelegramEnabled") ||
    error.message.includes("notifyDiscordEnabled") ||
    error.message.includes("notifyConcursosEnabled") ||
    error.message.includes("notifyConcursosRegions") ||
    error.message.includes("notifyConcursosNotifiedOpen") ||
    error.message.includes("notifyConcursosNotifiedLastDay") ||
    error.message.includes("notifyTelegramBotToken") ||
    error.message.includes("notifyTelegramChatId") ||
    error.message.includes("notifyDiscordWebhookUrl") ||
    error.message.includes("notifyDailySentAt") ||
    error.message.includes("Unknown argument")
  );
}

function isSecretsEncryptionKeyMissingError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("SECRETS_ENCRYPTION_KEY");
}

function normalizeLlmProvider(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "OPENAI") return "OPENAI";
  if (normalized === "OLLAMA") return "OLLAMA";
  return "AUTO";
}
