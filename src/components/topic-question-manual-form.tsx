"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/components/app-toast";

type TopicQuestionManualFormProps = {
  planId: string;
  subjectId: string;
  topicId: string;
};

function toNonNegativeInt(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(9999, parsed);
}

export function TopicQuestionManualForm({ planId, subjectId, topicId }: TopicQuestionManualFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [correct, setCorrect] = useState("");
  const [wrong, setWrong] = useState("");
  const [blank, setBlank] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const c = toNonNegativeInt(correct);
    const w = toNonNegativeInt(wrong);
    const b = toNonNegativeInt(blank);
    const total = c + w + b;

    if (total <= 0) {
      toastError("Questões", "Informe ao menos 1 questão.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/study-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          subjectId,
          topicId,
          category: "PRACTICE",
          durationMinutes: 0,
          questionsCorrect: c,
          questionsWrong: w,
          questionsBlank: b,
          startedAt: new Date().toISOString(),
          notes: "Registro manual de questões fora do sistema."
        })
      });

      if (response.status === 401) {
        window.location.href = "/entrar";
        return;
      }

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        toastError("Questões", payload?.message ?? "Não foi possível salvar o registro manual.");
        return;
      }

      toastSuccess("Questões", "Registro manual adicionado.");
      setCorrect("");
      setWrong("");
      setBlank("");
      setOpen(false);
      router.refresh();
    } catch {
      toastError("Questões", "Falha de conexão ao registrar.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="libraryActionBtn editalManualToggleBtn" onClick={() => setOpen(true)}>
        Lançar Q
      </button>
    );
  }

  return (
    <form className="editalManualForm" onSubmit={handleSubmit}>
      <input
        className="editalManualInput"
        type="number"
        min={0}
        placeholder="✓"
        value={correct}
        onChange={(event) => setCorrect(event.target.value)}
        disabled={pending}
      />
      <input
        className="editalManualInput"
        type="number"
        min={0}
        placeholder="✕"
        value={wrong}
        onChange={(event) => setWrong(event.target.value)}
        disabled={pending}
      />
      <input
        className="editalManualInput"
        type="number"
        min={0}
        placeholder="B"
        value={blank}
        onChange={(event) => setBlank(event.target.value)}
        disabled={pending}
      />
      <button type="submit" className="libraryActionBtn" disabled={pending}>
        {pending ? "..." : "OK"}
      </button>
      <button type="button" className="ghostButton editalManualCancelBtn" onClick={() => setOpen(false)} disabled={pending}>
        X
      </button>
    </form>
  );
}

