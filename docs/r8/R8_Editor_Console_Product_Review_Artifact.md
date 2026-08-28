# R8 Editor Console — Product Review Artifact

> ⚠️ **PARKED REFERENCE ARTIFACT. NOT A SCOPE DOC. NO STATUS LIVES HERE.**
> This file preserves the original product-review prompt and response from 2026-08-20 so
> the option space does not need to be reconstructed when R8 opens. It does not authorize
> a build, settle the open decisions, or supersede `R8_Editor_Console_Concept.md`.
>
> If you are a `/start` reading this before R8 opens: ignore it. Read the active release
> Scope doc for current status.

## Why this artifact exists

The parked concept doc records the compressed conclusions. This artifact preserves the full
feature inventory, exclusions, write-path options, adoption analysis, and human decisions that
produced those conclusions. The prompt and response below are reproduced verbatim.

## Original prompt — verbatim

~~~text
You are acting as Head of Product for editorial tooling — someone who has\
shipped human-in-the-loop review interfaces for newsrooms and content teams,\
and who has watched most of them fail from feature bloat, not missing features.\
At the end, switch voices: a ruthless scope-cutter who must justify every\
screen against a two-week part-time build budget.

FIRST, READ THESE — do not propose anything before you have:

- CLAUDE.md — sections "Data Rules", "Stack" (script index), "Repo Layout"
- docs/r7/R7\_Scope.md — the Status Snapshot and The Closing Sequence.\
  This is the authoritative current state. The roadmap is NOT.
- docs/Decision\_Log.md — §78 (score and sort, never delete), §87 (the\
  gate/ranker boundary and what V1 is), §90, §93
- scripts/buildIssues.js — the allocator. The real constraint set lives here,\
  in code, not in prose.
- data/tracking/r7\_live\_runner/issue\_2026-08-13/scored\_survivors.jsonl —\
  read a few rows. This is what a scored candidate actually looks like and\
  what a console would render.
- NA/Vaughan\_Metrics\_Log.md — "In-window candidate depth" for pool sizes
- meetings/2026-08-13.md — most recent client conversation

CONTEXT NOT IN ANY FILE — this is the part you cannot look up:

1. The editor works almost entirely OUTSIDE the tooling. He rarely opens\
   Airtable, where all the data lives. Non-technical, strong and fast\
   editorial instincts, limited patience, works roughly one hour on Sunday.\
   Any interface he doesn't find faster than his current habit is abandoned.\
   This is the primary risk to the whole idea.

2. The concept under consideration: a web console showing him, per section,\
   the model's allocated picks plus a ranked list of alternates, with the\
   ability to swap a pick out for an alternate.

3. Every swap is captured as a preference pair — the model ranked A above B,\
   the editor disagreed. This is training signal for the ranking model that\
   does not exist yet. The data-capture purpose is at least as important as\
   the editorial one. Design accordingly.

4. Build budget: one developer, \~two weeks, part-time. There is no design\
   or frontend specialist.

5. The ranking model does not exist yet, and the gate's live accuracy is\
   measured but unread as of today. The console may launch showing an\
   ordering that is not yet trustworthy.

WHAT TO PRODUCE:

A. A feature inventory, grouped into: (1) required for the console to be\
usable at all, (2) required for the preference-pair capture to produce\
clean training data, (3) genuinely optional.\
For each, name what it costs and what breaks without it.

B. Explicitly: features NOT to build, and why. Be specific — name the\
plausible-sounding ones a competent developer would reach for and\
shouldn't. This section matters as much as A.

C. The write-path question. The editor's decision must eventually reach\
IssueItems, because the blurb generator and Beehiiv export read from\
there. Lay out the options for how that happens and their failure modes,\
including how Lock = true and the one-venue-per-section constraint are\
respected or violated when a human swaps freely.

D. The adoption question. Given point 1 above, what would make this editor\
actually open it on a Sunday? What would make him not?

E. Open questions that must be answered by a human before building, with\
the consequence of guessing wrong on each.

Present A-E as an option space with tradeoffs, NOT as a recommendation or a\
plan. The design decisions belong to the project owner. Your job is to make\
the choices legible and correctly priced, and to name what he hasn't thought\
of. Do not write code. Do not modify any file.
~~~

## Original response — verbatim

~~~text
Cost estimates below are incremental engineering days, assuming a basic web stack and Airtable remains the database. They are directional: S < 1 day, M 1–2 days, L 3–5 days. Deployment, authentication, and the base app shell add roughly 2–4 days before product behavior.

