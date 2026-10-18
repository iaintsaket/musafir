// Live train data: decide which station pairs to look up, fetch them from erail.in, and turn the answers
// into searchable train segments next to the built-in timetables.

import { DAY } from "../lib/time.js";
import { titleCase } from "../lib/text.js";
import { STATIONS, codesOf, distanceKm, roadKmFrom, setLiveSegments, ensureStation } from "../core/network.js";
import { erailUrl, parseErail } from "./erail.js";

/** Major junctions used as boarding points near the start/end and as places to change trains. */
export const HUBS = (
  "HWH SDAH KOAA SRC KGP ASN DHN GMO BKSC ADRA TATA RNC HTE ROU JSG SBP CTC BBS KUR BAM VSKP RJY BZA GDR MAS " +
  "PER KPD JTJ SBC SMVB YPR SC KZJ NGP BSP R JBP ET BPL PRYJ DDU GAYA PNBE DNR MKA KIUL JAJ JSME MDP BGP RPH " +
  "MLDT NJP KYQ GHY HJP MFP BJU SEE GKP BSB LKO CNB NDLS"
).split(" ");

const MAX_PAIRS = 48;
const PARALLEL_REQUESTS = 6;
const MAX_JUNCTIONS_ON_THE_WAY = 6;
/** A junction is "on the way" if going through it is at most this much longer than the straight line. */
const MAX_DETOUR = 1.35;
const DETECT_TIMEOUT_MS = 10_000;
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Live-data state shared with the UI.
 * mode: null while checking; "direct" when the browser can read erail.in; "server" via the local server;
 * "off" when erail.in can't be reached (offline, blocked by the page's host, or the site changed).
 * `pairs` caches answers by "FROM>TO", so repeat searches only fetch what's new.
 */
export const LIVE = { mode: null, key: "", busy: false, done: 0, total: 0, trains: 0, fail: 0, pairs: new Map() };

/** Probe pair used to detect live access; its answer is kept and reused like any other lookup. */
const PROBE = ["KIUL", "HWH"];
/**
 * erail's validity dates count from the train's origin, but a segment's days count from the boarding
 * station, which can be up to about three days later on long routes. Allow that much slack either side.
 */
const VALIDITY_SLACK_MS = 3 * DAY;

let notify = () => {};
/** Register a listener: called with false on progress and true when new data is ready. */
export function onLiveChange(fn) {
  notify = fn;
}

/** Work out whether live data is reachable, then notify. */
export async function detectLive() {
  try {
    const res = await fetch(erailUrl(...PROBE), { signal: AbortSignal.timeout(DETECT_TIMEOUT_MS) });
    const body = res.ok ? await res.text() : "";
    if (body.includes("^")) {
      LIVE.mode = "direct";
      LIVE.pairs.set(PROBE.join(">"), parseErail(body));
    }
  } catch {
    // Blocked or offline; try the local server next.
  }
  if (!LIVE.mode && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    try {
      if ((await fetch("/api/health")).ok) LIVE.mode = "server";
    } catch {
      // No local server either.
    }
  }
  LIVE.mode ||= "off";
  notify(true);
}

/** Up to `n` hubs within `km` road km of any of `codes`, nearest first. */
function hubsNear(codes, km, n) {
  return HUBS.filter((h) => !codes.includes(h) && STATIONS[h])
    .map((h) => [h, roadKmFrom(codes, h)])
    .filter(([, d]) => d <= km)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([h]) => h);
}

/** Hubs roughly on the way from `a` to `b`, least detour first. */
function hubsOnTheWay(a, b, exclude) {
  const direct = distanceKm(a, b);
  if (!Number.isFinite(direct)) return [];
  return HUBS.filter((h) => STATIONS[h] && !exclude.has(h))
    .map((h) => ({ h, toHub: distanceKm(a, h), fromHub: distanceKm(h, b) }))
    .map((x) => ({ ...x, detour: (x.toHub + x.fromHub) / direct }))
    .filter((x) => x.detour <= MAX_DETOUR && x.toHub > 40 && x.fromHub > 40)
    .sort((x, y) => x.detour - y.detour)
    .slice(0, MAX_JUNCTIONS_ON_THE_WAY)
    .map((x) => x.h);
}

