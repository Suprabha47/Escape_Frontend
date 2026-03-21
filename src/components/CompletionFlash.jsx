/**
 * CompletionFlash.jsx
 * ===================
 * Full-screen canvas burst animation that fires when a step is completed.
 * Completely self-contained — App.jsx just calls flash(stepIndex).
 *
 * Usage:
 *   const flashRef = useRef();
 *   <CompletionFlash ref={flashRef} />
 *   flashRef.current.flash(stepIndex);  // call from anywhere
 */

import { useRef, useImperativeHandle, forwardRef, useEffect, useCallback } from "react";
import styles from "./CompletionFlash.module.css";

// Six muted palettes — one per step index (cycles)
const PALETTES = [
  ["#7eb8a4", "#4a9980", "#b8e0d4"],
  ["#c4956a", "#a87040", "#e0c0a0"],
  ["#a07ab0", "#7858a0", "#ccaadc"],
  ["#7a9fc4", "#5080b0", "#b0ccec"],
  ["#c47a7a", "#b05858", "#e0b4b4"],
  ["#a0c47a", "#78a050", "#c8e4b0"],
];

const RINGS    = 8;
const DURATION = 850;

const CompletionFlash = forwardRef(function CompletionFlash(_, ref) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);

  const flash = useCallback((stepIndex = 0) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");
    const pal = PALETTES[stepIndex % PALETTES.length];
    const cx  = canvas.width  / 2;
    const cy  = canvas.height / 2;
    const maxR = Math.hypot(cx, cy) * 1.25;

    const rings = Array.from({ length: RINGS }, (_, i) => ({
      targetR : maxR * ((i + 1) / RINGS),
      color   : pal[i % pal.length],
      lw      : (RINGS - i) * 22 + 6,
      delay   : i * 0.055,
    }));

    let start = null;

    const draw = (ts) => {
      if (!start) start = ts;
      const t    = Math.min((ts - start) / DURATION, 1);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Full-screen color wash — fades quickly
      ctx.fillStyle   = pal[0];
      ctx.globalAlpha = Math.max(0, 0.18 * (1 - t * 1.6));
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;

      // Expanding rings with staggered delays
      rings.forEach((p) => {
        const lt = Math.max(0, Math.min((t - p.delay) / (1 - p.delay), 1));
        if (lt <= 0) return;
        const le = 1 - Math.pow(1 - lt, 3); // ease-out cubic
        ctx.beginPath();
        ctx.arc(cx, cy, p.targetR * le, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth   = p.lw * (1 - lt * 0.55);
        ctx.globalAlpha = Math.max(0, (1 - lt * 1.2) * 0.65);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      if (t < 1) {
        animRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(draw);
  }, []);

  // Expose flash() to parent via ref
  useImperativeHandle(ref, () => ({ flash }), [flash]);

  // Cleanup on unmount
  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
});

export default CompletionFlash;
