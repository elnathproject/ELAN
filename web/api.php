<?php
/*
 * Élan for ensembles: one timer, controlled by a conductor and shown on every display.
 * Copyright (C) 2026 Alessandro Ciccarelli
 * Released under the GNU General Public License, version 3 or later.
 *
 * The state lives in data/state.json; the pages poll this file every 0.6 s.
 * The server never sends the remaining seconds: it sends the instants at which the timer
 * started and paused, and every display computes the time from its own clock, corrected
 * by the offset from the server's clock. So all displays reach zero together.
 */
require __DIR__ . '/config.php';
defined('SYNC_DELAY_MS') || define('SYNC_DELAY_MS', 1000);
defined('ENSEMBLE_CODE') || define('ENSEMBLE_CODE', '');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

const AUTH_MAX_FAILS = 5;  // wrong passwords before the block
const AUTH_WINDOW = 600;   // window and length of the block, in seconds
const ONLINE_WINDOW = 6;   // seconds without polling after which a display counts as gone
const MAX_DISPLAYS = 200;  // displays remembered at the same time
const MAX_TARGET_S = 999 * 60 + 59;

$file = __DIR__ . '/data/state.json';
$in = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$a = $_GET['a'] ?? ($in['a'] ?? '');

// exclusive lock: one request at a time changes the state
$fh = fopen($file, 'c+');
if (!$fh) { http_response_code(500); exit('{"error":"data/ is not writable"}'); }
flock($fh, LOCK_EX);
$raw = stream_get_contents($fh);
$S = $raw ? json_decode($raw, true) : null;
$dirty = false;
if (!is_array($S)) { $S = []; $dirty = true; }
$S += [
  'rev' => 0,           // grows at every command: displays redraw when it changes
  'target' => 60000,    // countdown length, ms
  'acc' => 0,           // ms elapsed in the runs that are over
  'since' => null,      // server instant at which the current run starts (null: stopped)
  'until' => null,      // server instant at which the current run is paused (null: running)
  'count' => '#f2a541', // countdown colour
  'run' => '#9fe3d6',   // stopwatch colour
  'vibrate' => false,   // vibration at zero on the displays
  'displays' => [],     // anonymous id => last poll (unix seconds)
];

function out($d) { echo json_encode($d, JSON_UNESCAPED_UNICODE); }
function now_ms() { return (int) round(microtime(true) * 1000); }
function color_or_null($c) { return is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c) ? strtolower($c) : null; }
function is_local() { return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true); }

// protection against repeated password guesses, per IP address (stored as a hash)
function auth_guard($ok) {
  $f = __DIR__ . '/data/auth.json';
  $ip = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '?');
  $A = json_decode(@file_get_contents($f) ?: '{}', true) ?: [];
  $now = time();
  foreach ($A as $k => $v) if ($now - $v['t'] > AUTH_WINDOW) unset($A[$k]);
  $blocked = isset($A[$ip]) && $A[$ip]['n'] >= AUTH_MAX_FAILS;
  if (!$blocked) {
    if ($ok) unset($A[$ip]);
    else $A[$ip] = ['n' => ($A[$ip]['n'] ?? 0) + 1, 't' => $now];
  }
  @file_put_contents($f, json_encode($A));
  return !$blocked;
}

// what every page needs to draw the timer
function timer($S) {
  return ['rev' => $S['rev'], 'now' => now_ms(), 'target' => $S['target'], 'acc' => $S['acc'],
          'since' => $S['since'], 'until' => $S['until'], 'count' => $S['count'], 'run' => $S['run'],
          'vibrate' => $S['vibrate']];
}
function online($S) {
  $t = time(); $n = 0;
  foreach ($S['displays'] as $seen) if ($t - $seen <= ONLINE_WINDOW) $n++;
  return $n;
}
function warnings() {
  $w = [];
  if (!is_writable(__DIR__ . '/data')) $w[] = 'The data folder is not writable: the server cannot save the timer. Try permissions 755, or 775.';
  foreach (['.htaccess', 'data/.htaccess', 'data/index.html'] as $f)
    if (!file_exists(__DIR__ . "/$f")) $w[] = "The protection file $f is missing: upload it again (it is a hidden file, some FTP programs skip it).";
  return $w;
}

