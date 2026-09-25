"use client";

import { useEffect, useState } from "react";

const COLORS = ["var(--t0-solid)", "var(--t1-solid)", "var(--t2-solid)", "var(--t3-solid)", "var(--t4-solid)", "var(--t5-solid)"];

// Fixed layout (no Math.random) so server and client markup agree.
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  dx: `${((i * 53) % 120) - 60}px`,
  rot: `${360 + ((i * 71) % 540)}deg`,
  delay: `${((i * 13) % 12) / 10}s`,
  dur: `${2.4 + ((i * 7) % 10) / 10}s`,
  color: COLORS[i % COLORS.length],
}));

/** One short burst of confetti. Not rendered at all when the user prefers reduced motion. */
export function Confetti() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = window.setTimeout(() => setShow(true), 0);
    const stop = window.setTimeout(() => setShow(false), 4200);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, []);

  if (!show) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-30 h-dvh overflow-hidden">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{ left: p.left, background: p.color, "--dx": p.dx, "--rot": p.rot, "--delay": p.delay, "--dur": p.dur } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
