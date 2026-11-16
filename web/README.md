# Élan for ensembles

The web version of Élan for a group of musicians: a conductor controls one timer from a password-protected page, and the performers watch it full screen on their phones or tablets by opening an address. Nothing to install on the devices: any recent browser works.

Like the app, the timer counts down and, at zero, turns into a stopwatch by itself. The conductor sets the length, starts, pauses, resumes and resets; chooses the colours of the two phases; can make the performers' phones vibrate at zero. A Bluetooth page-turner pedal or a keyboard works on the conductor's page as in the app.

## How it stays in time

The server never sends the remaining seconds. It sends the instants at which the timer starts and pauses, and every display computes the time from its own clock, corrected by its offset from the server's clock. Every command takes effect one second after it is given (`SYNC_DELAY_MS` in `config.php`), so all displays change together, and they all reach zero together. In a test with three displays, two of them with clocks five seconds fast and three seconds slow, they crossed zero within 20 ms of each other.

A display that reloads, or whose screen turns off and on again, shows the right time at once.

## Requirements

Web hosting with PHP 7.4 or later, shared hosting included. No database: the state is a small JSON file in `data/`. The protections use `.htaccess`, so they apply on Apache; on nginx they must be repeated in the server configuration. HTTPS is required: the server answers nothing over plain `http://`.

## Installation

1. In `config.php`, replace `changeme` with a password for the conductor: at least 8 characters, better a phrase of a few words, not used anywhere else. Optionally set an ensemble code.
2. Upload the whole `web` folder to the server by FTP, including the hidden `.htaccess` files, with a name of your choice (for example `elan`). Folders 755, files 644.
3. Check the protections: `https://yoursite.com/elan/data/state.json` must answer *Forbidden* (403), not show its content.
4. Open the conductor's page with the `https://` address. A red band at the top lists what is wrong on the server, if anything (permissions too wide, missing protection files, password too short).

## Use

- **Opening and closing:** the performers see the timer only while it is open. Logging in as conductor opens it; *Log out* closes it, and the displays go back to a waiting page that opens again by itself. If the conductor's page loses the connection (computer asleep, network down) the timer stays visible for two hours, then closes (`CLOSE_AFTER_MINUTES` in `config.php`). While closed, the server tells visitors nothing.
- **Conductor:** open `director.html` (for example `https://yoursite.com/elan/director.html`) and enter the password. *Remember on this computer* keeps you logged in for 30 days; otherwise the session ends when the tab is closed, or after 12 hours. *Log out* ends it at once. Several devices can control the same timer.
- **Performers:** open the folder address (`https://yoursite.com/elan/`), shown under *Settings* on the conductor's page with a *Copy* button. One tap shows the timer full screen and keeps the screen on.
- **Ensemble code:** if `ENSEMBLE_CODE` is set, the address for the performers carries it (`…/elan/?code=4719`) and the displays show nothing without it. Without a code, anyone who knows the address can watch the timer, but only the conductor can control it.
- **Pedal or keyboard (conductor):** right or down arrow, Page Down, Space or Enter act as the main button (Start, Pause, Resume); left or up arrow, Page Up act as Reset.
- The top bar of the conductor's page shows how many displays are connected.

## Security

- **Password.** It is sent once, at login, in the body of the request; the browser then keeps a random session token, never the password. The server stores only keyed hashes of the tokens and of the addresses that typed a wrong password. Changing the password in `config.php` ends every session.
- **Guessing.** After five wrong passwords in ten minutes from the same address, logins from that address are refused for the rest of the ten minutes (IPv6 addresses count by /64 network). After thirty wrong passwords from all addresses together, every login is refused in the same way: this stops bots that try from many addresses, and refused attempts cost the server almost nothing. Both limits are in `config.php`. A conductor who is already logged in keeps working in both cases. The price of the second limit: whoever keeps sending wrong passwords can keep new logins closed, so log in before the concert with *Remember on this computer*.
- **Default and empty password.** `changeme` is accepted only from the server's own computer and never through a proxy; an empty password is always refused.
- **Performers.** They need no password. What protects the timer from strangers is the opening by the conductor, plus, if set, the ensemble code: a light barrier, not a password, since it travels in the address and can be found by trying.
- **Pages.** No inline scripts: a Content-Security-Policy allows only the scripts of this folder, and the conductor's page refuses to run inside another site's frame. Whatever the displays receive is checked by the server first (colours, lengths).
- **Requests.** Bodies over 4 KB are refused; PHP warnings are never shown.
- **HTTPS.** Required. `.htaccess` sends every `http://` request to `https://`, and `api.php` refuses anything that does not arrive over HTTPS, so password and session never travel unprotected, on nginx too. HTTPS that ends at the hosting's proxy is recognised through `X-Forwarded-Proto`. `FORCE_HTTPS` in `config.php` turns it off for a site with no HTTPS at all. Testing on the same computer (`localhost`) is exempt.
- **nginx.** `.htaccess` files are ignored. Add to the site configuration, with your folder name: `location ~ ^/elan/(data/|config\.php$|README\.md$) { deny all; }`.

## Files

| File | Content |
| :- | :- |
| `api.php` | server: timer state, conductor's login and sessions, block after five wrong passwords, ensemble code |
| `config.php` | password, ensemble code, lead time of the commands |
| `director.html`, `director.js` | conductor's page |
| `index.html`, `display.js` | performers' display |
| `timer.js` | code shared by the two pages: seven-segment digits, clock offset, time computation |
| `.htaccess`, `data/.htaccess`, `data/index.html` | protections: no indexing, security headers, `config.php` and `data/` not readable from the web |

## Development

```sh
cd web && php -S 127.0.0.1:8095
```

Conductor on `http://127.0.0.1:8095/director.html` (the default password `changeme` is accepted only from the same computer), displays on `http://127.0.0.1:8095/`. The built-in PHP server ignores `.htaccess`.

The approach (polling, clock offset, commands with a lead time, password protection) comes from KAIROGRAPHIA, Alessandro Ciccarelli's web app for conducting improvisation.