Two constraints dominate:

- Sunday supply is about 310 listings, roughly 215 distinct event series, competing for 15 model-supported slots. Showing “everything” recreates the editor’s current workload.
- There is no ranking model. `P(include)` is only a reversible viability signal; it is not expected clicks or overall editorial quality. Until the sealed R7 readout is interpreted, even its live ordering is unvalidated.

## A. Feature inventory

### 1. Required for the console to be usable at all

| Feature | Cost | What breaks without it |
|---|---:|---|
| One-click entry into the current Sunday issue | S–M | Any navigation, Airtable visit, issue setup, or repeated login competes directly with the editor’s existing habit. |
| Server-side Airtable access | M | Browser-held Airtable credentials are unacceptable. The console needs a backend boundary even if the UI is one page. |
| One joined candidate view | M | `scored_survivors.jsonl` has title, date, city, description, link and scores, but not `LocationName`, current IssueItem assignment, lock state or slot. Rendering the JSON alone cannot support valid swaps. |
| Three automated sections, each showing five allocated picks and a small alternate set | L | The editor cannot understand what is being replaced or preserve section quotas. A flat ranked feed is not an issue-building interface. |
| Essential card information | M | At minimum: title, date/time, venue/city, short description, source and link. Missing information forces link-hunting; too much information turns the console into Airtable. Exact fields require the editor’s answer to the meeting’s still-open “hard-pick” question. |
| Unique-series handling | M | About 30% of the measured live pool was repeat listings. Without collapsing series, alternates look deeper than they are and the editor wastes decisions on repeated dates. The UI still needs a way to choose the desired occurrence. |
| Swap interaction with an obvious before/after state | M | If replacing a pick takes more than one compact action, the interface loses its speed advantage. Drag-and-drop is not required; a simple Replace action is. |
| Constraint-aware alternates | M–L | A free list can offer impossible choices: wrong date window, wrong section, already assigned elsewhere, duplicate venue, locked slot, or full quota. |
| “Show more” escape hatch | S–M | Eight unique series worked as an evaluation instrument, not necessarily as production inventory. Three alternates may all be unsuitable. Dumping all 215 series is equally bad. |
| Persisted draft and refresh recovery | M | A browser refresh, network interruption or accidental close cannot erase Sunday work. |
| Clear saved/submitted/error state | M | The editor must know whether IssueItems changed. Silent partial writes would be worse than staying in Airtable. |
| Locked-slot treatment | S–M | A locked IssueItem must be visibly immutable. Allowing a swap against it violates the project’s strongest persistence rule. |
| Stale-state detection at commit | M | The allocator, Airtable, or another session may have changed the issue since page load. Committing an old screen can overwrite valid current state. |

Two scope ambiguities are buried here:

- The scored artifact supports Families, Couples and Golden Age Readers. It does not rank Local Aroma or Trust Me Recipe.
- The written data rule says Trust Me Recipe is manual-only, while `buildIssues.js` will allocate it if an Approved candidate carries that section. That inconsistency must not leak unnoticed into the console.

### 2. Required for clean preference-pair capture

| Feature | Cost | What breaks without it |
|---|---:|---|
| Immutable decision-event record | M | Mutating IssueItems alone destroys the evidence that A was originally above B. |
| Stable identities for both candidates | S | Titles are not identifiers. Store Airtable record IDs, `UniqueEventID`, series key and occurrence/date. |
| Ranking provenance | M | Every decision needs issue, section, original ranks, displayed scores, ranking recipe/model version and candidate-text hash. Otherwise future training mixes decisions produced by different systems. |
| Exact choice-set snapshot | M | Knowing B replaced A is insufficient if the available alternatives are unknown. Exposure and position bias cannot be separated from preference. |
| Feasibility at decision time | M | A clean pair requires A and B to have been feasible for the same editorial slot. If B violated venue, date, lock or cross-issue constraints, the action is not ordinary preference evidence. |
| Lightweight decision-type split | S–M | “Prefer B” is different from “A has bad data,” “A is cancelled,” “wrong section,” or “duplicate listing.” Training all of these as rank preferences teaches the model to compensate for pipeline defects. A minimal split could be `editorial preference / unusable or incorrect`; a large reason taxonomy is unnecessary. |
| Record what information the editor consumed | S–M | If the editor opens the source link and discovers information absent from model input, the decision is an end-to-end information failure, not clean evidence that the ranker misordered the text it saw. |
| Append-only raw actions plus derived final pairs | M | If the editor goes A→B→C, recording both swaps naïvely asserts B>A and C>B even though B may only have been provisional. Raw actions should remain auditable; training pairs should derive from the submitted final state. |
| Undo with explicit reversal semantics | M | Deleting the first event or writing an opposite pair leaves ambiguous or contradictory labels. |
| Idempotency key and write outcome | M | Retries must not create duplicate preference pairs. The event also needs to say whether the corresponding IssueItems change committed successfully. |
| No inferred preferences from non-actions | — | Leaving a model pick untouched does not prove it was preferred to every alternate; the editor may never have considered them. Treating exposure as endorsement contaminates labels. |

