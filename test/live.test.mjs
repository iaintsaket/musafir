import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLocal } from "../src/js/lib/time.js";
import { erDays, erHm, erailUrl, parseErail } from "../src/js/live/erail.js";
import { LIVE, livePlan, runLive, onLiveChange, toSegment } from "../src/js/live/live.js";
import { TRAINS, setLiveSegments, hasTrains } from "../src/js/core/network.js";
import { plan } from "../src/js/core/planner.js";

const FIXTURE = readFileSync(new URL("./fixtures/erail-kiul-hwh.txt", import.meta.url), "utf8");
const SETTINGS = { from: "KIUL", to: "HWH", radius: 20, destRadius: 0, changes: 1 };

after(() => setLiveSegments([]));

// ---------- erail parsing ----------

test("erDays turns erail's Mon..Sun flags into Sun-first weekday numbers", () => {
  assert.deepEqual(erDays("0010000"), [3]); // Wednesday
  assert.deepEqual(erDays("1111110"), [1, 2, 3, 4, 5, 6]); // every day but Sunday
  assert.deepEqual(erDays(""), []);
});

test("erHm reads erail's hh.mm times", () => {
  assert.equal(erHm("07.11"), 431);
  assert.equal(erHm("23:59"), 1439);
  assert.equal(erHm("First"), null);
});

test("erailUrl builds the trains-between-stations request", () => {
  assert.match(
    erailUrl("KIUL", "HWH"),
    /^https:\/\/erail\.in\/rail\/getTrains\.aspx\?Station_From=KIUL&Station_To=HWH&/,
  );
});

test("parseErail reads trains, days, classes and validity", () => {
  const trains = parseErail(FIXTURE);
  assert.equal(trains.length, 3);
  const js = trains.find((t) => t.no === "12024");
  assert.equal(js.from, "LKR");
  assert.equal(js.to, "HWH");
  assert.equal(js.dep, 7 * 60 + 11);
  assert.equal(js.dur, 6 * 60 + 14);
  assert.deepEqual(js.daysAtFrom, [1, 2, 3, 4, 5, 6]);
  assert.ok(js.classes.includes("CC"));
  const special = trains.find((t) => t.no === "05032");
  assert.equal(special.validTo, "2026-04-27");
});

test("parseErail ignores an empty answer", () => {
  assert.deepEqual(parseErail(""), []);
  assert.deepEqual(parseErail("~~~~~~~^"), []);
});

// ---------- live fetching ----------

test("livePlan asks about start, nearby junctions and junctions on the way, without self-pairs", () => {
  const pairs = livePlan({ from: "DUMK", to: "@BLR", radius: 100, destRadius: 0, changes: 2 });
  assert.ok(pairs.includes("DUMK>SBC"));
  assert.ok(pairs.length > 5 && pairs.length <= 48);
  assert.ok(pairs.every((p) => p.split(">")[0] !== p.split(">")[1]));
  const direct = livePlan({ ...SETTINGS, changes: 0 });
  assert.ok(
    direct.every((p) => p.endsWith(">HWH")),
    "direct only asks start/nearby to destination",
  );
});

test("toSegment builds a two-stop train with a day of slack on its dates", () => {
  const [js] = parseErail(FIXTURE).filter((t) => t.no === "12024");
  const seg = toSegment(js);
  assert.equal(seg.name, "Janshatabdi Exp");
  assert.deepEqual(seg.stops, [
    { code: "LKR", arr: null, dep: 431 },
    { code: "HWH", arr: 431 + 374, dep: null },
  ]);
  assert.equal(seg.validFrom, Date.parse(`${js.validFrom}T00:00:00Z`) - 3 * 86_400_000);
});

test("runLive fetches pairs, adds segments, and drops specials outside their dates", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.match(String(url), /^https:\/\/erail\.in\//);
    return { ok: true, text: async () => FIXTURE };
  };
  let done = false;
  onLiveChange((d) => (done = done || d));
  try {
    LIVE.mode = "direct";
    await runLive(SETTINGS);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(calls > 0 && done);
  assert.ok(LIVE.trains >= 3);
  assert.ok(TRAINS.some((t) => t.live && t.no === "12024"));
  assert.ok(hasTrains("LKR"), "Lakhisarai now has a live train");

  const { list } = plan({
    from: "KIUL",
    to: "HWH",
    earliest: parseLocal("2027-02-24T00:00"),
    deadline: parseLocal("2027-02-24T23:59"),
    radius: 20,
    destRadius: 0,
    speed: 40,
    buffer: 60,
    maxWait: 16,
    changes: 1,
    classes: ["2A", "3A"],
    shortOk: true,
  });
  const nos = list.map((j) => j.legs.map((l) => l.train.no).join("+"));
  assert.ok(nos.includes("12024"), "Jan Shatabdi from Lakhisarai, 1 km by road");
  assert.ok(!nos.includes("05032"), "the April 2026 special is not offered for February 2027");
});
