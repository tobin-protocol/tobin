"use client";

import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Area,
  AreaChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EXAMPLE, EXAMPLE_OBLIGATIONS, EXAMPLE_PLAN, usd } from "@/lib/clearing";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "./chart";

/** Colour sets for the three states, as Ondo changes colour per product. Data visualisation only. */
export const TONES = [
  { a: "var(--color-chart-4)", b: "var(--color-chart-2)", ink: "text-chart-ink" },
  { a: "var(--color-purple)", b: "var(--color-arc-lilac)", ink: "text-purple-ink" },
  { a: "var(--color-chart-green)", b: "var(--color-chart-green-soft)", ink: "text-net-ink" },
] as const;

const tick = { fontSize: 11, fontFamily: "var(--font-label)", fill: "var(--color-grey-600)" };

type BarShapeProps = { x?: number; y?: number; width?: number; height?: number; index?: number; payload?: { net?: number }; value?: number | number[] };

/**
 * A soft, rounded bar in the manner of a modern dashboard: every bar is a pale tint of the
 * chart colour, and the highlighted one (the hovered bar, else the default for that chart) is
 * the full colour fading to a pale base. `dir` is the way the gradient runs: strong at the
 * free end of the bar.
 */
function BarSoft({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  color,
  on,
  dir = "up",
  neg = false,
}: BarShapeProps & { color: string; on: boolean; dir?: "up" | "right"; neg?: boolean }) {
  const w = Math.abs(width);
  const h = Math.abs(height);
  if (w < 1 || h < 1) return null;
  const x0 = width < 0 ? x + width : x;
  const y0 = height < 0 ? y + height : y;
  const down = dir === "up" && (height < 0 || neg);
  const id = `bs-${color.replace(/[^a-z0-9]/gi, "")}-${dir}${down ? "d" : ""}`;
  const vec = dir === "right" ? { x1: 0, y1: 0, x2: 1, y2: 0 } : down ? { x1: 0, y1: 1, x2: 0, y2: 0 } : { x1: 0, y1: 0, x2: 0, y2: 1 };
  const pale = `color-mix(in srgb, ${color} 14%, white)`;
  const first = dir === "right" ? pale : color;
  const last = dir === "right" ? color : pale;
  return (
    <g>
      <defs>
        <linearGradient id={id} {...vec}>
          <stop offset="0" style={{ stopColor: first }} />
          <stop offset="1" style={{ stopColor: last }} />
        </linearGradient>
      </defs>
      <rect x={x0} y={y0} width={w} height={h} rx={Math.min(9, w / 2, h / 2)} fill={on ? `url(#${id})` : pale} />
    </g>
  );
}

/** Which bar is highlighted: the hovered one, else `fallback`. */
function useHighlight(fallback: number) {
  const [hover, setHover] = useState<number | null>(null);
  return {
    hi: hover ?? fallback,
    chart: {
      onMouseMove: (st: { activeTooltipIndex?: number | string | null }) => {
        if (st && st.activeTooltipIndex != null) setHover(Number(st.activeTooltipIndex));
      },
      onMouseLeave: () => setHover(null),
    },
  };
}

/** A soft fade under a curve: the series colour at 24% to nothing. */
const softId = (color: string) => `sf-${color.replace(/[^a-z0-9]/gi, "")}`;
const softDefs = (...colors: string[]) => (
  <defs>
    {colors.map((c) => (
      <linearGradient key={c} id={softId(c)} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: c, stopOpacity: 0.24 }} />
        <stop offset="1" style={{ stopColor: c, stopOpacity: 0 }} />
      </linearGradient>
    ))}
  </defs>
);

/** A 9px square with a 2.25px radius: Ondo's pixel-line point. */
function SquareDot({ cx, cy, fill }: { cx?: number; cy?: number; fill?: string }) {
  if (cx === undefined || cy === undefined) return null;
  return <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} rx={2.25} fill={fill} />;
}

