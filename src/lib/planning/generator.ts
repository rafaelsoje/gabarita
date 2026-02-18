import { env } from "@/lib/env";
import { generateStructuredText } from "@/lib/llm/client";

export type PlanningDifficulty = "BAIXA" | "MEDIA" | "ALTA";

export type PlanningSubjectInput = {
  subjectId: string;
  subjectName: string;
  weight: number;
  difficulty: PlanningDifficulty;
  topics: Array<{ topicId: string; topicTitle: string }>;
};

export type PlanningGenerationInput = {
  startDate: Date;
  examDate: Date;
  weekdayMinutes: number;
  weekendMinutes: number;
  board: string;
  openAiApiKey?: string | null;
  openAiModel?: string | null;
  llmProvider?: "AUTO" | "OPENAI" | "OLLAMA" | null;
  subjects: PlanningSubjectInput[];
};

export type PlanningDayItem = {
  date: Date;
  weekdayLabel: string;
  subjectId: string | null;
  subjectName: string;
  topicId: string | null;
  topicTitle: string | null;
  plannedMinutes: number;
  questionsTarget: number;
  reviewsTarget: number;
  mockExamsTarget: number;
};

export type PlanningGenerationResult = {
  items: PlanningDayItem[];
  usedLlm: boolean;
  llmModel: string | null;
  llmError: string | null;
};

export async function generateStudyPlan(input: PlanningGenerationInput): Promise<PlanningGenerationResult> {
  const apiKey = (input.openAiApiKey ?? "").trim() || env.openAiApiKey;
  const model = (input.openAiModel ?? "").trim() || env.openAiModel;
  const selectedModel = apiKey ? model : env.ollamaModel.trim() || "llama3.1:8b";
  let llmError: string | null = null;

  try {
    const llmItems = await generateStudyPlanWithOpenAi({
      ...input,
      openAiApiKey: apiKey,
      openAiModel: model
    });
    if (llmItems.length > 0) {
      return {
        items: llmItems,
        usedLlm: true,
        llmModel: selectedModel,
        llmError: null
      };
    }
  } catch (error) {
    llmError = error instanceof Error ? error.message : "Falha desconhecida ao gerar planejamento com LLM.";
  }

  return {
    items: generateFallbackStudyPlan(input),
    usedLlm: false,
    llmModel: null,
    llmError
  };
}

async function generateStudyPlanWithOpenAi(
  input: PlanningGenerationInput & { openAiApiKey: string; openAiModel: string }
): Promise<PlanningDayItem[]> {
  const days = enumerateDates(input.startDate, input.examDate);
  const totalDays = days.length;
  const prompt = [
    "Crie um cronograma de estudos para concurso em português (pt-BR).",
    `Período: ${isoDate(input.startDate)} até ${isoDate(input.examDate)} (${totalDays} dia(s)).`,
    `Banca: ${input.board || "NÃO INFORMADA"}.`,
    `Disponibilidade: ${input.weekdayMinutes} min por dia útil e ${input.weekendMinutes} min por fim de semana.`,
    "Objetivo: distribuir estudo teórico/prática/revisão/simulados até a prova.",
    "Para cada dia, informe blocos de estudo com disciplina/tópico e metas de questões/revisões/simulados.",
    "Disciplinas selecionadas:",
    ...input.subjects.map(
      (subject) =>
        `- ${subject.subjectName} [subjectId=${subject.subjectId}] peso=${subject.weight} dificuldade=${subject.difficulty}; tópicos: ${
          subject.topics.map((topic) => `${topic.topicTitle} [topicId=${topic.topicId}]`).join("; ") || "sem tópicos"
        }`
    ),
    "Regras obrigatórias:",
    "1) Não ultrapassar minutos disponíveis por dia.",
    "2) Não usar IDs inexistentes.",
    "3) Cada bloco precisa de plannedMinutes > 0.",
    "4) Priorizar maior peso e maior dificuldade.",
    "5) Incluir revisões recorrentes e simulados próximos da prova.",
    "6) Responder estritamente em JSON no schema definido."
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      days: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            date: { type: "string", minLength: 10, maxLength: 10 },
            blocks: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  subjectId: { type: "string", minLength: 1 },
                  topicId: { type: ["string", "null"] },
                  plannedMinutes: { type: "integer", minimum: 1, maximum: 1440 },
                  questionsTarget: { type: "integer", minimum: 0, maximum: 500 },
                  reviewsTarget: { type: "integer", minimum: 0, maximum: 200 },
                  mockExamsTarget: { type: "integer", minimum: 0, maximum: 5 }
                },
                required: ["subjectId", "topicId", "plannedMinutes", "questionsTarget", "reviewsTarget", "mockExamsTarget"]
              }
            }
          },
          required: ["date", "blocks"]
        }
      }
    },
    required: ["days"]
  } as const;
  const llmResult = await generateStructuredText({
    systemPrompt: "Você é um planejador de estudos para concursos.",
    userPrompt: prompt,
    schemaName: "study_plan_payload",
    schema,
    openAiApiKey: input.openAiApiKey,
    openAiModel: input.openAiModel,
    preferredProvider: input.llmProvider ?? "AUTO"
  });

  const parsed = parsePlanningPayload(llmResult.rawText);
  return sanitizePlanningDays(parsed.days, input);
}

function parsePlanningPayload(raw: string): { days: Array<{ date: string; blocks: Array<Record<string, unknown>> }> } {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Invalid JSON payload from LLM.");
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { days?: unknown };
  if (!Array.isArray(parsed.days)) throw new Error("Invalid planning days payload.");
  return { days: parsed.days as Array<{ date: string; blocks: Array<Record<string, unknown>> }> };
}

