# R7 Scope — Section Classifier (ROUGH DRAFT — NOT REVIEWED)

> **Status: rough aggregate, 2026-07-09.** This is a capture of three independent
> views assembled at speed, *not* a finalized plan. It exists so the design work
> from this session isn't lost in a chat transcript. **Next session:** review
> slowly → self-critique → blind Fable critique + GPT-5.5 second opinion →
> finalize → Decision_Log entry → open `r7` issues. Do **not** treat any decision
> here as settled. The architecture call is Ariel's, informed by the critique —
> not delegated to a model.

---

## Why R7 now (the discovery that reordered the roadmap)

R6 (within-section scorer) was being built when its pair-collection harness hit a
wall: it needs a pool of candidates **already assigned to a section**, and the
step that does that (R2 enrichment) is **dead / effectively unused**. The fresh
post-R5 candidate pool (~1,045 future events) is rich on every raw signal
(venue 99%, source 100%, title 100%) but carries **no section label** — those are
`Pending`, unenriched. The old `Enriched` cohort is stale (pre-R5: venue 24%,
source 22%) and its sections came from the same bad R2.

**So R6 has a hidden dependency on R7.** The roadmap sequenced R6→R7 assuming R2
sectioning worked; it doesn't. R7 (the trained sectioner) is the prerequisite.

- **Do now:** R7-W6 — build + evaluate the classifier **offline**.
- **Defer:** R7-W7 — deploy into live n8n/R2. Not needed to unblock R6.

---

## The collapse assumption (all three sources independently agree)

**Training labels are the editor's *edited* display titles; production inputs are
*raw* scraped titles.** The whole approach assumes these embed close enough to
transfer. Flagged independently by: my measurement (caveat on the 80%), the blind
Fable agent (its "validate first"), and the roadmap itself (line 449, "no
DisplayTitle leakage"). **This is the load-bearing risk.**

**→ R7-W6's real go/no-go gate = sectioning agreement on RAW candidate titles**,
rebuilt by joining `issue_history.json` events back to their raw Candidate rows
via URL. Not yet run.

### Feasibility measurement (this session — OPTIMISTIC upper bound only)
- TF-IDF + LinearSVC, 5-fold CV on 1,126 historical events (edited titles).
- **79.6% held-out accuracy vs 34% baseline.** Balanced across classes.
- Confusion is almost entirely **For Couples ↔ For Golden Age** (semantically real
  overlap). For Families is cleanest (f1 0.83).
- **Read: sectioning is learnable** (not noise) — but 80% is the ceiling; real
  (raw-title) number will be lower, and the fuzzy Couples/Golden boundary means
  abstention/review is load-bearing, not optional.

---

## The three views

| Dimension | Roadmap / §17 (our prior) | Blind Fable-5 design (cold) | Measurement says |
|---|---|---|---|
| **Core** | Trained classifier on ~2,729 historical `(title,section)` labels | Same — trained supervised classifier | Learnable (~80% optimistic) |
| **Representation** | **TF-IDF** | **Embeddings** (text-embedding-3-small) — TF-IDF vocab is city-specific, won't port to client #2 | TF-IDF already hits 80% on Vaughan |
| **Model head** | **LinearSVC** | **One-vs-rest calibrated logistic** — honest independent probabilities for overlapping sections + enables abstain thresholds | Abstain design is needed (fuzzy zone) → favors calibrated probs |
| **LLM role** | LLM as low-confidence **fallback + rationale** | **No LLM in v1** — deterministic flags instead (simpler, replayable) | n/a |
| **Low-confidence** | (implied) | Two flags: `NeedsReview-Ambiguous` (two high probs) vs `NoSection` (all low) | Couples/Golden overlap needs this |
| **Deploy** | Deploy to R2 (R7-W7) | Versioned JSON artifact, scored in Node | (defer W7) |

### Convergences (treat as settled foundation — validated by cold re-derivation)
- Trained supervised classifier on the editor's revealed placements. (Reject rules/R2; reject pure-LLM-primary.)
- Offline train in Python/sklearn → versioned artifact → score in Node, no model server.
- Abstain on low confidence is load-bearing.
- Portability = per-client config + retrain per client (matches per-base-models intent).

### Open decisions (for the critique + Ariel's call — NOT decided)
1. **Representation: TF-IDF vs embeddings.** Fable's portability argument (client #2) is strong; the counter is embeddings add an API dependency + their own provider-drift. *Proposed framing:* decide on the raw-title number — if TF-IDF holds ~75% on raw Vaughan titles, ship it v1; embeddings become the **client-#2 trigger**, not a v1 requirement (don't over-engineer for client #2 before client #1 is validated).
2. **Model head: LinearSVC vs calibrated OvR-logistic.** Low-cost swap; leans Fable (abstain design needs honest probabilities).
3. **LLM in v1: fallback+rationale vs none.** Leans defer — v1 ships with flags; add LLM rationale later if the editor wants explanations.

### New catches from the blind pass (add to scope regardless of architecture)
- **⚠️ Self-reinforcing `NoSection` drift (the real silent/live risk).** A wrong *section* is visible (editor moves it); an event silently dropped as "no section" never appears, never gets corrected, and since retraining uses published survivors, the newsletter **narrows irreversibly**. Mitigation: never hard-drop; weekly `NoSection`-rate alarm; one-click editor "rescue" → highest-value training labels.
- **Local Aroma rows as negative examples** — the only "none-shaped" signal (no reject pool).
- **Description-dropout at training** — 42% of live candidates lack a description; drop it randomly in training so the model doesn't lean on a field missing half the time.
- **Calibration tripwire** — if editor-override inside the auto-accept band > ~10%, auto-downgrade to suggest-only until retrained.

---

## Go/no-go gate (proposed — to confirm in review)
- ≥ 85% top-1 on the **unseen-title, raw-text** temporal test set, **no class < 75%**.
- ≥ 92% accuracy inside the auto-accept band at ≥ 80% coverage.
- Live-shaped check: run over one real cycle's candidates, hand-label ~150 stratified predictions, require ≥ 80% agreement.

## Portable interface (client #2)
- Per-client config: section names/count (**don't hardcode 3**), thresholds, per-source priors, Airtable IDs, artifact path.
- Canonical training schema `train.py labels.json → model_vN.json`; `labels.json` = client-agnostic `{text, section, date, url}`.
- Stable scorer API: `classify({title, description?, venue?, source?, city?, date}) → {section|null, confidence, alt, flag}`.
- Hardcode fine for Vaughan: scraper-specific title cleanup, emoji handling, the Vaughan label-extractor.

---

## Next steps
1. Review this doc slowly (Ariel) → self-critique.
2. Blind Fable critique of the *written doc* + GPT-5.5 second opinion (Ariel's own account).
3. Finalize → Decision_Log entry (records the R6↔R7 reorder + the architecture pick) → open `r7` issues.
4. Build R7-W6: rebuild training set from **raw** titles (URL join) → train → measure the real go/no-go number → decide representation.
5. Then resume R6: section the fresh pool (high-confidence only) → generate pairs → editor labels → horse-race the scorers.

**Deferred:** R7-W7 (deploy to live n8n) until after R6's pairs validate what the sectioner needs.
