// Checks a Raycast extension against the rules Raycast's Store reviewers and
// review bots apply. Each check is a pure function over file contents and
// returns findings; review.mjs gathers the files and prints the report.
//
// Rule sources:
// - https://github.com/raycast/extensions/blob/main/.github/copilot-instructions.md
//   (what the review bots are told to check)
// - https://developers.raycast.com/basics/prepare-an-extension-for-store
// - Comments on earlier firefox-tabs Store PRs (raycast/extensions#26368, #32702)

/** @typedef {"fail" | "warn" | "info"} Level */
/** @typedef {{ level: Level, check: string, message: string, file?: string, line?: number }} Finding */

const finding = (level, check, message, file, line) => ({ level, check, message, ...(file ? { file } : {}), ...(line ? { line } : {}) });

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// -- CHANGELOG.md --

const ENTRY = /^## \[(.+?)\] - (\{PR_MERGE_DATE\}|\d{4}-\d{2}-\d{2})\s*$/;

/**
 * New entries (headings not in the Store copy) must use {PR_MERGE_DATE} and
 * sit above every existing entry; entries already in the Store keep their
 * dates. The H1 should match the extension title.
 */
export function checkChangelog(text, storeText, title, sourceChanged) {
  const out = [];
  const lines = text.split("\n");
  const storeHeadings = new Set((storeText ?? "").split("\n").filter((l) => l.startsWith("## ")).map((l) => l.trim()));
  const storeTitles = new Set([...storeHeadings].map((l) => l.match(ENTRY)?.[1]).filter(Boolean));

  const h1 = lines.find((l) => l.startsWith("# "));
  if (h1 && h1.trim() !== `# ${title} Changelog`) {
    out.push(finding("warn", "changelog", `H1 is "${h1.trim()}"; reviewers expect it to match the title: "# ${title} Changelog"`, "CHANGELOG.md", lines.indexOf(h1) + 1));
  }

  let seenExisting = false;
  let newEntries = 0;
  lines.forEach((line, i) => {
    if (!line.startsWith("## ")) return;
    const m = line.match(ENTRY);
    if (!m) {
      out.push(finding("fail", "changelog", `Entry heading must be "## [Title] - {PR_MERGE_DATE}": ${line.trim()}`, "CHANGELOG.md", i + 1));
      return;
    }
    const isNew = !storeHeadings.has(line.trim()) && !storeTitles.has(m[1]);
    if (!isNew) {
      seenExisting = true;
      return;
    }
    newEntries++;
    if (m[2] !== "{PR_MERGE_DATE}") {
      out.push(finding("fail", "changelog", `New entry "${m[1]}" must end with {PR_MERGE_DATE}, not ${m[2]}`, "CHANGELOG.md", i + 1));
    }
    if (seenExisting) {
      out.push(finding("fail", "changelog", `New entry "${m[1]}" must be above every existing entry`, "CHANGELOG.md", i + 1));
    }
  });

  if (sourceChanged && newEntries === 0) {
    out.push(finding("fail", "changelog", "Source changed but CHANGELOG.md has no new entry", "CHANGELOG.md"));
  }
  return out;
}

// -- .prettierrc --

export function checkPrettierrc(text) {
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    return [finding("fail", "prettier", ".prettierrc is not valid JSON", ".prettierrc")];
  }
  const out = [];
  if (config.printWidth !== 120) out.push(finding("fail", "prettier", `printWidth must be 120 (is ${config.printWidth})`, ".prettierrc"));
  if (config.singleQuote !== false) out.push(finding("fail", "prettier", `singleQuote must be false (is ${config.singleQuote})`, ".prettierrc"));
  const extra = Object.keys(config).filter((k) => k !== "printWidth" && k !== "singleQuote");
  if (extra.length) out.push(finding("info", "prettier", `Settings beyond Raycast's standard: ${extra.join(", ")}`, ".prettierrc"));
  return out;
}

// -- package.json --

const CATEGORIES = new Set(["Applications", "Communication", "Data", "Documentation", "Design Tools", "Developer Tools", "Finance", "Fun", "Media", "News", "Productivity", "Security", "System", "Web", "Other"]);

