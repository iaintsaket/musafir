// Suggestions box: runs the suggestion engine in small slices (so the page stays responsive) and draws it.

import { $ } from "./dom.js";
import { S, SEARCH_KEYS } from "./state.js";
import { fFull } from "../lib/time.js";
import { esc } from "../lib/text.js";
import { buildQuery } from "../core/query.js";
import { plan } from "../core/planner.js";
import { mainLeg, trainNumbers } from "../core/journey.js";
import { loosenings, scoreLoosening, rankLoosenings, FILTER_NAMES } from "../core/suggest.js";

/** Work at most this long per slice before yielding to the browser. */
const SLICE_MS = 40;

let applyPatch = () => {};
/** Register what "Apply" does with a suggestion's settings patch. */
export function onSuggestionApply(fn) {
  applyPatch = fn;
}

let currentRun = "";
let timer = null;

/**
 * Work out suggestions for the current results, unless they are already shown for the same
 * settings and network. `runId` should change whenever the trains available change.
 */
export function scheduleSuggestions(baseList, sameStation, runId, hasLiveData) {
  const key = JSON.stringify(SEARCH_KEYS.map((k) => S[k])) + "|" + runId;
  if (key === currentRun) return;
  currentRun = key;
  clearTimeout(timer);
  const box = $("suggest");
  box.hidden = sameStation;
  if (sameStation) return;
  box.innerHTML = header("Checking what you'd gain by loosening each filter…");

  const settings = { ...S };
  const pending = loosenings(settings, buildQuery(settings));
  const results = [];
  const step = () => {
    if (key !== currentRun) return; // a newer search started
    const sliceStart = performance.now();
    while (pending.length && performance.now() - sliceStart < SLICE_MS) {
      const loosening = pending.shift();
      const candidates = plan(buildQuery({ ...settings, ...loosening.patch }).q).list;
      results.push(scoreLoosening(loosening, baseList, candidates));
    }
    if (pending.length) timer = setTimeout(step, 0);
    else renderSuggestions(rankLoosenings(results), baseList.length, hasLiveData);
  };
  timer = setTimeout(step, 60);
}

const header = (subtitle) =>
  `<div class="sg-head"><h3>Suggestions</h3><span class="sg-sub">${esc(subtitle)}</span></div>`;

const routes = (n) => `${n} route${n === 1 ? "" : "s"}`;

function exampleHtml(j) {
  return (
    `<b class="mono">${esc(trainNumbers(j).join(" + "))}</b> ${esc(mainLeg(j).train.name)}` +
    ` · leave ${fFull(j.start)} · arrive ${fFull(j.arrive)}`
  );
}

function renderSuggestions({ picks, limiter }, baseCount, hasLiveData) {
  const box = $("suggest");
  const intro = baseCount ? `You have ${routes(baseCount)}.` : "No routes match right now.";
  let html = header(`${intro} Here's what loosening one filter would add.`);
  if (limiter) {
    const how = limiter.label.charAt(0).toLowerCase() + limiter.label.slice(1);
    html += `<p class="sg-limit">The filter cutting the most options is <b>${esc(FILTER_NAMES[limiter.group])}</b>: loosening it (${esc(how)}) adds <b>${routes(limiter.gain)}</b>.</p>`;
  }
  html += picks.length
    ? picks
        .map(
          (p, k) =>
            `<div class="sg-item"><div class="sg-text"><p><span class="sg-gain">+${routes(p.gain)}</span> ${esc(p.label)}</p>` +
            p.examples.map((j) => `<p class="sg-eg">${exampleHtml(j)}</p>`).join("") +
            `</div><button class="btn" type="button" data-sg="${k}">Apply</button></div>`,
        )
        .join("")
    : `<p class="sg-none">Loosening any single filter adds no new routes${hasLiveData ? " among the trains already fetched" : ""}. Try a different date or destination.</p>`;
  if (hasLiveData) {
    html += `<p class="sg-note">Counts use the trains already fetched for this search. Applying a suggestion fetches fresh live data, which can find more.</p>`;
  }
  box.innerHTML = html;
  box.querySelectorAll("[data-sg]").forEach((b) => (b.onclick = () => applyPatch(picks[Number(b.dataset.sg)].patch)));
}
