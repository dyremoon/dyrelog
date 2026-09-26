// Copies the shared parser into the app. Uses the private worker copy when present,
// otherwise the public website copy, so a public clone can still run and build.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const workerCopy = path.join(root, "worker", "src", "eqp-core.js");
const websiteCopy = path.join(root, "frontend", "js", "eqp-core.js");
const dest = path.join(__dirname, "..", "renderer", "eqp-core.js");

let code;
let source;
if (fs.existsSync(workerCopy)) {
  code = fs.readFileSync(workerCopy, "utf8").replace(/^export\s+default[^\n]*\n?/m, "");
  source = "worker/src/eqp-core.js";
  fs.writeFileSync(websiteCopy, code);
} else if (fs.existsSync(websiteCopy)) {
  code = fs.readFileSync(websiteCopy, "utf8");
  source = "frontend/js/eqp-core.js";
} else {
  console.error("Can't find the combat parser. Expected frontend/js/eqp-core.js in the repository.");
  process.exit(1);
}

fs.writeFileSync(dest, code);
fs.copyFileSync(path.join(__dirname, "..", "renderer", "boss-browser.js"), path.join(root, "frontend", "js", "boss-browser.js"));
console.log("Synced eqp-core.js from " + source);