function sanitizePlanningDays(
  days: Array<{ date: string; blocks: Array<Record<string, unknown>> }>,
  input: PlanningGenerationInput
): PlanningDayItem[] {
  const subjectById = new Map(input.subjects.map((subject) => [subject.subjectId, subject]));
  const allowedDays = new Set(enumerateDates(input.startDate, input.examDate).map((date) => isoDate(date)));
  const results: PlanningDayItem[] = [];

  for (const day of days) {
    if (!allowedDays.has(day.date)) continue;
    const parsedDate = parseIsoDate(day.date);
    if (!parsedDate) continue;
    const budget = getBudgetForDate(parsedDate, input.weekdayMinutes, input.weekendMinutes);
    if (budget <= 0) continue;

    let consumed = 0;
    let position = 0;

    for (const block of Array.isArray(day.blocks) ? day.blocks : []) {
      const subjectId = String(block.subjectId ?? "").trim();
      if (!subjectId) continue;
      const subject = subjectById.get(subjectId);
      if (!subject) continue;

      const topicIdRaw = typeof block.topicId === "string" ? block.topicId.trim() : "";
      const topic = topicIdRaw ? subject.topics.find((item) => item.topicId === topicIdRaw) ?? null : null;

      const plannedMinutesRaw = Number(block.plannedMinutes ?? 0);
      const plannedMinutes = Math.max(1, Math.min(600, Math.floor(plannedMinutesRaw)));
      if (!Number.isFinite(plannedMinutesRaw)) continue;
      if (consumed + plannedMinutes > budget) continue;

      consumed += plannedMinutes;
      results.push({
        date: parsedDate,
        weekdayLabel: weekdayLabelPtBr(parsedDate),
        subjectId,
        subjectName: subject.subjectName,
        topicId: topic?.topicId ?? null,
        topicTitle: topic?.topicTitle ?? null,
        plannedMinutes,
        questionsTarget: normalizeNonNegativeInt(block.questionsTarget, 0, 500),
        reviewsTarget: normalizeNonNegativeInt(block.reviewsTarget, 0, 200),
        mockExamsTarget: normalizeNonNegativeInt(block.mockExamsTarget, 0, 5) + (position === 0 && isNearExam(parsedDate, input.examDate) ? 0 : 0)
      });
      position += 1;
    }
  }

  return results;
}

function generateFallbackStudyPlan(input: PlanningGenerationInput): PlanningDayItem[] {
  const subjects = input.subjects.length > 0 ? input.subjects : [];
  const days = enumerateDates(input.startDate, input.examDate);
  if (subjects.length === 0 || days.length === 0) return [];

  const weights = subjects.map((subject) => {
    const diffWeight = subject.difficulty === "ALTA" ? 1.35 : subject.difficulty === "MEDIA" ? 1.1 : 0.9;
    return Math.max(1, subject.weight) * diffWeight;
  });
  const totalWeight = weights.reduce((acc, value) => acc + value, 0) || 1;
  const rotation: number[] = [];
  subjects.forEach((_, index) => {
    const slots = Math.max(1, Math.round((weights[index] / totalWeight) * 12));
    for (let i = 0; i < slots; i += 1) rotation.push(index);
  });

  const topicCursor = new Map<string, number>();
  const results: PlanningDayItem[] = [];
  let dayCursor = 0;

  for (const date of days) {
    const budget = getBudgetForDate(date, input.weekdayMinutes, input.weekendMinutes);
    if (budget <= 0) continue;

    const rotationIndex = rotation[dayCursor % rotation.length] ?? 0;
    const subject = subjects[rotationIndex];
    dayCursor += 1;

    const blocks = budget >= 180 ? 2 : 1;
    let remaining = budget;

    for (let blockIndex = 0; blockIndex < blocks; blockIndex += 1) {
      const share = blockIndex === blocks - 1 ? remaining : Math.max(30, Math.round(budget / blocks / 5) * 5);
      const plannedMinutes = Math.max(25, Math.min(remaining, share));
      remaining -= plannedMinutes;

      const topics = subject.topics;
      const cursor = topicCursor.get(subject.subjectId) ?? 0;
      const topic = topics.length > 0 ? topics[cursor % topics.length] : null;
      if (topics.length > 0) topicCursor.set(subject.subjectId, cursor + 1);

      const nearExam = isNearExam(date, input.examDate);
      results.push({
        date,
        weekdayLabel: weekdayLabelPtBr(date),
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        topicId: topic?.topicId ?? null,
        topicTitle: topic?.topicTitle ?? null,
        plannedMinutes,
        questionsTarget: Math.max(5, Math.round(plannedMinutes / 6)),
        reviewsTarget: nearExam ? Math.max(2, Math.round(plannedMinutes / 18)) : Math.max(1, Math.round(plannedMinutes / 24)),
        mockExamsTarget: nearExam && date.getDay() === 0 ? 1 : 0
      });
    }
  }

  return results;
}

function normalizeNonNegativeInt(value: unknown, min: number, max: number) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function getBudgetForDate(date: Date, weekdayMinutes: number, weekendMinutes: number) {
  const day = date.getDay();
  return day === 0 || day === 6 ? weekendMinutes : weekdayMinutes;
}

function isNearExam(date: Date, examDate: Date) {
  const diff = toMidnight(examDate).getTime() - toMidnight(date).getTime();
  return diff >= 0 && diff <= 14 * 86_400_000;
}

function enumerateDates(start: Date, end: Date) {
  const startDay = toMidnight(start);
  const endDay = toMidnight(end);
  if (endDay.getTime() < startDay.getTime()) return [];

  const dates: Date[] = [];
  const cursor = new Date(startDay);
  while (cursor.getTime() <= endDay.getTime()) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function weekdayLabelPtBr(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return toMidnight(date);
}

function toMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
