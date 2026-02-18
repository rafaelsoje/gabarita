"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type ExamEvolutionPoint = {
  dateKey: string;
  label: string;
  score: number | null;
  distanceToCutoff: number | null;
  percentile: number | null;
};

type ExamResultsEvolutionChartProps = {
  points: ExamEvolutionPoint[];
};

export function ExamResultsEvolutionChart({ points }: ExamResultsEvolutionChartProps) {
  const [mode, setMode] = useState<"daily" | "weekly" | "monthly">("daily");

  const filteredPoints = useMemo(() => {
    if (mode === "daily") return points;

    const grouped = new Map<
      string,
      {
        dateKey: string;
        label: string;
        scoreSum: number;
        scoreCount: number;
        deltaSum: number;
        deltaCount: number;
        percentileSum: number;
        percentileCount: number;
      }
    >();
    for (const point of points) {
      const date = parseDateKey(point.dateKey);
      if (mode === "weekly") {
        const weekStart = startOfWeek(date);
        const key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
        const label = `Sem ${formatDM(weekStart)}`;
        const current = grouped.get(key) ?? {
          dateKey: key,
          label,
          scoreSum: 0,
          scoreCount: 0,
          deltaSum: 0,
          deltaCount: 0,
          percentileSum: 0,
          percentileCount: 0
        };
        if (typeof point.score === "number") {
          current.scoreSum += point.score;
          current.scoreCount += 1;
        }
        if (typeof point.distanceToCutoff === "number") {
          current.deltaSum += point.distanceToCutoff;
          current.deltaCount += 1;
        }
        if (typeof point.percentile === "number") {
          current.percentileSum += point.percentile;
          current.percentileCount += 1;
        }
        grouped.set(key, current);
        continue;
      }

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = formatMonth(date);
      const current = grouped.get(key) ?? {
        dateKey: key,
        label,
        scoreSum: 0,
        scoreCount: 0,
        deltaSum: 0,
        deltaCount: 0,
        percentileSum: 0,
        percentileCount: 0
      };
      if (typeof point.score === "number") {
        current.scoreSum += point.score;
        current.scoreCount += 1;
      }
      if (typeof point.distanceToCutoff === "number") {
        current.deltaSum += point.distanceToCutoff;
        current.deltaCount += 1;
      }
      if (typeof point.percentile === "number") {
        current.percentileSum += point.percentile;
        current.percentileCount += 1;
      }
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, value]) => ({
        dateKey: value.dateKey,
        label: value.label,
        score: value.scoreCount > 0 ? Math.round((value.scoreSum / value.scoreCount) * 100) / 100 : null,
        distanceToCutoff: value.deltaCount > 0 ? Math.round((value.deltaSum / value.deltaCount) * 100) / 100 : null,
        percentile:
          value.percentileCount > 0 ? Math.round((value.percentileSum / value.percentileCount) * 100) / 100 : null
      }));
  }, [mode, points]);

  if (points.length === 0) {
    return <div className="subjectDetailChartPlaceholder">Sem provas suficientes para exibir evolução.</div>;
  }

  const options: ApexOptions = {
    chart: {
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true }
    },
    stroke: {
      width: [3, 3],
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
    colors: ["#43c1b5", "#d67575", "#6f7bf7"],
    grid: {
      borderColor: "#d9e2e8",
      strokeDashArray: 4
    },
    xaxis: {
      categories: filteredPoints.map((point) => point.label),
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
          text: "Nota",
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
          text: "Distância da corte",
          style: { color: "#d67575", fontWeight: 600 }
        },
        labels: {
          style: { colors: "#5f6d78", fontSize: "12px" }
        }
      },
      {
        opposite: true,
        title: {
          text: "Percentil (%)",
          style: { color: "#6f7bf7", fontWeight: 600 }
        },
        labels: {
          style: { colors: "#5f6d78", fontSize: "12px" }
        },
        min: 0,
        max: 100
      }
    ],
    tooltip: {
      shared: true,
      intersect: false
    }
  };

  const series = [
    {
      name: "Nota",
      type: "line" as const,
      data: filteredPoints.map((point) => point.score)
    },
    {
      name: "Distância da corte",
      type: "line" as const,
      data: filteredPoints.map((point) => point.distanceToCutoff)
    },
    {
      name: "Percentil (%)",
      type: "line" as const,
      data: filteredPoints.map((point) => point.percentile)
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
      <ApexChart type="line" options={options} series={series} height={320} />
    </div>
  );
}

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
