"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PlanItem = { id: string; title: string };
type SubjectItem = { id: string; name: string; planId: string };
type TopicItem = { id: string; title: string; subjectId: string };

type QuestionsFiltersFormProps = {
  plans: PlanItem[];
  subjects: SubjectItem[];
  topics: TopicItem[];
  boardNames: string[];
  selectedPlanId: string;
  selectedSubjectId: string;
  selectedTopicId: string;
  selectedBanca: string;
  selectedTheme: string;
  selectedQuery: string;
};

export function QuestionsFiltersForm(props: QuestionsFiltersFormProps) {
  const [planId, setPlanId] = useState(props.selectedPlanId);
  const [subjectId, setSubjectId] = useState(props.selectedSubjectId);
  const [topicId, setTopicId] = useState(props.selectedTopicId);

  const availableSubjects = useMemo(
    () => (planId ? props.subjects.filter((item) => item.planId === planId) : []),
    [props.subjects, planId]
  );
  const availableTopics = useMemo(
    () => (subjectId ? props.topics.filter((item) => item.subjectId === subjectId) : []),
    [props.topics, subjectId]
  );

  function handlePlanChange(nextPlanId: string) {
    setPlanId(nextPlanId);
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

  return (
    <form method="get" className="historyFiltersForm questionsFiltersForm">
      <label className="historyFilterField">
        <span>Plano</span>
        <select name="planId" value={planId} onChange={(event) => handlePlanChange(event.target.value)}>
          <option value="">Todos</option>
          {props.plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.title}
            </option>
          ))}
        </select>
      </label>

      <label className="historyFilterField">
        <span>Disciplina</span>
        <select name="subjectId" value={subjectId} onChange={(event) => handleSubjectChange(event.target.value)} disabled={!planId}>
          <option value="">{planId ? "Todas" : "Selecione um plano"}</option>
          {availableSubjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </label>

      <label className="historyFilterField">
        <span>Tópico</span>
        <select name="topicId" value={topicId} onChange={(event) => setTopicId(event.target.value)} disabled={!subjectId}>
          <option value="">{subjectId ? "Todos" : "Selecione uma disciplina"}</option>
          {availableTopics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.title}
            </option>
          ))}
        </select>
      </label>

      <label className="historyFilterField">
        <span>Banca</span>
        <select name="banca" defaultValue={props.selectedBanca}>
          <option value="">Todas</option>
          {props.boardNames.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="historyFilterField">
        <span>Tema</span>
        <input name="theme" defaultValue={props.selectedTheme} placeholder="Ex.: DNS" />
      </label>

      <label className="historyFilterField">
        <span>Palavra-chave</span>
        <input name="q" defaultValue={props.selectedQuery} placeholder="Enunciado, tema, keyword..." />
      </label>

      <div className="historyFilterActions">
        <button className="primaryBtn" type="submit">
          Filtrar
        </button>
        <Link className="ghostButton" href="/questoes">
          Limpar
        </Link>
      </div>
    </form>
  );
}
