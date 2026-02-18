import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import {
  deleteDiscursiveSubmission,
  getDiscursiveSubmission
} from "@/lib/storage/discursive-submissions";

type Params = { params: Promise<{ submissionId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
  }

  const { submissionId } = await params;
  const item = await getDiscursiveSubmission(userId, submissionId);
  if (!item) {
    return NextResponse.json({ message: "Redação não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, { params }: Params) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
  }

  const { submissionId } = await params;
  const deleted = await deleteDiscursiveSubmission(userId, submissionId);
  if (!deleted) {
    return NextResponse.json({ message: "Redação não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ message: "Redação removida." });
}
