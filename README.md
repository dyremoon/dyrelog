# Dyrelog

**[Website](https://dyrelog.pages.dev) · [Download](https://dyrelog.pages.dev/download.html)**

A free DPS meter and combat-log leaderboard for **EverQuest Legends**. Track
your damage live with the overlay, submit a fight, and see how it stacks up
by boss.

## About

Dyrelog started out as a project to get a sleek and lightweight DPS meter in
EQL for myself and a group of friends. I found other options, and they're
fantastic as well, but I get overwhelmed when there's too much data and
information at my disposal, so I wanted something that did just DPS, and did
it really well.

I'm a software engineer and enjoy building projects, and I've been playing
MMOs my whole life. I took inspiration from DPS meters from other games so
that Dyrelog feels familiar, and added a fun leaderboard for us all to track
our DPS on if we so choose.

This is a fan project, built and maintained by one person in their spare
time — not an official tool, and not affiliated with Daybreak Game Company
or EverQuest Legends.

## What's in this repo

- `overlay/` — the standalone browser overlay players can run locally
  (`dyrelog-overlay.html` + `eqp-core.js`). Works fully offline; login/
  streaming/submit are opt-in on top.
- `desktop-overlay/` — the Electron always-on-top desktop app version.
- `frontend/` — the website itself: leaderboards, boss pages, parse
  permalinks, profiles.

The backend (the Cloudflare Worker API and D1 database) lives in a separate
private repo and isn't included here — it's where the anti-cheat and
submission-verification logic lives, kept private on purpose so those checks
can't be read and designed around.

`overlay/eqp-core.js` and the frontend's own copy are the two places the
parsing/stats engine lives — dependency-free JS on purpose, so the exact
same code runs both places. Ship `eqp-core.js` next to `dyrelog-overlay.html`
as a sibling file, never embedded inline.

## Feedback

Found a bug, or want to see something added? [Open an issue](https://github.com/dyremoon/dyrelog/issues/new) —
it comes straight to me.

## Credits

Boss and zone data draws on research from these community sites, run by
people who've spent years documenting this game. Neither is affiliated with
Dyrelog.

- [eqlwiki.com](https://eqlwiki.com)
- [eqlegends.com/wiki](https://eqlegends.com/wiki)
- [loadoutlegends.com](https://www.loadoutlegends.com)
