import { env } from "@/lib/env";
import { unsealSecret } from "@/lib/security/secrets";

type LlmProvider = "OPENAI" | "OLLAMA";

type GenerateStructuredTextParams = {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  openAiApiKey?: string | null;
  openAiModel?: string | null;
  preferredProvider?: "AUTO" | "OPENAI" | "OLLAMA" | null;
};

type GenerateStructuredTextResult = {
  provider: LlmProvider;
  model: string;
  rawText: string;
};

type ResolvedProvider =
  | {
      provider: "OPENAI";
      model: string;
      apiKey: string;
      endpoint: string;
    }
  | {
      provider: "OLLAMA";
      model: string;
      endpoint: string;
    };

export async function generateStructuredText(params: GenerateStructuredTextParams): Promise<GenerateStructuredTextResult> {
  const resolved = resolveProvider({
    openAiApiKey: params.openAiApiKey,
    openAiModel: params.openAiModel,
    preferredProvider: params.preferredProvider
  });
  if (!resolved) {
    throw new Error("LLM não configurada. Configure OPENAI_API_KEY ou OLLAMA_BASE_URL.");
  }

  if (resolved.provider === "OPENAI") {
    const response = await fetch(resolved.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.apiKey}`
      },
      body: JSON.stringify({
        model: resolved.model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: params.systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: params.userPrompt }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: params.schemaName,
            strict: true,
            schema: params.schema
          }
        }
      })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = payload?.error?.message?.trim();
      throw new Error(message || `OpenAI request failed (${response.status})`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rawText = extractOpenAiResponseText(payload);
    if (!rawText) throw new Error("Resposta vazia da LLM.");

    return {
      provider: "OPENAI",
      model: resolved.model,
      rawText
    };
  }

  const schemaText = JSON.stringify(params.schema);
  const response = await fetch(resolved.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: resolved.model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: params.systemPrompt },
        {
          role: "user",
          content: [
            params.userPrompt,
            "Retorne apenas JSON válido no schema abaixo, sem markdown e sem texto adicional.",
            `Schema JSON: ${schemaText}`
          ].join("\n\n")
        }
      ]
    })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error?.trim() || `Ollama request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    message?: { content?: string };
    response?: string;
  };
  const rawText = String(payload.message?.content ?? payload.response ?? "").trim();
  if (!rawText) throw new Error("Resposta vazia da LLM.");

  return {
    provider: "OLLAMA",
    model: resolved.model,
    rawText
  };
}

function resolveProvider(params: {
  openAiApiKey?: string | null;
  openAiModel?: string | null;
  preferredProvider?: "AUTO" | "OPENAI" | "OLLAMA" | null;
}): ResolvedProvider | null {
  const preferredProvider = normalizePreferredProvider(params.preferredProvider ?? null);
  const userApiKey = unsealSecret(params.openAiApiKey);
  const globalApiKey = env.openAiApiKey.trim();
  const openAiApiKey = userApiKey || globalApiKey;
  const openAiModel = (params.openAiModel ?? "").trim() || env.openAiModel.trim() || "gpt-5-mini";
  const ollamaBase = env.ollamaBaseUrl.trim();

  if (preferredProvider === "OPENAI") {
    if (!openAiApiKey) return null;
    return {
      provider: "OPENAI",
      model: openAiModel,
      apiKey: openAiApiKey,
      endpoint: env.openAiResponsesUrl.trim() || "https://api.openai.com/v1/responses"
    };
  }
  if (preferredProvider === "OLLAMA") {
    if (!ollamaBase) return null;
    return {
      provider: "OLLAMA",
      model: env.ollamaModel.trim() || "llama3.1:8b",
      endpoint: `${ollamaBase.replace(/\/+$/, "")}/api/chat`
    };
  }

  if (openAiApiKey) {
    const endpoint = env.openAiResponsesUrl.trim() || "https://api.openai.com/v1/responses";
    return {
      provider: "OPENAI",
      model: openAiModel,
      apiKey: openAiApiKey,
      endpoint
    };
  }

  if (!ollamaBase) return null;
  const endpoint = `${ollamaBase.replace(/\/+$/, "")}/api/chat`;
  return {
    provider: "OLLAMA",
    model: env.ollamaModel.trim() || "llama3.1:8b",
    endpoint
  };
}

function normalizePreferredProvider(value: string | null | undefined): "AUTO" | "OPENAI" | "OLLAMA" {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "OPENAI") return "OPENAI";
  if (normalized === "OLLAMA") return "OLLAMA";
  return "AUTO";
}

function extractOpenAiResponseText(payload: Record<string, unknown>) {
  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim()) return direct;

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const maybeText = (part as { text?: unknown }).text;
      if (typeof maybeText === "string" && maybeText.trim()) chunks.push(maybeText);
    }
  }

  return chunks.join("\n").trim();
}
