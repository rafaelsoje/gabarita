"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/components/app-toast";

type StudySessionCompletionToggleProps = {
  topicId: string | null;
  checked: boolean;
};

export function StudySessionCompletionToggle({ topicId, checked }: StudySessionCompletionToggleProps) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleToggle(nextChecked: boolean) {
    if (!topicId || busy) return;

    try {
      setBusy(true);
      const response = await fetch(`/api/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          nextChecked
            ? { status: "COMPLETED", completedAt: new Date().toISOString() }
            : { status: "PENDING" }
        )
      });

      if (!response.ok) {
        toastError("Tópico", "Não foi possível atualizar o status do tópico.");
        return;
      }

      toastSuccess("Tópico", nextChecked ? "Tópico marcado como concluído." : "Tópico reaberto.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className={`studyHistoryCompleteToggle ${checked ? "checked" : ""} ${!topicId ? "disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!topicId || busy}
        onChange={(event) => handleToggle(event.target.checked)}
        aria-label="Marcar tópico como concluído"
      />
      <span>Concluído</span>
    </label>
  );
}
