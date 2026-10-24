import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  ALLOW_MARKER,
  decodeText,
  findProblems,
  formatProblem,
  gitEnv,
  isSensitiveName,
  LOCAL_TERMS_FILE,
  main,
  parseTerms,
  RULE_TEXT,
} from "./check-public.mjs";

// The samples that must be flagged are built from pieces, so that none of them is in this file in
// one piece. This file is checked by the very check it tests, and it has to pass.

const at = (...parts: string[]) => parts.join("@");
const backslash = (...parts: string[]) => parts.join("\\");
const slash = (...parts: string[]) => parts.join("/");
const file = (name: string, text: string) => ({ path: name, text });
const rulesOf = (text: string, terms: Parameters<typeof findProblems>[1] = []) =>
  findProblems([file("notes.md", text)], terms).map((problem) => problem.rule);

// Git is run with the variables that point it at one repository removed, as the check does, so a
// test run from inside a git hook cannot reach into the real repository.
const cleanEnv = gitEnv;

describe("an email address", () => {
  it.each([
    ["an ordinary address", `Write to ${at("alice", "real-domain.com")} today`],
    ["inside angle brackets", `<${at("alice.b", "real-domain.org")}>`],
    [
      "a GitHub noreply address, which carries an account number",
      at("12345+alice", "users.noreply.github.com"),
    ],
  ])("is flagged: %s", (_label, text) => {
    expect(rulesOf(text)).toEqual(["email"]);
  });

  it("is flagged together with the school address rule when it is at a school domain", () => {
    expect(rulesOf(at("bob", ["school", "edu"].join(".")))).toEqual(["account-details", "email"]);
  });

  // Nobody can own these, so a made-up address at one of them is what a test or a document uses.
  it.each([
    at("someone", "evil.example"),
    at("someone", "example.com"),
    at("someone", "mail.example.org"),
    at("someone", "example.net"),
    at("someone", "host.test"),
    at("someone", "host.invalid"),
    at("someone", "printer.localhost"),
  ])("is allowed at a reserved domain: %s", (address) => {
    expect(rulesOf(address)).toEqual([]);
  });

  it("is not a version, a pinned action, a scoped package, or a name at a host with no domain", () => {
    for (const text of [
      "eslint@9.39.5",
      "react@18.3.1 and zod@4.6.5",
      "uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
      "import type { X } from '@types/node';",
      "someone@localhost",
    ]) {
      expect(rulesOf(text), text).toEqual([]);
    }
  });

  // A minified file or a data address is one line of a million characters. The time to look at it
  // must grow with the length, not with its square, or verify would hang on an icon.
  it("is found in a very long line in a time that does not grow with its square", () => {
    const address = at("alice", "real-domain.com");
    const started = performance.now();
    expect(rulesOf("a".repeat(60_000))).toEqual([]);
    expect(rulesOf(`x@${"a.".repeat(30_000)}`)).toEqual([]);
    expect(rulesOf(`${"b".repeat(60_000)} ${address}`)).toEqual(["email"]);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("a path into a user folder", () => {
  it.each([
    ["a Windows path with backslashes", backslash("C:", "Users", "alice", "repos")],
    ["a Windows path with slashes", slash("C:", "Users", "alice")],
    ["a Windows path as written inside a JavaScript string", `C:${"\\\\"}Users${"\\\\"}alice`],
    ["a Windows path as Git Bash writes it", slash("", "c", "Users", "alice", "repos")],
    ["a Windows path as Cygwin writes it", slash("", "cygdrive", "c", "Users", "alice")],
    ["a Mac path", slash("", "Users", "alice", "projects")],
    ["a Linux path", slash("", "home", "alice", "projects")],
    ["a path through WSL", slash("", "mnt", "c", "Users", "alice")],
    ["the Windows data folder of a program", `cached in ${["App", "Data"].join("")} somewhere`],
  ])("is flagged: %s", (_label, text) => {
    expect(rulesOf(text)).toEqual(["user-path"]);
  });

  it("is not a made-up path, a web address with /home/ in it, a route, or a relative path", () => {
    for (const text of [
      // Routes and names in lower case, which this app has plenty of.
      "request(app).get('/users/me')",
      "GET /users/123",
      "const appData = load()",
      backslash("C:", "private", "notes.txt"),
      backslash("C:", "somewhere", "data", "notes.txt"),
      "https://example.com/home/welcome",
      "https://example.com/c/Users/welcome",
      "see docs/Users/guide.md",
      "see docs/c/Users/guide.md",
      "the /home page",
    ]) {
      expect(rulesOf(text), text).toEqual([]);
    }
  });
});

describe("a key or token shape", () => {
  it.each([
    ["a private key header", ["-----BEGIN", "PRIVATE KEY-----"].join(" RSA ")],
    ["a plain private key header", ["-----BEGIN", "PRIVATE KEY-----"].join(" ")],
    ["a GitHub token", ["ghp", "a".repeat(36)].join("_")],
    ["a GitHub OAuth token", ["gho", "h".repeat(30)].join("_")],
    ["a GitHub fine-grained token", ["github", "pat", "B".repeat(40)].join("_")],
    ["a secret key with the sk prefix", ["sk", "c".repeat(30)].join("-")],
    ["an Anthropic key, which has hyphens in it", ["sk", "ant", "x-y_z".repeat(8)].join("-")],
    ["an OpenAI project key", ["sk", "proj", "p".repeat(40)].join("-")],
    ["a Stripe live key", ["sk_live", "e".repeat(24)].join("_")],
    ["an npm token", ["npm", "f".repeat(36)].join("_")],
    ["a Google API key", ["AIza", "g".repeat(35)].join("")],
    ["an AWS access key id", ["AKIA", "D".repeat(16)].join("")],
    ["a Slack token", ["xoxb", "1234567890123"].join("-")],
    ["a JSON web token", ["eyJ" + "a".repeat(20), "b".repeat(20), "c".repeat(20)].join(".")],
    ["a value for the credential key", ["CREDENTIAL_KEY", "=" + "d".repeat(44)].join("")],
    ["a quoted secret for sign-in", ["BETTER_AUTH_SECRET", ': "' + "e".repeat(32) + '"'].join("")],
  ])("is flagged: %s", (_label, text) => {
    expect(rulesOf(`token = ${text}`)).toEqual(["secret"]);
  });

  it("is not a secret name with no value, a longer name, or a mention in a sentence", () => {
    for (const text of [
      ["CREDENTIAL_KEY", "="].join(""),
      ["BETTER_AUTH_SECRET", "="].join(""),
      ["CREDENTIAL_KEY_VERSION", "=1"].join(""),
      "Set the credential key in the environment",
      "`CREDENTIAL_KEY` is validated at boot: base64, exactly 32 bytes",
    ]) {
      expect(rulesOf(text), text).toEqual([]);
    }
  });

  it("is not a short lookalike or a longer word that ends in the prefix", () => {
    for (const text of [
      "ghp_short",
      "sk-learn",
      "sk-ant-short",
      "npm_install",
      "AKIA1234",
      ["disk", "usage-and-more-than-twenty-characters-here"].join("-"),
      "the xox-ing of tokens",
    ]) {
      expect(rulesOf(text), text).toEqual([]);
    }
  });
});

describe("a Claude plan name or a school address", () => {
  it.each([
    ["Claude", "Pro"].join(" "),
    ["claude", "max"].join(" "),
    ["Claude", "Team"].join(" "),
    ["school", "edu"].join("."),
  ])("is flagged, whatever the case: %s", (text) => {
    expect(rulesOf(`I have ${text} here`)).toEqual(["account-details"]);
    expect(rulesOf(`I have ${text.toUpperCase()} here`)).toEqual(["account-details"]);
  });

  // This app is about accounts and plans, so the words themselves are what its documents say.
  it("is not an ordinary word, and not a word about accounts or plans on its own", () => {
    for (const text of [
      "a monthly subscription with included tokens",
      "Delete account, with your password",
      "the paid plan, later",
      "a team of two",
      "the max plan",
      "education and reduce",
      "Claude Code",
      "a max of three",
      "a pro tip",
    ]) {
      expect(rulesOf(text), text).toEqual([]);
    }
  });
});

// The marker waives the rules it names, on its own line. It is not a way to switch the check off.
describe("the allow marker", () => {
  const address = at("alice", "real-domain.com");

  it("skips the rule it names on that line, and only that line", () => {
    const found = findProblems([
      file("notes.md", [`${address} ${ALLOW_MARKER} email`, address].join("\n")),
    ]);
    expect(found).toEqual([{ path: "notes.md", line: 2, rule: "email" }]);
  });

  it("does not skip a rule it does not name", () => {
    expect(rulesOf(`${address} ${ALLOW_MARKER} user-path`)).toEqual(["email"]);
  });

  it("can name more than one rule", () => {
    const text = `${address} ${backslash("C:", "Users", "alice")} ${ALLOW_MARKER} email, user-path`;
    expect(rulesOf(text)).toEqual([]);
    expect(rulesOf(`${text.replace("user-path", "secret")}`)).toEqual(["user-path"]);
  });

  it("with no rule after it waives nothing, so the documentation that quotes it is still checked", () => {
    expect(rulesOf(`${address} ${ALLOW_MARKER}`)).toEqual(["email"]);
    expect(rulesOf(`${address} ${ALLOW_MARKER} for a made-up example`)).toEqual(["email"]);
  });

  it("never waives a private term", () => {
    const { terms } = parseTerms("zebra quokka");
    expect(rulesOf(`zebra quokka ${ALLOW_MARKER} private-term`, terms)).toEqual(["private-term"]);
  });
});

describe("the private terms", () => {
  it("are literal and ignore case, and a line can hold more than one", () => {
    const { terms } = parseTerms("Quokka Zebra\nmarmot");
    expect(rulesOf("the quokka zebra said hi", terms)).toEqual(["private-term"]);
    expect(rulesOf("a MARMOT", terms)).toEqual(["private-term"]);
    expect(rulesOf("a quokka alone", terms)).toEqual([]);
  });

  it("skip blank lines and comments", () => {
    const { terms, tooShort } = parseTerms("# my own words\n\n   \n  marmot  \n");
    expect(terms).toHaveLength(1);
    expect(tooShort).toBe(0);
    expect(rulesOf("# my own words", terms)).toEqual([]);
  });

  it("take a regular expression after re:", () => {
    const { terms } = parseTerms("re:^room \\d{3}$");
    expect(rulesOf("room 214", terms)).toEqual(["private-term"]);
    expect(rulesOf("a room 214", terms)).toEqual([]);
  });

  it("ignore a term that is too short to mean anything, and count it", () => {
    const { terms, tooShort } = parseTerms("ab\nabc");
    expect(tooShort).toBe(1);
    expect(rulesOf("ab", terms)).toEqual([]);
    expect(rulesOf("abc", terms)).toEqual(["private-term"]);
  });

  it("refuse a regular expression that does not parse, and say which line", () => {
    expect(() => parseTerms("fine\nre:(oops")).toThrow(`${LOCAL_TERMS_FILE} line 2`);
  });
});

describe("how a file is read", () => {
  const utf16 = (text: string) =>
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);

  it("reads plain UTF-8 as it is", () => {
    expect(decodeText(Buffer.from("zebra quokka\nmarmot"))).toBe("zebra quokka\nmarmot");
  });

  it("drops a UTF-8 byte order mark", () => {
    expect(
      decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("marmot")])),
    ).toBe("marmot");
  });

  // What PowerShell 5.1 writes for `echo text > file`. Read as UTF-8 it has a NUL between the
  // letters, and no term would ever match.
  it("reads UTF-16 with a byte order mark, which Windows tools write", () => {
    expect(decodeText(utf16("zebra quokka\r\nmarmot"))).toBe("zebra quokka\r\nmarmot");
    expect(parseTerms(decodeText(utf16("zebra quokka\r\n"))).terms).toHaveLength(1);
  });
});

