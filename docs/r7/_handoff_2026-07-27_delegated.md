# Handoff — delegated run, 2026-07-27 (11:35 AM – 12:40 PM)

**Temp doc.** Absorbed by `/wrap` (Execution_Log + the conditional homes), then delete.
Branch: `r7-w6-108-backfill`. **Nothing pushed. No Airtable writes of any kind — read-only pull only.**

**What was authorized and done:** the #108 deck backfill (Task 1), a rule-break scan (Task 2, report only),
a four-way remap draft of the editor's first 12 (Task 3, draft only), an Airtable instrument respec
(Task 4, proposal only), and doc reconciliation across three files (Task 5, applied).

**What was deliberately NOT touched:** `workflows/NLAP R1.json`, `clean()`, `DESC_CHAR_CAP`, the corpora,
any embedding matrix, `editor_deck_2026-07-18.json`, `Execution_Log.md`, `CHANGELOG.md`, and both open forks.

---

## Task 1 — AllEvents prose backfill (#108)

**Staging file: `models/sectioning/deck/allevents_backfill_2026-07-27.json`** (137 records).
Not wired into anything. Whether the recovered text becomes a model feature is Ariel's call.

Targets = the 137 deck rows on `allevents.in` whose `Details` is blank, starts with
`AllEvents Categories:`, or is under 60 chars. Fetch honoured all five traps from the morning probe
(`?ref=past-event-page` on ended pages, `encodeURI`, final-URL ID verification, one retry before
recording a miss, body-container extraction only — never `og:description`), 900 ms between requests.

### Recovery rate

| Stratum | Recovered | Rate | len min / median / max |
|---|---|---|---|
| **block** (`AllEvents Categories: …`) | 62 / 82 | **75.6%** | 196 / 846 / 7,065 |
| **blank** | 47 / 53 | **88.7%** | 104 / 972 / 3,099 |
| **short** (<60 chars) | 2 / 2 | 100% | 53 / 386 / 386 |
| **Overall** | **111 / 137** | **81.0%** | — |

Split by page state: **ENDED pages 88/111 = 79.3%** · **still-live pages 23/26 = 88.5%**.
110 of 137 needed the `?ref=past-event-page` variant. Extraction source: **110 body / 1 JSON-LD**
— the body container carried it essentially every time, exactly as the morning probe predicted.

### Length distribution of recovered text

min **53** · p25 **573** · median **908** · p75 **1,711** · max **7,065** · mean **1,194** chars.

Two numbers that matter downstream:
- **98 of 111 (88.3%) exceed the 300-char `DESC_CHAR_CAP`.** Backfilling without re-auditing the cap
  throws away most of what was just recovered. The cap re-audit (plan doc §3.4) stops being a nicety.
- Only **1 of 111** came back under 60 chars, i.e. recovery is essentially all-or-nothing —
  when the page has a description it is a real one, not a fragment.

### Residual prose gap across the whole 400-row deck

| | rows | gap | rate |
|---|---|---|---|
| Before backfill | 400 | 169 | **42.3%** |
| After backfill | 400 | **59** | **14.8%** |

By host (n · gap before · gap after):

| Host | n | before | after |
|---|---|---|---|
| allevents.in | 186 | 137 | **27** |
| eventbrite.ca | 122 | 17 | 17 |
| eventbrite.com | 29 | 5 | 5 |
| markham.ca | 3 | 2 | 2 |
| pinotspalette.com | 2 | 2 | 2 |
| unionvillepresents.com | 2 | 2 | 2 |
| (no link) | 2 | 2 | 2 |
| calendar.richmondhill.ca | 2 | 1 | 1 |
| tickets.cityplayhouse.ca | 2 | 1 | 1 |
| vaughanpl.info · bibliocommons · trca · visitvaughan · mcmichael · onrichmondhill · thechefupstairs | 50 | 0 | 0 |

**The "~40% of rows have no real prose" claim does not survive.** It is ~15%, and the residual is now
**Eventbrite-shaped, not AllEvents-shaped** (22 of the 59 remaining gaps are Eventbrite). AllEvents
went from being 81% of the problem to 46% of a much smaller problem.

### Discards — 4 rows

| Row | Reason | Detail |
|---|---|---|
| 80 | transport failure both attempts | `fetch failed`, "Back to School Beauty Event" |
| 83 | **ID mismatch** | requested `…860488367`, served `…121148061` — *Outdoor Sunset Yoga & Reiki* |
| 344 | **ID mismatch** | requested `…321686797`, served `…695744668` — *Richmond Hill Comedy Night* |
| 369 | **ID mismatch** | requested `200030260273826`, served `100001991941862733` — *Songs for Turtle Island* |

