// Settings. S is what the current results were searched with; D is what the form says now.
// Search copies D into S. Saved settings are validated key by key, so a stale or corrupt value
// falls back to its default instead of breaking the page.

import { DAY, H, toLocal, floorDay, nowIST } from "../lib/time.js";
import { STATIONS } from "../core/network.js";
import { CITY_GROUPS } from "../data/stations.js";
import { ALL_CLASSES } from "../core/journey.js";
import { SORTS } from "../core/ranking.js";

const STORAGE_KEY = "musafir-settings-v1";
export const PAGE_SIZE = 12;

/** Default window: tomorrow, 06:00–23:00 Indian time. */
export function defaultWindow(now = Date.now()) {
  const tomorrow = floorDay(nowIST(now)) + DAY;
  return { earliest: toLocal(tomorrow + 6 * H), deadline: toLocal(tomorrow + 23 * H) };
}

export const DEF = {
  from: "DUMK",
  to: "@BLR",
  ...defaultWindow(),
  radius: 100,
  destRadius: 0,
  speed: 40,
  buffer: 60,
  maxWait: 16,
  safe: 3,
  changes: 2,
  classes: ["2A", "3A"],
  shortOk: true,
  sort: "rec",
  chg: "all",
};

const isPlace = (v) => typeof v === "string" && (Boolean(STATIONS[v]) || Boolean(CITY_GROUPS[v]));
const isDateTime = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);
const inRange = (min, max) => (v) => Number.isFinite(v) && v >= min && v <= max;

/** One check per setting; the ranges match the form's sliders. */
const VALID = {
  from: isPlace,
  to: isPlace,
  earliest: isDateTime,
  deadline: isDateTime,
  radius: inRange(0, 400),
  destRadius: inRange(0, 200),
  speed: inRange(25, 70),
  buffer: inRange(15, 240),
  maxWait: inRange(2, 24),
  safe: inRange(0, 12),
  changes: (v) => [0, 1, 2].includes(v),
  classes: (v) => Array.isArray(v) && v.every((c) => ALL_CLASSES.includes(c)),
  shortOk: (v) => typeof v === "boolean",
  sort: (v) => Object.hasOwn(SORTS, v),
  chg: (v) => ["all", "0", "1", "2"].includes(v),
};

/** Keep each saved value only if it passes its check; otherwise use the default. */
export function sanitizeSettings(saved) {
  const clean = { ...DEF };
  if (saved && typeof saved === "object") {
    for (const [key, ok] of Object.entries(VALID)) if (key in saved && ok(saved[key])) clean[key] = saved[key];
  }
  return clean;
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null; // storage blocked (private window, previews) or unreadable
  }
}

export const S = sanitizeSettings(loadSaved());
export const D = { ...S };

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(D));
  } catch {
    // Storage unavailable: settings simply aren't remembered.
  }
}

/** Settings that change the search (sort and the changes filter only change the view). */
export const SEARCH_KEYS = Object.keys(VALID).filter((k) => k !== "sort" && k !== "chg");
export const dirty = () => SEARCH_KEYS.some((k) => JSON.stringify(D[k]) !== JSON.stringify(S[k]));

/** View-only state: how many route cards are shown. */
export const view = { showN: PAGE_SIZE };
