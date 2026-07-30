# R7-W6 — None-Split Labelling Plan (239 rows)

**Status: LIVE RUNBOOK (verified against Airtable 2026-07-30).** Written 2026-07-26 from the editor's
first 12 rows; rewritten 2026-07-27 to match `Decision_Log.md` §75; §0 replaced 2026-07-28 when the
instrument collapsed to one multiselect; reconciled to the live deck and call-prep audit on 2026-07-29;
all 239 labels and the repeatable QC audit recorded 2026-07-30.
This doc is the only home for the instrument design, sitting protocol, and sitting log — there is no
separate meeting doc.

**Type: Release-working.** Implements `R7_Scope.md` Step 1; delete or archive at R7 close.

**Live deck state (2026-07-30):** all 239 `Section=None` rows carry `NoneReason` — gate 89/89 ·
train 124/124 · walkthrough 12/12 · not-in-model-set 14/14. `PreMarked` remains a machine hint,
never an editor label; `OutsideGTA` remains factual provenance. Labelling is complete, but QC still
blocks evaluation: adjudicate the audit's target conflicts, evidence mismatches and missing reasoning
before `gate_step4a.py` consumes the split.

---

## 0. The instrument — ONE field, **6 options**, multiselect (revised 2026-07-28, Ariel's call)

**`NoneType` is deleted. `NoneReason` (multiselect) carries everything.** Tick every option that
applies; more than one is normal and expected.

⚠️ **An 8th option, `outside window`, was drafted and cut the same day (Ariel).** No deck row can be
outside the window — the 456 were drawn from candidates R1's `DateWindow` node had already filtered to
+30 days. More fundamentally, a date is a **pure record fact the machine knows exactly**, so asking a
human to tick it violates this doc's own rule (*record facts are detected, never asked*). `non-GTA`
survives that test only as a **fallback**: the deck predates the #109 geo guard, non-AllEvents sources
expose no address field, and the editor may spot "Savannah" while reading — so his tick can add
information the machine lacks. A date never can.

| Option | What it means (editor-facing) | Routes to |
|---|---|---|
| **non-GTA** | Not in the GTA — including listings that *say* a GTA city but are elsewhere (there is a Richmond Hill in Georgia and one in New York). | Stage 0 |
| **B2B / professional dev** | Aimed at businesses, or at people in a professional role — training, certification, career advancement, networking. Not at readers as residents. **Adjacency always counts** (Ariel's 07-27 ruling — no case-by-case). | the gate |
| **civic** | Municipal/government business: council meetings, public consultations, zoning, official plan. | the gate |
| **wrong fit / not our audience** | Breaks no rule, but he'd never run it, any week. Includes **too niche** — appeals to one community rather than across them. | the gate |
| **outcompeted** *(name TBD-from-editor)* | A good event that lost its slot **this week**. | R6's ranker (withheld from the gate) |
| **can't tell** | Not enough information to decide. | excluded from both |

### Why one field and not two

The four-way `NoneType` + scoped `NoneReason` design (§75) **forced a single answer where a row often
has more than one thing wrong with it.** That is the same failure shape as the three-way instrument the
pilot broke — forcing a single answer where reality is plural — moved one level over.

Two other things pushed it: **§76 broke `NoneType`'s one-bucket-one-consumer property** (content rules
route to the gate, not Stage 0, so `Rule-break` no longer mapped to one stage), and a two-field design
means routing can **fail silently** when the second field is blank.

⚠️ **Correction to §75's stated reasoning:** the argument that `NoneReason` was "the field he fills 0/12"
is **withdrawn**. The 0/12 was a **UI affordance failure** — the multiselect requires clicking a `+` and
the editor never saw it. It is an untested field, not a rejected one. That does not change the decision,
but it removes the reason §75 gave for it.

### The routing order (ours — the editor never sees it)

Multiselect means a row can carry `non-GTA` **and** `B2B / professional dev`. Routing resolves in this order:

1. **`non-GTA`** → Stage 0 delete. *Facts act first: the row is deletable regardless of what else is ticked.*
2. **`can't tell`** → excluded from everything.
3. **`wrong fit`, `B2B / professional dev`, `civic`** → the gate's negatives.
4. **`outcompeted` alone** → reserved for R6's ranker; **withheld from the gate.**

