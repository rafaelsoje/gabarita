"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/components/app-toast";

type PlanReferenceFile = {
  id: string;
  planId: string;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type PlanReferenceFilesManagerProps = {
  planId: string;
  initialCount: number;
};

function formatSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileContentUrl(fileId: string, download = false) {
  return download ? `/api/plans/files/${fileId}?download=1` : `/api/plans/files/${fileId}`;
}

export function PlanReferenceFilesManager({ planId, initialCount }: PlanReferenceFilesManagerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<PlanReferenceFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const router = useRouter();

  const label = useMemo(
    () => (initialCount > 0 ? `${initialCount} arquivo(s)` : "Adicionar arquivos"),
    [initialCount]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  async function loadFiles() {
    try {
      setLoading(true);
      const response = await fetch(`/api/plans/${planId}/files`, {
        method: "GET"
      });

      if (!response.ok) {
        toastError("Referências", "Não foi possível carregar os arquivos.");
        return;
      }

      const data = (await response.json()) as { files: PlanReferenceFile[] };
      setFiles(data.files ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function openModal() {
    setOpen(true);
    await loadFiles();
  }

  async function uploadFiles() {
    if (selectedFiles.length === 0) {
      toastError("Referências", "Selecione ao menos um arquivo.");
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append("files", file));

      const response = await fetch(`/api/plans/${planId}/files`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        toastError("Referências", payload?.message ?? "Falha ao enviar arquivo(s).");
        return;
      }

      setSelectedFiles([]);
      await loadFiles();
      toastSuccess("Referências", "Arquivo(s) enviado(s) com sucesso.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeFile(fileId: string) {
    try {
      setSaving(true);
      const response = await fetch(`/api/plans/files/${fileId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        toastError("Referências", "Não foi possível remover o arquivo.");
        return;
      }

      setFiles((prev) => prev.filter((item) => item.id !== fileId));
      toastSuccess("Referências", "Arquivo removido.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="topicFilesTrigger" onClick={openModal}>
        {label}
      </button>

      {open && mounted
        ? createPortal(
            <div className="studyCommentModalOverlay" onClick={() => setOpen(false)}>
              <section className="topicFilesModal" onClick={(event) => event.stopPropagation()} aria-label="Gerenciar arquivos de referência do plano">
                <header className="studyCommentModalHeader">
                  <h3>Arquivos do concurso</h3>
                  <button type="button" className="studyCommentModalClose" onClick={() => setOpen(false)} aria-label="Fechar">
                    ✕
                  </button>
                </header>

                <div className="topicFilesList">
                  {loading ? <p className="emptyState">Carregando arquivos...</p> : null}
                  {!loading && files.length === 0 ? <p className="emptyState">Nenhum arquivo cadastrado.</p> : null}
                  {files.map((item) => (
                    <div key={item.id} className="topicFilesItem">
                      <a href={fileContentUrl(item.id)} target="_blank" rel="noreferrer">
                        {item.originalName}
                      </a>
                      <span>{formatSize(item.sizeBytes)}</span>
                      <button type="button" className="topicLinksRemove" onClick={() => removeFile(item.id)} disabled={saving}>
                        Remover
                      </button>
                    </div>
                  ))}
                </div>

                <div className="topicFilesUploader">
                  <label className={`topicFilesPickBtn ${saving ? "disabled" : ""}`}>
                    <span className="topicFilesPickIcon" aria-hidden="true">
                      +
                    </span>
                    <span>Escolher arquivos</span>
                    {selectedFiles.length > 0 ? <b>{selectedFiles.length}</b> : null}
                    <input
                      type="file"
                      multiple
                      accept=".txt,.csv,.pdf,.doc,.docx,.odt,.ods,.odp,.xls,.xlsx,.ppt,.pptx,.pps,.ppsx,.ptt"
                      onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                      disabled={saving}
                    />
                  </label>
                  <p>Formatos: TXT, CSV, PDF, DOCX, ODT, XLSX, PPTX (até 20MB por arquivo)</p>
                </div>

                <div className="studyCommentModalActions">
                  <button type="button" className="secondaryBtn" onClick={() => setOpen(false)} disabled={saving}>
                    Fechar
                  </button>
                  <button type="button" className="button" onClick={uploadFiles} disabled={saving}>
                    {saving ? "Enviando..." : "Enviar arquivo(s)"}
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
