// The search form: copy settings into the fields, show slider values, and report edits.

import { $ } from "./dom.js";
import { D } from "./state.js";
import { MIN, fDur } from "../lib/time.js";
import { labelOf } from "../core/station-search.js";
import { ALL_CLASSES as CLASSES } from "../core/journey.js";

const VALUE_FIELDS = ["earliest", "deadline", "radius", "destRadius", "speed", "buffer", "maxWait", "safe"];
const SLIDERS = ["radius", "destRadius", "speed", "buffer", "maxWait", "safe"];

/** Fill every field from the form state D. */
export function fillForm() {
  $("from").value = labelOf(D.from);
  $("to").value = labelOf(D.to);
  for (const id of VALUE_FIELDS) $(id).value = D[id];
  $("sortBy").value = D.sort;
  $("changes").value = D.changes;
  for (const c of CLASSES) $("c" + c).checked = D.classes.includes(c);
  $("shortOk").checked = D.shortOk;
  showSliderValues();
}

/** Update the value shown next to each slider. */
export function showSliderValues() {
  $("radiusOut").textContent = D.radius ? `${D.radius} km` : "start station only";
  $("destRadiusOut").textContent = D.destRadius ? `${D.destRadius} km` : "destination only";
  $("speedOut").textContent = `${D.speed} km/h`;
  $("bufferOut").textContent = D.buffer >= 60 ? fDur(D.buffer * MIN) : `${D.buffer} min`;
  $("maxWaitOut").textContent = `${D.maxWait} h`;
  $("safeOut").textContent = `${D.safe} h`;
}

/** Show whether the form differs from the settings the results were searched with. */
export function showPending(isDirty) {
  $("go").classList.toggle("dirty", isDirty);
  $("pending").innerHTML = isDirty
    ? "<b>Settings changed.</b> Press Search trains (or Enter) to update the results."
    : "";
}

/**
 * Wire the form fields. Edits update D and call onChange; Enter or the button call onSearch;
 * the sort menu calls onSort (it only reorders results, so it applies at once).
 */
export function bindForm({ onChange, onSearch, onSort }) {
  $("swap").onclick = () => {
    [D.from, D.to] = [D.to, D.from];
    fillForm();
    onChange();
  };
  for (const id of ["earliest", "deadline"]) {
    $(id).addEventListener("change", (e) => {
      if (!e.target.value) return;
      D[id] = e.target.value;
      onChange();
    });
  }
  for (const id of SLIDERS) {
    $(id).addEventListener("input", (e) => {
      D[id] = Number(e.target.value);
      onChange();
    });
  }
  $("changes").addEventListener("change", (e) => {
    D.changes = Number(e.target.value);
    onChange();
  });
  for (const c of CLASSES) {
    $("c" + c).addEventListener("change", () => {
      D.classes = CLASSES.filter((x) => $("c" + x).checked);
      onChange();
    });
  }
  $("shortOk").addEventListener("change", (e) => {
    D.shortOk = e.target.checked;
    onChange();
  });
  $("sortBy").addEventListener("change", (e) => onSort(e.target.value));
  $("go").onclick = onSearch;
  document.querySelector(".controls").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      onSearch();
    }
  });
}
