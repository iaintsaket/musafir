// Optional local server. The page normally reads erail.in directly from the browser; this server
// is a fallback if that ever stops working, and it serves src/ so the ES-module source runs unbundled.
//   node server/server.mjs           then open http://localhost:8787 (bundle) or /dev/ (source)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { erailUrl, parseErail, isStationCode } from "../src/js/live/erail.js";

const PORT = Number(process.env.PORT) || 8787;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const TTL = 6 * 60 * 60 * 1000; // keep erail answers for 6 hours
const MAX_CACHE_ENTRIES = 500;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/** url -> { t, trains: Promise }. Caching the promise means concurrent requests share one fetch. */
const cache = new Map();

function between(from, to) {
  const url = erailUrl(from, to);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL) return hit.trains;
  const trains = fetchTrains(url);
  trains.catch(() => cache.delete(url)); // don't cache failures
  cache.set(url, { t: Date.now(), trains });
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value); // drop the oldest
  return trains;
}

async function fetchTrains(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (musafir local)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`erail.in answered HTTP ${res.status}`);
  return parseErail(await res.text());
}

const send = (res, code, type, body) => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
};

/** Serve a file from src/ for /dev/..., refusing anything outside it. */
async function serveSource(res, path) {
  const rel = normalize(path.replace(/^\/dev\/?/, "") || "index.html");
  const file = join(SRC, rel);
  const inside = relative(SRC, file);
  if (inside.startsWith("..") || isAbsolute(inside)) return send(res, 403, "text/plain", "Forbidden");
  const type = TYPES[extname(file)];
  if (!type) return send(res, 404, "text/plain", "Not found");
  return send(res, 200, type, await readFile(file));
}

createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (u.pathname === "/" || u.pathname === "/index.html") {
      return send(res, 200, TYPES[".html"], await readFile(join(ROOT, "dist", "musafir.html")));
    }
    if (u.pathname === "/dev" || u.pathname.startsWith("/dev/")) return await serveSource(res, u.pathname);
    if (u.pathname === "/api/health") return send(res, 200, "application/json", '{"ok":true}');
    if (u.pathname === "/api/between") {
      const from = (u.searchParams.get("from") || "").toUpperCase();
      const to = (u.searchParams.get("to") || "").toUpperCase();
      if (!isStationCode(from) || !isStationCode(to)) {
        return send(res, 400, "application/json", JSON.stringify({ error: "from and to must be station codes" }));
      }
      return send(res, 200, "application/json", JSON.stringify({ from, to, trains: await between(from, to) }));
    }
    send(res, 404, "text/plain", "Not found");
  } catch (e) {
    const missing = e.code === "ENOENT";
    send(
      res,
      missing ? 404 : 502,
      "application/json",
      JSON.stringify({ error: missing ? "Not found. Run npm run build first." : String(e.message || e) }),
    );
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Musafir running at http://localhost:${PORT}  (source: /dev/)`));
