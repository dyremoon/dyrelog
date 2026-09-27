Submission sounds
=================

Sounds Dyrelog can play when a kill goes live on the leaderboard. No sound is selected by default.

**Bundled sounds** come from the repository's `Audio` folder. `npm start` and `npm run dist` copy them here
and rebuild `presets.json`. Only add a sound if you made it, have the maker's permission, or it has a license
that allows redistribution in an app (for example CC0). Write down where each one came from.

**EverQuest sounds** are not shipped. Dyrelog plays them from the player's own game install
(`EverQuest\sounds`), found from the location of their log file. The list is in `submission-sounds.cjs`.

**Custom MP3s** a player picks in Settings are copied into their own Dyrelog data folder and stay on their PC.
