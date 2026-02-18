import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { env } from "@/lib/env";
import { generateStructuredText } from "@/lib/llm/client";
import { prisma } from "@/lib/prisma";
import { getDiscursiveSubmission } from "@/lib/storage/discursive-submissions";

type Params = { params: Promise<{ submissionId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
  }

  const { submissionId } = await params;
  const submission = await getDiscursiveSubmission(userId, submissionId);
  if (!submission) {
    return NextResponse.json({ message: "Redação não encontrada." }, { status: 404 });
  }

  const userPrefs = await loadUserLlmPreferences(userId);
  const apiKey = userPrefs.openAiApiKey || env.openAiApiKey.trim();
  const model = userPrefs.openAiModel || env.openAiModel.trim() || "gpt-5-mini";

  try {
    const prompt = [
      "Você é mentor de prova discursiva para concursos.",
      "Crie um plano de treino curto para a próxima redação com ações práticas.",
      `Banca/rubrica: ${submission.rubric}.`,
      `Tema da redação corrigida: ${submission.proposedTheme || "não informado"}.`,
      `Nota atual: ${submission.overallScore}/100.`,
      `Pontos fortes: ${submission.strengths.join(" | ") || "não informado"}.`,
      `Melhorias prioritárias: ${submission.improvements.join(" | ") || "não informado"}.`,
      "Retorne 5 a 7 ações curtas, em português, específicas para treino de 7 dias."
    ].join("\n");

    const llmResult = await generateStructuredText({
      systemPrompt: "Você gera planos de treino acionáveis para redação.",
      userPrompt: prompt,
      schemaName: "discursive_training_plan",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          plan: {
            type: "array",
            minItems: 5,
            maxItems: 7,
            items: { type: "string", minLength: 8, maxLength: 220 }
          }
        },
        required: ["plan"]
      },
      openAiApiKey: apiKey,
      openAiModel: model,
      preferredProvider: normalizeLlmProvider(userPrefs.llmProvider)
    });
    const plan = parsePlan(llmResult.rawText);
    if (plan.length === 0) {
      return NextResponse.json({ plan: buildLocalTrainingPlan(submission), source: "LOCAL" });
    }
    return NextResponse.json({ plan, source: "LLM", model: llmResult.model });
  } catch {
    return NextResponse.json({ plan: buildLocalTrainingPlan(submission), source: "LOCAL" });
  }
}

function buildLocalTrainingPlan(submission: Awaited<ReturnType<typeof getDiscursiveSubmission>>) {
  const improvements = submission?.improvements ?? [];
  const base = [
    "Reescreva a introdução em 8-10 linhas com tese direta e sem períodos longos.",
    "Faça 1 exercício diário de conectivos: adição, contraste, causa e conclusão.",
    "Revise pontuação e concordância em 10 frases retiradas da própria redação.",
    "Inclua 2 exemplos concretos (dados, casos ou cenário real) no desenvolvimento.",
    "Treine conclusão com proposta objetiva e fechamento em até 6 linhas."
  ];
  const mapped = improvements.slice(0, 2).map((item) => `Aplicar na próxima redação: ${item}`);
  return [...mapped, ...base].slice(0, 7);
}

function parsePlan(raw: string) {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { plan?: unknown };
    if (!Array.isArray(parsed.plan)) return [];
    return parsed.plan
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 7);
  } catch {
    return [];
  }
}

async function loadUserLlmPreferences(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { openAiApiKey: true, openAiModel: true, llmProvider: true }
    });
    return {
      openAiApiKey: user?.openAiApiKey?.trim() || "",
      openAiModel: user?.openAiModel?.trim() || "",
      llmProvider: user?.llmProvider?.trim() || ""
    };
  } catch {
    return {
      openAiApiKey: "",
      openAiModel: "",
      llmProvider: ""
    };
  }
}

function normalizeLlmProvider(value: string): "AUTO" | "OPENAI" | "OLLAMA" {
  const normalized = value.trim().toUpperCase();
  if (normalized === "OPENAI") return "OPENAI";
  if (normalized === "OLLAMA") return "OLLAMA";
  return "AUTO";
}
