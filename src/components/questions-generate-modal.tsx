"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/components/app-toast";

type SubjectItem = { id: string; name: string };
type TopicItem = { id: string; title: string; subjectId: string };

type QuestionsGenerateModalProps = {
  subjects: SubjectItem[];
  topics: TopicItem[];
  defaultSubjectId: string;
  defaultTopicId: string;
  defaultBanca: string;
  boardNames: string[];
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
  const [subjectId, setSubjectId] = useState(props.defaultSubjectId || "");
  const [topicId, setTopicId] = useState(props.defaultTopicId || "");
  const [amount, setAmount] = useState("5");
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [banca, setBanca] = useState(props.defaultBanca || "");

  const availableSubjects = useMemo(() => props.subjects, [props.subjects]);
  const availableTopics = useMemo(() => props.topics, [props.topics]);
  const selectedTopic = useMemo(() => props.topics.find((item) => item.id === topicId) ?? null, [props.topics, topicId]);
  const resolvedSubjectId = subjectId || selectedTopic?.subjectId || "";
  const resolvedSubjectTopics = useMemo(
    () => (resolvedSubjectId ? props.topics.filter((item) => item.subjectId === resolvedSubjectId) : []),
    [props.topics, resolvedSubjectId]
  );
  const topicScopeHint = useMemo(() => {
    if (!resolvedSubjectId) return "Selecione uma disciplina ou um assunto para definir o escopo da geração.";
    if (topicId && selectedTopic) return `Escopo: somente o assunto "${selectedTopic.title}".`;
    if (resolvedSubjectTopics.length === 0) {
      return "Esta disciplina não possui assuntos cadastrados. A geração usará apenas o contexto da disciplina.";
    }
    return `Escopo: todos os ${resolvedSubjectTopics.length} assunto(s) da disciplina.`;
  }, [resolvedSubjectId, topicId, selectedTopic, resolvedSubjectTopics.length]);

  function handleSubjectChange(nextSubjectId: string) {
    setSubjectId(nextSubjectId);
  }

  function handleTopicChange(nextTopicId: string) {
    setTopicId(nextTopicId);
    if (!nextTopicId) return;
    const topic = props.topics.find((item) => item.id === nextTopicId);
    if (!topic) return;
    setSubjectId(topic.subjectId);
  }

  useEffect(() => {
    if (!open) return;
    setBanca(props.defaultBanca || "");
  }, [open, props.defaultBanca]);

  async function submitGeneration() {
    if (!resolvedSubjectId) {
      toastError("Questões", "Selecione uma disciplina ou um assunto.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/questions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: resolvedSubjectId,
          topicId: topicId || undefined,
          topicIds: topicId ? undefined : resolvedSubjectTopics.map((topic) => topic.id),
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
                <span>Disciplina</span>
                <select value={subjectId} onChange={(event) => handleSubjectChange(event.target.value)}>
                  <option value="">Selecione</option>
                  {availableSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Assunto (opcional)</span>
                <select value={topicId} onChange={(event) => handleTopicChange(event.target.value)}>
                  <option value="">Todos os assuntos</option>
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
