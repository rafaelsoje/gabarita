import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { submitMockExamAttempt } from "@/lib/questions/service";

type RequestBody = {
  mockExamId?: string;
  answers?: Record<string, string>;
  durationMinutes?: number;
};

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ message: "Não autenticado." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const mockExamId = (body.mockExamId ?? "").trim();
    if (!mockExamId) return NextResponse.json({ message: "Simulado inválido." }, { status: 400 });

    const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
    const durationMinutesRaw = Number(body.durationMinutes ?? 0);
    const durationMinutes = Number.isFinite(durationMinutesRaw) && durationMinutesRaw > 0 ? Math.floor(durationMinutesRaw) : 0;

    const result = await submitMockExamAttempt({
      userId,
      mockExamId,
      answers,
      durationMinutes
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao finalizar simulado.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

