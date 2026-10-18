# Musafir: notes for Claude

- Run `npm run check` before calling any change done (format check, lint, unit tests, build, browser test).
- **Before every commit, run the `architect-review` skill** (`.claude/skills/architect-review/SKILL.md`): a fresh
  reviewer subagent reviews the uncommitted changes, every finding is fixed or declined with a reason, and new
  reviewers re-check until a round approves with no blockers or majors. Only then commit.
- Keep the layering in the README: `data` and `lib` → `core` → `live` → `ui` → `app.js`. Nothing below `ui`
  touches the DOM or builds HTML; renderers in `ui/` escape every piece of data with `esc()`.
- Modules use only the syntax `scripts/build.mjs` supports (named imports, `export` on declarations) and every
  top-level name must be unique across modules; the build fails otherwise.
- Tests must not hit the network: use `test/fixtures/` and the CDP request interception in the browser test.
