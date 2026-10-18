// Bundle src/ into one self-contained HTML file: dist/musafir.html.
//
// Browsers refuse to load ES modules from file://, so the build inlines the stylesheet and joins the
// modules (dependencies first) into a single script inside one IIFE. There is no bundler dependency:
// the modules follow a deliberately small subset of module syntax, which this script enforces:
//   - only named imports:  import { a, b } from "./x.js";
//   - only exports on declarations:  export const / let / function / async function / class
//   - every top-level name is unique across all modules (they end up sharing one scope)
// Anything outside that subset fails the build with a clear message rather than producing a broken page.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "dist", "musafir.html");

const IMPORT_RE = /^import\s+\{[^}]*\}\s+from\s+["']([^"']+)["'];?[ \t]*\n?/gm;
const EXPORT_RE = /^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm;
const TOP_LEVEL_NAME_RE = /^(?:export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const UNSUPPORTED = [
  [/^export\s+default\b/m, "export default"],
  [/^export\s*\{/m, "export { ... } lists"],
  [/^export\s*\*/m, "export * re-exports"],
  [/^import\s+\*/m, "import * as namespace"],
  [/^import\s+["']/m, 'side-effect imports (import "./x.js")'],
  [/^import\s+[A-Za-z_$]/m, "default imports"],
];

const rel = (file) => file.slice(ROOT.length + 1);

/** Throw if a module uses syntax the bundler doesn't support. */
export function checkModuleSyntax(code, name = "module") {
  for (const [re, what] of UNSUPPORTED) {
    if (re.test(code)) throw new Error(`${name}: ${what} are not supported by scripts/build.mjs`);
  }
}

/** Return module files in dependency order, starting from `entry`. */
export function moduleOrder(entry) {
  const order = [];
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(file, "utf8");
    checkModuleSyntax(code, rel(file));
    for (const [, spec] of code.matchAll(IMPORT_RE)) visit(resolve(dirname(file), spec));
    order.push(file);
  };
  visit(entry);
  return order;
}

/** Strip import lines and export keywords so modules can share one script scope. */
export function stripModuleSyntax(code) {
  return code.replace(IMPORT_RE, "").replace(EXPORT_RE, "");
}

/** Throw if two modules declare the same top-level name (one would silently shadow the other). */
export function checkUniqueTopLevelNames(modules) {
  const owner = new Map();
  for (const { name, code } of modules) {
    for (const [, id] of code.matchAll(TOP_LEVEL_NAME_RE)) {
      if (owner.has(id) && owner.get(id) !== name) {
        throw new Error(`Top-level name "${id}" is declared in both ${owner.get(id)} and ${name}`);
      }
      owner.set(id, name);
    }
  }
}

/** Replace the tag matched by `re` with `content`, failing loudly if the tag isn't there. */
function inline(html, re, content) {
  if (!re.test(html)) throw new Error(`src/index.html: expected a tag matching ${re}`);
  return html.replace(re, () => content);
}

export function bundle() {
  const modules = moduleOrder(join(SRC, "js", "app.js")).map((file) => ({
    name: rel(file),
    code: readFileSync(file, "utf8"),
  }));
  checkUniqueTopLevelNames(modules);
  const parts = modules.map(({ name, code }) => {
    const body = stripModuleSyntax(code);
    if (/^\s*(import|export)\b/m.test(body)) throw new Error(`${name}: module syntax left after bundling`);
    return `// ---- ${name} ----\n${body}`;
  });
  const script = `(() => {\n"use strict";\n${parts.join("\n")}\n})();`;
  if (/<\/script/i.test(script)) throw new Error("bundle contains </script>, which would break the page");

  const css = readFileSync(join(SRC, "styles.css"), "utf8");
  let html = readFileSync(join(SRC, "index.html"), "utf8");
  html = inline(html, /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?>/, `<style>\n${css}</style>`);
  html = inline(html, /<script\s+type="module"\s+src="js\/app\.js"\s*><\/script>/, `<script>\n${script}\n</script>`);
  return html;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = bundle();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, html);
  console.log(`Wrote ${rel(OUT)} (${Math.round(html.length / 1024)} KB)`);
}
