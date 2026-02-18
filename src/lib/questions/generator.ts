import { ExamBoardStyle, QuestionDifficulty } from "@prisma/client";
import { env } from "@/lib/env";
import { generateStructuredText } from "@/lib/llm/client";

type GenerateQuestionsParams = {
  amount: number;
  banca: string;
  subjectName: string;
  topicTitle: string;
  topicTitles?: string[];
  topicScope?: "single" | "all";
  difficulty: QuestionDifficulty;
  boardStyle?: ExamBoardStyle | null;
  boardStyles?: ExamBoardStyle[] | null;
  boardInstructions?: string | null;
  openAiApiKey?: string | null;
  openAiModel?: string | null;
  llmProvider?: "AUTO" | "OPENAI" | "OLLAMA" | null;
};

export type GeneratedQuestion = {
  statement: string;
  explanation: string;
  whyCorrect: string;
  whyWrong: string;
  subjectLabel: string;
  topicLabel: string;
  theme: string;
  keywords: string[];
  options: Array<{
    label: string;
    text: string;
    isCorrect: boolean;
    optionComment: string;
  }>;
};

export type GenerateQuestionsResult = {
  questions: GeneratedQuestion[];
  usedLlm: boolean;
  model: string | null;
  llmError: string | null;
};

type SanitizeDiagnostics = {
  total: number;
  accepted: number;
  rejected: number;
  reasons: Record<string, number>;
};

type SanitizedResult = {
  questions: GeneratedQuestion[];
  diagnostics: SanitizeDiagnostics;
  llmModel: string;
};

export async function generateQuestions(params: GenerateQuestionsParams): Promise<GenerateQuestionsResult> {
  const safeAmount = Math.max(1, Math.min(30, Math.floor(params.amount)));
  const apiKey = (params.openAiApiKey ?? "").trim() || env.openAiApiKey;
  const model = (params.openAiModel ?? "").trim() || env.openAiModel;
  const activeStyles = resolveActiveStyles(params.boardStyles, params.boardStyle ?? null);
  const shuffledStyles = shuffleStyles(activeStyles);

  let lastError: string | null = null;
  const maxAttempts = Math.max(2, Math.min(12, activeStyles.length * 2));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const styleBuckets =
        safeAmount === 1 && shuffledStyles.length > 1
          ? [{ style: shuffledStyles[(attempt - 1) % shuffledStyles.length], amount: 1 }]
          : splitAmountByStyles(safeAmount, activeStyles);
      const multiStyle = styleBuckets.length > 1;

      if (multiStyle || (safeAmount === 1 && activeStyles.length > 1)) {
        const merged: GeneratedQuestion[] = [];
        const diagnosticsByStyle: string[] = [];
        let lastModel: string | null = null;
        for (const bucket of styleBuckets) {
          const remoteByStyle = await generateQuestionsWithOpenAI({
            ...params,
            amount: bucket.amount,
            boardStyle: bucket.style,
            boardStyles: [bucket.style],
            openAiApiKey: apiKey,
            openAiModel: model,
            strictRationale: attempt > 1,
            strictStyle: attempt > 1
          });
          merged.push(...remoteByStyle.questions);
          lastModel = remoteByStyle.llmModel;
          diagnosticsByStyle.push(`${bucket.style}: ${formatDiagnostics(remoteByStyle.diagnostics)}`);
        }

        if (merged.length >= safeAmount) {
          return {
            questions: merged.slice(0, safeAmount),
            usedLlm: true,
            model: lastModel,
            llmError: null
          };
        }

        const diagnosticsSummary = diagnosticsByStyle.join(" | ");
        lastError = `A resposta da LLM não atingiu o padrão mínimo de qualidade nos estilos testados. ${diagnosticsSummary}`;
        console.warn("[questions.generate] Rejeição por validação (multi-style)", {
          attempt,
          banca: params.banca,
          subjectName: params.subjectName,
          diagnosticsByStyle
        });
      } else {
        const remote = await generateQuestionsWithOpenAI({
          ...params,
          amount: safeAmount,
          openAiApiKey: apiKey,
          openAiModel: model,
          strictRationale: attempt > 1,
          strictStyle: attempt > 1
        });
        if (remote.questions.length > 0) {
          return {
            questions: remote.questions.slice(0, safeAmount),
            usedLlm: true,
            model: remote.llmModel,
            llmError: null
          };
        }
        const diagnosticsSummary = formatDiagnostics(remote.diagnostics);
        lastError = `A resposta da LLM não atingiu o padrão mínimo de qualidade. ${diagnosticsSummary}`;
        console.warn("[questions.generate] Rejeição por validação", {
          attempt,
          banca: params.banca,
          subjectName: params.subjectName,
          diagnostics: remote.diagnostics
        });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Falha desconhecida ao chamar LLM.";
    }
  }

  throw new Error(lastError || "Falha ao gerar questões via LLM.");
}

