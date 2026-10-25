import assert from "node:assert/strict";
import { describe, test } from "node:test";
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
  pngSize,
  titleCaseProblems,
  unusedAssets,
} from "./checks.mjs";

const levels = (findings) => findings.map((f) => `${f.level}:${f.check}`);
const messages = (findings) => findings.map((f) => f.message).join("\n");

const STORE_CHANGELOG = `# Firefox Tabs Changelog

## [Fix Typing Lag With Many Tabs] - 2026-10-24

- Cache favicons as files

## [Added Setup Command and Native Host Bundling] - 2026-04-22

- One-command setup
`;

describe("checkChangelog", () => {
  test("accepts a new entry with {PR_MERGE_DATE} above the existing ones", () => {
    const text = STORE_CHANGELOG.replace("# Firefox Tabs Changelog\n\n", "# Firefox Tabs Changelog\n\n## [Multiple Profiles] - {PR_MERGE_DATE}\n\n- x\n\n");
    assert.deepEqual(checkChangelog(text, STORE_CHANGELOG, "Firefox Tabs", true), []);
  });

  test("fails a new entry with a fixed date (raycast/extensions#26368, #32702)", () => {
    const text = STORE_CHANGELOG.replace("# Firefox Tabs Changelog\n\n", "# Firefox Tabs Changelog\n\n## [Multiple Profiles] - 2026-10-25\n\n");
    const out = checkChangelog(text, STORE_CHANGELOG, "Firefox Tabs", true);
    assert.deepEqual(levels(out), ["fail:changelog"]);
    assert.match(messages(out), /must end with \{PR_MERGE_DATE\}/);
  });

  test("leaves the dates of entries already in the Store alone", () => {
    assert.deepEqual(checkChangelog(STORE_CHANGELOG, STORE_CHANGELOG, "Firefox Tabs", false), []);
  });

  test("treats an entry whose placeholder the Store replaced with its merge date as existing", () => {
    const local = STORE_CHANGELOG.replace("2026-10-24", "{PR_MERGE_DATE}");
    assert.deepEqual(checkChangelog(local, STORE_CHANGELOG, "Firefox Tabs", false), []);
  });

  test("fails a new entry below an existing one", () => {
    const text = `${STORE_CHANGELOG}\n## [Late Entry] - {PR_MERGE_DATE}\n`;
    assert.match(messages(checkChangelog(text, STORE_CHANGELOG, "Firefox Tabs", true)), /above every existing entry/);
  });

  test("fails a source change with no new entry", () => {
    assert.match(messages(checkChangelog(STORE_CHANGELOG, STORE_CHANGELOG, "Firefox Tabs", true)), /no new entry/);
  });

  test("fails a malformed heading", () => {
    const text = STORE_CHANGELOG.replace("# Firefox Tabs Changelog\n\n", "# Firefox Tabs Changelog\n\n## Multiple Profiles\n\n");
    assert.match(messages(checkChangelog(text, STORE_CHANGELOG, "Firefox Tabs", true)), /Entry heading must be/);
  });

  test("warns when the H1 doesn't match the extension title", () => {
    const text = STORE_CHANGELOG.replace("# Firefox Tabs Changelog", "# firefox-tabs Changelog");
    assert.deepEqual(levels(checkChangelog(text, STORE_CHANGELOG, "Firefox Tabs", false)), ["warn:changelog"]);
  });
});

describe("checkPrettierrc", () => {
  test("accepts Raycast's standard settings", () => {
    assert.deepEqual(checkPrettierrc('{"printWidth": 120, "singleQuote": false}'), []);
  });

  test("fails missing printWidth and singleQuote (raycast/extensions#32702)", () => {
    assert.deepEqual(levels(checkPrettierrc('{"trailingComma": "es5"}')), ["fail:prettier", "fail:prettier", "info:prettier"]);
  });

  test("notes extra settings without failing", () => {
    assert.deepEqual(levels(checkPrettierrc('{"printWidth": 120, "singleQuote": false, "trailingComma": "es5"}')), ["info:prettier"]);
  });

  test("fails invalid JSON", () => {
    assert.deepEqual(levels(checkPrettierrc("{")), ["fail:prettier"]);
  });
});

