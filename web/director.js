/*
 * Élan for ensembles: the conductor's page.
 * Copyright (C) 2026 Alessandro Ciccarelli
 * Released under the GNU General Public License, version 3 or later.
 */
'use strict';
(() => {
  // never inside another site's frame: clicks could be steered onto Start or Reset
  if (window.top !== window.self) { document.body.textContent = ''; return; }

  const $ = id => document.getElementById(id);
  const body = document.body, minI = $('min'), secI = $('sec'), mainB = $('main');
  const PALETTE = [
    ['#f2a541', 'Amber'], ['#9fe3d6', 'Aqua'], ['#ff4d3d', 'LED red'], ['#4cff7a', 'LED green'],
    ['#6fb7ff', 'Ice blue'], ['#ffe45c', 'Yellow'], ['#ff8a2b', 'Nixie orange'], ['#ff6ad5', 'Magenta'], ['#f3efe6', 'Warm white']
  ];

  // ---- session ----
  // The browser keeps a session token, never the password: in this tab only, or on this
  // computer if "remember" is ticked. The server forgets it at Log out or when it expires.
  const ss = { get(k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } },
               set(k, v, keep) { try { sessionStorage.setItem(k, v); if (keep) localStorage.setItem(k, v); } catch (e) {} },
               del(k) { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch (e) {} } };
  ss.del('elan.key'); // the first version kept the password here
  let token = ss.get('elan.token');
  let S = null, busy = false;

  async function call(a, bodyObj) {
    const t0 = Date.now();
    const r = await fetch('api.php?a=' + a, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify(bodyObj) });
    const j = await r.json();
    if (j.type === 'state') { Elan.sample(t0, j.now, Date.now()); S = j; update(); }
    return j;
  }
  async function api(a, extra = {}) {
    const j = await call(a, { token, ...extra });
    if (j.type !== 'state') { showLogin(token ? 'Session expired: enter the password again.' : ''); throw new Error(j.type || 'error'); }
    return j;
  }
  function showLogin(msg) {
    token = null; ss.del('elan.token');
    $('login').hidden = false; $('loginMsg').textContent = msg;
    $('pw').focus();
  }
  const LOGIN_ERR = {
    denied: 'Wrong password.',
    'default-password': 'The password is still "changeme": change it in config.php on the server.',
    'no-password': 'No password is set in config.php on the server.',
  };
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const remember = $('remember').checked;
    try {
      const j = await call('login', { key: $('pw').value, remember });
      if (j.type !== 'state' || !j.token) {
        $('loginMsg').textContent = j.type === 'blocked' ? `Too many wrong passwords: try again in ${j.minutes} minutes.` : (LOGIN_ERR[j.type] || 'Access failed.');
        return;
      }
      token = j.token; ss.set('elan.token', token, remember);
      $('login').hidden = true; $('pw').value = ''; $('loginMsg').textContent = '';
      if (S.since === null && S.acc === 0) setInputs(S.target);
    } catch (err) { $('loginMsg').textContent = 'The server does not answer.'; }
  });
  $('logout').addEventListener('click', async () => {
    try { if (token) await call('logout', { token }); } catch (e) {}
    showLogin('');
  });
  // the password must not travel unprotected
  if (location.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
    $('httpWarn').textContent = 'This page is not on HTTPS: the password would travel unprotected. Open the https:// address.';

  // ---- polling: other devices may control the same timer ----
  async function poll() {
    for (;;) {
      if (token && !busy) { try { await api('state'); } catch (e) {} }
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // ---- commands ----
  function readSeconds() {
    const m = Math.max(0, Math.min(999, parseInt(minI.value, 10) || 0));
    const s = Math.max(0, Math.min(59, parseInt(secI.value, 10) || 0));
    return Math.max(1, m * 60 + s);
  }
  function setInputs(ms) { const t = Math.round(ms / 1000); minI.value = Math.floor(t / 60); secI.value = t % 60; }
  async function send(a, extra) {
    if (!token) return;
    if (busy) { if (a === 'length') setTimeout(() => send(a, extra), 200); return; } // a length is never lost; a pedal press while busy is
    busy = true;
    try { await api(a, extra); } catch (e) {} finally { busy = false; }
  }
  function mainAction() {
    if (!S) return;
    const setup = S.since === null && S.acc === 0;
    if (setup) send('start', { seconds: readSeconds() });
    else if (S.until !== null) send('resume');
    else send('pause');
  }
  mainB.addEventListener('click', mainAction);
  $('reset').addEventListener('click', () => send('reset'));

  // length shown on the displays while setting up
  let lenTimer = 0;
  function lengthChanged() {
    if (S) { S.target = readSeconds() * 1000; }
    clearTimeout(lenTimer); lenTimer = setTimeout(() => send('length', { seconds: readSeconds() }), 350);
  }
  document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    const [k, d] = b.dataset.step.split(':');
    let m = parseInt(minI.value, 10) || 0, s = parseInt(secI.value, 10) || 0;
    if (k === 'min') m = Math.max(0, Math.min(999, m + +d));
    else { const t = Math.max(0, m * 60 + s + +d); m = Math.floor(t / 60); s = t % 60; }
    minI.value = m; secI.value = s; lengthChanged();
  }));
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { setInputs(+b.dataset.preset * 1000); lengthChanged(); }));
  [minI, secI].forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, ''); lengthChanged(); }));

  // Bluetooth page-turner pedal or keyboard, as in the Android app
  const PEDAL_MAIN = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];
  const PEDAL_RESET = ['ArrowLeft', 'ArrowUp', 'PageUp'];
  document.addEventListener('keydown', e => {
    if (!$('login').hidden || !$('prefs').hidden) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const toMain = PEDAL_MAIN.includes(e.key), toReset = PEDAL_RESET.includes(e.key);
    if (!toMain && !toReset) return;
    e.preventDefault();
    if (e.repeat) return;
    if (document.activeElement && document.activeElement !== body) document.activeElement.blur();
    toMain ? mainAction() : send('reset');
  }, true);
  document.addEventListener('keyup', e => { if (e.key === ' ' && $('login').hidden && $('prefs').hidden) e.preventDefault(); }, true);

  // ---- settings: colours, vibration, address ----
  function swatches(boxId, k) {
    const box = $(boxId); box.textContent = '';
    PALETTE.forEach(([c, name]) => {
      const b = document.createElement('button');
      b.className = 'sw'; b.style.background = c; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name);
      b.setAttribute('aria-checked', S && S[k] === c);
      b.addEventListener('click', () => send('look', { [k]: c }));
      box.appendChild(b);
    });
  }
  function displayAddress() {
    const u = new URL('./', location.href);
    if (S && S.codeRequired) u.searchParams.set('code', S.code);
    return u.href;
  }
  $('prefsBtn').addEventListener('click', () => { $('prefs').hidden = false; update(); $('prefsClose').focus(); });
  $('prefsClose').addEventListener('click', () => { $('prefs').hidden = true; });
  $('prefs').addEventListener('click', e => { if (e.target.id === 'prefs') $('prefs').hidden = true; });
  $('vibrate').addEventListener('change', e => send('look', { vibrate: e.target.checked }));
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(displayAddress()); $('copy').textContent = 'Copied'; }
    catch (e) { $('copy').textContent = 'Select and copy'; }
    setTimeout(() => { $('copy').textContent = 'Copy'; }, 2000);
  });

  // ---- what changes with the state ----
  const HEX = /^#[0-9a-f]{6}$/i;
  function ink(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? '#111' : '#f5f5f5';
  }
  let sig = '';
  function update() {
    if (!S || !HEX.test(S.count) || !HEX.test(S.run)) return;
    const st = document.documentElement.style;
    st.setProperty('--count', S.count); st.setProperty('--run', S.run);
    st.setProperty('--count-ink', ink(S.count)); st.setProperty('--run-ink', ink(S.run));
    $('online').textContent = S.online === 1 ? '1 display' : `${S.online} displays`;
    $('warnings').textContent = '';
    S.warnings.forEach(w => { const d = document.createElement('div'); d.className = 'warn'; d.textContent = w; $('warnings').appendChild(d); });
    const s = JSON.stringify([S.count, S.run, S.vibrate, S.code, S.codeRequired]);
    if (s !== sig) { // redrawn only when something changes, not at every poll
      sig = s;
      swatches('swCount', 'count'); swatches('swRun', 'run');
      $('hexCount').textContent = S.count.toUpperCase(); $('hexRun').textContent = S.run.toUpperCase();
      $('vibrate').checked = S.vibrate;
      $('addr').textContent = displayAddress();
      $('addrNote').textContent = S.codeRequired ? 'Includes the ensemble code.' : 'Anyone with this address can watch the timer.';
    }
  }
  const LABEL = { setup: 'Set the countdown', count: 'Countdown', run: 'Elapsed time' };
  function frame() {
    if (S) {
      const v = Elan.view(S);
      body.dataset.phase = v.phase === 'setup' ? '' : v.phase;
      body.classList.toggle('paused', S.until !== null);
      body.classList.toggle('waiting', v.waiting);
      $('label').textContent = S.until !== null ? 'Paused' : v.waiting ? 'Starting…' : LABEL[v.phase];
      $('setup').hidden = v.phase !== 'setup';
      mainB.textContent = v.phase === 'setup' ? 'Start' : S.until !== null ? 'Resume' : 'Pause';
      Elan.draw($('digits'), $('fit'), v.text, v.color);
    }
    requestAnimationFrame(frame);
  }

  if (token) { $('login').hidden = true; api('state').then(() => { if (S.since === null && S.acc === 0) setInputs(S.target); }).catch(() => {}); }
  else $('pw').focus();
  poll();
  requestAnimationFrame(frame);
})();
