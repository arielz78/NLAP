# R7-W6 — None-Split Labelling Plan (239 rows)

**Status: DRAFT, awaiting Ariel's call on §0. Nothing here has been applied.**
Airtable is untouched. `R7_Scope.md` and `Decision_Log.md` are untouched. Not committed.
Written 2026-07-26 from the editor's first 12 completed rows.

**Type: Release-working.** Folds into `R7_Scope.md` Step 1 once §0 is settled; delete or archive at R7 close.

---

## 0. The blocking decision (Ariel's — everything below assumes it)

The 12 completed rows say the three-way `NoneType` split does not match how the editor
actually rejects. He has **four** kinds of rejection, not three:

1. **Breaks a rule** — B2B / prof-dev / civic / non-GTA / not-an-event / not-English. A checkable fact.
2. **"Not audience fit / too niche / not popular"** — permanent, but not a rule. **No home in the current instrument.**
3. **Fine event, lost its slot this week.**
4. Genuinely can't tell.

Category 2 is currently leaking into *both* Ineligible ("niche") and Outcompeted ("not popular"),
which poisons the gate's negatives and the ranker's positives simultaneously.

**Recommendation: split `NoneType` four ways** — `Rule-break` · `Wrong fit` · `Outcompeted` · `Ambiguous`.
Rationale: it puts the load on the field he fills 12/12 rather than the one he fills 0/12, and it
collapses the `NoneReason` ask from "every row" to "rule-break rows only."

Each bucket then has exactly one consumer, which is also the cleanest way to explain it to him:

| Bucket | Feeds | If mislabelled |
|---|---|---|
| Rule-break | **Stage 0** deterministic pre-filter (Scope Step 3) | We under-count free rules and skip building a filter that cost nothing |
| Wrong fit | **Stage 1, the gate** — the only thing the gate can learn that Stage 0 cannot | The gate learns to reject the wrong events |
| Outcompeted | **R6's ranker** | Ranker trains on junk labelled "good" — actively harmful |
| Ambiguous | Excluded from both | — |

**Fallback if you keep three:** redefine `Ineligible` as *"I would never run this, any week, for
any reason"* (permanent, rule or taste) and rely on `NoneReason` to split rule vs taste. Weaker,
because it bets the Stage-0 coverage number on the field he is already ignoring.

**Second call needed:** the editor keeps citing a **breadth criterion** — *"has to appeal to
multiple communities"*, *"this appeals to only muslim people"*, *"too niche"*. That is a real
selection rule the Brief applies and **we have never written it down** (CLAUDE.md's reject list is
B2B / civic / prof-dev / non-GTA only). Ask him on the call what makes something "too niche" —
single community? requires prior knowledge? small venue? Then write it into the criteria.

---

## 1. Recommended editor workflow

Seven steps, same every row. Target ~45 seconds a row on the easy ones.

**Step 1 — Read `Event` (the title).** Most rule-breaks are decided here alone.
"Effective Vendor Management Training — 1 Day Workshop" needs nothing else.

**Step 2 — Read `Details`.** Know what you are looking at — it is one of three things:
- **Real prose** (~55% of these rows) — an actual description.
- **An AllEvents metadata block** (~27%) — `AllEvents Categories: … Organizer: … Score: …`.
  This is **not a description**. It is category tags. Use it as a weak hint, nothing more.
- **Blank** (~13%). Title only.

**Step 3 — Run the ladder, in order. Stop at the first YES.**

| # | Question | If yes |
|---|---|---|
| 1 | Does it break a rule? Not an event · outside the GTA · not in English · B2B / professional development / civic | **Rule-break** — then tick every rule that applies in `NoneReason` |
| 2 | Would you *never* run this in the Brief, on any week — wrong audience, wrong format, too narrow? | **Wrong fit** — one line why in `NoneReasoning` |
| 3 | **If next week were slow and this event were available, would you run it?** | **Outcompeted** |
| 4 | You genuinely cannot tell what this event even *is* | **Ambiguous** — say what is missing in `NoneReasoning` |

**Step 4 — Open the link only if §2 says to.** Not by default.

**Step 5 — Write one line in `NoneReasoning`** for anything that isn't a clean rule-break.
A short sentence. His existing ones are already the right length —
*"can be interesting for my audience but there are more engaging ones"* is exactly right.

**Step 6 — `NeededLink`: tick only if the link *changed your answer*.** See §2.

**Step 7 — Before moving on, check:** `NoneType` filled · if Rule-break, at least one
`NoneReason` ticked · one line of reasoning unless it's an obvious rule-break ·
you did **not** touch `Section`, `Flag`, or `Label`.

### The single sentence that fixes most of the current errors

> **Outcompeted means you would be happy to run it. If you would not run it on a slow week
> either, that is Wrong fit — not Outcompeted.**

Four of his six Outcompeted rows fail that test (*"people don't like such events"*,
*"this type of events is not popular"*, *"readers normally look for more interactive activities"*,
*"more individual rather than for couples or families"*). All four are permanent verdicts.

### The second sentence

