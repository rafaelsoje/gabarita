import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { getExamResult, readExamResultSourceFile } from "@/lib/storage/exam-results";

type Params = { params: Promise<{ examResultId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
  }

  const { examResultId } = await params;
  const examResult = await getExamResult(userId, examResultId);
  if (!examResult) {
    return NextResponse.json({ message: "Resultado não encontrado." }, { status: 404 });
  }

  if (!examResult.sourceFile?.fileName) {
    return NextResponse.json({ message: "Arquivo da prova não está disponível." }, { status: 404 });
  }

  const fileBytes = await readExamResultSourceFile(userId, examResult.sourceFile.fileName);
  if (!fileBytes) {
    return NextResponse.json({ message: "Arquivo da prova não encontrado." }, { status: 404 });
  }

  return new NextResponse(fileBytes, {
    status: 200,
    headers: {
      "Content-Type": examResult.sourceFile.mimeType || "application/pdf",
      "Content-Length": String(fileBytes.length),
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${sanitizeDownloadName(examResult.sourceFile.originalName)}"`
    }
  });
}

function sanitizeDownloadName(fileName: string) {
  return fileName.replace(/[\r\n"]/g, "_").slice(0, 180) || "prova.pdf";
}
