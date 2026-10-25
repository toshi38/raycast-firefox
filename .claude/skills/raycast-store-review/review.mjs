#!/usr/bin/env node
// Review a Raycast extension the way the Store's reviewers will, before
// publishing. Compares the extension with its published copy in
// raycast/extensions, runs the checks in checks.mjs, and runs the
// extension's lint, build and tests.
//
// Usage: node review.mjs [--extension <dir>] [--store <dir>] [--skip-commands]
//   --extension      extension directory (default: <repo>/raycast-extension)
//   --store          an existing copy of extensions/<name> from raycast/extensions
//                    (default: sparse-clone it into a temporary directory)
//   --skip-commands  don't run npm run lint / build / test
//
// Prints a Markdown report. Exits 1 if any check fails.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  checkChangelog,
  checkLockfiles,
  checkMetadataImages,
  checkPackageJson,
  checkPrettierrc,
  checkSource,
  checkSpelling,
  checkTestsTouched,
  classifyStoreDiffs,
  listHosts,
  listProcesses,
  unusedAssets,
} from "./checks.mjs";

function parseArgs(argv) {
  const args = { skipCommands: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--extension") args.extension = argv[++i];
    else if (argv[i] === "--store") args.store = argv[++i];
    else if (argv[i] === "--skip-commands") args.skipCommands = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === "node_modules" || name === ".git") continue;
      const p = join(d, name);
      statSync(p).isDirectory() ? walk(p) : out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

/** Files Git would publish: tracked plus untracked but not ignored. */
function extensionFiles(dir) {
  return git(dir, "ls-files", "--cached", "--others", "--exclude-standard", ".")
    .split("\n")
    .filter(Boolean)
    .filter((p) => existsSync(join(dir, p)))
    .sort();
}

function cloneStoreCopy(name) {
  const dir = mkdtempSync(join(tmpdir(), "raycast-store-"));
  git(dir, "clone", "--quiet", "--depth", "1", "--filter=blob:none", "--sparse", "https://github.com/raycast/extensions.git", "repo");
  git(join(dir, "repo"), "sparse-checkout", "set", `extensions/${name}`);
  return { path: join(dir, "repo", "extensions", name), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const blobHash = (buffer) => createHash("sha1").update(`blob ${buffer.length}\0`).update(buffer).digest("hex");

/** Keep only lines that aren't in the Store copy, so old text isn't re-reported. */
function addedLines(text, storeText) {
  const old = new Set((storeText ?? "").split("\n"));
  return text
    .split("\n")
    .map((l) => (old.has(l) ? "" : l))
    .join("\n");
}

function runCommand(dir, script) {
  const r = spawnSync("npm", ["run", script], { cwd: dir, encoding: "utf-8" });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-15).join("\n");
  return { script, ok: r.status === 0, output };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = git(process.cwd(), "rev-parse", "--show-toplevel").trim();
  const ext = resolve(args.extension ?? join(repo, "raycast-extension"));
  const read = (p) => readFileSync(join(ext, p), "utf-8");
  const pkg = JSON.parse(read("package.json"));

  const store = args.store ? { path: resolve(args.store), cleanup: () => {} } : cloneStoreCopy(pkg.name);
  try {
    const storeRead = (p) => (existsSync(join(store.path, p)) ? readFileSync(join(store.path, p)) : null);
    const localFiles = extensionFiles(ext);
    const storeFiles = existsSync(store.path) ? listFiles(store.path) : [];

    // -- What this publish changes, and what the Store changed on its own --
    const diffs = [];
    for (const path of new Set([...localFiles, ...storeFiles])) {
      const local = localFiles.includes(path) ? readFileSync(join(ext, path)) : null;
      const remote = storeRead(path);
      if (local && remote && local.equals(remote)) continue;
      diffs.push({ path, storeBlob: remote ? blobHash(remote) : null, deleted: !local });
    }
    const blobKnown = (hash) => spawnSync("git", ["cat-file", "-e", hash], { cwd: repo }).status === 0;
    const { ours, drift } = classifyStoreDiffs(diffs, blobKnown);
    const changed = ours;

    const findings = [];
    for (const path of drift) {
      findings.push({ level: "fail", check: "store-sync", file: path, message: "The Store copy has changes this repository never had. Sync them into main before publishing (see AGENTS.md)." });
    }

    const storeText = (p) => storeRead(p)?.toString("utf-8") ?? null;
    const storePkgText = storeText("package.json");
    const srcFiles = localFiles.filter((p) => /^src\/.+\.(ts|tsx)$/.test(p)).map((path) => ({ path, text: read(path) }));
    const sourceChanged = changed.some((p) => p.startsWith("src/"));

    findings.push(...checkChangelog(read("CHANGELOG.md"), storeText("CHANGELOG.md"), pkg.title, sourceChanged));
    if (existsSync(join(ext, ".prettierrc"))) findings.push(...checkPrettierrc(read(".prettierrc")));
    findings.push(...checkPackageJson(pkg, storePkgText ? JSON.parse(storePkgText) : null));
    findings.push(...checkLockfiles(localFiles, existsSync(join(ext, ".npmrc")) ? read(".npmrc") : null));
    findings.push(...checkSource(srcFiles.filter((f) => changed.includes(f.path))));
    findings.push(...checkTestsTouched(changed));

    // Only text users can see: source, package.json, README and CHANGELOG, not tests.
    const textChanged = changed.filter(
      (p) => localFiles.includes(p) && (/^src\/.+\.(tsx?|json)$/.test(p) || ["package.json", "README.md", "CHANGELOG.md"].includes(p))
    );
    findings.push(...checkSpelling(textChanged.map((path) => ({ path, text: addedLines(read(path), storeText(path)) }))));

    const assets = localFiles.filter((p) => p.startsWith("assets/")).map((p) => p.slice("assets/".length));
    for (const name of unusedAssets(assets, srcFiles.map((f) => f.text), pkg)) {
      findings.push({ level: "fail", check: "assets", file: `assets/${name}`, message: "Not used by the extension; remove it" });
    }
    const images = localFiles.filter((p) => p.startsWith("metadata/")).map((p) => ({ name: p.slice("metadata/".length), buffer: readFileSync(join(ext, p)) }));
    findings.push(...checkMetadataImages(images));

    const commands = args.skipCommands ? [] : ["lint", "build", "test"].filter((s) => pkg.scripts?.[s]).map((s) => runCommand(ext, s));
    for (const c of commands) {
      if (!c.ok) findings.push({ level: "fail", check: "commands", message: `npm run ${c.script} failed:\n\n\`\`\`\n${c.output}\n\`\`\`` });
    }

    process.stdout.write(report({ pkg, changed, drift, findings, commands, processes: listProcesses(srcFiles), hosts: listHosts(srcFiles) }));
    process.exitCode = findings.some((f) => f.level === "fail") ? 1 : 0;
  } finally {
    store.cleanup();
  }
}

function report({ pkg, changed, drift, findings, commands, processes, hosts }) {
  const where = (f) => (f.file ? ` (\`${f.file}${f.line ? `:${f.line}` : ""}\`)` : "");
  const section = (title, level) => {
    const items = findings.filter((f) => f.level === level);
    return items.length ? `## ${title}\n\n${items.map((f) => `- **${f.check}**${where(f)}: ${f.message}`).join("\n")}\n\n` : "";
  };
  const counts = ["fail", "warn", "info"].map((l) => `${findings.filter((f) => f.level === l).length} ${l}`).join(", ");
  return [
    `# Store review: ${pkg.title} (${pkg.name})\n\n`,
    `${counts}. ${changed.length} file(s) differ from the Store copy${drift.length ? `, ${drift.length} of them Store-side drift` : ""}.\n\n`,
    section("Fail (fix before publishing)", "fail"),
    section("Warn (reviewers are likely to comment)", "warn"),
    section("Info (check by hand)", "info"),
    commands.length ? `## Commands\n\n${commands.map((c) => `- \`npm run ${c.script}\`: ${c.ok ? "passed" : "failed"}`).join("\n")}\n\n` : "",
    `## Check by hand\n\n`,
    `Child processes (must be known system binaries, or downloaded from a server you don't control with hash checks):\n\n`,
    processes.length ? processes.map((p) => `- \`${p.binary}\` (${p.where})`).join("\n") : "- none",
    `\n\nHosts contacted:\n\n`,
    hosts.length ? hosts.map((h) => `- \`${h.host}\` (${h.where})`).join("\n") : "- none",
    `\n\n## Changed files\n\n${changed.map((p) => `- \`${p}\``).join("\n") || "- none"}\n`,
  ].join("");
}

main();
