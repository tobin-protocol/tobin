/** The one place the example numbers may appear. Labelled as illustrative: A owes B 100, B owes C 80, C owes A 70. Gross 250; netting leaves 30 to move. */
const EDGES = [
  { from: "A", to: "B", amount: 100 },
  { from: "B", to: "C", amount: 80 },
  { from: "C", to: "A", amount: 70 },
];

export function ClearingExample() {
  return (
    <figure className="border border-divider" aria-labelledby="example-caption">
      <figcaption id="example-caption" className="border-b border-divider px-4 py-2 font-label text-label uppercase tracking-wider text-muted">Illustrative example. Not live data.</figcaption>
      <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <svg viewBox="0 0 320 220" role="img" aria-label="Three institutions in a ring: A owes B 100, B owes C 80, C owes A 70." className="mx-auto w-full max-w-sm">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#000" /></marker>
          </defs>
          {[{ k: "A", x: 160, y: 24 }, { k: "B", x: 280, y: 188 }, { k: "C", x: 40, y: 188 }].map((n) => (
            <g key={n.k}>
              <rect x={n.x - 22} y={n.y - 22} width="44" height="44" fill="#fff" stroke="#000" strokeWidth="1.5" />
              <text x={n.x} y={n.y + 6} textAnchor="middle" fontSize="18" fontWeight="500" fill="#000">{n.k}</text>
            </g>
          ))}
          <line x1="178" y1="42" x2="262" y2="168" stroke="#000" strokeWidth="1.5" markerEnd="url(#arr)" />
          <text x="236" y="96" fontSize="13" fill="#000">100</text>
          <line x1="256" y1="188" x2="68" y2="188" stroke="#000" strokeWidth="1.5" markerEnd="url(#arr)" />
          <text x="154" y="180" fontSize="13" fill="#000">80</text>
          <line x1="52" y1="168" x2="142" y2="42" stroke="#000" strokeWidth="1.5" markerEnd="url(#arr)" />
          <text x="82" y="96" fontSize="13" fill="#000">70</text>
        </svg>
        <div className="space-y-3 text-body">
          <ul className="divide-y divide-divider border-y border-divider">
            {EDGES.map((e) => <li key={e.from + e.to} className="flex justify-between py-2"><span>{e.from} owes {e.to}</span><span className="num">{e.amount}</span></li>)}
          </ul>
          <dl className="grid grid-cols-2 gap-3">
            <div className="bg-tile p-3"><dt className="font-label text-label uppercase tracking-wider text-muted">Gross</dt><dd className="num text-entity font-medium">250</dd></div>
            <div className="bg-tile p-3"><dt className="font-label text-label uppercase tracking-wider text-muted">Net that moves</dt><dd className="num text-entity font-medium">30</dd></div>
          </dl>
          <p className="text-muted">Netting cancels the ring. Only a net position of 30 has to be settled instead of three payments totalling 250.</p>
        </div>
      </div>
    </figure>
  );
}
