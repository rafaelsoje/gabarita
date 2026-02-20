import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ExamResultsEvolutionChart } from "@/components/exam-results-evolution-chart";
import { ExamPdfPicker } from "@/components/exam-pdf-picker";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { isFormDataFileLike } from "@/lib/http/form-data-file";
import { prisma } from "@/lib/prisma";
import {
  deleteExamResult,
  listExamResults,
  saveExamResult,
  type StoredExamResultStatus
} from "@/lib/storage/exam-results";

type ProvasPageProps = {
  searchParams: Promise<{
    planId?: string;
    status?: string;
    board?: string;
    start?: string;
    end?: string;
  }>;
};

const STATUS_OPTIONS: Array<{ value: StoredExamResultStatus; label: string }> = [
  { value: "PENDING_RESULT", label: "Aguardando resultado" },
  { value: "APPROVED", label: "Aprovado" },
  { value: "CLASSIFIED", label: "Classificado" },
  { value: "NOT_CLASSIFIED", label: "Não classificado" }
];
const MAX_EXAM_PDF_BYTES = 12 * 1024 * 1024;

export default async function ProvasPage({ searchParams }: ProvasPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const requestedPlanId = (params.planId ?? "").trim();
  const statusFilter = normalizeStatusFilter(params.status);
  const boardFilter = normalizeBoardName(params.board ?? "");
  const startFilter = normalizeDateInput(params.start);
  const endFilter = normalizeDateInput(params.end);

  const plans = await prisma.plan.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true }
  });
  const registeredBoardNames = await loadRegisteredBoardNames(userId);
  const safePlanId = plans.some((plan) => plan.id === requestedPlanId) ? requestedPlanId : "";

  const allExamResults = await listExamResults(userId, 3000);
  const boardOptions = Array.from(
    new Set([...registeredBoardNames, ...allExamResults.map((item) => normalizeBoardName(item.boardName)).filter(Boolean)])
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filteredExamResults = allExamResults.filter((item) => {
    if (safePlanId && item.planId !== safePlanId) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (boardFilter && normalizeBoardName(item.boardName) !== boardFilter) return false;
    if (startFilter && (!item.examDate || item.examDate < startFilter)) return false;
    if (endFilter && (!item.examDate || item.examDate > endFilter)) return false;
    return true;
  });

  const totalExams = filteredExamResults.length;
  const scored = filteredExamResults.filter((item) => typeof item.score === "number");
  const avgScore = scored.length > 0 ? scored.reduce((acc, item) => acc + (item.score ?? 0), 0) / scored.length : 0;
  const bestScore = scored.length > 0 ? Math.max(...scored.map((item) => item.score ?? 0)) : 0;
  const distanceItems = filteredExamResults.filter((item) => typeof item.score === "number" && typeof item.cutoffScore === "number");
  const avgDistanceToCutoff =
    distanceItems.length > 0
      ? distanceItems.reduce((acc, item) => acc + ((item.score ?? 0) - (item.cutoffScore ?? 0)), 0) / distanceItems.length
      : 0;
  const percentileItems = filteredExamResults.filter(
    (item) => typeof item.rankPosition === "number" && typeof item.totalParticipants === "number" && (item.totalParticipants ?? 0) > 0
  );
  const avgPercentile =
    percentileItems.length > 0
      ? percentileItems.reduce((acc, item) => {
          const rank = item.rankPosition ?? 0;
          const total = item.totalParticipants ?? 1;
          const pct = ((total - rank + 1) / total) * 100;
          return acc + Math.max(0, Math.min(100, pct));
        }, 0) / percentileItems.length
      : 0;
  const chartPoints = filteredExamResults
    .map((item) => {
      const dateKey = item.examDate || item.createdAt.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
      return {
        dateKey,
        label: formatDateLabel(dateKey),
        score: typeof item.score === "number" ? item.score : null,
        distanceToCutoff:
          typeof item.score === "number" && typeof item.cutoffScore === "number"
            ? item.score - item.cutoffScore
            : null,
        percentile:
          typeof item.rankPosition === "number" && typeof item.totalParticipants === "number" && item.totalParticipants > 0
            ? Math.max(0, Math.min(100, ((item.totalParticipants - item.rankPosition + 1) / item.totalParticipants) * 100))
            : null
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));

  async function createExamResultAction(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = String(formData.get("planId") ?? "").trim();
    const examNameRaw = String(formData.get("examName") ?? "").trim();
    const boardNameRaw = String(formData.get("boardName") ?? "").trim();
    const examDateRaw = String(formData.get("examDate") ?? "").trim();
    const scoreRaw = String(formData.get("score") ?? "").trim();
    const cutoffRaw = String(formData.get("cutoffScore") ?? "").trim();
    const rankRaw = String(formData.get("rankPosition") ?? "").trim();
    const participantsRaw = String(formData.get("totalParticipants") ?? "").trim();
    const approvedRaw = String(formData.get("totalApproved") ?? "").trim();
    const statusRaw = String(formData.get("status") ?? "").trim();
    const notesRaw = String(formData.get("notes") ?? "").trim();
    const examPdf = formData.get("examPdf");

    if (!examNameRaw) redirect("/provas?toast=action_error");

    const selectedPlan =
      planIdRaw.length > 0
        ? await prisma.plan.findFirst({
            where: { id: planIdRaw, userId: currentUserId, isArchived: false },
            select: { id: true, title: true }
          })
        : null;

    let sourceFile:
      | {
          originalName: string;
          mimeType: string;
          bytes: Buffer;
        }
      | null = null;
    if (isFormDataFileLike(examPdf) && examPdf.size > 0) {
      const mimeType = examPdf.type || "application/octet-stream";
      if (mimeType !== "application/pdf") redirect("/provas?toast=exam_result_file_invalid");
      if (examPdf.size > MAX_EXAM_PDF_BYTES) redirect("/provas?toast=exam_result_file_too_large");
      sourceFile = {
        originalName: examPdf.name || "prova.pdf",
        mimeType,
        bytes: Buffer.from(await examPdf.arrayBuffer())
      };
    }

    await saveExamResult({
      userId: currentUserId,
      planId: selectedPlan?.id ?? null,
      planTitle: selectedPlan?.title ?? null,
      examName: examNameRaw,
      boardName: normalizeBoardName(boardNameRaw) || null,
      examDate: normalizeDateInput(examDateRaw),
      score: parseNullableDecimal(scoreRaw),
      cutoffScore: parseNullableDecimal(cutoffRaw),
      rankPosition: parseNullableInt(rankRaw),
      totalParticipants: parseNullableInt(participantsRaw),
      totalApproved: parseNullableInt(approvedRaw),
      status: normalizeStatus(statusRaw),
      notes: notesRaw || null,
      sourceFile
    });

    revalidatePath("/provas");
    redirect("/provas?toast=exam_result_saved");
  }

  async function deleteExamResultAction(formData: FormData) {
    "use server";
    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const examResultId = String(formData.get("examResultId") ?? "").trim();
    if (!examResultId) redirect("/provas?toast=action_error");

    const deleted = await deleteExamResult(currentUserId, examResultId);
    if (!deleted) redirect("/provas?toast=action_error");

    revalidatePath("/provas");
    redirect("/provas?toast=exam_result_deleted");
  }

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Provas realizadas</h1>
          <p>Registre resultados reais para acompanhar evolução de nota, classificação e distância da corte.</p>
        </div>
      </section>

      <section className="dashboardCard historyFiltersCard">
        <form method="get" className="historyFiltersForm">
          <label className="historyFilterField">
            <span>Plano</span>
            <select name="planId" defaultValue={safePlanId}>
              <option value="">Todos os planos</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </label>
          <label className="historyFilterField">
            <span>Status</span>
            <select name="status" defaultValue={statusFilter}>
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label className="historyFilterField">
            <span>Banca</span>
            <select name="board" defaultValue={boardFilter}>
              <option value="">Todas</option>
              {boardOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="historyFilterField">
            <span>Início</span>
            <input type="date" name="start" defaultValue={startFilter} />
          </label>
          <label className="historyFilterField">
            <span>Fim</span>
            <input type="date" name="end" defaultValue={endFilter} />
          </label>
          <div className="historyActions">
            <button type="submit" className="button">
              Filtrar
            </button>
            <Link href="/provas" className="secondaryBtn">
              Limpar
            </Link>
          </div>
        </form>
      </section>

      <section className="provasMetricsGrid">
        <article className="dashboardCard provasMetricCard">
          <small>Total de provas</small>
          <strong>{totalExams}</strong>
        </article>
        <article className="dashboardCard provasMetricCard">
          <small>Média de nota</small>
          <strong>{formatDecimal(avgScore)}</strong>
        </article>
        <article className="dashboardCard provasMetricCard">
          <small>Melhor nota</small>
          <strong>{formatDecimal(bestScore)}</strong>
        </article>
        <article className="dashboardCard provasMetricCard">
          <small>Média vs corte</small>
          <strong className={avgDistanceToCutoff >= 0 ? "score-good" : "score-bad"}>
            {avgDistanceToCutoff >= 0 ? "+" : ""}
            {formatDecimal(avgDistanceToCutoff)}
          </strong>
        </article>
        <article className="dashboardCard provasMetricCard">
          <small>Percentil médio</small>
          <strong>{formatDecimal(avgPercentile)}%</strong>
        </article>
      </section>

      <section className="dashboardCard homeChartCard">
        <header className="homePanelHeader">
          <h2>Evolução em provas</h2>
          <p>Nota final, distância da nota de corte e percentil ao longo do tempo.</p>
        </header>
        <ExamResultsEvolutionChart points={chartPoints} />
      </section>

      <section className="dashboardCard profileCard">
        <header className="questionsSectionHeader">
          <h2>Registrar resultado</h2>
          <p>Inclua dados da prova para consulta e comparação histórica.</p>
        </header>

        <form action={createExamResultAction} className="profileForm provasFormGrid">
          <label className="fieldLabel">
            Plano (opcional)
            <select name="planId" defaultValue="" className="input">
              <option value="">Sem plano</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </label>

          <label className="fieldLabel">
            Nome da prova
            <input name="examName" className="input" placeholder="Ex.: TJ-RJ Analista 2026" required maxLength={180} />
          </label>

          <label className="fieldLabel">
            Banca
            <input name="boardName" className="input" placeholder="Ex.: CEBRASPE" maxLength={120} list="provas-board-suggestions" />
            <datalist id="provas-board-suggestions">
              {boardOptions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>

          <label className="fieldLabel">
            Data da prova
            <input type="date" name="examDate" className="input" />
          </label>

          <label className="fieldLabel">
            Nota final
            <input type="number" step="0.01" min="0" max="1000" name="score" className="input" placeholder="0,00" />
          </label>

          <label className="fieldLabel">
            Nota de corte
            <input type="number" step="0.01" min="0" max="1000" name="cutoffScore" className="input" placeholder="0,00" />
          </label>

          <label className="fieldLabel">
            Colocação
            <input type="number" min="1" max="10000000" name="rankPosition" className="input" placeholder="Ex.: 128" />
          </label>

          <label className="fieldLabel">
            Total de inscritos
            <input type="number" min="1" max="10000000" name="totalParticipants" className="input" placeholder="Ex.: 5240" />
          </label>

          <label className="fieldLabel">
            Total de aprovados
            <input type="number" min="1" max="10000000" name="totalApproved" className="input" placeholder="Ex.: 220" />
          </label>

          <label className="fieldLabel">
            Status
            <select name="status" defaultValue="PENDING_RESULT" className="input">
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label className="fieldLabel provasFormFull">
            Observações
            <textarea
              name="notes"
              className="lineTextarea input"
              rows={3}
              maxLength={3000}
              placeholder="Lições aprendidas, erros críticos, estratégia para próxima prova."
            />
          </label>

          <label className="fieldLabel provasFormFull">
            PDF da prova (opcional)
            <ExamPdfPicker name="examPdf" />
            <small className="discursiveFieldHelper">Apenas PDF. Tamanho máximo: 12MB.</small>
          </label>

          <div className="profileActions">
            <button className="button" type="submit">
              Salvar resultado
            </button>
          </div>
        </form>
      </section>

      <section className="dashboardCard questionsListCard">
        <header className="questionsSectionHeader">
          <h2>Histórico de provas</h2>
          <p>{filteredExamResults.length} registro(s) no filtro atual.</p>
        </header>
        {filteredExamResults.length === 0 ? (
          <p className="emptyState">Nenhuma prova registrada com os filtros atuais.</p>
        ) : (
          <div className="questionsList provasList">
            {filteredExamResults.map((item) => (
              <article key={item.id} className="questionCard provasItem">
                <div className="provasItemMain">
                  <header className="questionCardHeader">
                    <strong>{item.examName}</strong>
                    <div className="questionMetaRow">
                      <span>{item.examDate ? formatDateBR(item.examDate) : "Data não informada"}</span>
                      <span>{item.boardName || "Banca não informada"}</span>
                      <span>{item.planTitle || "Sem plano"}</span>
                      <span>{statusLabel(item.status)}</span>
                    </div>
                  </header>
                  <div className="provasStatsRow">
                    <span className={`discursiveScoreBadge ${scoreToneClass(item.score)}`}>
                      Nota: {item.score === null ? "--" : formatDecimal(item.score)}
                    </span>
                    <span>Colocação: {item.rankPosition ?? "--"}</span>
                    <span>Inscritos: {item.totalParticipants ?? "--"}</span>
                    <span>Aprovados: {item.totalApproved ?? "--"}</span>
                    <span>
                      Corte: {item.cutoffScore === null ? "--" : formatDecimal(item.cutoffScore)}
                      {typeof item.score === "number" && typeof item.cutoffScore === "number"
                        ? ` (${item.score - item.cutoffScore >= 0 ? "+" : ""}${formatDecimal(item.score - item.cutoffScore)})`
                        : ""}
                    </span>
                  </div>
                  {item.notes ? <p className="libraryListMeta">{item.notes}</p> : null}
                </div>
                <div className="provasItemActions">
                  {item.sourceFile?.fileName ? (
                    <a className="secondaryBtn" href={`/api/exams/results/${item.id}/download`}>
                      Baixar PDF
                    </a>
                  ) : null}
                  <form>
                    <input type="hidden" name="examResultId" value={item.id} />
                    <ConfirmSubmitButton
                      className="dangerBtn"
                      label="Remover"
                      confirmTitle="Remover resultado"
                      confirmMessage="Deseja remover este resultado de prova?"
                      confirmActionLabel="Remover"
                      formAction={deleteExamResultAction}
                    />
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function normalizeStatusFilter(value: string | undefined) {
  const parsed = String(value ?? "").trim().toUpperCase();
  if (parsed === "APPROVED" || parsed === "CLASSIFIED" || parsed === "NOT_CLASSIFIED" || parsed === "PENDING_RESULT") {
    return parsed as StoredExamResultStatus;
  }
  return "";
}

function normalizeStatus(value: string | undefined): StoredExamResultStatus {
  const parsed = normalizeStatusFilter(value);
  if (!parsed) return "PENDING_RESULT";
  return parsed;
}

function normalizeDateInput(value: string | undefined) {
  const parsed = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return "";
  return parsed;
}

function parseNullableDecimal(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseNullableInt(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
}

function formatDateBR(dateString: string) {
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
}

function formatDateLabel(dateString: string) {
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;
  return `${day}/${month}`;
}

function statusLabel(status: StoredExamResultStatus) {
  if (status === "APPROVED") return "Aprovado";
  if (status === "CLASSIFIED") return "Classificado";
  if (status === "NOT_CLASSIFIED") return "Não classificado";
  return "Aguardando resultado";
}

function scoreToneClass(score: number | null) {
  if (typeof score !== "number") return "";
  if (score > 85) return "high";
  if (score < 75) return "low";
  return "warn";
}

async function loadRegisteredBoardNames(userId: string) {
  try {
    const ownBoards = await prisma.examBoardProfile.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: { name: true, normalizedName: true }
    });
    const source = ownBoards.length > 0
      ? ownBoards
      : await prisma.examBoardProfile.findMany({
          distinct: ["normalizedName"],
          orderBy: [{ normalizedName: "asc" }],
          select: { name: true, normalizedName: true }
        });

    return Array.from(
      new Set(
        source
          .map((item) => normalizeBoardName(item.name) || normalizeBoardName(item.normalizedName))
          .filter((value) => value.length >= 2)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch (error) {
    if (!hasMissingBoardSchema(error)) throw error;
    return [];
  }
}

function normalizeBoardName(value: string | null | undefined) {
  const raw = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  return raw.toUpperCase();
}

function hasMissingBoardSchema(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("ExamBoardProfile") ||
    error.message.includes("examBoardProfile") ||
    error.message.includes("ExamBoardStyle") ||
    error.message.includes("Unknown argument")
  );
}
