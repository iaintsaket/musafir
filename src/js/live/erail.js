// Reading erail.in's trains-between-stations answer. erail allows any web page to read it (CORS: *).
// The endpoint is unofficial: everything taken from it is validated here and treated as untrusted text later.

const STATION_CODE = /^[A-Z0-9]{1,6}$/;
const TRAIN_NO = /^\d{4,5}[A-Z]?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLASS_LIST = /^([0-9A-Z]{2}:[^|]*\|)+$/;

export const isStationCode = (s) => STATION_CODE.test(s);

/** URL for trains between two station codes. */
export const erailUrl = (from, to) =>
  "https://erail.in/rail/getTrains.aspx" +
  `?Station_From=${encodeURIComponent(from)}&Station_To=${encodeURIComponent(to)}&DataSource=0&Language=0&Cache=true`;

/** erail weekday flags are Mon..Sun ("0010000" = Wednesday); return Sun-first weekday numbers. */
export const erDays = (s) => [...(s || "")].flatMap((ch, i) => (ch === "1" ? [(i + 1) % 7] : []));

/** "07.11" or "07:11" -> minutes after midnight; anything else -> null. */
export function erHm(s) {
  const m = /^(\d{1,2})[.:](\d{2})$/.exec(s || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Parse erail's "^"-separated train records ("~"-separated fields).
 * Records whose train number, station codes or times don't look right are dropped.
 */
export function parseErail(body) {
  return body
    .split("^")
    .slice(1)
    .map((record) => {
      const f = record.split("~");
      const sourceAt = f.indexOf("DATASOURCE_IR");
      const classes = f.find((x) => CLASS_LIST.test(x)) || "";
      const date = (s) => (ISO_DATE.test(s || "") ? s : "");
      return {
        no: f[0],
        name: f[1] || f[0],
        from: f[7],
        fromName: f[6] || f[7],
        to: f[9],
        toName: f[8] || f[9],
        dep: erHm(f[10]),
        dur: erHm(f[12]),
        daysAtFrom: erDays(f[13]),
        validFrom: sourceAt > 0 ? date(f[sourceAt + 1]) : "",
        validTo: sourceAt > 0 ? date(f[sourceAt + 2]) : "",
        classes: [...classes.matchAll(/(?:^|\|)([0-9A-Z]{2}):/g)].map((m) => m[1]),
      };
    })
    .filter(
      (t) => TRAIN_NO.test(t.no) && isStationCode(t.from) && isStationCode(t.to) && t.dep != null && t.dur != null,
    );
}
