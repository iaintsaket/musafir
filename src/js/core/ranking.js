// Ordering and summarising search results. Pure functions, no DOM.

import { H } from "../lib/time.js";
import { journeyCost } from "./journey.js";

/** Extra cost for a route that lands closer to the deadline than the safe margin. */
const TIGHT_MARGIN_PENALTY = 10;

/** Sort orders offered in the UI. */
export const SORTS = {
  rec: "Recommended",
  leave: "Leave latest",
  dur: "Shortest door to door",
  margin: "Biggest margin",
  changes: "Fewest changes",
};

/**
 * Return `journeys` sorted by `sort` (a key of {@link SORTS}).
 * "Recommended" weighs duration, changes and road distance, and pushes tight arrivals down.
 */
export function rankJourneys(journeys, sort, deadline, safeHours) {
  const score = (j) => journeyCost(j) + (deadline - j.arrive < safeHours * H ? TIGHT_MARGIN_PENALTY : 0);
  const compare =
    {
      rec: (a, b) => score(a) - score(b),
      leave: (a, b) => b.start - a.start,
      dur: (a, b) => a.arrive - a.start - (b.arrive - b.start),
      margin: (a, b) => a.arrive - b.arrive,
      changes: (a, b) => a.changes - b.changes || score(a) - score(b),
    }[sort] || ((a, b) => score(a) - score(b));
  return [...journeys].sort(compare);
}

/** Count journeys by number of changes: [direct, one change, two changes]. */
export const countByChanges = (journeys) => [0, 1, 2].map((n) => journeys.filter((j) => j.changes === n).length);

/** Journeys matching a changes filter: "all" or "0" / "1" / "2". */
export const filterByChanges = (journeys, filter) =>
  filter === "all" ? journeys : journeys.filter((j) => j.changes === Number(filter));
