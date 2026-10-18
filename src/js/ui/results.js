// Drawing results: the journey chart and the route cards.
// journeySteps() describes a journey as plain text; every renderer escapes it when building HTML.

import { $ } from "./dom.js";
import { S, view, PAGE_SIZE } from "./state.js";
import { WD, DAY, MIN, H, floorDay, fDay, fTime, fFull, fDur } from "../lib/time.js";
import { esc } from "../lib/text.js";
import { nameOf, transferMinutes, codesOf } from "../core/network.js";
import { mainLeg, trainNumbers } from "../core/journey.js";
import { labelOf, plainName } from "../core/station-search.js";

const CHART_TAIL_MS = 12 * H;

let onMore = () => {};
/** Register what to do when "Show more" is pressed. */
export function onShowMore(fn) {
  onMore = fn;
}

/**
 * @typedef {object} Step  One row of a journey, in plain text.
 * @property {"road"|"wait"|"rail"} kind
 * @property {number} start, end   UTC ms, for the chart.
 * @property {string} title
 * @property {string} [detail]
 * @property {string} [trainNo]    Rail steps: shown in monospace before the title.
 * @property {boolean} [chartOnly] Drawn on the chart but not listed on the card.
 */

/**
 * Describe a journey step by step: road trip, trains, changes and cab transfers.
 * @returns {Step[]}
 */
export function journeySteps(j, settings = S) {
  const steps = [];
  const first = j.legs[0];
  if (j.roadKm) {
    steps.push({
      kind: "road",
      start: j.start,
      end: first.dep - settings.buffer * MIN,
      title: `${plainName(settings.from)} → ${nameOf(first.from)} by road`,
      detail: `Leave ${fFull(j.start)} · ≈ ${j.roadKm} km, about ${fDur(j.roadMin * MIN)}`,
    });
    steps.push({
      kind: "wait",
      start: first.dep - settings.buffer * MIN,
      end: first.dep,
      title: `Buffer at ${nameOf(first.from)}`,
      chartOnly: true,
    });
  }
  j.legs.forEach((leg, i) => {
    if (i > 0) {
      const prev = j.legs[i - 1];
      if (prev.to !== leg.from) {
        const cab = transferMinutes(prev.to, leg.from) * MIN;
        steps.push({
          kind: "road",
          start: prev.arr,
          end: prev.arr + cab,
          title: `Cab ${nameOf(prev.to)} → ${nameOf(leg.from)}`,
          detail: `About ${cab / MIN} min`,
        });
        steps.push({
          kind: "wait",
          start: prev.arr + cab,
          end: leg.dep,
          title: `Wait ${fDur(leg.dep - prev.arr - cab)} at ${nameOf(leg.from)}`,
        });
      } else {
        steps.push({
          kind: "wait",
          start: prev.arr,
          end: leg.dep,
          title: `Change at ${nameOf(leg.from)} · wait ${fDur(leg.dep - prev.arr)}`,
        });
      }
    }
    const t = leg.train;
    steps.push({
      kind: "rail",
      start: leg.dep,
      end: leg.arr,
      trainNo: t.no,
      title: t.name,
      detail:
        `${nameOf(leg.from)} ${fFull(leg.dep)} → ${nameOf(leg.to)} ${fFull(leg.arr)} · ${fDur(leg.arr - leg.dep)}` +
        (t.classes.length ? ` · ${t.classes.join(" ")}` : ""),
    });
  });
  if (j.lastKm) {
    const last = j.legs.at(-1);
    steps.push({
      kind: "road",
      start: last.arr,
      end: j.arrive,
      title: `${nameOf(last.to)} → ${plainName(settings.to)} by road`,
      detail: `≈ ${j.lastKm} km, about ${fDur(j.lastMin * MIN)} · arrive ${fFull(j.arrive)}`,
    });
  }
  return steps;
}

const stepTitleText = (s) => (s.trainNo ? `${s.trainNo} ${s.title}` : s.title);