switch ($a) {
  // ================= displays =================
  case 'info':
    out(['codeRequired' => ENSEMBLE_CODE !== '']);
    break;
  case 'poll': {
    if (ENSEMBLE_CODE !== '' && !hash_equals(ENSEMBLE_CODE, trim((string)($_GET['code'] ?? '')))) {
      http_response_code(403); out(['error' => 'code']); break;
    }
    $id = substr(preg_replace('/[^a-zA-Z0-9-]/', '', (string)($_GET['id'] ?? '')), 0, 64);
    if ($id !== '') {
      $t = time();
      // "seen" is written at most once a second, so the file is not rewritten at every poll
      if (($S['displays'][$id] ?? 0) !== $t && (isset($S['displays'][$id]) || count($S['displays']) < MAX_DISPLAYS)) {
        $S['displays'][$id] = $t; $dirty = true;
      }
      if (mt_rand(0, 50) === 0) { // forget displays not seen for an hour
        foreach ($S['displays'] as $k => $seen) if ($t - $seen > 3600) unset($S['displays'][$k]);
        $dirty = true;
      }
    }
    out(timer($S));
    break;
  }

  // ================= conductor =================
  default: {
    // the password travels only in the request body, never in the address
    $ok = hash_equals(DIRECTOR_PASSWORD, (string)($in['key'] ?? ''));
    if (!auth_guard($ok)) { http_response_code(429); out(['type' => 'blocked', 'minutes' => AUTH_WINDOW / 60]); break; }
    if (!$ok) { http_response_code(403); out(['type' => 'denied']); break; }
    if (DIRECTOR_PASSWORD === 'changeme' && !is_local()) { http_response_code(403); out(['type' => 'default-password']); break; }
    $at = now_ms() + SYNC_DELAY_MS; // instant at which a command takes effect, the same for every display
    $running = $S['since'] !== null && $S['until'] === null;
    switch ($a) {
      case 'state': break;
      case 'start': // from the setup only; sets the length too
        if ($S['since'] === null && $S['acc'] === 0) {
          $s = (int) round((float)($in['seconds'] ?? 0));
          $S['target'] = max(1, min(MAX_TARGET_S, $s)) * 1000;
          $S['since'] = $at; $S['until'] = null; $S['rev']++; $dirty = true;
        }
        break;
      case 'pause':
        if ($running) { $S['until'] = max($at, $S['since']); $S['rev']++; $dirty = true; }
        break;
      case 'resume':
        if ($S['since'] !== null && $S['until'] !== null) {
          $S['acc'] += max(0, $S['until'] - $S['since']);
          $S['since'] = max($at, $S['until']); $S['until'] = null; $S['rev']++; $dirty = true;
        }
        break;
      case 'reset':
        $S['acc'] = 0; $S['since'] = null; $S['until'] = null; $S['rev']++; $dirty = true;
        break;
      case 'length': // countdown length shown while setting up
        if ($S['since'] === null && $S['acc'] === 0) {
          $S['target'] = max(1, min(MAX_TARGET_S, (int) round((float)($in['seconds'] ?? 0)))) * 1000;
          $S['rev']++; $dirty = true;
        }
        break;
      case 'look': { // colours and vibration, at any moment
        foreach (['count', 'run'] as $k) if (($c = color_or_null($in[$k] ?? null)) !== null) $S[$k] = $c;
        if (isset($in['vibrate'])) $S['vibrate'] = (bool)$in['vibrate'];
        $S['rev']++; $dirty = true; break;
      }
    }
    out(['type' => 'state', 'online' => online($S), 'codeRequired' => ENSEMBLE_CODE !== '', 'code' => ENSEMBLE_CODE,
         'warnings' => warnings()] + timer($S));
  }
}

if ($dirty) { ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($S, JSON_UNESCAPED_UNICODE)); fflush($fh); }
flock($fh, LOCK_UN); fclose($fh);
