// Station lookup across every Indian Railways station plus city groups, matched by code, name,
// or sound-alike spelling (so "luckeesarai", "lakhisarai" and "LKR" all find Luckeesarai Jn).

import { CITY_GROUPS, CITY_ALIASES } from "../data/stations.js";
import { STATIONS, nameOf, hasTrains, trainCount, nearestStationsWithTrains } from "./network.js";
import { norm, skel, phon, lev } from "../lib/text.js";

/**
 * @typedef {object} PlaceOption
 * @property {string} value     What the planner uses: a station code or a city group key ("@BLR").
 * @property {string} name
 * @property {string} code      Station code; "" for a city group.
 * @property {string} state
 * @property {boolean} isGroup
 */

const MAX_RESULTS = 12;
// Match tiers, best first. Stations with trains and city groups get a bonus on top.
const SCORE = {
  exactCode: 100,
  alias: 85,
  namePrefix: 80,
  codePrefix: 70,
  wordPrefix: 65,
  nameContains: 50,
  skeletonPrefix: 45,
  soundsAlike: 35,
  skeletonContains: 30,
  groupBonus: 20,
  hasTrainsBonus: 12,
};

/** Every option, with precomputed match keys. */
const OPTIONS = [
  ...Object.entries(CITY_GROUPS).map(([value, g]) => ({ value, name: g.name, code: "", state: "", isGroup: true })),
  ...Object.entries(STATIONS).map(([code, s]) => ({
    value: code,
    name: s.name,
    code,
    state: s.state || "",
    isGroup: false,
  })),
].map((o) => ({
  ...o,
  aliases: CITY_ALIASES[o.value] || [],
  key: norm(o.name),
  words: o.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean),
  skeleton: skel(o.name),
  sound: phon(o.name),
  lcCode: o.code.toLowerCase(),
}));

function matchScore(o, q) {
  if (o.lcCode && o.lcCode === q.norm) return SCORE.exactCode;
  if (o.aliases.some((a) => a.startsWith(q.norm))) return SCORE.alias;
  if (o.key.startsWith(q.norm)) return SCORE.namePrefix;
  if (o.lcCode && q.norm.length >= 2 && o.lcCode.startsWith(q.norm)) return SCORE.codePrefix;
  if (o.words.some((w) => w.startsWith(q.norm))) return SCORE.wordPrefix;
  if (o.key.includes(q.norm)) return SCORE.nameContains;
  if (q.skeleton.length >= 3 && o.skeleton.startsWith(q.skeleton)) return SCORE.skeletonPrefix;
  if (q.skeleton.length >= 3 && o.skeleton.includes(q.skeleton)) return SCORE.skeletonContains;
  if (q.sound.length >= 5 && lev(q.sound, o.sound) <= Math.floor(q.sound.length / 4)) return SCORE.soundsAlike;
  return 0;
}

/**
 * Best matching places for what the user typed.
 * @returns {PlaceOption[]}
 */
export function searchStations(text, n = MAX_RESULTS) {
  const q = { norm: norm(text), skeleton: skel(text), sound: phon(text) };
  if (!q.norm) return [];
  const hits = [];
  for (const o of OPTIONS) {
    let score = matchScore(o, q);
    if (!score) continue;
    // Among fuzzy matches, prefer the one that sounds closest.
    if (score <= SCORE.skeletonPrefix && q.sound.length >= 4) {
      score += Math.max(0, 10 - 2.5 * lev(q.sound, o.sound.slice(0, q.sound.length + 2)));
    }
    score += o.isGroup ? SCORE.groupBonus : hasTrains(o.code) ? SCORE.hasTrainsBonus : 0;
    hits.push([score - o.name.length / 100, o]); // shorter names win ties
  }
  return hits
    .sort((a, b) => b[0] - a[0])
    .slice(0, n)
    .map(([, o]) => o);
}

/** "Howrah Jn (HWH)", or a city group's name. */
export const labelOf = (value) => CITY_GROUPS[value]?.name || `${nameOf(value)} (${value})`;
/** "Howrah Jn", or a city group's name. */
export const plainName = (value) => CITY_GROUPS[value]?.name || nameOf(value);

/** Turn typed text (a label, a code, or loose text) into a station code or group key. */
export function resolve(text) {
  const s = text.trim();
  if (!s) return null;
  const code = s.match(/\(([A-Z0-9]{1,6})\)\s*$/i)?.[1]?.toUpperCase();
  if (code && STATIONS[code]) return code;
  const group = Object.keys(CITY_GROUPS).find((k) => CITY_GROUPS[k].name.toLowerCase() === s.toLowerCase());
  return group || searchStations(s, 1)[0]?.value || null;
}

/** Plain-text line shown next to a suggestion: train count, or the nearest station that has trains. */
export function describeCoverage(option) {
  if (option.isGroup) return "City group";
  const n = trainCount(option.code);
  if (n) return `${n} train${n > 1 ? "s" : ""}${option.state ? " · " + option.state : ""}`;
  const [nearest] = nearestStationsWithTrains([option.code], 1);
  return nearest ? `No trains here · nearest ${nameOf(nearest[0])}, ${nearest[1]} km` : "No trains here";
}
