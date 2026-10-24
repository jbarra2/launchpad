// Fails when a file that is about to be published holds something that should stay private. The
// repository is public, so an email address, a path into someone's user folder, a key, the name of
// a Claude plan, a school address, or a database file would be public too, and in the history for
// good.
//
// It reads every tracked file and every new file that is not ignored, so a leak is caught before
// `git add`, from any folder of the repository. The rules below are generic, which makes this file
// safe to publish. Your own name, emails and other personal terms go in `.public-check.local`, one
// per line, which is not tracked.
//
// It never prints what it found, only the file, the line and the rule. The log of a public
// repository's CI run is public, and a failure must not repeat the leak it is about.
//
// A made-up example can be waived for one rule on its own line, with a comment that names the rule:
// the marker, then the rule's name, as in the tests. Never for a real value. A private term cannot
// be waived at all.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_MARKER = "public-check: allow";
export const LOCAL_TERMS_FILE = ".public-check.local";

// Generated, and long strings of letters and digits in it are not what this looks for.
const SKIPPED_CONTENT = new Set(["package-lock.json"]);

// A term shorter than this would match half the repository.
const MIN_TERM_LENGTH = 3;

/** What each rule means, in words a person can act on. Nothing in here quotes a match. */
export const RULE_TEXT = {
  email: "an email address",
  "user-path": "a path into a user folder",
  secret: "something shaped like a key or a token",
  "account-details": "a Claude plan name or a school address",
  "sensitive-file": "a file that must not be published",
  "private-term": `a term from ${LOCAL_TERMS_FILE}`,
};

// The reserved example domains (RFC 2606 and 6761) cannot belong to anyone, so a made-up address
// at one of them is fine.
/** @param {string} domain */
function isReservedDomain(domain) {
  const name = domain.toLowerCase();
  return (
    /\.(?:example|test|invalid|localhost)$/.test(name) ||
    /(?:^|\.)example\.(?:com|org|net)$/.test(name)
  );
}

// A real top-level domain comes after the @, so a version such as eslint@9.39.5 is not an address.
// The lookbehind makes a match start only at the start of a run of address characters. Without it
// the engine would try every position of a very long line, and the time would grow with its square.
const EMAIL =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

// A folder named after a person. Windows spells its folders in any case, so the Windows user
// folder, and the same folder as Git Bash, Cygwin and WSL write it, ignore case.
const WINDOWS_USER_PATH = /[A-Za-z]:[\\/]+Users[\\/]|\/mnt\/[a-z]\/Users\//i;

// /Users or /home as a path of its own and not the middle of a web address, and the Windows folder
// where programs keep a user's data. These are case-sensitive, so a route such as /users/me and a
// variable named appData are not paths into a user folder.
const UNIX_USER_PATH =
  /(?<![\w.:-])\/(?:(?:cygdrive\/)?[a-z]\/Users|Users|home)\/[A-Za-z0-9._-]|\bAppData\b/;

