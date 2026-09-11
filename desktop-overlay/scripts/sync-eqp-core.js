const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "worker", "src", "eqp-core.js");
const dest = path.join(__dirname, "..", "renderer", "eqp-core.js");

let code = fs.readFileSync(src, "utf8");
code = code.replace(/^export\s+default[^\n]*\n?/m, "");
fs.writeFileSync(dest, code);
fs.writeFileSync(path.join(__dirname, "..", "..", "frontend", "js", "eqp-core.js"), code);
fs.copyFileSync(path.join(__dirname, '..', 'renderer', 'boss-browser.js'), path.join(__dirname, '..', '..', 'frontend', 'js', 'boss-browser.js'));
console.log("Synced eqp-core.js -> desktop-overlay/renderer/eqp-core.js (ESM export stripped)");
