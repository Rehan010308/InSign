/**
 * Draws RAW and STABILIZED landmarks on the same canvas, at the same time.
 * That simultaneity is the product's signature: the jitter the hand actually
 * produced stays visible next to the trajectory the Kalman filter recovered,
 * so the stabilization is something you can see rather than something we claim.
 */
import type { LandmarkFrame } from '../../lib/sign/kalman';

export const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export interface OverlayColors {
  grid: string;
  raw: string;
  rawPoint: string;
  stable: string;
  stablePoint: string;
}

export function overlayColors(light: boolean): OverlayColors {
  return light
    ? {
        grid: 'rgba(43,38,30,0.07)',
        raw: 'rgba(43,38,30,0.34)',
        rawPoint: 'rgba(43,38,30,0.45)',
        stable: '#9C732C',
        stablePoint: '#B98A3E',
      }
    : {
        grid: 'rgba(255,255,255,0.045)',
        raw: 'rgba(245,244,241,0.28)',
        rawPoint: 'rgba(245,244,241,0.4)',
        stable: '#E8A33D',
        stablePoint: '#F2B45A',
      };
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  pts: LandmarkFrame,
  w: number,
  h: number,
  stroke: string,
  point: string,
  lineWidth: number,
  dashed: boolean,
  radius: number,
  mirror: boolean
) {
  const px = (i: number) => {
    const p = pts[i];
    return [mirror ? (1 - p.x) * w : p.x * w, p.y * h] as const;
  };

  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashed) ctx.setLineDash([4, 5]);

  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    if (!pts[a] || !pts[b]) continue;
    const [ax, ay] = px(a);
    const [bx, by] = px(b);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = point;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = px(i);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  raw: LandmarkFrame | null,
  stabilized: LandmarkFrame | null,
  colors: OverlayColors,
  mirror = true,
  secondRaw: LandmarkFrame | null = null,
  secondStabilized: LandmarkFrame | null = null
): void {
  const { width: w, height: h } = size;
  ctx.clearRect(0, 0, w, h);

  // the hairline grid from the landing page's movement demo
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (let x = 44; x < w; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 44; y < h; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  const pair = (r: LandmarkFrame | null, s: LandmarkFrame | null) => {
    if (r) drawSkeleton(ctx, r, w, h, colors.raw, colors.rawPoint, 1.4, true, 2, mirror);
    if (s) {
      ctx.save();
      ctx.shadowColor = 'rgba(166,124,51,0.35)';
      ctx.shadowBlur = 10;
      drawSkeleton(ctx, s, w, h, colors.stable, colors.stablePoint, 2.2, false, 3.2, mirror);
      ctx.restore();
    }
  };

  // The second hand is drawn the same way, so "two hands tracked" is something
  // the user can see rather than a claim in a chip.
  pair(secondRaw, secondStabilized);
  pair(raw, stabilized);
}

export interface TracePoint {
  x: number;
  y: number;
}

/**
 * The RAW vs STABILIZED trajectory strip.
 *
 * Both lines are the SAME landmark — the middle-finger knuckle — over the same
 * frames: one as the detector reported it, one as the Kalman filter estimated
 * it. Nothing here is generated or eased for effect; when the hand is steady
 * the two lines sit on top of each other, and when it is not, the difference
 * between them is the jitter the filter removed.
 */
export function drawTrace(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  raw: readonly TracePoint[],
  stabilized: readonly TracePoint[],
  colors: OverlayColors
): void {
  const { width: w, height: h } = size;
  ctx.clearRect(0, 0, w, h);
  if (raw.length < 2) return;

  // Both series share one vertical scale, or the comparison would be a lie.
  // The window is centred on the raw signal and never smaller than a floor, so
  // a steady hand shows as a flat pair of lines rather than as amplified noise.
  const ys = raw.map(p => p.y);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(0.05, (Math.max(...ys) - Math.min(...ys)) * 1.3);
  const px = (i: number, n: number) => (i / Math.max(1, n - 1)) * w;
  const py = (y: number) => h / 2 - ((y - mid) / span) * h;

  const line = (points: readonly TracePoint[], stroke: string, width: number, dashed: boolean) => {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([3, 4]);
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = px(i, points.length);
      const y = py(p.y);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  };

  line(raw, colors.raw, 1.2, true);
  line(stabilized, colors.stable, 2, false);
}
