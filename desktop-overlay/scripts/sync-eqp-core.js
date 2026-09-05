// Copies the ONE real copy of the parsing engine (../overlay/eqp-core.js)
// into renderer/eqp-core.js before every start/build. This is deliberate:
// the project already got burned once by a hand-maintained third copy of
// this file silently forking inside dyrelog-overlay.html (see the README's
// "Layout" section) — so the desktop app never hand-maintains its own copy
// at all. renderer/eqp-core.js is generated output, not source; it's fine
// (expected, even) for it to be gitignored.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "overlay", "eqp-core.js");
const dest = path.join(__dirname, "..", "renderer", "eqp-core.js");

fs.copyFileSync(src, dest);
console.log("Synced eqp-core.js -> desktop-overlay/renderer/eqp-core.js");
