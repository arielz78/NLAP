# R7 #108 AllEvents staged-text inventory — 2026-08-03

## Outcome

The staged file contains 111 recovered detail-page texts. **108 are in the current 416-row model set, and 45 of those 108 were title-only (`deckLen == 0`) before recovery.** The recovered prose is substantial: after the current recipe plus leading-title removal, the 108 model rows have an uncapped median of 844 characters. The current 300-character cap truncates 91 of 108; a 600-character cap truncates 74.

The comparison cannot combine “add AllEvents descriptions” with “raise the global cap” and still claim to isolate one change. Among the 232 non-AllEvents rows in the same model set, **50 change relative to the current 300-character recipe at both 600 and uncapped; 29 remain longer than 600 and therefore also differ between the 600 and uncapped settings.** A cap change is a corpus-wide recipe change, not an AllEvents-only treatment.

Seven model rows contain other events' titles and dates in an organizer-recommendation tail. Those seven rows represent six unique listings because rows 62 and 354 are the same URL. This is cross-event contamination and should be stripped before any embedding comparison.

## Evidence seal

Before performing the inventory, the two fixed-path outputs of `models/sectioning/build_step4c_error_table.py` were copied to:

`models/sectioning/eval/sealed/step4c-pre-adjudication-2026-08-03/`

I chose a new, date-stamped evidence-state directory with explicit `.pre-adjudication` filenames, a fail-if-the-directory-exists creation guard, and SHA-256 hashes in `SEAL_MANIFEST.md`. The generator only writes its original JSON and Markdown paths, so future reruns cannot overwrite the sealed copies; the state being preserved is explicit rather than inferred from a generic backup suffix.

The sealed JSON is 36,948 bytes with SHA-256 `9A38140AE75783AAC75B9D785D42AE8707BD245F72FBE96AF1998A4072CAFE70`. The sealed Markdown is 39,822 bytes with SHA-256 `CA8FF32FF4A6E11A8D450F36BCE558D4AA9C641AF6E6BBCBED5FE606B38220D7`. Both hashes matched their working-path sources immediately after copying.

## Population and join

`allevents_backfill_2026-07-27.json` contains 137 attempted rows: 111 have non-empty `recoveredText` and 26 do not. Joining the 111 recovered rows to `corpora/transfer_rows.json` by `Row` gives:

| Population | Count |
|---|---:|
| Recovered texts staged | 111 |
| Recovered texts in the current 416-row model set | 108 |
| In-model recovered rows previously title-only (`deckLen == 0`) | 45 |
| In-model recovered rows with prior deck prose (`deckLen > 0`) | 63 |
| Recovered rows outside the model set | 3 |

The three recovered rows outside the model set are rows 4, 7, and 10. The backfill file has 134 of its 137 attempted rows in the model set; all three attempts outside it recovered text.

## Recovered-text artifacts

Counts below distinguish the complete 111-text staging set from the 108 rows that can affect the current model comparison.

| Artifact | All 111 | In-model 108 | Representative evidence |
|---|---:|---:|---|
| Own page title at the head | 111 | 108 | Row 2 begins `Mini Camp at Ansley Grove Library`. Across all 111, 105 heads equal `Event` byte-for-byte, 3 match after normalization, and 3 are recognizable variants. |
| `Also check out other ...` category/city navigation tail | 96 | 93 | Row 2 ends `Also check out other in Vaughan ... Kids events & activities in Vaughan.` |
| `About this Event` separator on its own line | 48 | 47 | Row 12 places it between the teaser and body. The current `BOILER` rule already removes it. |
| Other-event recommendation block | 7 | 7 | Row 62 appends three different Code Ninjas events with dates and times. |
| Standalone AllEvents CDN banner URL | 9 | 8 | Row 358 contains a `cdn-az.allevents.in/.../banners/...jpg` line. |
| Standalone `Highlights` / `Description` headings | 1 / 1 | 1 / 1 | Row 5 contains both. `Highlights` is already in `BOILER`; `Description` is not. |
| Immediate second copy of the title | 1 | 1 | Row 352 begins with `P1 Raceway @ Taste of Asia 2026` twice. |
| Status text attached to the title line | 1 | 1 | Row 342 begins `Event Cancelled (Extreme Weather) - Bike Bonanza 2026!`. A title matcher must handle a prefix, not only exact equality. |
| JSON-LD fallback truncation | 1 | 1 | Row 336 is the sole `source == "jsonld"` recovery, is 200 characters, and ends mid-sentence with `Kids will paint t`. Cleaning cannot restore the missing text. |
| Base64-obfuscated contact address | 18 | 18 | Row 8 contains a token decoding to `youngfounderco | gmail ! com`; 18 rows contain a printable decoded contact token. |
| Literal doubled question marks consistent with lost emoji | 7 | 6 | Row 384 begins `??? Love K-pop...`. This is recorded as a character-loss symptom, not assumed safe to delete. |

