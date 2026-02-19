import { ExamBoardStyle, Prisma, QuestionDifficulty, QuestionSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateQuestions } from "@/lib/questions/generator";
import { normalizeBancaName, parseBancaFromPlanNotes } from "@/lib/questions/plan-notes";

type GenerateAndStoreParams = {
  userId: string;
  subjectId: string;
  topicId?: string;
  topicIds?: string[];
  amount: number;
  difficulty: QuestionDifficulty;
  bancaOverride?: string;
};

export async function generateAndStoreQuestions(params: GenerateAndStoreParams) {
  const [subject, user] = await Promise.all([
    prisma.subject.findFirst({
      where: {
        id: params.subjectId,
        plan: { userId: params.userId, isArchived: false }
      },
      select: {
        id: true,
        name: true,
        planId: true,
        plan: {
          select: { notes: true }
        }
      }
    }),
    loadUserLlmPreferences(params.userId)
  ]);
  if (!subject) throw new Error("Disciplina inválida para o plano informado.");

  let topic: { id: string; title: string } | null = null;
  let topicScope: Array<{ id: string; title: string }> = [];
  if (params.topicId) {
    topic = await prisma.topic.findFirst({
      where: { id: params.topicId, subjectId: subject.id },
      select: { id: true, title: true }
    });
    if (!topic) throw new Error("Tópico inválido para a disciplina informada.");
    topicScope = [topic];
  } else {
    const requestedTopicIds = Array.from(
      new Set((params.topicIds ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))
    );
    topicScope = await prisma.topic.findMany({
      where: {
        subjectId: subject.id,
        ...(requestedTopicIds.length > 0 ? { id: { in: requestedTopicIds } } : {})
      },
      select: { id: true, title: true },
      orderBy: { title: "asc" }
    });

    if (requestedTopicIds.length > 0 && topicScope.length === 0) {
      throw new Error("Nenhum tópico válido foi encontrado para a disciplina informada.");
    }
  }

  const bancaFromPlan = parseBancaFromPlanNotes(subject.plan.notes);
  const bancaOverride = normalizeBancaName(params.bancaOverride);
  const banca = bancaOverride || bancaFromPlan;
  const boardProfile = await loadBoardProfile(params.userId, banca);
  const generatedResult = await generateQuestions({
    amount: params.amount,
    banca,
    subjectName: subject.name,
    topicTitle: topic?.title ?? (topicScope.length > 0 ? "Todos os tópicos da disciplina" : subject.name),
    topicTitles: topicScope.map((item) => item.title),
    topicScope: topic ? "single" : "all",
    difficulty: params.difficulty,
    boardStyle: boardProfile?.style ?? null,
    boardStyles: boardProfile?.styles ?? null,
    boardInstructions: boardProfile?.instructions ?? null,
    openAiApiKey: user?.openAiApiKey,
    openAiModel: user?.openAiModel,
    llmProvider: normalizeLlmProvider(user?.llmProvider)
  });
  const generated = generatedResult.questions;

  if (generated.length === 0) throw new Error("Não foi possível gerar questões no momento.");

  const createdIds = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    let supportsLlmModelColumn = true;
    let supportsWhyColumns = true;

    for (const [index, item] of generated.entries()) {
      const resolvedTopic = topic ?? resolveGeneratedTopic(item, topicScope);
      const resolvedTopicTitle = resolvedTopic?.title ?? "";
      const subjectLabel =
        normalizeLabel(item.subjectLabel, 160) || normalizeLabel(subject.name, 160) || null;
      const topicLabel =
        normalizeLabel(item.topicLabel, 160) ||
        normalizeLabel(resolvedTopicTitle, 160) ||
        normalizeLabel(subject.name, 160) ||
        null;
      const theme =
        normalizeLabel(item.theme, 120) ||
        inferTheme({
          subjectName: subject.name,
          topicTitle: resolvedTopicTitle,
          statement: item.statement
        });
      const keywords =
        normalizeKeywords(item.keywords) ||
        extractKeywords(`${subject.name} ${resolvedTopicTitle} ${item.statement}`);

      const baseData = {
        userId: params.userId,
        planId: subject.planId,
        subjectId: subject.id,
        topicId: resolvedTopic?.id,
        subjectLabel,
        topicLabel,
        theme,
        keywords,
        banca,
        statement: item.statement,
        explanation: item.explanation,
        difficulty: params.difficulty,
        sourceType: QuestionSourceType.GENERATED,
        options: {
          create: item.options.map((option, optionIndex) => ({
            label: option.label,
            text: option.text,
            isCorrect: option.isCorrect,
            optionComment: option.optionComment,
            position: optionIndex
          }))
        }
      };

      let question;
      try {
        question = await tx.question.create({
          data: {
            ...baseData,
            ...(supportsWhyColumns
              ? {
                  whyCorrect: normalizeLabel(item.whyCorrect, 1200) || null,
                  whyWrong: normalizeLabel(item.whyWrong, 1200) || null
                }
              : {}),
            ...(supportsLlmModelColumn ? { llmModel: generatedResult.usedLlm ? generatedResult.model : null } : {})
          },
          select: { id: true }
        });
      } catch (error) {
        if (supportsWhyColumns && hasMissingQuestionWhyColumns(error)) {
          supportsWhyColumns = false;
          supportsLlmModelColumn = false;
          question = await tx.question.create({
            data: baseData,
            select: { id: true }
          });
        } else if (supportsLlmModelColumn && hasMissingQuestionLlmModelColumn(error)) {
          supportsLlmModelColumn = false;
          question = await tx.question.create({
            data: baseData,
            select: { id: true }
          });
        } else {
          throw error;
        }
      }

      if (index >= 0) ids.push(question.id);
    }

    return ids;
  });

  return {
    createdIds,
    usedLlm: generatedResult.usedLlm,
    llmModel: generatedResult.model,
    llmError: generatedResult.llmError
  };
}

