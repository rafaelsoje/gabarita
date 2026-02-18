import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { PrismaClient, AttachmentScanStatus } from "@prisma/client";

const prisma = new PrismaClient();

const watchMode = process.argv.includes("--watch");
const scanEnabled = parseBool(process.env.ENABLE_ATTACHMENT_SCAN);
const scanCommand = (process.env.ATTACHMENT_SCAN_COMMAND || "clamdscan").trim();
const scanArgs = splitArgs(process.env.ATTACHMENT_SCAN_ARGS || "--no-summary");
const batchSize = parsePositiveInt(process.env.ATTACHMENT_SCAN_BATCH_SIZE, 20);
const intervalMs = parsePositiveInt(process.env.ATTACHMENT_SCAN_INTERVAL_MS, 30000);
const deleteInfected = parseBool(process.env.ATTACHMENT_DELETE_INFECTED, true);

const privateDir = path.join(process.cwd(), "storage", "topic-files");
const legacyDir = path.join(process.cwd(), "public", "uploads", "topic-files");

if (!scanEnabled) {
  console.log("[scan-attachments] ENABLE_ATTACHMENT_SCAN=false. Worker finalizado.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`[scan-attachments] iniciado (${watchMode ? "watch" : "run-once"})`);

try {
  do {
    const processed = await processBatch();
    if (!watchMode) break;
    if (processed === 0) {
      await sleep(intervalMs);
    }
  } while (watchMode);
} finally {
  await prisma.$disconnect();
}

async function processBatch() {
  const candidates = await prisma.topicAttachment.findMany({
    where: {
      scanStatus: {
        in: [AttachmentScanStatus.PENDING, AttachmentScanStatus.ERROR]
      }
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    select: { id: true, fileName: true, originalName: true }
  });

  if (candidates.length === 0) return 0;

  let processed = 0;
  for (const candidate of candidates) {
    const claimed = await prisma.topicAttachment.updateMany({
      where: {
        id: candidate.id,
        scanStatus: {
          in: [AttachmentScanStatus.PENDING, AttachmentScanStatus.ERROR]
        }
      },
      data: {
        scanStatus: AttachmentScanStatus.SCANNING,
        scanResult: null,
        scannedAt: null
      }
    });

    if (claimed.count === 0) continue;

    processed += 1;
    await scanAttachment(candidate);
  }

  return processed;
}

async function scanAttachment(attachment) {
  const absolutePath = await resolvePath(attachment.fileName);
  if (!absolutePath) {
    await markStatus(attachment.id, AttachmentScanStatus.ERROR, "Arquivo físico não encontrado.");
    return;
  }

  const result = await runScan(absolutePath);

  if (result.exitCode === 0) {
    await markStatus(attachment.id, AttachmentScanStatus.CLEAN, truncateResult(result.details));
    return;
  }

  if (result.exitCode === 1) {
    await markStatus(attachment.id, AttachmentScanStatus.INFECTED, truncateResult(result.details));
    if (deleteInfected) {
      await fs.unlink(absolutePath).catch(() => undefined);
    }
    return;
  }

  await markStatus(attachment.id, AttachmentScanStatus.ERROR, truncateResult(result.details));
}

async function markStatus(attachmentId, status, message) {
  await prisma.topicAttachment.update({
    where: { id: attachmentId },
    data: {
      scanStatus: status,
      scannedAt: new Date(),
      scanResult: message || null
    }
  });
}

async function resolvePath(fileName) {
  const safeName = path.posix.basename(fileName || "");
  if (!safeName || safeName === "." || safeName === "..") return null;

  const privatePath = path.join(privateDir, safeName);
  try {
    await fs.access(privatePath);
    return privatePath;
  } catch {}

  const legacyPath = path.join(legacyDir, safeName);
  try {
    await fs.access(legacyPath);
    return legacyPath;
  } catch {
    return null;
  }
}

function runScan(filePath) {
  return new Promise((resolve) => {
    const child = spawn(scanCommand, [...scanArgs, filePath]);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        exitCode: 2,
        details: `Falha ao executar scanner (${scanCommand}): ${error.message}`
      });
    });

    child.on("close", (code) => {
      const exitCode = typeof code === "number" ? code : 2;
      const details = [stdout.trim(), stderr.trim()].filter(Boolean).join(" | ") || `Scanner retornou código ${exitCode}`;
      resolve({ exitCode, details });
    });
  });
}

function splitArgs(raw) {
  return raw
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBool(value, defaultValue = false) {
  if (!value) return defaultValue;
  return value.trim().toLowerCase() === "true";
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function truncateResult(message) {
  if (!message) return null;
  return message.slice(0, 2000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
