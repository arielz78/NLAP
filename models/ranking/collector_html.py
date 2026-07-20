"""Renders the self-contained HTML pair collector.

Design notes:
- Single file, inline CSS/JS, zero external requests — works from file://.
- Shows Title + DescriptionRaw + section label ONLY. Dates and venues are
  deliberately hidden so the editor judges content, not proximity (proximity
  ranking is exactly what the scorer is replacing).
- is_holdout / duplicate_of ride along invisibly and come out in the CSV.
- Answers persist to localStorage on every action, so a closed tab loses
  nothing; reopening the file resumes at the first unanswered pair.
- The first <script> block is pure (data + CSV builder) so it can be
  unit-tested outside a browser; DOM code lives in the second block.
"""

import json

_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Newsletter Pair Judgments</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
         background: #f5f6f8; color: #1c2530; line-height: 1.45; }
  header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #dfe3e8;
           padding: 10px 20px; display: flex; align-items: center; gap: 16px; z-index: 5; }
  header h1 { font-size: 15px; font-weight: 600; }
  #progress { font-size: 13px; color: #5a6572; flex: 1; }
  main { max-width: 1060px; margin: 24px auto 60px; padding: 0 16px; }
  .section-badge { display: inline-block; background: #1f4e79; color: #fff;
                   font-size: 13px; font-weight: 600; padding: 4px 12px;
                   border-radius: 999px; margin-bottom: 6px; }
  .question { font-size: 15px; color: #38424e; margin-bottom: 14px; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 720px) { .cards { grid-template-columns: 1fr; } }
  .card { background: #fff; border: 2px solid #dfe3e8; border-radius: 10px;
          padding: 16px; cursor: pointer; transition: border-color .1s, box-shadow .1s; }
  .card:hover { box-shadow: 0 2px 10px rgba(20,40,70,.10); }
  .card.selected { border-color: #1f7a3d; box-shadow: 0 0 0 3px rgba(31,122,61,.18); }
  .card .tag { font-size: 12px; font-weight: 700; color: #8a93a0; letter-spacing: .05em; }
  .card.selected .tag { color: #1f7a3d; }
  .card h2 { font-size: 16px; margin: 6px 0 8px; }
  .card .desc { font-size: 14px; color: #38424e; max-height: 240px; overflow-y: auto;
                white-space: pre-wrap; }
  .controls { margin-top: 18px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  #why { flex: 1; min-width: 200px; padding: 8px 10px; font-size: 14px;
         border: 1px solid #c9cfd6; border-radius: 6px; }
  button { font-size: 14px; padding: 8px 18px; border-radius: 6px; border: 1px solid #c9cfd6;
           background: #fff; cursor: pointer; }
  button:hover:not(:disabled) { background: #eef1f4; }
  button:disabled { opacity: .45; cursor: default; }
  button.primary { background: #1f4e79; border-color: #1f4e79; color: #fff; }
  button.primary:hover:not(:disabled) { background: #16405f; }
  .hint { font-size: 12px; color: #8a93a0; margin-top: 10px; }
  .done { background: #fff; border: 1px solid #dfe3e8; border-radius: 10px;
          padding: 32px; text-align: center; }
  .done h2 { margin-bottom: 10px; }
  .done p { margin-bottom: 18px; color: #5a6572; }
</style>
</head>
<body>
<header>
  <h1>Which event is more newsletter-worthy?</h1>
  <div id="progress"></div>
  <button id="downloadBtn">Download CSV</button>
</header>
<main id="main"></main>

<script id="pairdata">
const MANIFEST_ID = __MANIFEST_ID__;
const PAIRS = __PAIRS_JSON__;

function csvEscape(v) {
  v = String(v == null ? "" : v);
  if (/[",\\n\\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function buildCsv(pairs, answers) {
  const lines = ["pair_id,section,event_A_id,event_B_id,winner,why,is_holdout,duplicate_of"];
  pairs.forEach(function (p, i) {
    const a = answers[i];
    if (!a || !a.winner) return;
    lines.push([
      p.pair_id, p.section, p.A.id, p.B.id, a.winner, a.why || "",
      p.is_holdout ? "true" : "false", p.duplicate_of || ""
    ].map(csvEscape).join(","));
  });
  return lines.join("\\r\\n") + "\\r\\n";
}
</script>

<script>
const STORE_KEY = "r6pairs_" + MANIFEST_ID;
let answers;
try { answers = JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { answers = null; }
if (!answers || answers.length !== PAIRS.length) {
  answers = PAIRS.map(function () { return { winner: null, why: "" }; });
}
let idx = answers.findIndex(function (a) { return !a.winner; });
if (idx === -1) idx = PAIRS.length;

const main = document.getElementById("main");
const progress = document.getElementById("progress");

function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(answers)); } catch (e) {} }
function answered() { return answers.filter(function (a) { return a.winner; }).length; }

function makeCard(tag, ev, pairIdx) {
  const card = document.createElement("div");
  card.className = "card";
  const t = document.createElement("div"); t.className = "tag"; t.textContent = "OPTION " + tag;
  const h = document.createElement("h2"); h.textContent = ev.title;
  const d = document.createElement("div"); d.className = "desc"; d.textContent = ev.desc;
  card.appendChild(t); card.appendChild(h); card.appendChild(d);
  card.onclick = function () { pick(tag); };
  if (answers[pairIdx].winner === tag) card.classList.add("selected");
  return card;
}

function pick(tag) {
  answers[idx].winner = tag;
  save();
  render();
  document.getElementById("why").focus();
}

function render() {
  progress.textContent = Math.min(idx + 1, PAIRS.length) + " / " + PAIRS.length +
    " \\u00b7 " + answered() + " answered";
  main.innerHTML = "";
  if (idx >= PAIRS.length) {
    const done = document.createElement("div");
    done.className = "done";
    const h = document.createElement("h2"); h.textContent = "All pairs answered \\u2014 thank you.";
    const p = document.createElement("p");
    p.textContent = "Hit Download CSV and send the file back. " +
      "(Your answers are also saved in this browser.)";
    const btn = document.createElement("button"); btn.className = "primary";
    btn.textContent = "Download CSV"; btn.onclick = download;
    const back = document.createElement("button"); back.textContent = "Back";
    back.style.marginLeft = "10px";
    back.onclick = function () { idx = PAIRS.length - 1; render(); };
    done.appendChild(h); done.appendChild(p); done.appendChild(btn); done.appendChild(back);
    main.appendChild(done);
    return;
  }
  const p = PAIRS[idx];
  const badge = document.createElement("span");
  badge.className = "section-badge"; badge.textContent = p.section;
  const q = document.createElement("div"); q.className = "question";
  q.textContent = "Click the event you would rather put in this section.";
  const cards = document.createElement("div"); cards.className = "cards";
  cards.appendChild(makeCard("A", p.A, idx));
  cards.appendChild(makeCard("B", p.B, idx));
  const controls = document.createElement("div"); controls.className = "controls";
  const why = document.createElement("input");
  why.id = "why"; why.type = "text"; why.maxLength = 80;
  why.placeholder = "why? (optional, one word is fine)";
  why.value = answers[idx].why || "";
  why.oninput = function () { answers[idx].why = why.value; save(); };
  const backBtn = document.createElement("button"); backBtn.textContent = "\\u2190 Back";
  backBtn.disabled = idx === 0;
  backBtn.onclick = function () { if (idx > 0) { idx--; render(); } };
  const nextBtn = document.createElement("button"); nextBtn.className = "primary";
  nextBtn.textContent = "Next \\u2192"; nextBtn.disabled = !answers[idx].winner;
  nextBtn.onclick = function () { save(); idx++; render(); };
  controls.appendChild(backBtn); controls.appendChild(why); controls.appendChild(nextBtn);
  const hint = document.createElement("div"); hint.className = "hint";
  hint.textContent = "Keyboard: \\u2190 picks A, \\u2192 picks B, Enter = next.";
  main.appendChild(badge); main.appendChild(q); main.appendChild(cards);
  main.appendChild(controls); main.appendChild(hint);
}

function download() {
  const csv = buildCsv(PAIRS, answers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pairs_answers_" + MANIFEST_ID + ".csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

document.getElementById("downloadBtn").onclick = download;
document.addEventListener("keydown", function (e) {
  if (e.target && e.target.id === "why" && e.key !== "Enter") return;
  if (idx >= PAIRS.length) return;
  if (e.key === "ArrowLeft") { pick("A"); e.preventDefault(); }
  else if (e.key === "ArrowRight") { pick("B"); e.preventDefault(); }
  else if (e.key === "Enter" && answers[idx].winner) { save(); idx++; render(); e.preventDefault(); }
});

render();
</script>
</body>
</html>
"""


def _js_json(obj):
    # Break "</script>" sequences that could occur inside descriptions.
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def render_collector(pairs, manifest_id):
    """pairs: presentation-ordered list of pair dicts (see generate_pairs)."""
    slim = [
        {
            "pair_id": p["pair_id"],
            "section": p["section"],
            "is_holdout": p["is_holdout"],
            "duplicate_of": p["duplicate_of"],
            "A": {"id": p["A"]["id"], "title": p["A"]["title"], "desc": p["A"]["description"]},
            "B": {"id": p["B"]["id"], "title": p["B"]["title"], "desc": p["B"]["description"]},
        }
        for p in pairs
    ]
    html = _TEMPLATE.replace("__MANIFEST_ID__", _js_json(manifest_id))
    html = html.replace("__PAIRS_JSON__", _js_json(slim))
    return html
