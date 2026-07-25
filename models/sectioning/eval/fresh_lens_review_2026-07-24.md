# Fresh-lens independent review — R7 section classifier (2026-07-24)

**What this is.** An independent, deliberately un-anchored review of the R7-W6 sectioning system,
run to test whether the team's "go back to the drawing board" instinct held up under a lens that
had *never seen the team's own diagnosis*. Brief = staff-MLE framing, raw facts + whitelisted data
files only; forbidden from reading `docs/`, `Execution_Log.md`, `logs/`, and the `.py` scripts, so
it reasoned from data, not from our conclusions. Model: **Claude Fable 5** (background subagent).
Prompt authored by Ariel (judgment core) + Claude (scaffold), via `/spinup`. Full brief:
`scratchpad/fresh_lens_brief.md` (session artifact).

**Headline result (the meta-point):** given only raw facts + data, the agent *independently
re-derived the team's own reframe* — "mis-framed: you built a section classifier when the product
needs a junk gate + a ranker." Convergence from an un-anchored lens = strong de-risking of the
reframe. Cross-checked by Ariel's independent per-source None-rate read (read-1), whose numbers
matched the agent's almost exactly.

**Corrections it caught in our own docs (fix these):**
1. **Golden is NOT 18–21 training examples — it's 367** (1,126 = balanced 376 Fam / 383 Coup / 367
   Gold). The 18–21 is the *transfer-slice* count. So "Golden weak because too few training
   examples" is **wrong** — it's weak on *transfer* from slice-size noise + editorial C/G softness.
2. **8 titles were published in different sections in different weeks** (a farmers market under all
   three) → section is partly an issue-packing outcome (quotas / what else was available), not an
   intrinsic event property → per-event classifier has a hard contextual ceiling.
3. **`live_demo_30_seed23.json` has `editor_ruling` empty on all 30 rows** — the 30 demo verdicts
   are not saved in any readable file. Capture them.

**Caveat the agent stated itself:** it fit its own logistic regression on our cached embeddings
(`.npy`, reused — it did NOT re-embed or use our scripts), with a cruder optimizer. Numbers are
directional but internally consistent. **The gate fit remains Ariel's authored core to reproduce.**

---

## Verbatim report

**Headline diagnosis: the problem is mis-framed — you built a section classifier when the product needs a junk gate and a ranker; the classifier is roughly adequate at its actual job, the missing include-vs-None stage is the whole gap, and I verified with your own data this session that a dedicated binary gate is ~7x more efficient at rejecting junk than adding abstention to the 3-class model.**

Everything below is grounded in files I read and computations I ran this session (in memory; nothing written). Where a number is mine, I fit my own logistic regression on your stored embeddings (`embeddings_text-embedding-3-large.npy`, 1,126×3072; `transfer_nocats_text-embedding-3-large.npy`, 416×3072) — a cruder optimizer than yours, so treat my numbers as directional but internally consistent.

### What the data actually shows

**Training corpus** (`models/sectioning/corpora/published_titles.json`, 1,126 rows): balanced 376 Families / 383 Couples / 367 Golden. Two things the brief gets wrong: Golden is *not* 18–21 training examples — it's 367; the 18–21 figure matches Golden counts in the labeled *transfer slices* (21 in "gate", 30 in "train" per `transfer_rows.json`), which is why Golden transfer recall has a ±0.15–0.2 confidence interval and single-run numbers on it are near-meaningless. Second, the corpus has 43 duplicated titles (one sponsor ad appears 19 times) and **8 titles the editor published in *different* sections in different weeks** (a farmers market appears under all three). That last fact matters more than it looks: section is partly an *issue-packing outcome* (5-slot quotas, what else was available that week), not an intrinsic property of the event. A per-event section classifier has a hard ceiling because the label-generating process is contextual.

**Serving distribution** (`raw_candidate_events.json`, 1,805 events): 38% from allevents.in; 59 events from foreign Eventbrite domains (eventbrite.de/.fr/.co.uk/.sg/…, German B2B webinars, UK charity events) — pure junk identifiable from the URL alone; 22% have empty descriptions; median description 114 chars. Only 42 of 1,805 raw titles match a published title.

**Labels** (`transfer_rows.json`, 416 rows): 225 None (54%), includables 79/57/55. Per-source None rates: markham.ca and visitvaughan.ca 0%, bibliocommons 42%, eventbrite.ca 48%, allevents.in 56%, vaughanpl 64%, eventbrite.com 79% — the editor's "some sources are more trustworthy" intuition is flatly correct in the data. Repeat-pairs: 35 URL pairs, 27/35 same label (77%); conditional on include-both, 16/18 agree (89%); 6 of 8 disagreements flip across the None boundary. Confirmed: the unstable boundary is include/exclude, not section.

