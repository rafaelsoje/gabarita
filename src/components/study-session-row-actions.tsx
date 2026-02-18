"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/app-toast";

type StudySessionEditPayload = {
  sessionId: string;
  category: "THEORY" | "PRACTICE" | "REVIEW" | "MOCK_EXAM";
  studyDate: string;
  durationMinutes: number;
  subjectId: string | null;
  subjectName: string;
  topicId: string | null;
  topicTitle: string | null;
  material: string;
  comment: string;
  questionsCorrect: number;
  questionsWrong: number;
  pagesRead: number;
  pagesStart: number | null;
  pagesEnd: number | null;
  videoMinutes: number;
};

type StudySessionRowActionsProps = {
  editPayload: StudySessionEditPayload;
  comment: string | null;
};

export function StudySessionRowActions({ editPayload, comment }: StudySessionRowActionsProps) {
  const [busy, setBusy] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const hasComment = !!comment?.trim();

  function viewComment() {
    if (!hasComment) return;
    setViewOpen(true);
  }

  function openEditRegister() {
    window.dispatchEvent(
      new CustomEvent("study-timer:edit-register", {
        detail: editPayload
      })
    );
  }

  async function deleteSession() {
    try {
      setBusy(true);
      const response = await fetch(`/api/study-sessions/${editPayload.sessionId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        toastError("Registro", "Não foi possível excluir o registro.");
        return;
      }
      toastSuccess("Registro", "Registro excluído com sucesso.");
      setDeleteOpen(false);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="studyHistoryActions">
        <button
          type="button"
          className={`studyHistoryIconBtn ${hasComment ? "" : "disabled"}`}
          onClick={viewComment}
          aria-label="Visualizar comentário"
          disabled={!hasComment || busy}
          title={hasComment ? "Visualizar comentário" : "Sem comentário"}
        >
          💬
        </button>
        <button type="button" className="studyHistoryIconBtn" onClick={openEditRegister} aria-label="Editar registro" disabled={busy} title="Editar registro">
          ✎
        </button>
        <button
          type="button"
          className="studyHistoryIconBtn danger"
          onClick={() => setDeleteOpen(true)}
          aria-label="Excluir registro"
          disabled={busy}
          title="Excluir registro"
        >
          🗑
        </button>
      </div>

      {viewOpen ? (
        <div className="studyCommentModalOverlay" onClick={() => setViewOpen(false)}>
          <section className="studyCommentModal" aria-label="Visualizar comentário" onClick={(e) => e.stopPropagation()}>
            <header className="studyCommentModalHeader">
              <h3>Comentário</h3>
              <button type="button" className="studyCommentModalClose" onClick={() => setViewOpen(false)} aria-label="Fechar comentário">
                ✕
              </button>
            </header>

            <div className="studyCommentModalView">{comment}</div>

            <div className="studyCommentModalActions">
              <button type="button" className="button" onClick={() => setViewOpen(false)}>
                Fechar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="studyCommentModalOverlay" onClick={() => (busy ? null : setDeleteOpen(false))}>
          <section className="studyCommentModal" aria-label="Confirmar exclusão" onClick={(e) => e.stopPropagation()}>
            <header className="studyCommentModalHeader">
              <h3>Excluir registro</h3>
              <button
                type="button"
                className="studyCommentModalClose"
                onClick={() => setDeleteOpen(false)}
                aria-label="Fechar confirmação"
                disabled={busy}
              >
                ✕
              </button>
            </header>

            <div className="studyCommentModalView">
              Tem certeza que deseja excluir este registro de estudo?
              <br />
              Essa ação não pode ser desfeita.
            </div>

            <div className="studyCommentModalActions">
              <button type="button" className="secondaryBtn" onClick={() => setDeleteOpen(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="dangerBtn" onClick={deleteSession} disabled={busy}>
                {busy ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
