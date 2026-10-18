// Suggestions engine: which single filter, loosened, would add routes, and which trains it would add.
// Pure functions; ui/suggestions.js schedules the work and draws the result.

import { H, toLocal, fFull } from "../lib/time.js";
import { ALL_CLASSES, comboKey, journeyCost } from "./journey.js";

const MAX_RADIUS_KM = 400;
const MAX_SUGGESTIONS = 6;
const EXAMPLES_PER_SUGGESTION = 2;

/** What each loosening group changes, for the "biggest limiter" sentence. */
export const FILTER_NAMES = {
  later: "the arrive-by time",
  earlier: "the earliest arrival time",
  changes: "the number of changes",
  buffer: "the connection buffer",
  wait: "the longest wait at a change",
  radius: "the boarding radius",
  dest: "the get-off radius",
  class: "the class filter",
  short: "the chair car setting",
};

/**
 * Ways to loosen the current settings one filter at a time, each as { group, label, patch }.
 * `window` is the effective search window from buildQuery, so labels match the search that ran.
 */
export function loosenings(settings, { earliest, deadline }) {
  const out = [];
  const add = (group, label, patch) => out.push({ group, label, patch });
  for (const h of [2, 6, 12, 24]) {
    add("later", `Arrive by ${fFull(deadline + h * H)} (${h} h later)`, { deadline: toLocal(deadline + h * H) });
  }
  for (const h of [6, 12, 24, 48]) {
    add("earlier", `Accept arriving from ${fFull(earliest - h * H)} (${h} h earlier)`, {
      earliest: toLocal(earliest - h * H),
    });
  }
  if (settings.changes < 2) {
    const n = settings.changes + 1;
    add("changes", `Allow up to ${n} change${n > 1 ? "s" : ""}`, { changes: n });
  }
  for (const m of [30, 15])
    if (m < settings.buffer) add("buffer", `Cut the connection buffer to ${m} min`, { buffer: m });
  for (const h of [20, 24])
    if (h > settings.maxWait) add("wait", `Allow waits of up to ${h} h at a change`, { maxWait: h });
  const radii = [...new Set([settings.radius + 50, settings.radius + 150, MAX_RADIUS_KM])];
  for (const r of radii)
    if (r > settings.radius && r <= MAX_RADIUS_KM) add("radius", `Board within ${r} km of your start`, { radius: r });
  for (const r of [25, 75])
    if (r > settings.destRadius) add("dest", `Get off within ${r} km of your destination`, { destRadius: r });
  for (const c of ALL_CLASSES) {
    if (!settings.classes.includes(c)) add("class", `Also allow ${c}`, { classes: [...settings.classes, c] });
  }
  if (!settings.shortOk) add("short", "Allow chair car / 2S on legs under 10 h", { shortOk: true });
  return out;
}

/**
 * Routes in `candidates` that `base` doesn't already offer: a new train combination, or a known one that
 * leaves later or arrives sooner than every version in `base`. One per combination, best first.
 */
export function newRoutes(base, candidates) {
  const known = new Set(base.map((j) => `${j.key}|${j.arrive}`));
  const baseByCombo = Map.groupBy(base, comboKey);
  const best = new Map();
  for (const j of candidates) {
    if (known.has(`${j.key}|${j.arrive}`)) continue;
    const combo = comboKey(j);
    if ((baseByCombo.get(combo) || []).some((b) => b.start >= j.start && b.arrive <= j.arrive)) continue;
    const current = best.get(combo);
    if (!current || journeyCost(j) < journeyCost(current)) best.set(combo, j);
  }
  return [...best.values()].sort((a, b) => journeyCost(a) - journeyCost(b));
}

/**
 * Score every loosening with `runSearch(patch) -> journeys` and pick what to show.
 * @returns {{ picks: object[], limiter: ?object }} picks: up to 6 suggestions with gain and examples;
 *   limiter: the loosening with the biggest gain overall (names the filter cutting the most options).
 */
export function rankLoosenings(results) {
  const byGroup = Map.groupBy(results, (r) => r.group);
  const picks = [];
  const maxima = [];
  for (const list of byGroup.values()) {
    // The smallest loosening that gains anything, plus the loosest one if it gains clearly more.
    const first = list.find((r) => r.gain > 0);
    const biggest = list.reduce((a, b) => (b.gain > a.gain ? b : a));
    if (first) picks.push(first);
    if (biggest.gain) maxima.push(biggest);
    const firstGain = first ? first.gain : 0;
    if (biggest !== first && biggest.gain > firstGain * 1.5 && biggest.gain - firstGain >= 3) picks.push(biggest);
  }
  picks.sort((a, b) => b.gain - a.gain);
  maxima.sort((a, b) => b.gain - a.gain);
  return { picks: picks.slice(0, MAX_SUGGESTIONS), limiter: maxima[0] || null };
}

/** Evaluate one loosening: how many new routes it adds and a couple of examples. */
export function scoreLoosening(loosening, base, candidates) {
  const fresh = newRoutes(base, candidates);
  return { ...loosening, gain: fresh.length, examples: fresh.slice(0, EXAMPLES_PER_SUGGESTION) };
}
