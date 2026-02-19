"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SubjectItem = { id: string; name: string };
type TopicItem = { id: string; title: string; subjectId: string };

type QuestionsFiltersFormProps = {
  subjects: SubjectItem[];
  topics: TopicItem[];
  boardNames: string[];
  selectedSubjectId: string;
  selectedTopicId: string;
  selectedBanca: string;
  selectedTheme: string;
  selectedQuery: string;
};

export function QuestionsFiltersForm(props: QuestionsFiltersFormProps) {
  const [subjectId, setSubjectId] = useState(props.selectedSubjectId);
  const [topicId, setTopicId] = useState(props.selectedTopicId);

  const availableSubjects = useMemo(() => props.subjects, [props.subjects]);
  const availableTopics = useMemo(() => props.topics, [props.topics]);

  function handleSubjectChange(nextSubjectId: string) {
    setSubjectId(nextSubjectId);
  }

  return (
    <form method="get" className="historyFiltersForm questionsFiltersForm">
      <label className="historyFilterField">
        <span>Disciplina</span>
        <select name="subjectId" value={subjectId} onChange={(event) => handleSubjectChange(event.target.value)}>
          <option value="">Todas</option>
          {availableSubjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </label>

      <label className="historyFilterField">
        <span>Assunto</span>
        <select name="topicId" value={topicId} onChange={(event) => setTopicId(event.target.value)}>
          <option value="">Todos</option>
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