function resolveGeneratedTopic(
  question: {
    topicLabel?: string | null;
    theme?: string | null;
    statement?: string | null;
  },
  topicScope: Array<{ id: string; title: string }>
) {
  if (topicScope.length <= 1) return topicScope[0] ?? null;

  const candidates = [question.topicLabel, question.theme, question.statement]
    .map((value) => normalizeMatchText(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    const exact = topicScope.find((item) => normalizeMatchText(item.title) === candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const contained = topicScope.find((item) => {
      const normalizedTitle = normalizeMatchText(item.title);
      return normalizedTitle.length >= 4 && candidate.includes(normalizedTitle);
    });
    if (contained) return contained;
  }

  return null;
}

function normalizeMatchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLabel(value: string | null | undefined, maxLength: number) {
  const parsed = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!parsed) return "";
  return parsed.slice(0, maxLength);
}

function normalizeKeywords(values: string[] | null | undefined) {
  if (!Array.isArray(values)) return null;
  const normalized = values
    .map((value) =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((value) => value.length >= 2 && value.length <= 40);
  const unique = Array.from(new Set(normalized)).slice(0, 12);
  return unique.length > 0 ? unique : null;
}

function inferTheme(params: { subjectName: string; topicTitle: string; statement: string }) {
  const normalizedTopic = params.topicTitle.trim();
  if (normalizedTopic) return normalizedTopic.slice(0, 120);
  const normalizedSubject = params.subjectName.trim();
  if (normalizedSubject) return normalizedSubject.slice(0, 120);
  const firstChunk = params.statement.trim().split(/[,.!?:;-]/)[0] ?? "";
  const fallback = firstChunk.trim().slice(0, 120);
  return fallback || "Geral";
}

function extractKeywords(source: string) {
  const normalized = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const stopwords = new Set([
    "a",
    "o",
    "as",
    "os",
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "ou",
    "em",
    "no",
    "na",
    "nos",
    "nas",
    "um",
    "uma",
    "para",
    "por",
    "com",
    "sobre",
    "que",
    "se",
    "ao",
    "aos",
    "as",
    "nao",
    "mais",
    "menos",
    "como",
    "qual",
    "quais",
    "questao",
    "questoes",
    "alternativa",
    "alternativas",
    "contexto",
    "assinale",
    "correta",
    "incorreta"
  ]);

  const words = normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stopwords.has(word));

  const freq = new Map<string, number>();
  for (const word of words) freq.set(word, (freq.get(word) ?? 0) + 1);

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([word]) => word);
}

