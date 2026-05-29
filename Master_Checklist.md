# Master Checklist — Pre-R5 + Parallel Tracks
**Last updated:** 2026-05-27  
**Purpose:** Everything before and alongside R5. R5 execution follows `docs/NLAP_PostMVP_Roadmap.md`.

**Prereqs closed:** #2 (2026-05-20) · #3 (2026-05-20) · #4 (2026-05-13) · #5 (2026-05-27) · #6 (2026-05-20)  
**GitHub Issues = queue for all work. Roadmap .txt = reference only.**

---

## Pre-R5 Gate

### Ariel — exam week (before May 26)
- [x] **Prereq #6** — multi-tenant base decision (with Nathan, ~30min) — CLOSED 2026-05-20
  - Confirmed: base-per-newsletter (isolation, no record-limit ceiling, cleaner permissions)
  - Mississauga base cloned from Vaughan schema at R8-W10
- [x] **Prereq #5** — quality metric — CLOSED 2026-05-27
  - Original "editor acceptance rate" proposal killed (client edits every blurb regardless)
  - New definition: R6 success = scored picks correlate with clicks better than earliest-date sort, validated by offline backtest on frozen R6 eval set. CTOR = post-launch outcome, not dev signal. See Decision_Log § 16.
  - Closed as methodology decision — no client agreement required.

### Nathan — same period, in this order
- [x] **#43** n8n workflow review — CLOSED 2026-05-26
- [x] **#42** script review — CLOSED 2026-05-21
- [x] **#44** schema doc update — CLOSED 2026-05-26
- [x] **#41** R1 ingestion filter bug *(non-English events + events outside Markham/Richmond Hill/Vaughan range slipping through — find source node, patch both)* — delegated as debt
- [x] **Facebook TOS research** *(gates R5-W1 + R5-W3 — if Facebook can be automated, source audit and intake design both change)* — automation ruled out, manual intake confirmed (Decision_Log § 18)

### Ariel — after May 26
- [ ] **Prereq #1** — R2 classification eval (~2h)
  - Stratified sample: across source types, confidence levels, segments — not just clean records
  - Review SegmentSuggested + LLM_Rationale, document failure patterns
- [x] **Candidate pool baseline** — DONE 2026-05-27
  - 103 Approved (out of 433 total: 285 New, 103 Approved, 44 Rejected, 165 NeedsReview) — captured via `snapshotCandidates.js` first run
  - Caveat: pre-2026-05-27 decisions include tinker noise; clean labeled set begins 2026-05-27 via `StatusLastModified` separator
  - Logged in `NA/Vaughan_Metrics_Log.md` + `NA/VB_Portfolio_Case_Study.md`
- [ ] **IssueItems view cleanup** (~15min, with client) — confirm field set
- [x] **Roadmap update** — DONE 2026-05-22
- [x] **R5 scope doc** (~1h) — DONE 2026-05-27 — `docs/R5_Scope.md` covers W1/W2/W3; tasks tracked in #33/#34/#35

---

## Parallel to R5

- [x] **Prereq #5** — quality metric — CLOSED 2026-05-27 (see Pre-R5 Gate section)
- [x] **#52** — Beehiiv parseability spike — CLOSED 2026-05-28 — **GO**
  - 2,729 `(section, url)` pairs across 72 issues via Beehiiv API (`scripts/fetchBeehiivHistory.js` → `data/beehiiv/issue_history.json`)
  - R7 classifier path confirmed: LinearSVC + TF-IDF on Beehiiv labels (see Decision_Log §17)
  - URL-match script unblocked (see Decision_Log §25)
- [ ] **R6 prep** — tagged URL list returned 2026-05-28 (see Execution_Log)
  - Join tagged URLs to clicks CSV → per-segment click averages (~1h)
  - Hand-set v1 scoring weights from domain knowledge (§18, §20) — Decision_Log §28 revised 2026-05-29
  - Build feature matrix from `issue_history.json` + clicks + Candidates (~1h)
  - Run offline backtest with bootstrap CIs: earliest-date sort vs. hand-set v1 vs. locked/featured (~1.5h)
  - If backtest fails: regression as refinement (see §28 Amendments) — only then, not pre-emptively
  - Hand-check Beehiiv parser correctness on stratified sample BEFORE trusting labels — issue #54
  - Document formula → share with client for gut-check
  - **Revised timing: R6 is ~3 weeks solo at 10h/week, not the original June 4 target.** External review (2026-05-29) flagged June 4 was infeasible — accept the re-baseline now rather than at the miss.
- [ ] **Client meeting agenda:** case study quote · dry run scheduling

---

## Deferred — For Next Client

- [x] ~~Website fix list + go-live~~ — DONE 2026-05-27 (builtbyna.com shipped, fix list closed)
- [x] ~~NA logo~~ — DONE 2026-05-27 (wordmark in header + footer)
- [ ] Case study PDF export
- [ ] ERD + architecture diagram
- [ ] CRM (Airtable table)
- [ ] Sales prep: Hormozi + practice conversation
- [ ] Outreach: Dad / Aaron / White Shark

---

## Ongoing

- Nathan closes GitHub Issues as items complete — live progress without asking
- Daily async on Discord · sync every few days
