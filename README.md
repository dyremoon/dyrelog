# Dyrelog

A free DPS meter and combat-log leaderboard for **EverQuest Legends**. Track
your damage live with the overlay, submit a fight, and see how it stacks up
by boss.

## About Dyrelog and the guy who made this

I started Dyrelog because I didn't see DPS meters that really clicked with me and my quirky sense of style. I tend to like a specific type of dps meter, so I thought I'd just make my own. There are some incredible options out there,
but often times they have much more functionality than I need, and I get overwhelmed when there's too much data and
information at my disposal. So I made something that just did DPS, Analytics, and Leaderboards, and did
it really well. 

In real life I'm just a guy who used to work in the game industry, and now I'm a software engineer. I enjoy building projects, fixing problems, and helping others. I've been playing
MMOs my whole life, just like most of us here, and I took inspiration from DPS meters from other games so
that Dyrelog feels familiar and easy to pick up. I have never made a leaderboard system before, so added a fun leaderboard for us all to track
our DPS on if we so choose as a personal project to see what I could do. Of course with the help of Claude Code to guide me through the sticky areas.

This is a fan project, built and maintained by one person in his spare
time and not an official tool, nor affiliated with Daybreak Game Company
or EverQuest Legends. 

## What's in this repo

- `overlay/` — the always-on-top overlay players can run locally alongside their game.
  (`dyrelog-overlay.html` + `eqp-core.js`). Works fully offline and login/
  streaming/submit are opt-in on top.
- `desktop-overlay/` — the Electron always-on-top desktop app version.
- `frontend/` — the website itself: leaderboards, boss pages, parse
  permalinks, profiles.

The backend (the Cloudflare Worker API and D1 database) lives in a separate
private repo and isn't included here because it's where the anti-cheat sieve and
submission-verification logic lives, kept private on purpose so those checks
can't be read and designed around. Essentially just so people can't edit their log after a boss kill and upload it to the leaderboard to invalidate results.

`overlay/eqp-core.js` and the frontend's own copy are the two places the
parsing/stats engine lives. Ship `eqp-core.js` next to `dyrelog-overlay.html`
as a sibling file and they're never embedded inline.

## Feedback

If you've found a bug or want to submit feedback, [Open an issue](https://github.com/dyremoon/dyrelog/issues/new) and it will come straight to me and I'll do my best to sift through all the requests. Some things are out of scope, 
remember I just want to try to focus on a good, fun dps meter, that delivers leaderboard tracking results. 

## Credits and Thanks

Boss and zone data draws on research from these community sites, run by
people who've spent years documenting this game. Neither is affiliated with
Dyrelog. Thank you to all the incredible community members who care about the game and each other.
Hopefully Dyrelog can add some more oomph to the joy of EQL. 
Thanks, DM. 

- [eqlwiki.com](https://eqlwiki.com)
- [eqlegends.com/wiki](https://eqlegends.com/wiki)
- [loadoutlegends.com](https://www.loadoutlegends.com)
