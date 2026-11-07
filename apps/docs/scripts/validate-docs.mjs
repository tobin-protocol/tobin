// Content validation for apps/docs. Runs offline, needs only Node and git.
//
// Checks, for every .mdx page under content/docs:
//   - frontmatter has a non-empty title and description;
//   - meta.json files parse, every entry resolves, and every page is listed in its folder's meta.json;
//   - internal links to /docs/... resolve to a page, and #anchors resolve to a heading of that page;
//   - links to https://github.com/tobin-protocol/tobin/{blob,tree}/main/<path> name a TRACKED file or directory;
//   - local images exist under public/;
//   - code fences carry a language;
//   - no secret-looking strings, full Stellar contract ids, or local machine paths.
// Malformed MDX is caught by `next build`, which compiles every page.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = join(appRoot, "content", "docs");
const publicRoot = join(appRoot, "public");
const GITHUB = "https://github.com/tobin-protocol/tobin/";

const problems = [];
const bad = (file, msg) => problems.push(`${relative(appRoot, file).split(sep).join("/")}: ${msg}`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(contentRoot);
const pages = files.filter((f) => f.endsWith(".mdx"));
const metas = files.filter((f) => f.endsWith("meta.json"));
const stray = files.filter((f) => !f.endsWith(".mdx") && !f.endsWith("meta.json"));
for (const f of stray) bad(f, "unexpected file type in content/docs (only .mdx and meta.json are allowed)");

// Tracked files of the whole repository, for GitHub links.
let tracked = new Set();
try {
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: appRoot, encoding: "utf8" }).trim();
  tracked = new Set(execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter(Boolean));
} catch {
  console.error("validate-docs: git is required to check repository links");
  process.exit(2);
}
const trackedDirs = new Set();
for (const t of tracked) {
  const parts = t.split("/");
  for (let i = 1; i < parts.length; i++) trackedDirs.add(parts.slice(0, i).join("/"));
}

// Route table: /docs/<slug> for every page; index.mdx maps to its folder.
const slugOf = (file) => {
  const rel = relative(contentRoot, file).split(sep).join("/").replace(/\.mdx$/, "");
  return rel === "index" ? "/docs" : "/docs/" + rel.replace(/\/index$/, "");
};
const routes = new Map();
const slugger = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

function stripCode(src) {
  return src.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, " "));
}

