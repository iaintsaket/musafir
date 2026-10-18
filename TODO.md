# TODO

Work still open from architect review round 1. Remove items as they land.

## Tests to add
- [ ] Planner pruning rules on a synthetic network (`setLiveSegments` + `ensureStation` with made-up codes):
      no doubling back, no leaving a train that continues to the destination, no re-boarding the same train.
- [ ] `latestRun` validity edges (`validFrom` / `validTo`, running days).
- [ ] Step cap: `plan({ ...q, maxSteps: 10 })` returns `truncated: true`.
- [ ] `buildQuery` fallbacks (start/destination with no trains → nearest stations, widened radius).
- [ ] `loosenings` / `newRoutes` / `rankLoosenings` / `scoreLoosening` in `core/suggest.js`.
- [ ] Escaping: `journeySteps`, `journeyText`, `ticketHtml` with a train named `<img src=x onerror=alert(1)>"`.
- [ ] `sanitizeSettings`: null classes, bad dates, unknown station, out-of-range sliders.
- [ ] Build: `checkModuleSyntax` rejects each unsupported form; `checkUniqueTopLevelNames` catches duplicates.
- [ ] `parseErail` drops records with a bad train number, station code or date.
- [ ] Server: path traversal with a sibling-prefix path (e.g. `/dev/../src-evil/`) is refused.

## Hermetic browser test (review finding R1-2, major)
- [ ] `test/e2e/browser.e2e.mjs`: use CDP `Fetch.enable` on `https://erail.in/*`, answer from
      `test/fixtures/erail-kiul-hwh.txt`, poll for DOM conditions instead of fixed sleeps,
      and add a 60 s watchdog (`setTimeout(...).unref()`).
- [ ] Put `test:e2e` back into `npm run check` / CI once it's hermetic.

## Process
- [ ] Architect review round 2 (`.claude/skills/architect-review/SKILL.md`) with the R1 findings and
      resolutions; repeat until VERDICT: APPROVE with no blockers or majors (max 4 rounds).
- [ ] Optional: republish the claude.ai artifact and the local HTML copies from the new `dist/musafir.html`.
