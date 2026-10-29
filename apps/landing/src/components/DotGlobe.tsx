"use client";

import { useEffect, useRef } from "react";
import { useReduceMotion } from "@/lib/stage";

const SIZE = 434;
const POINTS = 4200;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Radians per second: a lively but readable spin. */
const SPIN = 0.5;
/** Cursor influence radius (px), push strength, and spring-back rate. */
const REACH = 110;
const PUSH = 5200;
const SPRING = 60;
const DAMP = 7.5;

/**
 * Coarse continent outlines as [longitude, latitude] degrees, hand-drawn for a dot globe
 * (a few dozen vertices each, so coastlines are approximate, not survey data). Antarctica
 * is everything south of 72°S. Longitudes are geographic: east is positive.
 */
const LAND: number[][][] = [
  // North America
  [[-168,66],[-162,70],[-141,70],[-125,70],[-95,72],[-82,68],[-62,60],[-56,52],[-66,45],[-70,42],[-76,35],[-81,31],[-80,25],[-83,29],[-90,30],[-97,27],[-97,21],[-90,21],[-87,21],[-88,16],[-83,10],[-78,8],[-80,7],[-85,10],[-92,15],[-105,20],[-110,24],[-112,29],[-115,30],[-110,23],[-117,32],[-124,40],[-124,48],[-130,55],[-140,60],[-150,60],[-158,57],[-165,60]],
  // Greenland, Baffin, Victoria, Iceland
  [[-73,78],[-60,82],[-30,83],[-20,80],[-20,70],[-40,62],[-50,64],[-55,70]],
  [[-80,73],[-65,67],[-62,66],[-70,62],[-78,64],[-90,70]],
  [[-118,72],[-100,73],[-100,69],[-115,69]],
  [[-24,65],[-14,66],[-14,64],[-22,63]],
  // South America
  [[-78,8],[-72,12],[-62,10],[-52,5],[-50,0],[-35,-5],[-35,-9],[-39,-15],[-41,-22],[-48,-26],[-53,-34],[-58,-38],[-65,-41],[-66,-47],[-69,-52],[-68,-55],[-74,-52],[-74,-42],[-72,-30],[-70,-18],[-76,-14],[-81,-5],[-80,0],[-77,4]],
  // Europe and Asia
  [[-9,37],[-9,43],[-1,46],[-4,48.5],[2,51],[8,54],[10,57],[8,58],[5,60],[5,62],[14,67],[22,70],[30,71],[40,68],[44,68],[60,70],[70,73],[80,73],[100,77],[112,74],[130,71],[140,72],[160,70],[170,70],[180,68],[180,65],[170,60],[163,58],[160,53],[156,51],[155,58],[143,59],[137,54],[141,48],[135,43],[130,42],[127,39],[129,35],[126,35],[125,39],[121,40],[122,37],[119,35],[122,31],[121,26],[117,23],[110,21],[108,22],[106,19],[109,13],[105,9],[103,10],[100,13],[100,8],[103,2],[101,3],[98,8],[98,16],[94,17],[92,22],[88,22],[85,20],[80,15],[80,10],[77,8],[73,17],[72,21],[67,24],[61,25],[57,26],[54,26.5],[50,30],[48,30],[50,26],[51,24],[56,24.5],[59,22.5],[55,17],[44,12.5],[43,15],[39,22],[35,28],[34,31],[35,33],[36,36],[30,36],[27,37],[26,40],[23,37],[20,40],[19,42],[13,45],[12,44],[16,41],[18,40],[16,38],[12,42],[9,44],[3,43],[0,39],[-2,37],[-6,36]],
  // Africa
  [[-17,21],[-16,28],[-10,30],[-6,36],[10,37],[11,33],[20,32],[25,32],[32,31],[34,28],[38,20],[43,12],[51,12],[48,5],[40,-3],[40,-11],[35,-20],[33,-26],[28,-33],[20,-35],[18,-32],[12,-18],[13,-8],[9,-1],[9,4],[4,6],[-4,5],[-8,4],[-13,8],[-17,14]],
  // Madagascar, British Isles, Japan, Philippines, SE Asia islands
  [[44,-25],[47,-25],[50,-15],[49,-12],[44,-17]],
  [[-5,50],[1,51],[2,53],[-2,57],[-5,58],[-6,56],[-3,54],[-5,52]],
  [[-10,52],[-6,52],[-6,55],[-10,54]],
  [[130,31],[136,34],[141,37],[142,42],[141,45],[139,40],[136,36],[132,34]],
  [[120,18],[122,18],[126,8],[122,7],[120,14]],
  [[95,5],[104,-2],[106,-6],[101,-3],[95,3]],
  [[109,2],[117,7],[119,1],[116,-4],[110,-3]],
  [[131,-1],[141,-3],[150,-10],[141,-9],[134,-4]],
  // Australia and New Zealand
  [[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-19],[153,-26],[150,-37],[141,-38],[135,-35],[130,-32],[115,-34]],
  [[172,-34],[178,-38],[175,-41],[172,-41]],
  [[172,-41],[174,-42],[170,-46],[167,-46]],
];