async function generateQuestionsWithOpenAI(
  params: GenerateQuestionsParams & { strictRationale?: boolean; strictStyle?: boolean }
): Promise<SanitizedResult> {
  const rules = mergedStyleRules(params.boardStyles, params.boardStyle ?? null);
  const activeStyle = resolveActiveStyles(params.boardStyles, params.boardStyle ?? null)[0] ?? null;
  const topicTitles = (params.topicTitles ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 80);
  const topicScope = params.topicScope ?? (topicTitles.length > 1 ? "all" : "single");
  const topicsLine = topicScope === "all"
    ? topicTitles.length > 0
      ? `Tópicos permitidos da disciplina: ${topicTitles.join(" | ")}.`
      : "Tópicos permitidos da disciplina: não informados."
    : `Tópico: ${params.topicTitle}.`;
  const prompt = [
    `Gere ${params.amount} questões objetivas inéditas em português para concurso público.`,
    `Banca: ${params.banca || "NÃO INFORMADA"}.`,
    `Disciplina: ${params.subjectName}.`,
    topicsLine,
    `Nível: ${difficultyLabel(params.difficulty)}.`,
    `Estilo da banca: ${rules.label}.`,
    topicScope === "all"
      ? "Quando for solicitado todos os tópicos, distribua as questões apenas entre os tópicos permitidos e nunca saia desse escopo."
      : "Mantenha foco estrito no tópico informado.",
    rules.prompt,
    params.boardInstructions ? `Instruções adicionais da banca cadastradas no sistema: ${params.boardInstructions}` : "",
    "Regras:",
    `1) Cada questão deve ter exatamente ${rules.optionsCount} alternativa(s).`,
    "2) Exatamente 1 alternativa correta.",
    "3) Traga explicação geral da resposta correta.",
    "4) Inclua whyCorrect (por que o gabarito está correto) e whyWrong (erro mais comum que leva ao equívoco).",
    "4.1) O campo whyCorrect deve ser completo e estruturado no formato:",
    "Resposta correta: ...",
    "Análise detalhada: ...",
    "Fundamento técnico: ...",
    "Pegadinha comum: ...",
    "4.2) Em questões de assertivas (I/II/III/IV), a análise deve abordar item por item explicitamente.",
    params.strictRationale
      ? "4.3) MODO ESTRITO: whyCorrect deve ter no mínimo 320 caracteres, com fundamentação comparativa clara."
      : "4.3) whyCorrect deve ter no mínimo 220 caracteres com justificativa objetiva.",
    params.strictStyle
      ? `4.4) MODO ESTRITO DE ESTILO: ${strictStyleInstruction(activeStyle)}`
      : "",
    "5) Traga comentário curto para cada alternativa.",
    "6) Não repetir enunciados.",
    "7) Para cada questão, inclua subjectLabel, topicLabel, theme e keywords (3-12 palavras-chave).",
    "8) Saída estritamente em JSON conforme schema."
  ]
    .filter(Boolean)
    .join("\n");

  const minOptions = rules.optionsCount;
  const maxOptions = rules.optionsCount;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            statement: { type: "string", minLength: 12 },
            explanation: { type: "string", minLength: 8 },
            whyCorrect: { type: "string", minLength: 8 },
            whyWrong: { type: "string", minLength: 8 },
            subjectLabel: { type: "string", minLength: 2, maxLength: 160 },
            topicLabel: { type: "string", minLength: 2, maxLength: 160 },
            theme: { type: "string", minLength: 2, maxLength: 120 },
            keywords: {
              type: "array",
              minItems: 3,
              maxItems: 12,
              items: { type: "string", minLength: 2, maxLength: 40 }
            },
            options: {
              type: "array",
              minItems: minOptions,
              maxItems: maxOptions,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string", minLength: 1, maxLength: 10 },
                  text: { type: "string", minLength: 2 },
                  isCorrect: { type: "boolean" },
                  optionComment: { type: "string", minLength: 2 }
                },
                required: ["label", "text", "isCorrect", "optionComment"]
              }
            }
          },
          required: ["statement", "explanation", "whyCorrect", "whyWrong", "subjectLabel", "topicLabel", "theme", "keywords", "options"]
        }
      }
    },
    required: ["questions"]
  } as const;
  const llmResult = await generateStructuredText({
    systemPrompt: "Você é um gerador de questões de concurso com foco em precisão técnica.",
    userPrompt: prompt,
    schemaName: "question_payload",
    schema,
    openAiApiKey: params.openAiApiKey,
    openAiModel: params.openAiModel,
    preferredProvider: params.llmProvider ?? "AUTO"
  });

  const parsed = parseQuestionPayload(llmResult.rawText);
  const expectedStyle = resolveActiveStyles(params.boardStyles, params.boardStyle ?? null)[0] ?? null;
  const sanitized = sanitizeGeneratedQuestions(parsed.questions, rules.optionsCount, expectedStyle);
  return { ...sanitized, llmModel: llmResult.model };
}