function Card({
  title,
  total,
  ink,
  className = "",
  summary,
  note,
  compact = false,
  children,
}: {
  title: string;
  total: string;
  ink: string;
  className?: string;
  /** Phone layout: a shorter chart and a smaller total. */
  compact?: boolean;
  /** Text equivalent of the chart, for screen readers (the chart itself is aria-hidden). */
  summary?: string;
  /** A caption under the chart. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <article className={`flex min-h-0 flex-col rounded-card bg-paper p-[18px] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="t-label text-grey-600">{title}</h3>
          <p className={`mt-1 font-semibold leading-tight tracking-[-0.02em] text-ink ${compact ? "text-[1.5rem]" : "text-[2rem]"}`}>{total}</p>
        </div>
        <span aria-hidden="true" className={`value-tag ${ink}`}>
          Illustrative
        </span>
      </div>
      <div aria-hidden="true" className={`mt-3 ${compact ? "h-36 shrink-0" : "min-h-40 flex-1"}`}>
        {children}
      </div>
      {summary ? <p className="sr-only">{summary}</p> : null}
      {note ? <p className="t-label mt-3 text-grey-600">{note}</p> : null}
    </article>
  );
}

const grid = <CartesianGrid vertical={false} stroke="var(--color-grey-100)" />;
const axisY = { tick, axisLine: false, tickLine: false, width: 44 } as const;

/** The big card: its chart and meaning change with the selected row on the left. */
function BigChart({ active, compact }: { active: 0 | 1 | 2; compact: boolean }) {
  const tone = TONES[active];
  const gross = [0, ...EXAMPLE_OBLIGATIONS.map((_, i) => EXAMPLE_OBLIGATIONS.slice(0, i + 1).reduce((s, o) => s + o.amount, 0))];
  const netCum = [0, ...EXAMPLE_PLAN.map((_, i) => EXAMPLE_PLAN.slice(0, i + 1).reduce((s, p) => s + p.amount, 0))];

  if (active === 0) {
    const config: ChartConfig = { gross: { label: "Gross value moved", color: tone.a } };
    const data = gross.map((v, i) => ({ x: i === 0 ? "start" : `payment ${i}`, gross: v }));
    return (
      <Card title="Gross value moved, one payment at a time" total={usd(EXAMPLE.gross)} ink={tone.ink} className="lg:col-span-2" compact={compact}>
        <ChartContainer config={config}>
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            {softDefs(tone.a)}
            {grid}
            <XAxis dataKey="x" tick={tick} axisLine={false} tickLine={false} padding={{ left: 8, right: 24 }} />
            <YAxis {...axisY} domain={[0, 300]} ticks={[0, 100, 200, 300]} tickFormatter={(v) => usd(Number(v))} />
            <Tooltip content={<ChartTooltipContent config={config} format={(v) => usd(Number(v))} />} cursor={false} />
            <Area type="monotone" dataKey="gross" stroke={tone.a} strokeWidth={2.5} fill={`url(#${softId(tone.a)})`} dot={<SquareDot fill={tone.a} />} activeDot={<SquareDot fill={tone.a} />} animationDuration={1200} />
          </AreaChart>
        </ChartContainer>
      </Card>
    );
  }

  if (active === 1) {
    const config: ChartConfig = {
      gross: { label: "Settled one by one", color: tone.b },
      net: { label: "After clearing", color: tone.a },
    };
    const data = gross.map((g, i) => ({ x: `${i}`, gross: g, net: netCum[i] ?? null }));
    return (
      <Card title="Value moved by the payments needed" total={`${usd(EXAMPLE.gross)} → ${usd(EXAMPLE.settled)}`} ink={tone.ink} className="lg:col-span-2" compact={compact}>
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <ChartContainer config={config}>
              <AreaChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            {softDefs(tone.a, tone.b)}
                {grid}
                <XAxis dataKey="x" tick={tick} axisLine={false} tickLine={false} padding={{ left: 8, right: 24 }} label={{ value: "payments", position: "insideBottomRight", offset: -2, style: tick }} />
                <YAxis {...axisY} domain={[0, 300]} ticks={[0, 100, 200, 300]} tickFormatter={(v) => usd(Number(v))} />
                <Tooltip content={<ChartTooltipContent config={config} format={(v) => usd(Number(v))} />} cursor={false} />
                <Area type="monotone" dataKey="gross" stroke="var(--c-gross)" strokeWidth={2} fill={`url(#${softId(tone.b)})`} dot={false} animationDuration={1200} />
                <Area type="monotone" dataKey="net" stroke="var(--c-net)" strokeWidth={2.5} fill={`url(#${softId(tone.a)})`} dot={{ r: 4, fill: tone.a, stroke: "none" }} connectNulls={false} animationDuration={1200} />
              </AreaChart>
            </ChartContainer>
          </div>
          <div className="t-label mt-2 flex gap-4 text-ink">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: tone.b }} />Settled one by one</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: tone.a }} />After clearing</span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Net positions: they sum to zero" total="$0" ink={tone.ink} className="lg:col-span-2" compact={compact}>
      <NetBars tone={tone} />
    </Card>
  );
}

