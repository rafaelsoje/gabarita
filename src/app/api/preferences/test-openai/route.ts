import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { unsealSecret } from "@/lib/security/secrets";

type TestBody = {
  apiKey?: string;
  model?: string;
};

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as TestBody;
  const typedApiKey = String(body.apiKey ?? "").trim();
  const typedModel = String(body.model ?? "").trim();

  let saved: { openAiApiKey: string | null; openAiModel: string | null } | null = null;
  try {
    saved = await prisma.user.findUnique({
      where: { id: userId },
      select: { openAiApiKey: true, openAiModel: true }
    });
  } catch {
    // no-op: fallback to typed values
  }

  const apiKey = typedApiKey || unsealSecret(saved?.openAiApiKey) || "";
  const model = typedModel || saved?.openAiModel || "gpt-5-mini";
  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: "missing_api_key" }, { status: 400 });
  }

  const test = await testOpenAiModelConnection({ apiKey, model });
  if (!test.ok) {
    return NextResponse.json({ ok: false, reason: test.reason, model }, { status: 400 });
  }

  return NextResponse.json({ ok: true, reason: "", model });
}

async function testOpenAiModelConnection(params: { apiKey: string; model: string }) {
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(params.model)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
      const code = (payload?.error?.code ?? "unknown_error").toString().trim();
      return { ok: false as const, reason: `http_${response.status}:${code}` };
    }

    return { ok: true as const, reason: "" };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    const message = error instanceof Error ? error.message : "";
    const reason = [code, message].filter(Boolean).join(":") || "network_or_provider_unreachable";
    return { ok: false as const, reason: reason.slice(0, 180) };
  }
}