**My probe reproductions:**
- 3-class transfer (fit on 1,126, scored on 416): recall 0.861 Fam / 0.632 Coup / 0.545 Gold. Consistent with your ~0.61 directional number. The confusion mass is Couples↔Golden (32 of 57 errors) — the editorially softest boundary.
- **Confidence cannot do reject work.** On the transfer set, None events and includables have nearly identical confidence distributions (medians 0.52 vs 0.57). Sweeping an abstention threshold: to abstain on 87% of junk you keep only 27% of keepers. This kills the "add a τ to the 3-class model" path — it's structurally the wrong tool, exactly as the live demo hinted (junk assigned sections at 0.6–0.75 confidence: a German health workshop → Golden 0.61, a business seminar → Golden 0.64, per `live_demo_30_seed23.json`).
- **The distinguishing experiment, run:** a binary include-vs-None logistic regression trained *on the 416 labeled rows themselves* (5-fold CV, grouped by URL so repeat-pairs don't leak) gets **AUC 0.823**. At 95% keeper recall it rejects **43% of junk**; at 90%, 55%. Compare: abstention rejects 42% of junk at the cost of 34% of keepers. Same junk removal, 5% keeper loss instead of 34%. With ~330 training rows and text-only features — no source, no category tags, no geography — this is a floor, not a ceiling.
- Your 0.774 CV number is only mildly inflated by duplicate leakage: my random-split CV gives min-class 0.760, title-grouped 0.733. The in-corpus number is basically honest; the gap to transfer is real distribution shift plus the junk-saturated serving context, not CV malpractice.

One data-integrity note: `live_demo_30_seed23.json` has `editor_ruling` empty on all 30 rows — the demo verdicts in the brief are not recorded in any file I was permitted to read. Record them; they're 30 labeled events you paid an editor session for.

### §8.1 — Diagnosis (the two questions)

**Filter vs rank vs classify vs unnamed:** The need is, in order: **(1) a reject gate, (2) ranking, (3) nothing on classification.** And the unnamed thing an outside MLE sees: **this is a top-k selection problem, not a classification problem.** The product ships 5 events per section from ~720 candidates. The only number that matters is precision at the top of three ranked lists — per-class recall over the full distribution measures a fiction, because 98% of the distribution is never going to ship regardless of what the model says about it. The editor's demo feedback already decomposed it for you (~12 filter failures, ~4 ranking failures, ~3 classifier failures) and my numbers agree: the classifier gets ~77% of genuine includables right, in line with the ~89% ceiling his own repeat-labels impose on the section boundary.

**Reduce volume or exploit it:** Exploit — but only after the gate exists; today the volume is a pure cost because nothing between ingestion and the editor can say no. Do not solve it by dropping sources wholesale: the small "trustworthy" sources are keeper-dense but tiny (markham.ca contributed 2 raw events), and allevents.in's 56% None still means ~300 keepers/year you'd lose. Drop only the provably-dead tail (foreign Eventbrite domains — 59 events, zero possible keepers) and make **source a feature, not a verdict**. The selection is *not* currently good enough to earn the volume; the fix is one small model away, not an ingestion redesign.

### §8.2 — Pipeline design

**Stage 0, deterministic pre-filter (a day of work, no ML).** Domain allowlist/blocklist (kill foreign Eventbrite, forms.gle), language detection, geography where the source provides it. The team's skepticism about keyword/rule filters is **right for content** ("no B2B words" doesn't scale — event language is unbounded) and **wrong for provenance**: domain, language, and geo are small closed vocabularies with near-zero maintenance. Never write content keywords; always write provenance rules.

**Stage 1, learned reject gate — the one new build.** Binary logistic regression, P(include | event), on exactly the embeddings you already compute, plus a one-hot source feature, has-category-tags, and description length. Trained on the 416 (grow it: every weekly editor review of the shortlist is free labeling — 30–50 labels/week means ~800 rows by September without a single dedicated labeling session). Operating point: **fix keeper recall at 0.95 and take whatever junk rejection that buys** — 43% today, likely 55–65% with source features and doubled data. Critically, the gate does not need to be aggressive, because —