const money = (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${usd(Math.abs(v))}`;

/** Net positions: A pays, B and C receive; they sum to zero. */
function NetBars({ tone }: { tone: (typeof TONES)[number] }) {
  const data = EXAMPLE.positions.map((p) => ({ x: p.party, net: p.net }));
  const config: ChartConfig = { net: { label: "Net position", color: tone.a } };
  const { hi, chart } = useHighlight(data.reduce((m, d, i) => (Math.abs(d.net) > Math.abs(data[m].net) ? i : m), 0));
  return (
    <ChartContainer config={config}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%" {...chart}>
        {grid}
        <XAxis dataKey="x" tick={tick} axisLine={false} tickLine={false} />
        <YAxis {...axisY} domain={[-40, 40]} ticks={[-40, -20, 0, 20, 40]} tickFormatter={(v) => money(Number(v))} />
        <ReferenceLine y={0} stroke="var(--color-grey-600)" strokeOpacity={0.5} />
        <Tooltip content={<ChartTooltipContent config={config} format={(v) => money(Number(v))} />} cursor={false} />
        <Bar dataKey="net" shape={(p: BarShapeProps) => <BarSoft {...p} color={tone.a} on={p.index === hi} neg={(p.payload?.net ?? (typeof p.value === "number" ? p.value : 0)) < 0} />} animationDuration={1200} />
      </BarChart>
    </ChartContainer>
  );
}

/** The three obligations, one bar each. */
function PairBars({ tone }: { tone: (typeof TONES)[number] }) {
  const pairs = EXAMPLE_OBLIGATIONS.map((o) => ({ x: `${o.from}→${o.to}`, v: o.amount }));
  const cfg: ChartConfig = { v: { label: "Obligation", color: tone.a } };
  const { hi, chart } = useHighlight(pairs.reduce((m, d, i) => (d.v > pairs[m].v ? i : m), 0));
  return (
    <ChartContainer config={cfg}>
      <BarChart data={pairs} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%" {...chart}>
        {grid}
        <XAxis dataKey="x" tick={tick} axisLine={false} tickLine={false} />
        <YAxis {...axisY} domain={[0, 120]} ticks={[0, 40, 80, 120]} tickFormatter={(v) => usd(Number(v))} />
        <Tooltip content={<ChartTooltipContent config={cfg} format={(v) => usd(Number(v))} />} cursor={false} />
        <Bar dataKey="v" shape={(p: BarShapeProps) => <BarSoft {...p} color={tone.a} on={p.index === hi} />} animationDuration={1200} />
      </BarChart>
    </ChartContainer>
  );
}

/** Value moved one by one against value moved once cleared. */
function MovedBars({ tone }: { tone: (typeof TONES)[number] }) {
  const moved = [
    { x: "One by one", v: EXAMPLE.gross },
    { x: "Cleared", v: EXAMPLE.settled },
  ];
  const cfg: ChartConfig = { v: { label: "Value moved", color: tone.a } };
  const { hi, chart } = useHighlight(1);
  return (
    <ChartContainer config={cfg}>
      <BarChart data={moved} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%" {...chart}>
        <XAxis type="number" hide domain={[0, 270]} />
        <YAxis type="category" dataKey="x" tick={tick} axisLine={false} tickLine={false} width={96} />
        <Tooltip content={<ChartTooltipContent config={cfg} format={(v) => usd(Number(v))} />} cursor={false} />
        <Bar dataKey="v" barSize={26} shape={(p: BarShapeProps) => <BarSoft {...p} color={tone.a} on={p.index === hi} dir="right" />} animationDuration={1200} />
      </BarChart>
    </ChartContainer>
  );
}

/** The two small cards: the obligations, and how much less value has to move once they are cleared. */
function SmallCharts({ active, compact }: { active: 0 | 1 | 2; compact: boolean }) {
  const tone = TONES[active];
  return (
    <>
      <Card title="Obligations in the example" total={usd(EXAMPLE.gross)} ink={tone.ink} compact={compact}>
        <PairBars tone={tone} />
      </Card>
      <Card title="Value that has to move" total={`${usd(EXAMPLE.gross - EXAMPLE.settled)} less`} ink={tone.ink} compact={compact}>
        <MovedBars tone={tone} />
      </Card>
    </>
  );
}

/** The right-hand side of the showcase: one wide card and two small ones. */
export default function ShowcaseCharts({ active, compact = false }: { active: 0 | 1 | 2; compact?: boolean }) {
  return (
    <div className="grid gap-3 lg:h-full lg:grid-cols-2 lg:grid-rows-[1.25fr_1fr]">
      <BigChart active={active} compact={compact} />
      <SmallCharts active={active} compact={compact} />
    </div>
  );
}

/** The step-by-step gross value and what is left after clearing, as two lines. */
function GrossNetChart({ tone }: { tone: (typeof TONES)[number] }) {
  const gross = [0, ...EXAMPLE_OBLIGATIONS.map((_, i) => EXAMPLE_OBLIGATIONS.slice(0, i + 1).reduce((s, o) => s + o.amount, 0))];
  const netCum = [0, ...EXAMPLE_PLAN.map((_, i) => EXAMPLE_PLAN.slice(0, i + 1).reduce((s, p) => s + p.amount, 0))];
  const config: ChartConfig = {
    gross: { label: "Settled one by one", color: tone.b },
    net: { label: "After clearing", color: tone.a },
  };
  const data = gross.map((g, i) => ({ x: `${i}`, gross: g, net: netCum[i] ?? null }));
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ChartContainer config={config}>
          <AreaChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            {softDefs(tone.a, tone.b)}
            {grid}
            <XAxis dataKey="x" tick={tick} axisLine={false} tickLine={false} padding={{ left: 8, right: 24 }} />
            <YAxis {...axisY} domain={[0, 300]} ticks={[0, 100, 200, 300]} tickFormatter={(v) => usd(Number(v))} />
            <Tooltip content={<ChartTooltipContent config={config} format={(v) => usd(Number(v))} />} cursor={false} />
            <Area type="monotone" dataKey="gross" stroke="var(--c-gross)" strokeWidth={2} fill={`url(#${softId(tone.b)})`} dot={false} animationDuration={1200} />
            <Area type="monotone" dataKey="net" stroke="var(--c-net)" strokeWidth={2.5} fill={`url(#${softId(tone.a)})`} dot={{ r: 4, fill: tone.a, stroke: "none" }} connectNulls={false} animationDuration={1200} />
          </AreaChart>
        </ChartContainer>
      </div>
      <div className="t-label mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ink">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: tone.b }} />Settled one by one</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: tone.a }} />After clearing</span>
      </div>
    </div>
  );
}

