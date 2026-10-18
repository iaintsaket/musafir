// The rail network the planner searches: the trains (built-in timetables plus live segments),
// the all-India station list, distances, and which stations you can change between by cab.

import { HAND_CHECKED_STATIONS, CITY_GROUPS, CITY_TRANSFERS } from "../data/stations.js";
import { BUILT_IN_TRAINS } from "../data/trains.js";
import { ALL_STATIONS } from "../data/all-stations.js";

/**
 * @typedef {object} Stop
 * @property {string} code     Station code, e.g. "HWH".
 * @property {?number} arr     Arrival, in minutes after 00:00 on the day the train leaves its origin. Null at the origin.
 * @property {?number} dep     Departure, in the same minutes. Null at the terminus.
 *
 * @typedef {object} Train
 * @property {string} no            Train number.
 * @property {string} name
 * @property {Set<number>} days     Weekdays (0 = Sunday) the train leaves its first stop.
 * @property {string[]} classes     Coach classes, e.g. ["2A", "3A"]. Empty when unknown.
 * @property {Stop[]} stops
 * @property {boolean} [live]       True for segments fetched from erail.in.
 * @property {number} [validFrom]   First running date (UTC ms), for trains with a limited run.
 * @property {number} [validTo]     Last running date (UTC ms).
 *
 * @typedef {object} Station
 * @property {string} name
 * @property {number} [lat]
 * @property {number} [lon]
 * @property {string} [state]
 */

/** Road distance is estimated as straight-line distance times this factor. */
export const ROAD_FACTOR = 1.3;
/** Stations this close together (straight line, km) count as one place for changing trains by cab. */
const SAME_PLACE_KM = 12;
const MINUTES_PER_DAY = 1440;

/** "hh:mm" on journey day `day` (1 = departure day) -> minutes after 00:00 on day 1; "-" -> null. */
function toJourneyMinutes(hhmm, day) {
  if (hhmm === "-") return null;
  const [h, m] = hhmm.split(":").map(Number);
  return (day - 1) * MINUTES_PER_DAY + h * 60 + m;
}

/** @type {Train[]} */
export const STATIC_TRAINS = BUILT_IN_TRAINS.map(([no, name, days, classes, stops]) => ({
  no,
  name,
  days: new Set(days),
  classes: classes.split(" "),
  stops: stops.split(",").map((entry) => {
    const [code, arr, dep, day] = entry.trim().split(/\s+/);
    return { code, arr: toJourneyMinutes(arr, +day), dep: toJourneyMinutes(dep, +day) };
  }),
}));

/** Every searchable train: the built-in ones plus any live segments. Reassigned by {@link setLiveSegments}. */
export let TRAINS = STATIC_TRAINS;
/** Station code -> [[train index, stop index], ...] for every train that stops there. */
export let STOPS_AT = {};
let transferCache = {};

function reindex() {
  STOPS_AT = {};
  transferCache = {};
  TRAINS.forEach((train, ti) => train.stops.forEach((stop, si) => (STOPS_AT[stop.code] ||= []).push([ti, si])));
}
reindex();

/** Put live segments next to the built-in trains and rebuild the station index. */
export function setLiveSegments(segments) {
  TRAINS = STATIC_TRAINS.concat(segments);
  reindex();
}

/** @type {Record<string, Station>} Every Indian Railways station; hand-checked entries override the open dataset. */
export const STATIONS = {};
for (const [code, name, lat, lon, state] of ALL_STATIONS) STATIONS[code] = { name, lat, lon, state };
for (const [code, [name, lat, lon]] of Object.entries(HAND_CHECKED_STATIONS)) {
  STATIONS[code] = { name, lat, lon, state: STATIONS[code]?.state || "" };
}

/** Remember a name for a station code that only live data knows about. */
export function ensureStation(code, name) {
  if (!STATIONS[code]) STATIONS[code] = { name };
}

export const nameOf = (code) => STATIONS[code]?.name || code;
export const hasTrains = (code) => Boolean(STOPS_AT[code]);
export const trainCount = (code) => new Set((STOPS_AT[code] || []).map(([ti]) => ti)).size;

/** City group ("@BLR") -> its station codes; a plain station code -> [code]. */
export const codesOf = (place) => CITY_GROUPS[place]?.codes || [place];

/** Straight-line distance in km between two stations (Infinity if either has no coordinates). */
export function distanceKm(a, b) {
  const A = STATIONS[a],
    B = STATIONS[b];
  if (A?.lat == null || B?.lat == null) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (B.lat - A.lat) * rad,
    dLon = (B.lon - A.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * rad) * Math.cos(B.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Estimated road km from the nearest of `codes` to `code`. */
export const roadKmFrom = (codes, code) => Math.min(...codes.map((c) => distanceKm(c, code))) * ROAD_FACTOR;

/** The `n` nearest stations that have trains, as [code, road km], excluding `codes` themselves. */
export function nearestStationsWithTrains(codes, n = 3) {
  return Object.keys(STOPS_AT)
    .filter((c) => !codes.includes(c))
    .map((c) => [c, Math.round(roadKmFrom(codes, c))])
    .filter(([, km]) => Number.isFinite(km))
    .sort((a, b) => a[1] - b[1])
    .slice(0, n);
}

const namedTransfers = {};
for (const [a, b, minutes] of CITY_TRANSFERS) {
  (namedTransfers[a] ||= {})[b] = minutes;
  (namedTransfers[b] ||= {})[a] = minutes;
}

/**
 * Stations you can change to by cab from `code`, as [code, minutes]: the named city pairs
 * (Howrah ↔ Santragachi…) plus any station with trains within {@link SAME_PLACE_KM} (20 min + 3 min/km).
 */
export function transfersFrom(code) {
  if (!transferCache[code]) {
    const options = { ...namedTransfers[code] };
    for (const other in STOPS_AT) {
      if (other === code || options[other]) continue;
      const km = distanceKm(code, other);
      if (km <= SAME_PLACE_KM) options[other] = Math.round(20 + km * 3);
    }
    transferCache[code] = Object.entries(options);
  }
  return transferCache[code];
}

/** Cab minutes from station `a` to station `b` (0 if they are the same or not linked). */
export const transferMinutes = (a, b) => transfersFrom(a).find(([c]) => c === b)?.[1] || 0;
