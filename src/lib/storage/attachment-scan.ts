import { AttachmentScanStatus } from "@prisma/client";
import { env } from "@/lib/env";

export function buildInitialAttachmentScanData() {
  if (!env.enableAttachmentScan) {
    return {
      scanStatus: AttachmentScanStatus.CLEAN,
      scannedAt: new Date(),
      scanResult: "Scan desativado por configuração."
    };
  }

  return {
    scanStatus: AttachmentScanStatus.PENDING,
    scannedAt: null,
    scanResult: null
  };
}

export function shouldBlockAttachmentAccess(scanStatus: AttachmentScanStatus) {
  if (!env.enableAttachmentScan) return false;
  if (!env.enforceCleanAttachmentAccess) return false;
  return scanStatus !== AttachmentScanStatus.CLEAN;
}

export function getAttachmentAccessBlockReason(scanStatus: AttachmentScanStatus) {
  if (scanStatus === AttachmentScanStatus.INFECTED) {
    return "Arquivo bloqueado por ameaça detectada.";
  }
  if (scanStatus === AttachmentScanStatus.ERROR) {
    return "Arquivo indisponível: falha na varredura de segurança.";
  }
  return "Arquivo em análise de segurança.";
}
