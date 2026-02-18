import { redirect } from "next/navigation";
import { TopicStatus } from "@prisma/client";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { OpenStudyRegisterButton } from "@/components/open-study-register-button";
import { StudySessionCompletionToggle } from "@/components/study-session-completion-toggle";
import { StudySessionRowActions } from "@/components/study-session-row-actions";
import { SubjectPlanSelector } from "@/components/subject-plan-selector";
import { TopicLinksManager } from "@/components/topic-links-manager";
import { TopicFilesManager } from "@/components/topic-files-manager";
import { SubjectEvolutionChart } from "@/components/subject-evolution-chart";

type SubjectDetailPageProps = {
  params: Promise<{ subjectId: string }>;
};

function formatDuration(totalMinutes: number) {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}min`;
}

function formatClock(totalMinutes: number) {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

function categoryLabel(category: "THEORY" | "PRACTICE" | "REVIEW" | "MOCK_EXAM") {
  if (category === "THEORY") return "TEORIA";
  if (category === "PRACTICE") return "PRÁTICA";
  if (category === "REVIEW") return "REVISÃO";
  return "SIMULADO";
}

function categoryClass(category: "THEORY" | "PRACTICE" | "REVIEW" | "MOCK_EXAM") {
  if (category === "THEORY") return "theory";
  if (category === "PRACTICE") return "practice";
  if (category === "REVIEW") return "review";
  return "mock";
}

function scoreClass(score: number) {
  if (score >= 90) return "score-good";
  if (score >= 70) return "score-warn";
  return "score-bad";
}

function parseSessionNotes(notes: string | null) {
  if (!notes) return { material: "-", comment: null as string | null, pagesStart: null as number | null, pagesEnd: null as number | null };
  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { material: "-", comment: null as string | null, pagesStart: null as number | null, pagesEnd: null as number | null };

  let pagesStart: number | null = null;
  let pagesEnd: number | null = null;
  const bodyLines = lines.filter((line) => {
    if (!line.startsWith("@meta ")) return true;
    const tokens = line.slice("@meta ".length).split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const [key, rawValue] = token.split("=");
      const value = Number.parseInt(rawValue ?? "", 10);
      if (!Number.isFinite(value)) continue;
      if (key === "pagesStart") pagesStart = value;
      if (key === "pagesEnd") pagesEnd = value;
    }
    return false;
  });

  if (bodyLines.length === 0) return { material: "-", comment: null as string | null, pagesStart, pagesEnd };

  const first = bodyLines[0];
  if (first.startsWith("Material:")) {
    const material = first.slice("Material:".length).trim() || "-";
    const comment = bodyLines.slice(1).join("\n").trim() || null;
    return { material, comment, pagesStart, pagesEnd };
  }

  return { material: "-", comment: bodyLines.join("\n") || null, pagesStart, pagesEnd };
}

export default async function SubjectDetailPage({ params }: SubjectDetailPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const { subjectId } = await params;

  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      plan: {
        userId,
        isArchived: false
      }
    },
    include: {
      plan: {
        select: {
          id: true,
          title: true
        }
      },
      topics: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          status: true,
          description: true,
          _count: {
            select: {
              attachments: true
            }
          }
        }
      }
    }
  });

  if (!subject) redirect("/disciplinas");

  const planOptionsRaw = await prisma.plan.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      subjects: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true },
        take: 1
      }
    }
  });

  const planOptions = planOptionsRaw.map((plan) => ({
    id: plan.id,
    title: plan.title,
    imageUrl: plan.imageUrl,
    targetUrl: plan.subjects[0]?.id ? `/disciplinas/${plan.subjects[0].id}` : `/disciplinas?planId=${plan.id}`
  }));

  const [summary, sessions, topicStats, sessionsForChart] = await Promise.all([
    prisma.studySession.aggregate({
      where: {
        userId,
        subjectId: subject.id
      },
      _sum: {
        durationMinutes: true,
        questionsCorrect: true,
        questionsWrong: true,
        pagesRead: true,
        videoMinutes: true
      },
      _count: {
        id: true
      }
    }),
    prisma.studySession.findMany({
      where: {
        userId,
        subjectId: subject.id
      },
      orderBy: {
        startedAt: "desc"
      },
      take: 20,
      include: {
        topic: {
          select: {
            id: true,
            title: true,
            status: true
          }
        }
      }
    }),
    prisma.studySession.groupBy({
      by: ["topicId"],
      where: {
        userId,
        subjectId: subject.id,
        topicId: { not: null }
      },
      _sum: {
        questionsCorrect: true,
        questionsWrong: true
      },
      _max: {
        startedAt: true
      }
    }),
    prisma.studySession.findMany({
      where: {
        userId,
        subjectId: subject.id
      },
      orderBy: {
        startedAt: "asc"
      },
      select: {
        startedAt: true,
        durationMinutes: true,
        questionsCorrect: true,
        questionsWrong: true
      }
    })
  ]);

  const totalMinutes = summary._sum.durationMinutes ?? 0;
  const totalCorrect = summary._sum.questionsCorrect ?? 0;
  const totalWrong = summary._sum.questionsWrong ?? 0;
  const totalPages = summary._sum.pagesRead ?? 0;
  const totalVideos = summary._sum.videoMinutes ?? 0;
  const resolvedQuestions = totalCorrect + totalWrong;
  const performance = resolvedQuestions > 0 ? Math.round((totalCorrect / resolvedQuestions) * 100) : 0;
  const completedTopics = subject.topics.filter((topic) => topic.status === TopicStatus.COMPLETED).length;
  const progress = subject.topics.length > 0 ? Math.round((completedTopics / subject.topics.length) * 100) : 0;
  const pagesPerHour = totalMinutes > 0 ? (totalPages / (totalMinutes / 60)).toFixed(1) : "0.0";
  const topicStatMap = new Map(
    topicStats
      .filter((row) => !!row.topicId)
      .map((row) => [
        row.topicId as string,
        {
          correct: row._sum.questionsCorrect ?? 0,
          wrong: row._sum.questionsWrong ?? 0,
          lastDate: row._max.startedAt
        }
      ])
  );

  const timelineMap = new Map<string, { dateKey: string; label: string; minutes: number; questions: number }>();
  for (const session of sessionsForChart) {
    const date = new Date(session.startedAt);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    const label = `${d}/${m}`;
    const current = timelineMap.get(key) ?? { dateKey: key, label, minutes: 0, questions: 0 };
    current.minutes += Math.max(0, session.durationMinutes);
    current.questions += Math.max(0, session.questionsCorrect + session.questionsWrong);
    timelineMap.set(key, current);
  }
  const timelinePoints = Array.from(timelineMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, value]) => value)
    .slice(-30);

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1 className="planHeaderTitle">{subject.name}</h1>
          <p>{subject.plan.title}</p>
        </div>
        <div className="subjectDetailHeaderActions">
          <OpenStudyRegisterButton subjectId={subject.id} subjectName={subject.name} />
          <SubjectPlanSelector options={planOptions} currentPlanId={subject.plan.id} />
        </div>
      </section>

      <section className="subjectDetailStatsGrid">
        <article className="dashboardCard">
          <h3>TEMPO DE ESTUDO</h3>
          <p className="subjectDetailBigNumber">{formatDuration(totalMinutes)}</p>
        </article>
        <article className="dashboardCard">
          <h3>DESEMPENHO</h3>
          <p>
            <span className="okText">{totalCorrect} acertos</span>
          </p>
          <p>
            <span className="errText">{totalWrong} erros</span>
          </p>
          <p className="subjectDetailBigNumber">{performance}%</p>
        </article>
        <article className="dashboardCard">
          <h3>PROGRESSO NO EDITAL</h3>
          <p>
            <span className="okText">{completedTopics} tópicos concluídos</span>
          </p>
          <p>
            <span className="errText">{Math.max(0, subject.topics.length - completedTopics)} tópicos pendentes</span>
          </p>
          <p className="subjectDetailBigNumber">{progress}%</p>
        </article>
        <article className="dashboardCard">
          <h3>PÁGINAS LIDAS</h3>
          <p>{pagesPerHour} páginas por hora</p>
          <p className="subjectDetailBigNumber">{totalPages}</p>
        </article>
      </section>

      <section className="dashboardCard subjectDetailHistoryCard">
        <h3>HISTÓRICO DE REGISTROS</h3>
        {sessions.length === 0 ? (
          <p className="emptyState">Ainda não há registros de estudo nessa disciplina.</p>
        ) : (
          <>
            <div className="subscriptionTableWrap subjectDetailDesktopTable">
              <table className="subscriptionTable subjectDetailHistoryTable">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Categoria</th>
                    <th>Tempo</th>
                    <th>✓</th>
                    <th>✕</th>
                    <th>%</th>
                    <th>Material</th>
                    <th>Tópico</th>
                    <th>Páginas</th>
                    <th>Vídeos</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => {
                    const qTotal = session.questionsCorrect + session.questionsWrong;
                    const pct = qTotal > 0 ? Math.round((session.questionsCorrect / qTotal) * 100) : 0;
                    const parsedNotes = parseSessionNotes(session.notes);
                    return (
                      <tr key={session.id}>
                        <td>{new Date(session.startedAt).toLocaleDateString("pt-BR")}</td>
                        <td>
                          <span className={`studyHistoryCategoryBadge ${categoryClass(session.category)}`}>
                            {categoryLabel(session.category)}
                          </span>
                        </td>
                        <td>{formatClock(session.durationMinutes)}</td>
                        <td>{session.questionsCorrect}</td>
                        <td>{session.questionsWrong}</td>
                        <td>
                          <span className={`editalScoreBadge ${scoreClass(pct)}`}>{pct}</span>
                        </td>
                        <td>{parsedNotes.material}</td>
                        <td>{session.topic?.title || "-"}</td>
                        <td>{session.pagesRead}</td>
                        <td>{formatClock(session.videoMinutes)}</td>
                        <td>
                          <StudySessionRowActions
                            comment={parsedNotes.comment}
                            editPayload={{
                              sessionId: session.id,
                              category: session.category,
                              studyDate: session.startedAt.toISOString(),
                              durationMinutes: session.durationMinutes,
                              subjectId: subject.id,
                              subjectName: subject.name,
                              topicId: session.topic?.id ?? null,
                              topicTitle: session.topic?.title ?? null,
                              material: parsedNotes.material === "-" ? "" : parsedNotes.material,
                              comment: parsedNotes.comment ?? "",
                              questionsCorrect: session.questionsCorrect,
                              questionsWrong: session.questionsWrong,
                              pagesRead: session.pagesRead,
                              pagesStart: parsedNotes.pagesStart,
                              pagesEnd: parsedNotes.pagesEnd,
                              videoMinutes: session.videoMinutes
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="subjectDetailMobileList">
              {sessions.map((session) => {
                const qTotal = session.questionsCorrect + session.questionsWrong;
                const pct = qTotal > 0 ? Math.round((session.questionsCorrect / qTotal) * 100) : 0;
                const parsedNotes = parseSessionNotes(session.notes);
                return (
                  <article key={`mobile-${session.id}`} className="subjectDetailMobileCard">
                    <header className="subjectDetailMobileHeader">
                      <strong>{new Date(session.startedAt).toLocaleDateString("pt-BR")}</strong>
                      <span className={`studyHistoryCategoryBadge ${categoryClass(session.category)}`}>{categoryLabel(session.category)}</span>
                    </header>
                    <div className="subjectDetailMobileStats">
                      <span>Tempo {formatClock(session.durationMinutes)}</span>
                      <span>✓ {session.questionsCorrect}</span>
                      <span>✕ {session.questionsWrong}</span>
                      <span>
                        % <b className={`editalScoreBadge ${scoreClass(pct)}`}>{pct}</b>
                      </span>
                      <span>Páginas {session.pagesRead}</span>
                      <span>Vídeos {formatClock(session.videoMinutes)}</span>
                    </div>
                    <div className="subjectDetailMobileMeta">
                      <p>
                        <b>Material:</b> {parsedNotes.material}
                      </p>
                      <p>
                        <b>Tópico:</b> {session.topic?.title || "-"}
                      </p>
                    </div>
                    <div className="subjectDetailMobileActions">
                      <StudySessionRowActions
                        comment={parsedNotes.comment}
                        editPayload={{
                          sessionId: session.id,
                          category: session.category,
                          studyDate: session.startedAt.toISOString(),
                          durationMinutes: session.durationMinutes,
                          subjectId: subject.id,
                          subjectName: subject.name,
                          topicId: session.topic?.id ?? null,
                          topicTitle: session.topic?.title ?? null,
                          material: parsedNotes.material === "-" ? "" : parsedNotes.material,
                          comment: parsedNotes.comment ?? "",
                          questionsCorrect: session.questionsCorrect,
                          questionsWrong: session.questionsWrong,
                          pagesRead: session.pagesRead,
                          pagesStart: parsedNotes.pagesStart,
                          pagesEnd: parsedNotes.pagesEnd,
                          videoMinutes: session.videoMinutes
                        }}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="dashboardCard subjectDetailEditalCard">
        <h3>EDITAL VERTICALIZADO</h3>
        {subject.topics.length === 0 ? (
          <p className="emptyState">Nenhum tópico cadastrado.</p>
        ) : (
          <>
            <div className="subscriptionTableWrap subjectDetailDesktopTable">
              <table className="subscriptionTable subjectDetailEditalTable">
                <thead>
                  <tr>
                    <th>Tópico</th>
                    <th>✓</th>
                    <th>✕</th>
                    <th>Status</th>
                    <th>Último estudo</th>
                    <th>Link</th>
                    <th>Arquivos</th>
                  </tr>
                </thead>
                <tbody>
                  {subject.topics.map((topic) => {
                    const row = topicStatMap.get(topic.id);
                    const isCompleted = topic.status === TopicStatus.COMPLETED;
                    return (
                      <tr key={topic.id} className={isCompleted ? "editalTopicRowCompleted" : undefined}>
                        <td>{topic.title}</td>
                        <td>{row?.correct ?? 0}</td>
                        <td>{row?.wrong ?? 0}</td>
                        <td>
                          <StudySessionCompletionToggle topicId={topic.id} checked={isCompleted} />
                        </td>
                        <td>{row?.lastDate ? new Date(row.lastDate).toLocaleDateString("pt-BR") : "-"}</td>
                        <td>
                          <TopicLinksManager topicId={topic.id} initialDescription={topic.description} />
                        </td>
                        <td>
                          <TopicFilesManager topicId={topic.id} initialCount={topic._count.attachments} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="subjectDetailMobileList">
              {subject.topics.map((topic) => {
                const row = topicStatMap.get(topic.id);
                const isCompleted = topic.status === TopicStatus.COMPLETED;
                return (
                  <article key={`mobile-topic-${topic.id}`} className={`subjectDetailMobileCard ${isCompleted ? "done" : ""}`}>
                    <header className="subjectDetailMobileHeader">
                      <strong>{topic.title}</strong>
                      <StudySessionCompletionToggle topicId={topic.id} checked={isCompleted} />
                    </header>
                    <div className="subjectDetailMobileStats">
                      <span>✓ {row?.correct ?? 0}</span>
                      <span>✕ {row?.wrong ?? 0}</span>
                      <span>Último estudo {row?.lastDate ? new Date(row.lastDate).toLocaleDateString("pt-BR") : "-"}</span>
                    </div>
                    <div className="subjectDetailMobileTopicActions">
                      <TopicLinksManager topicId={topic.id} initialDescription={topic.description} />
                      <TopicFilesManager topicId={topic.id} initialCount={topic._count.attachments} />
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="dashboardCard">
        <h3>EVOLUÇÃO NO TEMPO</h3>
        <SubjectEvolutionChart points={timelinePoints} />
      </section>

      <section className="dashboardCard subjectDetailFooter">
        <p>Vídeos assistidos: {formatDuration(totalVideos)}</p>
      </section>
    </main>
  );
}