for (const f of pages) {
  const src = readFileSync(f, "utf8");
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  const body = fm ? src.slice(fm[0].length) : src;
  const anchors = new Set();
  for (const m of stripCode(body).matchAll(/^#{2,6}\s+(.+?)\s*$/gm)) anchors.add(slugger(m[1]));
  routes.set(slugOf(f), { file: f, anchors, src, body, fm: fm?.[1] ?? "" });
}

// Frontmatter.
for (const { file, fm } of routes.values()) {
  if (!fm) {
    bad(file, "missing frontmatter");
    continue;
  }
  for (const key of ["title", "description"]) {
    const m = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fm);
    if (!m || !m[1].trim() || m[1].trim() === "''" || m[1].trim() === '""') bad(file, `frontmatter needs a non-empty ${key}`);
  }
  const unknown = [...fm.matchAll(/^([A-Za-z_]+):/gm)].map((m) => m[1]).filter((k) => !["title", "description", "icon", "full"].includes(k));
  if (unknown.length) bad(file, `unknown frontmatter key(s): ${unknown.join(", ")}`);
}

// Navigation.
const listedByDir = new Map();
for (const mf of metas) {
  let data;
  try {
    data = JSON.parse(readFileSync(mf, "utf8"));
  } catch (e) {
    bad(mf, `invalid JSON: ${e.message}`);
    continue;
  }
  const dir = dirname(mf);
  if (typeof data.title !== "string" || !data.title) bad(mf, "meta.json needs a title");
  const listed = new Set();
  for (const entry of data.pages ?? []) {
    if (typeof entry !== "string") {
      bad(mf, "pages entries must be strings");
      continue;
    }
    if (/^---.*---$/.test(entry)) continue; // separator
    const name = entry.replace(/^\.\.\./, "");
    const asPage = join(dir, name + ".mdx");
    const asDir = join(dir, name);
    if (existsSync(asPage)) listed.add(name);
    else if (existsSync(asDir) && statSync(asDir).isDirectory()) {
      if (!existsSync(join(asDir, "meta.json")) && !readdirSync(asDir).some((n) => n.endsWith(".mdx"))) bad(mf, `"${entry}" is an empty folder`);
      listed.add(name);
    } else bad(mf, `pages entry "${entry}" does not match a page or folder`);
  }
  listedByDir.set(dir, listed);
}
for (const f of pages) {
  const dir = dirname(f);
  const name = f.slice(dir.length + 1).replace(/\.mdx$/, "");
  const listed = listedByDir.get(dir);
  if (!listed) {
    if (dir !== contentRoot) bad(f, "its folder has no meta.json");
    continue;
  }
  if (!listed.has(name)) bad(f, `not listed in ${relative(appRoot, join(dir, "meta.json")).split(sep).join("/")}`);
}
for (const d of readdirSync(contentRoot, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  if (!listedByDir.get(contentRoot)?.has(d.name)) bad(join(contentRoot, d.name), "section folder is not listed in the root meta.json");
}

// Links, images, fences, forbidden strings.
const SECRET = /\bS[A-Z2-7]{55}\b/;
const CONTRACT = /\bC[A-Z2-7]{55}\b/;
const LOCALPATH = /[A-Za-z]:\\Users\\|\/home\/[a-z]|\/Users\/[A-Za-z]/;
let linkCount = 0;
for (const { file, src, body } of routes.values()) {
  const text = stripCode(body);
  for (const m of text.matchAll(/(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    linkCount++;
    const href = m[1];
    if (href.startsWith(GITHUB)) {
      const rest = href.slice(GITHUB.length).split("#")[0];
      const mm = /^(blob|tree)\/main\/(.+?)\/?$/.exec(rest);
      if (!mm) {
        bad(file, `unrecognised repository link: ${href}`);
        continue;
      }
      const target = decodeURIComponent(mm[2]);
      const ok = mm[1] === "blob" ? tracked.has(target) : trackedDirs.has(target);
      if (!ok) bad(file, `repository link does not name a tracked ${mm[1] === "blob" ? "file" : "directory"}: ${target}`);
    } else if (/^https?:\/\//.test(href) || href.startsWith("mailto:")) {
      // External links are not fetched (offline check).
    } else if (href.startsWith("/docs")) {
      const [path, hash] = href.split("#");
      const route = routes.get(path.replace(/\/$/, "") || "/docs");
      if (!route) bad(file, `broken internal link: ${href}`);
      else if (hash && !route.anchors.has(hash)) bad(file, `broken anchor: ${href}`);
    } else if (href.startsWith("#")) {
      if (!routes.get(slugOf(file)).anchors.has(href.slice(1))) bad(file, `broken anchor: ${href}`);
    } else {
      bad(file, `use an absolute /docs/... path or a full repository URL, not: ${href}`);
    }
  }
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)|<img[^>]+src=["']([^"']+)["']/g)) {
    const src2 = m[1] ?? m[2];
    if (/^https?:\/\//.test(src2)) bad(file, `remote image is not allowed: ${src2}`);
    else if (!existsSync(join(publicRoot, src2.replace(/^\//, "")))) bad(file, `missing image: ${src2}`);
    if (m[0].startsWith("![") && /^!\[\s*\]/.test(m[0])) bad(file, `image has empty alt text: ${src2}`);
  }
  const lines = src.split(/\r?\n/);
  let inFence = false;
  lines.forEach((line, i) => {
    const f = /^\s*```(.*)$/.exec(line);
    if (f) {
      if (!inFence && !f[1].trim()) bad(file, `code fence without a language at line ${i + 1}`);
      inFence = !inFence;
    }
  });
  if (SECRET.test(src)) bad(file, "contains a string shaped like a Stellar secret key");
  if (CONTRACT.test(src)) bad(file, "contains a full Stellar contract or account id; link to the deployment manifest instead");
  if (LOCALPATH.test(src.replace(/\$env:TOBIN_BRIDGE_EXE = "C:\\path\\to\\tobin[^"]*"/g, ""))) bad(file, "contains a local machine path");
}

// Homepage and layout components must not link to unknown docs routes.
for (const f of [join(appRoot, "app", "(home)", "page.tsx"), join(appRoot, "lib", "layout.shared.tsx")]) {
  const t = readFileSync(f, "utf8");
  for (const m of t.matchAll(/["'`](\/docs[^"'`#?]*)["'`]/g)) {
    const path = m[1].replace(/\/$/, "") || "/docs";
    if (!routes.has(path)) bad(f, `links to a docs route that does not exist: ${m[1]}`);
  }
}

console.log(`validate-docs: ${pages.length} pages, ${metas.length} meta.json files, ${linkCount} markdown links checked`);
if (problems.length) {
  console.error(`validate-docs: ${problems.length} problem(s)`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("validate-docs: OK");