// The shapes of a private key header and of the tokens of a few common services, a JSON web token,
// and a value given to one of this app's own secrets. GitHub's own push protection knows more, and
// this is a second look. A name with nothing after the = sign, as in .env.example, is not a value.
const SECRET =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|\b[sr]k_live_[A-Za-z0-9]{24,}|\bnpm_[A-Za-z0-9]{36}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bAKIA[0-9A-Z]{16}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\b(?:CREDENTIAL_KEY|BETTER_AUTH_SECRET)\s*[=:]\s*["']?[A-Za-z0-9+/=_-]{16,}/;

// The name of a Claude plan, and a school address. This app is about accounts and plans, so those
// words on their own are not flagged. `[.]edu` is written in brackets so that this file does not
// hold the very text its rule looks for, and it does not match inside a word such as "education".
const ACCOUNT_DETAILS = /\bclaude\s+(?:pro|max|team)\b|[.]edu\b/i;

/**
 * The rules for one line of text. A line that breaks several is reported once for each.
 *
 * @type {{ id: string, matches: (line: string) => boolean }[]}
 */
const LINE_RULES = [
  {
    id: "email",
    matches: (line) => [...line.matchAll(EMAIL)].some((match) => !isReservedDomain(match[1] ?? "")),
  },
  {
    id: "user-path",
    matches: (line) => WINDOWS_USER_PATH.test(line) || UNIX_USER_PATH.test(line),
  },
  { id: "secret", matches: (line) => SECRET.test(line) },
  { id: "account-details", matches: (line) => ACCOUNT_DETAILS.test(line) },
];

// The marker, then the names of the rules to waive on this line, separated by commas. A marker with
// no rule after it waives nothing, so the documentation that quotes the marker is still checked.
const WAIVER = new RegExp(`${ALLOW_MARKER} ([a-z-]+(?:, ?[a-z-]+)*)`);

/**
 * The rules that a line waives for itself.
 *
 * @param {string} line
 */
function waivedRules(line) {
  const match = WAIVER.exec(line);
  return new Set(match?.[1]?.split(/, ?/) ?? []);
}

/**
 * Whether a file of this name should never be published, whatever is in it.
 *
 * @param {string} file
 */
export function isSensitiveName(file) {
  // Windows and macOS keep file names in any case, so .ENV is the same file as .env.
  const name = file.toLowerCase();
  const base = name.split("/").at(-1) ?? name;
  // The file of private terms, and the copies an editor or Windows makes of it: .txt, .bak, a ~.
  if (base.startsWith(LOCAL_TERMS_FILE)) return true;
  if (base === ".env.example") return false;
  if (/^\.env(?:$|\.)/.test(base)) return true;
  if (/\.(?:sqlite[0-9a-z-]*|db|dump|pem|key|p12|pfx)$/.test(base)) return true;
  // The local database lives in pgdata/, and the folder is ignored. Nothing in it should be tracked.
  return name.startsWith("pgdata/") || name.includes("/pgdata/");
}

/**
 * The text of a file. Windows tools such as PowerShell 5.1 save UTF-16 with a byte order mark, and
 * read as UTF-8 that is a letter, a NUL, a letter, so nothing in it would ever match. A UTF-8 byte
 * order mark is dropped.
 *
 * @param {Buffer} buffer
 */
export function decodeText(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  const text = buffer.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Reads the private terms: one per line, case-insensitive. A line that starts with `re:` is a
 * regular expression. Blank lines and lines that start with # are skipped, and so is a term that is
 * too short to mean anything. A regular expression that does not parse throws, so a typo is not
 * mistaken for a clean run.
 *
 * A term is given the line and the same line in lower case, which is worked out once per line and
 * not once per term.
 *
 * @param {string} text
 * @returns {{ terms: PrivateTerm[], tooShort: number }}
 */
export function parseTerms(text) {
  /** @type {PrivateTerm[]} */
  const terms = [];
  let tooShort = 0;
  text.split(/\r?\n/).forEach((raw, index) => {
    const entry = raw.trim();
    if (entry === "" || entry.startsWith("#")) return;
    if (entry.startsWith("re:")) {
      let pattern;
      try {
        pattern = new RegExp(entry.slice(3), "i");
      } catch {
        throw new Error(`${LOCAL_TERMS_FILE} line ${index + 1} is not a regular expression.`);
      }
      terms.push((line) => pattern.test(line));
      return;
    }
    if (entry.length < MIN_TERM_LENGTH) {
      tooShort += 1;
      return;
    }
    const needle = entry.toLowerCase();
    terms.push((_line, lower) => lower.includes(needle));
  });
  return { terms, tooShort };
}

/**
 * @typedef {{ path: string, text: string }} SourceFile
 * @typedef {{ path: string, line: number, rule: string }} Problem
 * @typedef {(line: string, lower: string) => boolean} PrivateTerm
 */

/**
 * Every problem in the files, by path, then line. A line is `0` for a problem with the file itself.
 *
 * @param {SourceFile[]} files
 * @param {PrivateTerm[]} [privateTerms]
 * @returns {Problem[]}
 */
export function findProblems(files, privateTerms = []) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path: file, text } of files) {
    if (isSensitiveName(file)) {
      problems.push({ path: file, line: 0, rule: "sensitive-file" });
      continue;
    }
    if (SKIPPED_CONTENT.has(file)) continue;
    // A NUL byte is a binary file, or text in an encoding that spends a byte on every other
    // character, such as UTF-16 with no byte order mark. Dropping the NULs leaves the readable text,
    // so that neither kind passes unchecked.
    const content = text.includes("\0") ? text.replaceAll("\0", "") : text;
    content.split(/\r?\n/).forEach((line, index) => {
      const waived = waivedRules(line);
      for (const rule of LINE_RULES) {
        if (!waived.has(rule.id) && rule.matches(line)) {
          problems.push({ path: file, line: index + 1, rule: rule.id });
        }
      }
      // A private term is never waived: it is the one rule that is about this person.
      const lower = privateTerms.length > 0 ? line.toLowerCase() : "";
      if (privateTerms.some((matches) => matches(line, lower))) {
        problems.push({ path: file, line: index + 1, rule: "private-term" });
      }
    });
  }
  return problems.sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule),
  );
}

