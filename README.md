# Dyrelog

A community DPS-log site for EverQuest Legends. Track your damage locally
with the overlay, submit a fight, see it on the leaderboard. Not affiliated
with Daybreak or EverQuest Legends — a fan project.

See [`DYRELOG-PLAN.md`](./DYRELOG-PLAN.md) for the full design/plan doc this
was built from (product scope, trust model, anti-cheat design, data model).

## Layout

- `overlay/` — the standalone overlay app players run locally
  (`dyrelog-overlay.html`). Works fully offline; login/streaming/submit are
  opt-in on top.
- `worker/` — the Cloudflare Worker API (auth, characters, streaming
  capture, submission finalize + server-side re-parse, leaderboard) and the
  D1 schema.
- `frontend/` — the static Cloudflare Pages site (leaderboard, boss pages,
  parse permalinks, profiles).

Both `overlay/` and `worker/src/` carry their own copy of `eqp-core.js`,
the parsing/stats engine — it's dependency-free JS on purpose so the exact
same code runs client-side and inside the Worker. Keep the two copies in
sync; nothing besides that engine is shared between overlay and worker.

## Local development

Nothing here has touched a live Cloudflare account yet. To stand it up:

```
cd worker
npm install
npx wrangler d1 create dyrelog-db        # then paste the resulting
                                          # database_id into wrangler.toml
npx wrangler d1 execute dyrelog-db --local --file=./migrations/0001_init.sql
npx wrangler d1 execute dyrelog-db --local --file=./seed/bosses.sql
npx wrangler dev
```

Discord OAuth needs a Client ID + Client Secret from the
[Discord Developer Portal](https://discord.com/developers/applications) —
put the Client ID in `wrangler.toml` (`vars.DISCORD_CLIENT_ID`) and the
secret in `.dev.vars` locally (`DISCORD_CLIENT_SECRET=...`, gitignored) /
`wrangler secret put DISCORD_CLIENT_SECRET` once deployed. Never commit the
secret.

The frontend is plain static HTML/CSS/JS — no build step. Serve it with
anything (`npx serve frontend`) while developing.
