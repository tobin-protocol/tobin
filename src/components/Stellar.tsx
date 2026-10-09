import { Curtain } from "./Curtain";
import { Reveal } from "./Reveal";
import { Container } from "./ui";

const statements = [
  {
    term: "Stellar",
    text: "provides the settlement network.",
  },
  {
    term: "Soroban",
    text: "supports Tobin's on-chain protocol logic.",
  },
  {
    term: "Tobin",
    text: "adds a clearing layer above existing payment infrastructure.",
  },
  {
    term: "SEP-31",
    text: "stays in place. Tobin is designed to complement it, not replace it.",
  },
];

function Layer({
  title,
  detail,
  tone = "plain",
}: {
  title: string;
  detail: string;
  tone?: "plain" | "accent";
}) {
  const toneClass =
    tone === "accent"
      ? "border-accent/40 bg-accent-tint"
      : "border-line bg-surface";
  return (
    <div className={`rounded-2xl border px-5 py-4 ${toneClass}`}>
      <p className={`text-[0.9375rem] font-semibold tracking-[-0.01em] ${tone === "accent" ? "text-accent-ink" : "text-ink"}`}>
        {title}
      </p>
      <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-soft">{detail}</p>
    </div>
  );
}

function Join() {
  return (
    <span aria-hidden="true" className="mx-auto block h-4 w-px bg-line-strong" />
  );
}

export function Stellar() {
  return (
    <Curtain id="stellar" label="stellar-title" surface="signal" className="py-24 md:py-32">
      <Container className="grid gap-14 lg:grid-cols-12 lg:items-center lg:gap-10">
        <Reveal className="lg:col-span-5">
          <p className="eyebrow">Built for Stellar</p>
          <h2 id="stellar-title" className="text-title mt-4 text-balance">
            A clearing layer above the rails that already exist.
          </h2>
          <dl className="mt-9 divide-y divide-line border-y border-line">
            {statements.map((s) => (
              <div key={s.term} className="flex gap-4 py-4">
                <dt className="w-20 shrink-0 text-[0.9375rem] font-semibold">{s.term}</dt>
                <dd className="text-body text-[0.9375rem]">{s.text}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-7">
          <figure>
            <div
              role="img"
              aria-label="Simplified architecture, top to bottom: institutions and integrators; the Tobin clearing layer; Soroban smart contracts holding Tobin's on-chain logic; and the Stellar network for settlement. SEP-31 payment flows sit alongside and are complemented by Tobin."
              className="grid gap-4 rounded-[1.75rem] border border-line bg-paper p-4 sm:p-6 md:grid-cols-[minmax(0,1fr)_11.5rem]"
            >
              <div aria-hidden="true" className="flex flex-col">
                <Layer title="Institutions and integrators" detail="Submit obligations and receive net positions" />
                <Join />
                <Layer tone="accent" title="Tobin clearing layer" detail="Obligations, clearing sessions, net positions" />
                <Join />
                <Layer title="Soroban" detail="Smart contracts holding Tobin's on-chain protocol logic" />
                <Join />
                <Layer title="Stellar network" detail="The settlement network" />
              </div>

              <div
                aria-hidden="true"
                className="flex flex-col justify-center rounded-2xl border border-dashed border-line-strong px-5 py-5 text-center md:text-left"
              >
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-ink-faint">
                  Existing standard
                </p>
                <p className="mt-1.5 text-[1.0625rem] font-semibold tracking-[-0.01em]">SEP-31</p>
                <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">
                  Cross-border payments. Unchanged, and complemented by Tobin.
                </p>
              </div>
            </div>
            <figcaption className="mt-3 px-1 text-[0.8125rem] text-ink-soft">
              Simplified architecture for illustration.
            </figcaption>
          </figure>
        </Reveal>
      </Container>
    </Curtain>
  );
}
