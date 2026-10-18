// End-to-end check of the built page in headless Chrome, driven over the DevTools protocol (no dependencies).
// Usage: npm run build && npm run test:e2e        (needs Google Chrome; set CHROME_PATH to override)
// Uses live erail.in data when reachable, so counts vary; the checks only assert behaviour.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PAGE = pathToFileURL(join(ROOT, "dist", "musafir.html")).href;
const CHROME =
  process.env.CHROME_PATH ||
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(
    existsSync,
  );
const PORT = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!CHROME) {
  console.log("Skipping: Chrome not found (set CHROME_PATH).");
  process.exit(0);
}
if (!existsSync(fileURLToPath(PAGE))) throw new Error("dist/musafir.html is missing. Run npm run build first.");

const profile = mkdtempSync(join(tmpdir(), "musafir-e2e-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "about:blank"],
  {
    stdio: "ignore",
  },
);

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = pages.find((t) => t.type === "page");
      if (page) return new WebSocket(page.webSocketDebuggerUrl);
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

const errors = [];
let ws;
try {
  ws = await connect();
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) pending.get(m.id)(m), pending.delete(m.id);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expr) =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
  const text = (elId) => ev(`document.getElementById(${JSON.stringify(elId)}).innerText`);
  const type = async (field, value) => {
    await ev(`(() => { const i = document.getElementById(${JSON.stringify(field)}); i.focus(); i.select(); })()`);
    await send("Input.insertText", { text: value });
    await sleep(300);
  };
  const press = (key, code, keyCode) =>
    send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode });
  const waitIdle = async () => {
    for (let i = 0; i < 100 && (await ev(`document.getElementById("go").disabled`)); i++) await sleep(200);
    await sleep(500);
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: PAGE });
  await sleep(2000);
  await waitIdle();

  console.log("live status:", await text("live"));
  assert.match(await text("summary"), /routes? from Dumka/, "default search runs on load");
  assert.equal(await ev(`document.querySelectorAll("#trainList tr").length`), 32, "built-in train table");

  await type("from", "luckeesarai");
  assert.match(
    await ev(`document.querySelector("#from-list li")?.innerText`),
    /Luckeesarai Jn/,
    "fuzzy station search",
  );
  await type("from", "hwh");
  await press("Enter", "Enter", 13);
  await type("to", "kiul");
  await press("Enter", "Enter", 13);
  await ev(`for (const [k, v] of [["earliest", "2027-02-24T00:00"], ["deadline", "2027-02-24T23:59"]]) {
    const e = document.getElementById(k); e.value = v; e.dispatchEvent(new Event("change")); }`);
  assert.match(await text("pending"), /Settings changed/, "edits wait for Search");
  assert.match(await text("summary"), /Dumka/, "results unchanged before Search");

  await ev(`document.getElementById("go").click()`);
  await sleep(500);
  await waitIdle();
  assert.match(await text("summary"), /from Howrah Jn \(HWH\) reach Kiul Jn/, "search uses the new stations");
  assert.ok((await ev(`document.querySelectorAll(".ticket").length`)) > 0, "route cards drawn");

  await ev(`document.getElementById("chg-0").click()`);
  assert.ok(
    await ev(`[...document.querySelectorAll(".ticket")].every((t) => t.innerText.includes("Direct"))`),
    "direct filter",
  );

  await sleep(1500);
  assert.match(await text("suggest"), /Suggestions/, "suggestions box shown");
  assert.deepEqual(errors, [], "no script errors");
  console.log("e2e: all checks passed");
} finally {
  ws?.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
