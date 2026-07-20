"""Pluggable LLM client for llm_comparator.

Env-driven (no key ever appears in code):
  R6_LLM_API_KEY   (falls back to OPENAI_API_KEY)  — if absent, the seeded
                   stub is used and the harness runs fully offline.
  R6_LLM_MODEL     default "gpt-5.4-nano" (matches the blurb pipeline)
  R6_LLM_BASE_URL  default "https://api.openai.com/v1" (any OpenAI-compatible
                   chat-completions endpoint works)

Uses urllib only — no extra dependency for one POST.
"""

import json
import os
import urllib.request
import zlib


def get_client(seed=7):
    key = os.environ.get("R6_LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        return StubLLM(seed=seed)
    return RealLLM(
        api_key=key,
        model=os.environ.get("R6_LLM_MODEL", "gpt-5.4-nano"),
        base_url=os.environ.get("R6_LLM_BASE_URL", "https://api.openai.com/v1"),
    )


class StubLLM:
    """Deterministic stand-in when no API key is set. Returns 'A' or 'B'
    seeded by the prompt content, so runs are reproducible but not random
    across pairs. Clearly not a real judgment — for machinery testing only."""

    is_stub = True

    def __init__(self, seed=7):
        self.seed = seed

    def choose_a_or_b(self, prompt):
        h = zlib.crc32(f"{self.seed}|{prompt}".encode("utf-8"))
        return "A" if h % 2 == 0 else "B"


class RealLLM:
    is_stub = False

    def __init__(self, api_key, model, base_url):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")

    def choose_a_or_b(self, prompt):
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
        }
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.load(resp)
        text = body["choices"][0]["message"]["content"].strip().upper()
        for ch in text:
            if ch in ("A", "B"):
                return ch
        raise ValueError(f"LLM returned no A/B verdict: {text[:120]!r}")
