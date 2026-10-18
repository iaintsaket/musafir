import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY, H, MIN, parseLocal, floorDay, fDay, fTime, fFull, fDur, toLocal } from "../src/js/lib/time.js";
import { esc, norm, skel, phon, lev, titleCase } from "../src/js/lib/text.js";

test("parseLocal reads a datetime-local value as Indian wall-clock time", () => {
  const ms = parseLocal("2027-02-26T08:00");
  assert.equal(ms, Date.UTC(2027, 1, 26, 8, 0));
  assert.equal(fFull(ms), "Fri 26 Feb · 08:00");
});

test("toLocal is the inverse of parseLocal", () => {
  for (const s of ["2027-02-26T08:00", "2026-12-31T23:59", "2027-01-01T00:00"]) assert.equal(toLocal(parseLocal(s)), s);
});

test("floorDay drops the time of day", () => {
  assert.equal(floorDay(parseLocal("2027-02-26T17:45")), parseLocal("2027-02-26T00:00"));
});

test("fDay and fTime format weekday, date and time", () => {
  const ms = parseLocal("2027-02-24T18:03");
  assert.equal(fDay(ms), "Wed 24 Feb");
  assert.equal(fTime(ms), "18:03");
});

test("fDur formats durations with days, hours and minutes", () => {
  assert.equal(fDur(0), "0h");
  assert.equal(fDur(45 * MIN), "0h 45m");
  assert.equal(fDur(2 * H + 5 * MIN), "2h 05m");
  assert.equal(fDur(DAY + 13 * H + 41 * MIN), "1d 13h 41m");
});

test("esc escapes HTML special characters", () => {
  assert.equal(esc(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});

test("norm lowercases and drops punctuation and spaces", () => {
  assert.equal(norm("Howrah Jn."), "howrahjn");
});

test("skel maps common spellings of one station to the same skeleton", () => {
  assert.equal(skel("Luckeesarai"), "lksr");
  assert.equal(skel("Lakhisarai"), "lksr");
  assert.equal(skel("Luckeesarai Jn"), "lksr");
});

test("phon keeps vowels so close misspellings stay close", () => {
  assert.ok(lev(phon("lakhisarai"), phon("Luckeesarai Jn")) < lev(phon("lakhisarai"), phon("Laksar Jn")));
});

test("lev is the edit distance", () => {
  assert.equal(lev("kitten", "sitting"), 3);
  assert.equal(lev("same", "same"), 0);
});

test("titleCase capitalises each word", () => {
  assert.equal(titleCase("ANGA EXPRESS"), "Anga Express");
});
