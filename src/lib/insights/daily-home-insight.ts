import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { generateStructuredText } from "@/lib/llm/client";

const INSIGHT_CACHE_DIR = path.join(process.cwd(), "storage", "cache", "home-insights");

export type DailyHomeInsightInput = {
  userId: string;
  planScopeId: string | null;
  planScopeLabel: string;
  hasPlans: boolean;
  hasStudyPlan: boolean;
  userName: string;
  daysToExam: number | null;
  questionsAccuracy: number;
  mocksAccuracy: number;
  questionsSolved: number;
  questionsPlanned: number;
  questionsGoalPct: number;
  studyMinutesToday: number;
  plannedMinutesTotal: number;
  todayPlannedQuestions: number;
  todayPlannedReviews: number;
  todayPlannedMocks: number;
  currentStreak: number;
  consistencyRate: number;
  overdueReviewsCount: number;
  openAiApiKey?: string | null;
  openAiModel?: string | null;
  llmProvider?: "AUTO" | "OPENAI" | "OLLAMA" | string | null;
};

export type DailyHomeInsight = {
  title: string;
  message: string;
  source: "LLM" | "LOCAL";
  tone: "critical" | "warning" | "positive";
  generatedAtIso: string;
};

type CachedInsight = {
  dayKey: string;
  planScopeKey: string;
  llmConfigKey?: string;
  value: DailyHomeInsight;
};

export async function getDailyHomeInsight(input: DailyHomeInsightInput): Promise<DailyHomeInsight> {
  const dayKey = toDayKey(new Date());
  const planScopeKey = input.planScopeId?.trim() || "ALL";
  const llmProvider = normalizeLlmProvider(input.llmProvider);
  const llmConfigKey = `v8|${llmProvider}|${(input.openAiModel ?? "").trim() || env.openAiModel.trim() || "gpt-5-mini"}`;
  const cachePath = buildCachePath(input.userId, dayKey, planScopeKey);
  const cached = await readCache(cachePath);
  if (cached && cached.dayKey === dayKey && cached.planScopeKey === planScopeKey && cached.llmConfigKey === llmConfigKey) {
    return {
      ...cached.value,
      message: normalizeInsightMessage(cached.value.message),
      tone: cached.value.tone ?? resolveInsightTone(input)
    };
  }

  if (!input.hasPlans) {
    const insight = buildNoPlanInsight(input.userName);
    await writeCache(cachePath, {
      dayKey,
      planScopeKey,
      llmConfigKey,
      value: insight
    });
    return insight;
  }

  if (!input.hasStudyPlan) {
    const insight = buildNoStudyPlanInsight(input.userName, input.planScopeLabel);
    await writeCache(cachePath, {
      dayKey,
      planScopeKey,
      llmConfigKey,
      value: insight
    });
    return insight;
  }

  const apiKey = (input.openAiApiKey ?? "").trim() || env.openAiApiKey.trim();
  const model = (input.openAiModel ?? "").trim() || env.openAiModel.trim() || "gpt-5-mini";
  let insight: DailyHomeInsight;

  try {
    insight = await generateInsightWithLlm(input, { apiKey, model });
  } catch {
    insight = buildLocalFallback(input);
  }

  await writeCache(cachePath, {
    dayKey,
    planScopeKey,
    llmConfigKey,
    value: insight
  });

  return insight;
}

function toDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildCachePath(userId: string, dayKey: string, planScopeKey: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeScope = planScopeKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(INSIGHT_CACHE_DIR, safeUserId, `${dayKey}-${safeScope}.json`);
}

async function readCache(cachePath: string): Promise<CachedInsight | null> {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as CachedInsight;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.dayKey !== "string") return null;
    if (typeof parsed.planScopeKey !== "string") return null;
    if (!parsed.value || typeof parsed.value !== "object") return null;
    if (typeof parsed.value.title !== "string") return null;
    if (typeof parsed.value.message !== "string") return null;
    if (parsed.value.source !== "LLM" && parsed.value.source !== "LOCAL") return null;
    if (typeof parsed.value.generatedAtIso !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, payload: CachedInsight) {
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(payload), "utf8");
  } catch {
    return;
  }
}

async function generateInsightWithLlm(
  input: DailyHomeInsightInput,
  params: { apiKey: string; model: string }
): Promise<DailyHomeInsight> {
  const tone = resolveInsightTone(input);
  const coachingTone = resolveCoachingTone(input);
  const firstName = input.userName.trim().split(/\s+/)[0] || "Aluno";
  const prompt = [
    "Você é um coach de estudos para concurso público.",
    "Responda em português do Brasil com tom direto e acionável.",
    "Mensagem em no máximo 2 frases completas.",
    "Não use abreviações truncadas (ex.: 'imedi.').",
    "Não repita no texto os indicadores já exibidos nos cards da tela (percentuais, dias, minutos e contagens).",
    "Em vez de repetir números, entregue interpretação do cenário e direção estratégica.",
    "Formato obrigatório: diagnóstico qualitativo + ação prática do dia em texto corrido e leitura fluida.",
    "Não use rótulos como 'prioridade 1, 2, 3'.",
    "A ordem deve ser implícita: foco principal, complemento e fechamento do dia.",
    "Evite ecoar os mesmos dados de entrada literalmente.",
    `Primeiro nome do aluno: ${firstName}.`,
    "Use apenas o primeiro nome no texto. Nunca use sobrenome.",
    `Tom desejado: ${coachingTone}.`,
    `Escopo do plano: ${input.planScopeLabel}.`,
    `Dias para a prova: ${input.daysToExam ?? "sem prova definida"}.`,
    `Meta de questões: ${input.questionsGoalPct}% (${input.questionsSolved}/${input.questionsPlanned || 0}).`,
    `Desempenho em questões: ${input.questionsAccuracy}%.`,
    `Desempenho em simulados: ${input.mocksAccuracy}%.`,
    `Estudo hoje: ${input.studyMinutesToday} minuto(s).`,
    `Meta total de tempo do ciclo: ${input.plannedMinutesTotal} minuto(s).`,
    `Planejado para hoje: Q ${input.todayPlannedQuestions}, R ${input.todayPlannedReviews}, S ${input.todayPlannedMocks}.`,
    `Sequência atual: ${input.currentStreak} dia(s). Constância: ${input.consistencyRate}%.`,
    `Revisões atrasadas: ${input.overdueReviewsCount}.`,
    "Use o nome do aluno no texto.",
    "Gere um diagnóstico curto e um próximo passo objetivo para hoje."
  ].join("\n");

  const llmResult = await generateStructuredText({
    systemPrompt: "Você entrega diagnósticos curtos de rotina de estudos.",
    userPrompt: prompt,
    schemaName: "daily_home_insight",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 8, maxLength: 64 },
        message: { type: "string", minLength: 30, maxLength: 420 }
      },
      required: ["title", "message"]
    },
    openAiApiKey: params.apiKey,
    openAiModel: params.model,
    preferredProvider: normalizeLlmProvider(input.llmProvider)
  });

  const parsed = parseInsightPayload(llmResult.rawText);
  return {
    title: parsed.title.trim(),
    message: normalizeInsightMessage(parsed.message),
    source: "LLM",
    tone,
    generatedAtIso: new Date().toISOString()
  };
}

