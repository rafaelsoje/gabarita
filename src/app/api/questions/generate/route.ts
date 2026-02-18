import { QuestionDifficulty } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { generateAndStoreQuestions } from "@/lib/questions/service";

type RequestBody = {
  planId?: string;
  subjectId?: string;
  topicId?: string;
  topicIds?: string[];
  amount?: number;
  difficulty?: string;
  banca?: string;
};

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
    const limitResponse = await enforceMutationRateLimit({
      request,
      userId,
      scope: "questions:generate"
    });
    if (limitResponse) return limitResponse;

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const planId = (body.planId ?? "").trim();
    const subjectId = (body.subjectId ?? "").trim();
    const topicId = (body.topicId ?? "").trim();
    const topicIds = Array.isArray(body.topicIds)
      ? body.topicIds
          .map((value) => String(value ?? "").trim())
          .filter((value) => value.length > 0)
      : undefined;
    const banca = (body.banca ?? "").trim();
    const amount = Math.min(30, Math.max(1, Number.parseInt(String(body.amount ?? 5), 10) || 5));
    const difficultyRaw = String(body.difficulty ?? "MEDIUM").toUpperCase();
    const difficulty: QuestionDifficulty = difficultyRaw === "EASY" || difficultyRaw === "HARD" ? difficultyRaw : "MEDIUM";

    if (!planId || !subjectId) {
      return NextResponse.json({ message: "Plano e disciplina são obrigatórios." }, { status: 400 });
    }

    const result = await generateAndStoreQuestions({
      userId,
      planId,
      subjectId,
      topicId: topicId || undefined,
      topicIds,
      amount,
      difficulty,
      bancaOverride: banca || undefined
    });

    return NextResponse.json({
      result: {
        usedLlm: result.usedLlm,
        llmError: result.llmError,
        llmModel: result.llmModel,
        created: result.createdIds.length
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível gerar questões.";
    const userMessage = buildQuestionsGenerationUserMessage(message);
    return NextResponse.json({ message: userMessage }, { status: 400 });
  }
}

function buildQuestionsGenerationUserMessage(message: string) {
  const raw = String(message ?? "").trim();
  if (!raw) return "Não foi possível gerar questões.";

  const styles = extractFailedStyles(raw);
  const base = raw
    .replace(/\s*diagnostics=.*$/i, "")
    .replace(/\s+[A-Z0-9_]+:\s*diagnostics=[^|]+/g, "")
    .trim();

  if (styles.length === 0) return base || "Não foi possível gerar questões.";

  const readable = styles.map((style) => styleToLabel(style)).join(", ");
  return `${base || "A resposta da LLM não atingiu o padrão mínimo de qualidade."} Estilos com falha: ${readable}.`;
}

function extractFailedStyles(message: string) {
  const pattern = /\b([A-Z0-9_]+):\s*diagnostics=/g;
  const styles: string[] = [];
  let match = pattern.exec(message);
  while (match) {
    styles.push(match[1]);
    match = pattern.exec(message);
  }
  return Array.from(new Set(styles));
}

function styleToLabel(style: string) {
  if (style === "MULTIPLE_CHOICE_5") return "Múltipla escolha (5)";
  if (style === "MULTIPLE_CHOICE_4") return "Múltipla escolha (4)";
  if (style === "MULTIPLE_CHOICE_EXCEPT_5") return "Múltipla escolha (EXCETO)";
  if (style === "TRUE_FALSE_2") return "Certo/Errado";
  if (style === "ORDERING_SEQUENCE_5") return "Ordenação/Sequência";
  if (style === "ASSOCIATION_COLUMNS_5") return "Associação de colunas";
  if (style === "ASSERTION_COMBINATION_5") return "Combinação I/II/III/IV";
  if (style === "ASSERTION_REASON_5") return "Asserção e razão";
  if (style === "MULTI_SELECT_COMBINATION_5") return "Múltiplas assertivas";
  if (style === "GAP_FILLING_COMBINATION_5") return "Lacunas";
  if (style === "CASE_STUDY_OBJECTIVE_5") return "Situação-problema";
  return style;
}