> **Ambiguous is about the event, not about these instructions.** If the *event* is unclear,
> tick Ambiguous. If the *instruction* is unclear, pick your best guess and say so in
> `NoneReasoning` — then flag it so we can fix the instruction.

Both of his Ambiguous rows are clear rule-breaks (professional training) where he stated the
reason correctly and still could not find the branch. That is an instrument defect, not his error.

---

## 2. How the link should be used

He has been clicking through for 15 months, so the default is automatic. The 12 rows suggest it
is largely habit: **`NeededLink` does not track description quality.** He ticked it on 2 of 3
blank-description rows but also on both real-prose rows, and left it blank on 5 of 7
metadata-only rows. If the checkbox meant "the text was insufficient," it would correlate with
text poverty. It doesn't.

**Fix the field's meaning rather than his behaviour:**

> **`NeededLink` = the link CHANGED my answer.** Not "I opened it."

"Did you open it" measures habit. "Did it change the call" measures necessity — and necessity is
the number that tells us whether a text-only gate is possible. Same checkbox, one-word redefinition,
and it starts measuring the thing we actually need.

**When the text is enough on its own** — don't open the link:
- The title alone names a rule-break (`… Training`, `… Workshop`, `B2B`, `Conference for …`).
- The title plus description clearly names the activity and the audience.
- You already know the venue or the organizer from the last 15 months. That counts as text — you
  are not learning it from the link.

**When the link is helpful but not required** — skip it, and accept the slightly rougher call:
- You want the exact price, the exact age range, or the photos.
- You are choosing between Wrong fit and Outcompeted and the text supports either.
- Curiosity. This is the biggest time sink and buys nothing.

**When the link is required** — open it:
- `Details` is blank *and* the title is not self-explanatory ("Unbreakable Minds Community Event").
- You cannot tell whether it is an event at all, or where it is.
- The title looks like it might be a series, a sale, or a listing rather than a single event.

**If the text and the link disagree, the link wins.** Label the event as it truly is, tick
`NeededLink`, and write what the link told you. We would rather have a correct label plus a
recorded gap than a wrong label that matches our data.

**What from the link should affect the label:** what the event actually is, who it's for, where it
is, whether it's real. **What should not:** how the page looks, how many tickets are sold, the
organizer's follower count.

---

## 3. The cleaning function — reviewed

`clean()` (`transfer_test.py:83`, copied to four other files): unescape HTML → strip tags →
drop whole lines matching a boilerplate list → collapse whitespace → **truncate at 300 chars**.
The deck's `Details` column *is* `clean(desc)`, so **the editor is looking at almost exactly what
the model sees** (model text = `title + clean(desc)`). That alignment is a real asset — don't break it.

**What I found, ranked:**

1. **The real problem is not cleaning — it's that there is nothing to clean.** Of the 239 None
   rows: **13% blank description, 27% an AllEvents metadata block, 5% under 60 characters.**
   ~40% have no real prose at all. No cleaning change fixes that; only richer features do.

2. **`clean()` itself is low-risk.** The boilerplate list only strips lines that match *exactly*
   end-to-end (`^…$`), so it removes headers like `Overview` / `About this event`, not content
   under them. Names, dates, locations, and outcomes inside prose survive.

3. **Two boilerplate entries do lose signal:** whole-line `online` and `in person` are stripped.
   For a *section classifier* that's noise; for a **reject gate** "online" may be the only marker
   that an event is virtual — and virtual is arguably ineligible. Worth re-checking before the fit.
   `time:.*` and `\d+ hours?.*` also go; minor.

4. **The 300-char cap truncates 12% of these rows.** The 07-22 audit called the cap
   "display-only / zero model effect" — but that was measured on the *classifier*. For the gate,
   the disqualifying phrase ("networking event for realtors…") often sits at the end of a
   description. Re-audit the cap for the gate specifically; it's a one-line knob (`DESC_CHAR_CAP`).

5. **§70's "SourceCategories excluded" is partly defeated.** For AllEvents rows the categories are
   written *inside* `DescriptionRaw` (`AllEvents Categories: fitness, Kids, Workshops`), so
   `clean(desc)` carries them into the model text regardless of the `with_cats` flag —
   **256 of 1,805 corpus rows (14%)**. The cats-ablation arm isn't clean. Flag for the gate fit.

**Should the editor see raw text next to cleaned?** **No — not mid-run.** Three reasons:
(a) it changes the instrument halfway through and splits the 239 into two incomparable halves;
(b) `Details` being byte-identical to model serve text is exactly what makes the text-only
ceiling measurable — showing raw text destroys that measurement;
(c) the link already *is* the documented fallback, and `NeededLink` records when it was used.
Keep `Details` as-is. Revisit after all 239 are in.

---

## 4. Failure points and safeguards