The critical definition is narrow:

> A training pair means: both candidates were visible or explicitly compared, both were feasible for the same slot, the editor chose B over model-higher A for editorial reasons, and the final submitted state retained that choice.

Anything weaker should remain logged but excluded from the initial training set.

### 3. Genuinely optional

| Feature | Cost | What it buys / what happens without it |
|---|---:|---|
| Text search | M | Helps rescue a known event. Without it, the editor uses ranked expansion or opens Airtable. |
| Simple date/source filters | M | Useful if alternates remain deep; not needed to prove the swap workflow. |
| Side-by-side comparison | M | Reduces memory load on difficult calls. Cards plus a Replace drawer may be enough. |
| Short free-text note | S | Valuable research context, but requiring it would suppress swaps. |
| Rich reason taxonomy | M–L | Better diagnostics in theory; usually produces inconsistent sparse categories and added friction. |
| Previous-issue history | M | Helps avoid editorial repetition, but this is a separate constraint unless the current workflow already depends on it. |
| Mobile-specific optimization | M–L | Required only if Sunday work is primarily on a phone. Basic responsiveness is not the same as a deliberately mobile workflow. |
| Model confidence display | S | Cheap technically, costly cognitively. It may anchor the editor and has no trustworthy product interpretation yet. |
| Saved alternate lists or favourites | M | Convenience, not core selection or training integrity. |
| Analytics on editor/model agreement | L | Useful after enough real decisions exist. Before that it is a dashboard over noise. |

## B. Features not to build

These are plausible and mostly wrong for this budget:

- A general-purpose editorial CMS. Do not add candidate creation, source management, ingestion controls, rich-text production and newsletter preview. The console’s job is selection.
- A full Airtable replacement or Postgres migration. It introduces data synchronization before the workflow is proven.
- A model-monitoring dashboard. The R7 readout is not interpreted and the ranker does not exist. A dashboard cannot manufacture a valid metric.
- Score explanations, feature attributions or “why this was recommended.” The live order has no defensible quality semantics yet; explanations would lend it false authority.
- Visible numeric model scores by default. They anchor the editor and turn instinctive selection into score adjudication.
- Autonomous rejection controls. §78 says score and sort, never delete. The console should not quietly resurrect the rejected branch.
- Drag-and-drop across sections. It looks natural but makes section provenance, quotas, venue feasibility and pair semantics much harder. A constrained Replace action is cheaper and clearer.
- Multi-user roles, comments, approvals and mentions. There is one editor and one Sunday session.
- A notification centre. A direct weekly link is enough; building notification state is not.
- A dedicated issue-management screen. The editor should land in the current issue, not administer issues.
- Infinite scrolling through the entire pool. It converts ranked decision support back into manual triage.
- A full faceted-search system. If ranked expansion plus a small search field is inadequate, the ordering/product premise needs examination before more browsing tools are added.
- Thumbnail ingestion, maps or image galleries. They add data failure modes and visual weight without addressing the recorded hard-pick criteria.
- Inline blurb generation or blurb editing. Selection must settle before downstream copy generation. Combining them makes every swap expensive and emotionally harder to reverse.
- Automatic online learning after each swap. The volume is tiny, labels are confounded, and model/version governance does not exist.
- A large reason-code taxonomy. It will slow the editor and produce fake precision.
- Real-time collaboration, websockets, offline/PWA support or native apps.
- A/B testing infrastructure. One editor cannot support meaningful product experimentation.
- A new “preference score” written back onto Candidates. A Sunday choice is contextual to issue, section, competitors and constraints; turning it into a global candidate attribute destroys that context.

## C. Write-path options

### Option 1: Patch IssueItems immediately on every swap

