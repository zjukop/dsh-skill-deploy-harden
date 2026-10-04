#!/usr/bin/env node
/*
 * dsh-skill-deploy-harden installer
 * Links the bundled SKILL.md into a DeepSeek Harness skill root so the
 * filesystem skill provider discovers it as <root>/deploy-harden/SKILL.md.
 * Pure packaging plumbing — the SKILL.md body stays zero-code guidance.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const SKILL_NAME = "deploy-harden";
const PKG_DIR = path.resolve(__dirname, "..");
const SRC = path.join(PKG_DIR, "SKILL.md");

function skillRoots() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const agentsHome = process.env.DSH_AGENTS_HOME || path.join(os.homedir(), ".agents");
  const roots = [path.join(home, "skills")];
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      roots.unshift(path.join(dir, ".dsh", "skills"));
      roots.unshift(path.join(dir, ".agents", "skills"));
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  roots.push(path.join(agentsHome, "skills"));
  return roots.filter((r, idx, arr) => arr.indexOf(r) === idx);
}

function install(root) {
  if (!fs.existsSync(SRC)) {
    console.error("✗ SKILL.md not found at " + SRC);
    process.exit(1);
  }
  const destDir = path.join(root, SKILL_NAME);
  const dest = path.join(destDir, "SKILL.md");
  fs.mkdirSync(destDir, { recursive: true });
  try {
    if (fs.existsSync(dest) || fs.lstatSync(dest).isSymbolicLink?.()) {
      fs.rmSync(dest, { force: true });
    }
  } catch (_) {}
  try {
    fs.symlinkSync(SRC, dest, "file");
    console.log("✓ linked  " + dest + " → " + SRC);
  } catch (_) {
    fs.copyFileSync(SRC, dest);
    console.log("✓ copied  " + SRC + " → " + dest + "  (symlink unavailable — copy used)");
  }
  console.log("  skill '" + SKILL_NAME + "' available at root: " + root);
  console.log("  restart DSH (or its watcher will pick it up); the skill appears in the catalog.");
}

function uninstall() {
  let removed = 0;
  for (const root of skillRoots()) {
    const destDir = path.join(root, SKILL_NAME);
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
      console.log("✓ removed " + destDir);
      removed++;
    }
  }
  if (!removed) console.log("nothing to remove — '" + SKILL_NAME + "' was not linked into any skill root.");
}

function showPath() {
  console.log(SRC);
}

function main() {
  const cmd = (process.argv[2] || "install").toLowerCase();
  if (["-h", "--help", "help"].includes(cmd)) {
    console.log("dsh-skill-deploy-harden — install the deploy-harden skill into a DSH skill root");
    console.log("");
    console.log("  dsh-skill-deploy-harden            install (link into ~/.dsh/skills/deploy-harden/)");
    console.log("  dsh-skill-deploy-harden install     same as above");
    console.log("  dsh-skill-deploy-harden path        print the bundled SKILL.md path");
    console.log("  dsh-skill-deploy-harden uninstall  remove the link");
    return;
  }
  if (cmd === "path") return showPath();
  if (cmd === "uninstall") return uninstall();
  if (cmd !== "install") {
    console.error("unknown command: " + cmd + " (try --help)");
    process.exit(1);
  }
  const roots = skillRoots();
  const target = roots.find((r) => r.includes(path.join(os.homedir(), ".dsh"))) || roots[0];
  console.log("installing skill '" + SKILL_NAME + "' into: " + target);
  install(target);
}

main();
