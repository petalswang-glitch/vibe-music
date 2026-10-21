"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListMusic, MicVocal, Music2, RefreshCw, Users } from "lucide-react";
import type { EChartsCoreOption } from "echarts/core";
import { AdminChart } from "@/components/admin-chart";
import { adminGet } from "@/lib/admin-api";
import { fetchDashboardCounts, type Distribution } from "@/lib/admin-dashboard";
import { useAdmin } from "@/providers/admin-provider";
import { authError } from "@/providers/auth-provider";

const cards = [
  {
    key: "users",
    label: "用户数量",
    color: "#41b6ff",
    icon: Users,
    trend: [210, 439, 530, 496, 575, 680, 845],
  },
  {
    key: "artists",
    label: "歌手数量",
    color: "#e85f33",
    icon: MicVocal,
    trend: [210, 399, 500, 492, 652, 688, 850],
  },
  {
    key: "songs",
    label: "歌曲数量",
    color: "#26ce83",
    icon: Music2,
    trend: [2101, 3399, 5300, 4962, 6952, 6808, 8450],
  },
  {
    key: "playlists",
    label: "歌单数量",
    color: "#7846e5",
    icon: ListMusic,
    trend: [2101, 5288, 4239, 4962, 6752, 5208, 7450],
  },
] as const;

function AnimatedCount({ value }: { value: number }) {
  const [current, setCurrent] = useState(100);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 2200;
    function tick(now: number) {
      const progress = duration ? Math.min(1, (now - start) / duration) : 1;
      setCurrent(
        Math.round(100 + (value - 100) * (1 - Math.pow(1 - progress, 3))),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span aria-label={String(value)}>{current.toLocaleString()}</span>;
}

function Trend({
  color,
  values,
}: {
  color: string;
  values: readonly number[];
}) {
  const option = useMemo<EChartsCoreOption>(
    () => ({
      grid: { top: 15, bottom: 0, left: 0, right: 0 },
      xAxis: { type: "category", show: false, data: values },
      yAxis: { type: "value", show: false },
      series: [
        {
          type: "line",
          data: values,
          symbol: "none",
          smooth: true,
          color,
          lineStyle: { shadowOffsetY: 3, shadowBlur: 7, shadowColor: color },
        },
      ],
    }),
    [color, values],
  );
  return (
    <div className="w-1/2">
      <AdminChart
        option={option}
        label="趋势示意（原项目固定数据）"
        height={60}
      />
      <p className="text-right text-[10px] text-muted-foreground">趋势示意</p>
    </div>
  );
}

function DataTable({ title, data }: { title: string; data: Distribution }) {
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">查看{title}数据</summary>
      <table aria-label={`${title}数据`} className="mt-3 w-full text-left">
        <thead>
          <tr>
            <th className="py-2">类别</th>
            <th>数量</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.name}>
              <td className="py-1.5">{row.name}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Distributions({
  styles,
  areas,
  genders,
}: {
  styles: Distribution;
  areas: Distribution;
  genders: Distribution;
}) {
  const styleOption = useMemo<EChartsCoreOption>(
    () => ({
      tooltip: { trigger: "item" },
      legend: { top: "5%", left: "center" },
      series: [
        {
          name: "歌曲类型数量",
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: false,
          padAngle: 5,
          itemStyle: { borderRadius: 10 },
          label: { show: false, position: "center" },
          emphasis: { label: { show: true, fontSize: 30, fontWeight: "bold" } },
          labelLine: { show: false },
          data: styles,
        },
      ],
    }),
    [styles],
  );
  const areaOption = useMemo<EChartsCoreOption>(
    () => ({
      color: ["#41b6ff"],
      tooltip: { trigger: "axis", axisPointer: { type: "none" } },
      grid: { top: 20, left: 45, right: 8, bottom: 45 },
      legend: { data: ["歌手数量"], bottom: 0 },
      xAxis: {
        type: "category",
        data: areas.map((item) => item.name),
        axisLabel: { interval: 0, fontSize: 12 },
      },
      yAxis: { type: "value", minInterval: 1, splitLine: { show: false } },
      series: [
        {
          name: "歌手数量",
          type: "bar",
          barMaxWidth: 39,
          itemStyle: { borderRadius: [10, 10, 0, 0] },
          data: areas.map((item) => item.value),
        },
      ],
    }),
    [areas],
  );
  const genderOption = useMemo<EChartsCoreOption>(
    () => ({
      tooltip: { trigger: "item" },
      legend: { orient: "vertical", left: "left" },
      series: [
        {
          name: "歌手性别数量",
          type: "pie",
          radius: "75%",
          data: genders,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0,0,0,0.5)",
            },
          },
        },
      ],
    }),
    [genders],
  );
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <section className="min-w-0 rounded-lg border bg-card p-5">
        <h2 className="font-medium">歌曲类型比例</h2>
        <AdminChart option={styleOption} label="歌曲类型比例" height={587} />
        <p className="text-xs text-muted-foreground">
          按原歌曲风格子串统计；同一首歌可计入多个类型。
        </p>
        <DataTable title="歌曲类型" data={styles} />
      </section>
      <div className="min-w-0 space-y-5">
        <section className="min-w-0 rounded-lg border bg-card p-5">
          <h2 className="font-medium">歌手国籍分布</h2>
          <AdminChart option={areaOption} label="歌手国籍分布" height={253} />
          <DataTable title="歌手国籍" data={areas} />
        </section>
        <section className="min-w-0 rounded-lg border bg-card p-5">
          <h2 className="font-medium">歌手性别比例</h2>
          <AdminChart option={genderOption} label="歌手性别比例" height={240} />
          <DataTable title="歌手性别" data={genders} />
        </section>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const { admin, ready } = useAdmin();
  const result = useQuery({
    queryKey: ["admin", admin?.adminId, "dashboard"],
    enabled: ready && !!admin,
    queryFn: ({ signal }) => fetchDashboardCounts(adminGet<number>, signal),
  });
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">数据统计</h1>
        <button
          type="button"
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
          className="flex items-center gap-2 rounded border bg-card px-3 py-2 text-sm disabled:opacity-40"
        >
          <RefreshCw
            size={15}
            className={result.isFetching ? "animate-spin" : ""}
          />
          刷新统计
        </button>
      </header>
      {result.isPending ? (
        <p
          role="status"
          className="rounded-lg border bg-card p-10 text-center text-sm"
        >
          正在加载统计数据...
        </p>
      ) : result.isError ? (
        <p
          role="alert"
          className="rounded-lg border bg-card p-10 text-center text-sm text-destructive"
        >
          {authError(result.error, "无法加载统计数据")}
          <button
            type="button"
            onClick={() => void result.refetch()}
            className="ml-3 text-primary"
          >
            重试统计
          </button>
        </p>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ key, label, color, icon: Icon, trend }) => (
              <section
                key={key}
                className="min-w-0 rounded-lg border bg-card p-5"
                aria-label={label}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium">{label}</h2>
                  <span
                    className="rounded-md p-2"
                    style={{ color, backgroundColor: `${color}15` }}
                  >
                    <Icon size={18} />
                  </span>
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <p className="text-3xl font-semibold tabular-nums">
                    <AnimatedCount value={result.data.totals[key]} />
                  </p>
                  <Trend color={color} values={trend} />
                </div>
              </section>
            ))}
          </div>
          <Distributions
            styles={result.data.styles}
            areas={result.data.areas}
            genders={result.data.genders}
          />
        </>
      )}
    </div>
  );
}
