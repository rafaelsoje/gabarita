import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { env } from "@/lib/env";

export async function POST() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const baseUrl = env.ollamaBaseUrl.trim();
  if (!baseUrl) {
    return NextResponse.json({ ok: false, reason: "missing_ollama_base_url" }, { status: 400 });
  }

  const model = env.ollamaModel.trim() || "llama3.1:8b";
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/chat`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "user", content: "Responda apenas OK." }]
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { ok: false, reason: `http_${response.status}:${payload?.error ?? "request_failed"}`, model },
        { status: 400 }
      );
    }

    const payload = (await response.json().catch(() => null)) as { message?: { content?: string } } | null;
    const content = String(payload?.message?.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ ok: false, reason: "empty_response", model }, { status: 400 });
    }

    return NextResponse.json({ ok: true, reason: "", model });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    const message = error instanceof Error ? error.message : "network_or_provider_unreachable";
    const reason = [code, message].filter(Boolean).join(":").slice(0, 180);
    return NextResponse.json({ ok: false, reason, model }, { status: 400 });
  }
}