/**
 * One line of the report. It names the file, the line and the rule, and quotes nothing.
 *
 * @param {Problem} problem
 */
export function formatProblem(problem) {
  const place = problem.line > 0 ? `${problem.path}:${problem.line}` : problem.path;
  return `${place}  ${RULE_TEXT[/** @type {keyof typeof RULE_TEXT} */ (problem.rule)]}`;
}

/**
 * The environment for git, without the variables that point it at one repository. They are set
 * inside a git hook, and they would send this at the repository the hook is for, not at the folder
 * it was given.
 */
export function gitEnv() {
  const env = { ...process.env };
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"]) delete env[name];
  return env;
}

/**
 * Runs git in a folder and returns what it prints. Git's own error text is not shown.
 *
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: gitEnv(),
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * The files to look at: tracked ones, and new ones that are not ignored, from the top of the
 * repository whatever folder this was started in. A file that is listed and gone, or is a folder,
 * is left out. A link to a file is read through. A file that cannot be read for any other reason is
 * an error, because a file that was not checked must not look like one that passed.
 *
 * @param {string} cwd
 * @returns {{ root: string, files: SourceFile[] }}
 */
function readFiles(cwd) {
  let root;
  let listed;
  try {
    root = git(cwd, ["rev-parse", "--show-toplevel"]).trim();
    listed = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  } catch {
    throw new Error("git could not list the files, so nothing was checked.");
  }
  /** @type {SourceFile[]} */
  const files = [];
  for (const name of new Set(listed.split("\0").filter(Boolean))) {
    try {
      files.push({ path: name, text: decodeText(fs.readFileSync(path.join(root, name))) });
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code;
      if (code === "ENOENT" || code === "EISDIR") continue;
      throw new Error(`${name} could not be read, so it was not checked.`);
    }
  }
  return { root, files };
}

/**
 * Runs the check in a folder of a git checkout. Returns the exit code: 0 when clean, 1 when there
 * are problems, and 2 when it could not run, because a check that cannot run is not a pass.
 *
 * @param {string} [cwd]
 */
export function main(cwd = process.cwd()) {
  let loaded;
  try {
    loaded = readFiles(cwd);
  } catch (error) {
    console.error(`public-check: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const { root, files } = loaded;

  /** @type {PrivateTerm[]} */
  let terms = [];
  const localFile = path.join(root, LOCAL_TERMS_FILE);
  if (fs.existsSync(localFile)) {
    try {
      const text = decodeText(fs.readFileSync(localFile));
      if (text.includes("\0")) {
        throw new Error(
          `${LOCAL_TERMS_FILE} is not saved as UTF-8 or as UTF-16 with a byte order mark.`,
        );
      }
      const parsed = parseTerms(text);
      terms = parsed.terms;
      if (parsed.tooShort > 0) {
        console.error(
          `public-check: ${parsed.tooShort} term(s) in ${LOCAL_TERMS_FILE} are under ${MIN_TERM_LENGTH} characters and were ignored.`,
        );
      }
    } catch (error) {
      console.error(`public-check: ${error instanceof Error ? error.message : String(error)}`);
      return 2;
    }
  } else {
    // Normal in CI, and on a fresh clone. The generic rules still ran.
    console.error(
      `public-check: no ${LOCAL_TERMS_FILE}, so only the generic rules ran. Put your own name, emails and other personal terms in it, one per line.`,
    );
  }

  const problems = findProblems(files, terms);
  if (problems.length === 0) {
    console.log(`public-check: ok, ${files.length} files, ${terms.length} private terms.`);
    return 0;
  }
  console.error(`public-check: ${problems.length} problem(s). The text itself is not shown.`);
  for (const problem of problems) console.error(`  ${formatProblem(problem)}`);
  return 1;
}

// Whether this file was started as the command, and not imported. Node gives import.meta.url with
// links resolved, and process.argv[1] as it was typed, so the two are compared after resolving
// both. Compared as they are, a repository reached through a link would never run, and exit 0.
function isEntryPoint() {
  const started = process.argv[1];
  if (!started) return false;
  try {
    return (
      fs.realpathSync.native(started) === fs.realpathSync.native(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isEntryPoint()) process.exitCode = main();
