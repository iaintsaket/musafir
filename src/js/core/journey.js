// Small helpers for describing a journey, shared by the planner, ranking, suggestions and the UI.

import { H } from "../lib/time.js";

/** Classes offered in the class filter. */
export const ALL_CLASSES = ["1A", "2A", "3A", "SL"];

/** How good a journey is; lower is better. Duration in hours, plus 6 per change and 1 per 25 road km. */
export const journeyCost = (j) => (j.arrive - j.start) / H + j.changes * 6 + (j.roadKm + j.lastKm) / 25;

/** Train numbers in order, e.g. ["13016", "12863"]. */
export const trainNumbers = (j) => j.legs.map((leg) => leg.train.no);

/** "13016+12863": identifies the train combination regardless of road ends. */
export const comboKey = (j) => trainNumbers(j).join("+");

/** The longest leg, whose train names the journey. */
export const mainLeg = (j) => j.legs.reduce((a, b) => (b.arr - b.dep > a.arr - a.dep ? b : a));