function parseInsightPayload(raw: string): { title: string; message: string } {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Payload inválido.");
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { title?: unknown; message?: unknown };
  if (typeof parsed.title !== "string" || typeof parsed.message !== "string") {
    throw new Error("Campos obrigatórios ausentes.");
  }
  return { title: parsed.title, message: parsed.message };
}

function buildLocalFallback(input: DailyHomeInsightInput): DailyHomeInsight {
  const tone = resolveInsightTone(input);
  const firstName = input.userName.trim().split(/\s+/)[0] || "Aluno";
  const progressByTime = input.plannedMinutesTotal > 0 ? Math.round((input.studyMinutesToday / input.plannedMinutesTotal) * 100) : 0;
  const criticalRisk = (input.daysToExam !== null && input.daysToExam <= 15 && input.questionsAccuracy < 70) || input.overdueReviewsCount > 5;
  const lowConsistency = input.consistencyRate < 40 || input.currentStreak <= 1;

  if (criticalRisk) {
    return {
      title: "Ajuste urgente hoje",
      message:
        `${firstName}, você está em zona de risco para a prova. Priorize revisão dos tópicos fracos e finalize ao menos 1 bloco completo de questões hoje.`,
      source: "LOCAL",
      tone,
      generatedAtIso: new Date().toISOString()
    };
  }

  if (lowConsistency) {
    return {
      title: "Recupere ritmo em 1 dia",
      message:
        `${firstName}, foque em constância: conclua o primeiro bloco do cronograma de hoje e registre a revisão prevista. Sequência diária vai destravar seu avanço.`,
      source: "LOCAL",
      tone,
      generatedAtIso: new Date().toISOString()
    };
  }

  return {
    title: "Boa tração de estudo",
    message: `${firstName}, seu progresso está estável (${Math.max(0, progressByTime)}% da meta de tempo). Próximo passo: manter o plano de hoje com foco em questões e revisões programadas.`,
    source: "LOCAL",
    tone,
    generatedAtIso: new Date().toISOString()
  };
}

function buildNoPlanInsight(userName: string): DailyHomeInsight {
  const firstName = userName.trim().split(/\s+/)[0] || "Aluno";
  return {
    title: "Boas-vindas ao seu estudo",
    message: `${firstName}, seja bem-vindo. Crie seu primeiro plano para eu gerar análises diárias e direcionar suas próximas ações.`,
    source: "LOCAL",
    tone: "positive",
    generatedAtIso: new Date().toISOString()
  };
}

function buildNoStudyPlanInsight(userName: string, planScopeLabel: string): DailyHomeInsight {
  const firstName = userName.trim().split(/\s+/)[0] || "Aluno";
  const planLabel = planScopeLabel.trim() || "este plano";
  return {
    title: "Gere seu cronograma",
    message: `${firstName}, ainda não há cronograma em ${planLabel}. Gere o planejamento para eu começar as análises e recomendações do dia.`,
    source: "LOCAL",
    tone: "warning",
    generatedAtIso: new Date().toISOString()
  };
}

function resolveInsightTone(input: DailyHomeInsightInput): DailyHomeInsight["tone"] {
  const atRiskByExam = input.daysToExam !== null && input.daysToExam <= 15 && input.questionsAccuracy < 70;
  const atRiskByBacklog = input.overdueReviewsCount >= 5;
  if (atRiskByExam || atRiskByBacklog) return "critical";
  if (input.consistencyRate < 40 || input.currentStreak <= 1) return "warning";
  return "positive";
}

function resolveCoachingTone(input: DailyHomeInsightInput) {
  const tone = resolveInsightTone(input);
  if (tone === "critical") return "firme, com cobrança objetiva";
  if (tone === "warning") return "motivacional com foco em retomada de rotina";
  return "positivo e orientado a manutenção de desempenho";
}

function normalizeLlmProvider(value: string | null | undefined): "AUTO" | "OPENAI" | "OLLAMA" {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "OPENAI") return "OPENAI";
  if (normalized === "OLLAMA") return "OLLAMA";
  return "AUTO";
}

function normalizeInsightMessage(value: string) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Siga o plano do dia e finalize um bloco completo agora.";
  return text;
}
