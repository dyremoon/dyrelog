# Dyrelog

A free DPS meter and boss-kill leaderboard for **EverQuest Legends**.

Dyrelog is a small Windows app that sits on top of your game, reads your combat log, and shows your damage
live. When you kill a boss, you can send the fight to the Dyrelog website and see how it ranks.

Dyrelog is an unofficial fan project and is not affiliated with Daybreak Game Company or EverQuest Legends.

Website: https://dyrelog.pages.dev

## Download and install

1. Download the latest installer, `Dyrelog-Setup-<version>.exe`, from the
   [Download page](https://dyrelog.pages.dev/download.html) or from
   [GitHub Releases](https://github.com/dyremoon/dyrelog/releases/latest).
2. Run it. The installer isn't code-signed, so Windows SmartScreen may warn you. Choose **More info**, then
   **Run anyway**.
3. Dyrelog opens when the install finishes.

Windows 10 or 11 is required. Mac and Linux aren't supported yet.

## First run

1. In EverQuest, type `/log on`. The game then writes your combat log to
   `<EverQuest folder>\Logs\eqlog_<Character>_<Server>.txt`.
2. In Dyrelog, pick your EverQuest folder (or its `Logs` folder). If you play more than one character, choose
   which log to use. Dyrelog remembers it.
3. Fight something. The meter fills in as the log updates.

If the log file doesn't exist yet, Dyrelog says it's waiting for it and starts reading as soon as it appears.

## Using it

- **Bars**, **Mini** and **Circle** display styles. Switch with the icons at the top of the meter.
- **Combat Analysis** shows a breakdown of each fight: DPS over time, abilities, pets, healing and damage taken.
- **Leaderboards** shows the top kills per boss, and your own kills.
- **Settings** (gear icon) has themes, sizes, colors, your log file, and submission options.

## Submitting kills to the leaderboard

Only kills of known bosses can be submitted.

1. Log in with Discord when Dyrelog asks, or later in **Settings → Options → Account**.
2. Choose how kills are sent: **Ask** (a small popup asks after each kill), **Auto** (sent automatically) or
   **Off**.
3. While a boss fight is going, Dyrelog uploads the fight log as you play. When the boss dies, the kill is
   checked and, if it passes, shows on the website. Some kills go to a manual review first. You can see the
   status on your profile page on the website.

## Updates

Dyrelog checks for a new version when it starts and about once an hour while it's open. When one is out, a
banner shows at the top of the meter. Click it to download and install the update. Dyrelog restarts on its
own. You can also check in **Settings → What's New**.

## Privacy

The meter works entirely on your PC. Dyrelog only sends data when you submit a kill (the fight's log lines,
your character name and server) or if you turn on optional usage statistics (a random install ID, the app
version and platform). Full details: [Privacy](https://dyrelog.pages.dev/privacy.html).

## Problems and feedback

[Open an issue on GitHub](https://github.com/dyremoon/dyrelog/issues/new). Say what you did, what you
expected, and what happened. If a window shows an error, a screenshot helps.

## Support

Dyrelog is free. If you'd like to chip in, there's a [Ko-fi page](https://ko-fi.com/dyremoon).

## About

I started Dyrelog because I didn't see DPS meters that really clicked with me and my quirky sense of style.
There are some incredible options out there, but often they have much more functionality than I need, and I
get overwhelmed when there's too much data at once. So I made something that does DPS, analytics and
leaderboards, and tries to do them well.

In real life I'm a guy who used to work in the game industry and is now a software engineer. I've played MMOs
my whole life, and I took inspiration from DPS meters in other games so Dyrelog feels familiar. I had never
built a leaderboard before, so this doubled as a personal project to see what I could do, with the help of
Claude Code for the sticky parts.

This is a fan project, built and maintained by one person in his spare time.

## For developers

- `desktop-overlay/` is the Electron app. See [desktop-overlay/README.md](desktop-overlay/README.md) to run or
  build it.
- `frontend/` is the website (static pages on Cloudflare Pages).
- `worker/` is the API and database. It's a private submodule on purpose, because it holds the checks that
  keep edited logs off the leaderboard. A public clone builds and runs the app without it.

## Credits

Boss and zone data draws on research from these community sites. None of them are affiliated with Dyrelog.
Thank you to everyone who documents this game.

- [eqlwiki.com](https://eqlwiki.com)
- [eqlegends.com/wiki](https://eqlegends.com/wiki)
- [loadoutlegends.com](https://www.loadoutlegends.com)

## License

[FSL-1.1-MIT](LICENSE)
