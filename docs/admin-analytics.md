# Private application analytics

Implemented in the existing Electron app, plain JavaScript admin page, and Cloudflare Worker/D1 stack. No analytics service, chart library, or database dependency was added. R2 and combat-log processing are unaffected. The Worker is a separate Git submodule; review its working tree separately.

## Metric definitions

- **Daily Active Installs**: distinct participating installation IDs whose activity request succeeds during one server-determined UTC calendar day. Only after explicit opt-in, packaged apps report on startup and every 15 minutes while running, including idle time. This is not DAU, gameplay, a count of people, or a count of all installations. Development launches do not report.
- The UUID is persisted in Electron's user-data directory as `dyrelog-install-id`; it represents an app data profile, not a physical computer. Account login is optional and Discord IDs are not used for analytics.
- The database primary key `(install_id, activity_date)` makes repeated launches, retries, and overlapping reports count once. Installation and activity writes use a D1 transaction. Client timestamps are ignored. The daily row retains the first reported version that day; version shares use the installation's latest reported version.
- Weekly and monthly active installs are distinct IDs across the last 7 and 30 UTC dates, including today. Averages use all 7/30 dates, including zeros and the incomplete current day. Dates before rollout display zero recorded activity, not evidence of zero historical use.
- New installs mean **newly observed** IDs. Existing users upgrading to this build initially count as new. Known installations are all IDs observed since rollout, not currently installed copies.
- Website downloads are counted GET requests that resolve a Windows installer through the redirect. They are not unique visitors or confirmed completed transfers. Repeated clicks count repeatedly; bots may count. Failed measurement and rate-limited requests are not counted. Direct GitHub downloads and automatic updates bypass this redirect.
- GitHub counts are a separate cumulative snapshot of `.exe`, `.dmg`, and `.AppImage` assets on non-draft, non-prerelease releases. Metadata and blockmaps are excluded. Requests are cached for up to five minutes per Worker instance; releases are paginated with a 1,000-release safety cap and a partial flag. Deleted assets cannot be recovered. An unavailable result is shown as unavailable, never as zero. Do not add GitHub counts to tracked requests.

## Persistence and API

Migration `worker/migrations/0010_analytics.sql` adds:

| Table | Stored data / key |
| --- | --- |
| `analytics_install` | Random UUID, first/last server observation, current version, platform; UUID primary key; first/last observation indexes |
| `analytics_daily_active` | UUID, UTC date, first version reported that day; composite primary key; date/ID index |
| `analytics_download_daily` | UTC date, release version, asset ID, request count; composite primary key |

Downloads are aggregated directly by date/version/asset instead of storing individual request records. No automatic retention deletion is introduced; install observations and daily rows remain until explicitly removed.

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/api/analytics/active` | Public, bounded JSON body, validated UUID v4/version/platform, rate limited |
| GET | `/api/download/latest` | Public, records request and redirects to GitHub |
| GET | `/api/admin/analytics/summary` | Existing signed session and admin allowlist |
| GET | `/api/admin/analytics/daily?days=30` | Admin; 1–90 days |
| GET | `/api/admin/analytics/versions` | Admin; latest version among 30-day active installs |
| GET | `/api/admin/analytics/downloads` | Admin; tracked requests and separate GitHub snapshot |

Aggregate responses and redirects use `Cache-Control: no-store`. The existing static admin HTML remains a public shell, but its analytics section stays hidden for normal users and every aggregate API independently enforces admin authorization. No private data is embedded in HTML. The moderation queue retains its existing behavior.

## Privacy and limitations

Only the UUID, app version, platform (`win32`, `darwin`, `linux`), and server observation dates/times are collected for usage. There are no Discord IDs, Windows usernames, machine names, hardware IDs, locations, IP addresses, personal files, or game data in analytics storage. No request payloads are logged by the analytics handlers. Hosting providers still process ordinary network traffic; this does not change their infrastructure logging configuration.

Native Cloudflare rate limits allow six requests per minute per installation, plus separate global keys allowing 600 activity requests and 600 download requests per minute per Cloudflare location. Namespace IDs are 1010 and 1011; confirm they do not collide with another Worker in this account before deployment. These limits are approximate and intentionally avoid collecting IPs. They bound traffic but cannot establish authenticity: someone can fabricate UUIDs or exhaust a shared limit. Public claims must acknowledge this limitation. Daily uniqueness itself is enforced exactly by D1.

Usage analytics is off until explicit consent. A one-time in-app prompt explains the purpose, fields, recipient, frequency, retention, and withdrawal behavior for new and existing users. “No thanks” is the default and cancellation choice. Declining does not affect features or cause repeated prompts. The choice, notice version, and decision timestamp are stored locally in `analyticsConsent`; they are not uploaded. No installation ID is created before consent. The choice can be changed in Settings → Options → Usage analytics through a dedicated, sender-checked IPC handler. Ordinary settings saves cannot enable analytics.

Reporting has a five-second network timeout and never waits in the startup path. Failures are swallowed and retried on the next 15-minute interval. Withdrawal clears the timer and aborts an in-flight request; it cannot undo a request already received by the server and does not erase existing records. There is no historical backfill for offline or declined days. Invalid/unwritable local ID storage suppresses reporting instead of generating new IDs repeatedly. The environment override `DYRELOG_DISABLE_ANALYTICS=1` remains available in addition to the Settings control. The website separately discloses its aggregate download-request counter; it stores no visitor identifier.

GitHub release requests are server-side. Public releases work without credentials. If needed, configure `GITHUB_TOKEN` as a Worker secret; never put it in frontend code or Wrangler vars. When GitHub lookup fails, the download route falls back to the releases page; when D1 fails after resolving the asset, it still redirects to the asset. A complete Worker outage still makes its redirect unavailable; users can use the GitHub releases page directly.

## Files changed for analytics

- `worker/migrations/0010_analytics.sql`
- `worker/src/analytics.js`, `worker/src/analytics-downloads.js`, `worker/src/index.js`
- `worker/wrangler.toml`, `worker/test/analytics.test.mjs`
- `desktop-overlay/analytics.cjs`, `desktop-overlay/main.js`, `desktop-overlay/package.json`
- `desktop-overlay/preload.js`, `desktop-overlay/renderer/settings.html`, `desktop-overlay/renderer/analytics-settings.js`
- `desktop-overlay/test/analytics.test.cjs`, `desktop-overlay/test/admin-analytics.test.cjs`
- `desktop-overlay/test/analytics-consent.test.cjs`
- `frontend/admin.html`, `frontend/js/admin-analytics.js`, `frontend/css/admin-analytics.css`, `frontend/download.html`
- `scripts/preview-admin-analytics.cjs`, this guide

Pre-existing version changes, moderation-note work, and other local edits were preserved. No commits or pushes were made.

## Local preview and launch commands (PowerShell)

Preview the real admin UI using explicitly synthetic data. This binds only to loopback and does not access production analytics, authenticate real users, or write a database. Do not deploy this preview server.

```powershell
Set-Location '<path-to>\dyrelog'
node scripts/preview-admin-analytics.cjs
```

Open `http://127.0.0.1:8788/admin.html`. Stop with Ctrl+C. If the agent's preview is still running, use its existing page instead of starting a second copy.

