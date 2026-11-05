// package.json is the one source of the version. This copies it into src-tauri/Cargo.toml and Cargo.lock.
//   node scripts/sync-version.js           write it (npm runs this from `npm version`)
//   node scripts/sync-version.js --check   fail when they disagree; with --tag v1.2.3 also when the tag differs
//   node scripts/sync-version.js --set 1.2.3-beta.1   write that version into package.json too (a beta build in CI;
//                                                     never committed, the release branch keeps its version)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);

const setArg = process.argv.indexOf("--set");
if (setArg > 0) {
  const v = (process.argv[setArg + 1] ?? "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v)) {
    console.error(`Not a version: ${v}`);
    process.exit(1);
  }
  const pkg = read("package.json");
  write("package.json", pkg.replace(/("version":\s*)"[^"]*"/, `$1"${v}"`));
}

const version = JSON.parse(read("package.json")).version;
const NAME = "dart-trainer";

const toml = read("src-tauri/Cargo.toml");
const lock = read("src-tauri/Cargo.lock");
const tomlRe = /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]*"/m;
const lockRe = new RegExp(`(\\[\\[package\\]\\]\\nname = "${NAME}"\\nversion = )"[^"]*"`);

if (!tomlRe.test(toml) || !lockRe.test(lock)) {
  console.error("Could not find the package version in Cargo.toml or Cargo.lock.");
  process.exit(1);
}

if (process.argv.includes("--check")) {
  const tomlV = toml.match(tomlRe)[0].match(/"([^"]*)"$/)[1];
  const lockV = lock.match(lockRe)[0].match(/"([^"]*)"$/)[1];
  const tagArg = process.argv.indexOf("--tag");
  const tag = tagArg > 0 ? process.argv[tagArg + 1].replace(/^v/, "") : version;
  const bad = [["Cargo.toml", tomlV], ["Cargo.lock", lockV], ["tag", tag]].filter(([, v]) => v !== version);
  if (bad.length) {
    console.error(`package.json is ${version}, but ${bad.map(([n, v]) => `${n} is ${v}`).join(", ")}.`);
    process.exit(1);
  }
  console.log(`Version ${version} everywhere.`);
} else {
  write("src-tauri/Cargo.toml", toml.replace(tomlRe, `$1"${version}"`));
  write("src-tauri/Cargo.lock", lock.replace(lockRe, `$1"${version}"`));
  console.log(`Cargo.toml and Cargo.lock set to ${version}.`);
}