| # | Risk | Safeguard |
|---|---|---|
| 1 | **Wrong-fit rejections land in Outcompeted** (already happening, 4 of 6) | The slow-week test in §1. Highest-value single fix. |
| 2 | **Ambiguous used as "the instructions are unclear"** (2 of 2 so far) | "Ambiguous is about the event, not the instructions." |
| 3 | **`NoneReason` left blank** (0 of 12) | Only required on Rule-break rows. Ties directly to a Stage-0 rule — tell him each tick is a filter we get for free. |
| 4 | **Only the strongest reason ticked** on multi-reason rows | It is multi-select on purpose. "A German business webinar in Hamburg is three ticks, not one." Already in the field description; repeat it out loud. |
| 5 | **Similar events labelled differently** — Row 24 and Row 11 are both 1-day AdeptSkil workshops; one is Ineligible, the other Ambiguous | Post-hoc consistency sweep by organizer and title keyword. Our job, not his. |
| 6 | **Guessing when unsure** | Ambiguous exists precisely so he never has to guess. Tell him a high Ambiguous count is a *useful* result, not a failure. |
| 7 | **Link-only information baked into labels** the model can never see | Redefined `NeededLink` (§2) turns this into a measured stratum instead of silent contamination. |
| 8 | **Fatigue drift over 239 rows** | Cap sittings at ~40–50 rows. The 11 unannounced repeat pairs measure drift for free — **do not tell him they exist.** |
| 9 | **Slice pooling** — 239 = **89 gate / 125 train / 25 batch 4–5**. Only the gate slice is representative | Compute every proportion on the 89 alone. Pooling gives a meaningless number (same trap the answer key already warns about). |
| 10 | **Decision-relevant data arrives last.** Working in row order means gate-slice rows come mostly at the end — Batch 1 holds only 4 | **Re-sort the view to put the 89 gate rows first.** Then the split can be priced after ~89 rows instead of 239. |
| 11 | Editor edits `Section` / `Flag` / `Label` | Already frozen in the table description; the 07-26 snapshot detects drift on exactly those fields. |

---

## 5. Making the labels usable for future model rating

**What the model actually receives at serve time:** `title + clean(DescriptionRaw)`, capped at 300
characters. That is all. **No link. No page content. No images. No price, venue name, city, or
organizer** as separate features (the AllEvents block smuggles categories in for ~14% of rows —
see §3.5, which is a bug, not a feature).

So: **any label that depends on link-only information is not learnable from the current features.**
With ~40% of these rows carrying no real description, that is not a hypothetical.

**How to handle it — do not solve it by degrading the labels.** The temptation is to tell him
"label as if you were the model." Resist it: that produces labels that are wrong about the world,
and labels outlive feature sets. The right handling is three moves:

1. **Measure it.** Redefined `NeededLink` (§2) gives the exact share of rows where text was
   insufficient. That number *is* the ceiling on any text-only gate.
2. **Stratify the eval.** Report gate recall twice — on text-sufficient rows and on link-needed
   rows. If the gate is fine on the first and hopeless on the second, the diagnosis is features,
   not model, and no amount of fitting fixes it.
3. **If the link-needed share is large, the answer is richer features, not a better model.**
   In rough cost order: add `City` / `LocationName` / `CostRaw` / `Organizer` (already in
   Candidates, just not in the serve text) → raise `DESC_CHAR_CAP` → scrape the event page.

**Do not** add link-derived text to the deck now. That would contaminate the ceiling measurement
the 239 rows exist to produce.

---

## 6. Quality control

**Per-row checklist** (small enough to sit on a sticky note):
1. `NoneType` filled?
2. If Rule-break — is **every** applicable `NoneReason` ticked, not just the strongest?
3. If Outcompeted — would I really run it on a slow week?
4. One line in `NoneReasoning` unless it's an obvious rule-break?
5. `Section` / `Flag` / `Label` untouched?

**Pilot before the bulk.** Re-sort so the **89 gate rows come first**, have him do **25**, then stop
and review together before he continues. Two reasons: instructions always survive contact with
reality worse than expected, and 25 rows is a cheap thing to redo.

**Don't make him redo the first 12.** His `NoneReasoning` is clear enough on 10 of them that we can
propose the remap ourselves and have him confirm in two minutes. Rows 11 and 29 have no reasoning
and need a genuine re-look.

**Consistency sweeps (ours, after the fact, not his):**
- The **11 unannounced repeat pairs** inside the 239 — a free self-consistency rate on the new labels.
- Group by organizer and by title keyword; any group with mixed `NoneType` gets a second look.
  Start with AdeptSkil, which already has a known inconsistency.

**Final review pass:** every row with `NeededLink` ticked. Those are the labels whose correctness
depends on information the model will never have — the stratum from §5.2.

**Pace:** 40–50 rows a sitting, ~30–40 minutes. Five sittings.

---

## Open items for Ariel

1. **§0 — four-way `NoneType` or keep three?** Blocks everything else here.
2. **The breadth criterion** — ask him on the call what "too niche" means, then write it into the criteria.
3. **Prediction before the data lands:** of the remaining 227, what's your split across
   Rule-break / Wrong fit / Outcompeted? Worth having on record before we compute it.
4. Re-audit `DESC_CHAR_CAP` for the gate (§3.4) and the cats-in-desc leak (§3.5) before the fit.
5. Re-sort the `Negatives labelling` view: gate slice first (§4.10).
