# Dyrelog desktop app

The Electron app: an always-on-top DPS meter that tails the EverQuest Legends combat log, plus Combat
Analysis, Leaderboards, Settings and a small submit popup. Windows (NSIS installer) is the only supported
build.

Player instructions are in the [main README](../README.md).

## Run from source

Needs Node.js 20 or newer.

```
cd desktop-overlay
npm install
npm start
```

`npm start` first copies the shared combat parser (`eqp-core.js`) into `renderer/`. It uses
`../worker/src/eqp-core.js` if you have the private worker checked out, and otherwise the public copy at
`../frontend/js/eqp-core.js`. Don't edit `renderer/eqp-core.js`; it's generated and not committed.

Updates, usage analytics and the "check for updates" button only run in the installed app, not from source.
Press F12 in any window to open DevTools.

## Test

```
npm test
```

## Build a release

```
npm ci
npm test
npm run dist
npm run release:check
```

`npm run dist` writes these to `dist/`:

- `Dyrelog-Setup-<version>.exe`
- `Dyrelog-Setup-<version>.exe.blockmap`
- `latest.yml` (what installed copies read to find updates)

Write the release notes from `docs/release-notes/TEMPLATE.md` (keep its "How to install and update" section at the bottom).

`npm run release:check` fails if the version numbers disagree, a file is missing, or `latest.yml` doesn't
match the installer's name, size and SHA-512. Upload all three files to the GitHub Release without renaming
them. The version lives only in `package.json` (and its lock file); the app reads it at runtime.

## Files

- `main.js`: windows, tray, log tailing, Discord login, submissions, updates.
- `preload.js`: the only API the pages can call (`window.dyrelog`).
- `log-tailer.cjs`: reads new lines from the log file once a second and waits if the file doesn't exist yet.
- `json-store.cjs`: saves settings and history with a temp file and rename, so a crash can't truncate them.
- `link-policy.cjs`: the exact list of sites the app will open in your browser.
- `analytics.cjs`: optional usage statistics (off unless the player allows it).
- `renderer/`: the pages. `app.js` is the meter, `live-stream.js` plans fight uploads.

## What the app stores

In `%APPDATA%\Dyrelog\`:

| File | Contents |
|---|---|
| `dyrelog-source.json` | Path of the log file you picked |
| `dyrelog-settings.json` | Your settings and submission choice |
| `dyrelog-window.json` | Window positions and sizes |
| `dyrelog-history.json` | Your last 50 fights (parsed stats, plus any pet-ownership log lines) |
| `dyrelog-auth.json` | Discord username, avatar URL and the login session cookie (after you log in) |
| `dyrelog-install-id` | Random ID, only created if you allow usage statistics |
| `submission-sound.mp3` | A custom submit sound, if you picked one |

Each JSON file may have a `.bak` copy next to it (the previous good version).

## What the app sends

- To `dyrelog-api.dyremoon.workers.dev`, only after you log in and a known boss fight is being submitted:
  the raw log lines for that fight, your character name and server (from the log file's name), and your
  session cookie. Also the Discord login itself, and a status check for your own past submissions.
- Public leaderboard data is read from the same API (boss list, leaderboards) with no login needed.
- If you allow usage statistics: a random install ID, the app version and platform, at start and every
  15 minutes.
- To `api.github.com` and GitHub Releases: update checks and downloads.
- To Google Fonts: the meter's display fonts are loaded from `fonts.googleapis.com`.