function parseQuestionPayload(raw: string): { questions: GeneratedQuestion[] } {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Invalid JSON");
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { questions?: unknown };
  if (!Array.isArray(parsed.questions)) throw new Error("Invalid questions array");
  return { questions: parsed.questions as GeneratedQuestion[] };
}

function formatDiagnostics(diagnostics: SanitizeDiagnostics) {
  if (diagnostics.total === 0) return "diagnostics=sem_itens";
  const topReasons = Object.entries(diagnostics.reasons)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([reason, count]) => `${reason}:${count}`)
    .join(",");
  return `diagnostics=total:${diagnostics.total};accepted:${diagnostics.accepted};rejected:${diagnostics.rejected};reasons:[${topReasons || "none"}]`;
}

function sanitizeGeneratedQuestions(
  items: GeneratedQuestion[],
  expectedOptionsCount: number,
  expectedStyle: ExamBoardStyle | null
) {
  const sanitized: GeneratedQuestion[] = [];
  const diagnostics: SanitizeDiagnostics = {
    total: Array.isArray(items) ? items.length : 0,
    accepted: 0,
    rejected: 0,
    reasons: {}
  };
  const reject = (reason: string) => {
    diagnostics.rejected += 1;
    diagnostics.reasons[reason] = (diagnostics.reasons[reason] ?? 0) + 1;
  };

  for (const item of items) {
    if (!item || typeof item !== "object") {
      reject("invalid_item_object");
      continue;
    }
    if (typeof item.statement !== "string" || item.statement.trim().length < 12) {
      reject("invalid_statement");
      continue;
    }
    if (typeof item.explanation !== "string" || item.explanation.trim().length < 8) {
      reject("invalid_explanation");
      continue;
    }
    if (typeof item.whyCorrect !== "string" || item.whyCorrect.trim().length < 8) {
      reject("invalid_why_correct");
      continue;
    }
    if (typeof item.whyWrong !== "string" || item.whyWrong.trim().length < 8) {
      reject("invalid_why_wrong");
      continue;
    }
    if (!Array.isArray(item.options) || item.options.length !== expectedOptionsCount) {
      reject("invalid_options_count");
      continue;
    }

    const normalized = item.options.map((option, index) => ({
      label: normalizeOptionLabel(option?.label, index),
      text: String(option?.text ?? "").trim(),
      isCorrect: Boolean(option?.isCorrect),
      optionComment: String(option?.optionComment ?? "").trim() || "Sem comentário."
    }));

    if (normalized.length !== expectedOptionsCount) {
      reject("invalid_options_count");
      continue;
    }
    if (normalized.filter((opt) => opt.isCorrect).length !== 1) {
      reject("invalid_correct_options_count");
      continue;
    }
    if (normalized.some((opt) => opt.text.length < 2)) {
      reject("invalid_option_text");
      continue;
    }
    if (expectedStyle && !matchesExpectedStyle(expectedStyle, item.statement, normalized.map((opt) => opt.text))) {
      reject("invalid_style");
      continue;
    }
    const subjectLabel = normalizeClassificationText(item.subjectLabel, 160);
    const topicLabel = normalizeClassificationText(item.topicLabel, 160);
    const theme = normalizeClassificationText(item.theme, 120);
    const correctOption = normalized.find((opt) => opt.isCorrect);
    const whyCorrect = ensureRationaleQuality({
      whyCorrect: item.whyCorrect,
      explanation: item.explanation,
      statement: item.statement,
      correctLabel: correctOption?.label ?? null
    });
    if (!whyCorrect) {
      reject("invalid_why_correct_quality");
      continue;
    }
    const keywords = normalizeKeywords(item.keywords);
    if (!subjectLabel || !topicLabel || !theme) {
      reject("invalid_labels");
      continue;
    }
    if (keywords.length < 1) {
      reject("invalid_keywords");
      continue;
    }

    sanitized.push({
      statement: item.statement.trim(),
      explanation: item.explanation.trim(),
      whyCorrect,
      whyWrong: item.whyWrong.trim(),
      subjectLabel,
      topicLabel,
      theme,
      keywords,
      options: normalized
    });
    diagnostics.accepted += 1;
  }

  return { questions: sanitized, diagnostics };
}