describe("titleCaseProblems", () => {
  test("accepts Apple-style Title Case, including lowercase minor words", () => {
    assert.deepEqual(titleCaseProblems("Search Firefox Tabs"), []);
    assert.deepEqual(titleCaseProblems("Open in Browser"), []);
    assert.deepEqual(titleCaseProblems("Copy to Clipboard"), []);
    assert.deepEqual(titleCaseProblems("Manage iOS Builds"), []);
  });

  test("reports lowercase words that should be capitalized", () => {
    assert.deepEqual(titleCaseProblems("Search firefox tabs"), ["firefox", "tabs"]);
  });

  test("capitalizes a minor word at the start or end", () => {
    assert.deepEqual(titleCaseProblems("the Tabs"), ["the"]);
    assert.deepEqual(titleCaseProblems("Look it up"), ["it", "up"]);
  });
});

describe("checkPackageJson", () => {
  const base = {
    name: "firefox-tabs",
    title: "Firefox Tabs",
    author: "stephen_lau",
    license: "MIT",
    categories: ["Applications", "Productivity"],
    commands: [
      { name: "search-tabs", title: "Search Firefox Tabs", subtitle: "Firefox", description: "Search tabs" },
      { name: "setup-bridge", title: "Set Up Firefox Bridge", subtitle: "Firefox", description: "Set up" },
    ],
  };

  test("accepts a well-formed manifest", () => {
    assert.deepEqual(checkPackageJson(base, base), []);
  });

  test("fails a renamed command and a changed author", () => {
    const pkg = { ...base, author: "someone", commands: [{ ...base.commands[0], name: "search" }, base.commands[1]] };
    const out = checkPackageJson(pkg, base);
    assert.deepEqual(levels(out), ["fail:package", "fail:package"]);
    assert.match(messages(out), /author changed/);
    assert.match(messages(out), /"search-tabs" was removed or renamed/);
  });

  test("warns about 'Setup' used as a verb in a command title", () => {
    const pkg = { ...base, commands: [base.commands[0], { ...base.commands[1], title: "Setup Firefox Bridge" }] };
    assert.match(messages(checkPackageJson(pkg, base)), /"Set Up"/);
  });

  test("warns when several commands have no subtitle", () => {
    const pkg = { ...base, commands: base.commands.map(({ subtitle, ...c }) => c) };
    assert.match(messages(checkPackageJson(pkg, base)), /subtitle with the service name/);
  });

  test("fails license, categories and missing descriptions", () => {
    const pkg = { ...base, license: "ISC", categories: ["Browsers"], commands: [{ name: "a", title: "A" }] };
    assert.deepEqual(levels(checkPackageJson(pkg, null)), ["fail:package", "fail:package", "fail:package"]);
  });
});

describe("checkLockfiles", () => {
  test("accepts package-lock.json and the npm registry", () => {
    assert.deepEqual(checkLockfiles(["package.json", "package-lock.json"], "registry=https://registry.npmjs.org/\n"), []);
  });

  test("fails other lock files, a missing package-lock.json and other registries", () => {
    const out = checkLockfiles(["package.json", "yarn.lock"], "@me:registry=https://npm.example.com\n");
    assert.deepEqual(levels(out), ["fail:lockfile", "fail:lockfile", "fail:lockfile"]);
  });
});

describe("checkSource", () => {
  const src = (text) => checkSource([{ path: "src/x.tsx", text }]);

  test("warns about launchCommand outside try/catch", () => {
    const out = src(`const a = () => launchCommand({ name: "x", type: LaunchType.UserInitiated });`);
    assert.deepEqual(levels(out), ["warn:source"]);
    assert.equal(out[0].line, 1);
  });

  test("accepts launchCommand inside try", () => {
    assert.deepEqual(src(`try {\n  await launchCommand({ name: "x" });\n} catch (e) {\n  console.error(e);\n}`), []);
  });

  test("warns about a data-loading List without isLoading", () => {
    const out = src(`const { data } = usePromise(load);\nreturn <List searchBarPlaceholder="Search">{x}</List>;`);
    assert.deepEqual(levels(out), ["warn:source"]);
  });

  test("lets a static List sit next to one that passes isLoading", () => {
    const out = src(`usePromise(load);\nif (e) return <List searchBarPlaceholder="a"></List>;\nreturn <List isLoading={l} searchBarPlaceholder="b"></List>;`);
    assert.deepEqual(out, []);
  });

  test("notes a List without a search bar placeholder", () => {
    assert.deepEqual(levels(src(`return <List isLoading={false}></List>;`)), ["info:source"]);
  });

  test("suggests showFailureToast for a failure toast in a catch block", () => {
    const out = src(`try { x(); } catch (error) { await showToast({ style: Toast.Style.Failure, title: "x" }); }`);
    assert.match(messages(out), /showFailureToast/);
  });

  test("warns about an action titled with 'Setup' as a verb", () => {
    assert.match(messages(src(`<Action title="Setup Native Host" onAction={f} />`)), /"Set Up"/);
  });
});