/**
 * Station pairs ("FROM>TO") to look up for these settings: start and nearby junctions to the destination,
 * and, when changes are allowed, via junctions roughly on the way.
 */
export function livePlan(settings) {
  const src = codesOf(settings.from).slice(0, 2);
  const dst = codesOf(settings.to).slice(0, 2);
  const boards = [...src, ...hubsNear(src, settings.radius, 3)];
  const alights = [...dst, ...hubsNear(dst, settings.destRadius, 2)];
  const mids = settings.changes === 0 ? [] : hubsOnTheWay(src[0], dst[0], new Set([...boards, ...alights]));

  const pairs = new Set();
  for (const b of boards) for (const a of alights) pairs.add(`${b}>${a}`);
  for (const b of boards) for (const m of mids) pairs.add(`${b}>${m}`);
  for (const m of mids) for (const a of alights) pairs.add(`${m}>${a}`);
  return [...pairs].filter((p) => p.split(">")[0] !== p.split(">")[1]).slice(0, MAX_PAIRS);
}

async function fetchPair(pair) {
  if (LIVE.pairs.has(pair)) return;
  const [a, b] = pair.split(">");
  try {
    if (LIVE.mode === "direct") {
      const res = await fetch(erailUrl(a, b), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      LIVE.pairs.set(pair, parseErail(await res.text()));
    } else {
      const query = new URLSearchParams({ from: a, to: b });
      const res = await fetch(`/api/between?${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      LIVE.pairs.set(pair, (await res.json()).trains || []);
    }
  } catch {
    LIVE.fail++;
  }
}

/** One erail train between two stations -> a two-stop segment the planner can use. */
export function toSegment(t) {
  const day = (iso, shift) => (iso ? Date.parse(`${iso}T00:00:00Z`) + shift : 0);
  return {
    no: t.no,
    name: titleCase(t.name),
    live: true,
    days: new Set(t.daysAtFrom),
    classes: t.classes || [],
    validFrom: day(t.validFrom, -VALIDITY_SLACK_MS),
    validTo: day(t.validTo, VALIDITY_SLACK_MS),
    stops: [
      { code: t.from, arr: null, dep: t.dep },
      { code: t.to, arr: t.dep + t.dur, dep: null },
    ],
  };
}

/**
 * Fetch live trains for these settings and make them the live part of the network.
 * Pairs already fetched are reused; a repeat search retries any that failed last time.
 */
export async function runLive(settings) {
  const pairs = livePlan(settings);
  const key = pairs.join(",");
  if (LIVE.busy || (key === LIVE.key && LIVE.fail === 0)) return;
  Object.assign(LIVE, { busy: true, done: 0, total: pairs.length, fail: 0 });
  notify(false);

  const queue = [...pairs];
  const worker = async () => {
    while (queue.length) {
      await fetchPair(queue.shift());
      LIVE.done++;
      notify(false);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker));

  // Only this search's pairs, so unrelated trains from earlier searches don't pile up in the network.
  const seen = new Set();
  const segments = [];
  for (const pair of pairs) {
    for (const t of LIVE.pairs.get(pair) || []) {
      const id = t.no + t.from + t.to;
      if (seen.has(id) || t.from === t.to) continue;
      seen.add(id);
      ensureStation(t.from, titleCase(t.fromName || t.from));
      ensureStation(t.to, titleCase(t.toName || t.to));
      segments.push(toSegment(t));
    }
  }
  setLiveSegments(segments);
  Object.assign(LIVE, { trains: new Set(segments.map((s) => s.no)).size, key, busy: false });
  notify(true);
}
