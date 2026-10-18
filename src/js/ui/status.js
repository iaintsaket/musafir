// Status lines in the header: live-data state, road fallbacks, the search summary, the change
// filters and the built-in train list. All data is escaped here, where the HTML is built.

import { $ } from "./dom.js";
import { WD, H, fFull } from "../lib/time.js";
import { esc } from "../lib/text.js";
import { STATIC_TRAINS, nameOf } from "../core/network.js";
import { labelOf, plainName } from "../core/station-search.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The live-data line and the Search button's busy state. */
export function renderLiveStatus(live) {
  const go = $("go");
  go.disabled = Boolean(live.busy);
  go.textContent = live.busy ? "Searching…" : "Search trains";
  const builtIn = STATIC_TRAINS.length;
  const line = (dot, html) => `<span class="dot ${dot}"></span><span>${html}</span>`;
  let html;
  if (live.mode === null) {
    html = line("busy", "Checking for live train data…");
  } else if (live.mode === "off") {
    html = line(
      "",
      `Couldn't reach erail.in for live data (offline, blocked here, or the site changed), so this uses the ${builtIn} built-in trains.`,
    );
  } else if (live.busy) {
    html = line("busy", `Fetching live trains from erail.in… ${live.done}/${live.total}`);
  } else if (live.key) {
    const failed = live.fail ? ` · ${plural(live.fail, "lookup")} failed; press Search to retry` : "";
    html = line(
      live.fail ? "err" : "on",
      `<b>Live</b> · ${live.trains} trains from erail.in for this search, plus ${builtIn} built-in${failed}`,
    );
  } else {
    html = line("busy", "Connecting to live data…");
  }
  $("live").innerHTML = html;
}

/** Explain a start or destination that has no trains, and the road trip the search uses instead. */
export function renderNotes(fallbacks) {
  const notes = fallbacks.map(({ role, place, nearest, widened }) => {
    const list = nearest.map(([code, km]) => `${esc(nameOf(code))} (${esc(code)}) ${km} km`).join(", ");
    const road = widened
      ? ` The search ${role === "from" ? "starts" : "ends"} your trip by road from ${esc(nameOf(nearest[0][0]))}.`
      : "";
    return `No train in this planner stops at <b>${esc(plainName(place))}</b>. Nearest stations that have one: ${list}.${road}`;
  });
  $("notice").innerHTML = notes.join("<br>");
  $("notice").hidden = !notes.length;
}

/** One-sentence summary of the results, plus warnings about the window or a cut-short search. */
export function renderSummary({ settings, all, sameStation, earliest, deadline, radius, nearbyCount, truncated, now }) {
  const from = `<b>${esc(labelOf(settings.from))}</b>`;
  const to = `<b>${esc(labelOf(settings.to))}</b>`;
  const windowText = `between <b>${fFull(earliest)}</b> and <b>${fFull(deadline)}</b>`;
  let html;
  if (sameStation) {
    html = "Pick a destination different from your start.";
  } else if (!all.length) {
    html = `No route from ${from} reaches ${to} ${windowText}. Try widening the window, allowing more changes, a shorter connection buffer, or a bigger radius.`;
  } else {
    const safe = all.filter((j) => deadline - j.arrive >= settings.safe * H).length;
    const boarding = nearbyCount ? ` or ${plural(nearbyCount, "station")} within ${radius} km` : "";
    html = `<b>${all.length}</b> route${all.length === 1 ? "" : "s"} from ${from} reach ${to} ${windowText}. ${safe} leave at least ${settings.safe} h of margin. Boarding at your start${boarding}.`;
  }
  if (deadline < now) html += " <b>This window is in the past.</b>";
  if (truncated)
    html += " <b>The search was cut short, so some routes may be missing.</b> Narrow the window or radius.";
  $("summary").innerHTML = html;
}

/** The "All / Direct / 1 change / 2 changes" filter chips. */
export function renderChangeFilters(counts, total, active, onPick) {
  const chips = [
    ["all", `All (${total})`],
    ["0", `Direct (${counts[0]})`],
    ["1", `1 change (${counts[1]})`],
    ["2", `2 changes (${counts[2]})`],
  ];
  const box = $("filters");
  box.innerHTML = chips
    .map(
      ([v, label]) =>
        `<button type="button" id="chg-${v}" data-v="${v}" aria-pressed="${active === v}">${label}</button>`,
    )
    .join("");
  box.querySelectorAll("button").forEach((b) => (b.onclick = () => onPick(b.dataset.v)));
}

const runsOn = (train) =>
  train.days.size === 7
    ? "Daily"
    : [...train.days]
        .sort()
        .map((d) => WD[d])
        .join(", ");

/** The table of built-in trains. */
export function renderTrainList() {
  $("trainCount").textContent = STATIC_TRAINS.length;
  $("trainList").innerHTML = STATIC_TRAINS.map((t) => {
    const route = `${nameOf(t.stops[0].code)} → ${nameOf(t.stops.at(-1).code)}`;
    return `<tr><td><b class="mono">${esc(t.no)}</b> ${esc(t.name)}</td><td>${esc(route)}</td><td>${runsOn(t)}</td><td>${esc(t.classes.join(" "))}</td></tr>`;
  }).join("");
}
