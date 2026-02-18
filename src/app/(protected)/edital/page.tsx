import { redirect } from "next/navigation";
import { TopicStatus } from "@prisma/client";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { EditalAccordion } from "@/components/edital-accordion";
import { OpenStudyRegisterButton } from "@/components/open-study-register-button";
import { SubjectPlanSelector } from "@/components/subject-plan-selector";

type EditalPageProps = {
  searchParams: Promise<{ planId?: string }>;
};

function formatDate(value: Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function safePct(correct: number, wrong: number) {
  const total = Math.max(0, correct) + Math.max(0, wrong);
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

type TopicStats = {
  correct: number;
  wrong: number;
  blank: number;
  questions: number;
  performance: number;
  lastDate: Date | null;
};

export default async function EditalPage({ searchParams }: EditalPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const requestedPlanId = typeof params.planId === "string" ? params.planId : "";

  const plans = await prisma.plan.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      imageUrl: true
    }
  });

  if (plans.length === 0) {
    return (
      <main className="dashboard">
        <section className="dashboardCard dashboardHeader">
          <div>
            <h1>Edital Verticalizado</h1>
            <p>Crie um plano para visualizar o edital.</p>
          </div>
        </section>
      </main>
    );
  }

  const selectedPlanId = plans.some((plan) => plan.id === requestedPlanId) ? requestedPlanId : plans[0].id;
  const selectedPlan = await prisma.plan.findFirst({
    where: {
      id: selectedPlanId,
      userId,
      isArchived: false
    },
    include: {
      subjects: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
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
      }
    }
  });

  if (!selectedPlan) redirect("/edital");

  const groupedByTopic = await prisma.studySession.groupBy({
    by: ["topicId"],
    where: {
      userId,
      OR: [
        { planId: selectedPlan.id },
        {
          planId: null,
          subject: {
            is: { planId: selectedPlan.id }
          }
        }
      ],
      topicId: { not: null }
    },
    _sum: {
      questionsCorrect: true,
      questionsWrong: true,
      questionsBlank: true
    },
    _max: {
      startedAt: true
    }
  });

  const questionResponses = await prisma.questionResponse.findMany({
    where: {
      userId,
      question: {
        topicId: { not: null },
        topic: {
          is: {
            subject: {
              planId: selectedPlan.id
            }
          }
        }
      }
    },
    select: {
      isCorrect: true,
      selectedOptionId: true,
      createdAt: true,
      question: {
        select: {
          topicId: true
        }
      }
    }
  });

  const studyStatsByTopicId = new Map<string, TopicStats>(
    groupedByTopic
      .filter((row) => !!row.topicId)
      .map((row) => [
        row.topicId as string,
        {
          correct: row._sum.questionsCorrect ?? 0,
          wrong: row._sum.questionsWrong ?? 0,
          blank: row._sum.questionsBlank ?? 0,
          questions: (row._sum.questionsCorrect ?? 0) + (row._sum.questionsWrong ?? 0) + (row._sum.questionsBlank ?? 0),
          performance: safePct(row._sum.questionsCorrect ?? 0, row._sum.questionsWrong ?? 0),
          lastDate: row._max.startedAt
        }
      ])
  );

  const responseStatsByTopicId = new Map<string, TopicStats>();
  for (const response of questionResponses) {
    const topicId = response.question.topicId;
    if (!topicId) continue;

    const current = responseStatsByTopicId.get(topicId) ?? {
      correct: 0,
      wrong: 0,
      blank: 0,
      questions: 0,
      performance: 0,
      lastDate: null
    };

    if (response.selectedOptionId) {
      if (response.isCorrect) current.correct += 1;
      else current.wrong += 1;
    } else {
      current.blank += 1;
    }

    current.questions += 1;
    if (!current.lastDate || response.createdAt > current.lastDate) current.lastDate = response.createdAt;
    responseStatsByTopicId.set(topicId, current);
  }

  const statsByTopicId = new Map<string, TopicStats>();
  for (const subject of selectedPlan.subjects) {
    for (const topic of subject.topics) {
      const fromStudy = studyStatsByTopicId.get(topic.id);
      const fromResponses = responseStatsByTopicId.get(topic.id);

      const correct = (fromStudy?.correct ?? 0) + (fromResponses?.correct ?? 0);
      const wrong = (fromStudy?.wrong ?? 0) + (fromResponses?.wrong ?? 0);
      const blank = (fromStudy?.blank ?? 0) + (fromResponses?.blank ?? 0);
      const questions = correct + wrong + blank;
      const studyLast = fromStudy?.lastDate ?? null;
      const responseLast = fromResponses?.lastDate ?? null;
      const lastDate =
        studyLast && responseLast ? (studyLast > responseLast ? studyLast : responseLast) : (studyLast ?? responseLast ?? null);

      statsByTopicId.set(topic.id, {
        correct,
        wrong,
        blank,
        questions,
        performance: safePct(correct, wrong),
        lastDate
      });
    }
  }

  const totalTopics = selectedPlan.subjects.reduce((acc, subject) => acc + subject.topics.length, 0);
  const completedTopics = selectedPlan.subjects.reduce(
    (acc, subject) => acc + subject.topics.filter((topic) => topic.status === TopicStatus.COMPLETED).length,
    0
  );
  const overallProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const planOptions = plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    imageUrl: plan.imageUrl,
    targetUrl: `/edital?planId=${plan.id}`
  }));

  const subjectRows = selectedPlan.subjects.map((subject) => {
    const subjectCorrect = subject.topics.reduce((acc, topic) => acc + (statsByTopicId.get(topic.id)?.correct ?? 0), 0);
    const subjectWrong = subject.topics.reduce((acc, topic) => acc + (statsByTopicId.get(topic.id)?.wrong ?? 0), 0);
    const subjectQuestions = subject.topics.reduce((acc, topic) => acc + (statsByTopicId.get(topic.id)?.questions ?? 0), 0);
    const subjectPct = safePct(subjectCorrect, subjectWrong);
    const subjectCompleted = subject.topics.filter((topic) => topic.status === TopicStatus.COMPLETED).length;
    const subjectProgress = subject.topics.length > 0 ? Math.round((subjectCompleted / subject.topics.length) * 100) : 0;

    return {
      id: subject.id,
      name: subject.name,
      color: subject.color,
      correct: subjectCorrect,
      wrong: subjectWrong,
      questions: subjectQuestions,
      performance: subjectPct,
      progress: subjectProgress,
      topics: subject.topics.map((topic) => {
        const stats = statsByTopicId.get(topic.id);
        return {
          id: topic.id,
          title: topic.title,
          status: topic.status,
          description: topic.description,
          attachmentsCount: topic._count.attachments,
          correct: stats?.correct ?? 0,
          wrong: stats?.wrong ?? 0,
          questions: stats?.questions ?? 0,
          performance: stats?.performance ?? 0,
          lastDateLabel: formatDate(stats?.lastDate)
        };
      })
    };
  });

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Edital Verticalizado</h1>
        </div>
        <div className="subjectDetailHeaderActions">
          <OpenStudyRegisterButton />
          <SubjectPlanSelector options={planOptions} currentPlanId={selectedPlan.id} />
        </div>
      </section>

      <section className="dashboardCard editalProgressCard">
        <div className="editalProgressHeader">
          <h3>PROGRESSO NO EDITAL</h3>
          <strong>{overallProgress}%</strong>
        </div>
        <p>
          {completedTopics} de {totalTopics} tópicos concluídos
        </p>
        <div className="editalProgressTrack" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overallProgress}>
          <span style={{ width: `${overallProgress}%` }} />
        </div>
      </section>

      <EditalAccordion subjects={subjectRows} planId={selectedPlan.id} />
    </main>
  );
}
