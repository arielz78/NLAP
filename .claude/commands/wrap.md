---
description: End-of-session wrap — append the journal + changelog, run the conditional-homes update checklist (Decision_Log, source sheet, metrics log, issues) FOR the user, and commit
---

Wrap up this session. Follow these steps in order:

0. **Resolve the session boundary.** Use the `SESSION_BASE_COMMIT` emitted by
   `/start` as the start of the review range; this includes any intermediate
   commits made during the session. If it is unavailable, identify the parent of
   the session's earliest commit from the conversation/log and state the
   assumption. Use the current pre-wrap `HEAD` only when all session work is still
   uncommitted. Wrap is bookkeeping, not a new investigation phase: do not start
   audits, redesigns, historical studies, or new issue work while wrapping. If
   the session surfaced an unresolved interpretation, preserve it as a hypothesis
   — do not settle it.

1. **Get the current local time first** — run via the Bash tool:
   `powershell -Command "Get-Date -Format 'yyyy-MM-dd h:mm tt'"`
   Do this BEFORE writing the entry, not after.

2. **Append a new entry to `Execution_Log.md`.** Rules:
   - New entries go at the **bottom** of the file, **above** the final `---`
     (entries are ordered oldest-first).
   - Include the date and the local time to the minute from step 1.
   - Cover: what was run, what broke, what was fixed, decisions made, and
     next steps.
   - **Decision pointer discipline:** if a decision was made, name it in one
     line and point (`Decision: X — see Decision_Log §N`). Do NOT re-articulate
     the rationale here — that's the Decision_Log's job (one home, journal points).
   - Match the formatting of the existing recent entries in the file — read
     the last entry first and mirror its structure.

3. **Carry-forward gate — close the loop on last session's "Next."**
   Before writing this session's next-steps, read the **previous** Execution_Log
   entry's "Next" list. For each item, mark exactly one:
   - **Done** this session → reflect it in the entry, drop it.
   - **Still open** → it must have a GitHub issue. If it doesn't, propose
     opening one now. Do NOT re-copy the prose forward untracked — that's the
     exact silent-rot failure this gate exists to stop.
   - **Dropped** → say so in one line, with why.
   Rule: no item may carry forward as untracked "Next" prose two sessions
   running. New open work created this session follows the same rule —
   trackable work becomes an issue; the log's "Next" names only the immediate
   next action, not a backlog.

4. **Run the conditional-homes checklist FOR the user — do not make them scan.**
   Review what actually happened this session and, for each maintained home
   below, either *propose* the update or report "no change → skip." Present it
   as a short checklist the user confirms with yes/no. The agent does the
   scanning; the user just reacts. (Index of homes: `docs/README.md`.)
   - **Decision_Log** (`docs/Decision_Log.md`) — new architectural/editorial
     decision? If yes → draft the entry in house format (the "why," not the
     "what"). Routine runs / bug fixes → skip, don't pad.
   - **Source sheet** (`docs/source_decision_sheet.md`) — did any source's
     method / status / field-inventory / verdict change? If yes → propose the
     Source Register row + section edit. If no → skip.
   - **Metrics log** (`NA/Vaughan_Metrics_Log.md`) — did a measurable metric
     move (pool size, runtime, CTOR, cost, NeedsReview)? If yes → propose the
     number update (this is the number's one home; narrative docs render from
     it later — never author the number elsewhere). If no → skip.
   - **GitHub issues** (`arielz78/NLAP`) — any issue to open (new debt/spike)
     or close (resolved this session)? Propose; don't auto-file. **Every issue
     opened gets a release milestone at creation** (the milestone, not just the
     `r{N}` label, is the accounting unit for the release sign-off-completeness
     gate — see R5_Scope). Scale-gated/optional spikes go to their real future
     release or stay backlog — never the active milestone, or it can't reach 100%.
   - **Repo folder layout** (root `README.md`) — was a top-level folder added,
     removed, or renamed this session? If yes → propose the layout-table edit
     (and flag any `scripts/` path literals that need fixing). If no → skip.
   - **Learning Mode split** (`CLAUDE.md`) — one trigger only: did the *rule itself*
     change this session — a standing authorship override, or a class of decision
     moving sides? If yes → propose the edit. **Do NOT refresh it for a release
     close, an architecture move, or "what we're working on now"** — the split is
     stated by decision type and is release-agnostic on purpose. A dated
     "current step" line used to live there, accreted status, and drifted two
     sessions stale; that's why the file now says nothing release-specific,
     dated, or status-bearing belongs in it. Release status → Scope snapshot.
     If the rule didn't change → skip.
   - Whatever changed goes to its one home only — never duplicate across homes.