Keep the IssueItem record and its Section/Slot, replace the Candidate link, refresh copied candidate fields, and append the preference event.

Advantages:

- Immediate downstream truth.
- No separate Submit operation.
- The editor sees exactly what Airtable contains.

Failure modes:

- Airtable provides no transaction spanning the preference event and IssueItem patch. One can succeed while the other fails.
- The current allocator deletes every unlocked future IssueItem and rebuilds it. An unlocked console swap can disappear on the next `connectAirtable.js` run.
- Automatically locking every swap preserves it, but changes `Lock` from “final protected decision” to “anything ever touched.”
- A second swap must not overwrite a now-locked row.
- Existing DisplayTitle, Description and CTA belong to the outgoing candidate and must be cleared or regenerated. Leaving them produces plausible candidate/copy mismatches.
- An alternate may already occupy a different issue. Patching it into the current issue can duplicate a Candidate unless the other assignment is handled.
- Mid-session writes expose provisional choices to the blurb generator.

### Option 2: Persist a console draft, then apply the complete issue on Submit

Store the draft and raw decision events separately. On Submit, refetch Airtable, validate the whole issue, write the final IssueItems and mark the resulting slots locked according to an explicit policy.

Advantages:

- Provisional experimentation does not affect production.
- Training pairs can derive from the final state rather than every transient click.
- Whole-issue validation is possible before any production write.
- A single “issue ready” boundary matches downstream generation.

Failure modes:

- Requires durable draft storage and resume behavior.
- “Submit” is an extra concept the editor must understand.
- Airtable batch operations still are not fully transactional; partial commit needs an idempotent retry or reconciliation record.
- If the page is stale, Submit must stop and explain the conflict rather than overwrite it.
- Downstream scripts remain stale until submission.

### Option 3: Write swap intents only; apply them through a reconciliation script

The console records decisions. A developer/operator runs a script that validates them and updates IssueItems.

Advantages:

- Strongest auditability.
- The existing allocator can remain untouched initially.
- Failures can be reviewed before production mutation.

Failure modes:

- The console does not actually finish the editor’s work.
- It adds a handoff and a person-dependent Sunday operation.
- Preference state and production state can drift.
- The blurb/export pipeline may run before reconciliation.

This is viable as a shadow instrument, weak as an adopted product.

### Option 4: Treat submitted selections as pinned allocator inputs

Extend allocation so editor choices become explicit fixed assignments; rerun allocation around them for remaining slots and future issues.

Advantages:

- Constraints remain centralized in allocator logic.
- Cross-issue effects can be resolved systematically.
- Human decisions survive later reruns.

Failure modes:

- This changes the allocator contract, not just the UI.
- Current `buildIssues()` understands locked assignments, not preference directives, displacement or reallocation.
- Rerunning around a swap may move unrelated events, making the editor’s one action produce surprising downstream changes.
- It is the largest write-path option.

### Option 5: Manipulate Candidate fields and let the existing allocator recreate the desired result

Examples include changing `Score_Final`, `SegmentSuggested`, Status or approval state.

This should remain in the option space only as a warning. It contaminates global candidate truth with one issue’s contextual decision, changes future allocations and destroys clean training provenance.

### Constraints every mutating option must enforce

The console cannot merely validate “five cards remain”:

- Never overwrite an IssueItem with `Lock = true`.
- Preserve five slots for Families, Couples and Golden; clarify treatment of Local Aroma and Recipe.
- Enforce the `IssueDate+1` through `IssueDate+10` start-date window.
- Allow at most one nonblank `LocationName` per section and issue, including locked picks.
- Treat blank venue exactly as the allocator does unless a new data rule is consciously authorized.
- Do not allocate one Candidate across multiple future issues.
- Keep slots unique and sequential.
- Only offer eligible/Approved candidates under the current allocator contract.
- Resolve recurring-series duplication before presenting alternatives.
- Detect a stale issue version before writing.
- Clear or regenerate all candidate-derived IssueItem copy after replacement.

## D. Adoption

### What could make him open it

- A Sunday link that lands directly on this week’s already-built issue.
- No Airtable navigation and no setup.
- The whole decision surface visible immediately: 15 picks, a few credible alternates, one compact action to replace.
- Faster initial load than opening and orienting in Airtable.
- The fields he actually uses for hard calls, in the order he uses them.
- Source links that open without losing console state.
- An obvious completion state: “Issue saved” or “Issue submitted.”
- Confidence that reopening the link resumes exactly where he left off.
- A visible but nontechnical explanation of constraints: “Unavailable—same venue already selected,” not an allocator error.
- A reliable weekly readiness time. If the issue is not ready when his Sunday hour begins, the habit never forms.
- A manual escape route when the ordering is weak.