describe("a file that must not be published", () => {
  it.each([
    ".env",
    ".env.local",
    "config/.env.production",
    // Windows and macOS keep names in any case, so these are the same files.
    ".ENV",
    ".Env.Local",
    "ID.KEY",
    "PGDATA/PG_VERSION",
    "pgdata/PG_VERSION",
    "local/pgdata/base/1",
    "x.sqlite",
    "x.sqlite-wal",
    "x.sqlite3",
    "a/b.db",
    "backup.dump",
    "k.pem",
    "id.key",
    "c.p12",
    "c.pfx",
    LOCAL_TERMS_FILE,
    "notes/" + LOCAL_TERMS_FILE,
    ".Public-Check.Local",
    // The copies an editor or Windows makes of the file of private terms.
    LOCAL_TERMS_FILE + ".txt",
    LOCAL_TERMS_FILE + ".bak",
    LOCAL_TERMS_FILE + "~",
  ])("is flagged by its name: %s", (name) => {
    expect(isSensitiveName(name)).toBe(true);
  });

  it.each([
    ".env.example",
    ".ENV.EXAMPLE",
    "lib/db.ts",
    "lib/db.test.ts",
    "app/data-table.tsx",
    "lib/data.ts",
    "key.ts",
    "docs/database.md",
    "README.md",
    "scripts/check-public.mjs",
    // Migrations and the schema are code, and they belong in the repository.
    "apps/api/prisma/schema.prisma",
    "apps/api/prisma/migrations/20261023000000_init/migration.sql",
    "docker-compose.yml",
  ])("is not flagged by its name: %s", (name) => {
    expect(isSensitiveName(name)).toBe(false);
  });

  it("is reported on its own, and its content is not read", () => {
    const found = findProblems([file(".env", at("alice", "real-domain.com"))]);
    expect(found).toEqual([{ path: ".env", line: 0, rule: "sensitive-file" }]);
  });
});

