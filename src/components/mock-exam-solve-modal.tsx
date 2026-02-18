"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/components/app-toast";

type MockQuestionOption = {
  id: string;
  label: string;
  text: string;
};

type MockQuestionItem = {
  id: string;
  questionId: string;
  position: number;
  question: {
    id: string;
    statement: string;
    subject?: { name: string } | null;
    topic?: { title: string } | null;
    options: MockQuestionOption[];
  };
};

type SubmitResult = {
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  scorePct: number;
  total: number;
  review: Array<{
    questionId: string;
    selectedOptionId: string | null;
    correctOptionId: string | null;
  }>;
};

type MockExamSolveModalProps = {
  examId: string;
  title: string;
  plannedDurationMinutes: number | null;
  items: MockQuestionItem[];
};

type StructuredAssertion = { label: string; text: string };

function splitStructuredStatement(statement: string) {
  const text = statement.trim();
  if (!text) return null;

  const markerRegex = /\b([IVXLCDM]{1,6})(?:\s*(?:[.)]|[-–—:]))?\s+(?=[A-Za-zÀ-ÿ(])/g;
  const markers = Array.from(text.matchAll(markerRegex));
  if (markers.length < 2) return null;

  const intro = text.slice(0, markers[0].index ?? 0).trim();
  const assertions: StructuredAssertion[] = [];

  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const start = (current.index ?? 0) + current[0].length;
    const end = next?.index ?? text.length;
    const itemText = text.slice(start, end).trim();
    if (!itemText) continue;
    assertions.push({ label: current[1], text: itemText });
  }

  if (assertions.length < 2) return null;

  let tail = "";
  const last = assertions[assertions.length - 1];
  const tailMatch = last.text.match(/^(.*?)(?=(Assinale|Marque|Julgue|Indique|Escolha)\b)([\s\S]*)$/i);
  if (tailMatch) {
    const itemText = tailMatch[1]?.trim().replace(/[;,:-–—]\s*$/, "") ?? "";
    const commandText = `${tailMatch[2]}${tailMatch[3] ?? ""}`.trim();
    if (itemText.length > 0 && commandText.length > 0) {
      last.text = itemText;
      tail = commandText;
    }
  }

  return { intro, assertions, tail };
}

