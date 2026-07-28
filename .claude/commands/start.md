---
description: Bootstrap the session — read the logs + active release status snapshot and summarize current state and open items
---

Establish current project state before we start work. Do this:

1. **Pull latest from remote** — run `git pull` via Bash to ensure we're working off current state before reading anything.
2. Read the most recent entries of `Execution_Log.md` (the bottom of the file
   — entries are oldest-first, so the latest work is at the end).
3. Read the **active release Scope doc's Status Snapshot** (currently
   `docs/r7/R7_Scope.md` — R7 is active per Decision_Log §61; R6 deferred behind
   it) — this is the authoritative current state, not the roadmap. The roadmap
   (`docs/NLAP_PostMVP_Roadmap_v3.md`) is a frozen plan; read it only for
   original release intent, not where things stand now.
4. Only if the recent log references unresolved historical context, check the
   relevant archived log in `logs/`.
4b. **Scan `NA/Vaughan_Metrics_Log.md` for pending ⏳ captures.** Grep for `⏳` and
   surface any whose trigger release is the active one or the next one — these are
   "capture before X starts / before X cutover" baselines, and several are
   **one-way doors**: the before-number stops existing once the release they gate
   ships. Report them under **Windowed captures** in the briefing, with the trigger
   and whether the window is still open.
   *Why this exists:* the NeedsReview baseline was marked "capture before R7-W6
   starts" and slipped the entire work package, because nothing in the workflow ever
   opened the metrics log at a release boundary. Found 2026-07-21, weeks late.
   Same trap is already loaded for R6 (3-issue rolling CTOR avg, "before R6 starts").
5. **Surface the session's hands-on focus (learning heads-up).** From the
   "Learning Mode" section of `CLAUDE.md`, print the current release's hands-on
   reminder up top. This fires every build session so it is never silently
   skipped.
6. **Print the session-flow reminder** (verbatim, one block — the protocol's home
   is the skill files, this is only the pointer):
   > **Session flow:** work (no notes — click-blurbs only) → `/recap` when learning
   > ends (quiz ×2 → full recap → queue seeds → you write blurbs) → `/wrap` if repo/
   > NLAP state changed → `/checkout` at day end if an artifact moved. Each step
   > skips when its trigger doesn't fire.

Then give me a tight briefing — no preamble:

- **Where we left off:** what was done in the last session.
- **Open items / next steps:** what was queued, ranked by what's most likely next.
- **Anything mid-flight:** work that was started but not finished, or decisions left pending.
- **Windowed captures:** pending ⏳ items from the metrics log (step 4b) whose window closes at the active or next release. Omit the section entirely if there are none.
- **Current release focus:** which release (R5/R6/etc.) is active and what it needs.
- **Your hands-on focus this session:** render the current release's reminder from the CLAUDE.md Learning Mode section.
- **→ THE SINGLE NEXT ACTION:** end every briefing with exactly one bolded line naming
  the one thing to do next — not a ranked list, one action. Pick it by what unblocks the
  most other work, and say in half a sentence what it unblocks. If the top item is a
  *decision* rather than a task, say so explicitly ("this is a call, not a build").

Keep it short. This is orientation, not a full report. Flag anything that looks stale or contradictory between the log and the roadmap.

---

## `/start zoom` — the drift mode (only when the `zoom` argument is passed)

Plain `/start` stays fast and per-session. **`/start zoom` adds a cross-session synthesis
first**, then the normal briefing. Use it when you've lost the thread — when the last few
sessions felt like disconnected firefighting and you can't say what actually moved.

*Why it lives here rather than in its own command:* when you're disoriented you won't
remember a sixth slash command, but you always run `/start`.

When `zoom` is passed, read the **last 5–6 `Execution_Log.md` entries** (not just the
latest) plus the active Scope doc, and lead with:

1. **The problem that arose** — the through-line, not a list. If several sessions kept
   hitting variations of one underlying problem, name that problem once and give the
   instances as a table. Resist writing six independent summaries.
2. **Where we started → where we left.** Two states, concrete. Include what was *believed*
   at the start that turned out wrong.
3. **The linkage between sessions** — how each session's finding *created* the next
   session's work. Call out findings that surfaced while doing something else; a run where
   most discoveries were incidental is telling you the board isn't pointed at the real work.
4. **The linkage to the Scope doc** — which Step each session touched, as a table. If a
   session touched nothing, say so.
5. **Overall progress** — which releases are shipped, which is active, and **what fraction
   of the active release's steps are actually done.** Be blunt when documentation moved and
   the critical path didn't.
6. **The honest flag** — if the critical path hasn't moved across those sessions, say it
   plainly, and name the external dependency (editor time, a client answer) if one is the
   real long pole.

Then continue into the normal briefing above. Do not skip the single-next-action line —
it matters more in zoom mode, not less.

---

**ALWAYS include this tools section verbatim at the end of every /start briefing — do not skip it.**

**Tools available this session:**

Slash commands (project — this repo only):
- `/start` — session orientation (this command). NLAP build-session bootstrap: logs + active Scope snapshot.
- `/wrap` — end-of-session log update. Fires when repo/NLAP state changed.
- `/recap` — active-recall session recap (quizzes you on logic/sequence first, then fills gaps)
- `/brief` — morning brief: today's schedule + the full open board. Read-only renderer, day-level, any day. **Not interchangeable with `/start`.**
- `/checkout` — end-of-day ledger for non-NLAP summer work (SQL, retrieval, networking, learning). Never holds NLAP build content.

Slash commands (global — all projects):
- `/gutcheck [target]` — pressure-test a decision or plan as a staff engineer. Audits an artifact that already exists.
- `/pro-approach [task]` — how a pro would frame a problem before any plan exists. Generative, pre-artifact. **Not interchangeable with `/gutcheck`.**
- `/spinup [task]` — package a task for a subagent: gate (delegate at all? which model?) → you author the judgment core → Claude assembles the scaffold → lint for model traps (esp. Fable). Use before any delegation that isn't trivial.
- `/learn [topic]` — tutoring skill for building understanding of a concept, not getting a task done.

Slash commands (built-in — not ours):
- `/code-review` — review your working diff / current branch. Returns structured findings: bugs, correctness issues, cleanup. Use at the R6/R7 PR-review bar.

Subagents — two types, use them:
- **Foreground subagent** — spins up a separate Claude instance for a specific task, you wait for the result. Use for research or exploration you need before continuing. Say "use an Explore agent to find X" or "use a Plan agent to design Y."
  - `Explore` — fast read-only codebase search, finding files or symbols
  - `Plan` — design an implementation plan before building
  - `general-purpose` — multi-step research or tasks spanning many files
- **Background agent** — same but runs in parallel while you keep working. Use when the task is independent and you don't need the result immediately. Say "in the background, check X." You get notified when it's done.

TodoWrite — use it proactively:
- Any session with 3+ tasks: spin up a todo list at the start, don't wait to be asked
- Mark tasks complete immediately as they finish
- Keeps nothing dropped across a long session

Plan mode — use it before building anything non-trivial:
- Invoke when getting the approach wrong would mean refactoring, not just fixing a bug
- Examples: R6 scoring formula design, R7 classifier deployment into n8n
- Skip for routine sessions, discussion, or small fixes