describe("what is left out", () => {
  const address = at("alice", "real-domain.com");

  it("skips the lock file's content, but not its name", () => {
    expect(findProblems([file("package-lock.json", address)])).toEqual([]);
  });

  // A file with NUL bytes in it is not skipped: a file that was not looked at must not read as a
  // pass. UTF-16 with no byte order mark has a NUL after every letter, and the text is still there.
  it("still looks in a file that has NUL bytes in it", () => {
    const unmarkedUtf16 = Buffer.from(`one\ncontact ${address}\n`, "utf16le").toString("utf8");
    expect(findProblems([file("notes.md", unmarkedUtf16)])).toEqual([
      { path: "notes.md", line: 2, rule: "email" },
    ]);
    expect(findProblems([file("logo.bin", `\0${address}\0`)])).toEqual([
      { path: "logo.bin", line: 1, rule: "email" },
    ]);
    expect(findProblems([file("logo.bin", "\0\u0001\u0002 binary \0 and nothing else")])).toEqual(
      [],
    );
  });

  it("counts lines the same way with Windows line endings", () => {
    const found = findProblems([file("notes.md", `one\r\ntwo\r\n${address}\r\n`)]);
    expect(found).toEqual([{ path: "notes.md", line: 3, rule: "email" }]);
  });
});

