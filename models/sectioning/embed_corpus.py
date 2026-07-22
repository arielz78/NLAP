"""
Embed the 3-class published corpus with OpenAI text-embedding-3-small and cache to disk.

PLUMBING ONLY — this file produces X and labels. It does not fit, score, or evaluate
anything; that is the authored core and lives in the fit script.

Why cache: embeddings cost money and network time. This script embeds once, writes the
matrix to disk, and short-circuits on every later run unless the input text actually
changed (detected by hash, not by timestamp). Re-running it is free and instant.

Text construction is COPIED from fit_tfidf.py deliberately, not imported:
the two must stay identical or the comparison is measuring different corpora. If you
change the text recipe in one, change it in both.

Usage:
    ../.venv/Scripts/python.exe embed_corpus.py            # embed (or reuse cache)
    ../.venv/Scripts/python.exe embed_corpus.py --force    # re-embed, ignore cache

Then in the fit:
    import numpy as np, json
    X = np.load("corpora/embeddings_text-embedding-3-small.npy")
    labels = json.loads(Path("corpora/embeddings_labels.json").read_text())
"""

import json
import hashlib
import sys
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from openai import OpenAI

DEFAULT_MODEL = "text-embedding-3-small"

# $/1M tokens. Verify against https://platform.openai.com/usage before quoting these —
# OpenAI's pricing page and model cards have disagreed on -large ($0.065 vs $0.13).
USD_PER_1M_TOKENS = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
    "text-embedding-ada-002": 0.10,
}

BATCH_SIZE = 100          # inputs per request; keeps each call well under the token cap
MAX_CHARS = 24_000        # ~8k tokens, the model's per-input ceiling; nothing here is close

ROOT = Path(__file__).resolve().parent.parent.parent
CORPORA = Path(__file__).resolve().parent / "corpora"
LABELS_PATH = CORPORA / "embeddings_labels.json"  # model-independent: same rows, same order

KEEP = ("For Families", "For Couples", "For Golden Age Readers")


def paths_for(model):
    """Cache paths are per-model, so embedding a second model never clobbers the first
    and each keeps its own cache-hit check."""
    return (CORPORA / f"embeddings_{model}.npy",
            CORPORA / f"embeddings_{model}_manifest.json")


def build_corpus():
    """Rebuild texts/labels exactly as fit_tfidf.py does.

    Two lists appended together in one pass, so texts[i] is always described by
    labels[i]. That alignment contract is what the whole fit rests on.
    """
    history = json.loads(
        (ROOT / "data/beehiiv/issue_history.json").read_text(encoding="utf-8")
    )
    texts, labels = [], []
    for issue in history:
        for event in issue["events"]:
            if event["section"] not in KEEP:
                continue
            desc = event["description"] or ""
            texts.append(event["displayTitle"] + " " + desc)
            labels.append(event["section"])
    return texts, labels


def corpus_hash(texts):
    h = hashlib.sha256()
    for t in texts:
        h.update(t.encode("utf-8"))
        h.update(b"\x00")  # delimiter, so ["ab","c"] and ["a","bc"] hash differently
    return h.hexdigest()


def cache_is_valid(digest, n, x_path, manifest_path):
    if not (x_path.exists() and LABELS_PATH.exists() and manifest_path.exists()):
        return False
    m = json.loads(manifest_path.read_text(encoding="utf-8"))
    return m.get("corpus_sha256") == digest and m.get("n_rows") == n


def main():
    force = "--force" in sys.argv
    model = DEFAULT_MODEL
    if "--model" in sys.argv:
        model = sys.argv[sys.argv.index("--model") + 1]
    if model not in USD_PER_1M_TOKENS:
        raise SystemExit(f"unknown model {model!r}; known: {list(USD_PER_1M_TOKENS)}")
    X_PATH, MANIFEST_PATH = paths_for(model)

    texts, labels = build_corpus()
    digest = corpus_hash(texts)

    print(f"model : {model}")
    print(f"corpus: {len(texts)} rows, 3-class")
    if len(texts) != len(labels):
        raise SystemExit("alignment broken: len(texts) != len(labels)")

    if cache_is_valid(digest, len(texts), X_PATH, MANIFEST_PATH) and not force:
        X = np.load(X_PATH)
        m = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        print(f"cache HIT - reusing {X_PATH.name} {X.shape}")
        print(f"  embedded {m['embedded_at']} | {m['total_tokens']:,} tokens "
              f"| ${m['cost_usd']:.4f} (already paid, not re-charged)")
        return

    load_dotenv(ROOT / "NLAP_Airtable.env")
    client = OpenAI()  # reads OPENAI_API_KEY from the environment

    truncated = sum(1 for t in texts if len(t) > MAX_CHARS)
    if truncated:
        print(f"  note: {truncated} rows truncated to {MAX_CHARS} chars")
    payload = [t[:MAX_CHARS] for t in texts]

    vectors, total_tokens = [], 0
    for start in range(0, len(payload), BATCH_SIZE):
        batch = payload[start:start + BATCH_SIZE]
        resp = client.embeddings.create(model=model, input=batch)
        # resp.data is not guaranteed ordered by the API contract; sort by index
        # so vectors[i] still corresponds to texts[i].
        vectors.extend(d.embedding for d in sorted(resp.data, key=lambda d: d.index))
        total_tokens += resp.usage.total_tokens
        print(f"  embedded {start + len(batch):>5}/{len(payload)}")

    X = np.array(vectors, dtype=np.float32)
    cost = total_tokens / 1_000_000 * USD_PER_1M_TOKENS[model]

    CORPORA.mkdir(exist_ok=True)
    np.save(X_PATH, X)
    LABELS_PATH.write_text(json.dumps(labels), encoding="utf-8")
    MANIFEST_PATH.write_text(json.dumps({
        "model": model,
        "n_rows": len(texts),
        "n_dims": int(X.shape[1]),
        "corpus_sha256": digest,
        "total_tokens": total_tokens,
        "cost_usd": round(cost, 6),
        "embedded_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "text_recipe": "displayTitle + ' ' + (description or '')",
    }, indent=2), encoding="utf-8")

    print(f"\nwrote {X_PATH.name}  shape={X.shape}  dtype={X.dtype}")
    print(f"tokens: {total_tokens:,}")
    print(f"COST:   ${cost:.6f}   (~${cost * 52:.4f}/yr at one re-embed per week)")


if __name__ == "__main__":
    main()