/** The journey as plain text, for "Copy plan". */
export function journeyText(j, settings = S) {
  return [
    `${labelOf(settings.from)} → ${labelOf(settings.to)}`,
    ...journeySteps(j, settings)
      .filter((s) => !s.chartOnly)
      .map((s) => `• ${stepTitleText(s)}${s.detail ? " — " + s.detail : ""}`),
    `Leave ${fFull(j.start)} · arrive ${fFull(j.arrive)} · ${fDur(j.arrive - j.start)} door to door`,
  ].join("\n");
}

/** Chart: one row per journey on a shared time axis, with the arrival window shaded. */
export function renderChart(list, earliest, deadline) {
  const chart = $("chart");
  if (!list.length) {
    chart.innerHTML = '<div class="empty">No routes to chart. Change the settings above.</div>';
    return;
  }
  const t0 = floorDay(Math.min(...list.map((j) => j.start)));
  const t1 = deadline + CHART_TAIL_MS;
  const pos = (x) => `${(((x - t0) / (t1 - t0)) * 100).toFixed(3)}%`;
  const width = (ms) => `${((Math.max(ms, 0) / (t1 - t0)) * 100).toFixed(3)}%`;

  let ticks = "";
  let labels = "";
  for (let d = t0; d < t1; d += DAY) {
    ticks += `<div class="tick" style="left:${pos(d)}"></div>`;
    labels += `<span style="left:${pos(d)}">${fDay(d)}</span>`;
  }
  const rows = list.map((j, i) => {
    const segments = journeySteps(j)
      .map(
        (s) =>
          `<div class="seg ${s.kind}" style="left:${pos(s.start)};width:${width(s.end - s.start)}" title="${esc(stepTitleText(s))}"></div>`,
      )
      .join("");
    const label = esc((j.roadKm ? "Road + " : "") + trainNumbers(j).join(" + "));
    return `<div class="crow" data-id="${i}" tabindex="0" role="button" aria-label="Go to route ${i + 1}"><div class="lbl"><b>${i + 1}</b> · ${label}</div><div class="track">${ticks}${segments}</div></div>`;
  });
  const windowBand =
    earliest > t0 && earliest < deadline
      ? `<div class="window" style="left:${pos(earliest)};width:${width(deadline - earliest)}"></div>` +
        `<div class="deadline soft" style="left:${pos(earliest)}"></div><span class="lbl-l" style="left:${pos(earliest)}">${fTime(earliest)}</span>`
      : "";
  chart.innerHTML =
    `<div class="axis"><div></div><div class="axis-track">${labels}</div></div>` +
    rows.join("") +
    `<div class="deadline-wrap">${windowBand}<div class="deadline" style="left:${pos(deadline)}"></div>` +
    `<span class="lbl-r" style="left:${pos(deadline)}">${fDay(deadline).slice(0, 3)} ${fTime(deadline)}</span></div>`;

  chart.querySelectorAll(".crow").forEach((row) => {
    const id = row.dataset.id;
    const go = () => {
      const card = $(`t-${id}`);
      if (!card) return;
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      flash(id);
    };
    row.onclick = go;
    row.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    };
    row.onmouseenter = () => highlight(id, true);
    row.onmouseleave = () => highlight(id, false);
  });
}

function highlight(id, on) {
  document.querySelectorAll(`[data-id="${id}"]`).forEach((el) => el.classList.toggle("hl", on));
}
function flash(id) {
  highlight(id, true);
  setTimeout(() => highlight(id, false), 1600);
}

const runningDays = (train) =>
  [...train.days]
    .sort()
    .map((d) => WD[d])
    .join("·");