function inside(lon: number, lat: number, poly: number[][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Is this latitude and (geographic) longitude, in degrees, on land? */
function land(lat: number, lon: number) {
  return lat < -72 || LAND.some((poly) => inside(lon, lat, poly));
}

const POINT_SET = Array.from({ length: POINTS }, (_, i) => {
  const y = 1 - (i / (POINTS - 1)) * 2; // -1..1
  const r = Math.sqrt(1 - y * y);
  const theta = GOLDEN * i;
  return {
    x: Math.cos(theta) * r,
    y,
    z: Math.sin(theta) * r,
    // The sphere's x/z axes run west to east when seen from outside, so the geographic
    // longitude is the negated angle (otherwise the map would be mirrored).
    land: land((Math.asin(y) * 180) / Math.PI, -((Math.atan2(Math.sin(theta), Math.cos(theta)) * 180) / Math.PI)),
    // Two weights of land dot, as in Ondo's: a solid one and a lighter one.
    light: i % 3 === 0,
  };
});

/** Unit vector for a latitude and geographic longitude in degrees (same axes as POINT_SET). */
function vec(latDeg: number, lonDeg: number) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (-lonDeg * Math.PI) / 180;
  const r = Math.cos(lat);
  return { x: Math.cos(lon) * r, y: Math.sin(lat), z: Math.sin(lon) * r };
}

const ARC_STEPS = 48;
/** Decorative great-circle arcs lifted off the surface; each has its own phase so they never sync. */
const ARCS = (
  [
    [[40.7, -74], [51.5, -0.1]], // New York, London
    [[51.5, -0.1], [25.2, 55.3]], // London, Dubai
    [[25.2, 55.3], [1.3, 103.8]], // Dubai, Singapore
    [[1.3, 103.8], [35.7, 139.7]], // Singapore, Tokyo
    [[-23.5, -46.6], [6.5, 3.4]], // São Paulo, Lagos
    [[-26.2, 28], [25.2, 55.3]], // Johannesburg, Dubai
    [[35.7, 139.7], [37.8, -122.4]], // Tokyo, San Francisco
    [[-33.9, 151.2], [1.3, 103.8]], // Sydney, Singapore
  ] as const
).map(([from, to], k) => {
  const a = vec(from[0], from[1]);
  const b = vec(to[0], to[1]);
  const w = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
  const pts = Array.from({ length: ARC_STEPS + 1 }, (_, s) => {
    const t = s / ARC_STEPS;
    const sa = Math.sin((1 - t) * w) / Math.sin(w);
    const sb = Math.sin(t * w) / Math.sin(w);
    const lift = 1 + 0.14 * Math.sin(Math.PI * t) * Math.min(1, w / 1.6);
    return {
      x: (a.x * sa + b.x * sb) * lift,
      y: (a.y * sa + b.y * sb) * lift,
      z: (a.z * sa + b.z * sb) * lift,
    };
  });
  return { a, b, pts, phase: k * 0.37, speed: 0.22 + (k % 3) * 0.05 };
});

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * An Ondo-style dot-matrix sphere on a canvas: round dots that spin, fade toward the limb
 * and take the current tint (the colour glides from one tint to the next). Move the cursor
 * over it and the dots near it scatter, then spring back into place. Purely decorative and
 * `aria-hidden`. It draws one static frame under reduced motion (no spin, no scatter) and
 * stops drawing while off screen. Colours are read from the CSS tokens, never hard-coded.
 */
export function DotGlobe({ tint }: { tint: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angle = useRef(0.6);
  const clock = useRef(0);
  const reduce = useReduceMotion();
  const target = useRef<[number, number, number] | null>(null);
  const current = useRef<[number, number, number] | null>(null);
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    target.current = parseHex(getComputedStyle(document.documentElement).getPropertyValue(tint).trim());
    current.current ??= [...target.current];
    redraw.current();
  }, [tint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    // Per-dot screen-space offset and velocity (the scatter).
    const off = new Float32Array(POINTS * 2);
    const vel = new Float32Array(POINTS * 2);
    const mouse = { x: -9999, y: -9999 };
    const R = SIZE / 2 - 28; // leaves room for the arcs, which rise 14% above the surface

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      const cosA = Math.cos(angle.current);
      const sinA = Math.sin(angle.current);
      const c = current.current ?? [90, 134, 204];
      ctx.fillStyle = `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0})`;
      for (let i = 0; i < POINTS; i++) {
        const p = POINT_SET[i];
        const x = p.x * cosA + p.z * sinA;
        const z = -p.x * sinA + p.z * cosA;
        if (z < 0) continue;
        const bx = SIZE / 2 + x * R;
        const by = SIZE / 2 - p.y * R;

        if (dt > 0) {
          const dx = bx + off[i * 2] - mouse.x;
          const dy = by + off[i * 2 + 1] - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < REACH * REACH) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / REACH) * PUSH * dt;
            vel[i * 2] += (dx / d) * f;
            vel[i * 2 + 1] += (dy / d) * f;
          }
          for (let k = 0; k < 2; k++) {
            const j = i * 2 + k;
            vel[j] += (-off[j] * SPRING - vel[j] * DAMP) * dt;
            off[j] += vel[j] * dt;
          }
        }

        // Land is bold (large, near-opaque dots); the ocean is a whisper of small dots.
        ctx.globalAlpha = Math.pow(z, 0.45) * (p.land ? (p.light ? 0.78 : 1) : 0.065);
        ctx.beginPath();
        ctx.arc(
          bx + off[i * 2],
          by + off[i * 2 + 1],
          p.land ? 1.3 + z * 1.9 : 0.8 + z * 0.9,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      drawArcs(cosA, sinA, c);
      ctx.globalAlpha = 1;
    };

    // Arcs: a faint track, a bright comet running along it, and a pulsing dot at each end.
    const drawArcs = (cosA: number, sinA: number, c: [number, number, number]) => {
      const col = `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0})`;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineCap = "round";
      const proj = (p: { x: number; y: number; z: number }) => ({
        x: SIZE / 2 + (p.x * cosA + p.z * sinA) * R,
        y: SIZE / 2 - p.y * R,
        z: -p.x * sinA + p.z * cosA,
      });
      for (const arc of ARCS) {
        const head = ((clock.current * arc.speed + arc.phase) % 1.5) - 0.1;
        for (let s = 0; s < ARC_STEPS; s++) {
          const p0 = proj(arc.pts[s]);
          const p1 = proj(arc.pts[s + 1]);
          if (p0.z <= 0.02 || p1.z <= 0.02) continue;
          const t = (s + 0.5) / ARC_STEPS;
          const behind = head - t;
          const glow = behind >= 0 && behind < 0.3 ? 1 - behind / 0.3 : 0;
          ctx.globalAlpha = Math.min(1, p0.z * (0.22 + glow * 0.9));
          ctx.lineWidth = 1 + glow * 1.4;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        const hi = Math.min(ARC_STEPS, Math.max(0, Math.round(head * ARC_STEPS)));
        if (head > 0 && head < 1) {
          const h = proj(arc.pts[hi]);
          if (h.z > 0.02) {
            ctx.globalAlpha = Math.min(1, h.z);
            ctx.beginPath();
            ctx.arc(h.x, h.y, 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        for (const [k, end] of [arc.a, arc.b].entries()) {
          const e = proj(end);
          if (e.z <= 0.05) continue;
          const pulse = (clock.current * 0.9 + arc.phase * 3 + k * 0.5) % 1;
          ctx.globalAlpha = e.z * 0.9;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = e.z * (1 - pulse) * 0.5;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 3 + pulse * 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    redraw.current = () => draw(0);
    draw(0);
    if (reduce) return;

    let raf = 0;
    let last = performance.now();
    let visible = false;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      angle.current += dt * SPIN;
      clock.current += dt * 1.25;
      const t = target.current;
      const c = current.current;
      if (t && c) for (let k = 0; k < 3; k++) c[k] += (t[k] - c[k]) * Math.min(1, dt * 5);
      draw(dt);
    };
    raf = requestAnimationFrame(tick);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);

    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * SIZE;
      mouse.y = ((e.clientY - r.top) / r.height) * SIZE;
    };
    const leave = () => {
      mouse.x = mouse.y = -9999;
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      redraw.current = () => {};
    };
  }, [reduce]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: SIZE, aspectRatio: "1 / 1" }}
      className="mx-auto block max-w-full touch-pan-y"
    />
  );
}
