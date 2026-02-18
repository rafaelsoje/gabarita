import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { answerPracticeQuestion } from "@/lib/questions/service";

type RequestBody = {
  questionId?: string;
  selectedOptionId?: string;
};

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const questionId = (body.questionId ?? "").trim();
    const selectedOptionId = (body.selectedOptionId ?? "").trim();

    if (!questionId) {
      return NextResponse.json({ message: "Questão inválida." }, { status: 400 });
    }

    const result = await answerPracticeQuestion({
      userId,
      questionId,
      selectedOptionId: selectedOptionId || undefined
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível responder a questão.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

