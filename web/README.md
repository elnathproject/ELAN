# Élan for ensembles

The web version of Élan for a group of musicians: a conductor controls one timer from a password-protected page, and the performers watch it full screen on their phones or tablets by opening an address. Nothing to install on the devices: any recent browser works.

Like the app, the timer counts down and, at zero, turns into a stopwatch by itself. The conductor sets the length, starts, pauses, resumes and resets; chooses the colours of the two phases; can make the performers' phones vibrate at zero. A Bluetooth page-turner pedal or a keyboard works on the conductor's page as in the app.

## How it stays in time

The server never sends the remaining seconds. It sends the instants at which the timer starts and pauses, and every display computes the time from its own clock, corrected by its offset from the server's clock. Every command takes effect one second after it is given (`SYNC_DELAY_MS` in `config.php`), so all displays change together, and they all reach zero together. In a test with three displays, two of them with clocks five seconds fast and three seconds slow, they crossed zero within 20 ms of each other.

A display that reloads, or whose screen turns off and on again, shows the right time at once.

## Requirements

Web hosting with PHP 7.4 or later, shared hosting included. No database: the state is a small JSON file in `data/`. The protections use `.htaccess`, so they apply on Apache; on nginx they must be repeated in the server configuration. Use HTTPS: browsers keep the screen on only on secure pages.

## Installation

1. In `config.php`, replace `changeme` with a password for the conductor. Optionally set an ensemble code.
2. Upload the whole `web` folder to the server by FTP, including the hidden `.htaccess` files, with a name of your choice (for example `elan`). Folders 755, files 644.
3. Check the protections: `https://yoursite.com/elan/config.php` and `https://yoursite.com/elan/data/state.json` must answer *Forbidden* (403), not show their content.

## Use

- **Conductor:** open `director.html` (for example `https://yoursite.com/elan/director.html`) and enter the password. *Remember on this computer* keeps you logged in after the browser is closed; otherwise the password is forgotten when the tab is closed. Several devices can control the same timer.
- **Performers:** open the folder address (`https://yoursite.com/elan/`), shown under *Settings* on the conductor's page with a *Copy* button. One tap shows the timer full screen and keeps the screen on.
- **Ensemble code:** if `ENSEMBLE_CODE` is set, the address for the performers carries it (`…/elan/?code=4719`) and the displays show nothing without it. Without a code, anyone who knows the address can watch the timer, but only the conductor can control it.
- **Pedal or keyboard (conductor):** right or down arrow, Page Down, Space or Enter act as the main button (Start, Pause, Resume); left or up arrow, Page Up act as Reset.
- The top bar of the conductor's page shows how many displays are connected.

## Files

| File | Content |
| :- | :- |
| `api.php` | server: timer state, conductor's password with a block after five wrong attempts, ensemble code |
| `config.php` | password, ensemble code, lead time of the commands |
| `director.html` | conductor's page |
| `index.html` | performers' display |
| `timer.js` | code shared by the two pages: seven-segment digits, clock offset, time computation |
| `.htaccess`, `data/.htaccess`, `data/index.html` | protections: no indexing, `config.php` and `data/` not readable from the web |

## Development

```sh
cd web && php -S 127.0.0.1:8095
```

Conductor on `http://127.0.0.1:8095/director.html` (the default password `changeme` is accepted only from the same computer), displays on `http://127.0.0.1:8095/`. The built-in PHP server ignores `.htaccess`.

The approach (polling, clock offset, commands with a lead time, password protection) comes from KAIROGRAPHIA, Alessandro Ciccarelli's web app for conducting improvisation.