**Stage 2, ranking — which is the same model.** The gate's P(include) *is* the ranking score. Final score per section = P(include) × P(section | event) from the existing 3-class model; take top 5, surface top ~8 per section to the editor. Residual junk that survives the gate doesn't need to be filtered — it needs to *lose* to keepers in ranking, and a junk event at P(include)=0.4 never cracks a top-5 when 15 keepers score 0.8. This dissolves the "classifier before ranker was the wrong order" worry: you don't need a separately-built ranker; you need the gate score used twice. It also converts the wide funnel from cost to asset — with 720 candidates, precision@5 improves with pool size as long as scoring is calibrated, which is exactly "earning the volume."

**Handoff:** Stage 0 drops ~5–10% deterministically → gate scores everything, hard-drops below the 0.95-keeper-recall threshold (~halving volume), passes P(include) downstream → sectioner assigns P(section) → rank by product, top-8 per section to the editor, whose accept/reject/move actions write back as next month's gate labels. The human reviews ~24 ranked events instead of 720, which is the actual product goal.

### §8.3 — The right target

Retire min-per-class recall ≥ 0.75 as a success bar. On transfer, for Couples/Golden it sits at or below the noise ceiling (89% section agreement conditional on include, Couples↔Golden confusion editorially soft — your own deck schema has an "Either" column), and Golden's transfer n of ~21–55 can't measure it to better than ±0.15 anyway. Keep it only as an internal diagnostic. The success metrics that match the product:

- **Gate: keeper recall ≥ 0.95** (measured by CV on the growing labeled set). This is the one number that must be conservative — a silently killed keeper is invisible; surviving junk is merely annoying.
- **Product: editor swaps ≤ 2–3 of the 15 shipped slots per issue** (precision@15 ≈ 0.85), and editor time-to-approve under ~15 minutes. This is measurable every single week for free from the review loop.

### §8.4 — Cheapest distinguishing experiment

The one I would have prescribed — "train a binary gate on the 416 and see if embeddings separate include from None at all" — **I ran during this review: AUC 0.823, 43% junk rejection at 95% keeper recall, text-only, ~330 training rows per fold.** It came out decisive-positive, so the plan above stands. The *next* distinguishing measurement, before committing the architecture: a **one-week dry run** — take one real issue window, run Stage 0 + gate + sectioner + rank-by-product, hand the editor top-8 per section, count swaps against the ≤2–3 bar. A few hours of plumbing plus one editor session, and it measures the only number the business cares about. If the editor swaps 8+, the failure will localize (gate vs section vs rank) from which list position the swaps came from.

### §8.5 — Three one-liners

- **Change first:** stand up the binary include-vs-None gate on the existing embeddings and 416 labels — it's the missing stage, and it demonstrably works at AUC 0.82 before any feature work.
- **Don't touch:** the 3-class classifier and the embedding features — at ~77% on genuine includables against an ~89% human ceiling it is done; every point left in it is label noise.
- **Most likely to waste three weeks:** chasing 0.75 min-class transfer recall — more Golden data, model upgrades, or abstention-threshold tuning on the 3-class model — a target at the noise floor, measured on samples too small to resolve it, using a confidence signal I showed cannot separate junk from keepers.

---

## Read-1 (Ariel's independent cross-check) — None-rate per source, R7 Label Deck (450 labeled rows)

| Source | n | None | None% |
|---|---|---|---|
| eventbrite.com | 38 | 31 | 82% |
| vaughanpl.info | 22 | 14 | 64% |
| allevents.in | 195 | 108 | 55% |
| eventbrite.ca | 140 | 66 | 47% |
| markham.bibliocommons | 29 | 11 | 38% |
| markham.ca / visitvaughan / pinotspalette / thechefupstairs / varley | 3–4 each | 0 | 0% |
| cityplayhouse / mcmichael / onrichmondhill | 2 each | 2 | 100% |
| **OVERALL** | **450** | **239** | **53%** |

Structural read: the two dominant sources (allevents + eventbrite.ca = 74% of the pool) sit at the
53% average → **junk is smeared across the sources you can't drop, not concentrated in droppable
ones.** Clean sources are tiny; dirty-droppable ones are small volume. Matches the agent's numbers
independently. Caveat: deck is uncertainty-sampled, so absolute rate is inflated vs the true pool;
relative per-source pattern holds. Script: `scratchpad/none_by_source.py`.

---

## Status after this review (NOT a decision)

Two independent lenses (Fable + read-1) converge on the reframe: **build a binary include/None gate;
use its P(include) both to filter and to rank; retire min-class recall as the bar.** **Still open /
not decided:** the ChatGPT third lens (not yet run), the scope call itself (Ariel's authored core),
the Couples↔Golden intrinsic-overlap side-by-side read. Decision deferred to a fresh session with
all three reads in hand.