**Why `outcompeted` ranks last:** it is the weakest claim and the most damaging if wrong (§75 withholds
it from the gate because it is a property of the week, not the event). Anything else ticked beats it,
so a confused double-tick **fails safe — into the gate, never out of it.**

### What the change bought immediately

Both **contested** pilot rows dissolve, with no adjudication needed. *GODfidence Conference* (r25) was
breadth-vs-B2B: tick `wrong fit` **and** `B2B / professional dev`. *Zumba Instructor Training* (r36) was a
professional-development fact against a popularity verdict: tick `B2B / professional dev` **and** `wrong fit`. **The `Rule-break` definitional
question — "does a rule *apply*, or is it *why* I rejected it" — is dissolved, not answered.** Both are
recorded; routing decides the rest.

### The 12 pilot rows — remap to the flat field

Re-derived 2026-07-28 from the four-way draft. Ten are a two-minute confirm; two need a genuine re-look.

| Row | Event | Ticks | Conf |
|---|---|---|---|
| 6 | First Day Preview: Markham Edition | `wrong fit` | LOW — ⚠️ the event is a **YorkU prospective-student open day**, not the "professional training" his note describes. Verdict stands on his own ground ("my focus is entertainment"); the *reason* doesn't match the event. Confirm out loud. |
| 11 | Effective Vendor Management Training | `B2B / professional dev` | HIGH — was two ticks under the split options; the merge makes it one |
| 12 | Geocaching & Orienteering with BIAYR | `outcompeted` | HIGH — the only pilot row that passes the slow-week test |
| 20 | Indigenous Hockey Equipment Drive Golf Tournament | `wrong fit` | HIGH (breadth) |
| 24 | Internet Marketing Fundamentals Training | `B2B / professional dev` | HIGH |
| 25 | GODfidence Conference 2026 | `wrong fit` + `B2B / professional dev` | HIGH — *was contested under four-way; multiselect resolves it* |
| 29 | Spring Colours - Album Release Show | *(blank — re-ask)* | no reasoning recorded, cannot remap honestly |
| 30 | Unbreakable Minds Community Event | `wrong fit` | HIGH |
| 33 | Bona Sport Program: Hands-On Training | `wrong fit` | HIGH — a consumer sports clinic; the scan false-positived it on "Training" |
| 34 | TPM North — Shabbat Korach | `wrong fit` | HIGH (breadth) |
| 35 | Love as a Foreign Language Book Tour | `wrong fit` | HIGH |
| 36 | Zumba Instructor Training | `B2B / professional dev` + `wrong fit` | HIGH — *was contested under four-way; multiselect resolves it* |

**The headline holds: only 1 of his 6 `Outcompeted` rows survives as outcompeted.** Under the old
instrument R6's ranker positives were being over-stated ~6×, and the pilot's real signal is
`wrong fit` — the bucket that did not exist — at roughly 55% of rejections.

**Scan-agreement, measured on the 12** *(n=12, 2026-07-27, keyword scan of the four written rules)*:
**50.0% against his raw three-way labels · 91.7% against the remap.** The scan did not improve between
those two numbers — **the taxonomy did.** Three of the six raw-label disagreements are rows where he
used `Ineligible` to mean *"too niche."* ⚠️ Do not promote 91.7% to a bar: n=12, the four-way column is
our reading rather than his confirmation, and the full-239 precision is **78%** — the worse number is
the one that governs the pre-sort decision.

---

## 0b. The breadth criterion — new, editorial, and it lives at the gate

