import { test } from "node:test";
import assert from "node:assert/strict";
import { H, parseLocal } from "../src/js/lib/time.js";
import { buildQuery } from "../src/js/core/query.js";
import { loosenings, newRoutes, rankLoosenings, scoreLoosening } from "../src/js/core/suggest.js";

const SETTINGS = {
  from: "DUMK",
  to: "@BLR",
  earliest: "2027-02-26T03:00",
  deadline: "2027-02-26T08:00",
  radius: 100,
  destRadius: 0,
  speed: 40,
  buffer: 60,
  maxWait: 16,
  changes: 1,
  classes: ["2A", "3A"],
  shortOk: false,
};

// ---------- buildQuery ----------

test("buildQuery parses the window and passes settings through", () => {
  const { q, fallbacks, earliest, deadline } = buildQuery(SETTINGS);
  assert.equal(earliest, parseLocal("2027-02-26T03:00"));
  assert.equal(deadline, parseLocal("2027-02-26T08:00"));
  assert.deepEqual(fallbacks, []);
  assert.equal(q.radius, 100);
  assert.deepEqual(q.classes, ["2A", "3A"]);
});

test("buildQuery clamps an earliest time after the deadline, and treats no classes as all classes", () => {
  const { earliest, deadline, q } = buildQuery({ ...SETTINGS, earliest: "2027-02-27T00:00", classes: [] });
  assert.equal(earliest, deadline);
  assert.deepEqual(q.classes, ["1A", "2A", "3A", "SL"]);
});

test("buildQuery widens the road radius when the start has no trains, and reports it", () => {
  const { q, fallbacks } = buildQuery({ ...SETTINGS, from: "LKR", radius: 0 });
  assert.equal(fallbacks.length, 1);
  const [fb] = fallbacks;
  assert.equal(fb.role, "from");
  assert.equal(fb.widened, true);
  assert.equal(fb.nearest[0][0], "KIUL");
  assert.ok(q.radius > fb.nearest[0][1], "radius reaches the nearest station");
});

test("buildQuery keeps a radius that already reaches a station with trains", () => {
  const { q, fallbacks } = buildQuery({ ...SETTINGS, from: "LKR", radius: 400 });
  assert.equal(q.radius, 400);
  assert.equal(fallbacks[0].widened, false);
});

// ---------- suggestions ----------

const window = { earliest: parseLocal(SETTINGS.earliest), deadline: parseLocal(SETTINGS.deadline) };

test("loosenings offers one patch per filter that can still be loosened", () => {
  const groups = new Set(loosenings(SETTINGS, window).map((l) => l.group));
  assert.deepEqual(
    [...groups].sort(),
    ["buffer", "changes", "class", "dest", "earlier", "later", "radius", "short", "wait"].sort(),
  );
  const later = loosenings(SETTINGS, window).find((l) => l.group === "later");
  assert.equal(later.patch.deadline, "2027-02-26T10:00");
});

test("loosenings skips filters that are already as loose as they go", () => {
  const loosest = {
    ...SETTINGS,
    changes: 2,
    buffer: 15,
    maxWait: 24,
    radius: 400,
    destRadius: 75,
    classes: ["1A", "2A", "3A", "SL"],
    shortOk: true,
  };
  const groups = new Set(loosenings(loosest, window).map((l) => l.group));
  assert.deepEqual([...groups].sort(), ["earlier", "later"]);
});

// Minimal journeys: only the fields newRoutes / journeyCost read.
const j = (nos, start, hours, extra = {}) => ({
  key: `${nos}@${start}`,
  legs: nos.split("+").map((no) => ({ train: { no } })),
  start,
  arrive: start + hours * H,
  changes: nos.split("+").length - 1,
  roadKm: 0,
  lastKm: 0,
  ...extra,
});

test("newRoutes keeps only combinations that beat what the base already offers", () => {
  const base = [j("111", 0, 10)];
  const fresh = newRoutes(base, [
    base[0], // already known
    j("111", -H, 12), // same train, leaves earlier and arrives later: dominated
    j("222", 0, 20), // new train
    j("222", 0, 15), // same new train, better: replaces the one above
    j("111+333", 0, 8), // new combination
  ]);
  // Cost is hours + 6 per change: 111+333 is 8 + 6 = 14, 222 is 15.
  assert.deepEqual(
    fresh.map((r) => r.legs.map((l) => l.train.no).join("+")),
    ["111+333", "222"],
  );
  assert.equal(fresh[1].arrive, 15 * H, "the better run of 222 is kept");
});

test("scoreLoosening counts new routes and keeps two examples", () => {
  const scored = scoreLoosening(
    { group: "later", label: "x", patch: {} },
    [],
    [j("1", 0, 1), j("2", 0, 2), j("3", 0, 3)],
  );
  assert.equal(scored.gain, 3);
  assert.equal(scored.examples.length, 2);
  assert.equal(scored.group, "later");
});

test("rankLoosenings picks the smallest useful step per filter, a clearly bigger one, and the biggest limiter", () => {
  const r = (group, label, gain) => ({ group, label, gain, examples: [] });
  const { picks, limiter } = rankLoosenings([
    r("later", "+2h", 0),
    r("later", "+6h", 1),
    r("later", "+24h", 9),
    r("buffer", "30", 2),
    r("buffer", "15", 3), // not clearly bigger than 2, so not shown
    r("class", "SL", 0),
  ]);
  assert.deepEqual(
    picks.map((p) => p.label),
    ["+24h", "30", "+6h"],
  );
  assert.equal(limiter.label, "+24h");
  assert.deepEqual(rankLoosenings([r("class", "SL", 0)]), { picks: [], limiter: null });
});
