// Route search: direct trains and connections with up to two changes, landing inside an arrival window.
//
// The search runs backwards from the destination: for every train that reaches it inside the window,
// try each earlier stop as the boarding point; if that stop is near the start, it is a route; if changes
// are still allowed, search for trains arriving at that stop (or a station a cab ride away) in time.

import { DAY, MIN, H, floorDay } from "../lib/time.js";
import { TRAINS, STOPS_AT, codesOf, roadKmFrom, transfersFrom } from "./network.js";
import { journeyCost } from "./journey.js";

/**
 * @typedef {object} Query
 * @property {string} from, to        Station code or city group ("@BLR").
 * @property {number} earliest        Arrive no earlier than (UTC ms of IST wall clock).
 * @property {number} deadline        Arrive no later than.
 * @property {number} radius          Board at stations up to this many road km from the start.
 * @property {number} destRadius      Get off up to this many road km from the destination.
 * @property {number} speed           Road speed, km/h.
 * @property {number} buffer          Minimum minutes between arriving and the next departure.
 * @property {number} maxWait         Longest wait at a change, hours.
 * @property {number} changes         Changes allowed (0–2).
 * @property {string[]} classes       Acceptable classes.
 * @property {boolean} shortOk        Accept trains without those classes on legs shorter than 10 h.
 * @property {number} [maxSteps]      Override the search-step cap (tests use a small one).
 *
 * @typedef {object} Leg
 * @property {import('./network.js').Train} train
 * @property {string} from, to
 * @property {number} dep, arr        UTC ms.
 * @property {number} [endKm]         Road km after the last leg, when getting off near the destination.
 * @property {number} [endMin]        Road minutes after the last leg.
 *
 * @typedef {object} Journey
 * @property {Leg[]} legs
 * @property {number} start           Leave the start point (including any road trip).
 * @property {number} arrive          Reach the destination (including any road trip).
 * @property {number} roadKm, roadMin First-mile road trip.
 * @property {number} lastKm, lastMin Last-mile road trip.
 * @property {number} changes
 * @property {string} key             Identifies the route (trains plus road ends).
 */

/** Trains without your class are still fine on legs shorter than this (day trains with chair cars). */
const SHORT_LEG_MINUTES = 10 * 60;
/** Any road trip takes at least this long, door to door. */
const MIN_ROAD_MINUTES = 15;
/** Safety cap on search steps, so an extreme query can't freeze the page. Hitting it is reported as `truncated`. */
export const MAX_SEARCH_STEPS = 1_500_000;
/** Keep this many best variants per final train run, so one good train doesn't flood the results. */
const VARIANTS_PER_FINAL_RUN = 3;

const roadMinutes = (km, speed) => (km ? Math.max(MIN_ROAD_MINUTES, Math.round((km / speed) * 60)) : 0);

/**
 * The latest run of `train` whose time at a stop (`minutes` after its origin day) falls within [lo, hi].
 * @returns {?number} The run's origin day (UTC ms at 00:00), or null.
 */
export function latestRun(train, minutes, lo, hi) {
  for (let day = floorDay(hi - minutes * MIN); day + minutes * MIN >= lo; day -= DAY) {
    const runs = train.days.has(new Date(day).getUTCDay());
    const inService = (!train.validFrom || day >= train.validFrom) && (!train.validTo || day <= train.validTo);
    if (runs && inService) return day;
  }
  return null;
}

/** Stations with trains within `km` road km of `codes`, as code -> road km (the codes themselves at 0). */
function stationsWithin(codes, km) {
  const found = new Map(codes.map((c) => [c, 0]));
  if (km > 0) {
    for (const code in STOPS_AT) {
      if (found.has(code)) continue;
      const roadKm = roadKmFrom(codes, code);
      if (roadKm <= km) found.set(code, Math.round(roadKm));
    }
  }
  return found;
}

/**
 * Find every sensible route for `q`.
 * @param {Query} q
 * @returns {{ list: Journey[], board: Map<string, number>, steps: number, truncated: boolean }}
 */
