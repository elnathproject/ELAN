<?php
// Password of the conductor's page. Change it before uploading the folder to the server.
define('DIRECTOR_PASSWORD', 'changeme');
// While it stays "changeme" the conductor's page only works when testing on your own computer
// (localhost): on the server the conductor is asked to change it.

// Ensemble code: if set, the displays only show the timer when the address carries it,
// for example https://yoursite.com/elan/?code=4719 (the conductor's page shows the full address).
// Left empty, anyone who knows the address can watch the timer (they cannot control it).
define('ENSEMBLE_CODE', '');

// Lead time, in milliseconds, with which Start, Pause and Resume reach the displays: every display
// applies the command at the same instant. It must exceed the polling interval (0.6 s) plus the
// network time. With 1000 all displays change together, one second after the command.
define('SYNC_DELAY_MS', 1000);
