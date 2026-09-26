// Verifies a built release before upload: versions agree, all three artifacts exist,
// and latest.yml points at the installer with the right name, size and SHA-512.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const appDir = path.join(__dirname, "..");
const distDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(appDir, "dist");
const problems = [];
const fail = (msg) => problems.push(msg);

const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(appDir, "package-lock.json"), "utf8"));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package.json version "${version}" isn't x.y.z`);
if (lock.version !== version) fail(`package-lock.json version ${lock.version} != package.json ${version}`);
if (!lock.packages || !lock.packages[""] || lock.packages[""].version !== version) fail("package-lock.json packages[\"\"].version doesn't match package.json");
if (pkg.build.artifactName !== "${productName}-Setup-${version}.${ext}") fail("build.artifactName changed; installer names must not contain spaces");

const exeName = `${pkg.build.productName}-Setup-${version}.exe`;
const expected = [exeName, exeName + ".blockmap", "latest.yml"];
for (const f of expected) {
  if (!fs.existsSync(path.join(distDir, f))) fail(`missing dist/${f}`);
}
const strayInstallers = fs.existsSync(distDir)
  ? fs.readdirSync(distDir).filter((f) => /\.(exe|blockmap)$/i.test(f) && !expected.includes(f))
  : [];
if (strayInstallers.length) fail(`dist/ has installers from other versions (delete them so the wrong one isn't uploaded): ${strayInstallers.join(", ")}`);

function field(yml, name) {
  const m = new RegExp("^" + name + ":\\s*'?\"?([^'\"\\r\\n]+)", "m").exec(yml);
  return m ? m[1].trim() : null;
}

const ymlPath = path.join(distDir, "latest.yml");
const exePath = path.join(distDir, exeName);
if (fs.existsSync(ymlPath) && fs.existsSync(exePath)) {
  const yml = fs.readFileSync(ymlPath, "utf8");
  const exe = fs.readFileSync(exePath);
  const sha512 = crypto.createHash("sha512").update(exe).digest("base64");
  const fileUrl = /^\s*-\s*url:\s*(\S+)/m.exec(yml);
  const fileSha = /^\s+sha512:\s*(\S+)/m.exec(yml);
  const fileSize = /^\s+size:\s*(\d+)/m.exec(yml);

  if (field(yml, "version") !== version) fail(`latest.yml version ${field(yml, "version")} != ${version}`);
  if (field(yml, "path") !== exeName) fail(`latest.yml path "${field(yml, "path")}" != "${exeName}"`);
  if (!fileUrl || fileUrl[1] !== exeName) fail(`latest.yml files[0].url "${fileUrl && fileUrl[1]}" != "${exeName}"`);
  if (field(yml, "sha512") !== sha512) fail("latest.yml top-level sha512 doesn't match the installer");
  if (!fileSha || fileSha[1] !== sha512) fail("latest.yml files[0].sha512 doesn't match the installer");
  if (!fileSize || Number(fileSize[1]) !== exe.length) fail(`latest.yml size ${fileSize && fileSize[1]} != installer size ${exe.length}`);
}

if (problems.length) {
  console.error("Release check FAILED:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Release check passed for v${version}:\n  ${expected.map((f) => "dist/" + f).join("\n  ")}`);