All three mismatches are AllEvents serving a *different, similarly-slugged* event under the old URL.
Their text was discarded, never written onto the original row. **3/137 = 2.2% silent-redirect rate** —
consistent with the 2/25 seen in the morning probe, and a hard requirement for any production fetch:
**verify the ID, or you will silently poison rows.**

### The 22 genuine misses are not random

Every one is an ended page whose ID matched and which simply has no description. **18 of the 22 are
template-generated corporate training listings** (AdeptSkil "1 Day Workshop" family, plus
"10 Essential Soft Skills", "Conflict Management Training"). The other four: Pokemon Weekly Casual
League, a comedy open mic, a D&D five-week adventure, an artisan market.

That is worth naming: *on AllEvents, "no recoverable description" skews heavily toward exactly the
junk the gate should reject.* **Do not turn that into a feature yet** — it is confounded (all 22 are
ended pages, and the AdeptSkil listings are one organizer generating dozens of near-identical rows).
But it is the opposite of the assumption we were operating under, where missing text was neutral noise.

### 5-row qualitative spot-check (deck `Details` vs recovered)

**Row 325 — block → 7,065 chars**
- deck: `"AllEvents Categories: fitness, Workshops AllEvents Organizer: Wisdom Hub - Global AllEvents Score: 44.700001"`
- recovered: `"Situational Awareness 1 Day High Impact Training in Markham | Wisdom Hub Build a respectful, inclusive workplace by improving awareness, communication, accountability, and employee behaviour. About this Event Duration: 8 hours (including breaks) | Format: In-person / In-house / Online / Hybrid Certification: Course Completion Certification | Credits: 8 CEUs/CPDs/PDUs …"`

**Row 208 — block → 1,048 chars**
- deck: `"AllEvents Categories: sports, gymnastics, art, contests, it AllEvents Organizer: The Dream Team AllEvents Score: 41.540001"`
- recovered: `"Competitive WAG Artistic Gymnastics Tryouts — The Dream Team Competitive Joining The Dream Team isn't just about gymnastics — it's about becoming part of something bigger. It's where confidence is built, work ethic is learned, friendships last …"`

**Row 4 — blank → 1,943 chars**
- deck: `""`
- recovered: `"Canada Day Family Glow Lab: Body Butter + Lip Gloss Making This Canada Day, we're making self-care fun for the whole family… At The Wellness Studio by Cicco Aroma we're making self-care fun for the whole family where kids and grown-ups get to mix, cr…"`

**Row 315 — blank → 104 chars (the short end)**
- deck: `""`
- recovered: `"The Marshall Trophy Format: Open Pairs / 3 12 end games. Entry: $20 Sponsor: Marshall Funeral Home"`

**Row 91 — short (37) → 53 chars (the null case)**
- deck: `"Lo mejor del verano Y LO QUE SE BIENE"`
- recovered: `"REVENTON.01 Lo mejor del verano Y LO QUE SE BIENE"` — the page adds nothing but the title.

**Verdict: it is real prose, not nav chrome.** Two mechanical artifacts are present in nearly every
record and **must be stripped before any use** (I did not strip them — that is a `clean()` change,
and `clean()` is off-limits this session):
1. **The title is duplicated at the head of 106 of 111 records** — serve text is `title + clean(desc)`,
   so the title would appear twice.
2. **A trailing nav sentence:** `"Also check out other Workshops in Markham , Health & Wellness events in Vaughan ."`
   Two lines of regex; both are whole-phrase, position-anchored, and zero-risk to real content.
   A third, rarer artifact: base64-obfuscated contact emails (`QkNEQ0dlb3JnaWEgfCBnbWFpbCAhIGNvbQ==`).

### The finding I did not go looking for — a live non-GTA leak in AllEvents

While adjudicating the rule-break scan: **AllEvents' `richmond-hill` city slug conflates Richmond Hill,
Ontario with Richmond Hill, GEORGIA, USA.** The API's `venue.city` says "Richmond Hill", R1's `CITY_MAP`
passes it, and nothing downstream ever looks again.

**10 rows detected in the 456-row deck** (detection is *incomplete* — it needs description text to
see, and only 137 rows have recovered text). Confirmed by the recovered prose:
*"Richmond Hill, GA"* · *"Savannah Harley-Davidson"* · *"Bryan County Administrative Complex"* ·
*"Savannah Doodle Romp"* · *"Coastal Georgia Botanical Gardens"*.

**Three of them carry a positive editor label:**

| Row | Editor's `Section` | Event | Actually |
|---|---|---|---|
| 23 | **Couples** | Mindfulness Yoga for Adults with Paola Ronchetti | Coastal Georgia Botanical Gardens, Savannah GA |
| 166 | **Families** | Splash into Summer presented by Salty Paws Savannah | Savannah GA |
| 174 | **Golden** | Community yard sale | Savannah Harley-Davidson, GA |

