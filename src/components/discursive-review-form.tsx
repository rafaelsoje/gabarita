"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toastError, toastSuccess } from "@/components/app-toast";

type ReviewResult = {
  title: string;
  overallScore: number;
  summary: string;
  transcription: string;
  criteria: Array<{ name: string; score: number; feedback: string }>;
  strengths: string[];
  improvements: string[];
  correctedVersion: string;
  finalAdvice: string;
  model: string;
};

type DiscursiveReviewFormProps = {
  boardNames: string[];
};

type SubmissionListItem = {
  id: string;
  createdAt: string;
  rubric: string;
  title: string;
  overallScore: number;
  sourceType: "TEXT" | "IMAGE" | "PDF";
  model: string;
};

type SubmissionsResponse = {
  items: SubmissionListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rubrics: string[];
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["text/plain", "application/pdf"]);

export function DiscursiveReviewForm({ boardNames }: DiscursiveReviewFormProps) {
  const genericOption = "GENERICA";
  const normalizedBoards = useMemo(
    () =>
      Array.from(
        new Set(
          boardNames
            .map((name) => name.trim())
            .filter((name) => name.length >= 2 && name.toUpperCase() !== genericOption)
        )
      ),
    [boardNames]
  );
  const [rubric, setRubric] = useState(genericOption);
  const [proposedTheme, setProposedTheme] = useState("");
  const [essayText, setEssayText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [sourceType, setSourceType] = useState<"TEXT" | "IMAGE" | "PDF" | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [rubricFilter, setRubricFilter] = useState("");
  const [availableRubrics, setAvailableRubrics] = useState<string[]>([]);
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SubmissionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canSubmit = useMemo(() => {
    if (!rubric) return false;
    return essayText.trim().length >= 40 || !!file;
  }, [essayText, file, rubric]);
  const historyRubricOptions = useMemo(() => {
    const combined = new Set<string>();
    for (const item of normalizedBoards) combined.add(item);
    for (const item of availableRubrics) {
      const trimmed = item.trim();
      if (trimmed) combined.add(trimmed);
    }
    combined.add(genericOption);
    return Array.from(combined).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [availableRubrics, normalizedBoards]);

  const loadSubmissions = useCallback(
    async (page: number) => {
      setHistoryLoading(true);
      try {
        const query = new URLSearchParams();
        query.set("page", String(Math.max(1, page)));
        query.set("pageSize", "10");
        if (rubricFilter) query.set("rubric", rubricFilter);
        if (dateFromFilter) query.set("dateFrom", dateFromFilter);
        if (dateToFilter) query.set("dateTo", dateToFilter);

        const response = await fetch(`/api/discursive/submissions?${query.toString()}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as SubmissionsResponse | null;
        if (!response.ok || !Array.isArray(payload?.items)) {
          setSubmissions([]);
          setTotalSubmissions(0);
          setTotalPages(1);
          setCurrentPage(1);
          setAvailableRubrics([]);
          return;
        }
        setSubmissions(payload.items);
        setTotalSubmissions(Number.isFinite(payload.total) ? payload.total : payload.items.length);
        setTotalPages(Math.max(1, Number.isFinite(payload.totalPages) ? payload.totalPages : 1));
        setCurrentPage(Math.max(1, Number.isFinite(payload.page) ? payload.page : 1));
        setAvailableRubrics(Array.isArray(payload.rubrics) ? payload.rubrics : []);
      } catch {
        setSubmissions([]);
        setTotalSubmissions(0);
        setTotalPages(1);
        setCurrentPage(1);
        setAvailableRubrics([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [dateFromFilter, dateToFilter, rubricFilter]
  );

  useEffect(() => {
    void loadSubmissions(1);
  }, [loadSubmissions]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSourceType(null);

    try {
      const formData = new FormData();
      formData.set("rubric", rubric);
      formData.set("proposedTheme", proposedTheme);
      formData.set("essayText", essayText);
      if (file) formData.set("file", file);

      const response = await fetch("/api/discursive/review", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            sourceType?: "TEXT" | "IMAGE" | "PDF";
            result?: ReviewResult;
            submissionId?: string;
          }
        | null;

      if (!response.ok || !payload?.ok || !payload.result) {
        throw new Error(payload?.error || "Não foi possível corrigir a redação agora.");
      }

      setResult(payload.result);
      setSourceType(payload.sourceType ?? null);
      await loadSubmissions(currentPage);
      if (payload.submissionId) {
        toastSuccess("Discursiva", "Redação salva no histórico.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  function validateAndSetFile(nextFile: File | null, inputEl: HTMLInputElement) {
    if (!nextFile) {
      setFile(null);
      return;
    }

    const isAllowedType = nextFile.type.startsWith("image/") || ALLOWED_FILE_TYPES.has(nextFile.type);
    if (!isAllowedType) {
      toastError("Discursiva", "Formato inválido. Envie imagem, PDF ou TXT.");
      setFile(null);
      inputEl.value = "";
      return;
    }

    if (nextFile.size > MAX_FILE_BYTES) {
      toastError("Discursiva", "Arquivo maior que 8MB. Reduza o arquivo e tente novamente.");
      setFile(null);
      inputEl.value = "";
      return;
    }

    setFile(nextFile);
  }

  async function confirmRemoveSubmission() {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/discursive/submissions/${deleteTarget.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message || "Não foi possível remover a redação.");
      }
      toastSuccess("Discursiva", "Redação removida.");
      setDeleteTarget(null);
      await loadSubmissions(currentPage);
    } catch (removeError) {
      toastError("Discursiva", removeError instanceof Error ? removeError.message : "Falha ao remover redação.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <section className="dashboardCard discursivePanel">
        <form className="discursiveForm" onSubmit={handleSubmit}>
        <div className="discursiveGrid2">
          <label className="fieldLabel">
            Rubrica de correção
            <select value={rubric} onChange={(event) => setRubric(event.target.value)}>
              <option value={genericOption}>Genérica (concursos)</option>
              {normalizedBoards.map((boardName) => (
                <option key={boardName} value={boardName}>
                  {boardName}
                </option>
              ))}
            </select>
            {normalizedBoards.length > 0 ? (
              <small className="discursiveFieldHelper">
                Rubrica aplicada conforme banca selecionada.
              </small>
            ) : (
              <small className="discursiveFieldHelper">
                Você pode manter Genérica (concursos) ou cadastrar bancas em <Link href="/bancas">Bancas</Link>.
              </small>
            )}
          </label>
          <label className="fieldLabel">
            Tema proposto (opcional)
            <input
              type="text"
              placeholder="Ex.: Os desafios da segurança da informação no setor público"
              value={proposedTheme}
              onChange={(event) => setProposedTheme(event.target.value)}
            />
            <small className="discursiveFieldHelper" aria-hidden="true">
              &nbsp;
            </small>
          </label>
        </div>

        <label className="fieldLabel">
          Redação (texto)
          <textarea
            placeholder="Cole aqui a redação em texto. Se preferir, envie uma imagem legível abaixo."
            value={essayText}
            onChange={(event) => setEssayText(event.target.value)}
            rows={10}
          />
        </label>

        <label className="fieldLabel">
          Arquivo (opcional)
          <div className="discursiveFilePicker">
            <label className="discursiveFileBtn" htmlFor="discursive-file-input">
              Enviar arquivo
            </label>
            <input
              id="discursive-file-input"
              className="discursiveFileInput"
              type="file"
              accept="image/*,.txt,text/plain,application/pdf,.pdf"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                validateAndSetFile(nextFile, event.currentTarget);
              }}
            />
            <span className="discursiveFileName">{file?.name || "Nenhum arquivo selecionado"}</span>
          </div>
          <small>Formatos aceitos: imagem (.jpg/.png/.webp), PDF (.pdf) ou texto (.txt). Máximo 8MB.</small>
        </label>

        <div className="discursiveActions">
          <button className="button" type="submit" disabled={!canSubmit || loading}>
            {loading ? "Corrigindo..." : "Corrigir redação"}
          </button>
          <button
            className="secondaryBtn"
            type="button"
            onClick={() => {
              setEssayText("");
              setProposedTheme("");
              setFile(null);
              setError(null);
              setResult(null);
              setSourceType(null);
            }}
            disabled={loading}
          >
            Limpar
          </button>
        </div>

        {error ? <p className="formError">{error}</p> : null}
        </form>

        {result ? (
          <article className="discursiveResult">
          <header className="discursiveResultHeader">
            <div>
              <h2>{result.title}</h2>
              <p>{result.summary}</p>
            </div>
            <div className="discursiveScoreBox">
              <strong>{result.overallScore}</strong>
              <span>/100</span>
              <small>
                {sourceType === "IMAGE"
                  ? "Imagem + OCR LLM"
                  : sourceType === "PDF"
                    ? "PDF + análise LLM"
                    : "Texto"}
              </small>
              <small>Modelo: {result.model}</small>
            </div>
          </header>

          <div className="discursiveCriteriaGrid">
            {result.criteria.map((criterion, index) => (
              <article key={`${criterion.name}-${index}`} className="discursiveCriterion">
                <header>
                  <strong>{criterion.name}</strong>
                  <span>{criterion.score}/100</span>
                </header>
                <p>{criterion.feedback}</p>
              </article>
            ))}
          </div>

          <div className="discursiveTipsGrid">
            <article className="discursiveTipCard">
              <h3>Pontos fortes</h3>
              <ul>
                {result.strengths.map((item, index) => (
                  <li key={`strength-${index}`}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="discursiveTipCard">
              <h3>Melhorias prioritárias</h3>
              <ul>
                {result.improvements.map((item, index) => (
                  <li key={`improvement-${index}`}>{item}</li>
                ))}
              </ul>
            </article>
          </div>

          <article className="discursiveBlock">
            <h3>Versão sugerida</h3>
            <p>{result.correctedVersion}</p>
          </article>

          <article className="discursiveBlock">
            <h3>Transcrição analisada</h3>
            <p>{result.transcription}</p>
          </article>

          <p className="discursiveAdvice">{result.finalAdvice}</p>
          </article>
        ) : null}
      </section>

      <section className="dashboardCard discursiveHistoryCard">
        <header className="discursiveHistoryHeader">
          <h2>Redações enviadas</h2>
          <span>{totalSubmissions} redação(ões)</span>
        </header>
        <div className="discursiveHistoryFilters">
          <label className="fieldLabel">
            Banca
            <select value={rubricFilter} onChange={(event) => setRubricFilter(event.target.value)}>
              <option value="">Todas</option>
              {historyRubricOptions.map((rubric) => (
                <option key={rubric} value={rubric}>
                  {rubric}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldLabel">
            Data inicial
            <input type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} />
          </label>
          <label className="fieldLabel">
            Data final
            <input type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} />
          </label>
          <div className="discursiveHistoryFilterActions">
            <button
              className="secondaryBtn small"
              type="button"
              onClick={() => {
                setRubricFilter("");
                setDateFromFilter("");
                setDateToFilter("");
              }}
            >
              Limpar filtros
            </button>
          </div>
        </div>

        {historyLoading ? (
          <p className="emptyState">Carregando histórico...</p>
        ) : submissions.length === 0 ? (
          <p className="emptyState">Nenhuma redação enviada ainda.</p>
        ) : (
          <div className="discursiveHistoryList">
            {submissions.map((item) => (
              <article key={item.id} className="discursiveHistoryItem">
                <div className="discursiveHistoryMain">
                  <strong>{item.title}</strong>
                  <span>
                    {new Date(item.createdAt).toLocaleString("pt-BR")} · {item.rubric} · {item.sourceType}
                  </span>
                </div>
                <span className={`discursiveScoreBadge ${scoreToneClass(item.overallScore)}`}>{item.overallScore}</span>
                <div className="discursiveHistoryActions">
                  <a className="secondaryBtn small" href={`/api/discursive/submissions/${item.id}/download`}>
                    Download
                  </a>
                  <Link className="secondaryBtn small" href={`/discursiva/${item.id}`}>
                    Visualizar
                  </Link>
                  <button className="dangerBtn small" type="button" onClick={() => setDeleteTarget(item)}>
                    Remover
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="discursivePagination">
          <button
            className="secondaryBtn small"
            type="button"
            disabled={currentPage <= 1 || historyLoading}
            onClick={() => void loadSubmissions(currentPage - 1)}
          >
            Anterior
          </button>
          <span>
            Página {currentPage} de {totalPages}
          </span>
          <button
            className="secondaryBtn small"
            type="button"
            disabled={currentPage >= totalPages || historyLoading}
            onClick={() => void loadSubmissions(currentPage + 1)}
          >
            Próxima
          </button>
        </div>
      </section>

      {deleteTarget ? (
        <div className="modalBackdrop" role="presentation" onClick={() => (deleting ? null : setDeleteTarget(null))}>
          <section className="confirmDialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>Remover redação</h3>
            <p>Deseja remover esta redação do histórico?</p>
            <div className="confirmDialogActions">
              <button type="button" className="secondaryBtn" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancelar
              </button>
              <button type="button" className="dangerBtn confirmDangerBtn" onClick={() => void confirmRemoveSubmission()} disabled={deleting}>
                {deleting ? "Removendo..." : "Remover"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function scoreToneClass(score: number) {
  if (score > 85) return "high";
  if (score < 75) return "low";
  return "warn";
}
