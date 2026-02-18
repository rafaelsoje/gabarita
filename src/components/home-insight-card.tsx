"use client";

import { useEffect, useState } from "react";

type HomeInsightPayload = {
  planScopeId: string | null;
  planScopeLabel: string;
  hasPlans: boolean;
  hasStudyPlan: boolean;
  daysToExam: number | null;
  questionsAccuracy: number;
  mocksAccuracy: number;
  questionsSolved: number;
  questionsPlanned: number;
  questionsGoalPct: number;
  studyMinutesToday: number;
  plannedMinutesTotal: number;
  todayPlannedQuestions: number;
  todayPlannedReviews: number;
  todayPlannedMocks: number;
  currentStreak: number;
  consistencyRate: number;
  overdueReviewsCount: number;
};

type InsightResponse = {
  ok: boolean;
  insight?: {
    title: string;
    message: string;
    source: "LLM" | "LOCAL";
    tone: "critical" | "warning" | "positive";
  };
};

export function HomeInsightCard({ payload }: { payload: HomeInsightPayload }) {
  const [insight, setInsight] = useState<InsightResponse["insight"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadInsight() {
      setLoading(true);
      try {
        const response = await fetch("/api/home/insight", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
          signal: controller.signal
        });
        const parsed = (await response.json().catch(() => null)) as InsightResponse | null;
        if (!active) return;
        if (!response.ok || !parsed?.ok || !parsed.insight) {
          setInsight(null);
          return;
        }
        setInsight(parsed.insight);
      } catch {
        if (!active) return;
        setInsight(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInsight();
    return () => {
      active = false;
      controller.abort();
    };
  }, [payload]);

  const toneClass = insight ? `tone-${insight.tone}` : "tone-warning";

  return (
    <article className={`dashboardCard homeCoachCard ${toneClass}`}>
      <header className="homePanelHeader">
        <h2>{insight?.title ?? "Diagnóstico diário"}</h2>
        <p>{insight ? (insight.source === "LLM" ? "Análise da LLM" : "Análise local automática") : "Análise em processamento"}</p>
      </header>
      {loading ? (
        <p className="homeInsightFoot">Gerando diagnóstico e estratégia de hoje...</p>
      ) : (
        <p className="homeCoachMessage">{insight?.message ?? "Não foi possível gerar a análise agora. Tente novamente em instantes."}</p>
      )}
    </article>
  );
}