/** One route card as HTML. Every piece of data is escaped. */
export function ticketHtml(j, i, deadline, settings = S) {
  const margin = deadline - j.arrive;
  const tight = margin < settings.safe * H;
  const main = mainLeg(j);
  const chips = [];
  if (i === 0 && settings.sort === "rec") chips.push(["acc", "Top pick"]);
  chips.push(tight ? ["warn", `Only ${fDur(margin)} margin`] : ["ok", `${fDur(margin)} margin`]);
  chips.push(["", j.changes === 0 ? "Direct" : `${j.changes} change${j.changes > 1 ? "s" : ""}`]);
  if (j.roadKm) chips.push(["", `${j.roadKm} km by road first`]);
  const weekly = j.legs.map((l) => l.train).filter((t) => t.days.size < 7);
  if (weekly.length) chips.push(["", weekly.map((t) => `${t.no}: ${runningDays(t)}`).join(" | ")]);

  const steps = journeySteps(j, settings)
    .filter((s) => !s.chartOnly)
    .map((s) => {
      const title = s.trainNo ? `<span class="mono">${esc(s.trainNo)}</span> ${esc(s.title)}` : esc(s.title);
      const detail = s.detail ? `<div class="when">${esc(s.detail)}</div>` : "";
      return `<div class="leg ${s.kind}"><div class="what">${title}</div>${detail}</div>`;
    })
    .join("");
  const boardedAway = !codesOf(settings.from).includes(main.from);
  const title = main.train.name + (boardedAway ? ` from ${nameOf(main.from)}` : "");
  const arriveAt = j.lastKm ? plainName(settings.to) : nameOf(j.legs.at(-1).to);
  return `
    <article class="ticket" id="t-${i}" data-id="${i}">
      <div class="stub"><span class="rank">${i + 1}</span><small>${esc(nameOf(j.legs[0].from))}</small></div>
      <div class="tbody">
        <div class="thead">
          <div><h3>${esc(title)}</h3><div class="sub"><span class="mono">${esc((j.roadKm ? "Road + " : "") + trainNumbers(j).join(" + "))}</span></div></div>
          <div class="chips">${chips.map(([cls, text]) => `<span class="chip ${cls}">${esc(text)}</span>`).join("")}</div>
        </div>
        <div class="legs">${steps}</div>
        <div class="stats">
          <div class="stat"><span class="eyebrow">Leave</span><b>${fFull(j.start)}</b></div>
          <div class="stat"><span class="eyebrow">Arrive ${esc(arriveAt)}</span><b>${fFull(j.arrive)}</b></div>
          <div class="stat"><span class="eyebrow">Door to door</span><b>${fDur(j.arrive - j.start)}</b></div>
          <div class="stat"><span class="eyebrow">Margin</span><b class="${tight ? "warn" : "ok"}">${fDur(margin)}</b></div>
        </div>
        <div class="actions"><button class="btn" type="button" data-copy="${i}">Copy plan</button><span class="copied" id="cp-${i}" aria-live="polite"></span></div>
      </div>
    </article>`;
}

/** Route cards, a page at a time. */
export function renderTickets(list, deadline) {
  const wrap = $("routes");
  if (!list.length) {
    wrap.innerHTML =
      '<div class="empty">No routes match. Try a wider arrival window, more changes, a shorter connection buffer, a bigger radius, or another class.</div>';
    return;
  }
  const remaining = list.length - view.showN;
  wrap.innerHTML =
    list
      .slice(0, view.showN)
      .map((j, i) => ticketHtml(j, i, deadline))
      .join("") +
    (remaining > 0
      ? `<button class="btn more" id="more" type="button">Show ${Math.min(PAGE_SIZE, remaining)} more of ${remaining}</button>`
      : "");

  const more = $("more");
  if (more) {
    more.onclick = () => {
      view.showN += PAGE_SIZE;
      onMore();
    };
  }
  wrap.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.onclick = () => {
      const message = $(`cp-${btn.dataset.copy}`);
      navigator.clipboard
        .writeText(journeyText(list[Number(btn.dataset.copy)]))
        .then(() => {
          message.textContent = "Copied";
          setTimeout(() => (message.textContent = ""), 1800);
        })
        .catch(() => (message.textContent = "Copy didn't work here. Select the text above instead."));
    };
  });
}