describe("listProcesses and listHosts", () => {
  const files = [
    {
      path: "src/a.ts",
      text: `const FIREFOX_BINARY = "/Applications/Firefox.app/Contents/MacOS/firefox";
execFile("pgrep", ["-x", "firefox"]);
execFile("/usr/bin/sqlite3", ["-json"]);
run(FIREFOX_BINARY, args);
fetch("https://api.github.com/repos/x");`,
    },
  ];

  test("lists the binaries started, including absolute paths held in constants", () => {
    assert.deepEqual(
      listProcesses(files).map((p) => p.binary).sort(),
      ["/Applications/Firefox.app/Contents/MacOS/firefox", "/usr/bin/sqlite3", "pgrep"]
    );
  });

  test("lists the hosts contacted", () => {
    assert.deepEqual(listHosts(files).map((h) => h.host), ["api.github.com"]);
  });
});

describe("checkSpelling", () => {
  test("flags British spellings in strings and Markdown", () => {
    const out = checkSpelling([
      { path: "CHANGELOG.md", text: "- Show each profile's colour" },
      { path: "src/a.ts", text: `const t = "Favourite tabs";` },
    ]);
    assert.deepEqual(out.map((f) => f.message.match(/"(\w+)"/)[1]), ["colour", "Favourite"]);
  });

  test("ignores comments and identifiers in source", () => {
    const out = checkSpelling([{ path: "src/a.ts", text: `// pick a colour\nconst colour = PROFILE_COLOURS[0]; /* behaviour */` }]);
    assert.deepEqual(out, []);
  });
});

describe("assets and metadata", () => {
  test("finds assets nothing references", () => {
    assert.deepEqual(unusedAssets(["icon.png", "old.png", "firefox-icon.png"], [`source: "firefox-icon.png"`], { icon: "icon.png" }), ["old.png"]);
  });

  const png = (w, h) => {
    const b = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(h, 20);
    return b;
  };

  test("reads PNG dimensions", () => {
    assert.deepEqual(pngSize(png(2000, 1250)), { width: 2000, height: 1250 });
    assert.equal(pngSize(Buffer.from("not a png")), null);
  });

  test("requires 2000x1250 PNG screenshots, at most 6", () => {
    assert.deepEqual(checkMetadataImages([{ name: "a.png", buffer: png(2000, 1250) }]), []);
    assert.deepEqual(levels(checkMetadataImages([{ name: "a.png", buffer: png(1000, 625) }])), ["fail:metadata"]);
    const seven = Array.from({ length: 7 }, (_, i) => ({ name: `${i}.png`, buffer: png(2000, 1250) }));
    assert.deepEqual(levels(checkMetadataImages(seven)), ["fail:metadata"]);
  });
});

describe("classifyStoreDiffs", () => {
  test("separates this change's edits from Store-side drift", () => {
    const known = new Set(["aaa"]);
    const result = classifyStoreDiffs(
      [
        { path: "src/new.ts", storeBlob: null },
        { path: "src/changed.ts", storeBlob: "aaa" },
        { path: "assets/icon.png", storeBlob: "bbb" },
      ],
      (hash) => known.has(hash)
    );
    assert.deepEqual(result, { ours: ["src/new.ts", "src/changed.ts"], drift: ["assets/icon.png"] });
  });
});

describe("checkTestsTouched", () => {
  test("warns when source changes without tests", () => {
    assert.deepEqual(levels(checkTestsTouched(["src/lib/a.ts", "CHANGELOG.md"])), ["warn:tests"]);
  });

  test("accepts source changes that come with test changes", () => {
    assert.deepEqual(checkTestsTouched(["src/lib/a.ts", "test/a.test.ts"]), []);
  });
});