function renderQuestionStatement(statement: string, questionNumber?: number) {
  const structured = splitStructuredStatement(statement);
  if (!structured) {
    return (
      <p className="questionStatementLead">
        {questionNumber ? <b>{questionNumber}.</b> : null} {statement}
      </p>
    );
  }

  return (
    <div className="questionStatement">
      {structured.intro ? (
        <p className="questionStatementLead">
          {questionNumber ? <b>{questionNumber}.</b> : null} {structured.intro}
        </p>
      ) : null}
      <ul className="questionAssertions">
        {structured.assertions.map((item) => (
          <li key={`${item.label}-${item.text.slice(0, 24)}`}>
            <b>{item.label}.</b> {item.text}
          </li>
        ))}
      </ul>
      {structured.tail ? <p className="questionStatementTail">{structured.tail}</p> : null}
    </div>
  );
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hh = String(Math.floor(safe / 3600)).padStart(2, "0");
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function MockExamSolveModal({ examId, title, plannedDurationMinutes, items }: MockExamSolveModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    if (!open || startedAt == null || result) return;
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, startedAt, result]);

  const totalQuestions = items.length;
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const blankCount = Math.max(0, totalQuestions - answeredCount);
  const remainingSec = plannedDurationMinutes ? Math.max(0, plannedDurationMinutes * 60 - elapsedSec) : null;
  const current = items[index];
  const reviewMap = useMemo(() => new Map((result?.review ?? []).map((row) => [row.questionId, row])), [result]);

  function openModal() {
    setOpen(true);
    setIndex(0);
    setAnswers({});
    setStartedAt(Date.now());
    setElapsedSec(0);
    setResult(null);
    setShowReview(false);
    setConfirmingFinish(false);
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    setConfirmingFinish(false);
  }

  async function finalizeExam() {
    if (busy || result) return;
    setBusy(true);
    try {
      const response = await fetch("/api/mock-exams/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mockExamId: examId,
          answers,
          durationMinutes: Math.max(1, Math.round(elapsedSec / 60))
        })
      });

      if (response.status === 401) {
        window.location.href = "/entrar";
        return;
      }

      const payload = (await response.json().catch(() => null)) as { message?: string; result?: SubmitResult } | null;
      if (!response.ok || !payload?.result) {
        toastError("Simulado", payload?.message ?? "Não foi possível finalizar.");
        return;
      }

      setResult(payload.result);
      setConfirmingFinish(false);
      toastSuccess("Simulado", "Tentativa registrada com sucesso.");
      router.refresh();
    } catch {
      toastError("Simulado", "Falha ao finalizar simulado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="primaryBtn" type="button" onClick={openModal}>
        Resolver em modal
      </button>

      {open ? (
        <div className="studyCommentModalOverlay" onClick={closeModal}>
          <section className="studyCommentModal mockSolveModal" onClick={(event) => event.stopPropagation()}>
            <header className="studyCommentModalHeader">
              <h3>{title}</h3>
              <button className="studyCommentModalClose" type="button" onClick={closeModal} aria-label="Fechar">
                ✕
              </button>
            </header>

            {result ? (
              <div className="mockResultPanel">
                <p>
                  Resultado: <b>{result.scorePct}%</b> ({result.correctCount} acertos, {result.wrongCount} erros, {result.blankCount} brancos)
                </p>
                <div className="studyCommentModalActions">
                  <button type="button" className="secondaryBtn" onClick={() => setShowReview((prev) => !prev)}>
                    {showReview ? "Ocultar revisão" : "Revisar simulado"}
                  </button>
                  <button type="button" className="primaryBtn" onClick={closeModal}>
                    Fechar
                  </button>
                </div>

                {showReview ? (
                  <div className="questionsList">
                    {items.map((item, itemIndex) => {
                      const review = reviewMap.get(item.question.id);
                      return (
                        <article key={item.id} className="questionCard">
                          <header className="questionCardHeader">
                            {renderQuestionStatement(item.question.statement, itemIndex + 1)}
                          </header>
                          <div className="questionOptionsGrid">
                            {item.question.options.map((option) => {
                              const isCorrect = review?.correctOptionId === option.id;
                              const isSelected = review?.selectedOptionId === option.id;
                              const className = isCorrect ? "mockOptionReview correct" : isSelected ? "mockOptionReview wrong" : "mockOptionReview";
                              return (
                                <div key={option.id} className={className}>
                                  <b>{option.label})</b> {option.text}
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="mockSolveTopBar">
                  <span>
                    Questão {index + 1} de {totalQuestions}
                  </span>
                  <span>Respondidas: {answeredCount}</span>
                  {remainingSec !== null ? <b>Tempo restante: {formatClock(remainingSec)}</b> : <b>Tempo decorrido: {formatClock(elapsedSec)}</b>}
                </div>

                {current ? (
                  <article className="questionCard">
                    <header className="questionCardHeader">
                      {renderQuestionStatement(current.question.statement)}
                      <div className="questionMetaRow">
                        <span>{current.question.subject?.name ?? "Sem disciplina"}</span>
                        <span>{current.question.topic?.title ?? "Sem tópico"}</span>
                      </div>
                    </header>
                    <div className="questionOptionsGrid">
                      {current.question.options.map((option) => (
                        <label key={option.id} className="questionOptionRow">
                          <input
                            type="radio"
                            name={`exam_${current.question.id}`}
                            value={option.id}
                            checked={answers[current.question.id] === option.id}
                            onChange={() => setAnswers((prev) => ({ ...prev, [current.question.id]: option.id }))}
                          />
                          <span>
                            <b>{option.label})</b> {option.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  </article>
                ) : null}

                <div className="studyCommentModalActions">
                  <button type="button" className="secondaryBtn" onClick={() => setIndex((prev) => Math.max(0, prev - 1))} disabled={index <= 0}>
                    Questão anterior
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn"
                    onClick={() => setIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                    disabled={index >= totalQuestions - 1}
                  >
                    Próxima questão
                  </button>
                  <button type="button" className="primaryBtn" onClick={() => setConfirmingFinish(true)}>
                    Encerrar simulado
                  </button>
                </div>

                {confirmingFinish ? (
                  <div className="mockFinishConfirm">
                    <p>
                      Deseja mesmo encerrar? Ainda há <b>{blankCount}</b> questão(ões) em branco.
                    </p>
                    <div className="studyCommentModalActions">
                      <button type="button" className="ghostButton" onClick={() => setConfirmingFinish(false)} disabled={busy}>
                        Continuar prova
                      </button>
                      <button type="button" className="dangerBtn" onClick={finalizeExam} disabled={busy}>
                        {busy ? "Finalizando..." : "Confirmar encerramento"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
