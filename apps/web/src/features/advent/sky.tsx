"use client";

import { PropsWithChildren, useEffect, useRef, useState } from "react";
import * as ls from "@/utils/local-storage";

const SNOW_KEY = "advent_snow";
const BULB_COLORS = ["#ff4d5e", "#ffcf4d", "#4fdc8a", "#59b7ff"];

/// The reader's Snow switch, remembered in this browser. Snow is on unless
/// they turned it off.
export function useSnowSwitch(): [boolean, () => void] {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(ls.get(SNOW_KEY) !== "off"), []);
  const toggle = () =>
    setOn((v) => {
      ls.set(SNOW_KEY, v ? "off" : "on");
      return !v;
    });
  return [on, toggle];
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/// Falling snow on a canvas behind the sky's content. It only runs while the
/// sky is on screen and the tab is visible; with motion turned off in the
/// reader's settings the flakes stand still.
function Snow({ on }: { on: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    // nothing to draw on before layout (and never in a test DOM)
    if (!canvas || !on || canvas.clientWidth === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = prefersReducedMotion();
    let w = 0;
    let h = 0;
    let flakes: { x: number; y: number; r: number; v: number; p: number; s: number }[] = [];
    const setup = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(110, Math.round((w * h) / 2600));
      flakes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.7 + Math.random() * 2.1,
        v: 0.25 + Math.random() * 0.8,
        p: Math.random() * 6.28,
        s: 0.3 + Math.random() * 0.7
      }));
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      for (const k of flakes) {
        if (!still) {
          k.y += k.v;
          k.x += Math.sin(t / 1400 + k.p) * k.s * 0.4;
          if (k.y > h + 3) {
            k.y = -3;
            k.x = Math.random() * w;
          }
        }
        ctx.globalAlpha = 0.45 + k.r / 5;
        ctx.beginPath();
        ctx.arc(k.x, k.y, k.r, 0, 6.283);
        ctx.fill();
      }
    };
    setup();
    draw(0);
    if (still) return () => ctx.clearRect(0, 0, w, h);

    let frame = 0;
    let visible = true;
    const loop = (t: number) => {
      draw(t);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!frame && visible) frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => setup());
    ro.observe(canvas);
    start();
    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      ctx.clearRect(0, 0, w, h);
    };
  }, [on]);

  return <canvas ref={ref} className="adv-snow" aria-hidden="true" />;
}

/// A string of lights hanging along the top of the sky.
function Lights({ count }: { count: number }) {
  let d = "M0 4";
  for (let i = 0; i < count; i++) d += ` Q${i * 40 + 20} 22 ${(i + 1) * 40} 4`;
  return (
    <div className="adv-lights" aria-hidden="true">
      <svg className="adv-wire" viewBox={`0 0 ${count * 40} 26`} preserveAspectRatio="none" data-icon-exempt>
        <path d={d} vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="adv-bulb"
          style={
            {
              left: `${((i * 40 + 20) / (count * 40)) * 100}%`,
              "--c": BULB_COLORS[i % 4],
              "--d": `${-((i * 0.37) % 1.8)}s`,
              "--t": `${1.5 + (i % 3) * 0.4}s`
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/// Snowy hills with two little pines, along the bottom of the header.
function Scene() {
  return (
    <div className="adv-scene" aria-hidden="true">
      <svg className="adv-scene-art" viewBox="0 0 800 64" preserveAspectRatio="xMidYMax slice" data-icon-exempt>
        <g fill="#0d3f2e">
          <path d="M70 50 92 8 114 50z" />
          <path d="M112 54 128 22 144 54z" />
          <path d="M640 52 664 4 688 52z" />
          <path d="M690 56 706 26 722 56z" />
          <path d="M560 58 572 36 584 58z" />
        </g>
        <g fill="#fff" opacity=".85">
          <path d="M84 24 92 8 100 24c-3 2-5-1-8 1s-5-1-8-1z" />
          <path d="M656 20 664 4 672 20c-3 2-5-1-8 1s-5-1-8-1z" />
        </g>
        <circle cx="92" cy="8" r="2.6" fill="#ffd978" />
        <circle cx="664" cy="4" r="2.6" fill="#ffd978" />
        <path d="M0 64V44c90-14 180-12 260 2s170 14 270-4 190-10 270 2v20z" fill="#e8f0fa" />
        <path d="M0 64V54c120-10 240-6 360 2s260 4 440-6v14z" fill="#fff" />
      </svg>
    </div>
  );
}

interface SkyProps {
  className?: string;
  bulbs?: number;
  scene?: boolean;
  snow: boolean;
}

/// The winter night behind the header, the door art and the feed banner.
export function Sky({ className = "", bulbs = 16, scene = false, snow, children }: PropsWithChildren<SkyProps>) {
  return (
    <div className={`adv-sky ${className}`}>
      <Snow on={snow} />
      <Lights count={bulbs} />
      {scene && <Scene />}
      {children}
    </div>
  );
}
