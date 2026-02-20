import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";
import { isFormDataFileLike } from "@/lib/http/form-data-file";
import { buildInitialAttachmentScanData } from "@/lib/storage/attachment-scan";
import { deletePlanFiles, planFileContentUrl, writePlanFile } from "@/lib/storage/plan-files";

type Params = { params: Promise<{ planId: string }> };

const ALLOWED_EXTENSIONS = new Set([
  "txt",
  "csv",
  "pdf",
  "doc",
  "docx",
  "odt",
  "ods",
  "odp",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "pps",
  "ppsx",
  "ptt"
]);

const ALLOWED_MIMES = new Set([
  "text/plain",
  "text/csv",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
  "application/octet-stream"
]);

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;

function getExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return fileName.slice(dotIndex + 1).toLowerCase();
}

function sanitizeOriginalName(fileName: string) {
  const trimmed = fileName.trim();
  if (!trimmed) return "arquivo";
  return trimmed.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);
}

async function ensurePlanOwnership(planId: string, userId: string) {
  return prisma.plan.findFirst({
    where: { id: planId, userId, isArchived: false },
    select: { id: true }
  });
}

export async function GET(_: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const { planId } = await params;
    const plan = await ensurePlanOwnership(planId, userId);
    if (!plan) return notFound();

    const files = await prisma.planReferenceFile.findMany({
      where: { planId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        planId: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      files: files.map((file) => ({
        ...file,
        fileUrl: planFileContentUrl(file.id)
      }))
    });
  } catch {
    return serverError();
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();
    const limitResponse = await enforceMutationRateLimit({
      request,
      userId,
      scope: "plan-files:upload"
    });
    if (limitResponse) return limitResponse;

    const { planId } = await params;
    const plan = await ensurePlanOwnership(planId, userId);
    if (!plan) return notFound();

    const formData = await request.formData();
    const rawFiles = formData.getAll("files");
    const files = rawFiles.filter((entry): entry is File => isFormDataFileLike(entry) && entry.size > 0);

    if (files.length === 0) return badRequest("Nenhum arquivo enviado.");
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return badRequest(`Envie no máximo ${MAX_FILES_PER_UPLOAD} arquivos por vez.`);
    }

    for (const file of files) {
      const ext = getExtension(file.name);
      if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
        return badRequest(`Tipo de arquivo não permitido: ${file.name}`);
      }
      if (!ALLOWED_MIMES.has(file.type || "application/octet-stream")) {
        return badRequest(`MIME não permitido: ${file.name}`);
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return badRequest(`Arquivo maior que 20MB: ${file.name}`);
      }
    }

    const toCreate: Array<{
      planId: string;
      originalName: string;
      fileName: string;
      fileUrl: string;
      mimeType: string;
      sizeBytes: number;
      scanStatus: "PENDING" | "SCANNING" | "CLEAN" | "INFECTED" | "ERROR";
      scannedAt: Date | null;
      scanResult: string | null;
    }> = [];
    const writtenFileNames: string[] = [];

    for (const file of files) {
      const ext = getExtension(file.name);
      const safeOriginalName = sanitizeOriginalName(file.name);
      const fileName = `${planId}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writePlanFile(fileName, buffer);
      writtenFileNames.push(fileName);

      toCreate.push({
        planId,
        originalName: safeOriginalName,
        fileName,
        fileUrl: `/protected/plan-files/${fileName}`,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        ...buildInitialAttachmentScanData()
      });
    }

    try {
      const created = await prisma.$transaction(
        toCreate.map((item) =>
          prisma.planReferenceFile.create({
            data: item,
            select: {
              id: true,
              planId: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true
            }
          })
        )
      );

      return NextResponse.json(
        {
          files: created.map((file) => ({
            ...file,
            fileUrl: planFileContentUrl(file.id)
          }))
        },
        { status: 201 }
      );
    } catch {
      await deletePlanFiles(writtenFileNames);
      return serverError();
    }
  } catch {
    return serverError();
  }
}
