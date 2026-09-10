Submission sound presets
=======================

Add MP3 or WAV files to the repository's `Audio` folder. Running `npm start`
or `npm run dist` copies them here and rebuilds `presets.json` automatically.
The catalog format is:

```json
[{ "id": "level-up", "name": "EverQuest — Level Up", "file": "level-up.mp3" }]
```

Filenames become stable IDs and readable labels. The Options sound selector
loads this catalog automatically. The desktop build includes this folder.
No sound is selected by default. Custom MP3s are copied into the user's
Dyrelog application data folder so moving the original file does not break playback.
