// Copies the ONE real copy of the parsing engine (../overlay/eqp-core.js)
// into renderer/eqp-core.js before every start/build. This is deliberate:
// the project already got burned once by a hand-maintained third copy of
// this file silently forking inside dyrelog-overlay.html (see the README's
// "Layout" section) — so the desktop app never hand-maintains its own copy
// at all. renderer/eqp-core.js is generated output, not source; it's fine
// (expected, even) for it to be gitignored.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "worker", "src", "eqp-core.js");
const dest = path.join(__dirname, "..", "renderer", "eqp-core.js");

// worker's copy ends with an "export default ..." line for its own ESM
// context — that's a hard SyntaxError in a plain <script> tag (Sept 6 bug:
// it broke every button in the overlay, since the parse error left EQP
// undefined and app.js threw before it ever wired up its click handlers).
// Strip that line rather than a plain file copy.
let code = fs.readFileSync(src, "utf8");
code = code.replace(/^export\s+default[^\n]*\n?/m, "");
fs.writeFileSync(dest, code);
console.log("Synced eqp-core.js -> desktop-overlay/renderer/eqp-core.js (ESM export stripped)");
