# NLAP Docs — Index & Update Rules

The map of where every fact lives and when to touch each doc. This exists so you
never have to hold the "which doc do I update?" checklist in your head — read the
index, or just run `/wrap` (it walks this list for you at session end).

## The one rule

**Each fact has exactly one *maintained* home. Everything else points to it — never copies it.**
When two docs would disagree: Scope snapshot wins for *status*, Decision_Log wins for *decisions*.
This is the guard against the cross-doc drift that otherwise recurs every release.

## Three doc types (organized by durability, not by release)

A doc's *type* tells you its update discipline. It's a label, **not** a folder —
files are placed by **durability** (does this outlive the release?), because that
never changes, whereas type (working → frozen) does.

| Type | Meaning | Lives where |
|---|---|---|
| **Living reference** | Update in place forever. No release number. | `docs/` top level, `NA/` |
| **Release-working** | Maintained *during* a release; frozen + moved to `logs/` at close. | `docs/r{N}/` |
| **Frozen record** | Never updated. *Allowed* to look stale — a snapshot is not drift. | `docs/archive/`, `logs/`, `meetings/` |

## Where every fact lives — the index

| Fact | Home | Type | Update when |
|---|---|---|---|
| Session journal (what happened, next step) | `Execution_Log.md` (root) | Living (journal) | **Every session** |
| Public repo changelog | `CHANGELOG.md` (root) | Derived from Execution_Log | Every session (auto — derived, not authored twice) |
| Architectural / editorial decisions + rationale | `docs/Decision_Log.md` | Living reference | **Only** when a real decision is made |
| Active release status ("where are we") | active Scope doc's Status Snapshot (e.g. `docs/r5/R5_Scope.md`) | Release-working | When release status changes |
| Per-source method / status / field inventory / verdict | `docs/source_decision_sheet.md` | Living reference | When a source's state changes |
| Scrape / source-probe methodology | `docs/scrape_blueprint.md` | Living reference | When the method or standard changes |
| Release plan (original intent, **not** status) | `docs/NLAP_PostMVP_Roadmap_v3.md` | Frozen *per-section* (see below) | A section freezes when its release opens; otherwise never |
| Past release build history | `logs/` | Frozen | At release close (move the Scope doc's history here) |
| Website build sessions | `logs/Website_Log.md` | Living (journal) | Website sessions |
| Client meeting notes | `meetings/` (dated) | Frozen | Per meeting |
| Tracking / health-check output | `data/tracking/` | Generated | Per run (local; not posted) |
| Metrics — the **numbers** | `NA/Vaughan_Metrics_Log.md` | Living reference | When a metric moves |
| Portfolio narrative (AE / SE framings) | `NA/VB_Portfolio_Case_Study.md` | Derived from metrics log | When framing changes — numbers are **copied from** the metrics log, never authored here |
| Runbook / ops | `docs/RUNBOOK.md` | Living reference | When ops change |
| Airtable schema | `docs/airtable_schema.txt` | Living reference | When schema changes |
| Unplanned open work (debt), experiments | GitHub Issues (`arielz78/NLAP`) | Tracker | As work surfaces |
| Superseded planning | `docs/archive/` | Frozen | Never |

## The roadmap convention (per-section freeze)

`NLAP_PostMVP_Roadmap_v3.md` is a **mixed-maturity** doc, so it isn't frozen all at once:

- **Started releases** (R5) → that section is **frozen intent**. Read the release's Scope doc for status; read the roadmap only for the *original* plan. The plan-vs-actual gap is intentional writeup material — never sync the roadmap to reality.
- **Not-yet-started releases** (R6–R8) → the roadmap **is** their live source of truth. There's no Scope doc yet.
- A section freezes **the moment its release gets a Scope doc.** When you open R6, seed `docs/r6/R6_Scope.md` from the roadmap's R6 section; from then on R6 status lives in the Scope doc. **Every Scope doc carries two standing sign-off gates (copy R5_Scope's):** (1) a **milestone-completeness gate** — the release closes only when no open issue is unmilestoned *and* every issue in that release's GitHub milestone is closed or deferred-with-disposition; (2) a **reusability / config gate** — the release closes only after confirming nothing new is Vaughan-hardcoded outside config, i.e. the pipeline stays city-swappable (base-per-newsletter): **R6** = scoring weights/venue logic config-driven; **R7** = per-base models; **R8** = onboard-via-config verified. Both gates are status, so they live in the Scope doc, never the roadmap. When you seed a new Scope doc from the roadmap, both gates come with it — they cannot be skipped.
- Post-R8, when every section has been consumed, the whole roadmap retires to `docs/archive/`.

## Two patterns that prevent "writing the same thing twice"

- **Decision → home in Decision_Log; journal points.** Write the rationale once in `Decision_Log.md`; the `Execution_Log.md` entry mentions the decision in one line and links it (`see Decision_Log §N`) — it does **not** re-articulate the why.
- **Metric → home in the metrics log; narrative renders.** A number is originated only in `Vaughan_Metrics_Log.md`. The case study quotes it but never authors or revises it. If they disagree, the log wins.

## Open-work lifecycle (no silent drops)

Every "thing to do next" follows one path: **captured at `/wrap` → filed as a GitHub Issue → assigned a release milestone → reconciled at that release's sign-off gate** (closed, or deferred-with-disposition to a later milestone). The journal narrates; issues are the tracker. This closes the loop for *tracked* work — nothing in a milestone can vanish silently. The one human-owned step is **capture** (writing it down once); after that the loop carries it. Rationale: `Decision_Log.md` §48. Sign-off gate (per release, in the Scope doc): see "roadmap convention" above.

## Session end

`/wrap` runs this index as a checklist *for you*: it appends the journal + changelog automatically, then scans the session and proposes which conditional homes (Decision_Log, source sheet, metrics log, GitHub issues) changed. You confirm — you don't scan.