The three non-exact title variants are rows 32 and 318 (`STEAM Fair ??⚙️ | Richmond Hill, GA` versus the deck title) and row 342's cancellation-prefixed title. Because every recovered text begins with its own page-title line, the length analysis below removes the first non-empty line for all 108 model rows rather than relying on exact string equality.

### Cross-event contamination

The contaminating marker `You may also like the following events from ...` occurs in rows **5, 46, 62, 174, 227, 234, and 354**: 7 of 111 staged rows and 7 of 108 model rows. Rows 62 and 354 share one URL, leaving six unique listings.

Examples show why this is not cosmetic boilerplate:

- Row 5 appends `Royal Canadian Circus - Scarborough`, two `The Jury Experience` events, their August dates and times, and cities outside the row's Markham event.
- Row 62 appends `JR Coding & Circuits`, `Minecraft Redstone Engineering`, and `3D Modeling Advanced`, each with a July date and time.
- Row 234 appends `Working at Heights Lively in Sudbury` to the Vaughan row.

The correct boundary is the start of the organizer-recommendation block, not only the later `Also check out other` sentence. Removing only the latter would leave the other events' content in all seven contaminated rows.

## Cleaned-length distributions

Method: for the 108 recovered rows in `transfer_rows.json`, remove the validated first non-empty page-title line, then apply the current `text_recipe.py` behavior (`html.unescape`, HTML removal, blank/`BOILER` line removal, and whitespace collapse) with only `DESC_CHAR_CAP` varied. The proposed tail and CDN rules below are **not** included, because they are not approved. Percentiles use linear interpolation over the sorted character lengths.

| Cap | Min | P25 | Median | P75 | P90 | P95 | Mean | Max | Rows truncated |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 300 | 37 | 300.0 | 300.0 | 300.0 | 300.0 | 300.0 | 279.6 | 300 | 91 |
| 600 | 37 | 519.5 | 600.0 | 600.0 | 600.0 | 600.0 | 510.9 | 600 | 74 |
| Uncapped | 37 | 519.5 | 844.0 | 1,554.2 | 2,240.0 | 2,537.0 | 1,122.4 | 6,614 | 0 |

The uncapped bands are 17 rows at 300 characters or less, 17 from 301–600, and 74 above 600. Within the 45 previously title-only rows, the uncapped median is 914 characters; 40 exceed 300, 33 exceed 600, and the maximum is 2,998.

### Global-cap spillover into non-AllEvents rows

The 416-row model set contains 232 non-AllEvents rows, all of which joined to `raw_candidate_events.json`. Applying the same current cleaning logic to their raw descriptions gives:

| Comparison | Non-AllEvents rows whose text changes |
|---|---:|
| Current 300 → 600 | 50 |
| Current 300 → uncapped | 50 |
| 600 → uncapped | 29 |

Of the 50 rows longer than 300, the largest host groups are Markham Bibliocommons (23) and Vaughan Public Libraries (12). The longest non-AllEvents cleaned description is row 184 at 2,727 characters. This confirms that a global cap change alters more than the AllEvents recovery arm.

