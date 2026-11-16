<?php
// Password of the conductor's page. Change it before uploading the folder to the server:
// at least 8 characters, better a phrase of three or four words, not used anywhere else.
define('DIRECTOR_PASSWORD', 'changeme');
// While it stays "changeme" the conductor's page only works when testing on your own computer
// (localhost): on the server the conductor is asked to change it. An empty password is refused.
// Changing the password logs out every conductor.

// Wrong passwords accepted in ten minutes before the login is refused for the rest of the ten minutes:
// from one address, and from all addresses together (protection against bots that try from many
// addresses; 0 disables it). A conductor who is already logged in is never shut out.
// Note: with the second limit, someone who keeps sending wrong passwords can keep the login closed.
// Log in before the concert and tick "Remember on this computer" to be safe.
define('LOGIN_MAX_FAILS', 5);
define('LOGIN_MAX_FAILS_ALL', 30);

// The performers see the timer only while it is open: from the conductor's login until Log out.
// If the conductor's page loses the connection (computer asleep, network down), the timer stays
// visible for this number of minutes, then closes.
define('CLOSE_AFTER_MINUTES', 120);

// HTTPS only: over plain http:// the server answers nothing. Set to false only if the site has no
// HTTPS at all (then also remove the "HTTPS only" block from .htaccess); password and session
// would travel unprotected.
define('FORCE_HTTPS', true);

// Ensemble code: if set, the displays only show the timer when the address carries it,
// for example https://yoursite.com/elan/?code=4719 (the conductor's page shows the full address).
// Left empty, anyone who knows the address can watch the timer (they cannot control it).
// The code is a light barrier, not a password: it travels in the address and can be guessed by trying.
define('ENSEMBLE_CODE', '');

// Lead time, in milliseconds, with which Start, Pause and Resume reach the displays: every display
// applies the command at the same instant. It must exceed the polling interval (0.6 s) plus the
// network time. With 1000 all displays change together, one second after the command.
define('SYNC_DELAY_MS', 1000);