function matchesExpectedStyle(style: ExamBoardStyle, statement: string, optionTexts: string[]) {
  const normalizedStatement = normalizeForMatch(statement);
  const isCombination = looksLikeCombinationQuestion(statement, optionTexts);

  if (style === "MULTIPLE_CHOICE_EXCEPT_5") {
    return /exceto|incorret|errad[ao]/.test(normalizedStatement);
  }

  if (style === "CASE_STUDY_OBJECTIVE_5") {
    return /caso|situacao|cenario|contexto|hipotese|problema|pratic[ao]/.test(normalizedStatement) && !isCombination;
  }

  if (style === "ASSERTION_COMBINATION_5" || style === "MULTI_SELECT_COMBINATION_5") {
    return isCombination;
  }

  if (style === "MULTIPLE_CHOICE_5" || style === "MULTIPLE_CHOICE_4") {
    return !isCombination;
  }

  return true;
}

function looksLikeCombinationQuestion(statement: string, optionTexts: string[]) {
  const hasRomanInStatement = hasStructuredAssertions(statement);
  const optionsJoined = normalizeForMatch(optionTexts.join(" "));
  const hasCombinationOptions =
    /\bi\b|\bii\b|\biii\b|\biv\b/.test(optionsJoined) &&
    /(apenas|todas|nenhuma|corret|incorret|combinacao|e|ou|,)/.test(optionsJoined);
  return hasRomanInStatement || hasCombinationOptions;
}

function strictStyleInstruction(style: ExamBoardStyle | null) {
  if (style === "MULTIPLE_CHOICE_EXCEPT_5") {
    return "o enunciado DEVE conter explicitamente 'EXCETO', 'INCORRETA' ou 'ERRADA'.";
  }
  if (style === "CASE_STUDY_OBJECTIVE_5") {
    return "o enunciado DEVE começar com um mini-caso contextualizado (situação/cenário prático) antes de pedir a resposta.";
  }
  if (style === "ASSERTION_COMBINATION_5" || style === "MULTI_SELECT_COMBINATION_5") {
    return "o enunciado DEVE ter assertivas I, II, III e IV e as alternativas devem representar combinações dessas assertivas.";
  }
  if (style === "TRUE_FALSE_2") {
    return "gerar exatamente 2 alternativas objetivas equivalentes a Certo e Errado.";
  }
  if (style === "MULTIPLE_CHOICE_4") {
    return "gerar exatamente 4 alternativas (A, B, C, D).";
  }
  return "seguir estritamente o formato e os marcadores do estilo solicitado.";
}

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasHighQualityRationale(whyCorrect: string, statement: string) {
  const normalized = whyCorrect.trim();
  if (normalized.length < 160) return false;

  const sectionHits = [
    /resposta correta\s*:/i,
    /an[aá]lise detalhada\s*:/i,
    /fundamento tecnico\s*:/i,
    /fundamento t[eé]cnico\s*:/i,
    /pegadinha comum\s*:/i
  ].filter((pattern) => pattern.test(normalized)).length;
  if (sectionHits < 2) return false;

  if (!hasStructuredAssertions(statement)) return true;

  const mentionCount = ["I", "II", "III", "IV"].filter((item) =>
    new RegExp(`\\b${item}\\b`, "i").test(normalized)
  ).length;
  return mentionCount >= 1 || /item por item|assertiva/i.test(normalized);
}

function ensureRationaleQuality(input: {
  whyCorrect: string;
  explanation: string;
  statement: string;
  correctLabel: string | null;
}) {
  const normalized = String(input.whyCorrect ?? "").trim();
  if (hasHighQualityRationale(normalized, input.statement)) return normalized;

  const explanation = String(input.explanation ?? "").trim().replace(/\s+/g, " ");
  const fallback = buildFallbackRationale({
    explanation,
    statement: input.statement,
    correctLabel: input.correctLabel
  });

  return hasHighQualityRationale(fallback, input.statement) ? fallback : null;
}