## Proposed `text_recipe.py` diff — not applied

```diff
@@
 BOILER = re.compile(
     r"^(overview|good to know|highlights|refund policy|organized by|about this event"
+    r"|description"
     r"|followers?|hosting.*|events?\d*|in person|online|\d+ hours?.*|\d+ minutes?"
     r"|refunds? up to .*|more events from .*|time:.*)$", re.I)
+
+ALLEVENTS_TAIL_START = re.compile(
+    r"^(?:you may also like the following events from\b|also check out other\b)", re.I
+)
+ALLEVENTS_BANNER_URL = re.compile(
+    r"^https?://cdn[^/\s]*\.allevents\.in/\S*/banners/\S+$", re.I
+)
+
+
+def _title_key(s):
+    s = html.unescape(str(s or "")).casefold()
+    return re.sub(r"[^a-z0-9]+", " ", s).strip()
+
+
+def _is_title_line(line, title):
+    line_key, title_key = _title_key(line), _title_key(title)
+    return bool(title_key) and (
+        line_key == title_key
+        or line_key.startswith(title_key + " ")
+        or line_key.endswith(" " + title_key)
+    )
@@
-def clean(s):
+def clean(s, title=None):
     """Serve-time description cleaning. Byte-identical to the four 2026-07-28 copies."""
     s = html.unescape(str(s or ""))
     s = re.sub(r"<[^>]+>", " ", s)                                  # strip HTML
     lines = [ln.strip() for ln in s.splitlines()]
     lines = [ln for ln in lines if ln and not BOILER.match(ln)]
+    while lines and _is_title_line(lines[0], title):
+        lines.pop(0)
+    for i, line in enumerate(lines):
+        if ALLEVENTS_TAIL_START.match(line):
+            lines = lines[:i]
+            break
+    lines = [ln for ln in lines if not ALLEVENTS_BANNER_URL.match(ln)]
     return re.sub(r"\s+", " ", " ".join(lines)).strip()[:DESC_CHAR_CAP]
```

Reasons and boundaries:

1. **Leading title: remove one or more matching head lines at read time.** The match is position-anchored and compares a normalized title with exact, title-plus-suffix, or prefix-plus-title forms. That covers the 105 exact heads, the three normalization-only heads, the two location-suffixed STEAM variants, row 342's cancellation prefix, and row 352's immediate second copy without deleting title words from body prose. This requires callers to pass the event title; the signature remains backward-compatible until the companion call-site change is approved.
2. **Organizer recommendation tail: cut from `You may also like...` or `Also check out other...` to the end.** Both markers are AllEvents-specific and line-start anchored. Starting at the earlier marker removes the seven contaminated blocks; starting only at `Also check out` does not.
3. **CDN banner: remove only a whole line matching an AllEvents CDN `/banners/` URL.** This removes the 9 observed image artifacts without deleting registration links, organizer sites, forms, or other URLs that may carry actual eligibility evidence.
4. **`Description`: add it as whole-line boilerplate.** The one observed instance is a structural heading. `About this Event` and `Highlights` need no new rule because the existing `BOILER` pattern already removes them.

I would not add generic rules for base64-looking strings, doubled question marks, arbitrary repeated sentences, or cancellation language. The first two can collide with real content, generic deduplication can erase intentional emphasis, and cancellation is evidence for Stage 0 rather than boilerplate. The JSON-LD row is a fetch-quality limitation and cannot be fixed in the recipe.

## Reproduction inputs

All counts in this report were computed from these local artifacts without network calls, model fitting, embeddings, Airtable access, or manifest/cache writes:

- `models/sectioning/deck/allevents_backfill_2026-07-27.json`
- `models/sectioning/corpora/transfer_rows.json`
- `models/sectioning/corpora/raw_candidate_events.json`
- `models/sectioning/text_recipe.py`

No existing source file was edited, and the proposed recipe diff was not applied.
