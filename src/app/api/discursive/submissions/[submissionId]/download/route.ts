import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import {
  getDiscursiveSubmission,
  readDiscursiveSubmissionSourceFile
} from "@/lib/storage/discursive-submissions";

type Params = { params: Promise<{ submissionId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
  }

  const { submissionId } = await params;
  const submission = await getDiscursiveSubmission(userId, submissionId);
  if (!submission) {
    return NextResponse.json({ message: "Redação não encontrada." }, { status: 404 });
  }

  if (submission.sourceFile) {
    const fileBytes = await readDiscursiveSubmissionSourceFile(userId, submission.sourceFile.fileName);
    if (fileBytes) {
      return new NextResponse(fileBytes, {
        status: 200,
        headers: {
          "Content-Type": submission.sourceFile.mimeType || "application/octet-stream",
          "Content-Length": String(fileBytes.length),
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${sanitizeDownloadName(submission.sourceFile.originalName)}"`
        }
      });
    }
  }

  const fallbackText = [
    `Título: ${submission.title}`,
    `Nota: ${submission.overallScore}/100`,
    `Rubrica: ${submission.rubric}`,
    "",
    "Transcrição:",
    submission.transcription,
    "",
    "Versão sugerida:",
    submission.correctedVersion
  ].join("\n");
  const bytes = Buffer.from(fallbackText, "utf8");

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="redacao-${submission.id}.txt"`
    }
  });
}

function sanitizeDownloadName(fileName: string) {
  return fileName.replace(/[\r\n"]/g, "_").slice(0, 180) || "arquivo";
}