/** Words Apple's style guide leaves lowercase in titles, unless first or last. */
const MINOR_WORDS = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "vs", "with", "from", "into", "onto", "over", "than"]);

/**
 * Words that are wrong in Title Case: lowercase words that should be
 * capitalized. Leaves words with internal capitals or digits (iOS, macOS,
 * npm-style names written in code) alone.
 */
export function titleCaseProblems(title) {
  const words = title.split(/\s+/).filter(Boolean);
  return words.filter((word, i) => {
    const bare = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (!bare || /[\p{Lu}\d]/u.test(bare.slice(1)) || /\d/.test(bare)) return false;
    const minor = MINOR_WORDS.has(bare.toLowerCase()) && i !== 0 && i !== words.length - 1;
    return !minor && bare[0] === bare[0].toLowerCase() && bare[0] !== bare[0].toUpperCase();
  });
}

/**
 * "Setup" is a noun; as a verb in a title it is two words. The two places
 * titles live disagree on the case of "up":
 * - package.json titles: Greptile applies Apple Title Case and asks for
 *   "Set Up" (raycast/extensions#32748).
 * - Action titles in source: the @raycast/prefer-title-case lint rule keeps
 *   "up" lowercase, so "Set Up" fails `ray lint`; use "Set up".
 */
const SETUP_VERB = /^Setup\b/;
const SET_UP_LOWERCASE = /\bSet up\b/;

export function checkPackageJson(pkg, storePkg) {
  const out = [];
  const file = "package.json";
  if (storePkg) {
    if (pkg.author !== storePkg.author) out.push(finding("fail", "package", `author changed from "${storePkg.author}" to "${pkg.author}"`, file));
    const names = new Set((pkg.commands ?? []).map((c) => c.name));
    for (const c of storePkg.commands ?? []) {
      if (!names.has(c.name)) {
        out.push(finding("fail", "package", `Command name "${c.name}" was removed or renamed; names hold users' rankings, aliases and hotkeys. Keep the name and change the title instead.`, file));
      }
    }
  }
  if (pkg.license !== "MIT") out.push(finding("fail", "package", `license must be MIT (is ${pkg.license})`, file));
  if (!pkg.categories?.length) out.push(finding("fail", "package", "At least one category is required", file));
  for (const cat of pkg.categories ?? []) {
    if (!CATEGORIES.has(cat)) out.push(finding("fail", "package", `Unknown category "${cat}"`, file));
  }
  for (const [what, title] of [["Extension title", pkg.title], ...(pkg.commands ?? []).map((c) => [`Command "${c.name}" title`, c.title])]) {
    if (!title) continue;
    const bad = titleCaseProblems(title);
    if (bad.length) out.push(finding("warn", "package", `${what} "${title}" is not Title Case: ${bad.join(", ")}`, file));
    if (SETUP_VERB.test(title)) out.push(finding("warn", "package", `${what} "${title}": as a verb it is "Set Up" (titles use <verb> <noun>)`, file));
    if (SET_UP_LOWERCASE.test(title)) out.push(finding("warn", "package", `${what} "${title}": package.json titles use Apple Title Case, "Set Up" (raycast/extensions#32748)`, file));
  }
  const commands = pkg.commands ?? [];
  for (const c of commands) {
    if (!c.description) out.push(finding("fail", "package", `Command "${c.name}" has no description`, file));
  }
  if (commands.length > 1) {
    const missing = commands.filter((c) => !c.subtitle).map((c) => c.name);
    if (missing.length) {
      out.push(finding("warn", "package", `With several commands, reviewers ask for a subtitle with the service name (e.g. "subtitle": "Firefox"): ${missing.join(", ")}`, file));
    }
  }
  return out;
}

// -- Lock files and registries --

export function checkLockfiles(fileNames, npmrcText) {
  const out = [];
  for (const name of ["yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"]) {
    if (fileNames.includes(name)) out.push(finding("fail", "lockfile", `${name} is not allowed; use package-lock.json only`, name));
  }
  if (!fileNames.includes("package-lock.json")) out.push(finding("fail", "lockfile", "package-lock.json is missing", "package-lock.json"));
  if (npmrcText) {
    for (const m of npmrcText.matchAll(/registry\s*=\s*(\S+)/g)) {
      if (!m[1].startsWith("https://registry.npmjs.org")) out.push(finding("fail", "lockfile", `Only the npm registry is allowed: ${m[1]}`, ".npmrc"));
    }
  }
  return out;
}

