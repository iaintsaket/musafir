// Station input with a spelling-tolerant suggestion list.

import { $ } from "./dom.js";
import { D } from "./state.js";
import { esc } from "../lib/text.js";
import { hasTrains } from "../core/network.js";
import { searchStations, labelOf, resolve, describeCoverage } from "../core/station-search.js";

export function setupAC(id, key, { onChange, onSubmit }) {
  const inp = $(id),
    list = $(id + "-list");
  let items = [],
    act = 0;
  const close = () => {
    list.hidden = true;
    inp.setAttribute("aria-expanded", "false");
    inp.removeAttribute("aria-activedescendant");
  };
  const choose = (o) => {
    D[key] = o.value;
    inp.value = labelOf(o.value);
    close();
    onChange();
  };
  const draw = () => {
    if (!inp.value.trim()) {
      close();
      return;
    }
    items = searchStations(inp.value);
    act = Math.min(act, Math.max(items.length - 1, 0));
    list.innerHTML = items.length
      ? items
          .map(
            (o, i) =>
              `<li role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${i === act}"><span><span class="nm">${esc(o.name)}</span>${o.code ? `<span class="cd">${esc(o.code)}</span>` : ""}</span><span class="meta ${o.isGroup || hasTrains(o.code) ? "has" : ""}">${esc(describeCoverage(o))}</span></li>`,
          )
          .join("")
      : `<li class="none">No station matches “${esc(inp.value)}”. Try its station code.</li>`;
    list.hidden = false;
    inp.setAttribute("aria-expanded", "true");
    if (items.length) inp.setAttribute("aria-activedescendant", `${id}-o${act}`);
    list.querySelectorAll("li[data-i]").forEach(
      (li) =>
        (li.onmousedown = (e) => {
          e.preventDefault();
          choose(items[+li.dataset.i]);
        }),
    );
  };
  inp.addEventListener("input", () => {
    act = 0;
    draw();
  });
  inp.addEventListener("focus", () => inp.select());
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) {
        draw();
        return;
      }
      if (!items.length) return;
      act = (act + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      draw();
      const el = $(`${id}-o${act}`);
      if (el) el.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (!list.hidden && items.length) choose(items[act]);
      else onSubmit();
    } else if (e.key === "Escape") {
      close();
      inp.value = labelOf(D[key]);
    }
  });
  inp.addEventListener("blur", () =>
    setTimeout(() => {
      if (!list.hidden) {
        const v = resolve(inp.value);
        close();
        if (v && v !== D[key]) {
          D[key] = v;
          onChange();
        }
      }
      inp.value = labelOf(D[key]);
    }, 120),
  );
}