export function plan(q) {
  const startCodes = new Set(codesOf(q.from));
  const board = stationsWithin([...startCodes], q.radius);
  const alight = stationsWithin(codesOf(q.to), q.destRadius);
  const endCodes = new Set(alight.keys());
  const bufferMs = q.buffer * MIN;
  const maxWaitMs = q.maxWait * H;
  const maxSteps = q.maxSteps ?? MAX_SEARCH_STEPS;
  const best = new Map();
  let steps = 0;

  const classOk = (train, legMinutes) =>
    !train.classes.length ||
    train.classes.some((c) => q.classes.includes(c)) ||
    (q.shortOk && legMinutes < SHORT_LEG_MINUTES);

  /**
   * Extend `tail` backwards with trains reaching one of `targets` within [lo, hi].
   * @param {Array<[string, number, number?]>} targets  [code, extra minutes after arriving, road km if last mile]
   */
  function searchInto(targets, lo, hi, trainsLeft, usedTrains, visited, tail) {
    for (const [targetCode, extraMin, roadKm] of targets) {
      for (const [ti, alightIdx] of STOPS_AT[targetCode] || []) {
        if (usedTrains.has(ti)) continue;
        const train = TRAINS[ti];
        const alightStop = train.stops[alightIdx];
        if (alightStop.arr == null) continue;
        const runDay = latestRun(train, alightStop.arr, lo - extraMin * MIN, hi - extraMin * MIN);
        if (runDay == null) continue;
        const arr = runDay + alightStop.arr * MIN;

        for (let boardIdx = 0; boardIdx < alightIdx; boardIdx++) {
          const boardStop = train.stops[boardIdx];
          if (boardStop.dep == null || visited.has(boardStop.code)) continue;
          const dep = runDay + boardStop.dep * MIN;
          if (!classOk(train, (arr - dep) / MIN)) continue;
          if (++steps > maxSteps) return;

          const leg = { train, from: boardStop.code, to: alightStop.code, dep, arr };
          if (tail.length === 0 && roadKm) Object.assign(leg, { endKm: roadKm, endMin: extraMin });
          const legs = [leg, ...tail];

          if (board.has(boardStop.code)) record(legs, board.get(boardStop.code));
          if (trainsLeft > 1 && !startCodes.has(boardStop.code)) {
            const nextVisited = new Set(visited).add(boardStop.code);
            const changeAt = [
              [boardStop.code, 0],
              ...transfersFrom(boardStop.code).filter(([c]) => !nextVisited.has(c)),
            ];
            searchInto(
              changeAt,
              dep - maxWaitMs,
              dep - bufferMs,
              trainsLeft - 1,
              new Set(usedTrains).add(ti),
              nextVisited,
              legs,
            );
          }
        }
      }
    }
  }

  /**
   * Reject routes nobody would take: boarding a train later than you could have, doubling back
   * over stations already passed, or getting off a train that carries on to where you're heading.
   */
  function isSensible(legs) {
    const passed = new Set(startCodes.has(legs[0].from) ? [] : startCodes); // a road start must not ride back through the start
    for (let m = 0; m < legs.length; m++) {
      const leg = legs[m];
      if (m > 0 && leg.train.no === legs[m - 1].train.no) return false;
      const stops = leg.train.stops;
      const i = stops.findIndex((s) => s.code === leg.from);
      const j = stops.findIndex((s, k) => k > i && s.code === leg.to);
      for (let k = 0; k < i; k++) if (startCodes.has(stops[k].code) || passed.has(stops[k].code)) return false;
      for (let k = i + 1; k <= j; k++) if (passed.has(stops[k].code)) return false;
      if (m < legs.length - 1) {
        const laterStops = new Set(legs.slice(m + 1).map((l) => l.to));
        for (let k = j + 1; k < stops.length; k++) {
          if (endCodes.has(stops[k].code) || laterStops.has(stops[k].code)) return false;
        }
      }
      for (let k = i; k <= j; k++) passed.add(stops[k].code);
    }
    return true;
  }

  function record(legs, roadKm) {
    if (!isSensible(legs)) return;
    const first = legs[0],
      last = legs.at(-1);
    const roadMin = roadMinutes(roadKm, q.speed);
    const lastKm = last.endKm || 0,
      lastMin = last.endMin || 0;
    const journey = {
      legs,
      roadKm,
      roadMin,
      lastKm,
      lastMin,
      start: first.dep - (roadKm ? bufferMs + roadMin * MIN : 0),
      arrive: last.arr + lastMin * MIN,
      changes: legs.length - 1,
      key: legs.map((l) => l.train.no).join("+") + (roadKm ? "@" + first.from : "") + (lastKm ? ">" + last.to : ""),
    };
    const prev = best.get(journey.key);
    const better =
      !prev || journey.start > prev.start || (journey.start === prev.start && journey.arrive < prev.arrive);
    if (better) best.set(journey.key, journey);
  }

  const finalTargets = [...alight].map(([code, km]) => [code, roadMinutes(km, q.speed), km]);
  searchInto(finalTargets, q.earliest, q.deadline, q.changes + 1, new Set(), new Set(endCodes), []);

  const byFinalRun = new Map();
  for (const j of best.values()) {
    const last = j.legs.at(-1);
    const runKey = last.train.no + "@" + last.arr;
    if (!byFinalRun.has(runKey)) byFinalRun.set(runKey, []);
    byFinalRun.get(runKey).push(j);
  }
  const list = [...byFinalRun.values()].flatMap((g) =>
    g.sort((a, b) => journeyCost(a) - journeyCost(b)).slice(0, VARIANTS_PER_FINAL_RUN),
  );
  return { list, board, steps, truncated: steps > maxSteps };
}
