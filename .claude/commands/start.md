---
description: Bootstrap the session — read the logs + active release status snapshot and summarize current state and open items
---

Establish current project state before we start work. Do this:

1. **Pull latest from remote** — run `git pull` via Bash to ensure we're working off current state before reading anything.
2. Read the most recent entries of `Execution_Log.md` (the bottom of the file
   — entries are oldest-first, so the latest work is at the end).
3. Read the **active release Scope doc's Status Snapshot** (currently
   `docs/r6/R6_Scope.md`) — this is the authoritative current state, not the
   roadmap. The roadmap (`docs/NLAP_PostMVP_Roadmap_v3.md`) is a frozen plan;
   read it only for original release intent, not where things stand now.
4. Only if the recent log references unresolved historical context, check the
   relevant archived log in `logs/`.

Then give me a tight briefing — no preamble:

- **Where we left off:** what was done in the last session.
- **Open items / next steps:** what was queued, ranked by what's most likely next.
- **Anything mid-flight:** work that was started but not finished, or decisions left pending.
- **Current release focus:** which release (R5/R6/etc.) is active and what it needs.

Keep it short. This is orientation, not a full report. Flag anything that looks stale or contradictory between the log and the roadmap.

---

**ALWAYS include this tools section verbatim at the end of every /start briefing — do not skip it.**

**Tools available this session:**

Slash commands (project):
- `/start` — session orientation (this command)
- `/wrap` — end-of-session log update
- `/recap` — active-recall session recap (quizzes you on logic/sequence first, then fills gaps)
- `/gutcheck [target]` — pressure-test a decision or plan as a staff engineer
- `/pro-approach [task]` — how a pro would frame a problem before any plan exists

Slash commands (global):
- `/review <PR#>` — review a GitHub PR by number (e.g. `/review 34`). Reads the diff and returns structured findings — bugs, correctness issues, cleanup. Use every time Nate submits work instead of reading the diff manually.

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