function buildFallbackRationale(input: { explanation: string; statement: string; correctLabel: string | null }) {
  const correctLabel = (input.correctLabel ?? "").trim();
  const correctText = correctLabel
    ? `a alternativa ${correctLabel} é a única compatível com o comando do enunciado e com os limites técnicos do tema.`
    : "a alternativa marcada como gabarito é a única compatível com o comando do enunciado e com os limites técnicos do tema.";
  const detailedText =
    input.explanation.length >= 24
      ? input.explanation
      : "A comparação entre as alternativas mostra que apenas o gabarito preserva a definição correta sem extrapolar o escopo cobrado.";
  const structuredAssertionNote = hasStructuredAssertions(input.statement)
    ? "Como a questão usa assertivas, a validação deve ser item por item (I, II, III e IV), sem inferências além do que cada item afirma."
    : "A análise considera o enunciado literal e elimina alternativas com extrapolação, ambiguidade ou troca de conceito.";

  return [
    `Resposta correta: ${correctText}`,
    `Análise detalhada: ${detailedText} ${structuredAssertionNote}`,
    "Fundamento técnico: a alternativa correta mantém coerência conceitual, terminologia adequada e aderência ao padrão de cobrança da banca.",
    "Pegadinha comum: escolher alternativa plausível por semelhança superficial, sem conferir precisão técnica e alcance da afirmação."
  ].join(" ");
}

function hasStructuredAssertions(statement: string) {
  const markerRegex = /\b([IVXLCDM]{1,6})\s*(?:[.)]|[-–—:])\s+/g;
  return Array.from(statement.matchAll(markerRegex)).length >= 2;
}

function resolveActiveStyles(styles: ExamBoardStyle[] | null | undefined, fallbackStyle: ExamBoardStyle | null) {
  const defaultStyle: ExamBoardStyle = "MULTIPLE_CHOICE_5";
  const unique = Array.from(
    new Set(
      (styles ?? [])
        .map((item) => item)
        .filter((item): item is ExamBoardStyle => Boolean(item))
        .concat(fallbackStyle ? [fallbackStyle] : [])
    )
  );
  return unique.length > 0 ? unique : [fallbackStyle ?? defaultStyle];
}

function splitAmountByStyles(total: number, styles: ExamBoardStyle[]) {
  const defaultStyle: ExamBoardStyle = "MULTIPLE_CHOICE_5";
  const normalizedTotal = Math.max(1, Math.floor(total));
  const normalizedStyles = styles.length > 0 ? styles : [defaultStyle];
  const counts = new Map<ExamBoardStyle, number>();
  let distributed = 0;

  while (distributed < normalizedTotal) {
    const remaining = normalizedTotal - distributed;
    const cycle = shuffleStyles(normalizedStyles).slice(0, Math.min(remaining, normalizedStyles.length));
    for (const style of cycle) {
      counts.set(style, (counts.get(style) ?? 0) + 1);
      distributed += 1;
    }
  }

  return Array.from(counts.entries()).map(([style, amount]) => ({ style, amount }));
}

function shuffleStyles(styles: ExamBoardStyle[]) {
  const arr = [...styles];
  for (let index = arr.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    const current = arr[index];
    arr[index] = arr[target];
    arr[target] = current;
  }
  return arr;
}

function normalizeClassificationText(value: unknown, maxLength: number) {
  const parsed = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!parsed) return "";
  return parsed.slice(0, maxLength);
}

function normalizeKeywords(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
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
  return Array.from(new Set(normalized)).slice(0, 12);
}

function normalizeOptionLabel(value: unknown, index: number) {
  const parsed = String(value ?? "").trim();
  if (parsed) return parsed.slice(0, 10);
  return String.fromCharCode(65 + index);
}

