"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { foldProgress } from "@/lib/fold";
import { useReduceMotion } from "@/lib/stage";

const WIDE = "(min-width: 1280px)";
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const wideSource = () => (window.matchMedia(WIDE).matches ? "/hero/hero-1080.mp4" : "/hero/hero-720.mp4");

// The one hero video element, so the folded squares can show the same moving picture.
let heroVideo: HTMLVideoElement | null = null;

/**
 * The hero picture: one landscape 16:9 video that covers the whole hero (`object-cover`). It
 * always autoplays and loops; there is no pause control. Two silent encodes, chosen once on
 * mount: public/hero/hero-1080.mp4 (1920 x 1080) for screens at least 1280px wide and
 * public/hero/hero-720.mp4 (1280 x 720) below that. The clip is a 3.2s dusk-to-night
 * timelapse, slowed to 70% speed in the encode, and each file plays it forward and then in
 * reverse (about 8.9s) to loop without a jump. The first frame (public/hero/hero-still.jpg)
 * is server-rendered and preloaded, is the video's poster, and is all that shows under
 * reduced motion.
 */
export function HeroMedia({ priority = false }: { priority?: boolean }) {
  const reduce = useReduceMotion();
  // Which encode to load. The server (and hydration) have no screen, so nothing loads until the client knows.
  const src = useSyncExternalStore(subscribeWide, wideSource, () => null);

  return reduce ? (
    <HeroStill priority={priority} />
  ) : (
    <>
      <Image src="/hero/hero-still.jpg" alt="" fill sizes="100vw" priority={priority} className="object-cover" />
      {src ? (
        <video
          ref={(el) => {
            heroVideo = el;
          }}
          className="absolute inset-0 h-full w-full object-cover"
          src={src}
          poster="/hero/hero-still.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

/** The still version (the first frame, covering): used under reduced motion. */
export function HeroStill({ priority = false }: { priority?: boolean }) {
  return <Image src="/hero/hero-still.jpg" alt="" fill sizes="100vw" priority={priority} className="object-cover" />;
}

/**
 * The folded squares' picture: a canvas that copies each frame of the hero video, so the
 * three concentric squares show the same single, synchronised video (only one is decoded).
 * It only draws once the fold has started; before the first frame it shows the still.
 */
export function HeroMirror() {
  const reduce = useReduceMotion();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || reduce) return;
    let raf = 0;
    // Frames are only copied while this canvas is actually on screen: once the page has scrolled past
    // the hero the loop idles instead of redrawing two 960 x 540 canvases sixty times a second.
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(c);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = heroVideo;
      if (!visible || foldProgress.get() < 0.005 || !v || v.readyState < 2) return;
      ctx.drawImage(v, 0, 0, c.width, c.height);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [reduce]);

  if (reduce) return <HeroStill />;
  return (
    <canvas
      ref={canvas}
      width={960}
      height={540}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
      style={{ backgroundImage: "url(/hero/hero-still.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
    />
  );
}
