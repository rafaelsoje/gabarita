import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import {
  getAttachmentAccessBlockReason,
  shouldBlockAttachmentAccess
} from "@/lib/storage/attachment-scan";
import { deletePlanFile, readPlanFile } from "@/lib/storage/plan-files";

type Params = { params: Promise<{ fileId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const { fileId } = await params;
    const fileRecord = await prisma.planReferenceFile.findFirst({
      where: {
        id: fileId,
        plan: { userId, isArchived: false }
      },
      select: {
        id: true,
        fileName: true,
        originalName: true,
        mimeType: true,
        scanStatus: true
      }
    });

    if (!fileRecord) return notFound();
    if (shouldBlockAttachmentAccess(fileRecord.scanStatus)) {
      return NextResponse.json(
        { message: getAttachmentAccessBlockReason(fileRecord.scanStatus) },
        { status: 423 }
      );
    }

    const content = await readPlanFile(fileRecord.fileName);
    if (!content) return notFound("Arquivo não encontrado no armazenamento.");

    const url = new URL(request.url);
    const shouldDownload = url.searchParams.get("download") === "1";
    const safeName = sanitizeDownloadName(fileRecord.originalName);

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": fileRecord.mimeType || "application/octet-stream",
        "Content-Length": String(content.length),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${shouldDownload ? "attachment" : "inline"}; filename="${safeName}"`
      }
    });
  } catch {
    return serverError();
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();
    const limitResponse = await enforceMutationRateLimit({
      request,
      userId,
      scope: "plan-files:delete"
    });
    if (limitResponse) return limitResponse;

    const { fileId } = await params;
    const fileRecord = await prisma.planReferenceFile.findFirst({
      where: {
        id: fileId,
        plan: { userId, isArchived: false }
      },
      select: {
        id: true,
        fileName: true
      }
    });

    if (!fileRecord) return notFound();

    await prisma.planReferenceFile.delete({ where: { id: fileRecord.id } });
    await deletePlanFile(fileRecord.fileName);

    return NextResponse.json({ message: "Arquivo removido." });
  } catch {
    return serverError();
  }
}

function sanitizeDownloadName(fileName: string) {
  return fileName.replace(/[\r\n"]/g, "_").slice(0, 180) || "arquivo";
}
