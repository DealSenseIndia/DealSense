"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { PricePoint } from "@/lib/types";
import { cn, formatINR } from "@/lib/utils";

/**
 * ApexCharts needs the DOM, so it never runs on the server.
 */
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => (
    <div className="h-[380px] w-full animate-pulse rounded-2xl bg-subtle" />
  ),
});

export interface StoreHistory {
  /** The store key, e.g. "amazon". */
  merchant: string;
  /** The display name, e.g. "Amazon". */
  name: string;
  /** The store's brand colour. */
  color: string;
  /** Recorded prices, oldest first. */
  points: PricePoint[];
}

/** Read the app theme so the chart matches light or dark. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.getAttribute("data-theme") === "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return dark;
}

type ApexSeries = {
  name: string;
  data: { x: number; y: number }[];
  color: string;
};

/**
 * The recorded price history, drawn as one animated area chart per store.
 *
 * Hover anywhere and it reads the price we recorded for that day. Switch
 * between stores to see how each one moved on its own.
 */
export function PriceHistoryChart({
  stores,
  className,
  height = 380,
}: {
  stores: StoreHistory[];
  className?: string;
  height?: number;
}) {
  const dark = useIsDark();

  const series: ApexSeries[] = useMemo(
    () =>
      stores.map((s) => ({
        name: s.name,
        color: s.color,
        data: s.points.map((p) => ({ x: p.t, y: p.price })),
      })),
    [stores],
  );

  const options = useMemo(() => {
    const text = dark ? "#94a3b8" : "#64748b";
    const grid = dark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)";

    /** Our own tooltip: every store's nearest reading on that day. */
    const tooltip = {
      enabled: true,
      shared: true,
      intersect: false,
      fixed: { enabled: false },
      custom: (opts: unknown) => {
        const o = opts as {
          seriesIndex: number;
          dataPointIndex: number;
          w?: { config?: { series?: { data?: { x: number; y: number }[] }[] } };
        };
        // The real point data lives on the config, not on the tooltip payload.
        const cfg = o.w?.config?.series ?? [];
        const seriesIndex = o.seriesIndex ?? 0;
        const dataPointIndex = o.dataPointIndex ?? 0;
        const hovered = cfg[seriesIndex]?.data?.[dataPointIndex];
        const hoveredX = hovered?.x;
        if (hoveredX === undefined) return "";

        const rows = stores
          .map((st, i) => {
            const data = cfg[i]?.data ?? [];
            let best: { x: number; y: number } | null = null;
            let bestD = Infinity;
            for (const p of data) {
              const d = Math.abs(p.x - hoveredX);
              if (d < bestD) {
                bestD = d;
                best = p;
              }
            }
            if (!best) return null;
            const days = Math.round((best.x - hoveredX) / 86400000);
            return { name: st.name, color: st.color, y: best.y, days };
          })
          .filter(Boolean) as { name: string; color: string; y: number; days: number }[];

        if (!rows.length) return "";

        const when = new Date(hoveredX).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        const card = dark ? "#0d1424" : "#ffffff";
        const ink = dark ? "#f8fafc" : "#0f172a";
        const muted = dark ? "#64748b" : "#94a3b8";
        const edge = dark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.12)";

        return `
          <div style="background:${card};border:1px solid ${edge};border-radius:12px;padding:10px 12px;box-shadow:0 14px 34px -14px rgba(2,6,23,0.45);min-width:150px">
            <div style="font-size:11px;font-weight:700;color:${muted};margin-bottom:6px">${when}</div>
            ${rows
              .map(
                (r) => `
              <div style="display:flex;align-items:center;gap:7px;margin-top:3px">
                <span style="display:inline-block;width:7px;height:7px;border-radius:9999px;background:${r.color}"></span>
                <span style="font-size:12px;font-weight:600;color:${muted}">${r.name}</span>
                <span style="margin-left:auto;font-size:12.5px;font-weight:800;color:${ink};font-variant-numeric:tabular-nums">${formatINR(Math.round(r.y))}</span>
              </div>`,
              )
              .join("")}
          </div>`;
      },
    };

    return {
      chart: {
        type: "area" as const,
        height,
        fontFamily: "inherit",
        foreColor: text,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: {
          enabled: true,
          speed: 900,
          easing: "easeinout" as const,
          animateGradually: { enabled: true, delay: 35 },
        },
        dropShadow: {
          enabled: true,
          top: 6,
          left: 0,
          blur: 10,
          opacity: 0.12,
          color: "#0f172a",
        },
      },
      theme: { mode: (dark ? "dark" : "light") as "dark" | "light" },
      colors: series.map((s) => s.color),
      stroke: {
        curve: "smooth" as const,
        width: 2.8,
        lineCap: "round" as const,
      },
      fill: {
        type: "gradient" as const,
        gradient: {
          shadeIntensity: 1,
          type: "vertical" as const,
          opacityFrom: 0.34,
          opacityTo: 0.02,
          stops: [0, 92, 100],
        },
      },
      dataLabels: { enabled: false },
      markers: {
        size: 0,
        strokeWidth: 0,
        hover: { size: 6, sizeOffset: 0 },
      },
      xaxis: {
        type: "datetime" as const,
        labels: {
          style: { colors: text, fontSize: "12px", fontWeight: 600 },
          datetimeUTC: false,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
        crosshairs: {
          show: true,
          stroke: { color: dark ? "rgba(255,255,255,0.28)" : "rgba(15,23,42,0.18)", width: 1, dashArray: 4 },
        },
      },
      yaxis: {
        min: undefined,
        labels: {
          style: { colors: text, fontSize: "12px", fontWeight: 600 },
          formatter: (v: number) => formatINR(Math.round(v)),
          offsetX: -4,
        },
      },
      grid: {
        borderColor: grid,
        strokeDashArray: 4,
        padding: { left: 6, right: 10, top: 0, bottom: 0 },
      },
      legend: { show: false },
      tooltip,
      states: {
        hover: { filter: { type: "lighten" as const, value: 0.06 } },
        active: { filter: { type: "none" as const } },
      },
    };
  }, [dark, series, stores, height]);

  if (!series.length || !series.some((s) => s.data.length > 1)) return null;

  return (
    <div className={cn("w-full", className)}>
      <ReactApexChart options={options} series={series} type="area" height={height} />
    </div>
  );
}
