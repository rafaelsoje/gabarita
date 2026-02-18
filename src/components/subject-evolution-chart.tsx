"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type SubjectEvolutionPoint = {
  dateKey: string;
  label: string;
  minutes: number;
  questions: number;
};

type SubjectEvolutionChartProps = {
  points: SubjectEvolutionPoint[];
};

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function startOfWeek(date: Date) {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = normalized.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  normalized.setDate(normalized.getDate() + diff);
  return normalized;
}

function formatDM(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function formatMonth(date: Date) {
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

export function SubjectEvolutionChart({ points }: SubjectEvolutionChartProps) {
  const [mode, setMode] = useState<"daily" | "weekly" | "monthly">("daily");
  const filteredPoints = useMemo(() => {
    if (mode === "daily") return points;

    const grouped = new Map<string, SubjectEvolutionPoint>();
    for (const point of points) {
      const date = parseDateKey(point.dateKey);
      if (mode === "weekly") {
        const weekStart = startOfWeek(date);
        const key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
        const label = `Sem ${formatDM(weekStart)}`;
        const current = grouped.get(key) ?? { dateKey: key, label, minutes: 0, questions: 0 };
        current.minutes += point.minutes;
        current.questions += point.questions;
        grouped.set(key, current);
        continue;
      }

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = formatMonth(date);
      const current = grouped.get(key) ?? { dateKey: key, label, minutes: 0, questions: 0 };
      current.minutes += point.minutes;
      current.questions += point.questions;
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, value]) => value);
  }, [mode, points]);

  if (points.length === 0) {
    return <div className="subjectDetailChartPlaceholder">Sem estudos para exibir no gráfico.</div>;
  }

  const categories = filteredPoints.map((point) => point.label);
  const minutesSeries = filteredPoints.map((point) => point.minutes);
  const questionsSeries = filteredPoints.map((point) => point.questions);

  const options: ApexOptions = {
    chart: {
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true }
    },
    stroke: {
      width: [0, 3],
      curve: "smooth"
    },
    dataLabels: {
      enabled: false
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "right",
      labels: {
        colors: "#5f6d78"
      }
    },
    colors: ["#43c1b5", "#6f7bf7"],
    grid: {
      borderColor: "#d9e2e8",
      strokeDashArray: 4
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: "#6b7783",
          fontSize: "12px"
        }
      },
      axisBorder: { color: "#d9e2e8" },
      axisTicks: { color: "#d9e2e8" }
    },
    yaxis: [
      {
        title: {
          text: "Questões",
          style: { color: "#43c1b5", fontWeight: 600 }
        },
        labels: {
          style: { colors: "#5f6d78", fontSize: "12px" }
        },
        min: 0
      },
      {
        opposite: true,
        title: {
          text: "Tempo (min)",
          style: { color: "#6f7bf7", fontWeight: 600 }
        },
        labels: {
          style: { colors: "#5f6d78", fontSize: "12px" }
        },
        min: 0
      }
    ],
    tooltip: {
      shared: true,
      intersect: false
    }
  };

  const series = [
    {
      name: "Questões resolvidas",
      type: "column" as const,
      data: questionsSeries
    },
    {
      name: "Tempo de estudo (min)",
      type: "line" as const,
      data: minutesSeries
    }
  ];

  return (
    <div className="subjectDetailChartWrap">
      <div className="subjectDetailChartFilters" role="tablist" aria-label="Filtro de período do gráfico">
        <button
          type="button"
          className={`subjectDetailChartFilterBtn ${mode === "daily" ? "active" : ""}`}
          onClick={() => setMode("daily")}
        >
          Diário
        </button>
        <button
          type="button"
          className={`subjectDetailChartFilterBtn ${mode === "weekly" ? "active" : ""}`}
          onClick={() => setMode("weekly")}
        >
          Semanal
        </button>
        <button
          type="button"
          className={`subjectDetailChartFilterBtn ${mode === "monthly" ? "active" : ""}`}
          onClick={() => setMode("monthly")}
        >
          Mensal
        </button>
      </div>
      <ApexChart type="line" options={options} series={series} height={300} />
    </div>
  );
}
