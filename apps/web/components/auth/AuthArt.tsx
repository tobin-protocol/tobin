/** An original illustration for the sign-in page: three institutions in a ring, a net line through them, and the broken-T mark. Drawn here, no photograph, no third-party asset. Decorative. */
export function AuthArt() {
  const rings = [60, 120, 180, 240, 300, 360];
  return (
    <svg viewBox="0 0 600 800" preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="size-full bg-black">
      <g fill="none" stroke="#fff" strokeWidth="1" opacity="0.18">
        {rings.map((r) => <circle key={r} cx="300" cy="400" r={r} />)}
        {Array.from({ length: 13 }, (_, i) => <line key={i} x1={i * 50} y1="0" x2={i * 50} y2="800" />)}
      </g>
      <g stroke="#fff" strokeWidth="2" fill="none">
        <polygon points="300,230 450,490 150,490" />
        <line x1="300" y1="230" x2="300" y2="400" opacity="0.5" />
      </g>
      {[{ x: 300, y: 230 }, { x: 450, y: 490 }, { x: 150, y: 490 }].map((p, i) => <rect key={i} x={p.x - 16} y={p.y - 16} width="32" height="32" fill="#000" stroke="#fff" strokeWidth="2" />)}
      <g transform="translate(60 640) scale(1.1)" fill="#fff"><path d="M0 6H100V34H68V54H32V34H0Z M32 62H68V94H32Z" /></g>
    </svg>
  );
}
