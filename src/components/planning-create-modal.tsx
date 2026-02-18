"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { PlanningCreateSubmitButton } from "@/components/planning-create-submit-button";

type PlanningModalTopic = {
  id: string;
  title: string;
};

type PlanningModalSubject = {
  id: string;
  name: string;
  importance: number;
  knowledgeLevel: number;
  topics: PlanningModalTopic[];
};

type PlanningConfigSeed = {
  weekdayMinutes: number;
  weekendMinutes: number;
  subjects: Array<{
    subjectId: string;
    weight: number;
    difficulty: "BAIXA" | "MEDIA" | "ALTA";
    topicIds: string[];
  }>;
};

type PlanningCreateModalProps = {
  title: string;
  planId: string;
  subjects: PlanningModalSubject[];
  initialConfig?: PlanningConfigSeed | null;
  action: (formData: FormData) => void | Promise<void>;
};

function difficultyFromKnowledge(knowledgeLevel: number) {
  if (knowledgeLevel <= 35) return "ALTA";
  if (knowledgeLevel <= 70) return "MEDIA";
  return "BAIXA";
}

function minutesToHHMM(totalMinutes: number) {
  const safe = Math.max(0, Math.min(24 * 60, Math.floor(totalMinutes)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function applyHHMMMask(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeHHMM(value: string) {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hoursNum = Number.parseInt(hoursRaw ?? "0", 10);
  const minutesNum = Number.parseInt(minutesRaw ?? "0", 10);
  const hours = Number.isFinite(hoursNum) ? Math.max(0, Math.min(24, hoursNum)) : 0;
  let minutes = Number.isFinite(minutesNum) ? Math.max(0, Math.min(59, minutesNum)) : 0;
  if (hours === 24) minutes = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function PlanningCreateModal({ title, planId, subjects, initialConfig, action }: PlanningCreateModalProps) {
  const [open, setOpen] = useState(false);
  const [weekdayHHMM, setWeekdayHHMM] = useState(minutesToHHMM(initialConfig?.weekdayMinutes ?? 120));
  const [weekendHHMM, setWeekendHHMM] = useState(minutesToHHMM(initialConfig?.weekendMinutes ?? 180));
  const configMap = useMemo(() => {
    const map = new Map<string, { weight: number; difficulty: "BAIXA" | "MEDIA" | "ALTA"; topicIds: Set<string> }>();
    for (const item of initialConfig?.subjects ?? []) {
      map.set(item.subjectId, {
        weight: item.weight,
        difficulty: item.difficulty,
        topicIds: new Set(item.topicIds)
      });
    }
    return map;
  }, [initialConfig]);

  useEffect(() => {
    if (!open) return;
    setWeekdayHHMM(minutesToHHMM(initialConfig?.weekdayMinutes ?? 120));
    setWeekendHHMM(minutesToHHMM(initialConfig?.weekendMinutes ?? 180));
  }, [open, initialConfig]);

  function handleSubjectCardClick(event: MouseEvent<HTMLElement>, checkboxId: string) {
    const target = event.target as HTMLElement;
    if (target.closest("input, select, button, textarea, a, label")) return;
    const checkbox = document.getElementById(checkboxId) as HTMLInputElement | null;
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <>
      <button className="primaryBtn" type="button" onClick={() => setOpen(true)}>
        {title}
      </button>

      {open ? (
        <div className="studyCommentModalOverlay" onClick={() => setOpen(false)}>
          <section className="studyCommentModal planningCreateModal" onClick={(event) => event.stopPropagation()}>
            <header className="studyCommentModalHeader">
              <h3>{title}</h3>
              <button className="studyCommentModalClose" type="button" onClick={() => setOpen(false)} aria-label="Fechar">
                ✕
              </button>
            </header>

            <form action={action} className="planningCreateForm">
              <input type="hidden" name="planId" value={planId} />

              <div className="planningCreateAvailability">
                <label>
                  Tempo por dia útil (hh:mm)
                  <input
                    className="input"
                    name="studyWeekdayMinutes"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                    placeholder="00:00"
                    value={weekdayHHMM}
                    onChange={(event) => setWeekdayHHMM(applyHHMMMask(event.target.value))}
                    onBlur={() => setWeekdayHHMM(normalizeHHMM(weekdayHHMM))}
                  />
                </label>
                <label>
                  Tempo por fim de semana (hh:mm)
                  <input
                    className="input"
                    name="studyWeekendMinutes"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                    placeholder="00:00"
                    value={weekendHHMM}
                    onChange={(event) => setWeekendHHMM(applyHHMMMask(event.target.value))}
                    onBlur={() => setWeekendHHMM(normalizeHHMM(weekendHHMM))}
                  />
                </label>
              </div>

              <div className="planningCreateSubjects">
                {subjects.map((subject) => {
                  const fromConfig = configMap.get(subject.id);
                  const defaultSelected = Boolean(fromConfig) || !initialConfig;
                  const defaultDifficulty = fromConfig?.difficulty ?? difficultyFromKnowledge(subject.knowledgeLevel);
                  const defaultWeight = Math.max(1, Math.min(10, fromConfig?.weight ?? subject.importance ?? 3));
                  const checkboxId = `subject_enabled_${subject.id}`;
                  return (
                    <article key={subject.id} className="planningCreateSubjectCard" onClick={(event) => handleSubjectCardClick(event, checkboxId)}>
                      <div className="planningCreateSubjectHead">
                        <label className="checkboxRow" htmlFor={checkboxId}>
                          <input id={checkboxId} type="checkbox" name={checkboxId} defaultChecked={defaultSelected} />
                          <span>{subject.name}</span>
                        </label>
                        <small>{subject.topics.length} tópico(s)</small>
                      </div>

                      <div className="planningCreateSubjectMeta">
                        <label>
                          Peso na prova (1-10)
                          <input className="input" type="number" min={1} max={10} step={1} name={`subject_weight_${subject.id}`} defaultValue={defaultWeight} />
                        </label>
                        <label>
                          Dificuldade
                          <select className="input" name={`subject_difficulty_${subject.id}`} defaultValue={defaultDifficulty}>
                            <option value="BAIXA">Baixa</option>
                            <option value="MEDIA">Média</option>
                            <option value="ALTA">Alta</option>
                          </select>
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="studyCommentModalActions">
                <button type="button" className="ghostButton" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <PlanningCreateSubmitButton />
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