// -- Source code --

/** Index of the start of the enclosing block statement that begins with `try`, if any. */
function insideTry(text, index) {
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    const ch = text[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        if (/\btry\s*$/.test(text.slice(Math.max(0, i - 10), i))) return true;
      } else depth--;
    }
  }
  return false;
}

/**
 * Bot-review rules for source files:
 * - launchCommand must be wrapped in try/catch
 * - List and Grid need isLoading (no empty-state flicker) and a search bar placeholder
 * - Failure toasts in catch blocks could use showFailureToast
 * - Action titles must not start with "Setup" as a verb
 */
export function checkSource(files) {
  const out = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(/\blaunchCommand\s*\(/g)) {
      if (!insideTry(text, m.index)) {
        out.push(finding("warn", "source", "launchCommand is not wrapped in try/catch (review bots ask for one)", path, lineOf(text, m.index)));
      }
    }
    const loadsData = /\b(usePromise|useCachedPromise|useFetch|useExec|useSQL|useStreamJSON|useAI)\b/.test(text);
    const views = [...text.matchAll(/<(List|Grid)(\s[^>]*)?>/g)];
    // A file whose main view already passes isLoading may also render a
    // static view (an error or "not installed" screen) that doesn't need it.
    const anyLoading = views.some((m) => /\bisLoading\b/.test(m[2] ?? ""));
    for (const m of views) {
      const attrs = m[2] ?? "";
      if (loadsData && !anyLoading && !/\bisLoading\b/.test(attrs)) {
        out.push(finding("warn", "source", `<${m[1]}> without isLoading shows an empty state while loading`, path, lineOf(text, m.index)));
      }
      if (!/\bsearchBarPlaceholder\b/.test(attrs)) {
        out.push(finding("info", "source", `<${m[1]}> has no searchBarPlaceholder (Raycast: never leave the search bar without one)`, path, lineOf(text, m.index)));
      }
    }
    for (const m of text.matchAll(/catch\s*(\([^)]*\))?\s*\{[^}]*showToast\(\s*\{[^}]*Toast\.Style\.Failure/g)) {
      out.push(finding("info", "source", "A failure toast in a catch block could use showFailureToast from @raycast/utils", path, lineOf(text, m.index)));
    }
    for (const m of text.matchAll(/title=(?:"|\{`)(Setup\b[^"`]*)/g)) {
      out.push(finding("warn", "source", `Title "${m[1]}": as a verb it is "Set up" (ray lint keeps "up" lowercase)`, path, lineOf(text, m.index)));
    }
  }
  return out;
}

/** Child processes the extension starts, for checking they are known system binaries. */
export function listProcesses(files) {
  const found = new Map();
  for (const { path, text } of files) {
    for (const m of text.matchAll(/\b(execFile|execFileSync|spawn|spawnSync|exec|execSync)\(\s*(["'`])([^"'`]+)\2/g)) {
      const key = m[3];
      if (!found.has(key)) found.set(key, `${path}:${lineOf(text, m.index)}`);
    }
    for (const m of text.matchAll(/\b(execFile|execFileSync|spawn|spawnSync)\(\s*([A-Z_][A-Z0-9_]*)\b/g)) {
      const value = text.match(new RegExp(`const ${m[2]}\\s*=\\s*["'\`]([^"'\`]+)`))?.[1] ?? m[2];
      if (!found.has(value)) found.set(value, `${path}:${lineOf(text, m.index)}`);
    }
    for (const m of text.matchAll(/(["'`])(\/(?:usr\/)?s?bin\/[\w.-]+|\/Applications\/[^"'`]+\/Contents\/MacOS\/[^"'`]+)\1/g)) {
      if (!found.has(m[2])) found.set(m[2], `${path}:${lineOf(text, m.index)}`);
    }
  }
  return [...found].map(([binary, where]) => ({ binary, where }));
}

/** Hosts the extension contacts, from URL literals. */
export function listHosts(files) {
  const hosts = new Map();
  for (const { path, text } of files) {
    for (const m of text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) {
      if (!hosts.has(m[1])) hosts.set(m[1], `${path}:${lineOf(text, m.index)}`);
    }
  }
  return [...hosts].map(([host, where]) => ({ host, where }));
}

// -- US English --

/** British spellings that reviewers would flag in user-facing text. */
const BRITISH = {
  colour: "color", colours: "colors", coloured: "colored", behaviour: "behavior", behaviours: "behaviors",
  favourite: "favorite", favourites: "favorites", optimise: "optimize", optimised: "optimized", optimising: "optimizing",
  organise: "organize", organised: "organized", recognise: "recognize", recognised: "recognized", initialise: "initialize",
  initialised: "initialized", licence: "license", cancelled: "canceled", cancelling: "canceling", centre: "center",
  customise: "customize", customised: "customized", prioritise: "prioritize", synchronise: "synchronize", analyse: "analyze",
  catalogue: "catalog", grey: "gray", minimise: "minimize", maximise: "maximize", summarise: "summarize",
};

/** Words in a string the user will see: drop comments and keep literals. */
function userFacingText(path, text) {
  if (!/\.(tsx?|jsx?)$/.test(path)) return text;
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/.*$/gm, (c, p) => p + " ".repeat(c.length - p.length));
  return withoutComments.replace(/(["'`])((?:\\.|(?!\1).)*)\1|[^"'`\n]+/g, (m, q, body) => (q ? `${q}${body}${q}` : " ".repeat(m.length)));
}

export function checkSpelling(files) {
  const out = [];
  for (const { path, text } of files) {
    const visible = userFacingText(path, text);
    for (const m of visible.matchAll(/\b[A-Za-z]+\b/g)) {
      const us = BRITISH[m[0].toLowerCase()];
      if (us) out.push(finding("warn", "spelling", `"${m[0]}" is British; Raycast is US English: "${us}"`, path, lineOf(visible, m.index)));
    }
  }
  return out;
}

// -- Assets and metadata --

/** Files in assets/ that neither the source nor package.json mentions. */
export function unusedAssets(assetNames, sourceTexts, pkg) {
  const haystack = sourceTexts.join("\n") + JSON.stringify(pkg);
  return assetNames.filter((name) => !haystack.includes(name));
}

/** Width and height of a PNG, or null if `buffer` isn't one. */
export function pngSize(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 24 || signature.some((b, i) => buffer[i] !== b)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function checkMetadataImages(images) {
  const out = [];
  if (images.length > 6) out.push(finding("fail", "metadata", `At most 6 screenshots (has ${images.length})`, "metadata"));
  for (const { name, buffer } of images) {
    const size = pngSize(buffer);
    if (!size) out.push(finding("fail", "metadata", "Screenshots must be PNG", `metadata/${name}`));
    else if (size.width !== 2000 || size.height !== 1250) {
      out.push(finding("fail", "metadata", `Screenshots must be 2000x1250 (is ${size.width}x${size.height})`, `metadata/${name}`));
    }
  }
  return out;
}

// -- Store sync and tests --

/**
 * Split files that differ from the Store copy into this change's own edits
 * and drift: Store-side edits (merge dates, image optimisation, dependency
 * bumps) that have to be synced into main before publishing. A Store file is
 * ours if this repository has ever had that exact content.
 */
export function classifyStoreDiffs(diffs, blobKnown) {
  const ours = [];
  const drift = [];
  for (const d of diffs) {
    if (d.storeBlob === null || blobKnown(d.storeBlob)) ours.push(d.path);
    else drift.push(d.path);
  }
  return { ours, drift };
}

/** Changed source files with no changed test file alongside them. */
export function checkTestsTouched(changedPaths) {
  const source = changedPaths.filter((p) => /^src\/.+\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts"));
  const tests = changedPaths.filter((p) => /^test\//.test(p));
  if (source.length && !tests.length) {
    return [finding("warn", "tests", `Source changed with no test changes: ${source.join(", ")}`)];
  }
  return [];
}
