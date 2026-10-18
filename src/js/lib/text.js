// Text helpers: HTML escaping and the spelling-tolerant matching used by station search.

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for use in HTML content or a quoted attribute. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/** Lowercase letters and digits only. */
export const norm = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");

/** Drop "Jn", "Junction", "Jct" so "Kiul Jn" matches "kiul". */
export const stripJn = (s) => s.replace(/\b(jn|junction|jct)\b\.?/gi, " ");

/** Collapse spellings that sound the same in Indian place names: ph/f, ck/c/q/k, w/v, y/i, ee/i, oo/u, silent h. */
function soundOut(s) {
  return norm(stripJn(s))
    .replace(/[0-9]/g, "")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/[cq]/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "j")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/h/g, "")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u");
}

/** Consonant skeleton, so Luckeesarai, Lakhisarai and Lakhisarai Jn all reduce to "lksr". */
export function skel(s) {
  const t = soundOut(s);
  if (!t) return "";
  const head = /[aeiou]/.test(t[0]) ? "a" : t[0];
  return (head + t.slice(1).replace(/[aeiou]/g, "")).replace(/(.)\1+/g, "$1");
}

/** Sound-alike spelling with vowels kept but merged (e/i, o/u), used to rank close misspellings. */
export const phon = (s) =>
  soundOut(s)
    .replace(/e/g, "i")
    .replace(/o/g, "u")
    .replace(/(.)\1+/g, "$1");

/** Levenshtein edit distance; returns a large value early when lengths differ a lot. */
export function lev(a, b) {
  if (Math.abs(a.length - b.length) > 4) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** "ANGA EXPRESS" -> "Anga Express". */
export const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
