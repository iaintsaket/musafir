import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocal, MIN } from "../src/js/lib/time.js";
import {
  STATIC_TRAINS,
  STATIONS,
  distanceKm,
  nearestStationsWithTrains,
  codesOf,
  transfersFrom,
  transferMinutes,
  hasTrains,
} from "../src/js/core/network.js";
import { plan, latestRun } from "../src/js/core/planner.js";
import { searchStations, resolve, labelOf, describeCoverage } from "../src/js/core/station-search.js";
import { rankJourneys, countByChanges, filterByChanges } from "../src/js/core/ranking.js";

const BASE = {
  from: "DUMK",
  to: "@BLR",
  earliest: parseLocal("2027-02-26T03:00"),
  deadline: parseLocal("2027-02-26T08:00"),
  radius: 100,
  destRadius: 0,
  speed: 40,
  buffer: 60,
  maxWait: 16,
  changes: 2,
  classes: ["2A", "3A"],
  shortOk: true,
};
const trainNos = (j) => j.legs.map((l) => l.train.no);
const train = (no) => STATIC_TRAINS.find((t) => t.no === no);

// ---------- network ----------

test("built-in timetables load with valid stops", () => {
  assert.equal(STATIC_TRAINS.length, 32);
  for (const t of STATIC_TRAINS) {
    assert.ok(t.stops.length >= 2, `${t.no} has stops`);
    assert.equal(t.stops[0].arr, null, `${t.no} starts with no arrival`);
    assert.equal(t.stops.at(-1).dep, null, `${t.no} ends with no departure`);
    for (let i = 1; i < t.stops.length; i++) {
      const prev = t.stops[i - 1].dep,
        cur = t.stops[i].arr;
      assert.ok(cur >= prev, `${t.no}: time goes forward at ${t.stops[i].code}`);
    }
  }
});

test("the station list covers India and keeps the hand-checked entries", () => {
  assert.ok(Object.keys(STATIONS).length > 8000);
  assert.equal(STATIONS.LKR.name, "Luckeesarai Jn");
  assert.equal(STATIONS.SMVB.name, "SMVT Bengaluru");
});

test("distanceKm gives straight-line distance in km", () => {
  const d = distanceKm("KIUL", "LKR");
  assert.ok(d > 0.5 && d < 3, `Kiul-Lakhisarai is about 1 km, got ${d}`);
  assert.equal(distanceKm("DUMK", "NOPE"), Infinity);
});

test("nearestStationsWithTrains finds Kiul for Lakhisarai, which no built-in train serves", () => {
  assert.equal(hasTrains("LKR"), false);
  assert.equal(nearestStationsWithTrains(["LKR"], 1)[0][0], "KIUL");
});

test("codesOf expands city groups", () => {
  assert.ok(codesOf("@BLR").includes("SMVB"));
  assert.deepEqual(codesOf("DUMK"), ["DUMK"]);
});

test("transfersFrom lists cab changes within a city", () => {
  assert.equal(transferMinutes("HWH", "SRC"), 60);
  assert.ok(transfersFrom("RNC").some(([c]) => c === "HTE"));
});

// ---------- planner ----------

test("latestRun only returns days the train runs", () => {
  const anga = train("12254"); // Wednesdays only from Bhagalpur
  const jsme = anga.stops.find((s) => s.code === "JSME").dep;
  const d = latestRun(anga, jsme, parseLocal("2027-02-20T00:00"), parseLocal("2027-02-27T00:00"));
  assert.equal(new Date(d).getUTCDay(), 3);
});

test("Dumka to Bengaluru finds the Anga Express and the Howrah connection inside the window", () => {
  const { list } = plan(BASE);
  const combos = list.map((j) => trainNos(j).join("+"));
  assert.ok(combos.includes("12254"), "Anga Express by road from a nearby station");
  assert.ok(combos.includes("13016+12863"), "Kavi Guru to Howrah, then 12863");
  for (const j of list) {
    assert.ok(j.arrive >= BASE.earliest && j.arrive <= BASE.deadline, "arrives inside the window");
    assert.ok(codesOf("@BLR").includes(j.legs.at(-1).to), "ends at a Bengaluru station");
  }
});

