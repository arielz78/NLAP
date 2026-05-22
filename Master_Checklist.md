# Master Checklist — Pre-R5 + Parallel Tracks
**Last updated:** 2026-05-20  
**Purpose:** Everything before and alongside R5. R5 execution follows `docs/NLAP_PostMVP_Roadmap.md`.

**Prereqs closed:** #2 (2026-05-20) · #3 (2026-05-20) · #4 (2026-05-13)  
**GitHub Issues = queue for all work. Roadmap .txt = reference only.**

---

## Pre-R5 Gate

### Ariel — exam week (before May 26)
- [x] **Prereq #6** — multi-tenant base decision (with Nathan, ~30min) — CLOSED 2026-05-20
  - Confirmed: base-per-newsletter (isolation, no record-limit ceiling, cleaner permissions)
  - Mississauga base cloned from Vaughan schema at R8-W10
- [ ] **Prereq #5** — quality metric (client call, ~30min) — separate day from #6
  - Propose: editor acceptance rate (blurbs published as-is vs. edited) as primary metric
  - Not blocking R5 — blocking R6. If not resolved here, carry to next client meeting.

### Nathan — same period, in this order
- [ ] **#43** n8n workflow review
- [x] **#42** script review — CLOSED 2026-05-21
- [ ] **#44** schema doc update
- [ ] **#41** R1 ingestion filter bug *(non-English events + events outside Markham/Richmond Hill/Vaughan range slipping through — find source node, patch both)*
- [ ] **Facebook TOS research** *(gates R5-W1 + R5-W3 — if Facebook can be automated, source audit and intake design both change)*

### Ariel — after May 26
- [ ] **Prereq #1** — R2 classification eval (~2h)
  - Stratified sample: across source types, confidence levels, segments — not just clean records
  - Review SegmentSuggested + LLM_Rationale, document failure patterns
- [ ] **Candidate pool baseline** (2min)
  - Count Status = Approved in Candidates table
  - Log in `NA/Vaughan_Metrics_Log.md` + `NA/VB_Portfolio_Case_Study.md` (same row, same time)
- [ ] **IssueItems view cleanup** (~15min, with client) — confirm field set
- [ ] **Roadmap update** (~15min) — add owner per release (R5 = Nathan, R6/R7 = Ariel, R8 = both), update Nathan's time budget (10h/week)
- [ ] **R5 scope doc** (~1h) — Nathan reads this before touching W1
  - Cover W1/W2/W3 deliverables
  - Open as GitHub Issues for live visibility — Nathan closes as he goes

---

## Parallel to R5

- [ ] **Prereq #5** — quality metric (if not closed pre-R5, resolve at next client meeting)
- [ ] **R6 prep** — blocked on client returning tagged URL list (sent 2026-05-15)
  - Join tagged URLs to clicks CSV → per-segment click averages (~1h)
  - Run offline backtest: earliest-date sort vs. scored vs. locked/featured (~1h)
  - Design scoring formula from backtest results (~1h)
  - Document formula → share with client for gut-check
- [ ] **Client meeting agenda:** case study quote · dry run scheduling

---

## Deferred — For Next Client

- [ ] Website fix list + go-live
- [ ] NA logo
- [ ] Case study PDF export
- [ ] ERD + architecture diagram
- [ ] CRM (Airtable table)
- [ ] Sales prep: Hormozi + practice conversation
- [ ] Outreach: Dad / Aaron / White Shark

---

## Ongoing

- Nathan closes GitHub Issues as items complete — live progress without asking
- Daily async on Discord · sync every few days
