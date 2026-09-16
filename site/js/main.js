/* ============================================================
   InSign — v3 interactions. Animations that explain the product.
   Uses IntersectionObserver, with a scroll-pump fallback so
   triggers stay reliable even in throttled/embedded webviews.
   ============================================================ */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = matchMedia('(hover: none)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ------------------------------------------------------------
     whenVisible(el, cb, threshold) — IO primary, scroll-pump
     fallback (getBoundingClientRect) so triggers fire even if
     IntersectionObserver is throttled (background webviews).
     cb fires exactly once; the element stops being tracked.
  ------------------------------------------------------------ */
  function whenVisible(el, cb, threshold = 0.3) {
    if (!el) return;
    let done = false;
    const fire = () => { if (done) return; done = true; stopPump(el); cb(); };
    let io = null;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) fire();
      }), { threshold });
      io.observe(el);
    }
    // fallback registry
    pumpSet.set(el, { cb: fire, threshold, io });
    // also check immediately (element may already be on screen)
    requestAnimationFrame(() => { if (inView(el, threshold)) fire(); });
  }
  const pumpSet = new Map();
  function inView(el, threshold) {
    const r = el.getBoundingClientRect();
    const vh = innerHeight;
    if (r.height === 0) return false;
    const visibleFraction = Math.min(1, Math.max(0,
      (Math.min(r.bottom, vh) - Math.max(r.top, 0)) / Math.min(r.height, vh)));
    return visibleFraction >= threshold * 0.9 || (r.top < vh * 0.85 && r.bottom > 0 && threshold <= 0.2);
  }
  function stopPump(el) { pumpSet.delete(el); }

  let pumpQueued = false;
  function pump() {
    pumpQueued = false;
    if (!pumpSet.size) return;
    for (const [el, rec] of [...pumpSet]) {
      if (inView(el, rec.threshold)) { if (rec.io) rec.io.disconnect(); rec.cb(); pumpSet.delete(el); }
    }
  }
  function queuePump() {
    if (!pumpQueued && pumpSet.size) { pumpQueued = true; requestAnimationFrame(pump); }
  }
  addEventListener('scroll', queuePump, { passive: true });
  addEventListener('resize', queuePump);

  /* ---------------- theme toggle (smooth, persistent) ---------------- */
  const themeBtn = $('#theme-toggle');
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    if (themeBtn) {
      themeBtn.setAttribute('aria-pressed', t === 'light');
      themeBtn.setAttribute('aria-label', t === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    }
    try { localStorage.setItem('insign-theme', t); } catch (e) {}
    document.dispatchEvent(new CustomEvent('insign:theme', { detail: t }));
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    });
  }

  /* ---------------- nav ---------------- */
  const nav = $('#nav');
  addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 80), { passive: true });

  /* ---------------- reveals ---------------- */
  $$('.rv, .mask, .phil-lines p').forEach(el => whenVisible(el, () => el.classList.add('in-view'), 0.16));
  setTimeout(() => $$('#hero .rv, #hero .mask').forEach(el => el.classList.add('in-view')), reduced ? 0 : 350);

  /* ---------------- 03 · speech story · scroll-driven sequencer ---------------- */
  /* A gold pulse travels the vertical spine with scroll; each stage it
     passes wakes up. The waveform lives in stage 2 and never stops
     while visible. Convergence chips appear as the story resolves. */
  const story = $('#speech-story');
  if (story) {
    const orb = $('#story-orb');
    const waveSvg = $('#story-wave');
    const patterns = $('#story-patterns');
    const nodes = $$('.sflow-node', story);
    const stages = $$('.sflow-stage', story);
    const patternChip = $('#pattern-chip');
    const nextChip = $('#next-chip');
    const spine = $('.sflow-spine', story);

    // progressive fill for the spine
    const fill = document.createElement('div');
    fill.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:var(--seg-dim);transform:scaleY(0);transform-origin:top;transition:transform 360ms var(--ease-soft)';
    spine.appendChild(fill);

    // two wave paths + small particles riding the voice signal
    const svgNS = 'http://www.w3.org/2000/svg';
    const paths = [0, 1].map(i => {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('fill', 'none');
      p.setAttribute('class', i ? 'vg' : '');
      waveSvg.appendChild(p);
      return p;
    });
    const dots = Array.from({ length: 6 }, () => {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('r', '1.6');
      waveSvg.appendChild(c);
      return c;
    });

    let progress = 0, syncRaf = 0, waveRaf = 0, waveOn = false;

    function sync() {
      const p = progress;
      fill.style.transform = `scaleY(${p.toFixed(3)})`;
      nodes.forEach((n, i) => n.classList.toggle('hot', i / (nodes.length - 1) <= p + 0.02));
      stages.forEach((st, i) => st.classList.toggle('on', p >= i / (stages.length - 1) - 0.02));
      patterns && patterns.classList.toggle('on', p >= 0.6);
      patternChip && patternChip.classList.toggle('on', p >= 0.8);
      nextChip && nextChip.classList.toggle('on', p >= 0.93);
    }

    function update() {
      syncRaf = 0;
      const vh = innerHeight;
      const r = story.getBoundingClientRect();
      const raw = (vh * 0.85 - r.top) / (r.height * 0.72);
      const target = clamp(raw, 0, 1);
      progress += (target - progress) * 0.14;
      if (Math.abs(target - progress) < 0.0015) progress = target;
      sync();
      if (orb) orb.classList.toggle('live', progress > 0.02 && r.top < vh && r.bottom > 0);
      if (progress !== target) syncRaf = requestAnimationFrame(update);
    }
    function queueUpdate() { if (!syncRaf) syncRaf = requestAnimationFrame(update); }
    addEventListener('scroll', queueUpdate, { passive: true });
    addEventListener('resize', queueUpdate);

    function waveTick(now) {
      const t = now / 1000;
      for (let pi = 0; pi < 2; pi++) {
        const off = pi * 2.1;
        let d = '';
        for (let x = 0; x <= 420; x += 8) {
          const u = x / 420;
          const env = Math.pow(Math.sin(u * Math.PI), 1.3);
          const y = 43
            + Math.sin(u * 19 + t * 1.6 + off) * 12 * env
            + Math.sin(u * 43 - t * 2.4 + off) * 5 * env
            + Math.sin(u * 77 + t * 1.1) * 2 * env;
          d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1) + ' ';
        }
        paths[pi].setAttribute('d', d);
      }
      dots.forEach((c, i) => {
        const u = (t * (0.09 + i * 0.016) + i * 0.17) % 1.12;
        const env = Math.pow(Math.sin(Math.min(1, u) * Math.PI), 1.3);
        c.setAttribute('cx', (u * 420).toFixed(1));
        c.setAttribute('cy', (43 + Math.sin(u * 19 + t * 1.6) * 12 * env).toFixed(1));
        c.style.opacity = (u < 0.03 || u > 1.1 ? 0 : 0.35 + 0.4 * Math.sin(t * 3 + i)).toFixed(2);
      });
    }
    function waveLoop(now) {
      const r = story.getBoundingClientRect();
      if (r.bottom < -60 || r.top > innerHeight + 60) { waveOn = false; waveRaf = 0; return; }
      waveTick(now);
      waveRaf = requestAnimationFrame(waveLoop);
    }
    function waveStart() { if (waveOn) return; waveOn = true; waveRaf = requestAnimationFrame(waveLoop); }
    addEventListener('scroll', () => { const r = story.getBoundingClientRect(); if (r.top < innerHeight + 60 && r.bottom > -60) waveStart(); }, { passive: true });

    if (reduced) {
      // static final state: story fully told, no motion
      progress = 1; sync();
      stages.forEach(s => s.classList.add('on'));
      patterns && patterns.classList.add('on');
      patternChip && patternChip.classList.add('on');
      nextChip && nextChip.classList.add('on');
      for (let pi = 0; pi < 2; pi++) {
        let d = '';
        for (let x = 0; x <= 420; x += 8) {
          const u = x / 420;
          const env = Math.pow(Math.sin(u * Math.PI), 1.3);
          const y = 43 + Math.sin(u * 19 + pi * 2.1) * 12 * env + Math.sin(u * 43) * 5 * env;
          d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1) + ' ';
        }
        paths[pi].setAttribute('d', d);
      }
    } else {
      queueUpdate();
      waveStart();
    }
  }

  /* ---------------- 04 · session timeline ---------------- */
  const sessions = $('#sessions');
  if (sessions) {
    const cards = $$('.sess', sessions);
    whenVisible(sessions, () => {
      sessions.classList.add('played');
      cards.forEach((c, i) => setTimeout(() => c.classList.add('on'), reduced ? 0 : 300 + i * 550));
      const det = $('#detect');
      if (det) {
        const chip = $('.pattern-chip', det);
        const h3 = $('h3', det);
        setTimeout(() => chip && chip.classList.add('on'), reduced ? 0 : 300 + cards.length * 550 + 200);
        setTimeout(() => h3 && h3.classList.add('on'), reduced ? 0 : 300 + cards.length * 550 + 500);
      }
    }, 0.35);
    if (reduced) cards.forEach(c => c.classList.add('on'));
  }

  /* ---------------- 06 · movement raw → stabilized → recognized ---------------- */
  const stage = $('.mv-stage');
  if (stage) {
    const cv = $('#mv-canvas');
    const ctx = cv.getContext('2d');
    const result = $('#mv-result');
    const confFill = $('#mv-conf-fill');
    const steps = $$('.mv-step');
    let W = 0, H = 0, shown = reduced ? 1 : 0, target = reduced ? 1 : 0, played = reduced, raf = 0;

    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = stage.clientWidth; H = stage.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(shown);
    }

    const N = 90, raw = [], smooth = [];
    (function build() {
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const ax = t => 0.06 + t * 0.88;
      const ay = t => 0.78 - 0.52 * t - 0.16 * Math.sin(t * Math.PI);
      for (let i = 0; i <= N; i++) {
        const t = i / N, sx = ax(t), sy = ay(t);
        smooth.push([sx, sy]);
        const n1 = Math.sin(t * 47 + rnd() * 6) * 0.028;
        const n3 = (rnd() - 0.5) * 0.02;
        raw.push([sx + n1 + n3, sy + Math.sin(t * 91 + 2.2) * 0.014 + Math.abs(n1) * 0.7 + n3]);
      }
    })();

    function themeColors() {
      const light = document.documentElement.dataset.theme === 'light';
      return {
        grid: light ? 'rgba(43,38,30,0.07)' : 'rgba(255,255,255,0.04)',
        raw: light ? 'rgba(43,38,30,0.4)' : 'rgba(245,244,241,0.32)',
        edge: light ? '#B98A3E' : '#F2B45A'
      };
    }

    function draw(p) {
      const c = themeColors();
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
      for (let x = 44; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 44; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      const px = ([nx, ny]) => [nx * W, ny * H];
      if (p > 0.001) {
        ctx.beginPath();
        raw.forEach((pt, i) => { const [x, y] = px(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.strokeStyle = c.raw; ctx.lineWidth = 1.4; ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
      }
      const upTo = Math.max(2, Math.floor(smooth.length * p));
      if (p > 0.02) {
        ctx.beginPath();
        for (let i = 0; i < upTo; i++) { const [x, y] = px(smooth[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#E8A33D';
        ctx.lineWidth = 2.2; ctx.lineJoin = ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(166,124,51,0.35)'; ctx.shadowBlur = 10;
        ctx.stroke(); ctx.shadowBlur = 0;
        const [hx, hy] = px(smooth[upTo - 1]);
        ctx.beginPath(); ctx.arc(hx, hy, 3, 0, 7); ctx.fillStyle = c.edge; ctx.fill();
      }
      const done = p > 0.96;
      result.classList.toggle('show', done);
      if (confFill) confFill.style.width = done ? '91%' : Math.round(p * 91) + '%';
      steps.forEach((s, i) => s.classList.toggle('hot', p > i * 0.33));
    }

    function loop() {
      shown += (target - shown) * 0.075;
      if (Math.abs(target - shown) < 0.0008) shown = target;
      draw(shown);
      if (shown !== target) raf = requestAnimationFrame(loop); else raf = 0;
    }
    function go() { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }

    whenVisible(stage, () => { if (!played) { played = true; target = 1; go(); } }, 0.35);
    $('#mv-replay').addEventListener('click', () => { shown = 0; target = 1; go(); });
    document.addEventListener('insign:theme', () => draw(shown));
    addEventListener('resize', size);
    size();
  }

  /* ---------------- 07 · pipelines (signal plays while visible) ---------------- */
  $$('[data-pipe]').forEach(pipe => {
    const flow = $('.pipe-flow', pipe);
    if (!flow) return;
    whenVisible(pipe, () => { if (!reduced) flow.classList.add('playing'); }, 0.45);
    // stop when far off-screen
    addEventListener('scroll', () => {
      const r = pipe.getBoundingClientRect();
      if (r.bottom < -120 || r.top > innerHeight + 120) flow.classList.remove('playing');
    }, { passive: true });
  });

  /* ---------------- 09 · contact signal ---------------- */
  const contact = $('#contact');
  if (contact) {
    whenVisible(contact, () => contact.classList.add('played'), 0.45);
  }

  /* ---------------- subtle parallax on story/pipeline panels ---------------- */
  if (!reduced && !isTouch) {
    const panels = $$('.story, .movement, .pipe');
    let ticking = false;
    function parallax() {
      ticking = false;
      const vh = innerHeight;
      panels.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const off = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = `translateY(${(-off * 14).toFixed(1)}px)`;
      });
    }
    addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(parallax); queuePump(); }
    }, { passive: true });
    parallax();
  }

  /* ---------------- magnetic CTAs ---------------- */
  if (!reduced && !isTouch) {
    $$('.magnetic').forEach(btn => {
      let raf;
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          btn.style.transform = `translate(${clamp(dx * 0.12, -5, 5)}px, ${clamp(dy * 0.18, -4, 4)}px)`;
        });
      });
      btn.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); btn.style.transform = ''; });
    });
  }
})();
