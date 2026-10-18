// Date and time helpers. Times are kept in UTC milliseconds that represent Indian wall-clock time,
// so the viewer's own timezone never shifts a timetable.

export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DAY = 864e5,
  MIN = 6e4,
  H = 36e5;
export const parseLocal = (str) => {
  const [d, t = "00:00"] = str.split("T");
  const [Y, M, D] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return Date.UTC(Y, M - 1, D, hh, mm);
};
export const floorDay = (ms) => Math.floor(ms / DAY) * DAY;
export const pad = (n) => String(n).padStart(2, "0");
export const fDay = (ms) => {
  const x = new Date(ms);
  return `${WD[x.getUTCDay()]} ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`;
};
export const fTime = (ms) => {
  const x = new Date(ms);
  return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
};
export const fFull = (ms) => `${fDay(ms)} · ${fTime(ms)}`;
export const fDur = (ms) => {
  const m = Math.round(ms / MIN),
    d = Math.floor(m / 1440),
    h = Math.floor((m % 1440) / 60),
    mm = m % 60;
  return (d ? d + "d " : "") + h + "h" + (mm ? " " + pad(mm) + "m" : "");
};
export const toLocal = (ms) => {
  const x = new Date(ms);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
};

/** The current Indian wall-clock time, in the same UTC-millisecond encoding as every other time here. */
export const nowIST = (now = Date.now()) => now + 5.5 * 60 * 60 * 1000;
