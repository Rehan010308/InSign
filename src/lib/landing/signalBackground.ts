/* ============================================================
   InSign background — thin flowing signal lines, theme-aware.
   Ported verbatim from site/js/bg.js; returns a cleanup so the
   loop and its listeners die with the landing route.
   ============================================================ */

type Traveler = { u: number; speed: number; r: number; hue: 'gold' | 'line'; glowSeed: number };
type Line = {
  lane: number; dir: number; amp: number; waves: number; speed: number; phase: number;
  drift: number; alpha: number; yJit: number; travelers: Traveler[]; nextTraveler: number;
  hue: 'gold' | 'line'; pts: number[];
};

export function startSignalBackground(cv: HTMLCanvasElement): () => void {
  const ctx = cv.getContext('2d');
  if (!ctx) return () => {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  let W = 0, H = 0, dpr = 1;
  let lines: Line[] = [];
  let running = true, raf = 0;
  let scrollShade = 0, shadeTarget = 0;

  const col = { line: [245, 244, 241], gold: [232, 163, 61], tLine: [245, 244, 241], tGold: [232, 163, 61] };

  function readThemeColors() {
    const cs = getComputedStyle(root);
    const parse = (name: string, fallback: number[]) => {
      const v = (cs.getPropertyValue(name) || '').trim().match(/\d+/g);
      return v && v.length >= 3 ? v.slice(0, 3).map(Number) : fallback;
    };
    col.tLine = parse('--signal-line', col.tLine);
    col.tGold = parse('--signal-gold', col.tGold);
  }
  readThemeColors();
  document.addEventListener('insign:theme', readThemeColors);

  function lerpCol(c: number[], t: number[]) {
    for (let i = 0; i < 3; i++) c[i] += (t[i] - c[i]) * 0.04;
  }
  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  function makeLine(i: number, n: number): Line {
    const lane = (i + rand(-0.35, 0.35)) / n;
    const dir = Math.random() < 0.5 ? 1 : -1;
    return {
      lane, dir,
      amp: rand(14, 52),
      waves: rand(0.9, 1.8),
      speed: rand(0.008, 0.02) * (Math.random() < 0.5 ? 1 : -1),
      phase: rand(0, Math.PI * 2),
      drift: rand(2, 10),
      alpha: rand(0.05, 0.14),
      yJit: rand(-40, 40),
      travelers: [],
      nextTraveler: rand(1, 6),
      hue: Math.random() < 0.22 ? 'gold' : 'line',
      pts: [],
    };
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // The canvas is sized by CSS (100vw/100vh); we only match the backing store.
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = W < 768 ? 6 : W < 1440 ? 8 : 10;
    lines = Array.from({ length: count }, (_, i) => {
      const l = makeLine(i, count);
      l.pts = [];
      for (let x = -20; x <= W + 20; x += 14) l.pts.push(x);
      return l;
    });
  }

  function pathY(l: Line, x: number, t: number) {
    const u = x / W;
    const laneY = l.lane * H + l.yJit + Math.sin(t * 0.05 + l.phase) * l.drift;
    const wave =
      Math.sin(u * Math.PI * 2 * l.waves + l.phase + t * l.speed * 60) * l.amp +
      Math.sin(u * Math.PI * 2 * l.waves * 2.3 - t * l.speed * 38 + l.phase * 1.7) * l.amp * 0.3;
    return laneY + wave;
  }

  function drawLine(l: Line, t: number) {
    const rgb = l.hue === 'gold' ? col.gold : col.line;
    const grad = ctx!.createLinearGradient(0, 0, W, 0);
    const a = l.alpha * (1 - scrollShade * 0.75);
    grad.addColorStop(0, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0)`);
    grad.addColorStop(0.18, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${(a * 0.7).toFixed(3)})`);
    grad.addColorStop(0.5, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a.toFixed(3)})`);
    grad.addColorStop(0.82, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${(a * 0.7).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0)`);
    ctx!.strokeStyle = grad;
    ctx!.lineWidth = 1;
    ctx!.beginPath();
    for (const x of l.pts) {
      const y = pathY(l, x, t);
      if (x === l.pts[0]) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
    }
    ctx!.stroke();
  }

  function drawTravelers(l: Line, t: number, dt: number) {
    for (let i = l.travelers.length - 1; i >= 0; i--) {
      const tr = l.travelers[i];
      tr.u += tr.speed * dt;
      const off = Math.abs(tr.u - 0.5) * 2;
      if (tr.u < -0.08 || tr.u > 1.08) { l.travelers.splice(i, 1); continue; }
      const x = tr.u * W;
      const y = pathY(l, x, t);
      const rgb = tr.hue === 'gold' ? col.gold : col.line;
      const tw = 0.75 + 0.25 * Math.sin(t * 3 + tr.glowSeed);
      const a = Math.max(0, 1 - off) * tw;
      ctx!.beginPath();
      ctx!.arc(x, y, tr.r, 0, 7);
      ctx!.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${(a * 0.9).toFixed(3)})`;
      ctx!.shadowColor = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.8)`;
      ctx!.shadowBlur = 8;
      ctx!.fill();
      ctx!.shadowBlur = 0;
    }
    l.nextTraveler -= dt;
    if (l.nextTraveler <= 0) {
      if (l.travelers.length < 2) {
        l.travelers.push({
          u: l.dir > 0 ? -0.05 : 1.05,
          speed: rand(0.05, 0.12) * l.dir,
          r: rand(1.2, 2.1),
          hue: Math.random() < 0.5 ? 'gold' : 'line',
          glowSeed: rand(0, 6.28),
        });
      }
      l.nextTraveler = rand(2.5, 9);
    }
  }

  let last = 0;
  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const t = now / 1000;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    lerpCol(col.line, col.tLine);
    lerpCol(col.gold, col.tGold);
    ctx!.clearRect(0, 0, W, H);
    scrollShade += (shadeTarget - scrollShade) * 0.05;
    for (const l of lines) {
      drawLine(l, t);
      drawTravelers(l, t, dt);
    }
  }

  const onScroll = () => { shadeTarget = Math.min(0.85, scrollY / (innerHeight * 1.5)); };
  const onVisibility = () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else if (!running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', layout);
  document.addEventListener('visibilitychange', onVisibility);

  layout();
  if (reduced) {
    frame(performance.now());
    running = false;
    cancelAnimationFrame(raf);
  } else {
    raf = requestAnimationFrame(frame);
  }

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', layout);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('insign:theme', readThemeColors);
  };
}