### What will make him abandon it

- A login ceremony, issue picker or onboarding screen.
- More than one operational handoff after he finishes.
- Being asked to label, explain or score every decision.
- Seeing hundreds of candidates.
- Repeated listings presented as distinct choices.
- Model scores or jargon replacing editorial information.
- Missing time, venue, price or other fields he actually relies on.
- Clicking links and returning to lost scroll/state.
- Alternates that cannot legally be selected.
- A swap that later disappears because the allocator rebuilt unlocked rows.
- Stale blurbs attached to newly selected candidates.
- An ordering bad enough that he has to search Airtable anyway.
- A system that asks him to rescue the model rather than helping him finish the issue.

The data-capture purpose cannot be allowed to become visible labour. If clean signal requires a questionnaire after every swap, clean signal volume will be zero.

## E. Human decisions required before building

| Question | Consequence of guessing wrong |
|---|---|
| What exact facts does the editor weigh on a hard pick? | The cards omit decisive information or become bloated. This remains unanswered in the latest meeting note. |
| What device does he use on Sunday, and how does he expect to receive the link? | A desktop-efficient interface may be unusable on his actual device; mobile optimization may consume the budget unnecessarily. |
| Are V1 sections only Families, Couples and Golden, or also Local Aroma and Recipe? | The current scorer cannot provide equivalent rankings for all five, and Recipe’s written/manual rule conflicts with allocator behavior. |
| What produces the launch ordering before R6 exists? | Choosing `P(include)`, section probability, `Score_Final`, or a blend is a model/product decision. Each means something different; none is currently “best event.” |
| Must the sealed R7 readout hold before showing gate-based ordering? | Launching first risks anchoring the editor to an invalid order; waiting changes the console’s timing and possibly its data source. |
| What does `Lock` mean operationally? Per swap, per slot, or whole submitted issue? | Too early prevents correction; too late allows allocator reruns to erase editorial decisions. |
| Are changes immediate or submitted as a batch? | This determines draft storage, downstream visibility, pair derivation and failure recovery. |
| Can a current-issue choice displace a candidate already allocated to a future issue? | Disallowing it hides valid alternates; allowing it creates cross-issue reallocation work and surprise. |
| Does the editor select a recurring series or a specific date occurrence? | Series deduplication without occurrence selection can write the wrong date into IssueItems. |
| Which actions count as ranking preference versus bad/missing data? | Guessing makes the training target incoherent. |
| Is opening the source link recorded automatically, and is that acceptable? | Without it, missing-information failures are mislabelled as ranking failures; with it, tracking expectations need to be explicit. |
| Must five slots always be filled? | “Up to five,” “exactly five,” and “leave blank pending manual pick” produce different validation and completion rules. |
| May the editor intentionally override venue diversity? | Allowing it means the console and allocator have different rules; forbidding it may conflict with editorial judgment. |
| What happens when Airtable or the console fails Sunday? | Without an agreed fallback, the editor either loses the hour or returns permanently to the old workflow. |
| Who owns the post-submit step: blurb generation and Beehiiv export? | If the console appears finished but another invisible step remains, its time-saving promise is false. |

## Ruthless scope-cutter voice

Against a two-week part-time budget, every separate screen is guilty until proven necessary.

- **Review screen:** justified. It contains the current issue, three model-supported sections, picks, alternates, swap state and completion.
- **Submit confirmation:** justified only as a state or small dialog inside the review screen—not a second workflow.
- **Login screen:** avoid if secure-link or existing platform authentication is acceptable.
- **Issue picker:** not justified for one editor working the current Sunday issue. Deep-link the issue.
- **Candidate detail screen:** not justified. Expand the card or open the source.
- **History screen:** not justified.
- **Analytics screen:** not justified.
- **Model-performance screen:** not justified.
- **Settings screen:** not justified.
- **Reason-entry screen:** not justified. At most, one lightweight inline distinction after a swap.
- **Blurb editor:** not justified.
- **Admin console:** not justified.

The budget can buy one reliable decision surface and one safe write boundary. It cannot also buy a CMS, model lab, analytics product and workflow manager. If any second screen is proposed, it must remove more Sunday minutes than it costs to build and maintain.
~~~
