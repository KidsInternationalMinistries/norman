"""Turn a talk2.json (format talk/2, the new version in the norman GitHub repo) into the Markdown master copy in Past Talks.
One text with outline tags [#1 Section] [#2 Point] [#3 Sub point], slide tags [Name], reading cues; plus talking points,
audience notes (with translations) and the slide library.
Usage: python3 -I export_talk2.py <talk2.json> <out.md>"""
import json, re, sys, html
src, out = sys.argv[1:3]
t = json.load(open(src))
text = t.get("text", "")
slides = {s.get("name"): s for s in t.get("slides", []) if s.get("name")}
notes, aud = t.get("notes") or {}, t.get("audNotes") or {}

def plain(h):
    """Talking points / audience notes are small HTML: turn into indented Markdown bullets."""
    h = h or ""
    h = re.sub(r"<li[^>]*>", "\n- ", h); h = re.sub(r"</(p|div|li)>|<br\s*/?>", "\n", h)
    h = re.sub(r"<(b|strong)>(.*?)</\1>", r"**\2**", h); h = re.sub(r"<[^>]+>", "", h)
    h = re.sub(r"\*{4,}", "**", h); lines = [html.unescape(x).rstrip() for x in h.split("\n")]
    return [x for x in lines if x.strip()]

def slide_line(s):
    ty = s.get("type", "image")
    if ty == "verse": return f"verse {s.get('ref','')} ({s.get('version','')}): \"{(s.get('text') or '').strip()}\""
    if ty == "quote": return f"quote: \"{s.get('quote','')}\" — {s.get('by','')}"
    if ty == "video": return f"video: {s.get('url') or s.get('video','')}"
    bits = " / ".join(x.strip() for x in [s.get("eyebrow",""), s.get("slideTitle",""), s.get("slide","")] if x and x.strip())
    b = "; ".join(x.strip() for x in (s.get("bullets") or "").split("\n") if x.strip())
    return f"{ty}: \"{bits}\"" + (f" bullets: {b}" if b else "") + (f" image: {s['image']}" if s.get("image") else "") + (" + QR code" if s.get("qr") else "")

L = [f"# {t.get('title','Untitled talk')}", ""]
meta = " · ".join(x for x in [t.get("audience"), t.get("length"), t.get("event")] if x)
if meta: L += [f"*{meta}*", ""]
if t.get("bigIdea"): L += [f"**Big idea:** {t['bigIdea']}", ""]
L += ["> Master copy exported from the talk files (GitHub: KidsInternationalMinistries/norman, talks/<folder>/talk2.json, the new version). Reuse freely in new talks. Headings are the outline (sections and points); under each: its talking points, audience notes, then the full text with slide tags [Name] and reading cues kept in place. The slide library is at the end.", ""]

TAG = re.compile(r"\[#([1-4])(?:\s+([^\[\]\n|]*))?(?:\|([a-z0-9]{2,12}))?\]")
cnt = [0, 0, 0, 0, 0]; pos = 0; parts = []
for m in TAG.finditer(text):
    parts.append(("text", text[pos:m.start()])); parts.append(("node", m)); pos = m.end()
parts.append(("text", text[pos:]))
def label(lvl):
    if lvl == 1: return str(cnt[1])
    if lvl == 2: return f"{cnt[1]}.{chr(96 + cnt[2])}" if cnt[1] else chr(96 + cnt[2])
    return f"{cnt[1]}.{chr(96 + cnt[2])}.{cnt[3]}"
for kind, v in parts:
    if kind == "text":
        body = v.strip("\n")
        if body.strip(): L += [body, ""]
        continue
    lvl, name, nid = int(v.group(1)), (v.group(2) or "").strip(), v.group(3)
    cnt[lvl] += 1
    for j in range(lvl + 1, 5): cnt[j] = 0
    lab = label(lvl)
    tm = (t.get("times") or {}).get(nid or f"{lvl}|{name}")
    L += [("## " if lvl == 1 else "### " if lvl == 2 else "#### ") + f"{lab} {name}" + (f" (practiced {tm//60}:{tm%60:02d})" if isinstance(tm, (int, float)) and tm >= 5 else ""), ""]
    if nid:
        keys = [nid] + sorted([k for k in notes if k.startswith(nid + ":")], key=lambda k: int(k.split(":")[1]))
        sets = [(k, plain(notes[k])) for k in keys if notes.get(k) and plain(notes[k])]
        for k, pl in sets:
            L += ["**Talking points" + ((" (Next " + (k.split(":")[1] if ":" in k else "1") + ")") if len(keys) > 1 else "") + ":**"] + pl + [""]
    a = aud.get(nid) if nid else None
    if a and plain(a.get("html")):
        L += ["**Audience notes:**"] + plain(a.get("html")) + [""]
        for lg, h in (a.get("tr") or {}).items():
            if plain(h): L += [f"*Audience notes ({lg}):*"] + plain(h) + [""]

L += ["## Slide library", ""]
for n, s in slides.items():
    L.append(f"- [{n}] {slide_line(s)}")
    for lg, tr in (s.get("tr") or {}).items():
        L.append(f"    - {lg}: " + " / ".join(str(x) for x in tr.values() if x))
langs = t.get("languages") or []
if langs: L += ["", f"Audience languages: {', '.join(langs)}"]
open(out, "w").write("\n".join(L).rstrip() + "\n")
print("wrote", out)
