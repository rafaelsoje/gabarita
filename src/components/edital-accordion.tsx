"use client";

import { useState } from "react";
import { StudySessionCompletionToggle } from "@/components/study-session-completion-toggle";
import { TopicLinksManager } from "@/components/topic-links-manager";
import { TopicFilesManager } from "@/components/topic-files-manager";
import { TopicQuestionManualForm } from "@/components/topic-question-manual-form";

type TopicRow = {
  id: string;
  title: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  description: string | null;
  attachmentsCount: number;
  correct: number;
  wrong: number;
  questions: number;
  performance: number;
  lastDateLabel: string;
};

type SubjectRow = {
  id: string;
  name: string;
  color: string | null;
  correct: number;
  wrong: number;
  questions: number;
  performance: number;
  progress: number;
  topics: TopicRow[];
};

export function EditalAccordion({ subjects, planId }: { subjects: SubjectRow[]; planId: string }) {
  const [openSubjectId, setOpenSubjectId] = useState<string>(subjects[0]?.id ?? "");

  function toggle(subjectId: string) {
    setOpenSubjectId((prev) => (prev === subjectId ? "" : subjectId));
  }

  function scoreClass(score: number) {
    if (score >= 90) return "score-good";
    if (score >= 70) return "score-warn";
    return "score-bad";
  }

  return (
    <section className="editalAccordionList">
      {subjects.map((subject) => {
        const isOpen = openSubjectId === subject.id;
        return (
          <article key={subject.id} className={`dashboardCard editalAccordionItem ${isOpen ? "open" : ""}`}>
            <button type="button" className="editalAccordionSummaryBtn" onClick={() => toggle(subject.id)} aria-expanded={isOpen}>
              <div className="editalAccordionSummary">
                <div className="editalAccordionTitleWrap">
                  <span className="editalAccordionColor" style={{ background: subject.color ?? "#2ea89b" }} />
                  <span className="editalAccordionTitle">{subject.name}</span>
                </div>
                <div className="editalAccordionMeta">
                  <span className="editalPill">
                    <b>{subject.correct}</b>
                    <b>{subject.wrong}</b>
                    <b>{subject.questions}</b>
                    <b className={scoreClass(subject.performance)}>{subject.performance}</b>
                  </span>
                  <div className="editalMiniProgress">
                    <span style={{ width: `${subject.progress}%` }} />
                  </div>
                  <span className="editalMiniProgressPct">{subject.progress}%</span>
                  <span className={`editalChevron ${isOpen ? "open" : ""}`}>▾</span>
                </div>
              </div>
            </button>

            <div className="editalAccordionBody">
              <div className="subscriptionTableWrap">
                <table className="subscriptionTable editalAccordionTable">
                  <thead>
                    <tr>
                      <th>Tópicos</th>
                      <th>✓</th>
                      <th>✕</th>
                      <th>Q</th>
                      <th>%</th>
                      <th>Data</th>
                      <th>Lançar</th>
                      <th>Link</th>
                      <th>Arquivos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subject.topics.map((topic) => {
                      const isDone = topic.status === "COMPLETED";
                      return (
                        <tr key={topic.id} className={isDone ? "editalTopicRowCompleted" : undefined}>
                          <td className="editalTopicCell">
                            <StudySessionCompletionToggle topicId={topic.id} checked={isDone} />
                            <span>{topic.title}</span>
                          </td>
                          <td>{topic.correct}</td>
                          <td>{topic.wrong}</td>
                          <td>{topic.questions}</td>
                          <td>
                            <span className={`editalScoreBadge ${scoreClass(topic.performance)}`}>{topic.performance}</span>
                          </td>
                          <td>{topic.lastDateLabel}</td>
                          <td>
                            <TopicQuestionManualForm planId={planId} subjectId={subject.id} topicId={topic.id} />
                          </td>
                          <td>
                            <TopicLinksManager topicId={topic.id} initialDescription={topic.description} />
                          </td>
                          <td>
                            <TopicFilesManager topicId={topic.id} initialCount={topic.attachmentsCount} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="editalTotalLabel">TOTAL</td>
                      <td>{subject.correct}</td>
                      <td>{subject.wrong}</td>
                      <td>{subject.questions}</td>
                      <td>
                        <span className={`editalScoreBadge ${scoreClass(subject.performance)}`}>{subject.performance}</span>
                      </td>
                      <td colSpan={4}>
                        <div className="editalFooterProgress">
                          <span>PROGRESSO</span>
                          <div className="editalMiniProgress">
                            <span style={{ width: `${subject.progress}%` }} />
                          </div>
                          <b>{subject.progress}%</b>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="editalMobileTopicList">
                {subject.topics.map((topic) => {
                  const isDone = topic.status === "COMPLETED";
                  return (
                    <article key={`${topic.id}-mobile`} className={`editalMobileTopicCard ${isDone ? "done" : ""}`}>
                      <header className="editalMobileTopicHeader">
                        <div className="editalTopicCell">
                          <StudySessionCompletionToggle topicId={topic.id} checked={isDone} />
                          <strong>{topic.title}</strong>
                        </div>
                        <span className={`editalScoreBadge ${scoreClass(topic.performance)}`}>{topic.performance}%</span>
                      </header>

                      <div className="editalMobileTopicStats">
                        <span>✓ {topic.correct}</span>
                        <span>✕ {topic.wrong}</span>
                        <span>Q {topic.questions}</span>
                        <span>Data {topic.lastDateLabel}</span>
                      </div>

                      <div className="editalMobileTopicActions">
                        <TopicQuestionManualForm planId={planId} subjectId={subject.id} topicId={topic.id} />
                        <TopicLinksManager topicId={topic.id} initialDescription={topic.description} />
                        <TopicFilesManager topicId={topic.id} initialCount={topic.attachmentsCount} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