**This is label noise in the positive class of the gate's training set**, caused by feature poverty:
the editor could not see the geography because the deck text did not carry it. It is also a free
Stage-0 rule (facts, not taste — exactly what §75 says Stage 0 is for), but it needs a real fix at R1,
not a keyword: the discriminator is the venue address, which the API does carry (`full_address`).

**Open for Ariel — I did not act on it:** whether to (a) file this as its own issue, (b) fold it into
Stage 0, (c) re-ask the editor about those three rows, or (d) all three. It touches R1, which is
explicitly off-limits this session.

---

## Task 2 — Rule-break scan over the 239 (REPORT ONLY)

Script: `models/sectioning/deck/_tmp_rulebreak_scan.js` → `_tmp_rulebreak_scan.json`.
Scanned CLAUDE.md's written reject list **and nothing else**: **B2B · civic · professional development ·
non-GTA**. "Too niche" was deliberately not scanned — per §75 that is the breadth criterion and belongs
to `Wrong fit`. `not-an-event` and `not-English` appear in the plan doc's ladder but are **not** in
CLAUDE.md, so they are reported separately and never pooled into the rate.

### Raw result

**41 of 239 rows flagged (17.2%)** — prof-dev 27 · B2B 15 · non-GTA 7 · civic 0 (8 rows hit >1 rule).

By batch: Pilot 6/19 · Saturday 7/76 · Sunday 25/119 · Criteria Walkthrough 1/13 · Live Demo 2/12.
*(Per plan §4.9, only the gate slice is representative — this is reported unpooled for that reason.)*

Separately, 5 rows trip an **unwritten** rule only, and are **not** counted above: two *Theatre
Workshop Sign-up Form* rows and *July Book Sale* (not-an-event), *Hebrew Storytime / שעת סיפור בעברית*
(non-Latin script), and *Indigenous Hockey Equipment Drive Golf Tournament*.

### Hand-adjudicated precision — I read all 41

| Verdict | n | Examples |
|---|---|---|
| **True rule-break** | **32** | 18 AdeptSkil-class "1 Day Workshop" corporate trainings · Zumba *Instructor* Training · PEO Engineering Technical Seminar · TMJ 2 Toes chiropractic CE module · St. John Ambulance First Aid · Summit NA (Microsoft D365) Roadshow · *SUCCESSion: The Business of Selling Your Business* · *Professional networking Event* · Muslim Professionals/Business Network · Vaughan Summer Company Kick Off · 5 genuine Georgia/USA rows |
| **Contested** | **5** | *Digital Resource Training for Job Seekers* (VPL library program — prof-dev by content, public library by intent) · *EGPL Guided Canva Co-Working Session* ("for entrepreneurs", free library drop-in) · *Impression Headshots* · *Seqex ICR Presentation* ("deep-dive training event") · *EXCLUSIVE B-PULSE MASTER CLASS* (no text at all) |
| **False positive** | **4** | *Leonid & Friends* → matched "Chicago" — it is a **tribute band** playing the music of Chicago · *Small Towns and Big Secrets* → matched "Georgia" — it is the **setting of the novel** being discussed · *Meals and Migration in Little Manila* → matched "entrepreneurial spirit" in a food-tour blurb · *Bona Sport Program: Hands-On Training* → a consumer sports clinic |

**Precision: 32/41 = 78% strict, 37/41 = 90% if the contested five are counted as rule-breaks.**
Every single false positive is the same failure mode: **a rule word appearing as content rather than
as the event's nature.** That is the exact failure §75 already predicted for the breadth regex, showing
up again one taxonomy branch over.

### The prose gap was suppressing the scan

Re-running the identical scan with the Task-1 recovered text appended: **41 → 51 flags (+24%)**, and
`civic` goes from 0 to 1 (it had no way to fire before — civic language lives in descriptions, never
in titles). New catches include *Dropship E-commerce Launch Training* (Ottawa), *Working at Heights
Vaughan* (a workplace-safety certification), *Protect Burnt Church Cemetery: Attend the June 16
Hearing* (civic **and** Georgia), and two more Guelph/Savannah non-GTA rows. Roughly 6 of the 10 new
flags are true on my read.

**So Stage-0 coverage was being under-counted by ~15–25% purely because of missing text.** Any
Stage-0 sizing done before the backfill is a floor, not an estimate.

### My honest read: prefill, don't pre-label

Rule-break **cannot** be machine-decided, but the choice is not prefill-vs-hand-label — it is
*where the human's attention gets spent*.

- **Against full automation:** 78% precision means ~1 in 5 flags is wrong, and a wrong `Rule-break`
  is the most expensive error in the taxonomy — it lands in Stage 0, which **hard-deletes**, and per
  §75 a deleted keeper is invisible and unrecoverable. Precision, not recall, is the binding
  constraint here, and 78% is nowhere near it.
