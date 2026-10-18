import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle, moduleOrder, stripModuleSyntax } from "../scripts/build.mjs";
import { toStationRows } from "../scripts/build-stations.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// ---------- build ----------

test("stripModuleSyntax removes imports (including multi-line) and export keywords", () => {
  const src = `import { a } from "./a.js";\nimport {\n  b,\n  c,\n} from "./b.js";\nexport const x = 1;\nexport async function y() {}\nexport function z() {}\nconst keep = "import { q } from 'x'";\n`;
  const out = stripModuleSyntax(src);
  assert.doesNotMatch(out, /^import /m);
  assert.doesNotMatch(out, /^export /m);
  assert.match(out, /^const x = 1;$/m);
  assert.match(out, /^async function y\(\) \{\}$/m);
  assert.match(out, /keep = "import/, "strings are untouched");
});

test("moduleOrder puts dependencies before the modules that use them", () => {
  const order = moduleOrder(`${ROOT}src/js/app.js`).map((f) => f.slice(ROOT.length));
  assert.equal(order.at(-1), "src/js/app.js");
  assert.ok(order.indexOf("src/js/data/trains.js") < order.indexOf("src/js/core/network.js"));
  assert.ok(order.indexOf("src/js/core/network.js") < order.indexOf("src/js/core/planner.js"));
  assert.equal(new Set(order).size, order.length, "each module once");
});

test("bundle produces one self-contained page that parses", () => {
  const html = bundle();
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<link rel="stylesheet" href="styles\.css">/);
  assert.doesNotMatch(html, /<script type="module"/);
  const script = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];
  assert.doesNotMatch(script, /^\s*(import|export) /m);
  assert.match(script, /ALL_STATIONS/);
  assert.doesNotThrow(() => new Function(script), "bundled script is valid JavaScript");
});

// ---------- station list generator ----------

test("toStationRows keeps valid Indian stations once and tidies names", () => {
  const point = (lon, lat) => ({ type: "Point", coordinates: [lon, lat] });
  const rows = toStationRows({
    features: [
      { geometry: point(86.09, 25.17), properties: { code: "lkr", name: "LUCKEESARAI JN", state: "Bihar" } },
      { geometry: point(86.09, 25.17), properties: { code: "LKR", name: "Duplicate" } },
      { geometry: null, properties: { code: "NOGEO", name: "No location" } },
      { geometry: point(0, 0), properties: { code: "FAR", name: "Outside India" } },
      { geometry: point(80, 20), properties: { code: "XX-ABC", name: "Placeholder" } },
      { geometry: point(80.123456, 20.987654), properties: { code: "OK", name: "Mixed Case" } },
    ],
  });
  assert.deepEqual(rows, [
    ["LKR", "Luckeesarai Jn", 25.17, 86.09, "Bihar"],
    ["OK", "Mixed Case", 20.988, 80.123, ""],
  ]);
});

// ---------- local server ----------

test("server validates input and refuses paths outside src/", async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["server/server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
  });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on("data", (d) => String(d).includes("running") && resolve());
      child.on("exit", (code) => reject(new Error(`server exited with ${code}`)));
      setTimeout(() => reject(new Error("server did not start")), 5000);
    });
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    const bad = await fetch(`${base}/api/between?from=../x&to=HWH`);
    assert.equal(bad.status, 400);
    const traversal = await fetch(`${base}/dev/..%2F..%2Fpackage.json`);
    assert.ok([403, 404].includes(traversal.status), `got ${traversal.status}`);
    const source = await fetch(`${base}/dev/js/lib/time.js`);
    assert.equal(source.status, 200);
  } finally {
    child.kill();
  }
});
