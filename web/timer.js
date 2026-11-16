/*
 * Élan for ensembles: code shared by the conductor's page and the displays.
 * Copyright (C) 2026 Alessandro Ciccarelli
 * Released under the GNU General Public License, version 3 or later.
 */
'use strict';
const Elan = (() => {
  // ---- Seven-segment digits, the same drawing as the Android app ----
  const SEG = { 0:'abcdef', 1:'bc', 2:'abged', 3:'abgcd', 4:'fgbc', 5:'afgcd', 6:'afgedc', 7:'abc', 8:'abcdefg', 9:'abcdfg' };
  const DW = 0.58, GAP = 0.13, CW = 0.30, ROWGAP = 0.16, SKEW = 0.07; // proportions of the digit height
  const OFF = 'rgba(255,255,255,0.045)';
  const rowUnits = s => [...s].reduce((u, ch, i) => u + (ch === ':' ? CW : DW) + (i ? GAP : 0), 0) + SKEW;

  function drawDigit(ctx, x, y, h, d, on) {
    const w = DW * h, t = 0.13 * h, g = t * 0.14;
    const L = x + t / 2, R = x + w - t / 2, T = y + t / 2, M = y + h / 2, B = y + h - t / 2;
    const hz = (x0, x1, yy) => [[x0 + g, yy], [x0 + g + t / 2, yy - t / 2], [x1 - g - t / 2, yy - t / 2], [x1 - g, yy], [x1 - g - t / 2, yy + t / 2], [x0 + g + t / 2, yy + t / 2]];
    const vt = (xx, y0, y1) => [[xx, y0 + g], [xx + t / 2, y0 + g + t / 2], [xx + t / 2, y1 - g - t / 2], [xx, y1 - g], [xx - t / 2, y1 - g - t / 2], [xx - t / 2, y0 + g + t / 2]];
    const segs = { a: hz(L, R, T), g: hz(L, R, M), d: hz(L, R, B), f: vt(L, T, M), b: vt(R, T, M), e: vt(L, M, B), c: vt(R, M, B) };
    const lit = SEG[d] || '';
    for (const k in segs) {
      ctx.fillStyle = lit.includes(k) ? on : OFF;
      ctx.beginPath();
      segs[k].forEach(([px, py], i) => {
        const sx = px + (y + h - py) * SKEW; // LED-display slant
        i ? ctx.lineTo(sx, py) : ctx.moveTo(sx, py);
      });
      ctx.closePath(); ctx.fill();
    }
  }
  function drawColon(ctx, x, y, h, on) {
    const s = 0.13 * h, cx = x + CW * h / 2 - s / 2;
    ctx.fillStyle = on;
    [0.3, 0.7].forEach(p => {
      const py = y + h * p - s / 2;
      ctx.fillRect(cx + (y + h - py - s / 2) * SKEW, py, s, s);
    });
  }
  // Draws text ("12:34") as large as the box allows: one row, or minutes above seconds
  // if that gives bigger digits (portrait screens).
  function draw(canvas, box, text, color) {
    const W = box.clientWidth, H = box.clientHeight;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const MINSX = 0.55;
    const layout = rows => {
      const n = rows.length, u = Math.max(...rows.map(rowUnits));
      let h = H * 0.96 / (n + (n - 1) * ROWGAP);
      let sx = Math.min(1, W * 0.97 / (u * h));
      if (sx < MINSX) { sx = MINSX; h = W * 0.97 / (u * MINSX); }
      return { rows, h, sx, score: h * Math.sqrt(sx) };
    };
    const A = layout([text]), Bl = layout(text.split(':').length === 2 ? text.split(':') : [text]);
    const { rows, h, sx } = Bl.score > A.score * 1.1 ? Bl : A;
    const totalH = rows.length * h + (rows.length - 1) * ROWGAP * h;
    let y = (H - totalH) / 2;
    for (const r of rows) {
      ctx.save();
      ctx.translate((W - rowUnits(r) * h * sx) / 2, 0);
      ctx.scale(sx, 1);
      let x = 0;
      [...r].forEach((ch, i) => {
        if (i) x += GAP * h;
        if (ch === ':') { drawColon(ctx, x, y, h, color); x += CW * h; }
        else { drawDigit(ctx, x, y, h, +ch, color); x += DW * h; }
      });
      ctx.restore();
      y += h * (1 + ROWGAP);
    }
    canvas.setAttribute('aria-label', text);
  }

  // ---- Clock: offset from the server, from the sample with the shortest round trip ----
  const samples = [];
  let skew = 0;
  function sample(t0, serverNow, t1) {
    if (!serverNow) return;
    samples.push({ rtt: t1 - t0, skew: serverNow - (t0 + t1) / 2 });
    if (samples.length > 20) samples.shift();
    skew = samples.reduce((a, b) => b.rtt < a.rtt ? b : a).skew;
  }
  const now = () => Date.now() + skew; // server time

  // ---- Timer state → what to show at server time t ----
  // elapsed = acc + time run since `since`, stopped at `until` if paused.
  function view(s, t = now()) {
    const setup = s.since === null && s.acc === 0;
    const el = setup ? 0 : s.acc + (s.since === null ? 0 : Math.max(0, Math.min(t, s.until ?? Infinity) - s.since));
    const paused = !setup && s.until !== null && t >= s.until;
    const waiting = !setup && s.since !== null && t < s.since && s.acc === 0; // Start sent, not yet in effect
    if (setup || el < s.target) {
      const left = s.target - el;
      return { phase: setup ? 'setup' : 'count', paused, waiting, el, text: fmt(Math.ceil(left / 1000)), color: s.count };
    }
    return { phase: 'run', paused, waiting, el, text: fmt(Math.floor((el - s.target) / 1000)), color: s.run };
  }
  function fmt(t) {
    const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    const p = n => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }

  return { draw, sample, now, view, fmt };
})();
