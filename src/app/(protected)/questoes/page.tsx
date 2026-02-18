import Link from "next/link";
import { Prisma, QuestionDifficulty, QuestionSourceType } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { normalizeBancaName, parseBancaFromPlanNotes } from "@/lib/questions/plan-notes";
import { QuestionPracticeForm } from "@/components/question-practice-form";
import { QuestionsGenerateModal } from "@/components/questions-generate-modal";
import { QuestionsFiltersForm } from "@/components/questions-filters-form";

type QuestionsPageProps = {
  searchParams: Promise<{
    planId?: string;
    subjectId?: string;
    topicId?: string;
    banca?: string;
    theme?: string;
    q?: string;
    page?: string;
    reason?: string;
  }>;
};

function toInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function difficultyLabel(value: QuestionDifficulty) {
  if (value === "EASY") return "FÁCIL";
  if (value === "HARD") return "DIFÍCIL";
  return "MÉDIO";
}

function sourceLabel(sourceType: QuestionSourceType, llmModel: string | null) {
  if (sourceType === "IMPORTED") return "Importada";
  if (sourceType === "MANUAL") return "Manual";
  if (llmModel) return `LLM · ${llmModel}`;
  return "Fallback local";
}

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

export default async function QuestionsPage({ searchParams }: QuestionsPageProps) {
  const PAGE_SIZE = 20;
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const selectedPlanId = (params.planId ?? "").trim();
  const selectedSubjectId = (params.subjectId ?? "").trim();
  const selectedTopicId = (params.topicId ?? "").trim();
  const selectedBanca = normalizeBancaName((params.banca ?? "").trim());
  const selectedTheme = (params.theme ?? "").trim();
  const selectedQuery = (params.q ?? "").trim();
  const page = toInt(params.page, 1, 1, 99999);
  const rawReason = (params.reason ?? "").trim();
  const technicalReasonRaw = rawReason ? decodeURIComponentSafe(rawReason).slice(0, 260) : "";
  const technicalReason = technicalReasonRaw ? formatLlmReason(technicalReasonRaw) : "";

  const plans = await prisma.plan.findMany({
    where: { userId, isArchived: false },
    select: { id: true, title: true, notes: true },
    orderBy: { createdAt: "desc" }
  });

  const planIds = new Set(plans.map((plan) => plan.id));
  const safePlanId = planIds.has(selectedPlanId) ? selectedPlanId : "";

  const subjects = await prisma.subject.findMany({
    where: {
      plan: { userId, isArchived: false },
      ...(safePlanId ? { planId: safePlanId } : {})
    },
    select: { id: true, name: true, planId: true },
    orderBy: { name: "asc" }
  });

  const subjectIds = new Set(subjects.map((subject) => subject.id));
  const safeSubjectId = subjectIds.has(selectedSubjectId) ? selectedSubjectId : "";

  const topics = await prisma.topic.findMany({
    where: {
      subject: { plan: { userId, isArchived: false } },
      ...(safeSubjectId ? { subjectId: safeSubjectId } : {})
    },
    select: { id: true, title: true, subjectId: true },
    orderBy: { title: "asc" }
  });

  const topicIds = new Set(topics.map((topic) => topic.id));
  const safeTopicId = topicIds.has(selectedTopicId) ? selectedTopicId : "";

  const keywordTerms = selectedQuery
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 8);

  const selectedSubjectName = subjects.find((subject) => subject.id === safeSubjectId)?.name ?? "";
  const selectedTopicTitle = topics.find((topic) => topic.id === safeTopicId)?.title ?? "";
  const filters: Prisma.QuestionWhereInput[] = [];
  if (safePlanId) filters.push({ planId: safePlanId });
  if (safeSubjectId) {
    filters.push({
      OR: [{ subjectId: safeSubjectId }, ...(selectedSubjectName ? [{ subjectLabel: selectedSubjectName }] : [])]
    });
  }
  if (safeTopicId) {
    filters.push({
      OR: [{ topicId: safeTopicId }, ...(selectedTopicTitle ? [{ topicLabel: selectedTopicTitle }] : [])]
    });
  }
  if (selectedBanca) filters.push({ banca: selectedBanca });
  if (selectedTheme) filters.push({ theme: { contains: selectedTheme, mode: "insensitive" } });
  if (selectedQuery) {
    filters.push({
      OR: [
        { statement: { contains: selectedQuery, mode: "insensitive" } },
        { subjectLabel: { contains: selectedQuery, mode: "insensitive" } },
        { topicLabel: { contains: selectedQuery, mode: "insensitive" } },
        { theme: { contains: selectedQuery, mode: "insensitive" } },
        ...(keywordTerms.length > 0 ? [{ keywords: { hasSome: keywordTerms } }] : [])
      ]
    });
  }

  const questionWhere: Prisma.QuestionWhereInput = {
    userId,
    ...(filters.length > 0 ? { AND: filters } : {})
  };

  const totalQuestions = await prisma.question.count({ where: questionWhere });
  const totalPages = Math.max(1, Math.ceil(totalQuestions / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const questions = await prisma.question.findMany({
    where: questionWhere,
    include: {
      subject: { select: { id: true, name: true } },
      topic: { select: { id: true, title: true } },
      options: { orderBy: { position: "asc" } }
    },
    orderBy: [{ createdAt: "desc" }],
    skip: offset,
    take: PAGE_SIZE
  });

  const boardProfiles = await prisma.examBoardProfile
    .findMany({
      where: { userId },
      select: { name: true },
      orderBy: { name: "asc" }
    })
    .catch(() => []);
  const boardNames = Array.from(
    new Set(
      [
        ...boardProfiles.map((item) => normalizeBancaName(item.name)),
        ...plans.map((plan) => parseBancaFromPlanNotes(plan.notes))
      ].filter(Boolean)
    )
  );
  const planBancaById = Object.fromEntries(plans.map((plan) => [plan.id, parseBancaFromPlanNotes(plan.notes)]));
  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Questões</h1>
          <p>Gere questões por disciplina/tópico, resolva e acompanhe seu desempenho.</p>
          {technicalReason ? (
            <p>
              Detalhe técnico: <span className={technicalReason.includes("failed") || technicalReason.includes("error") ? "errText" : "okText"}>{technicalReason}</span>
            </p>
          ) : null}
        </div>
        <div>
          <QuestionsGenerateModal
            plans={plans.map((plan) => ({ id: plan.id, title: plan.title }))}
            subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name, planId: subject.planId }))}
            topics={topics.map((topic) => ({ id: topic.id, title: topic.title, subjectId: topic.subjectId }))}
            defaultPlanId={safePlanId}
            defaultSubjectId={safeSubjectId}
            defaultTopicId={safeTopicId}
            defaultBanca={selectedBanca}
            boardNames={boardNames}
            planBancaById={planBancaById}
          />
        </div>
      </section>

      <section className="dashboardCard questionsFiltersCard">
        <QuestionsFiltersForm
          plans={plans.map((plan) => ({ id: plan.id, title: plan.title }))}
          subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name, planId: subject.planId }))}
          topics={topics.map((topic) => ({ id: topic.id, title: topic.title, subjectId: topic.subjectId }))}
          boardNames={boardNames}
          selectedPlanId={safePlanId}
          selectedSubjectId={safeSubjectId}
          selectedTopicId={safeTopicId}
          selectedBanca={selectedBanca}
          selectedTheme={selectedTheme}
          selectedQuery={selectedQuery}
        />
      </section>

      <section className="dashboardCard questionsListCard">
        <header className="questionsSectionHeader">
          <h2>Banco de questões</h2>
          <p>
            {questions.length} questão(ões) exibida(s) de {totalQuestions}. Página {safePage} de {totalPages}.
          </p>
        </header>

        {questions.length === 0 ? <p className="emptyState">Nenhuma questão encontrada com os filtros atuais.</p> : null}

        <div className="questionsList">
          {questions.map((question, index) => {
            return (
              <article key={question.id} className="questionCard">
                <div className="questionCardTop">
                  <span className="questionCardIndex">Questão {index + 1}</span>
                </div>
                <header className="questionCardHeader">
                  {(() => {
                    const structured = splitStructuredStatement(question.statement);
                    if (!structured) {
                      return (
                        <p className="questionStatementLead">
                          {question.statement}
                        </p>
                      );
                    }

                    return (
                      <div className="questionStatement">
                        {structured.intro ? <p className="questionStatementLead">{structured.intro}</p> : null}
                        <ul className="questionAssertions">
                          {structured.assertions.map((item, assertionIndex) => (
                            <li key={`${question.id}-${item.label}-${assertionIndex}`}>
                              <b>{item.label}.</b> {item.text}
                            </li>
                          ))}
                        </ul>
                        {structured.tail ? <p className="questionStatementTail">{structured.tail}</p> : null}
                      </div>
                    );
                  })()}
                  <div className="questionMetaRow">
                    <span>{difficultyLabel(question.difficulty)}</span>
                    <span>{sourceLabel(question.sourceType, question.llmModel ?? null)}</span>
                    <span>{question.banca ?? "Sem banca"}</span>
                    <span>{question.subject?.name ?? question.subjectLabel ?? "Sem disciplina"}</span>
                    <span>{question.topic?.title ?? question.topicLabel ?? "Sem tópico"}</span>
                    <span>{question.theme ?? "Sem tema"}</span>
                  </div>
                </header>

                <QuestionPracticeForm
                  questionId={question.id}
                  options={question.options.map((option) => ({
                    id: option.id,
                    label: option.label,
                    text: option.text
                  }))}
                />
              </article>
            );
          })}
        </div>

        {totalQuestions > PAGE_SIZE ? (
          <div className="libraryPagination">
            <Link
              className={`libraryPaginationBtn ${safePage <= 1 ? "disabled" : ""}`}
              href={buildQuestionsUrl({
                page: safePage - 1,
                planId: safePlanId,
                subjectId: safeSubjectId,
                topicId: safeTopicId,
                banca: selectedBanca,
                theme: selectedTheme,
                q: selectedQuery
              })}
            >
              Anterior
            </Link>
            <span className="libraryPaginationText">
              Página {safePage} de {totalPages}
            </span>
            <Link
              className={`libraryPaginationBtn ${safePage >= totalPages ? "disabled" : ""}`}
              href={buildQuestionsUrl({
                page: safePage + 1,
                planId: safePlanId,
                subjectId: safeSubjectId,
                topicId: safeTopicId,
                banca: selectedBanca,
                theme: selectedTheme,
                q: selectedQuery
              })}
            >
              Próxima
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function buildQuestionsUrl(params: {
  page: number;
  planId?: string;
  subjectId?: string;
  topicId?: string;
  banca?: string;
  theme?: string;
  q?: string;
}) {
  const query = new URLSearchParams();
  if (params.page > 1) query.set("page", String(params.page));
  if (params.planId) query.set("planId", params.planId);
  if (params.subjectId) query.set("subjectId", params.subjectId);
  if (params.topicId) query.set("topicId", params.topicId);
  if (params.banca) query.set("banca", params.banca);
  if (params.theme) query.set("theme", params.theme);
  if (params.q) query.set("q", params.q);
  const raw = query.toString();
  return raw ? `/questoes?${raw}` : "/questoes";
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasOpenAiQuotaError(reason: string) {
  const normalized = reason.toLowerCase();
  return normalized.includes("insufficient_quota") || normalized.includes("exceeded your current quota");
}

function formatLlmReason(reason: string) {
  if (hasOpenAiQuotaError(reason)) {
    return "Quota da OpenAI excedida. Atualize plano/saldo de billing para usar LLM.";
  }
  const normalized = reason.toLowerCase();
  if (normalized.includes("invalid_api_key")) {
    return "API key da OpenAI inválida. Revise em Preferências.";
  }
  if (normalized.includes("model_not_found")) {
    return "Modelo OpenAI não encontrado para sua conta.";
  }
  return reason;
}
