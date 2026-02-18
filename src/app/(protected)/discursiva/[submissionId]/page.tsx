import { notFound, redirect } from "next/navigation";
import { DiscursiveSubmissionInsights } from "@/components/discursive-submission-insights";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import {
  getDiscursiveSubmission,
  listDiscursiveSubmissions
} from "@/lib/storage/discursive-submissions";

type DiscursiveSubmissionPageProps = {
  params: Promise<{ submissionId: string }>;
};

export default async function DiscursiveSubmissionPage({ params }: DiscursiveSubmissionPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const { submissionId } = await params;
  const submission = await getDiscursiveSubmission(userId, submissionId);
  if (!submission) notFound();
  const recentSubmissions = await listDiscursiveSubmissions(userId, 30);
  const recurringItems = buildRecurringChecklist(recentSubmissions, submissionId);
  const originalText =
    submission.originalText?.trim() || submission.transcription?.trim() || "Texto original não disponível.";

  return (
    <main className="dashboard">
      <section className="dashboardCard discursiveResult">
        <header className="discursiveResultHeader">
          <div>
            <h2>{submission.title}</h2>
            <p>{submission.summary}</p>
          </div>
          <div className="discursiveScoreBox">
            <strong>{submission.overallScore}</strong>
            <span>/100</span>
            <small>{submission.sourceType === "IMAGE" ? "Imagem + OCR LLM" : submission.sourceType === "PDF" ? "PDF + análise LLM" : "Texto"}</small>
            <small>Modelo: {submission.model}</small>
          </div>
        </header>

        <div className="discursiveCriteriaGrid">
          {submission.criteria.map((criterion, index) => (
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
              {submission.strengths.map((item, index) => (
                <li key={`strength-${index}`}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="discursiveTipCard">
            <h3>Melhorias prioritárias</h3>
            <ul>
              {submission.improvements.map((item, index) => (
                <li key={`improvement-${index}`}>{item}</li>
              ))}
            </ul>
          </article>
        </div>

        <article className="discursiveBlock">
          <h3>Tema proposto</h3>
          <p>{submission.proposedTheme || "Não informado"}</p>
        </article>

        <article className="discursiveBlock">
          <h3>Comparativo: original x versão sugerida</h3>
          <div className="discursiveCompareGrid">
            <section className="discursiveComparePanel">
              <h4>Texto original</h4>
              <p>{originalText}</p>
            </section>
            <section className="discursiveComparePanel">
              <h4>Versão sugerida</h4>
              <p>{submission.correctedVersion}</p>
            </section>
          </div>
        </article>

        <DiscursiveSubmissionInsights submissionId={submission.id} recurringItems={recurringItems} />

        <article className={`discursiveAdvice ${scoreToneClass(submission.overallScore)}`}>
          {renderFinalAdvice(submission.finalAdvice)}
        </article>
      </section>
    </main>
  );
}

function scoreToneClass(score: number) {
  if (score > 85) return "high";
  if (score < 75) return "low";
  return "warn";
}

type RecurringItem = {
  text: string;
  count: number;
  fromCurrent: boolean;
};

function buildRecurringChecklist(
  submissions: Array<{ id: string; improvements: string[] }>,
  currentId: string
): RecurringItem[] {
  const counts = new Map<string, { text: string; count: number; fromCurrent: boolean }>();

  for (const submission of submissions) {
    const items = Array.isArray(submission.improvements) ? submission.improvements : [];
    const uniquePerSubmission = new Set<string>();
    for (const item of items) {
      const cleaned = String(item ?? "").trim();
      if (!cleaned) continue;
      const key = normalizeImprovementKey(cleaned);
      if (!key || uniquePerSubmission.has(key)) continue;
      uniquePerSubmission.add(key);

      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        if (submission.id === currentId) existing.fromCurrent = true;
      } else {
        counts.set(key, {
          text: cleaned,
          count: 1,
          fromCurrent: submission.id === currentId
        });
      }
    }
  }

  return Array.from(counts.values())
    .filter((item) => item.count >= 2 || item.fromCurrent)
    .sort((a, b) => (a.count === b.count ? Number(b.fromCurrent) - Number(a.fromCurrent) : b.count - a.count))
    .slice(0, 8);
}

function normalizeImprovementKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function renderFinalAdvice(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return <p>Sem recomendação final.</p>;

  if (!/\(\d+\)/.test(raw)) {
    return <p>{raw}</p>;
  }

  const chunks = raw.split(/\(\d+\)\s*/).map((item) => item.trim()).filter(Boolean);
  if (chunks.length <= 1) {
    return <p>{raw}</p>;
  }

  const leadText = chunks[0];
  const items = chunks.slice(1);

  return (
    <>
      {leadText ? <p className="discursiveAdviceLead">{leadText}</p> : null}
      <ol className="discursiveAdviceList">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ol>
    </>
  );
}
