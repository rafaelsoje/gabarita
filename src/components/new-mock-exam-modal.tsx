"use client";

import { useMemo, useState } from "react";

type NewMockExamModalProps = {
  planId: string;
  subjects: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; title: string; subject: { name: string } }>;
  action: (formData: FormData) => void | Promise<void>;
};

export function NewMockExamModal({ planId, subjects, topics, action }: NewMockExamModalProps) {
  const [open, setOpen] = useState(false);
  const [durationAuto, setDurationAuto] = useState(true);
  const [manualDuration, setManualDuration] = useState("60");
  const [subjectAmounts, setSubjectAmounts] = useState<Record<string, number>>({});
  const [topicAmounts, setTopicAmounts] = useState<Record<string, number>>({});

  const totalQuestions = useMemo(() => {
    const subjectsTotal = Object.values(subjectAmounts).reduce((acc, value) => acc + Math.max(0, value || 0), 0);
    const topicsTotal = Object.values(topicAmounts).reduce((acc, value) => acc + Math.max(0, value || 0), 0);
    return subjectsTotal + topicsTotal;
  }, [subjectAmounts, topicAmounts]);

  const suggestedDuration = useMemo(() => {
    if (totalQuestions <= 0) return 0;
    const estimated = Math.ceil(totalQuestions * 2.75);
    return Math.min(600, Math.max(1, estimated));
  }, [totalQuestions]);

  function resetModal() {
    setOpen(false);
    setDurationAuto(true);
    setManualDuration("60");
    setSubjectAmounts({});
    setTopicAmounts({});
  }

  function clampAmount(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, Math.floor(value)));
  }

  function adjustSubjectAmount(subjectId: string, delta: number) {
    setSubjectAmounts((prev) => ({ ...prev, [subjectId]: clampAmount((prev[subjectId] ?? 0) + delta) }));
  }

  function adjustTopicAmount(topicId: string, delta: number) {
    setTopicAmounts((prev) => ({ ...prev, [topicId]: clampAmount((prev[topicId] ?? 0) + delta) }));
  }

  return (
    <>
      <button className="primaryBtn" type="button" onClick={() => setOpen(true)}>
        Novo simulado
      </button>

      {open ? (
        <div className="studyCommentModalOverlay" onClick={resetModal}>
          <section className="studyCommentModal mockCreateModal" onClick={(event) => event.stopPropagation()}>
            <header className="studyCommentModalHeader">
              <h3>Novo simulado</h3>
              <button className="studyCommentModalClose" type="button" onClick={resetModal} aria-label="Fechar">
                ✕
              </button>
            </header>

            <p className="libraryListMeta">Defina quantas questões deseja por disciplina/tópico.</p>

            <form action={action} className="mockBuilderForm">
              <input type="hidden" name="planId" value={planId} />

              <label className="mockBuilderTitleField">
                <span>Título (opcional)</span>
                <input name="title" className="input" placeholder="Ex.: Simulado de Redes" maxLength={160} />
              </label>
              <label className="mockBuilderTitleField">
                <span>Tempo de prova (minutos)</span>
                <input
                  name="durationMinutes"
                  className="input"
                  type="number"
                  min={1}
                  max={600}
                  value={durationAuto ? (suggestedDuration > 0 ? String(suggestedDuration) : "") : manualDuration}
                  readOnly={durationAuto}
                  onChange={(event) => setManualDuration(event.target.value)}
                  placeholder="Ex.: 120"
                />
              </label>
              <div className="mockDurationBlock">
                <label className="mockDurationAuto">
                  <input type="checkbox" checked={durationAuto} onChange={(event) => setDurationAuto(event.target.checked)} />
                  <span>Tempo automático pelo total de questões</span>
                </label>
                <p className="mockDurationHint">
                  {totalQuestions} questão(ões) selecionada(s) → <b>{suggestedDuration || "--"} min</b>
                </p>
              </div>

              <div className="mockBuilderGrid">
                <article>
                  <header className="mockBuilderSectionHead">
                    <h3>Por disciplina</h3>
                    <small>{subjects.length} item(ns)</small>
                  </header>
                  {subjects.length === 0 ? <p className="emptyState">Nenhuma disciplina encontrada.</p> : null}
                  <div className="mockBuilderRows">
                    {subjects.map((subject) => (
                      <label key={subject.id} className="mockBuilderRow">
                        <span>{subject.name}</span>
                        <div className="mockBuilderQtyControl">
                          <button
                            type="button"
                            className="mockQtyBtn"
                            aria-label={`Diminuir quantidade de ${subject.name}`}
                            onClick={() =>
                              setSubjectAmounts((prev) => ({ ...prev, [subject.id]: clampAmount((prev[subject.id] ?? 0) - 1) }))
                            }
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={subjectAmounts[subject.id] ?? 0}
                            name={`subject_${subject.id}`}
                            onChange={(event) => {
                              const parsed = Number.parseInt(event.target.value || "0", 10);
                              setSubjectAmounts((prev) => ({ ...prev, [subject.id]: clampAmount(parsed) }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                              event.preventDefault();
                              const step = event.shiftKey ? 5 : 1;
                              adjustSubjectAmount(subject.id, event.key === "ArrowUp" ? step : -step);
                            }}
                          />
                          <button
                            type="button"
                            className="mockQtyBtn"
                            aria-label={`Aumentar quantidade de ${subject.name}`}
                            onClick={() =>
                              setSubjectAmounts((prev) => ({ ...prev, [subject.id]: clampAmount((prev[subject.id] ?? 0) + 1) }))
                            }
                          >
                            +
                          </button>
                        </div>
                      </label>
                    ))}
                  </div>
                </article>

                <article>
                  <header className="mockBuilderSectionHead">
                    <h3>Por tópico</h3>
                    <small>{topics.length} item(ns)</small>
                  </header>
                  {topics.length === 0 ? <p className="emptyState">Nenhum tópico encontrado.</p> : null}
                  <div className="mockBuilderRows">
                    {topics.map((topic) => (
                      <label key={topic.id} className="mockBuilderRow">
                        <span>
                          {topic.subject.name} · {topic.title}
                        </span>
                        <div className="mockBuilderQtyControl">
                          <button
                            type="button"
                            className="mockQtyBtn"
                            aria-label={`Diminuir quantidade de ${topic.title}`}
                            onClick={() =>
                              setTopicAmounts((prev) => ({ ...prev, [topic.id]: clampAmount((prev[topic.id] ?? 0) - 1) }))
                            }
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={topicAmounts[topic.id] ?? 0}
                            name={`topic_${topic.id}`}
                            onChange={(event) => {
                              const parsed = Number.parseInt(event.target.value || "0", 10);
                              setTopicAmounts((prev) => ({ ...prev, [topic.id]: clampAmount(parsed) }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                              event.preventDefault();
                              const step = event.shiftKey ? 5 : 1;
                              adjustTopicAmount(topic.id, event.key === "ArrowUp" ? step : -step);
                            }}
                          />
                          <button
                            type="button"
                            className="mockQtyBtn"
                            aria-label={`Aumentar quantidade de ${topic.title}`}
                            onClick={() =>
                              setTopicAmounts((prev) => ({ ...prev, [topic.id]: clampAmount((prev[topic.id] ?? 0) + 1) }))
                            }
                          >
                            +
                          </button>
                        </div>
                      </label>
                    ))}
                  </div>
                </article>
              </div>

              <div className="studyCommentModalActions">
                <button className="ghostButton" type="button" onClick={resetModal}>
                  Cancelar
                </button>
                <button className="primaryBtn" type="submit">
                  Gerar simulado
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
