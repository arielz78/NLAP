---
description: End-of-session wrap — append the journal + changelog, run the conditional-homes update checklist (Decision_Log, source sheet, metrics log, issues) FOR the user, and commit
---

Wrap up this session. Follow these steps in order:

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
