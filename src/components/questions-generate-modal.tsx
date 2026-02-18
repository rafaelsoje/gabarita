"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/components/app-toast";

type PlanItem = { id: string; title: string };
type SubjectItem = { id: string; name: string; planId: string };
type TopicItem = { id: string; title: string; subjectId: string };

type QuestionsGenerateModalProps = {
  plans: PlanItem[];
  subjects: SubjectItem[];
  topics: TopicItem[];
  defaultPlanId: string;
  defaultSubjectId: string;
  defaultTopicId: string;
  defaultBanca: string;
  boardNames: string[];
  planBancaById: Record<string, string>;
};

function truncateOptionLabel(label: string, maxLength = 56) {
  const normalized = label.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function QuestionsGenerateModal(props: QuestionsGenerateModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [planId, setPlanId] = useState(props.defaultPlanId || props.plans[0]?.id || "");
  const [subjectId, setSubjectId] = useState(props.defaultSubjectId || "");
  const [topicId, setTopicId] = useState(props.defaultTopicId || "");
  const [amount, setAmount] = useState("5");
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [banca, setBanca] = useState(props.defaultBanca || props.planBancaById[props.defaultPlanId] || "");

  const availableSubjects = useMemo(
    () => (planId ? props.subjects.filter((item) => item.planId === planId) : []),
    [props.subjects, planId]
  );
  const availableTopics = useMemo(
    () => (subjectId ? props.topics.filter((item) => item.subjectId === subjectId) : []),
    [props.topics, subjectId]
  );
  const selectedTopic = useMemo(
    () => availableTopics.find((item) => item.id === topicId) ?? null,
    [availableTopics, topicId]
  );
  const topicScopeHint = useMemo(() => {
    if (!subjectId) return "Selecione uma disciplina para definir o escopo da geração.";
    if (topicId && selectedTopic) return `Escopo: somente o tópico "${selectedTopic.title}".`;
    if (availableTopics.length === 0) {
      return "Esta disciplina não possui tópicos cadastrados. A geração usará apenas o contexto da disciplina.";
    }
    return `Escopo: todos os ${availableTopics.length} tópico(s) da disciplina.`;
  }, [subjectId, topicId, selectedTopic, availableTopics.length]);

  function handlePlanChange(nextPlanId: string) {
    setPlanId(nextPlanId);
    setBanca(props.planBancaById[nextPlanId] ?? "");

    if (!nextPlanId) {
      setSubjectId("");
      setTopicId("");
      return;
    }

    const subjectStillValid = props.subjects.some((item) => item.id === subjectId && item.planId === nextPlanId);
    if (!subjectStillValid) {
      setSubjectId("");
      setTopicId("");
      return;
    }

    const topicStillValid = props.topics.some((item) => item.id === topicId && item.subjectId === subjectId);
    if (!topicStillValid) setTopicId("");
  }

  function handleSubjectChange(nextSubjectId: string) {
    setSubjectId(nextSubjectId);
    if (!nextSubjectId) {
      setTopicId("");
      return;
    }

    const topicStillValid = props.topics.some((item) => item.id === topicId && item.subjectId === nextSubjectId);
    if (!topicStillValid) setTopicId("");
  }

  useEffect(() => {
    if (!open) return;
    const fromPlan = props.planBancaById[planId] ?? "";
    setBanca(fromPlan || props.defaultBanca || "");
  }, [open, planId, props.planBancaById, props.defaultBanca]);

  async function submitGeneration() {
    if (!planId || !subjectId) {
      toastError("Questões", "Selecione plano e disciplina.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/questions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          subjectId,
          topicId: topicId || undefined,
          topicIds: topicId ? undefined : availableTopics.map((topic) => topic.id),
          amount: Number.parseInt(amount, 10) || 5,
          difficulty,
          banca: banca.trim() || undefined
        })
      });

      if (response.status === 401) {
        window.location.href = "/entrar";
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; result?: { usedLlm: boolean; llmError: string | null; created: number } }
        | null;

      if (!response.ok || !payload?.result) {
        toastError("Questões", payload?.message ?? "Não foi possível gerar questões.");
        return;
      }

      toastSuccess("Questões", `Questões geradas via LLM (${payload.result.created}).`);

      setOpen(false);
      router.refresh();
    } catch {
      toastError("Questões", "Falha ao gerar questões.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="primaryBtn" onClick={() => setOpen(true)}>
        Gerar questões
      </button>

      {open ? (
        <div className="studyCommentModalOverlay" onClick={() => (busy ? null : setOpen(false))}>
          <section className="studyCommentModal questionsGenerateModal" onClick={(event) => event.stopPropagation()}>
            <header className="studyCommentModalHeader">
              <h3>Gerar questões</h3>
              <button type="button" className="studyCommentModalClose" onClick={() => (busy ? null : setOpen(false))} aria-label="Fechar">
                ✕
              </button>
            </header>

            <div className="questionsGeneratorForm">
              <label>
                <span>Plano</span>
                <select
                  value={planId}
                  onChange={(event) => handlePlanChange(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {props.plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Disciplina</span>
                <select
                  value={subjectId}
                  onChange={(event) => handleSubjectChange(event.target.value)}
                  disabled={!planId}
                >
                  <option value="">{planId ? "Selecione" : "Selecione um plano"}</option>
                  {availableSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Tópico (opcional)</span>
                <select value={topicId} onChange={(event) => setTopicId(event.target.value)} disabled={!subjectId}>
                  <option value="">{subjectId ? "Todos os tópicos da disciplina" : "Selecione uma disciplina"}</option>
                  {availableTopics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {truncateOptionLabel(topic.title)}
                    </option>
                  ))}
                </select>
              </label>
              <p className={`questionsGeneratorHint ${!topicId && availableTopics.length === 0 ? "warning" : ""}`}>{topicScopeHint}</p>

              <label>
                <span>Banca (opcional)</span>
                <input
                  type="text"
                  value={banca}
                  onChange={(event) => setBanca(event.target.value)}
                  placeholder="Ex.: CEBRASPE, FGV, FCC"
                  list="board-suggestions"
                />
                <datalist id="board-suggestions">
                  {props.boardNames.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>

              <label>
                <span>Quantidade</span>
                <input type="number" min={1} max={30} value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>

              <label>
                <span>Dificuldade</span>
                <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                  <option value="EASY">Fácil</option>
                  <option value="MEDIUM">Média</option>
                  <option value="HARD">Difícil</option>
                </select>
              </label>
            </div>

            <div className="studyCommentModalActions">
              <button type="button" className="ghostButton" onClick={() => setOpen(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="primaryBtn" onClick={submitGeneration} disabled={busy}>
                {busy ? "Gerando..." : "Confirmar geração"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