async function loadBoardProfile(
  userId: string,
  banca: string
): Promise<{ style: ExamBoardStyle; styles: ExamBoardStyle[]; instructions: string | null } | null> {
  if (!banca) return null;
  try {
    return await prisma.examBoardProfile.findFirst({
      where: {
        userId,
        normalizedName: banca
      },
      select: {
        style: true,
        styles: true,
        instructions: true
      }
    });
  } catch (error) {
    if (hasMissingBoardSchema(error)) return null;
    throw error;
  }
}

async function loadUserLlmPreferences(userId: string) {
  try {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { openAiApiKey: true, openAiModel: true, llmProvider: true }
    });
  } catch (error) {
    if (hasMissingLlmColumns(error)) {
      return { openAiApiKey: null, openAiModel: null, llmProvider: null };
    }
    throw error;
  }
}

function hasMissingLlmColumns(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("openAiApiKey") ||
    error.message.includes("openAiModel") ||
    error.message.includes("llmProvider") ||
    error.message.includes("Unknown argument")
  );
}

function normalizeLlmProvider(value: string | null | undefined): "AUTO" | "OPENAI" | "OLLAMA" {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "OPENAI") return "OPENAI";
  if (normalized === "OLLAMA") return "OLLAMA";
  return "AUTO";
}

function hasMissingQuestionLlmModelColumn(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("llmModel") || error.message.includes("Question.llmModel");
}

function hasMissingQuestionWhyColumns(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("whyCorrect") ||
    error.message.includes("whyWrong") ||
    error.message.includes("Question.whyCorrect") ||
    error.message.includes("Question.whyWrong")
  );
}

function hasMissingBoardSchema(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("ExamBoardProfile") ||
    error.message.includes("examBoardProfile") ||
    error.message.includes("ExamBoardStyle") ||
    error.message.includes("Unknown argument")
  );
}

type PracticeAnswerParams = {
  userId: string;
  questionId: string;
  selectedOptionId?: string | null;
};

export async function answerPracticeQuestion(params: PracticeAnswerParams) {
  let supportsWhyColumns = true;
  let question:
    | {
        id: string;
        whyCorrect: string | null;
        whyWrong: string | null;
        options: Array<{ id: string; label: string; isCorrect: boolean }>;
      }
    | null = null;

  try {
    question = await prisma.question.findFirst({
      where: { id: params.questionId },
      select: {
        id: true,
        whyCorrect: true,
        whyWrong: true,
        options: {
          select: {
            id: true,
            label: true,
            isCorrect: true
          },
          orderBy: { position: "asc" }
        }
      }
    });
  } catch (error) {
    if (!hasMissingQuestionWhyColumns(error)) throw error;
    supportsWhyColumns = false;
    question = await prisma.question.findFirst({
      where: { id: params.questionId },
      select: {
        id: true,
        options: {
          select: {
            id: true,
            label: true,
            isCorrect: true
          },
          orderBy: { position: "asc" }
        }
      }
    }).then((row) => (row ? { ...row, whyCorrect: null, whyWrong: null } : null));
  }

  if (!question) throw new Error("Questão não encontrada.");

  const selected = params.selectedOptionId
    ? question.options.find((option) => option.id === params.selectedOptionId)
    : null;

  if (params.selectedOptionId && !selected) {
    throw new Error("Alternativa inválida para a questão informada.");
  }

  const correct = question.options.find((option) => option.isCorrect) ?? null;
  const isCorrect = Boolean(selected?.isCorrect);

  await prisma.questionResponse.create({
    data: {
      userId: params.userId,
      questionId: question.id,
      selectedOptionId: selected?.id,
      isCorrect,
      context: "PRACTICE"
    }
  });

  return {
    isCorrect,
    correctLabel: correct?.label ?? "-",
    whyCorrect:
      question.whyCorrect ??
      (supportsWhyColumns
        ? "Sem justificativa específica do gabarito cadastrada."
        : "Justificativa detalhada disponível após aplicar a migração mais recente."),
    whyWrong:
      question.whyWrong ??
      (supportsWhyColumns
        ? "Sem orientação de erro comum cadastrada."
        : "Orientação de erro comum disponível após aplicar a migração mais recente."),
    selectedLabel: selected?.label ?? "Em branco"
  };
}

