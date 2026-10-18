---
name: architect-review
description: Run an independent, architect-level code review loop on this repository before committing. A fresh reviewer subagent with no knowledge of how the code was written reviews it from a third-person point of view; the author triages and fixes every finding; a new fresh reviewer then verifies the fixes and reviews again, until a round comes back with no blocking or major findings. Use when the user asks for a code review, a "fresh eyes" or architect review, a review loop, or before checking code into GitHub.
---

# Architect review loop

The goal is code that a senior architect would sign off on: clear structure, correct behaviour, honest tests, and a repository that's safe to publish. The reviewer must be independent. It knows nothing about the conversation, the author's intent or earlier drafts. It sees only the repository.

## Roles

- **Author (you, the main agent):** prepares the repo, launches reviewers, triages findings, makes the fixes, runs the checks, and decides when the loop is closed.
- **Reviewer (a subagent):** a new agent for every round, launched with the Agent tool (`subagent_type: "general-purpose"`). It reads the code and reports findings. It never edits files.

Never reuse a reviewer between rounds (no SendMessage follow-ups). A reviewer that has seen earlier rounds is no longer independent.

## Before round 1

1. Make sure the working tree is in the state you want reviewed, and that the project's own checks pass. Here that's `npm run check` (format, lint, unit tests, build, browser test). Don't spend a reviewer's attention on things a linter can catch.
2. Don't commit yet. The loop runs on the uncommitted working tree, and commits happen only after it closes.

## Launching a reviewer

Send the prompt below, filled in, as the reviewer's entire context. Don't add background about what you changed or why. If the reviewer needs that, the code or the README should be saying it.

```
You are a principal software architect doing an independent review of the repository at <ABSOLUTE PATH>.
You have no other context: judge only what is in the repository. Do not modify any files.

Read the README first, then every source file, test, script and config (skip generated data files
larger than 100 KB, but check how they are produced). Run the project's checks if a command exists
(for example `npm run check` or `npm test`) and report failures.

Review for:
1. Architecture: module boundaries, layering and dependency direction, cohesion, coupling, global state.
2. Correctness: logic errors, edge cases, time/date handling, error handling, race conditions.
3. Code quality: naming, readability, duplication, dead code, comments that explain why, consistency.
4. Tests: do they test behaviour, cover the risky logic, avoid flakiness and network dependence?
5. Security and privacy: secrets or credentials, personal data, injection (HTML/XSS, path traversal),
   unsafe network use.
6. Repository hygiene: .gitignore, build artefacts, reproducible build, CI, README accuracy, licensing notes.

Report findings as a numbered list. For each give:
  ID (R<round>-<n>), severity (blocker | major | minor | nit), file:line, the problem,
  why it matters, and a concrete fix.
Blocker = must fix before publishing (bugs, security, broken build). Major = a senior reviewer would
not approve without it. Minor = should fix. Nit = optional polish.
End with a verdict line: "VERDICT: APPROVE" (no blockers or majors) or "VERDICT: CHANGES REQUESTED".
<ROUND 2+ ONLY:>
A previous independent review raised the findings below, and the author responded as shown.
For each one, verify against the code whether it is resolved (RESOLVED / NOT RESOLVED / DECLINE ACCEPTED /
DECLINE REJECTED, with a reason), then do a full fresh review as above.
<previous findings with the author's resolution for each>
```

Run reviewers in the background and wait for the completion notification. Don't predict or invent their results.

## Triage (author)

For every finding, record one resolution:

- **Fixed:** what changed, with file:line.
- **Declined:** a concrete reason (for example "out of scope for this change" or "the trade-off is documented in the README"). Declining a blocker or major needs a strong reason, and you should mention it to the user.

Fix blockers and majors. Fix minors unless there's a reason not to. Take nits when they're cheap. After fixing, run the full checks again (`npm run check`), and add or adjust tests for any behaviour you changed.

## Closing the loop

Start a new reviewer for round N+1 with the round-N findings and resolutions included. The loop closes when **both** are true:

1. The reviewer verifies every previous blocker and major as RESOLVED or DECLINE ACCEPTED.
2. The new round reports no new blockers or majors (`VERDICT: APPROVE`).

Stop after 4 rounds even if it hasn't closed. Report the remaining findings to the user and ask how to proceed instead of looping forever.

## Afterwards

- Commit only after the loop closes and the checks pass. Use a clear message that says what the change does.
- Give the user a short summary: rounds run, findings by severity, what was fixed, what was declined and why, and the final verdict.