- **Against pure hand-labelling:** 18 of the 32 true positives are one organizer (AdeptSkil) emitting
  near-identical templated titles. Asking a human to read *"Effective Vendor Management Training —
  Markham, ON | 1 Day Workshop"* eleven separate times is not judgment, it is data entry — and it is
  ~13% of his remaining workload.
- **The FPs are legible.** All four are one-glance rejects for a human. That is the profile where
  prefill works and pre-labelling doesn't.

**Recommendation (Ariel's call, not mine): pre-*sort*, don't pre-*label*.** Put the 51 flagged rows
first in the sitting order with the matched rule shown as a hint, and have him confirm or override in
seconds. He still touches every row, so no label is machine-authored — but he spends 30 seconds on the
AdeptSkil block instead of 10 minutes. A second, narrower option worth considering separately:
**auto-labelling the exact-duplicate templated families only** (organizer = AdeptSkil AND title matches
`… Training — {city}, ON | 1 Day Workshop`), which is a *provenance* rule, not a content rule, and
therefore the kind §75 already blesses.

**One caveat I cannot resolve from here:** this is precision measured against my own reading, not his.
The genuinely contested five all turn on intent rather than fact (is a free library job-search session
"professional development"?), and that is an editorial question — it belongs on the same call as the
Outcompeted phrasing.

---

## Task 3 — Four-way remap of the editor's first 12 (DRAFT — nothing written to Airtable)

Source: read-only pull of `tblOxYHuAl2yp9Znl`, 2026-07-27 12:0x, confirms he is still at **12 of 239**.
`NoneReason` fill remains **0/12** (the field key does not appear on a single record).

Proposed remap for a two-minute confirm. **Ten are high/medium confidence; two need a genuine re-look.**

| Row | Event | His `NoneType` | His verbatim `NoneReasoning` | **Proposed four-way** | Why | Conf |
|---|---|---|---|---|---|---|
| 6 | First Day Preview: Markham Edition | Ambiguous | *"This is a professional training that I don't cover in the VB. My focus is on entertainment."* | **Wrong fit** | ⚠️ **The event is not what he thought.** Recovered text: *"Experience a day in the life at YorkU Markham. Meet peers, explore campus, attend mock lectures."* It is a prospective-**student** campus open day, not professional training — his `Details` was blank. The *verdict* still holds on his own stated ground ("my focus is entertainment"), but the *reason* is wrong, so it is not a Rule-break. | **LOW — must confirm** |
| 11 | Effective Vendor Management Training — Markham, ON \| 1 Day Workshop | Ambiguous | *(none)* | **Rule-break** (prof-dev + B2B) | Textbook written rule. He tagged Ambiguous with no reasoning — the §75 instrument defect, not his error. | HIGH |
| 12 | Geocaching & Orienteering with BIAYR | Outcompeted | *"Coaching event that can be interesting for my audience but there are more engaging ones."* | **Outcompeted** | The only one of his six Outcompeted rows that passes the slow-week test — he explicitly says it *can* be interesting. Keep as-is. | HIGH |
| 20 | 2026 Indigenous Hockey Equipment Drive Golf Tournament | Ineligible | *"Niche event - j=hockey and Indigenous community."* | **Wrong fit** (breadth) | Breaks no written rule; this is the breadth criterion verbatim (§75). | HIGH |
| 24 | Internet Marketing Fundamentals Training – Vaughan, ON \| 1 Day Workshop | Ineligible | *"Pro coaching - outside of the VB focus."* | **Rule-break** (prof-dev) | His words name the rule. | HIGH |
| 25 | GODfidence Conference 2026 | Ineligible | *"Christian Business - this is a niche event."* | **Wrong fit** (breadth) — *contested* | ⚠️ Details: *"For people who win in business and career by staying connected to the Saviour."* That is arguably **B2B**, a written rule. His stated reason is breadth. Proposing Wrong fit because his reason governs, but this row is exactly the Rule-break/Wrong-fit boundary and is worth resolving out loud. | MEDIUM — flag |
| 29 | Spring Colours - Album Release Show with Mayraki & otsyuda | Outcompeted | *(none)* | **needs re-look** | No reasoning. Cannot be remapped honestly. | — |
| 30 | Unbreakable Minds Community Event | Outcompeted | *"This is a topic discussion event, VB readers normally look for more interactive activites."* | **Wrong fit** | A permanent verdict about a *format*, not a this-week loss. Fails the slow-week test. | HIGH |
| 33 | Bona Sport Program: Hands-On Training (WCON) | Outcompeted | *"This is more individual activity rather than for couples or families."* | **Wrong fit** | Permanent verdict about audience fit. Note: my Task-2 scan false-positived this on the word "Training" — it is a consumer sports clinic. | HIGH |
| 34 | TPM North June 20 - Shabbat Korach | Ineligible | *"Niche community event."* | **Wrong fit** (breadth) | Single-community religious event. §75's canonical breadth case; breaks no written rule. | HIGH |
| 35 | Love as a Foreign Language - Summer of Love Book Tour | Outcompeted | *"From the experience, people don't like such events."* | **Wrong fit** | "People don't like such events" is a permanent class verdict. Fails the slow-week test. | HIGH |
| 36 | Zumba Instructor Training with Ricardo Marmitte | Outcompeted | *"From my experience this type of events is not popular."* | **Rule-break** (prof-dev) — *contested* | ⚠️ **His reason and the fact disagree.** The event is instructor **certification** — professional development, a written rule. He rejected it on popularity. Both routes reject it, but they send it to different consumers (Stage 0 vs the gate). Proposing Rule-break because the fact is checkable and Stage 0 is free. | MEDIUM — flag |

**Resulting distribution (proposed, n=11 mappable):** Rule-break **3** · Wrong fit **6** · Outcompeted **1** ·
needs-re-look **2** (r11 is remapped from his Ambiguous, so nothing lands in Ambiguous).

**The headline of the remap:** only **1 of his 6 Outcompeted rows survives as Outcompeted.** That is
the §75 diagnosis confirmed on the full pilot, and it means the **R6 ranker's positive pile would have
been ~6× over-stated** under the three-way instrument. It also means the pilot's real signal is
`Wrong fit` — the bucket that did not exist — at ~55% of rejections.

**Two things this remap surfaced that the §75 write-up did not have:**
1. **r6 is a mislabel caused by feature poverty, not by taxonomy.** The instrument fix does not touch
   it; the Task-1 backfill does. It is a single row, but it is the existence proof that blank
   descriptions produce *wrong* labels, not merely weak ones — and he had ticked `NeededLink` on it,
   i.e. he opened the link and still got the nature of the event wrong from our summary.
2. **r25 and r36 are the same boundary from opposite sides** — an event where a written rule and a
   taste verdict both apply, and the editor reaches for taste. If Rule-break is defined as *"a written
   rule applies"* rather than *"a written rule is why I rejected it,"* both become Rule-break and Stage-0
   coverage rises. **That definitional choice is unmade and it belongs in the field description.** Flagged in Task 4.

---

## Task 4 — Airtable instrument respec (PROPOSAL ONLY — no writes performed)

Base `appVXHOyQcgQAk1gV`, table `tblOxYHuAl2yp9Znl`. Copy-ready; approve line by line.
**`TBD-from-editor` markers are deliberate — do not guess them, they are the content of the call.**

### 4.1 `NoneType` — single select, replace the three options with four

Option names, in this order (order is the ladder; he reads top-down and stops at the first yes):

1. `Rule-break`
2. `Wrong fit`
3. `Outcompeted` — **TBD-from-editor: he picks this label.** Candidates to offer him, not to impose:
   "Lost its slot", "Good but not this week", "Beaten this week". Do not ship our word.
4. `Ambiguous`

**Field description (copy-ready):**

> Why did this event not make the Brief? Work down the list and stop at the first one that fits.
>
> **Rule-break** — it breaks one of our standing rules: B2B / professional development / civic /
> outside the GTA. A fact you could check without knowing the Brief. If a rule applies, pick this even
> if that is not the first reason you thought of. *(⚠️ that last sentence is the r25/r36 definitional
> call — see Task 3. If you'd rather it read "…even if that is not why you rejected it," say so and
> the sentence changes; the two readings put different rows into Stage 0.)*
>
> **Wrong fit** — it breaks no rule, but you would never run it in the Brief, on any week. Wrong
> audience, wrong format, or it appeals to only one community rather than across communities.
> *(breadth wording: **TBD-from-editor** — the sentence must be his, see 4.4)*
>
> **Outcompeted** — you would be happy to run it. It just lost its slot this week to something better.
> **Test: if next week were slow and this event were available, would you run it? If no, it is Wrong
> fit, not Outcompeted.**
>
> **Ambiguous** — you genuinely cannot tell what this event even is. **Ambiguous is about the event,
> not about these instructions.** If the *instruction* is unclear, pick your best guess, say so in
> `NoneReasoning`, and we will fix the instruction.

### 4.2 `NeededLink` → `LinkGave` (retire the checkbox, add long text)

`NeededLink` is retired per §75. **Recommendation: do not delete it** — hide it from the view and
leave the 6 existing ticks in place. Deleting destroys the only record of the pilot's link behaviour,
and it costs nothing to keep a hidden field. *(This is a recommendation, not a decision — deletion is
irreversible, so it needs an explicit yes.)*

New field **`LinkGave`** — long text, **not required**:

> **What did the link tell you that the text didn't?** Leave blank if the text was enough.
> One line is plenty — e.g. *"the description made it sound like a class, it's actually a drop-in"*,
> *"it's in the US"*, *"it's for kids only"*.
> This is how we find out what the model is missing. Blank is a real, useful answer.

### 4.3 `NoneReason` — multi-select, 0/12 fill. **Recommendation: keep it, scope it to Rule-break only, hide it otherwise.**

The reasoning: 0/12 fill is not evidence he won't fill it — it is evidence that under the three-way
instrument the field had **no trigger**. It was presented as required on every row while the taxonomy
gave him no branch that called for it, so it read as optional metadata. Under the four-way instrument
it fires on ~13–21% of rows (the Task-2 scan's rate) and each tick is a Stage-0 rule we get for free.

Deleting it costs the one number Step 3 of the Scope doc needs (which rules carry what volume).
Keeping it *unscoped* repeats the failure. So: keep the field, **cut the option list to the four
written rules only** — `B2B` · `Professional development` · `Civic` · `Non-GTA` — and say in the
description that it applies to `Rule-break` rows and nowhere else.

> Only for **Rule-break** rows. Tick **every** rule that applies, not just the strongest — a German
> business webinar in Hamburg is three ticks, not one. Each tick is a filter we build once and never
> pay for again.

⚠️ **Contradiction to flag, not resolve:** the six original codes included `duplicate` / `non-event` /
`other`, and the plan doc's ladder also names *not-an-event* and *not-English*. **Neither is in
CLAUDE.md's written reject list.** Cutting the option list to four written rules is the
source-of-truth-clean choice, but it means a *Theatre Workshop Sign-up Form* (a real row, ×2 in the
239) has nowhere to go except `Ambiguous`. **Two ways out and I am not picking either: (a) add
not-an-event / not-English to CLAUDE.md's reject list and then to the option set, or (b) keep the
option set at four and accept those rows landing in Ambiguous.** Ariel's call — it is an edit to the
written rules, not to the instrument.

### 4.4 The breadth criterion — where it goes

It goes in **`Wrong fit`'s field description only**, and **nowhere in `NoneReason`** — because
`NoneReason` feeds Stage 0, and §75 is explicit that breadth must never reach a stage that deletes.

**TBD-from-editor.** The sentence must be his. Ariel has the rule ("horizontal, not vertical — it must
appeal across communities, not single one out"), but the *phrasing the editor will apply consistently
for 227 rows* is the thing to get on the call. Ask him to complete: *"An event is too niche when
______."* Our placeholder above is a placeholder.

### 4.5 View + ordering

- **`Negatives labelling` view: re-sort gate-slice first** (plan §4.10, still open, unchanged).
- **New, from Task 2:** consider a secondary sort putting the **51 rule-break-flagged rows first
  within the gate slice**, so the templated AdeptSkil block is cleared in one pass. Gated on the
  pre-sort-vs-pre-label call above.
- **New, from Task 1:** if the backfilled text is adopted, the `Details` column changes for 111 rows
  **mid-run**. That is an instrument change at row 12 — the same trade §75 already ruled on once, and
  the same answer applies (now or never), but **it is a fresh decision and it is Ariel's.** See the
  ranked list below.

### 4.6 What must NOT change

`Section` / `Flag` / `Label` stay frozen. The 07-26 snapshot detects drift on exactly those fields.

---

## Task 5 — Doc reconciliation (APPLIED)

### (a) `docs/r7/R7_Scope.md` — Status Snapshot redated 2026-07-25 → **2026-07-27**, six fixes

| # | Was | Now |
|---|---|---|
| 1 | "~2% keep rate" / "~98% junk" | **~46.5% eligible**; the 2% named as a *slot* rate conflating junk with eligible-but-outcompeted under the 5/section quota. Funnel arithmetic added (a perfect gate still leaves ~335 for 15 slots). |
| 2 | "tuned to ≥0.98 keeper recall" stated as settled | **Marked UNMEASURED** everywhere it appears (snapshot, Step 4, Metrics, Sign-off gate). 0.95 named as what the fresh-lens review prescribed; only 0.95→43% and 0.90→55% are measured. Sign-off item 1 now reads "at the operating point set by Step 4a," not a number. |
| 3 | Step 0 "Capture the demo rulings" | **Dissolved** — never lost; Airtable Batch 5, 29/30 have `Section`. Reduced to a one-line export note. |
| 4 | Step 0 "Dedup the corpus at fit" | **Superseded by grouped CV, not deletion** — the 98 "duplicates" are mostly legitimately recurring Golden programs. PinotsPalette ×19 still deletable, for a different reason (sponsor ad, not an event). |
| 5 | Step 2 recall@30 | **Marked blocked — no valid denominator** (3.1% pool/published overlap). Explicitly "re-point or cut," not silently retained. Removed from the live Metrics list. |
| 6 | "416 editor-labeled events" | **456 in Airtable**, 416 in the modeling set, drift unexplained → **#107**. |

Also added, because it is now load-bearing and was nowhere in the doc: a **Step 4a** naming the
recall/junk-rejection curve pricing as the thing that *sets* the bar, and the note that **ranking is
load-bearing inside W6** (per the §74 amendment).

### (b) `docs/r7/R7_None_Split_Labelling_Plan.md` — rewritten to match §75

Four-way taxonomy throughout · `NeededLink` → `LinkGave` · breadth placed at the gate with the measured
1.7× reason · solo-labelling workflow replaced by **live text-first sittings over 3–4 sessions** ·
**the 25-row pilot removed** (the first 12 *are* the pilot) · §0 no longer a blocking decision (it is
decided; it now points at §75) · Task-1 and Task-2 findings folded in where they change the plan.

### (c) `docs/source_decision_sheet.md` — AllEvents entry

`"Not yet verified at scale: pending a ~15-URL retrievability check (#108)"` replaced with the measured
numbers: API carries **no** description key across 392 live records; **20/20** live and **15/20** ended
sample pages yield one; **111/137 = 81%** on the full deck backfill; median 908 chars; `?ref=past-event-page`
required on ended pages; **2.2% silent-redirect rate → ID verification is mandatory**. The Georgia
city-slug collision was added as a **separate ⚠️ line** in the same entry, since it is a geo-integrity
finding rather than a description finding.

---

## Contradictions found (flagged, not resolved)

1. **The plan doc's rule ladder ≠ CLAUDE.md's reject list.** The ladder includes *not-an-event* and
   *not-English*; CLAUDE.md's written list is B2B / civic / prof-dev / non-GTA only. Three real rows in
   the 239 sit in that gap. Resolving it is an edit to the *rules*, not to the instrument. (Task 4.3.)
2. **§70 says SourceCategories are excluded from the embedded text; for AllEvents they are inside
   `DescriptionRaw`** and ride in anyway (256/1,805 = 14%). Known (plan §3.5), unresolved, and the
   backfill **changes its shape**: rows that were category-block-only would become real prose, which
   *removes* the leak for those rows. Nobody has re-measured the cats-ablation arm since.
3. **`R7_Scope` §Appendix "Missingness (measured, post-R5): description dropout ~47%"** — that number
   was measured against what we *fetch*. Task 1 shows the deck's dropout is 42.3% → 14.8% once the
   detail page is read. I left the Appendix figure alone (it describes the corpus as it exists today,
   which is still true) but it will be wrong the moment R1 changes. Not mine to update.
4. **The Scope doc's Step-3 claim "allevents.in is 56% junk but supplies ~300 keepers/year"** is
   measured on text that was missing 74% of AllEvents descriptions. Directionally probably fine; not
   re-derived here.

---

## Ranked list — what needs Ariel's ruling

1. **Does the recovered text go into the deck's `Details` before the sittings?** *(highest leverage,
   time-critical.)* For: 111 rows stop being blind, r6 proves blind rows produce wrong labels, and the
   editor's ~227 remaining rows are the expensive resource. Against: it changes the instrument at row
   12 **and** it destroys the text-only-ceiling measurement the sittings were designed to produce
   (plan §5.1) — you cannot measure the ceiling of text you have now improved. **These two cannot both
   be had.** My read: the ceiling measurement was a proxy for "should we fetch richer features," and
   Task 1 has already answered that question directly, so the ceiling is worth less than it was
   yesterday. But that is a scope call, and it is yours.
2. **The `Rule-break` definition — "a written rule applies" vs "a written rule is why I rejected it."**
   r25 and r36 turn on it, it changes Stage-0 coverage, and it must be settled *before* the field
   description is written. One sentence, but it is load-bearing.
3. **The AllEvents / Richmond-Hill-Georgia leak.** 10 detected, 3 of them mislabelled as keepers. Own
   issue, Stage-0 rule, R1 fix, or all three — and whether to re-ask the editor about the 3.
4. **Pre-sort vs pre-label vs hand-label for Rule-break** (Task 2's recommendation is pre-sort). ~13%
   of his remaining workload is one templated organizer.
5. **`NoneReason`: keep-and-scope (recommended) vs delete**, and the option-list contradiction in (1) above.
6. **`NeededLink`: hide vs delete.** Deletion is irreversible and the 6 pilot ticks are the only record.
7. **`DESC_CHAR_CAP` re-audit** — 88.3% of recovered text exceeds 300 chars, so the cap now governs
   whether the backfill is worth anything. Already on the plan doc's list; this raises its priority.
8. **The two artifacts in the recovered text** (duplicated title, trailing "Also check out other…")
   need a `clean()` change before any use. Off-limits this session by instruction; two regexes.

---

## QA pass on the staging file (run after the tasks, before handing over)

All checks pass on `allevents_backfill_2026-07-27.json`:

- **Schema:** all 11 required keys present on all 137 records; `recoveredLen === recoveredText.length` on every row.
- **Provenance:** every record's `Row` exists in `editor_deck_2026-07-18.json`, its `Link` is byte-identical
  to the deck's, its host is `allevents.in`, and it genuinely lacked prose. No duplicate rows. 0 integrity errors.
- **The redirect invariant holds:** 0 records with `idMatched === false` carry any text.
- **No `og:description` leakage:** 0 records contain the boilerplate string *"Find tickets & information for"*.
- **Right-event check:** 106 of 111 recoveries open with the deck's event title. I read the other 5 —
  **all five are correct matches**, failing the string test only because the extractor renders emoji as `?`
  (*STEAM Fair 🧪🎨⚙️*, *🎲 Backgammon Day Tournament*, *🌮 Flaco's House…*) or because a banner precedes the
  title. No wrong-event contamination in the file.
- **Prohibited files:** `git diff master..HEAD` confirms zero changes to `workflows/NLAP R1.json`,
  `editor_deck_2026-07-18.json`, `models/sectioning/corpora/**`, any `.npy`, `transfer_test.py`,
  `Execution_Log.md`, or `CHANGELOG.md`. Airtable access was GET-only (`_tmp_pull_none_split.js`).

**One extra thing the QA pass surfaced, worth a line:** row 342's page opens
*"EVENT CANCELLED (EXTREME WEATHER) — Bike Bonanza 2026! Please note as of June 13, this event has been
cancelled…"*. **AllEvents publishes cancellation banners that the API does not carry.** A cancelled event
is a *fact*, not a taste judgement — which makes it exactly the kind of thing §75 says Stage 0 may act on.
Not counted, not measured, not actioned; noting it because the fetch that recovers descriptions would
recover this for free.

## Files touched

**New (staging / temp, all under `models/sectioning/deck/`):**
- `allevents_backfill_2026-07-27.json` — **the Task-1 deliverable**, 137 records
- `_tmp_108_backfill_run.js` + `.log` — the fetcher and its run log
- `_tmp_108_report.js` — Task-1 analysis
- `_tmp_pull_none_split.js` + `_tmp_deck_pull_2026-07-27.json` — read-only Airtable pull
- `_tmp_rulebreak_scan.js` / `.json`, `_tmp_rulebreak_scan_bf.js` / `_tmp_rulebreak_scan_backfilled.json`

**Edited:** `docs/r7/R7_Scope.md` · `docs/r7/R7_None_Split_Labelling_Plan.md` · `docs/source_decision_sheet.md`
**New:** this file.
**Untouched, by instruction:** Airtable · `workflows/NLAP R1.json` · `clean()` / `DESC_CHAR_CAP` ·
corpora · embedding matrices · `editor_deck_2026-07-18.json` · `Execution_Log.md` · `CHANGELOG.md`.

---

## THE AGREEMENT NUMBER — Task 2, held back on purpose

**Ariel: write down your prediction before reading the next line.** What percentage of the editor's 12
completed rows do you expect a keyword scan of the four written rules to agree with?

<br><br><br>

**Against his raw three-way labels (treating `Ineligible` ≈ rule-break): 6/12 = 50.0%.**
Disagreements: r11, r20, r25, r33, r34, r36.

**Against the Task-3 four-way remap: 11/12 = 91.7%** (precision 3/4, recall 3/4; the single miss is
r33, the "Hands-On Training" sports clinic).

**The gap between 50% and 92% is the finding, not either number on its own.** The scan did not get
better between the two rows of that table — the *taxonomy* did. Three of the six "disagreements" under
his raw labels (r20, r25, r34) are rows where he used `Ineligible` to mean *"too niche,"* which is
precisely the leak §75 was written to stop. Measured on the corrected taxonomy, a keyword scan and the
editor agree on 11 of 12.

Two cautions before that number gets used for anything:
- **n=12, and the four-way column is my remap, not his.** Until he confirms Task 3's table, 91.7% is
  agreement between a scan and a reading — not between a scan and the editor.
- **91.7% agreement coexists with 78% precision on the full 239.** The 12 happen to be an easy slice
  (four clean AdeptSkil-family trainings). The precision number is the one that should drive the
  prefill decision, and it is the worse of the two.
