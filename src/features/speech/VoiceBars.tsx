import { useEffect, useRef } from 'react';

const BARS = 28;

/** Middle bars react most, the ends least — the shape of a voice, not a chart. */
const WEIGHTS = Array.from({ length: BARS }, (_, i) => {
  const t = (i / (BARS - 1)) * 2 - 1;      // −1 … 1
  return 0.28 + 0.72 * Math.cos((t * Math.PI) / 2) ** 2;
});

/**
 * The listening indicator: bars driven by the actual microphone level.
 *
 * It writes transforms straight onto the DOM inside one animation frame loop,
 * so a whole session of speech causes no React renders at all. When the level
 * is unavailable — or the viewer asked for reduced motion — it holds a calm
 * resting shape instead of inventing movement, because a decorative waveform
 * that ignores the voice would be telling the user something untrue.
 */
export default function VoiceBars({
  level,
  active,
}: {
  level: { current: number };
  active: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const bars = Array.from(el.querySelectorAll<HTMLElement>('i'));

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!active || reduced) {
      bars.forEach((bar, i) => { bar.style.transform = `scaleY(${0.1 + WEIGHTS[i] * 0.12})`; });
      return;
    }

    let raf = 0;
    let phase = 0;
    const draw = () => {
      const value = level.current;
      phase += 0.09;
      for (let i = 0; i < bars.length; i++) {
        // A slow travelling wave keeps the bars alive between syllables without
        // ever exceeding what the microphone is actually reporting.
        const ripple = 0.72 + 0.28 * Math.sin(phase + i * 0.42);
        const height = 0.08 + value * WEIGHTS[i] * ripple * 1.25;
        bars[i].style.transform = `scaleY(${Math.min(1, height).toFixed(3)})`;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, level]);

  return (
    <div className={`voice-bars${active ? ' live' : ''}`} ref={host} aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => <i key={i} />)}
    </div>
  );
}