type QuantityRule = {
  id: string;
  amount: number;
};

type CreateMockExamParams = {
  userId: string;
  planId?: string;
  title?: string;
  durationMinutes?: number;
  bySubject: QuantityRule[];
  byTopic: QuantityRule[];
};

export async function createMockExamFromRules(params: CreateMockExamParams) {
  const normalizedSubjects = normalizeRules(params.bySubject);
  const normalizedTopics = normalizeRules(params.byTopic);

  if (normalizedSubjects.length === 0 && normalizedTopics.length === 0) {
    throw new Error("Informe ao menos uma disciplina ou tópico com quantidade maior que zero.");
  }

  if (params.planId) {
    const plan = await prisma.plan.findFirst({
      where: { id: params.planId, userId: params.userId, isArchived: false },
      select: { id: true }
    });
    if (!plan) throw new Error("Plano inválido.");
  }

  const usedQuestionIds = new Set<string>();
  const selectedQuestionIds: string[] = [];

  for (const rule of normalizedTopics) {
    const ids = await pickQuestionsByFilter({
      userId: params.userId,
      planId: params.planId,
      where: { topicId: rule.id },
      amount: rule.amount,
      usedQuestionIds
    });

    if (ids.length < rule.amount) {
      throw new Error("Não há questões suficientes para um dos tópicos selecionados.");
    }

    ids.forEach((id) => {
      usedQuestionIds.add(id);
      selectedQuestionIds.push(id);
    });
  }

  for (const rule of normalizedSubjects) {
    const ids = await pickQuestionsByFilter({
      userId: params.userId,
      planId: params.planId,
      where: { subjectId: rule.id },
      amount: rule.amount,
      usedQuestionIds
    });

    if (ids.length < rule.amount) {
      throw new Error("Não há questões suficientes para uma das disciplinas selecionadas.");
    }

    ids.forEach((id) => {
      usedQuestionIds.add(id);
      selectedQuestionIds.push(id);
    });
  }

  if (selectedQuestionIds.length === 0) {
    throw new Error("Nenhuma questão foi selecionada para o simulado.");
  }

  const hasManualDuration = Number.isFinite(params.durationMinutes) && (params.durationMinutes ?? 0) > 0;
  const plannedDurationMinutes = hasManualDuration
    ? Math.min(600, Math.max(1, Math.floor(params.durationMinutes ?? 0)))
    : estimateMockDurationMinutes(selectedQuestionIds.length);

  const mockExam = await prisma.mockExam.create({
    data: {
      userId: params.userId,
      planId: params.planId,
      title: (params.title ?? "").trim() || `Simulado ${new Date().toLocaleDateString("pt-BR")}`,
      durationMinutes: plannedDurationMinutes,
      items: {
        create: selectedQuestionIds.map((questionId, index) => ({
          questionId,
          position: index
        }))
      }
    },
    select: { id: true }
  });

  return mockExam.id;
}

type SubmitMockAttemptParams = {
  userId: string;
  mockExamId: string;
  answers: Record<string, string | undefined>;
  durationMinutes?: number;
};

