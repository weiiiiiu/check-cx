"use client";

import {useMemo, useRef, useState} from "react";
import type {MouseEvent} from "react";
import type {AvailabilityPeriod, TrendDataPoint} from "@/lib/types";
import {STATUS_META} from "@/lib/core/status";
import {cn, formatLocalTime} from "@/lib/utils";

interface HistoryTrendChartProps {
  data?: TrendDataPoint[] | null;
  period: AvailabilityPeriod;
}

const PERIOD_LABELS: Record<AvailabilityPeriod, string> = {
  "7d": "7 天",
  "15d": "15 天",
  "30d": "30 天",
};

const CHART_HEIGHT = 72;
const CHART_PADDING = 6;

function getStatusColor(status: TrendDataPoint["status"]) {
  const preset = STATUS_META[status];
  if (preset?.dot) {
    return preset.dot.replace("bg-", "fill-");
  }
  return "fill-muted-foreground";
}

function formatLatency(value: number | null) {
  return typeof value === "number" ? `${value} ms` : "—";
}

export function HistoryTrendChart({ data, period }: HistoryTrendChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const points = useMemo(() => (data ? [...data] : []), [data]);

  const { polyline, minLatency, maxLatency } = useMemo(() => {
    if (points.length === 0) {
      return { polyline: "", minLatency: 0, maxLatency: 0 };
    }

    const latencies = points
      .map((point) => point.latencyMs)
      .filter((value): value is number => typeof value === "number");

    const min = latencies.length > 0 ? Math.min(...latencies) : 0;
    const max = latencies.length > 0 ? Math.max(...latencies) : 1;
    const range = Math.max(1, max - min);

    const coords = points.map((point, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const latency = typeof point.latencyMs === "number" ? point.latencyMs : min;
      const y =
        CHART_HEIGHT -
        CHART_PADDING -
        ((latency - min) / range) * (CHART_HEIGHT - CHART_PADDING * 2);
      return `${x},${y}`;
    });

    return {
      polyline: coords.join(" "),
      minLatency: min,
      maxLatency: max,
    };
  }, [points]);

  const activePoint =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : null;

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || points.length === 0) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.max(
      0,
      Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))
    );
    setActiveIndex(index);
  };

  const handleLeave = () => setActiveIndex(null);

  if (!points.length) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
        暂无 {PERIOD_LABELS[period]} 趋势数据
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>延迟趋势 ({PERIOD_LABELS[period]})</span>
        <span className="font-mono text-[10px]">
          {minLatency.toFixed(0)}-{maxLatency.toFixed(0)} ms
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-lg bg-muted/20 px-2 py-2"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <svg
          viewBox={`0 0 100 ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-20 w-full"
        >
          <polyline
            points={polyline}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-primary/60"
          />
          {points.map((point, index) => {
            const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
            const y = (() => {
              const latency =
                typeof point.latencyMs === "number" ? point.latencyMs : minLatency;
              const range = Math.max(1, maxLatency - minLatency);
              return (
                CHART_HEIGHT -
                CHART_PADDING -
                ((latency - minLatency) / range) *
                  (CHART_HEIGHT - CHART_PADDING * 2)
              );
            })();
            return (
              <circle
                key={`${point.timestamp}-${index}`}
                cx={x}
                cy={y}
                r={1.6}
                className={cn(getStatusColor(point.status), "transition-opacity")}
                opacity={activeIndex === null || activeIndex === index ? 0.95 : 0.35}
              />
            );
          })}
        </svg>

        {activePoint && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-48 -translate-x-1/2 rounded-lg border border-border/60 bg-background/95 p-2 text-xs shadow-lg"
            style={{
              left: `${
                points.length === 1
                  ? 50
                  : (activeIndex! / (points.length - 1)) * 100
              }%`,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">
                {STATUS_META[activePoint.status]?.label ?? activePoint.status}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatLatency(activePoint.latencyMs)}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {formatLocalTime(activePoint.timestamp)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