5. Show me every drafted entry before/after writing so I can eyeball it.

6. **Append a public summary to `CHANGELOG.md`.** Always do this, every session.
   - Add a new dated entry at the **top** (newest first), under the header.
   - 2–3 lines max. Written for a public reader (recruiter / potential client):
     concise, clean, describes what the session accomplished. NO candid internal
     detail, NO client-confidential numbers — that stays in the private
     `Execution_Log.md`. This is the distilled, shareable version.
   - If a date heading already exists for today, add bullets under it rather
     than duplicating the heading.
   - This captures work that happened only in n8n/Airtable too — so the repo
     reflects the session even when no file on disk changed.

7. **Git commit + push.** After the log entry and changelog are written:
   - Run `git status` to see what's changed. Briefly review it — flag anything
     unexpected or stray before staging (don't blindly `git add .`).
   - Stage and commit the changed tracked files — `CHANGELOG.md` plus any
     modified scripts, workflows, or docs (`.env` and gitignored files are
     excluded automatically). Use a concise commit message describing what
     changed in the repo this session (the diff, not the session narrative).
   - Run `git push`.
   - Report what was committed and confirm the push succeeded.

8. **Emit the bounded `/wrap-review` packet.** This is the only handoff the
   reviewer should need. Keep evidence separate from inference and use this exact
   structure:

   ```text
   REVIEW PACKET
   Session objective:
   Commit range: <SESSION_BASE_COMMIT>..<final HEAD>
   Changed/newly activated number-producing slices:
   Evidence and tests:
   Settled decisions (with source):
   Hypotheses / unresolved choices:
   Next number-changing or irreversible action:
   ```

   Use `None` where a section is empty. Do not add speculative review targets.
   End with: `Reviewer: run /wrap-review on this packet.`

9. **Stop after handoff.** Do not perform a self-review or begin repairing possible
   reviewer findings during wrap. The separate reviewer gets one bounded pass.
   A valid blocker becomes the next session's first task unless Ariel explicitly
   chooses to continue the current session.

---

## `/wrap review-close` — persist the review disposition

Run this mode only when the user returns a completed `/wrap-review` result to the
original wrapper. This is a mechanical persistence step, not another wrap or
review.

1. Read only the review result's `Canonical-state corrections required` section.
   Do not reinterpret findings, investigate further, repair code, relabel data,
   file issues, or make architecture decisions.
2. If all three homes say `None`, report that no persistence is required and
   stop without editing or committing.
3. **Execution Log:** when requested, get the current local time and append a
   short dated review addendum above the final `---`. Preserve the original
   session entry; state only the corrected blocker/status/next action and point
   to the reviewed commit range.
4. **Active Scope:** when requested, make only the exact current-status or
   sequencing correction needed so the next `/start` cannot proceed from stale
   state. Do not rewrite surrounding rationale or clean up adjacent prose.
5. **Decision Log:** update only when the reviewer points to an explicit decision
   Ariel already made during the reviewed session and the wrapper omitted it.
   Never record a reviewer inference as a decision.
6. Show the exact mechanical edits to Ariel before applying them, as required by
   the repo editing rule.
7. Do not update `CHANGELOG.md`; review-close changes internal bookkeeping, not
   shipped behavior. Do not touch code, labels, issues, metrics, or source docs.
8. If a tracked canonical file changed, stage only that file, commit, and push.
   If only gitignored `Execution_Log.md` changed, do not create an empty commit.
9. Report what was persisted and stop. Do not emit another review packet and do
   not trigger another review.