The dashboard uses the site's dark plates and gold accents, six cards in a responsive grid, gold activity bars, teal download bars, version share meters, and download/daily tables. Exact chart values are available in the daily table. Empty, unavailable, and unauthorized states are handled.

Local Worker and database:

```powershell
Set-Location '<path-to>\dyrelog\worker'
npx wrangler d1 migrations apply dyrelog-db --local
npm run dev
```

This starts the API at `http://127.0.0.1:8787`. Real local Discord authentication requires the existing `.dev.vars` secrets, a Discord-registered local callback URI, and matching `SITE_URL`/`DISCORD_REDIRECT_URI` values. The synthetic preview does not test Discord login or use this API. Automated tests exercise signed sessions and the actual Worker routes without modifying your Discord application.

Local desktop launch (the consent prompt and Settings control work, but analytics is deliberately disabled for unpackaged development). If a choice was already saved, use Settings → Options → Usage analytics instead of expecting another prompt:

```powershell
Set-Location '<path-to>\dyrelog\desktop-overlay'
npm start
```

## Production migration and deployment (not executed)

Apply migrations before deploying the Worker. Wrangler applies all pending migrations, including the pre-existing moderation-note migration if it has not yet been applied. Inspect the pending list first.

```powershell
Set-Location '<path-to>\dyrelog\worker'
npx wrangler d1 migrations list dyrelog-db --remote
npx wrangler d1 migrations apply dyrelog-db --remote
npm run deploy
```

Optional server-side GitHub token, only if public API limits require one:

```powershell
Set-Location '<path-to>\dyrelog\worker'
npx wrangler secret put GITHUB_TOKEN
```

Deploy the static website after the API:

```powershell
Set-Location '<path-to>\dyrelog\worker'
npx wrangler pages deploy ..\frontend --project-name dyrelog --branch main --commit-dirty=true
```

This publishes the current frontend working tree, including other existing edits. The command assumes `main` is the Pages project's configured production branch; verify that setting before executing. Then sign in using an allowlisted Discord account and open `https://dyrelog.pages.dev/admin.html`.

## Installer build (not executed; does not publish)

```powershell
Set-Location '<path-to>\dyrelog\desktop-overlay'
npm run dist -- --win nsis --publish never
```

The installer is written under `desktop-overlay\dist`. The existing package version was retained. Choose a fresh release version before publishing if that version already exists. Releasing the new installer through the normal GitHub Release process is a separate step; only upgraded packaged clients send analytics.

## Verification

```powershell
Set-Location '<path-to>\dyrelog\worker'
npm test
npx wrangler deploy --dry-run --outdir .wrangler/analytics-build
Set-Location '<path-to>\dyrelog'
node --test desktop-overlay/test/*.test.cjs
node --check frontend/js/admin-analytics.js
node --check desktop-overlay/main.js
node --check desktop-overlay/analytics.cjs
git diff --check
git -C worker diff --check
```

Tests cover duplicate activity, multiple installations, UTC rollover, ignored client dates, malformed IDs and oversized bodies, rate limits, database/network failures, persistent client identity, nonblocking startup, ordinary-user rejection, signed admin access, version shares, zero-filled averages, redirect counting/fallback, GitHub pagination, frontend escaping, authorization revocation, and empty/unavailable UI states. No lint script or frontend build step exists; JavaScript syntax checks and the Worker bundle dry run provide the applicable build checks. The existing `eqp-core.js` CommonJS-in-ESM warning remains unrelated to analytics.

Verification completed: 130 Worker tests and 40 desktop/frontend tests passed; syntax checks, diff checks, and the Worker dry-run build passed. Consent tests also cover existing users, default rejection, persistence, withdrawal, aborting requests, failed preference storage, authorized Settings IPC, and creating no identifier before opt-in. No production migration, deployment, installer build, commit, or push was performed by this task. Tests use temporary/in-memory storage. The browser preview uses synthetic metrics, not real usage data.