function styleRules(style: ExamBoardStyle | null) {
  if (style === "MULTIPLE_CHOICE_EXCEPT_5") {
    return {
      label: "Múltipla escolha (EXCETO)",
      optionsCount: 5,
      labels: ["A", "B", "C", "D", "E"],
      prompt:
        "Formato de múltipla escolha com comando EXCETO/INCORRETA: o enunciado deve pedir explicitamente a alternativa incorreta."
    };
  }
  if (style === "TRUE_FALSE_2") {
    return {
      label: "Certo/Errado",
      optionsCount: 2,
      labels: ["A", "B"],
      prompt: "Formato CEBRASPE: enunciado assertivo e 2 alternativas, equivalentes a Certo e Errado."
    };
  }
  if (style === "MULTIPLE_CHOICE_4") {
    return {
      label: "Múltipla escolha A-D",
      optionsCount: 4,
      labels: ["A", "B", "C", "D"],
      prompt: "Formato de múltipla escolha com exatamente 4 alternativas (A, B, C, D)."
    };
  }
  if (style === "ORDERING_SEQUENCE_5") {
    return {
      label: "Ordenação / sequência lógica",
      optionsCount: 5,
      labels: ["A", "B", "C", "D", "E"],
      prompt:
        "Formato com itens/etapas para ordenação lógica, cronológica ou procedimental; alternativas devem representar sequências possíveis."
    };
  }
  if (style === "ASSOCIATION_COLUMNS_5") {
    return {
      label: "Associação de colunas",
      optionsCount: 5,
      labels: ["A", "B", "C", "D", "E"],
      prompt:
        "Formato de associação de colunas (coluna I e II), com alternativas representando combinações de correspondência."
    };
  }
  if (style === "ASSERTION_COMBINATION_5") {
    return {
      label: "Combinação I/II/III/IV",
      optionsCount: 5,
      labels: ["A", "B", "C", "D", "E"],
      prompt:
        "Formato com afirmações I, II, III e IV no enunciado e alternativas de combinação (ex.: I e II apenas)."
    };
  }
  if (style === "ASSERTION_REASON_5") {
    return {
      label: "Asserção e razão",
      optionsCount: 5,
      labels: ["A", "B", "C", "D", "E"],
      prompt:
        "Formato de asserção e razão: duas assertivas (A e R) e alternativas avaliando veracidade e relação causal entre elas."
    };
  }
  if (style === "MULTI_SELECT_COMBINATION_5") {
    return {
      label: "Múltipla escolha (mais de uma assertiva correta)",
      optionsCount: 5,
      labels: ["A", "B", "C", "D", "E"],
      prompt:
        "Formato com várias assertivas no enunciado; alternativas devem listar conjuntos de assertivas, e apenas uma alternativa deve conter exatamente o conjunto correto."
    };
  }
  if (style === "GAP_FILLING_COMBINATION_5") {
    return {
      label: "Lacunas (completar sentença)",
      optionsCount: 5,
      labels: ["A", "B", "C", "D", "E"],
      prompt:
        "Formato com uma ou mais lacunas no enunciado; alternativas devem trazer combinações de termos para completar corretamente."
    };
  }
  if (style === "CASE_STUDY_OBJECTIVE_5") {
    return {
      label: "Situação-problema / caso prático",
      optionsCount: 5,
      labels: ["A", "B", "C", "D", "E"],
      prompt:
        "Formato de caso prático com contexto aplicado e decisão técnica; alternativas objetivas e plausíveis, com uma correta."
    };
  }
  return {
    label: "Múltipla escolha A-E",
    optionsCount: 5,
    labels: ["A", "B", "C", "D", "E"],
    prompt: "Formato tradicional de múltipla escolha com alternativas A a E."
  };
}

function mergedStyleRules(styles: ExamBoardStyle[] | null | undefined, fallbackStyle: ExamBoardStyle | null) {
  const normalized = Array.from(
    new Set(
      (styles ?? []).filter((item): item is ExamBoardStyle => Boolean(item)).concat(fallbackStyle ? [fallbackStyle] : [])
    )
  );

  const active = normalized.length > 0 ? normalized : [fallbackStyle ?? "MULTIPLE_CHOICE_5"];
  const mapped = active.map((item) => styleRules(item));

  const optionsCount = mapped.some((item) => item.optionsCount === 5)
    ? 5
    : mapped.some((item) => item.optionsCount === 4)
    ? 4
    : 2;

  const labels = optionsCount === 5 ? ["A", "B", "C", "D", "E"] : optionsCount === 4 ? ["A", "B", "C", "D"] : ["A", "B"];
  const label = mapped.map((item) => item.label).join(" + ");
  const prompt = [
    `Estilos selecionados para esta banca: ${label}.`,
    ...mapped.map((item) => `- ${item.prompt}`),
    `Use exatamente ${optionsCount} alternativas por questão (${labels.join(", ")}).`
  ].join("\n");

  return {
    label,
    optionsCount,
    labels,
    prompt
  };
}

function difficultyLabel(value: QuestionDifficulty) {
  if (value === "EASY") return "Fácil";
  if (value === "HARD") return "Difícil";
  return "Médio";
}
