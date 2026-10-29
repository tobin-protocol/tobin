"use client";

import dynamic from "next/dynamic";
import { useInView } from "motion/react";
import { useRef } from "react";

// The same Recharts charts as the showcase in "The problem". They load on the client only,
// once this block is near the viewport, so they stay out of the first load.
const StatCards = dynamic(() => import("./ShowcaseCharts").then((m) => m.StatCards), {
  ssr: false,
  loading: () => <Skeleton />,
});

function Skeleton() {
  return (
    <div aria-hidden="true" className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="min-h-[22rem] rounded-card border border-grey-200 bg-paper" />
      ))}
    </div>
  );
}

/** The three stat cards of "What exists today". Every value comes from lib/clearing.ts. */
export function StatCharts() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { once: true, margin: "300px" });
  return <div ref={ref}>{near ? <StatCards /> : <Skeleton />}</div>;
}