The Brief requires an event to appeal **across** communities rather than single one out
(*"Russian party"*, *"Muslim food court"*). **Horizontal, not vertical.** This has governed selection
for 15 months and had never been written down — CLAUDE.md's reject list names only
B2B / civic / prof-dev / non-GTA. Three of the editor's four `Ineligible` pilot rows are breadth
rejections that break no written rule, and his frozen 07-18 notes (*"too niche. has to appeal to
multiple communities"*) show the criterion pre-dates our instrument.

**It belongs in `Wrong fit`, and never in Stage 0 — this is measured, not stylistic.** Stage 0
hard-deletes, so it may act only on facts; a deleted keeper is invisible and unrecoverable. Breadth
requires *reading* the event: *Italian Festival* is open and a keeper, *Shabbat Korach* is
single-community and a reject — same keyword class, opposite verdicts. A religion/nationality regex
separates them at only **1.7×** (9.3% of Nones vs 5.5% of includables, n=396) and would have deleted
ten measured keepers including *Vaughan Asian Festival* and *Soul Food Caribbean Festival*. Raw-pool
prevalence is 6.2% (112/1,805), so the pool is not disproportionately single-vertical either.

**The keyword flag is PARKED entirely** until the gate's confusion matrix shows it is needed —
also because of the **feature budget**: 456 labelled rows against ~2,048 embedding dimensions is
already 4.5× overdrawn, and every added column is a fresh chance to overfit. (Same reason `Organizer`
is unsafe as a one-hot — count- or threshold-encode it if it enters at all.)

**TBD-from-editor:** the *sentence* he will apply consistently over the remaining rows. Ariel has the rule; the
phrasing must be the editor's. Ask him to complete: *"An event is too niche when ______."*

---

## 1. The workflow — live sittings, text-first

**Superseded:** the solo async workflow, and the 25-row pilot that was to precede the bulk.
**The first 12 rows *are* the pilot** (§75) — a solo pilot now has no consumer.

**The format:** finish the representative **gate slice**: 89 total, 25 resolved, **64 still requiring
an editor touch**. Sitting 1 also cleared low-hanging rows from train / walkthrough / not-in-model-set;
that work is retained but does not substitute for the representative gate split. Work in blocks of
~40–60 rows (~30–40 min each). Text-first means he calls it from `Event` + `Details` **before** the link
is opened; if he needs the link, open it and record what it changed.

**Why live rather than async:** it converts a self-report into an **observed behaviour**. The retired
`NeededLink` asked an editor habituated to opening every link for 15 months to report a counterfactual
about his own reasoning — that measures habit, not necessity (it correlated with nothing: ticked on
both real-prose rows, blank on 5 of 7 metadata-only rows). Watching him is the only honest instrument.
It also beats the cheaper LLM-based ceiling estimate for one reason: it names the missing **feature**
rather than merely sizing the gap.

**Per row, in order:**

| # | Action | What to record |
|---|---|---|
| 1 | Read only `Event` + `Details`. Do not open the link yet. | Nothing until he has a text-only call. |
| 2 | Ask whether any permanent reject reason applies. | Tick **every** applicable option: `non-GTA`, `B2B / professional dev`, `civic`, `wrong fit / not our audience`. Do not stop after the first tick. |
| 3 | If no permanent reason applies, ask: **"Would you run this in a quieter week?"** | Yes → `outcompeted`. No → `wrong fit / not our audience`. |
| 4 | If the event itself is too unclear to judge, use `can't tell`. | State what information is missing in `NoneReasoning`. |
| 5 | Only if needed, open the link and let the real event override the text. | Write what the link added or changed in `LinkGave`; revise `NoneReason` if necessary. |

`NoneReasoning` gets one short line for `wrong fit`, `outcompeted`, or `can't tell`. Obvious factual
or professional-rule rows do not need prose unless the editor's reason differs from the visible hint.

### The two sentences that fix most of the pilot's errors

> **Outcompeted means you would be happy to run it. If you would not run it on a slow week either,
> that is Wrong fit — not Outcompeted.**

Five of his six Outcompeted pilot rows fail that test (*"people don't like such events"*, *"this type
of events is not popular"*, *"readers normally look for more interactive activities"*, *"more
individual rather than for couples or families"*). All are permanent verdicts. **Only one of six
survives as genuinely Outcompeted** — which means the three-way instrument was over-stating the R6
ranker's positive pile by roughly 6×.

> **`can't tell` is about the event, not about these instructions.** If the *event* is unclear, tick
> `can't tell`. If the *instruction* is unclear, pick your best guess and say so in `NoneReasoning` —
> then flag it so we can fix the instruction.

Both rows he called Ambiguous under the retired instrument are clear professional-training rejections
where he stated the reason correctly and still could not find the branch. That was an instrument defect,
not his error.

---

## 2. The link — `LinkGave` replaces `NeededLink`

`NeededLink` is **retired** (§75). In its place, a free-text field filled *after* the text-first call:

> **`LinkGave` — what did the link tell you that the text didn't?** Leave blank if the text was enough.
> One line: *"it's in the US"*, *"sounded like a class, it's actually a drop-in"*, *"kids only"*.

Blank is a real answer. The distribution of what links add — not how often they were opened — is what
tells us which **feature** to build.

**If the text and the link disagree, the link wins.** Label the event as it truly is and write what the
link told you. A correct label plus a recorded gap beats a wrong label that matches our data.

**What from the link should affect the label:** what the event actually is, who it's for, where it is,
whether it's real. **What should not:** how the page looks, ticket sales, the organizer's follower count.

**Tell him "View Details" exists.** Some AllEvents pages collapse the full description behind it —
he found this himself (#108), and it is why ~40% of these rows looked textless.

---

## 3. The text he is reading — live state

**The deck is ready.** B3/B4 recovered 111 AllEvents descriptions, removed the duplicated-title and
trailing-navigation artifacts, and wrote the cleaned text uncapped into `Details` (110 writes; one row
already current). Verification after the write: 111 current, zero pending, zero conflicts.

This deliberately improves the editor's information before labelling. It means the sitting now measures
the ceiling of the **improved deck text**, not the original sparse collection. `LinkGave` still measures
what remains missing after that improvement.

Do not tell the editor about the backfill mechanics row by row. The only relevant instruction is:
**read all of `Details`; for AllEvents, use "View Details" if the page initially looks collapsed.**

Production remains separate:

- R1/R2 do **not** fetch these detail pages yet.
- Raw text remains preserved in the store.
- `clean()` has one shared Python definition in `models/sectioning/text_recipe.py`, but the serve side
  does not exist until W7.
- Arm 2 under #108 decides whether recurring AllEvents fetching and a new `DESC_CHAR_CAP` ship.
- The cached arm-1 model still reflects the old capped representation; do not claim current deck text
  equals current model text.

Model-only follow-ups — not sitting work: sweep the cap, test the source-category leak, and compare
arm 1 against the backfilled arm 2.

---

## 4. Failure points and safeguards

| # | Risk | Safeguard |
|---|---|---|
| 1 | **Wrong-fit rejections land in Outcompeted** (5 of 6 in the pilot) | The slow-week test in §1. Highest-value single fix. |
| 2 | **`can't tell` used as "the instructions are unclear"** (2 of 2 in the pilot) | "`can't tell` is about the event, not the instructions." |
| 3 | **`NoneReason` left blank** | Every completed row needs at least one tick. Show the multiselect `+` before row one. |
| 4 | **Only the strongest reason ticked** on multi-reason rows | Multi-select on purpose. "A German business webinar in Hamburg is three ticks, not one." |
| 5 | **Similar events labelled differently** — Rows 24 and 11 are both AdeptSkil 1-day workshops; one was Ineligible, one Ambiguous | Post-hoc consistency sweep by organizer and title keyword. Ours, not his. |
| 6 | **Guessing when the event is unclear** | `can't tell` exists so he never has to. A high count is a *useful* result. |
| 7 | **Link-only information baked into labels** the model can never see | Text-first ordering + `LinkGave` turns this into a measured stratum instead of silent contamination. |
| 8 | **Fatigue drift** over 214 blank rows | 40–60 rows a sitting. The **11 unannounced repeat pairs** measure drift for free — **do not tell him they exist.** |
| 9 | **Slice pooling** — 239 = **89 gate / 124 train / 12 walkthrough / 14 not in model set**. Only the gate slice is representative | Compute every proportion on the 89 alone. |
| 10 | **The wrong slice is worked first** | Before the call, filter/group the view so `Slice=gate` is first. Gate has 8 resolved, 17 hinted/unlabelled, 64 unhinted/unlabelled. |
| 11 | **Templated professional events eat attention** — 18 None rows are AdeptSkil templates | `PreMarked` brings them into the hint block. The editor still touches each row; do not bulk-author labels for him. |
| 12 | Editor edits `Section` / `Flag` / `Label` | Frozen in the table description; the 07-26 snapshot detects drift on exactly those fields. |

### The call-prep pre-sort — LIVE

**Decision remains: pre-sort, never subjective pre-label.** `PreMarked` is visibly a guess and writes
no editor answer. `OutsideGTA` is different: it records a machine-established fact and is allowed to
write `NoneReason=non-GTA` because the provenance remains visible.

The 2026-07-29 full-row audit replaced the raw keyword result with the call-ready state:

- **63 `PreMarked` rows** — up from 46 after adding 27 strong misses and removing 11 misleading tags.
- **15 `OutsideGTA` facts** — the original 14 address-derived rows plus r103, whose recovered text
  repeatedly locates the event in Ottawa despite its Richmond Hill URL.
- **25 rows already carry `NoneReason`; 214 remain blank.**
- **18 AdeptSkil rows** are all visibly hinted; two were already editor-confirmed.
- Gate slice: **8 resolved + 17 hinted/unlabelled + 64 unhinted/unlabelled.**

False-positive examples deliberately removed: *Leonid & Friends* ("Chicago" is the band whose music is
performed), the Karin Slaughter author talk ("Georgia" is the novel's setting), a youth soccer event
whose description mentions a leadership program, and a children's baseball clinic that says
"training." This is why `PreMarked` must stay a hint.

**During the call:** work the hinted block first, but let the editor tick each row. Do not announce the
repeat pairs or say "these are all the same"; that would destroy the self-consistency check. When a hint
is wrong, leave `PreMarked` untouched as audit evidence and enter the editor's real `NoneReason`.

### Language and "not an event" — operational ruling

Neither becomes a Stage-0 rule or a new field option. The audit's supposed cases were themselves mixed:
the two *Theatre Workshop Sign-up Form* rows resolve to a real theatre event after backfill; *Russian
Nights* is a real local party; *Hebrew Storytime* is bilingual; *July Book Sale* is plainly an event.
Treat language and event-ness as content judgments using the six existing options. The editor's policy
on non-English listings is still asked once in the opening and recorded under TBD-from-editor.

---

## 5. Making the labels usable for future model rating

**Arm 1's cached representation:** `title + clean(DescriptionRaw)`, capped at 300 characters. There is
still no serve-time gate in R1/R2; §70's score==serve invariant is a design requirement, not a live
property. The editor now sees improved, uncapped `Details`, so the deck and cached arm 1 are no longer
byte-aligned. Arm 2 is the test of whether that richer text improves the gate enough to justify
production fetching.

**No link, images, price, venue, city, or organizer enters arm 1 as a separate feature** (the
AllEvents category block leaks into some historical `DescriptionRaw`; that is a bug, not a feature).

So: **any label that depends on link-only information is not learnable from the current features.**

**Do not solve it by degrading the labels.** The temptation is "label as if you were the model."
Resist it: that produces labels that are wrong about the world, and labels outlive feature sets.
Three moves instead:

1. **Measure it.** The text-first sittings give the share of rows where the **improved deck text** was
   still insufficient, and `LinkGave` names *what* remained missing. The original sparse-text ceiling
   is intentionally no longer recoverable after B3/B4.
2. **Stratify the eval.** Report gate recall twice — on text-sufficient rows and on link-needed rows.
   If the gate is fine on the first and hopeless on the second, the diagnosis is **features, not
   model**, and no amount of fitting fixes it.
3. **If the link-needed share is still large, the answer is richer collection/features, not a fancier
   model.** In rough cost order: ship the measured AllEvents detail-page fetch if arm 2 wins → raise
   `DESC_CHAR_CAP` → add `City` / `LocationName` / `CostRaw` / a bounded organizer signal. Mind the
   feature budget (§0b) on the last one.

---

## 6. Quality control

**Per-row checklist:**
1. Does `NoneReason` contain at least one option?
2. Is **every** applicable permanent reason ticked, not just the strongest?
3. If `outcompeted`: would he genuinely run it in a quieter week?
4. If `wrong fit`, `outcompeted`, or `can't tell`: is there one short line in `NoneReasoning`?
5. If the link was needed: does `LinkGave` say what it added or changed?
6. Are `Section` / `Flag` / `Label` untouched?

**The first 12 are remapped, not redone.** Ten already carry the flat-field remap. **Rows 6 and 29
remain blank and need a genuine re-look** — row 29 had no reasoning; row 6's recovered description
shows a YorkU prospective-student open day, not the professional training described in the old note.

**Consistency sweeps (ours, after the fact, not his):**
- The **11 unannounced repeat pairs** inside the 239 — a free self-consistency rate on the new labels.
- Group by organizer and by title keyword; any group with materially different `NoneReason` gets a second look.
  Start with AdeptSkil, which already has a known inconsistency.
- Verify that every `OutsideGTA` row also carries `NoneReason=non-GTA`; provenance and label must agree.

**Final review pass:** every row with a non-empty `LinkGave`. Those are the labels whose correctness
depends on information the model will never have — the stratum from §5.2.

**Pace:** 40–60 rows a sitting, ~30–40 minutes. Expect two sittings for the gate slice and roughly
three more for the remaining slices.

---

## 7. The sitting — live protocol

This is a working labelling session, not a demo. Ariel controls Airtable; the editor makes the calls.
Do not teach the model, defend the hints, or explain the experiment while he is deciding.

### 7.1 Before the editor joins — five minutes

1. Open the `Negatives labelling` view.
2. Put `Slice=gate` first and hide already-completed rows (`NoneReason` is not empty). The working
   population should be **64 rows**.
3. Confirm the visible group is **`Slice=gate` → `Flagged=unflagged`**. The 17 hinted gate rows were
   completed in Sitting 1.
4. Keep these columns visible, in order: `Event` · `Details` · `PreMarked` · `NoneReason` ·
   `NoneReasoning` · `Link` · `LinkGave`. Keep `OutsideGTA` visible as provenance if a factual row
   appears. Do not expose modeling columns.
5. Record Ariel's split prediction in the log below **before** seeing new labels.
6. Set a 35-minute working window. Stop around 40–60 rows or earlier if the editor starts rushing.

### 7.2 What Ariel says at the start

> "Last time I gave you two dropdowns and the setup made you choose one reason even when several were
> true. I fixed that. Now there is one field, and you can tick more than one reason.
>
> Before today, we did the mechanical work we could safely do. We recovered missing descriptions,
> removed obvious out-of-area events where the location was factual, and grouped likely business or
> professional events. The `PreMarked` column is only our guess — it is not your answer, and you should
> override it whenever it is wrong.
>
> We still need your judgment on whether an event is permanently wrong for the Brief or whether it was
> simply good but lost its slot that week. We will read the title and description first. We only open
> the link if the text is not enough."

Then show the multiselect mechanics:

> "To add a reason, click the `+`. If two reasons apply, tick both. For example, an out-of-area
> business seminar gets both `non-GTA` and `B2B / professional dev`."

**Do not start row one until the editor has personally added two ticks in the field once.** The hidden
`+` affordance caused the pilot's 0/12 `NoneReason` result.

### 7.3 Settle three vocabulary calls once

Ask these once, record the answer, then use it consistently:

1. **Ranking word:** "When an event is good enough for the Brief but loses because stronger events took
   the slots that week, what word would you naturally use?" Keep the Airtable option `outcompeted`
   during this sitting; record his preferred word for a later schema decision.
2. **Breadth sentence:** "Finish this sentence in your own words: an event is too niche for the Brief
   when ______."
3. **Language policy:** "If a real local event is listed partly or fully in another language, is that
   automatically out, potentially usable, or does it depend? If it depends, on what?"

Do not debate the answer. Ask one concrete example only if the rule is still ambiguous.

### 7.4 Per-row loop

1. Ariel reads the `Event` and enough of `Details` aloud for both people to know what it is.
2. If `PreMarked` is present, say only: **"The machine suspects this may be B2B/professional/civic.
   Agree or disagree?"** Never say the machine is confident.
3. Ask: **"Which permanent reasons apply?"** Tick every applicable permanent reason.
4. If none applies, ask the decisive question: **"Would you run this in a quieter week?"**
   - Yes → `outcompeted`.
   - No → `wrong fit / not our audience`.
5. If the event itself is unclear, use `can't tell`; do not force a guess.
6. Add one short `NoneReasoning` line for `wrong fit`, `outcompeted`, or `can't tell`.
7. Open the link only if the editor says the text is insufficient. If the link changes or completes
   the decision, record exactly what it added in `LinkGave`.
8. Move on. Do not discuss whether the model could learn the label.

### 7.5 Phrases Ariel should use

- **When `outcompeted` is drifting:** "Would you genuinely run it if next week were quiet?"
- **When the editor gives a popularity reason:** "Is that permanent, or only true because this week's
  alternatives were stronger?"
- **When several reasons apply:** "Tick all of them; we resolve the routing later."
- **When the hint is wrong:** "Good — the hint is allowed to be wrong. What is your actual reason?"
- **When the event is unclear:** "What information is missing?" Record that; do not solve it for him.
- **When the link is requested:** "Before we open it, what is your best call from the text alone?"

### 7.6 What Ariel must not do

- Do not tell him about the 11 repeat pairs.
- Do not bulk-confirm a repeated family; he still touches each row.
- Do not change or erase `PreMarked` when it is wrong — the disagreement is audit evidence.
- Do not lead with "this looks B2B" on unhinted rows.
- Do not turn `wrong fit` into a catch-all without capturing the reason.
- Do not use `can't tell` for unclear instructions; it means the event itself is unclear.
- Do not edit `Section`, `Flag`, `Label`, `OutsideGTA`, or `Slice`.
- Do not continue through visible fatigue just to finish a block.

### 7.7 Stop and close

Stop after 35–40 minutes, 40–60 rows, or when answers become noticeably faster and less reasoned.
Before ending:

1. Confirm the last row was saved.
2. Record rows completed and the gate-slice split below.
3. Ask what felt unclear or repetitive.
4. Schedule the next sitting before leaving.
5. Do **not** run the consistency correction in front of him; that happens after the sitting.

### Sitting log

| | |
|---|---|
| Date / sitting number | 2026-07-29 · Sitting 1 |
| **Ariel's prediction before starting** | Not captured |
| Gate rows at start | 89 total · 8 resolved · 81 blank |
| Rows completed this sitting | 76 total · gate 17 · train 33 · walkthrough 12 · not-in-model-set 14 |
| Gate rows remaining | 64 blank · 25/89 currently resolved |
| Split observed — gate slice only | **Provisional:** non-GTA 5 · B2B-professional 14 · civic 0 · wrong fit 6 · outcompeted 0 · can't tell 2. Multiselect counts overlap; adjudication pending. |
| Links opened / non-empty `LinkGave` | Opened count not captured · 3 non-empty |
| Editor's preferred word for `outcompeted` | Not captured |
| Editor's breadth sentence | Policy captured, not exact wording: community association is not automatically too narrow; judge cross-community appeal. Lunar New Year is explicitly accepted. |
| Editor's non-English policy | Depends on the rest of the event; language alone is not a rejection. |
| Anything surprising or unclear | B2B / wrong-fit conflation; professional events routed to `outcompeted`; two link findings not propagated; source categories too noisy for routing. |
| Next sitting | TBD · 64 unresolved gate/unflagged rows, after the adjudication pass |

**Completion pass (2026-07-30):** the remaining 138 rows were labelled (gate 64 · train 74), bringing
the deck to 239/239. The durable one-pull audit now owns repeatable post-sitting QC and snapshot diffs.

---

## Open items

**Before evaluation:**

1. Adjudicate the target conflicts, link-evidence mismatches, repeat disagreements, cancelled positive,
   missing reasoning and factual-provenance mismatch reported by `scripts/auditR7Labels.js`.
2. Make `gate_step4a.py` consume the live `B2B / professional dev` option string and corrected target
   mapping; fail on unknown values rather than silently dropping them.

**Still TBD-from-editor:**

- His preferred word for a good event that lost its slot (`outcompeted` remains the live option today).
- The intent-based edge cases, including whether a free library job-search session counts as
  `B2B / professional dev`; do not pre-decide those from keywords.

**After the sitting — Ariel/Codex, not the editor:**

1. Run the per-row completeness check and verify locked fields did not move.
2. Compare the 11 hidden repeat pairs and organizer/title families for inconsistent `NoneReason`.
3. Review every non-empty `LinkGave` as the feature-gap stratum.
4. Update the sitting log and R7 status through `/wrap`.
5. Keep model work separate: pins 2–4, arm 1, the cap sweep, and the arm-2 #108 decision do not enter
   the editor session.
