# R7-W6 — None-Split Labelling Plan (239 rows)

**Status: LIVE.** Written 2026-07-26 from the editor's first 12 rows; rewritten 2026-07-27 to match
`Decision_Log.md` §75; **§0 replaced 2026-07-28 — the instrument is now a single multiselect field**
(`NoneType` deleted). This doc is the only home for the instrument design, the sitting script, and the
sitting log — there is no separate meeting doc.

**Type: Release-working.** Implements `R7_Scope.md` Step 1; delete or archive at R7 close.

**What is still not applied:** the Airtable field changes below are a **proposal awaiting Ariel's
approval** — the base has not been touched since the 07-26 build. Two items are marked
**TBD-from-editor** and must come from the editor's own words on the call, not from us.

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
| **B2B / professional** | Aimed at businesses, or at people in a professional role — training, certification, career advancement, networking. Not at readers as residents. **Adjacency always counts** (Ariel's 07-27 ruling — no case-by-case). | the gate |
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

Multiselect means a row can carry `non-GTA` **and** `B2B / professional`. Routing resolves in this order:

1. **`non-GTA`** → Stage 0 delete. *Facts act first: the row is deletable regardless of what else is ticked.*
2. **`can't tell`** → excluded from everything.
3. **`wrong fit`, `B2B / professional`, `civic`** → the gate's negatives.
4. **`outcompeted` alone** → reserved for R6's ranker; **withheld from the gate.**

**Why `outcompeted` ranks last:** it is the weakest claim and the most damaging if wrong (§75 withholds
it from the gate because it is a property of the week, not the event). Anything else ticked beats it,
so a confused double-tick **fails safe — into the gate, never out of it.**

### What the change bought immediately

Both **contested** pilot rows dissolve, with no adjudication needed. *GODfidence Conference* (r25) was
breadth-vs-B2B: tick `wrong fit` **and** `B2B / professional`. *Zumba Instructor Training* (r36) was a
professional-development fact against a popularity verdict: tick `B2B / professional` **and** `wrong fit`. **The `Rule-break` definitional
question — "does a rule *apply*, or is it *why* I rejected it" — is dissolved, not answered.** Both are
recorded; routing decides the rest.

### The 12 pilot rows — remap to the flat field

Re-derived 2026-07-28 from the four-way draft. Ten are a two-minute confirm; two need a genuine re-look.

| Row | Event | Ticks | Conf |
|---|---|---|---|
| 6 | First Day Preview: Markham Edition | `wrong fit` | LOW — ⚠️ the event is a **YorkU prospective-student open day**, not the "professional training" his note describes. Verdict stands on his own ground ("my focus is entertainment"); the *reason* doesn't match the event. Confirm out loud. |
| 11 | Effective Vendor Management Training | `B2B / professional` | HIGH — was two ticks under the split options; the merge makes it one |
| 12 | Geocaching & Orienteering with BIAYR | `outcompeted` | HIGH — the only pilot row that passes the slow-week test |
| 20 | Indigenous Hockey Equipment Drive Golf Tournament | `wrong fit` | HIGH (breadth) |
| 24 | Internet Marketing Fundamentals Training | `B2B / professional` | HIGH |
| 25 | GODfidence Conference 2026 | `wrong fit` + `B2B / professional` | HIGH — *was contested under four-way; multiselect resolves it* |
| 29 | Spring Colours - Album Release Show | *(blank — re-ask)* | no reasoning recorded, cannot remap honestly |
| 30 | Unbreakable Minds Community Event | `wrong fit` | HIGH |
| 33 | Bona Sport Program: Hands-On Training | `wrong fit` | HIGH — a consumer sports clinic; the scan false-positived it on "Training" |
| 34 | TPM North — Shabbat Korach | `wrong fit` | HIGH (breadth) |
| 35 | Love as a Foreign Language Book Tour | `wrong fit` | HIGH |
| 36 | Zumba Instructor Training | `B2B / professional` + `wrong fit` | HIGH — *was contested under four-way; multiselect resolves it* |

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

**TBD-from-editor:** the *sentence* he will apply consistently over 227 rows. Ariel has the rule; the
phrasing must be the editor's. Ask him to complete: *"An event is too niche when ______."*

---

## 1. The workflow — live sittings, text-first

**Superseded:** the solo async workflow, and the 25-row pilot that was to precede the bulk.
**The first 12 rows *are* the pilot** (§75) — a solo pilot now has no consumer.

**The format:** all ~227 remaining rows labelled **live with him, text-first**, over **3–4 sittings**
of ~40–60 rows (~30–40 min each). Text-first means he calls it from `Event` + `Details` **before**
the link is opened; then, if he wants the link, he opens it and we record what it changed.

**Why live rather than async:** it converts a self-report into an **observed behaviour**. The retired
`NeededLink` asked an editor habituated to opening every link for 15 months to report a counterfactual
about his own reasoning — that measures habit, not necessity (it correlated with nothing: ticked on
both real-prose rows, blank on 5 of 7 metadata-only rows). Watching him is the only honest instrument.
It also beats the cheaper LLM-based ceiling estimate for one reason: it names the missing **feature**
rather than merely sizing the gap.

**Per row, in order — stop at the first YES:**

| # | Question | If yes |
|---|---|---|
| 1 | Does it break a rule? B2B · professional development · civic · outside the GTA | **Rule-break** — then tick every rule that applies in `NoneReason` |
| 2 | Would you *never* run this in the Brief, on any week — wrong audience, wrong format, too narrow? | **Wrong fit** — one line why in `NoneReasoning` |
| 3 | **If next week were slow and this event were available, would you run it?** | **Outcompeted** |
| 4 | You genuinely cannot tell what this event even *is* | **Ambiguous** — say what is missing in `NoneReasoning` |

### The two sentences that fix most of the pilot's errors

> **Outcompeted means you would be happy to run it. If you would not run it on a slow week either,
> that is Wrong fit — not Outcompeted.**

Five of his six Outcompeted pilot rows fail that test (*"people don't like such events"*, *"this type
of events is not popular"*, *"readers normally look for more interactive activities"*, *"more
individual rather than for couples or families"*). All are permanent verdicts. **Only one of six
survives as genuinely Outcompeted** — which means the three-way instrument was over-stating the R6
ranker's positive pile by roughly 6×.

> **Ambiguous is about the event, not about these instructions.** If the *event* is unclear, tick
> Ambiguous. If the *instruction* is unclear, pick your best guess and say so in `NoneReasoning` —
> then flag it so we can fix the instruction.

Both of his Ambiguous rows are clear rule-breaks (professional training) where he stated the reason
correctly and still could not find the branch. That is an instrument defect, not his error.

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

## 3. The text he is reading — and the #108 change pending on it

`clean()` (`transfer_test.py:83`, copied to four other files): unescape HTML → strip tags → drop
whole lines matching a boilerplate list → collapse whitespace → **truncate at 300 chars**. The deck's
`Details` column *is* `clean(desc)`, so **the editor is looking at almost exactly what the model
sees** (model text = `title + clean(desc)`). That alignment is a real asset — don't break it casually.

**Findings, ranked:**

1. **The problem was never cleaning — it was that there was nothing to clean, and that turns out to be
   fixable.** Of the 400-row deck, **42.3% had no real prose**; 81% of that gap was AllEvents. The
   #108 backfill recovers a real description for **111 of 137 (81%)** of those AllEvents rows from
   their HTML detail pages, taking the deck-wide gap to **14.8%** — and the residual is now
   Eventbrite-shaped, not AllEvents-shaped. **Staging file:
   `models/sectioning/deck/allevents_backfill_2026-07-27.json`. Not applied to the deck.**
2. **⚠️ The blocking trade-off, Ariel's call, and it is time-critical.** Putting the recovered text
   into `Details` before the sittings makes 111 rows legible — the pilot already contains a row
   (*First Day Preview: Markham Edition*, a YorkU campus open day) that he **mislabelled as
   "professional training"** because his `Details` was blank. But it also **destroys the text-only
   ceiling measurement** the sittings were designed to produce (§5): you cannot measure the ceiling of
   text you have just improved. **These two cannot both be had.**
3. **The 300-char cap now governs whether the backfill is worth anything** — **88.3% of the recovered
   text exceeds 300 chars**. The 07-22 audit that called the cap "display-only / zero model effect"
   was run on the *classifier*; for a **reject gate** the disqualifying phrase ("networking event for
   realtors…") often sits at the end. Re-audit `DESC_CHAR_CAP` before the fit.
4. **`clean()` itself is low-risk.** The boilerplate list only strips lines matching *exactly*
   end-to-end (`^…$`), so it removes headers like `Overview` / `About this event`, not the content
   under them. Two entries do lose signal: whole-line `online` and `in person` are stripped — noise
   for a section classifier, possibly load-bearing for a reject gate.
5. **The recovered text carries two mechanical artifacts** that must be stripped before any use:
   the **title is duplicated at the head** (106 of 111 records), and a trailing nav sentence
   (*"Also check out other Workshops in Markham , Health & Wellness events in Vaughan ."*). Two
   regexes, both position-anchored, zero risk to real content. **Not applied — `clean()` is untouched.**
6. **§70's "SourceCategories excluded" is partly defeated.** For AllEvents rows the categories are
   written *inside* `DescriptionRaw`, so `clean(desc)` carries them into model text regardless of the
   `with_cats` flag — **256 of 1,805 corpus rows (14%)**. The cats-ablation arm isn't clean. Note the
   backfill **changes this**: block-only rows become real prose, which removes the leak for them.

---

## 4. Failure points and safeguards

| # | Risk | Safeguard |
|---|---|---|
| 1 | **Wrong-fit rejections land in Outcompeted** (5 of 6 in the pilot) | The slow-week test in §1. Highest-value single fix. |
| 2 | **Ambiguous used as "the instructions are unclear"** (2 of 2 in the pilot) | "Ambiguous is about the event, not the instructions." |
| 3 | **`NoneReason` left blank** (0 of 12) | Now required on **Rule-break rows only**. Each tick is a Stage-0 filter we get for free — say that out loud. |
| 4 | **Only the strongest reason ticked** on multi-reason rows | Multi-select on purpose. "A German business webinar in Hamburg is three ticks, not one." |
| 5 | **Similar events labelled differently** — Rows 24 and 11 are both AdeptSkil 1-day workshops; one Ineligible, one Ambiguous | Post-hoc consistency sweep by organizer and title keyword. Ours, not his. |
| 6 | **Guessing when unsure** | Ambiguous exists so he never has to. A high Ambiguous count is a *useful* result. |
| 7 | **Link-only information baked into labels** the model can never see | Text-first ordering + `LinkGave` turns this into a measured stratum instead of silent contamination. |
| 8 | **Fatigue drift** over ~227 rows | 40–60 rows a sitting. The **11 unannounced repeat pairs** measure drift for free — **do not tell him they exist.** |
| 9 | **Slice pooling** — 239 = **89 gate / 125 train / 25 batch 4–5**. Only the gate slice is representative | Compute every proportion on the 89 alone. |
| 10 | **Decision-relevant data arrives last** in row order — Batch 1 holds only 4 gate rows | **Re-sort the view: gate slice first.** Still open. |
| 11 | **Templated junk eats his attention** — 18 of the 32 true rule-breaks in the 239 are one organizer (AdeptSkil) emitting near-identical titles, ~13% of his remaining workload | A rule-break **pre-sort** (below). Open. |
| 12 | Editor edits `Section` / `Flag` / `Label` | Frozen in the table description; the 07-26 snapshot detects drift on exactly those fields. |

### The rule-break pre-sort — proposed, not decided

A keyword scan of the four written rules flags **41 of 239 rows (17.2%)**; hand-adjudicated precision
is **78% strict / 90% counting the contested five**. Every false positive is the same failure mode:
**a rule word appearing as content rather than as the event's nature** — *Leonid & Friends* matched
"Chicago" (a tribute band), an author talk matched "Georgia" (the novel's setting).

**✅ DECIDED 2026-07-27 (Ariel): pre-*sort*, don't pre-*label*.** He accepts touching every row — the
sort exists to stop the templated block eating his attention, not to save him rows. **Implementation is
deliberately held until the four-way `NoneType` respec**, so the instrument changes once rather than
twice at row 12 (the same trade §75 already ruled on). Ships with the respec, in one trip.
⚠️ **§76 narrows what this pre-sort is *for*:** prof-dev and B2B flags no longer route to Stage 0 at all
(they are content judgments, not record facts), so the sort now buys editor attention — **not** Stage-0
coverage. The reasoning that produced the call is kept below.

**Do not pre-label.** 78% precision is nowhere near good enough for a bucket that feeds a stage which
**hard-deletes**. **Pre-*sort* instead:** put the flagged rows first with the matched rule shown as a
hint, and have him confirm or override. He still touches every row — no label is machine-authored —
but the AdeptSkil block clears in one pass instead of ten minutes. *(A narrower option worth separate
consideration: auto-label the exact templated families only — organizer = AdeptSkil AND title matching
`… Training — {city}, ON | 1 Day Workshop` — which is a **provenance** rule, not a content rule.)*

**Measured, and it changes the sizing:** re-running the identical scan with the #108 backfilled text
appended takes it from **41 to 51 flags (+24%)**, and `civic` fires for the first time (civic language
lives in descriptions, never in titles). **Stage-0 coverage was being under-counted by ~15–25% purely
because of missing text.** Any Stage-0 sizing done before the backfill is a floor, not an estimate.

### A contradiction to resolve before the field descriptions are written

The ladder above and CLAUDE.md disagree. CLAUDE.md's written reject list is **exactly** B2B / civic /
professional development / non-GTA. *Not-an-event* and *not-English* are **not** in it, yet three real
rows in the 239 need them (two *Theatre Workshop Sign-up Form* rows; *Hebrew Storytime / שעת סיפור
בעברית*). **Either add them to CLAUDE.md's reject list and to `NoneReason`'s options, or accept those
rows landing in `Ambiguous`.** That is an edit to the *rules*, not to the instrument — Ariel's call.

---

## 5. Making the labels usable for future model rating

**What the model receives at serve time:** `title + clean(DescriptionRaw)`, capped at 300 characters.
That is all. **No link. No page content. No images. No price, venue, city, or organizer** as separate
features (the AllEvents block smuggles categories in for ~14% of rows — §3.6, a bug not a feature).

So: **any label that depends on link-only information is not learnable from the current features.**

**Do not solve it by degrading the labels.** The temptation is "label as if you were the model."
Resist it: that produces labels that are wrong about the world, and labels outlive feature sets.
Three moves instead:

1. **Measure it.** The text-first sittings give the exact share of rows where text was insufficient,
   and `LinkGave` names *what* was missing. **⚠️ Conditional on §3.2** — if the backfilled text is
   applied first, this measurement is no longer available in its original form.
2. **Stratify the eval.** Report gate recall twice — on text-sufficient rows and on link-needed rows.
   If the gate is fine on the first and hopeless on the second, the diagnosis is **features, not
   model**, and no amount of fitting fixes it.
3. **If the link-needed share is large, the answer is richer features, not a better model.** In rough
   cost order: **fetch the AllEvents detail page (#108 — already measured at 81% recovery, the cheapest
   item on this list)** → raise `DESC_CHAR_CAP` → add `City` / `LocationName` / `CostRaw` / `Organizer`
   from Candidates. Mind the **feature budget** (§0b) on the last one.

---

## 6. Quality control

**Per-row checklist:**
1. `NoneType` filled?
2. If Rule-break — is **every** applicable `NoneReason` ticked, not just the strongest?
3. If Outcompeted — would I really run it on a slow week?
4. One line in `NoneReasoning` unless it's an obvious rule-break?
5. `Section` / `Flag` / `Label` untouched?

**The first 12 are remapped, not redone.** Their `NoneReasoning` is clear enough on 10 of 12 to
propose the four-way remap ourselves and have him confirm in two minutes. **Rows 29 and 11 have no
reasoning and need a genuine re-look** — and row 6 needs one for a different reason: the recovered
description shows the event is not what he thought it was. Draft table:
`_handoff_2026-07-27_delegated.md` §Task 3.

**Consistency sweeps (ours, after the fact, not his):**
- The **11 unannounced repeat pairs** inside the 239 — a free self-consistency rate on the new labels.
- Group by organizer and by title keyword; any group with mixed `NoneType` gets a second look.
  Start with AdeptSkil, which already has a known inconsistency.
- **New:** the AllEvents *Richmond Hill, Georgia* rows (#108) — 10 detected, **3 carrying a positive
  label**. Those are wrong labels caused by missing geography, not by taxonomy.

**Final review pass:** every row with a non-empty `LinkGave`. Those are the labels whose correctness
depends on information the model will never have — the stratum from §5.2.

**Pace:** 40–60 rows a sitting, ~30–40 minutes. Three to four sittings.

---

## 7. The sitting — script and log

Not a client meeting; `meetings/Meeting_protocol`'s demo format does not apply. There is nothing to
show. This is 227 rows of labelling, live and text-first.

### Say this first (60 seconds)

> "Last time I gave you two dropdowns. Now it's one, and you can tick more than one box. If an event is
> both out of area *and* a business event, tick both — you don't have to pick."

Their 12 rows are **not wasted** — they remap (§0) and take about two minutes to re-confirm.

### ⚠️ The mechanical trap that cost the pilot

`NoneReason` is a multiselect: **each option needs the `+` sign.** The editor filled it **0 of 12** times
— not because he disagreed, but because the affordance was invisible. **Show him the `+` before row one.**
If nothing else here happens, do this.

### The one distinction that matters most

The pilot got this wrong on **5 of 6 rows** — he ticked "Outcompeted" for events he'd never run at all,
and outcompeted rows are deliberately **withheld** from the gate's training.

> **Ask out loud on every borderline row: "Would you run this in a quieter week?"**
> **Yes → `outcompeted`. No → `wrong fit`.**

Pilot phrasings that all mean `wrong fit`, never `outcompeted`: *"people don't like such events"* ·
*"this type of event is not popular"* · *"from my experience…"* — permanent verdicts about the event,
not statements about this week's competition.

### Sitting log

*(fill in during or immediately after; TBD-from-editor answers go to §Open items, not here)*

| | |
|---|---|
| **Ariel's prediction, recorded BEFORE starting** *(the delta is the signal)* | Rule-break __ / Wrong fit __ / Outcompeted __ |
| Rows completed | |
| Split observed — **gate slice only** (first ~89) | non-GTA __ / B2B-professional __ / civic __ / wrong fit __ / outcompeted __ / can't tell __ |
| Anything that surprised him | |
| Next sitting scheduled | |

---

## Open items

**Ariel's, ranked:**
1. ~~**Does the #108 recovered text go into `Details` before the sittings?**~~ **RESOLVED 2026-07-29: yes.**
   B3/B4 stripped the duplicated-title and trailing-navigation artifacts, then wrote all 111
   successful recoveries uncapped into `Details` (110 writes; one row already current). Post-write
   verification: 111 current, zero pending, zero conflicts. Production R1/R2 remains unchanged;
   #108 owns the arm-2 gate and any later R1 integration.
2. **The `Rule-break` definition** — "a rule applies" vs "a rule is why I rejected it" (§0). One
   sentence, changes Stage-0 coverage, blocks the field description. **Partially resolved 2026-07-27
   (Ariel): adjacency to B2B or professional development is *always* a rejection — no ambiguity, no
   case-by-case.** That settles the **adjudication**. It does not settle the **detection** (keyword
   precision is still 78%, every false positive a rule word appearing as content, so these stay
   gate-scored per §76), and it does not settle the **record-fact** rules — which is the only part
   that still moves Stage-0 coverage. **Consequence worth keeping:** a rule the editor applies 100%
   consistently is learnable from text, unlike the C/G boundary he flip-flops on. So this makes the
   *gate's* job easier, not Stage 0's. Now empirically testable via the prof-dev/B2B stratum
   diagnostic added to `R7_Scope` Step 4.
3. **The `not-an-event` / `not-English` contradiction** between this ladder and CLAUDE.md (§4).
4. **Pre-sort vs pre-label vs neither** for the 51 flagged rule-break rows (§4).
5. **`NoneReason`:** keep-and-scope-to-Rule-break (recommended) vs delete. **`NeededLink`:** hide
   (recommended) vs delete — deletion is irreversible and the 6 pilot ticks are the only record.
6. Re-audit `DESC_CHAR_CAP` for the gate (§3.3) and the cats-in-desc leak (§3.6) before the fit.
7. Re-sort the `Negatives labelling` view: gate slice first (§4.10).
8. **Prediction before the data lands:** of the remaining 227, what's your split across
   Rule-break / Wrong fit / Outcompeted? Worth on record before we compute it.

**TBD-from-editor (the call):**
- The **`Outcompeted` label** — his word, not ours.
- The **breadth sentence** — *"An event is too niche when ______."*
- The five **contested rule-break rows** (§4), which all turn on intent rather than fact: is a free
  library job-search session "professional development"? **Note (2026-07-27):** Ariel's blanket
  adjacency rule (Open-items 2) *would* resolve all five as rejections; he has deliberately **left
  them with the editor** rather than deciding them himself, so they stay TBD-from-editor.
- **Non-English listings — new 2026-07-28.** Language detection was **dropped from Stage 0** because
  "can my readers use this listing?" is a **content** judgment, not a record fact (§76): the live pool
  holds `Photography 101 攝影基礎班` at a Richmond Hill church and the deck holds
  `Hebrew Storytime / שעת סיפור בעברית` (r274) — both plausibly legitimate local events whose *listing*
  is non-English. A `NOT_ENGLISH` delete rule kills them sight-unseen. **Ask him:** does a non-English
  listing for a real local event get included, excluded, or does it depend — and if it depends, on what?
  His answer decides whether these rows are `Rule-break`, `Wrong fit`, or includable, and it is one of
  the two halves of the §4 not-an-event/not-English contradiction.
