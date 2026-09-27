# Usage analytics

How Dyrelog's optional usage statistics and the website's download counter work, what they store, and how the admin dashboard reads them.

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

Native Cloudflare rate limits allow six requests per minute per installation, plus separate global keys allowing 600 activity requests and 600 download requests per minute per Cloudflare location. These limits are approximate and intentionally avoid collecting IPs. They bound traffic but cannot establish authenticity: someone can fabricate UUIDs or exhaust a shared limit. Public claims must acknowledge this limitation. Daily uniqueness itself is enforced exactly by D1.

Usage analytics is off until explicit consent. A one-time in-app prompt explains the purpose, fields, recipient, frequency, retention, and withdrawal behavior for new and existing users. “No thanks” is the default and cancellation choice. Declining does not affect features or cause repeated prompts. The choice, notice version, and decision timestamp are stored locally in `analyticsConsent`; they are not uploaded. No installation ID is created before consent. The choice can be changed in Settings → Options → Usage analytics through a dedicated, sender-checked IPC handler. Ordinary settings saves cannot enable analytics.

Reporting has a five-second network timeout and never waits in the startup path. Failures are swallowed and retried on the next 15-minute interval. Withdrawal clears the timer and aborts an in-flight request; it cannot undo a request already received by the server and does not erase existing records. There is no historical backfill for offline or declined days. Invalid/unwritable local ID storage suppresses reporting instead of generating new IDs repeatedly. The environment override `DYRELOG_DISABLE_ANALYTICS=1` remains available in addition to the Settings control. The website separately discloses its aggregate download-request counter; it stores no visitor identifier.

GitHub release requests are server-side. Public releases work without credentials. If needed, configure `GITHUB_TOKEN` as a Worker secret; never put it in frontend code or Wrangler vars. When the GitHub API lookup fails, the download route reads the release's `latest.yml` to find the installer; only if GitHub is unreachable does it fall back to the Releases page. When D1 fails after resolving the installer, it still redirects to the installer. A complete Worker outage still makes its redirect unavailable; users can use the GitHub releases page directly.

## Preview the admin dashboard locally

Uses synthetic data only, binds to 127.0.0.1, and touches no real analytics or database.

```
node scripts/preview-admin-analytics.cjs
```

Then open `http://127.0.0.1:8788/admin.html`.
