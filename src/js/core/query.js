// Turn user settings into a planner query.

import { parseLocal } from "../lib/time.js";
import { codesOf, hasTrains, nearestStationsWithTrains } from "./network.js";
import { ALL_CLASSES } from "./journey.js";

/**
 * @typedef {object} RoadFallback  A start or destination that no loaded train serves.
 * @property {"from"|"to"} role
 * @property {string} place                      The station or group the user picked.
 * @property {Array<[string, number]>} nearest   Nearest stations with trains, as [code, road km].
 * @property {boolean} widened                   True if the road radius was widened to reach the nearest one.
 */

/**
 * Build the planner query for `settings`. If the start or destination has no trains, the road radius is
 * widened just enough to reach the nearest station that has one, and that is reported in `fallbacks`.
 * @returns {{ q: import('./planner.js').Query, fallbacks: RoadFallback[], radius: number, earliest: number, deadline: number }}
 */
export function buildQuery(settings) {
  const deadline = parseLocal(settings.deadline);
  const earliest = Math.min(parseLocal(settings.earliest), deadline);
  const fallbacks = [];

  const radiusFor = (place, radius, role) => {
    const codes = codesOf(place);
    if (codes.some(hasTrains)) return radius;
    const nearest = nearestStationsWithTrains(codes, 3);
    if (!nearest.length) return radius;
    const needed = nearest[0][1] + 1;
    fallbacks.push({ role, place, nearest, widened: radius < needed });
    return Math.max(radius, needed);
  };
  const radius = radiusFor(settings.from, settings.radius, "from");
  const destRadius = radiusFor(settings.to, settings.destRadius, "to");

  const q = {
    from: settings.from,
    to: settings.to,
    earliest,
    deadline,
    radius,
    destRadius,
    speed: settings.speed,
    buffer: settings.buffer,
    maxWait: settings.maxWait,
    changes: settings.changes,
    classes: settings.classes.length ? settings.classes : ALL_CLASSES,
    shortOk: settings.shortOk,
  };
  return { q, fallbacks, radius, earliest, deadline };
}