/**
 * The three cards of "What exists today": the same Recharts charts as the showcase in
 * "The problem", side by side (gross against net, obligations by pair, net positions), every
 * value from the illustrative example in lib/clearing.ts.
 */
export function StatCards() {
  const blue = TONES[0];
  const green = TONES[2];
  const note = "Illustrative arithmetic, not data.";
  const box = "min-h-[22rem] border border-grey-200";
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card
        title="Gross vs net in the example"
        total={`${usd(EXAMPLE.gross)} → ${usd(EXAMPLE.settled)}`}
        ink={blue.ink}
        className={box}
        note={note}
        summary={`Gross value grows as each obligation is added, to ${usd(EXAMPLE.gross)}. Cleared first, only ${usd(EXAMPLE.settled)} settles.`}
      >
        <GrossNetChart tone={blue} />
      </Card>
      <Card
        title="Obligations by pair"
        total={usd(EXAMPLE.gross)}
        ink={blue.ink}
        className={box}
        note={note}
        summary={`Obligations: ${EXAMPLE_OBLIGATIONS.map((o) => `${o.from} owes ${o.to} ${usd(o.amount)}`).join("; ")}.`}
      >
        <PairBars tone={blue} />
      </Card>
      <Card
        title="Net positions"
        total={usd(EXAMPLE.settled)}
        ink={green.ink}
        className={box}
        note={note}
        summary={`Net positions: ${EXAMPLE.positions.map((p) => `${p.party} ${p.net < 0 ? "pays" : "receives"} ${usd(Math.abs(p.net))}`).join("; ")}.`}
      >
        <NetBars tone={green} />
      </Card>
    </div>
  );
}
