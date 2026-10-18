// Musafir entry point: connects the form, the search, live data and the results.
//
// Flow: the user edits the form (D) -> presses Search -> D is copied to S -> render() plans routes for S,
// draws them, and starts a live-data fetch; when live data arrives, render() runs again with more trains.

import { S, D, save, dirty, view, PAGE_SIZE } from "./ui/state.js";
import { setupAC } from "./ui/autocomplete.js";
import { fillForm, showSliderValues, showPending, bindForm } from "./ui/form.js";
import { renderLiveStatus, renderNotes, renderSummary, renderChangeFilters, renderTrainList } from "./ui/status.js";
import { renderChart, renderTickets, onShowMore } from "./ui/results.js";
import { scheduleSuggestions, onSuggestionApply } from "./ui/suggestions.js";
import { nowIST } from "./lib/time.js";
import { codesOf } from "./core/network.js";
import { buildQuery } from "./core/query.js";
import { plan } from "./core/planner.js";
import { rankJourneys, countByChanges, filterByChanges } from "./core/ranking.js";
import { LIVE, runLive, detectLive, onLiveChange } from "./live/live.js";

const MAX_CHART_ROWS = 15;
const LIVE_FETCH_DELAY_MS = 50;

let liveTimer = null;
/** Bumped whenever the set of trains changes, so suggestions know to recompute. */
let networkVersion = 0;

/** A form field changed: remember it and flag that results are out of date, but don't search yet. */
function onFormChange() {
  showSliderValues();
  save();
  showPending(dirty());
}

function search() {
  Object.assign(S, D);
  view.showN = PAGE_SIZE;
  onFormChange();
  render();
}

function render() {
  if (LIVE.mode === "direct" || LIVE.mode === "server") {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => runLive(S), LIVE_FETCH_DELAY_MS);
  }
  renderLiveStatus(LIVE);

  const { q, fallbacks, radius, earliest, deadline } = buildQuery(S);
  renderNotes(fallbacks);
  const sameStation = codesOf(S.from).some((c) => codesOf(S.to).includes(c));
  const result = sameStation ? { list: [], board: new Map(), truncated: false } : plan(q);
  scheduleSuggestions(result.list, sameStation, `${LIVE.key}|${networkVersion}`, Boolean(LIVE.key));

  const all = rankJourneys(result.list, S.sort, deadline, S.safe);
  const shown = filterByChanges(all, S.chg);
  renderChangeFilters(countByChanges(all), all.length, S.chg, (filter) => {
    S.chg = D.chg = filter;
    view.showN = PAGE_SIZE;
    save();
    render();
  });
  const nearbyCount = [...result.board.values()].filter((km) => km > 0).length;
  renderSummary({
    settings: S,
    all,
    sameStation,
    earliest,
    deadline,
    radius,
    nearbyCount,
    truncated: result.truncated,
    now: nowIST(),
  });
  renderChart(shown.slice(0, Math.min(view.showN, MAX_CHART_ROWS)), earliest, deadline);
  renderTickets(shown, deadline);
}

// ---- start up ----
fillForm();
renderTrainList();
setupAC("from", "from", { onChange: onFormChange, onSubmit: search });
setupAC("to", "to", { onChange: onFormChange, onSubmit: search });
bindForm({
  onChange: onFormChange,
  onSearch: search,
  onSort: (sort) => {
    S.sort = D.sort = sort;
    save();
    render();
  },
});
onLiveChange((done) => {
  renderLiveStatus(LIVE);
  if (done) {
    networkVersion++;
    render();
  }
});
onShowMore(render);
onSuggestionApply((patch) => {
  Object.assign(D, patch);
  fillForm();
  search();
});
render();
detectLive();