export async function submitMockExamAttempt(params: SubmitMockAttemptParams) {
  const mockExam = await prisma.mockExam.findFirst({
    where: { id: params.mockExamId, userId: params.userId },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          question: {
            include: {
              options: {
                orderBy: { position: "asc" }
              }
            }
          }
        }
      }
    }
  });

  if (!mockExam) throw new Error("Simulado não encontrado.");
  if (mockExam.items.length === 0) throw new Error("Simulado sem questões.");

  const answersToSave: Prisma.QuestionResponseCreateManyInput[] = [];
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;

  for (const item of mockExam.items) {
    const pickedOptionId = params.answers[item.questionId] || undefined;
    const selected = pickedOptionId ? item.question.options.find((opt) => opt.id === pickedOptionId) : undefined;

    if (!selected) {
      blankCount += 1;
      answersToSave.push({
        userId: params.userId,
        questionId: item.questionId,
        selectedOptionId: null,
        isCorrect: false,
        context: "MOCK_EXAM"
      });
      continue;
    }

    if (selected.isCorrect) {
      correctCount += 1;
    } else {
      wrongCount += 1;
    }

    answersToSave.push({
      userId: params.userId,
      questionId: item.questionId,
      selectedOptionId: selected.id,
      isCorrect: selected.isCorrect,
      context: "MOCK_EXAM"
    });
  }

  const total = mockExam.items.length;
  const scorePct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const attemptId = await prisma.$transaction(async (tx) => {
    const attempt = await tx.mockExamAttempt.create({
      data: {
        mockExamId: mockExam.id,
        userId: params.userId,
        finishedAt: new Date(),
        correctCount,
        wrongCount,
        blankCount,
        scorePct
      },
      select: { id: true }
    });

    await tx.questionResponse.createMany({
      data: answersToSave.map((answer) => ({
        ...answer,
        mockExamAttemptId: attempt.id
      }))
    });

    await tx.studySession.create({
      data: {
        userId: params.userId,
        planId: mockExam.planId,
        category: "MOCK_EXAM",
        durationMinutes:
          Number.isFinite(params.durationMinutes) && (params.durationMinutes ?? 0) > 0
            ? Math.min(600, Math.max(1, Math.floor(params.durationMinutes ?? 0)))
            : 0,
        questionsCorrect: correctCount,
        questionsWrong: wrongCount,
        questionsBlank: blankCount,
        notes: `Simulado finalizado (${mockExam.title || "Simulado"}).`
      }
    });

    return attempt.id;
  });

  return {
    attemptId,
    correctCount,
    wrongCount,
    blankCount,
    scorePct,
    total,
    review: mockExam.items.map((item) => {
      const selectedOptionId = params.answers[item.questionId] || null;
      const correctOption = item.question.options.find((opt) => opt.isCorrect) ?? null;
      return {
        questionId: item.questionId,
        selectedOptionId,
        correctOptionId: correctOption?.id ?? null
      };
    })
  };
}

type PickFilterParams = {
  userId: string;
  planId?: string;
  where: Prisma.QuestionWhereInput;
  amount: number;
  usedQuestionIds: Set<string>;
};

async function pickQuestionsByFilter(params: PickFilterParams) {
  const candidates = await prisma.question.findMany({
    where: {
      userId: params.userId,
      ...(params.planId ? { planId: params.planId } : {}),
      ...params.where,
      id: { notIn: Array.from(params.usedQuestionIds) }
    },
    select: { id: true },
    take: Math.max(params.amount * 6, params.amount),
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });

  const shuffled = shuffle(candidates.map((item) => item.id));
  return shuffled.slice(0, params.amount);
}

function normalizeRules(items: QuantityRule[]) {
  const merged = new Map<string, number>();

  for (const item of items) {
    const id = (item.id || "").trim();
    const amount = Math.floor(Number(item.amount));
    if (!id || !Number.isFinite(amount) || amount < 1) continue;
    merged.set(id, (merged.get(id) ?? 0) + amount);
  }

  return Array.from(merged.entries()).map(([id, amount]) => ({ id, amount }));
}

function shuffle<T>(items: T[]) {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = cloned[index];
    cloned[index] = cloned[swap];
    cloned[swap] = current;
  }
  return cloned;
}

function estimateMockDurationMinutes(totalQuestions: number) {
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return null;
  const estimated = Math.ceil(totalQuestions * 2.75);
  return Math.min(600, Math.max(1, estimated));
}
