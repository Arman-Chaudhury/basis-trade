"""Jev's idea, done deterministically: every number in a sentence we show must appear among the numbers we computed.
Returns the sentence plus a list of any figures that could not be traced to the result. (Jev itself, the TypeSafe judge
Atropos uses, stays in the Node service; this is the no-key version so a verdict is never shown unchecked.)"""
import re


def _nums(obj, out):
    if isinstance(obj, bool): return
    if isinstance(obj, (int, float)): out.add(round(float(obj), 2)); out.add(round(float(obj))); out.add(round(float(obj) * 100, 1)); out.add(round(float(obj) * 100))
    elif isinstance(obj, dict):
        for v in obj.values(): _nums(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj: _nums(v, out)
    elif isinstance(obj, str):
        for m in re.findall(r"-?\d[\d,]*(?:\.\d+)?", obj):
            try: out.add(round(float(m.replace(",", "")), 2))
            except ValueError: pass


def check(sentence, facts):
    pool = set(); _nums(facts, pool)
    untraced = []
    for m in re.findall(r"-?\$?\d[\d,]*(?:\.\d+)?", sentence):
        raw = m.replace("$", "").replace(",", "")
        try: v = float(raw)
        except ValueError: continue
        if re.fullmatch(r"20\d\d", raw): continue  # years
        if round(v, 2) not in pool and round(v) not in pool: untraced.append(m)
    return {"ok": not untraced, "untraced": untraced, "checked": len(re.findall(r"\d", sentence)) > 0}
