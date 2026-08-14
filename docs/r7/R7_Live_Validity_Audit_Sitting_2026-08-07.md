# R7 Live Validity Audit — Editor Sitting, 2026-08-07

The Closing Sequence step 4 sitting: the editor rules blind on the **live** Aug 14–23 pool scored by the frozen gate. **Not the product shadow** (§90's later step, which observes only the accepted set) — this audit is stratified and sees rejected rows too.

Live reference. Follow top to bottom during the sitting.

**Where he rules:** Airtable table `tblLID8HlJpSmIpSz` — "R7 Live Audit (2026-08-13)"
**Total rows:** 124 (Instrument B = 24, Instrument A = 100)
**Nothing is scored today.** Readout happens after, under Decision_Log §93.

---

## THE ONE RULE

**Say nothing about any individual row until the whole sitting is closed.**

No reactions. No "interesting." No "are you sure?" No asking why on a row you disagree with.
You built the thing being tested and you're in the room — every hint you leak inflates the result.

Park every question. Ask them all at the end.

---

## 1. Open the sitting

Say this, roughly:

> "I've got a batch of real candidates from the Aug 14–23 window. Rule each one the way you'd rule it in a normal week — would you publish it, and which section. Just work through them."

**Do NOT say:**
- that this is testing a model
- that anything is being scored or compared
- that there's a "right answer"
- anything about how many you expect him to keep

If he asks what it's for: *"It's a validity check on the candidate pool — I want your read on a live week."* True, and it doesn't prime him.

---

## 2. Instrument B — 24 rows

- [ ] Run B **first**
- [ ] Top 8 **unique recurring series** × 3 sections
- [ ] Select up to 5 events the editor would actually run
- [ ] Short warm-up; should move fast

---

## 3. Instrument A — 100 rows

- [ ] Randomized blocks, stratified
- [ ] **No calibration anchors** — they were omitted at packet build by protocol, so it's exactly 100 rows, not ~110
- [ ] **Build in a break.** 124 rows is a long sitting — fatigue changes rulings

Pacing check: if he starts moving noticeably faster or stops reading, call the break.

---

## 4. Capture reasoning

Only where **he volunteers it**. Don't prompt for it.

Write it **verbatim**. Not paraphrased. His exact words are what make the error-mechanism worksheet adjudicable later.

Use the notes table at the bottom of this doc.

---

## 5. Close the sitting

- [ ] Confirm every row has a ruling (no blanks)
- [ ] Thank him, close the laptop on it
- [ ] **Now** you can ask your parked questions

---

## 6. After — not today

- Readout contract is **Decision_Log §93**: split A by the `LINK` marker, exclude the corrected packet's 6 `gate_fit_overlap` rows from the transfer number
- Read live transfer **first**; interpret Fork C only if it holds (§90)
- Then adjudicate Step 4c on the rows the live evidence makes consequential

---

## Live notes — verbatim only

| Row | What he said (exact words) | Context |
|-----|---------------------------|---------|
|     |                           |         |
|     |                           |         |
|     |                           |         |
|     |                           |         |
|     |                           |         |
|     |                           |         |
|     |                           |         |
|     |                           |         |

---

### Instrument B — post-sitting notes (Ariel, verbatim, recorded 2026-08-08)

Instrument B only. **No notes were taken for Instrument A** — the editor ran A himself; his rulings are in Airtable `tblLID8HlJpSmIpSz`, and that table is the only record of A.

> - didn't need links for top 8 for families.
> - ordering of events in the top 5 slots is not top 1 is 1, 2 is 2, 3 is 3 and so forth. there is lots of reasoning that is unique to the edior, eg, has to jumble up different events so you don't get slots 1-3 as all family picnic events (for example), so he'd put them like slot 1, 3, 5. another reason is that the top event in the sectoin or lead event is going to always have an image in the newseltter issue, so if good image avaialbe he might do it. or sometimes he'll do 'best event' as the 2nd slot bc he want to maximize clicks so by having 2nd best event as 1st slot, it's more distribution of clicks since people WILL click on the best event and on the first slotted event with an imge. NOW IDK HOW BRO SCIENCEY THIS IS, THIS IS JUST EDITOR WORDS.
> - need to account for historical events, the editor said that he wouldn't run something because it has been run in the last few weeks. BUT IN GENERAL HE WOULD RUN THIS X EVENT. so that's a feature we should include.
> - for old people in instrument B, it seems that the gate classifier or the segment classifier takes a liking to words with yoga in it and assign to old people? does that the segment classifier the culprit?
> - beer craft is also 2 events of the same event in the couples events for instrument B
> - pinot's palette cannot be 2 events in one week for same section. AGAIN, PINOT'S PALETTE IS FOR BOTH GOLDEN AGE AND FOR COUPLES>

**Status: observations, not findings.** Nothing above is verified or adopted. Open items they raise, unresolved:

1. **Slot order ≠ rank order.** The editor's stated reasons (anti-clustering, image availability on the lead slot, deliberate click spreading) are self-reported and untested. Consequence if true: **R6 must not be evaluated against observed slot position** — `joinClicksData.js` grades ordering within section+issue, and position may encode layout, not preference. `TODO(ariel)`: decide whether R6's target is slot order or a latent quality order.
2. **Recency suppression is a real editorial rule and the system has no feature for it.** "Wouldn't run it — ran it recently, but would otherwise run it" is a *distinct* reason from ineligibility, and it is currently indistinguishable from a reject in the label. Touches the None-split taxonomy (§75/§77) and R6, not the gate.
3. **`yoga` → Golden Age attractor — CONFIRMED in the packet (2026-08-08).** 4 of the 8 Golden Age rows are yoga: B-3-01 *Practice Joy with Laughter Yoga*, B-3-03 *Flex and Stretch Yoga*, B-3-05 *Chair Yoga*, B-3-07 *Yoga for Older Adults*. Half the section's top-8 is one activity. **Which model causes it is still open** — B is the top 8 by `P(include) × P(section)`, so either factor could dominate; and note *Chair Yoga* / *Yoga for Older Adults* are genuinely senior-targeted, so part of this may be correct behaviour rather than a keyword attractor. Decomposable offline from the cached scores — no new spend.
4. **Craft beer ×2 in Couples — CONFIRMED, but not the defect it looked like (2026-08-08).** B-2-03 *Richmond Hill Craft Beer Festival* (Eventbrite) and B-2-05 *Richmond Hill Rotary Craft Beer Festival* (OnRichmondHill) are the same real-world event arriving from two sources under different titles. §93's one-series-per-section collapse **did** hold — `series_key` is title-derived, so it cannot see a cross-source title variant. This is the known cross-source duplicate problem (`overlapAudit.js` territory), surfacing in the packet rather than being caused by it. Two of Couples' eight slots are one event.
5. **Pinot's Palette ×2 in Couples — CONFIRMED, and this one is a real rule violation (2026-08-08).** B-2-07 *Romance at Dusk – Date Night* and B-2-08 *Sunset on Orchid Sand Cove* are two different classes at the same venue, both in Couples. **"Max 1 venue per section per issue" is an existing production rule** — the allocator enforces it, the packet builder did not. ⚠️ The editor's cross-section claim ("Pinot's Palette is for BOTH Golden Age and Couples") is **not visible in this packet** — no Pinot's row appears in Golden Age here, so that observation comes from his general experience, not from Instrument B. Whether the venue cap should extend per-issue rather than per-section is a **new editorial constraint**, `TODO(ariel)`.

**Readout impact of #4 and #5:** 4 of Couples' 8 rows are duplicate-collapsed pairs. Any per-section count read off Instrument B must state whether it counts listings or distinct events.

---

## Parked questions (ask at the end, not during)

-
-
-

---

## Sitting log

- Start time:
- Break taken:
- End time:
- Rows completed: B ___ / 24 · A ___ / 100
- Anything that went wrong:
