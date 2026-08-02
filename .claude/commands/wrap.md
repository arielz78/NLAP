---
description: End-of-session wrap — conditional-homes checklist, changelog, commit, an automatic bounded review, then the journal entry written with the verdict already known
---

Wrap up this session. Follow these steps in order.

**Why this order:** the review needs a commit range, so the commit happens before
the review; the Execution_Log entry is gitignored, so it is written *last* — after
the verdict is known — and is therefore correct the first time. That is what
removes the need for a separate correction pass.

0. **Resolve the session boundary.** Use the `SESSION_BASE_COMMIT` emitted by
   `/start` as the start of the review range; this includes any intermediate
   commits made during the session. If it is unavailable, identify the parent of
   the session's earliest commit from the conversation/log and state the
   assumption. Use the current pre-wrap `HEAD` only when all session work is still
   uncommitted. Wrap is bookkeeping, not a new investigation phase: do not start
   audits, redesigns, historical studies, or new issue work while wrapping. If
   the session surfaced an unresolved interpretation, preserve it as a hypothesis
   — do not settle it.

1. **Carry-forward gate — close the loop on last session's "Next."**
   Read the **previous** Execution_Log entry's "Next" list. For each item, mark
   exactly one:
   - **Done** this session → reflect it in the entry, drop it.
   - **Still open** → it must have a GitHub issue. If it doesn't, propose
     opening one now. Do NOT re-copy the prose forward untracked — that's the
     exact silent-rot failure this gate exists to stop.
   - **Dropped** → say so in one line, with why.
   Rule: no item may carry forward as untracked "Next" prose two sessions
   running. New open work created this session follows the same rule —
   trackable work becomes an issue; the log's "Next" names only the immediate
   next action, not a backlog.

2. **Run the conditional-homes checklist FOR the user — do not make them scan.**
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

3. Show me every drafted entry before/after writing so I can eyeball it.

4. **Append a public summary to `CHANGELOG.md`.** Always do this, every session.
   - Add a new dated entry at the **top** (newest first), under the header.
   - 2–3 lines max. Written for a public reader (recruiter / potential client):
     concise, clean, describes what the session accomplished. NO candid internal
     detail, NO client-confidential numbers — that stays in the private
     `Execution_Log.md`. This is the distilled, shareable version.
   - If a date heading already exists for today, add bullets under it rather
     than duplicating the heading.
   - This captures work that happened only in n8n/Airtable too — so the repo
     reflects the session even when no file on disk changed.

5. **Git commit + push.**
   - Run `git status` to see what's changed. Briefly review it — flag anything
     unexpected or stray before staging (don't blindly `git add .`).
   - Stage and commit the changed tracked files — `CHANGELOG.md` plus any
     modified scripts, workflows, or docs (`.env` and gitignored files are
     excluded automatically). Use a concise commit message describing what
     changed in the repo this session (the diff, not the session narrative).
   - Run `git push`.
   - Report what was committed and confirm the push succeeded.

6. **Run the bounded review automatically — do not ask whether to.**
   Build the packet, then hand it to a **separate read-only subagent**. Do not
   review your own work inline; the point is a reader with no memory of having
   written the code.

   a. Assemble the packet. Keep evidence separate from inference, use `None`
      where a section is empty, and add no speculative review targets:

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

   b. Spawn the reviewer with the `Agent` tool: `subagent_type: "Explore"`
      (no Edit/Write/NotebookEdit), `run_in_background: false`. The prompt is
      the full contents of `.claude/commands/wrap-review.md` followed by the
      packet, plus: *"You are read-only. Do not modify files, commit, push, or
      file issues. Return only the output contract block."*

   c. Print the returned block verbatim. Do not argue with it, re-run it, or
      repair its findings during wrap. One review, one pass.

   If the subagent is unavailable, print the packet and tell me to run
   `/wrap-review` myself. Do not substitute a self-review.

7. **Now write the Execution_Log entry — with the verdict already known.**
   - First get the current local time via the Bash tool:
     `powershell -Command "Get-Date -Format 'yyyy-MM-dd h:mm tt'"`
   - New entries go at the **bottom** of the file, **above** the final `---`
     (entries are ordered oldest-first).
   - Include the date and the local time to the minute.
   - Cover: what was run, what broke, what was fixed, decisions made, and
     next steps.
   - **Fold the review in.** A proven blocker becomes the entry's "Next" (it is
     the next session's first bounded task). Deferred findings get at most one
     line each and do not become issues by default. Never record a reviewer
     *inference* as a decision.
   - **Decision pointer discipline:** if a decision was made, name it in one
     line and point (`Decision: X — see Decision_Log §N`). Do NOT re-articulate
     the rationale here — that's the Decision_Log's job (one home, journal points).
   - Match the formatting of the existing recent entries — read the last entry
     first and mirror its structure. Show me the draft before writing.
   - `Execution_Log.md` is gitignored: writing it here needs no commit.

8. **Only if the review named a correction to a *tracked* file** (active Scope
   status/sequencing, or an explicit Ariel decision the checklist missed):
   make that one edit, show it first, then stage only that file and commit.
   Do not update `CHANGELOG.md` for it. If nothing tracked changed, make no
   second commit.

9. **Stop.** One wrap, one review. Do not repair findings, re-review, or emit
   another packet. A proven blocker is the next session's first task unless
   Ariel explicitly chooses to continue now.

---

## `/wrap review-close` — fallback only

Step 7 normally makes this unnecessary: the journal entry is written *after* the
verdict, so there is nothing to correct. Use this mode only when a review arrived
out of band — a standalone `/wrap-review` run later, or a review from another
agent against an already-written entry.

It is mechanical persistence, not another wrap or review.

1. Read only the review result's `Canonical-state corrections required` section.
   Do not reinterpret findings, investigate further, repair code, relabel data,
   file issues, or make architecture decisions.
2. If all three homes say `None`, report that no persistence is required and
   stop without editing or committing.
3. **Execution Log:** get the current local time and append a short dated review
   addendum above the final `---`. Preserve the original session entry; state
   only the corrected blocker/status/next action and point to the reviewed
   commit range.
4. **Active Scope:** make only the exact current-status or sequencing correction
   needed so the next `/start` cannot proceed from stale state. Do not rewrite
   surrounding rationale or clean up adjacent prose.
5. **Decision Log:** update only when the reviewer points to an explicit decision
   Ariel already made during the reviewed session and the wrapper omitted it.
   Never record a reviewer inference as a decision.
6. Show the exact mechanical edits to Ariel before applying them.
7. Do not update `CHANGELOG.md`. Do not touch code, labels, issues, metrics, or
   source docs.
8. If a tracked canonical file changed, stage only that file, commit, and push.
   If only gitignored `Execution_Log.md` changed, do not create an empty commit.
9. Report what was persisted and stop. Do not emit another packet and do not
   trigger another review.
