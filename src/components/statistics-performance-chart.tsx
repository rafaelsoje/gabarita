"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type StatsChartPoint = {
  dateKey: string;
  label: string;
  total: number;
  accuracy: number;
};

type StatisticsPerformanceChartProps = {
  points: StatsChartPoint[];
};

export function StatisticsPerformanceChart({ points }: StatisticsPerformanceChartProps) {
  const [mode, setMode] = useState<"daily" | "weekly" | "monthly">("daily");

  const filteredPoints = useMemo(() => {
    if (mode === "daily") return points;

    const grouped = new Map<string, StatsChartPoint>();
    for (const point of points) {
      const date = parseDateKey(point.dateKey);
      if (mode === "weekly") {
        const weekStart = startOfWeek(date);
        const key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
        const label = `Sem ${formatDM(weekStart)}`;
        const current = grouped.get(key) ?? { dateKey: key, label, total: 0, accuracy: 0 };
        current.total += point.total;
        current.accuracy += point.accuracy * point.total;
        grouped.set(key, current);
        continue;
      }

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = formatMonth(date);
      const current = grouped.get(key) ?? { dateKey: key, label, total: 0, accuracy: 0 };
      current.total += point.total;
      current.accuracy += point.accuracy * point.total;
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, value]) => ({
        ...value,
        accuracy: value.total > 0 ? Math.round(value.accuracy / value.total) : 0
      }));
  }, [mode, points]);

  if (points.length === 0) {
    return <div className="subjectDetailChartPlaceholder">Sem dados no período filtrado.</div>;
  }

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
          text: "Acerto (%)",
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
      name: "Questões resolvidas",
      type: "column" as const,
      data: filteredPoints.map((point) => point.total)
    },
    {
      name: "Taxa de acerto (%)",
      type: "line" as const,
      data: filteredPoints.map((point) => point.accuracy)
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