test("every route keeps the connection buffer and never re-boards the same train", () => {
  const { list } = plan({ ...BASE, earliest: parseLocal("2027-02-22T00:00") });
  assert.ok(list.length > 5);
  for (const j of list) {
    for (let i = 1; i < j.legs.length; i++) {
      const a = j.legs[i - 1],
        b = j.legs[i];
      assert.notEqual(a.train.no, b.train.no, "no getting off and back on");
      assert.ok(b.dep - a.arr >= BASE.buffer * MIN + transferMinutes(a.to, b.from) * MIN, "buffer respected");
    }
  }
});

test("direct only means no changes", () => {
  const { list } = plan({ ...BASE, changes: 0, earliest: parseLocal("2027-02-20T00:00") });
  assert.ok(list.length > 0);
  assert.ok(list.every((j) => j.changes === 0));
});

test("an arrival window with no trains gives no routes", () => {
  const { list } = plan({
    ...BASE,
    earliest: parseLocal("2027-02-26T08:30"),
    deadline: parseLocal("2027-02-26T09:00"),
  });
  assert.deepEqual(list, []);
});

test("the return direction works: Bengaluru to Dumka", () => {
  const { list } = plan({
    ...BASE,
    from: "@BLR",
    to: "DUMK",
    radius: 0,
    earliest: parseLocal("2027-03-08T00:00"),
    deadline: parseLocal("2027-03-10T23:00"),
  });
  assert.ok(list.some((j) => trainNos(j).at(-1) === "22309" || trainNos(j).at(-1) === "13015"));
});

test("a station with no trains is reached by road to the nearest one", () => {
  const { list } = plan({ ...BASE, from: "LKR", radius: 30, earliest: parseLocal("2027-02-23T00:00") });
  assert.ok(list.some((j) => j.roadKm > 0 && j.legs[0].from === "KIUL"));
});

// ---------- station search ----------

test("station search tolerates spelling", () => {
  for (const q of ["luckeesarai", "lakhisarai", "LKR", "lakhisarai jn"])
    assert.equal(searchStations(q)[0].code, "LKR", q);
  assert.equal(searchStations("hwh")[0].code, "HWH");
  assert.equal(searchStations("jasidh")[0].code, "JSME");
});

test("city aliases come first", () => {
  assert.equal(searchStations("bangalore")[0].value, "@BLR");
  assert.equal(searchStations("calcutta")[0].value, "@CCU");
});

test("resolve accepts labels, codes and loose text", () => {
  assert.equal(resolve("Howrah Jn (HWH)"), "HWH");
  assert.equal(resolve("Bengaluru, any station"), "@BLR");
  assert.equal(resolve("kiul"), "KIUL");
  assert.equal(resolve(""), null);
});

test("labels and meta describe coverage", () => {
  assert.equal(labelOf("HWH"), "Howrah Jn (HWH)");
  assert.match(describeCoverage(searchStations("LKR")[0]), /No trains here · nearest Kiul Jn/);
  assert.match(describeCoverage(searchStations("HWH")[0]), /\d+ trains/);
});

// ---------- ranking ----------

test("rankJourneys orders by the chosen sort without changing the input", () => {
  const { list } = plan({ ...BASE, earliest: parseLocal("2027-02-22T00:00") });
  const before = list.map((j) => j.key);
  const leave = rankJourneys(list, "leave", BASE.deadline, 3);
  for (let i = 1; i < leave.length; i++) assert.ok(leave[i - 1].start >= leave[i].start);
  const fewest = rankJourneys(list, "changes", BASE.deadline, 3);
  for (let i = 1; i < fewest.length; i++) assert.ok(fewest[i - 1].changes <= fewest[i].changes);
  assert.deepEqual(
    list.map((j) => j.key),
    before,
    "input order untouched",
  );
});

test("recommended order pushes routes inside the safe margin down", () => {
  const roomy = { start: 0, arrive: 10, changes: 0, roadKm: 0, lastKm: 0 };
  const tight = { ...roomy };
  const deadline = 10 + 3.5 * 3_600_000; // roomy arrives 3.5 h early
  const tightAtDeadline = { ...tight, arrive: deadline - 1, start: deadline - 11 }; // same 10 ms trip, lands 1 ms early
  const [first] = rankJourneys([tightAtDeadline, roomy], "rec", deadline, 3);
  assert.equal(first, roomy);
});

test("countByChanges and filterByChanges agree", () => {
  const js = [{ changes: 0 }, { changes: 1 }, { changes: 1 }, { changes: 2 }];
  assert.deepEqual(countByChanges(js), [1, 2, 1]);
  assert.equal(filterByChanges(js, "all").length, 4);
  assert.equal(filterByChanges(js, "1").length, 2);
});
