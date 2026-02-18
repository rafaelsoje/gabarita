import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { env } from "@/lib/env";
import { generateStructuredText } from "@/lib/llm/client";
import { prisma } from "@/lib/prisma";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { unsealSecret } from "@/lib/security/secrets";
import { saveDiscursiveSubmission } from "@/lib/storage/discursive-submissions";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 12_000;

type DiscursiveReviewPayload = {
  title: string;
  overallScore: number;
  summary: string;
  transcription: string;
  criteria: Array<{ name: string; score: number; feedback: string }>;
  strengths: string[];
  improvements: string[];
  correctedVersion: string;
  finalAdvice: string;
  model: string;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  if (!accessToken) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const tokenPayload = await verifyAccessToken(accessToken);
  if (!tokenPayload?.sub) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const limitResponse = await enforceMutationRateLimit({
    request,
    userId: tokenPayload.sub,
    scope: "discursive:review"
  });
  if (limitResponse) return limitResponse;

  const form = await request.formData();
  const rubricRaw = String(form.get("rubric") ?? "GENERICA").trim();
  const proposedTheme = String(form.get("proposedTheme") ?? "").trim();
  const essayTextRaw = String(form.get("essayText") ?? "").trim();
  const file = form.get("file");

  const rubric = normalizeRubric(rubricRaw);
  const essayText = essayTextRaw.slice(0, MAX_TEXT_CHARS);

  let userApiKey = "";
  let userModel = "";
  let userLlmProvider: "AUTO" | "OPENAI" | "OLLAMA" = "AUTO";
  try {
    const user = await prisma.user.findUnique({
      where: { id: tokenPayload.sub },
      select: {
        openAiApiKey: true,
        openAiModel: true,
        llmProvider: true
      }
    });
    userApiKey = unsealSecret(user?.openAiApiKey);
    userModel = user?.openAiModel?.trim() || "";
    userLlmProvider = normalizeLlmProvider(user?.llmProvider ?? "");
  } catch {
    // ignore and fallback to env
  }

  const apiKey = userApiKey || env.openAiApiKey.trim();
  const model = userModel || env.openAiModel.trim() || "gpt-5-mini";

  let contentFromFile = "";
  let imageDataUrl = "";
  let pdfDataUrl = "";
  let sourceType: "TEXT" | "IMAGE" | "PDF" = "TEXT";
  let sourceFileBuffer: Buffer | null = null;
  let sourceFileMimeType = "";
  let sourceFileOriginalName = "";

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Arquivo excede 8MB." }, { status: 400 });
    }

    sourceFileOriginalName = file.name || "redacao";
    sourceFileMimeType = file.type || "application/octet-stream";
    sourceFileBuffer = Buffer.from(await file.arrayBuffer());

    if (file.type === "text/plain") {
      contentFromFile = sourceFileBuffer.toString("utf8").slice(0, MAX_TEXT_CHARS).trim();
      sourceType = "TEXT";
    } else if (file.type.startsWith("image/") && essayText.length < 40) {
      imageDataUrl = `data:${file.type};base64,${sourceFileBuffer.toString("base64")}`;
      sourceType = "IMAGE";
    } else if (file.type === "application/pdf" && essayText.length < 40) {
      pdfDataUrl = `data:${file.type};base64,${sourceFileBuffer.toString("base64")}`;
      sourceType = "PDF";
    } else if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Formato não suportado. Use texto (.txt), PDF (.pdf) ou imagem (.jpg/.png/.webp)." },
        { status: 400 }
      );
    }
  }

  const finalEssayText = (essayText || contentFromFile).trim();
  if (finalEssayText.length < 40 && !imageDataUrl && !pdfDataUrl) {
    return NextResponse.json(
      { error: "Informe a redação em texto ou envie um arquivo legível (imagem/PDF)." },
      { status: 400 }
    );
  }

  const prompt = [
    "Você é um corretor especializado em redação para concursos no Brasil.",
    "Faça correção técnica, objetiva e didática.",
    `Rubrica de correção: ${rubric}.`,
    `Tema proposto (se informado): ${proposedTheme || "não informado"}.`,
    "Regras:",
    "1) Se a entrada for imagem ou PDF, primeiro transcreva/extraia o texto e use essa transcrição para corrigir.",
    "2) A nota geral vai de 0 a 100.",
    "3) Avalie coerência, coesão, gramática, argumentação e aderência ao tema.",
    "4) Traga feedback acionável (sem genérico).",
    "5) Produza uma versão sugerida da redação, mantendo a ideia central do aluno."
  ].join("\n");

  const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
  if (finalEssayText) {
    userContent.push({
      type: "input_text",
      text: `Texto da redação do aluno:\n${finalEssayText}`
    });
  }
  if (imageDataUrl) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl
    });
  }
  if (pdfDataUrl) {
    userContent.push({
      type: "input_file",
      filename: "redacao.pdf",
      file_data: pdfDataUrl
    });
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 6, maxLength: 80 },
      overallScore: { type: "integer", minimum: 0, maximum: 100 },
      summary: { type: "string", minLength: 40, maxLength: 500 },
      transcription: { type: "string", minLength: 40, maxLength: 12000 },
      criteria: {
        type: "array",
        minItems: 4,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 2, maxLength: 80 },
            score: { type: "integer", minimum: 0, maximum: 100 },
            feedback: { type: "string", minLength: 12, maxLength: 400 }
          },
          required: ["name", "score", "feedback"]
        }
      },
      strengths: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: { type: "string", minLength: 6, maxLength: 160 }
      },
      improvements: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: { type: "string", minLength: 6, maxLength: 200 }
      },
      correctedVersion: { type: "string", minLength: 80, maxLength: 8000 },
      finalAdvice: { type: "string", minLength: 20, maxLength: 1200 }
    },
    required: [
      "title",
      "overallScore",
      "summary",
      "transcription",
      "criteria",
      "strengths",
      "improvements",
      "correctedVersion",
      "finalAdvice"
    ]
  } as const;

  let rawText = "";
  let usedModel = model;

  if ((imageDataUrl || pdfDataUrl) && !apiKey) {
    return NextResponse.json(
      { error: "Para correção com imagem/PDF, configure OPENAI_API_KEY. Sem chave, a correção textual usa Ollama." },
      { status: 400 }
    );
  }

  if (imageDataUrl || pdfDataUrl) {
    const response = await fetch(env.openAiResponsesUrl.trim() || "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: "Você corrige redações com critério de banca." }]
          },
          {
            role: "user",
            content: userContent
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "discursive_review_payload",
            strict: true,
            schema
          }
        }
      })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      return NextResponse.json(
        { error: payload?.error?.message?.trim() || `Falha ao corrigir redação (${response.status}).` },
        { status: 400 }
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    rawText = extractResponseText(payload);
    if (!rawText) {
      return NextResponse.json({ error: "Resposta vazia da LLM." }, { status: 400 });
    }
  } else {
    try {
      const llmResult = await generateStructuredText({
        systemPrompt: "Você corrige redações com critério de banca.",
        userPrompt: `${prompt}\n\nTexto da redação do aluno:\n${finalEssayText}`,
        schemaName: "discursive_review_payload",
        schema,
        openAiApiKey: apiKey,
        openAiModel: model,
        preferredProvider: userLlmProvider || "AUTO"
      });
      rawText = llmResult.rawText;
      usedModel = llmResult.model;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Falha ao corrigir redação." },
        { status: 400 }
      );
    }
  }

  const parsed = parseReviewPayload(rawText);
  const result: DiscursiveReviewPayload = {
    ...parsed,
    model: usedModel
  };
  const saved = await saveDiscursiveSubmission({
    userId: tokenPayload.sub,
    rubric,
    proposedTheme,
    sourceType,
    title: result.title,
    overallScore: result.overallScore,
    originalText: finalEssayText,
    summary: result.summary,
    transcription: result.transcription,
    criteria: result.criteria,
    strengths: result.strengths,
    improvements: result.improvements,
    correctedVersion: result.correctedVersion,
    finalAdvice: result.finalAdvice,
    model: result.model,
    sourceFile:
      sourceFileBuffer && sourceFileOriginalName
        ? {
            originalName: sourceFileOriginalName,
            mimeType: sourceFileMimeType,
            bytes: sourceFileBuffer
          }
        : null
  });

  return NextResponse.json({
    ok: true,
    sourceType,
    result,
    submissionId: saved.id
  });
}

function normalizeRubric(value: string) {
  const normalized = value.trim().slice(0, 120);
  if (!normalized) return "GENERICA";
  return normalized;
}

function normalizeLlmProvider(value: string): "AUTO" | "OPENAI" | "OLLAMA" {
  const normalized = value.trim().toUpperCase();
  if (normalized === "OPENAI" || normalized === "OLLAMA") return normalized;
  return "AUTO";
}

function parseReviewPayload(raw: string): DiscursiveReviewPayload {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Payload JSON inválido.");
  }

  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Omit<DiscursiveReviewPayload, "model">;
  return {
    ...parsed,
    model: ""
  };
}

function extractResponseText(payload: Record<string, unknown>) {
  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim()) return direct;

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const rawContent = (item as { content?: unknown[] }).content;
    if (!Array.isArray(rawContent)) continue;
    for (const part of rawContent) {
      if (!part || typeof part !== "object") continue;
      const maybeText = (part as { text?: unknown }).text;
      if (typeof maybeText === "string" && maybeText.trim()) chunks.push(maybeText);
    }
  }

  return chunks.join("\n").trim();
}
