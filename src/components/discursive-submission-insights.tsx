"use client";

import { useMemo, useState } from "react";
import { toastError } from "@/components/app-toast";

type RecurringItem = {
  text: string;
  count: number;
  fromCurrent: boolean;
};

type TrainingPlanResponse = {
  plan?: string[];
  source?: "LLM" | "LOCAL";
  model?: string;
};

type DiscursiveSubmissionInsightsProps = {
  submissionId: string;
  recurringItems: RecurringItem[];
};

export function DiscursiveSubmissionInsights({
  submissionId,
  recurringItems
}: DiscursiveSubmissionInsightsProps) {
  const [planLoading, setPlanLoading] = useState(false);
  const [planItems, setPlanItems] = useState<string[]>([]);
  const [planSource, setPlanSource] = useState<"LLM" | "LOCAL" | null>(null);
  const [planModel, setPlanModel] = useState<string>("");

  const hasRecurringItems = recurringItems.length > 0;
  const hasPlan = planItems.length > 0;

  const planSourceLabel = useMemo(() => {
    if (!planSource) return "";
    if (planSource === "LLM") return `Plano gerado por LLM${planModel ? ` · ${planModel}` : ""}`;
    return "Plano local automático";
  }, [planModel, planSource]);

  async function generateTrainingPlan() {
    setPlanLoading(true);
    try {
      const response = await fetch(`/api/discursive/submissions/${submissionId}/training-plan`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as TrainingPlanResponse | null;
      if (!response.ok || !Array.isArray(payload?.plan)) {
        throw new Error("Não foi possível gerar o plano agora.");
      }

      const normalizedPlan = payload.plan
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, 7);
      setPlanItems(normalizedPlan);
      setPlanSource(payload?.source ?? "LOCAL");
      setPlanModel(String(payload?.model ?? ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao gerar plano.";
      toastError("Discursiva", message);
    } finally {
      setPlanLoading(false);
    }
  }

  return (
    <div className="discursiveInsightsGrid">
      <article className="discursiveBlock discursiveRecurringBlock">
        <header className="discursiveInsightsHeader">
          <h3>Checklist de erros recorrentes</h3>
        </header>
        {hasRecurringItems ? (
          <ul className="discursiveRecurringList">
            {recurringItems.map((item, index) => (
              <li key={`${item.text}-${index}`} className="discursiveRecurringItem">
                <div>
                  <strong>{item.text}</strong>
                  <span>
                    {item.count} ocorrência(s){item.fromCurrent ? " · também nesta redação" : ""}
                  </span>
                </div>
                <span className="discursiveRecurringCount">{item.count}x</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhum erro recorrente relevante no histórico recente.</p>
        )}
      </article>

      <article className="discursiveBlock discursivePlanBlock">
        <header className="discursiveInsightsHeader">
          <h3>Plano de treino da próxima redação</h3>
          <button className="secondaryBtn" type="button" onClick={generateTrainingPlan} disabled={planLoading}>
            {planLoading ? "Gerando..." : "Gerar plano"}
          </button>
        </header>
        {hasPlan ? (
          <>
            <ol className="discursivePlanList">
              {planItems.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ol>
            <small className="discursivePlanSource">{planSourceLabel}</small>
          </>
        ) : (
          <p>Gere um plano para receber passos práticos de treino para os próximos 7 dias.</p>
        )}
      </article>
    </div>
  );
}
