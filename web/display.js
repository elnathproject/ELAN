/*
 * Élan for ensembles: the display seen by the performers.
 * Copyright (C) 2026 Alessandro Ciccarelli
 * Released under the GNU General Public License, version 3 or later.
 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  // anonymous id: lets the conductor see how many displays are connected
  let id = store.get('elan.display');
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)); store.set('elan.display', id); }
  const code = new URLSearchParams(location.search).get('code') || '';

  let S = null, lastPhase = null, lastRev = null, wake = null;

  // ---- polling ----
  const POLL_MS = 600;
  async function poll() {
    for (;;) {
      try {
        const t0 = Date.now();
        const r = await fetch(`api.php?a=poll&id=${encodeURIComponent(id)}&code=${encodeURIComponent(code)}`, { cache: 'no-store' });
        const j = await r.json();
        if (j.error === 'code') return refused();
        Elan.sample(t0, j.now, Date.now());
        $('dot').classList.add('on');
        if (j.rev !== lastRev) { lastRev = j.rev; S = j; }
        else S.now = j.now;
      } catch (e) { $('dot').classList.remove('on'); }
      await new Promise(r => setTimeout(r, POLL_MS));
    }
  }
  function refused() {
    $('gate').hidden = false;
    const msg = $('gateMsg'), err = document.createElement('span');
    err.className = 'err'; err.textContent = 'This address needs the ensemble code.';
    msg.textContent = '';
    msg.append(err, document.createElement('br'), 'Ask the conductor for the full address.');
    $('gateTap').hidden = true;
  }

  // ---- drawing: every frame, from the clock ----
  const LABEL = { setup: 'Waiting for the conductor', count: 'Countdown', run: 'Elapsed time' };
  function frame() {
    if (S) {
      const v = Elan.view(S);
      document.body.className = (v.phase === 'setup' || v.waiting ? 'setup' : '') + (v.paused ? ' paused' : '');
      $('label').textContent = v.paused ? 'Paused' : v.waiting ? 'Starting' : LABEL[v.phase];
      Elan.draw($('digits'), $('fit'), v.text, v.color);
      // zero reached while watching (not after a reload): flash, and vibration if the conductor wants it
      if (lastPhase === 'count' && v.phase === 'run') {
        document.documentElement.style.setProperty('--count', S.count);
        const st = $('stage'); st.classList.remove('flash'); void st.offsetWidth; st.classList.add('flash');
        if (S.vibrate) try { navigator.vibrate && navigator.vibrate([200, 80, 200]); } catch (e) {}
      }
      lastPhase = v.phase;
    }
    requestAnimationFrame(frame);
  }

  // ---- first tap: full screen and screen kept on ----
  async function keepAwake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && $('gate').hidden) keepAwake(); });
  $('gate').addEventListener('click', () => {
    if ($('gateTap').hidden) return;
    $('gate').hidden = true;
    try { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen({ navigationUI: 'hide' }); p && p.catch && p.catch(() => {}); } catch (e) {}
    keepAwake();
  });

  poll();
  requestAnimationFrame(frame);
})();
