"use client";

import { useEffect, useRef, useState } from "react";
import type { EChartsCoreOption, EChartsType } from "echarts/core";

export function AdminChart({
  option,
  label,
  height,
}: {
  option: EChartsCoreOption;
  label: string;
  height: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let active = true;
    let chart: EChartsType | undefined;
    function theme() {
      if (!chart) return;
      const color = getComputedStyle(element!).color;
      chart.setOption({
        textStyle: { color },
        ...(option.legend ? { legend: { textStyle: { color } } } : {}),
        ...(option.xAxis
          ? {
              xAxis: {
                axisLabel: { color },
                axisLine: { lineStyle: { color } },
              },
            }
          : {}),
        ...(option.yAxis
          ? {
              yAxis: {
                axisLabel: { color },
                axisLine: { lineStyle: { color } },
              },
            }
          : {}),
      });
    }
    const resize = new ResizeObserver(() => chart?.resize());
    resize.observe(element);
    const observer = new MutationObserver(theme);
    const surface = element.closest(".admin-surface");
    if (surface)
      observer.observe(surface, {
        attributes: true,
        attributeFilter: ["class"],
      });
    void import("@/lib/admin-echarts")
      .then(({ createAdminChart }) => {
        if (!active) return;
        chart = createAdminChart(element);
        chart.setOption({
          ...option,
          aria: { enabled: true, label: { description: label } },
          animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        theme();
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      resize.disconnect();
      observer.disconnect();
      chart?.dispose();
    };
  }, [option, attempt, label]);
  return (
    <div className="relative min-w-0">
      <div
        ref={container}
        role="img"
        aria-label={label}
        className="w-full"
        style={{ height }}
      />
      {failed && (
        <p
          role="alert"
          className="absolute inset-0 flex items-center justify-center gap-2 bg-card text-sm text-destructive"
        >
          图表加载失败
          <button
            type="button"
            className="text-primary"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            重试图表
          </button>
        </p>
      )}
    </div>
  );
}