describe("the report", () => {
  const address = at("alice", "real-domain.com");
  const winPath = backslash("C:", "Users", "alice");

  it("lists problems by file, then line, then rule", () => {
    const found = findProblems([
      file("b.md", `${address}\n${winPath}`),
      file("a.md", `ok\n${winPath} ${address}`),
    ]);
    expect(found.map((p) => `${p.path}:${p.line}:${p.rule}`)).toEqual([
      "a.md:2:email",
      "a.md:2:user-path",
      "b.md:1:email",
      "b.md:2:user-path",
    ]);
  });

  it("names the file, the line and the rule, and quotes nothing", () => {
    const found = findProblems([file("notes.md", `fine\n${address}`), file(".env", "x")]);
    const lines = found.map(formatProblem);
    expect(lines).toEqual([
      ".env  a file that must not be published",
      "notes.md:2  an email address",
    ]);
    expect(JSON.stringify(found) + lines.join("\n")).not.toContain("alice");
  });

  it("has a sentence for every rule it can report", () => {
    expect(Object.keys(RULE_TEXT).sort()).toEqual(
      ["account-details", "email", "private-term", "secret", "sensitive-file", "user-path"].sort(),
    );
  });
});

// The runner against real git repositories, made in scratch folders. Nothing here touches this
// project's own files or history.
describe("main, in a git repository", () => {
  let dir: string;
  let out: MockInstance<typeof console.log>;
  let err: MockInstance<typeof console.error>;

  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, stdio: "ignore", env: cleanEnv() });
  const put = (name: string, content: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  };
  const printed = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map((call) => call.join(" ")).join("\n");

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "public-check-"));
    git("init", "-q");
    // As in the project: the file of private terms is ignored.
    put(".gitignore", `${LOCAL_TERMS_FILE}\npgdata/\nignored.md\n`);
    out = vi.spyOn(console, "log").mockImplementation(() => {});
    err = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes a clean repository, and says that only the generic rules ran", () => {
    put("README.md", "Nothing private here.");
    expect(main(dir)).toBe(0);
    expect(printed(out)).toContain("public-check: ok");
    expect(printed(err)).toContain(`no ${LOCAL_TERMS_FILE}`);
  });

  it("fails on a leak in a file that is new, and on one that is tracked, and shows neither", () => {
    const address = at("alice", "real-domain.com");
    put("tracked.md", `line one\n${address}`);
    git("add", "tracked.md");
    put("new/notes.md", `${backslash("C:", "Users", "alice")}`);
    put(".env", "KEY=value");
    expect(main(dir)).toBe(1);
    const report = printed(err);
    expect(report).toContain("tracked.md:2  an email address");
    expect(report).toContain("new/notes.md:1  a path into a user folder");
    expect(report).toContain(".env  a file that must not be published");
    expect(report).not.toContain("alice");
    expect(report).not.toContain("KEY=value");
  });

  it("does not look at files that git ignores", () => {
    put("ignored.md", at("alice", "real-domain.com"));
    put("pgdata/PG_VERSION", "17");
    expect(main(dir)).toBe(0);
  });

  it("reads the private terms from the ignored file, and does not report that file itself", () => {
    put(LOCAL_TERMS_FILE, "# mine\nzebra quokka\n");
    put("notes.md", "met the Zebra Quokka at the park");
    expect(main(dir)).toBe(1);
    const report = printed(err);
    expect(report).toContain(`notes.md:1  a term from ${LOCAL_TERMS_FILE}`);
    expect(report).not.toMatch(/quokka/i);
    expect(report).not.toContain(`${LOCAL_TERMS_FILE}:`);
    // The same file with the term taken out is clean, and the count says one term was read.
    put("notes.md", "nothing to see");
    expect(main(dir)).toBe(0);
    expect(printed(out)).toContain("1 private terms");
  });

  // PowerShell 5.1 saves `echo text > file` as UTF-16. The terms must still be read.
  it("reads a file of private terms that was saved as UTF-16", () => {
    put(
      LOCAL_TERMS_FILE,
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("zebra quokka\r\n", "utf16le")]),
    );
    put("notes.md", "met the zebra quokka");
    expect(main(dir)).toBe(1);
    expect(printed(err)).toContain(`notes.md:1  a term from ${LOCAL_TERMS_FILE}`);
  });

  it("refuses to pass when the file of private terms cannot be read as text", () => {
    put(LOCAL_TERMS_FILE, Buffer.from("z\0e\0b\0r\0a\0"));
    expect(main(dir)).toBe(2);
    expect(printed(err)).toContain("UTF-8 or as UTF-16");
  });

  it("finds a leak in a file that was saved as UTF-16", () => {
    const body = `contact ${at("alice", "real-domain.com")}`;
    put("notes.md", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, "utf16le")]));
    expect(main(dir)).toBe(1);
    expect(printed(err)).toContain("notes.md:1  an email address");
  });

  it("refuses to pass when the file of private terms has a regular expression that does not parse", () => {
    put(LOCAL_TERMS_FILE, "re:(oops\n");
    expect(main(dir)).toBe(2);
    expect(printed(err)).toContain("line 1");
  });

  it("does not fail on a file that is tracked and then deleted", () => {
    put("gone.md", "text");
    git("add", "gone.md");
    fs.rmSync(path.join(dir, "gone.md"));
    expect(main(dir)).toBe(0);
  });

  // A file that was not read was not checked. Only a file that is gone, or is not a file, is left
  // out. Any other reason, such as one that is locked or has no permission, must not read as a pass.
  it("refuses to pass when a file cannot be read, and names it", () => {
    put("locked.md", "text");
    const real = fs.readFileSync.bind(fs);
    vi.spyOn(fs, "readFileSync").mockImplementation(((target: fs.PathOrFileDescriptor) => {
      if (String(target).endsWith("locked.md")) {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      }
      return real(target as string);
    }) as typeof fs.readFileSync);
    expect(main(dir)).toBe(2);
    expect(printed(err)).toContain("locked.md could not be read");
  });

  it("checks the whole repository, and reads its terms, when started in a folder of it", () => {
    put(LOCAL_TERMS_FILE, "zebra quokka\n");
    put("top.md", at("alice", "real-domain.com"));
    put("sub/deep/notes.md", "met the zebra quokka");
    expect(main(path.join(dir, "sub", "deep"))).toBe(1);
    const report = printed(err);
    expect(report).toContain("top.md:1  an email address");
    expect(report).toContain(`sub/deep/notes.md:1  a term from ${LOCAL_TERMS_FILE}`);
  });

  // Inside a git hook, git sets variables that point at one repository. They must not send the
  // check, or a test, to that repository instead of the folder it was given.
  it("ignores the variables that point git at another repository", () => {
    put("README.md", "Nothing private here.");
    vi.stubEnv("GIT_DIR", path.join(os.tmpdir(), "no-such-repository"));
    vi.stubEnv("GIT_INDEX_FILE", path.join(os.tmpdir(), "no-such-index"));
    expect(main(dir)).toBe(0);
  });

  it("refuses to pass when it cannot list the files, which is not a clean run", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "public-check-no-git-"));
    // Git must not find a repository above the scratch folder, wherever the temp folder is.
    vi.stubEnv("GIT_CEILING_DIRECTORIES", os.tmpdir());
    try {
      expect(main(outside)).toBe(2);
      expect(printed(err)).toContain("nothing was checked");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

// The script run as the command, which is what `npm run verify` and CI do. The tests above call
// main() directly, and would all pass if the command did nothing at all.
describe("the command", () => {
  const script = fileURLToPath(new URL("./check-public.mjs", import.meta.url));
  let dir: string;

  const put = (name: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  };
  const run = (cwd: string, entry = script) =>
    spawnSync(process.execPath, [entry], { cwd, encoding: "utf8", env: cleanEnv() });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "public-check-cli-"));
    execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore", env: cleanEnv() });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("exits 0 and says ok on a clean repository", () => {
    put("README.md", "Nothing private here.");
    const result = run(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("public-check: ok");
  });

  it("exits 1, names the problem, and shows nothing of it, when there is a leak", () => {
    put("notes.md", `fine\n${at("alice", "real-domain.com")}`);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("notes.md:2  an email address");
    expect(result.stderr + result.stdout).not.toContain("alice");
  });

  it("checks the whole repository when started in a folder of it", () => {
    put("top.md", at("alice", "real-domain.com"));
    put("sub/notes.md", "clean");
    const result = run(path.join(dir, "sub"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("top.md:1  an email address");
  });

  // Node resolves a link before it sets import.meta.url, and leaves process.argv[1] as typed. A
  // script that compared the two as they are would do nothing through a link, and exit 0.
  it("still runs when it is started through a link to its folder", () => {
    put("notes.md", at("alice", "real-domain.com"));
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "public-check-link-"));
    const real = path.join(scratch, "real");
    const link = path.join(scratch, "link");
    try {
      fs.mkdirSync(real);
      // A copy of the script, so removing the link below can never touch this project's own files.
      fs.copyFileSync(script, path.join(real, "check-public.mjs"));
      fs.symlinkSync(real, link, "junction");
      const result = run(dir, path.join(link, "check-public.mjs"));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("notes.md:1  an email address");
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("exits 2 outside a git repository, where nothing could be checked", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "public-check-cli-no-git-"));
    try {
      const result = spawnSync(process.execPath, [script], {
        cwd: outside,
        encoding: "utf8",
        env: { ...cleanEnv(), GIT_CEILING_DIRECTORIES: os.tmpdir() },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("nothing was checked");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
