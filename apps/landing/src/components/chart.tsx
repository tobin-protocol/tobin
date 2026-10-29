"use client";

import { cloneElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

/**
 * A small chart kit in the manner of shadcn/ui's `chart` component (which wraps Recharts):
 * a `config` maps each series to a label and a colour, `ChartContainer` publishes the colours
 * as CSS variables (`--c-<key>`) and makes the chart fill its box, and `ChartTooltipContent`
 * renders the tooltip as the value tag used across the page (mono, 1px border, 4px radius).
 * Colours are theme tokens passed in by the caller; nothing is hard-coded here.
 */
export type ChartConfig = Record<string, { label: string; color: string }>;

export function ChartContainer({
  config,
  className = "",
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: ReactNode;
}) {
  const style = Object.fromEntries(
    Object.entries(config).map(([key, v]) => [`--c-${key}`, v.color]),
  ) as CSSProperties;
  return (
    <div style={style} className={`h-full w-full text-xs ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        {/* The charts are decorative (aria-hidden, with a text summary), so Recharts' keyboard layer is
            switched off: it would otherwise make every chart a tab stop inside a hidden region. */}
        {cloneElement(children as ReactElement<{ accessibilityLayer?: boolean }>, { accessibilityLayer: false })}
      </ResponsiveContainer>
    </div>
  );
}

type TooltipEntry = { dataKey?: string | number; name?: string | number; value?: number | string };

/** The tooltip body: the hovered x label and each series' value, formatted by `format`. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  config,
  format = (v: number | string) => String(v),
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  config: ChartConfig;
  format?: (v: number | string, key: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[12px] bg-paper px-4 py-3 text-ink shadow-[0_12px_32px_-8px_rgb(0_0_0/0.2)]">
      {label !== undefined && label !== "" ? <p className="t-label text-grey-600">{label}</p> : null}
      {payload.map((p) => {
        const key = String(p.dataKey ?? p.name);
        if (p.value === undefined || p.value === null) return null;
        return (
          <p key={key} className="t-mono flex items-center gap-2 text-ink">
            <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: `var(--c-${key})` }} />
            {config[key]?.label ?? key}
            <span className="ml-auto pl-6 text-base font-semibold">{format(p.value, key)}</span>
          </p>
        );
      })}
    </div>
  );
}
