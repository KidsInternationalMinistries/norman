"""Turn a talk.json (format talk/1, per-point text with bullet key points) into talk2.json (format talk/2):
one full text for the whole talk, with [#1 Movement] [#2 Point] [#3 Sub point] [#4 Detail] tags, and a slide library
whose slides are placed in the text as [Slide name]. Usage: python3 -I convert_talk2.py <talk.json> <talk2.json>"""
import json, re, sys
src, out = sys.argv[1:3]; d = json.load(open(src))
PLACE = re.compile(r"^(text[XYW]|align|(eb|tt|sb)(X|Y|W|Size|Align|Color)|bl(Size|Color))$")
slides, names, times = [], set(), {}
def uniq(n, lab):
    n = re.sub(r"[\[\]{}\n]+", " ", n).strip() or "Slide"
    if n.lower() in {"stop", "main slide"}: n += " slide"
    if n not in names: names.add(n); return n
    k = f"{n} ({lab})"; i = 2
    while k in names: k = f"{n} ({lab} {i})"; i += 1
    names.add(k); return k
def tag(lvl, t): return f"[#{lvl} " + re.sub(r"\s+", " ", re.sub(r"[\[\]\n]+", " ", t)).strip() + "]"
verse_by = {}
T = []
for si, s in enumerate(d["sections"], 1):
    T.append(tag(1, s.get("title") or f"Movement {si}"))
    for pi, p in enumerate(s["points"]):
        lab = f"{si}.{chr(97 + pi)}"; ren = {}
        T.append(tag(2, p.get("cue") or "Point"))
        if p.get("seconds"): times["2|" + re.sub(r"\s+", " ", (p.get("cue") or "Point")).strip()] = p["seconds"]
        main = None
        if p.get("image") or (p.get("slideTitle") or "").strip() or (p.get("slide") or "").strip() or (p.get("eyebrow") or "").strip():
            main = uniq(p.get("cue") or "Slide", lab)
            o = {"name": main, "type": "image", "eyebrow": p.get("eyebrow", ""), "slideTitle": p.get("slideTitle", ""), "slide": p.get("slide", ""), "layout": p.get("layout", "left"), "image": p.get("image", "")}
            for k, v in p.items():
                if PLACE.match(k) or k in ("imagePrompt", "prevImage", "imageStyle"): o[k] = v
            slides.append(o)
        for v in p.get("verses") or []:
            ref = (v.get("ref") or "").strip()
            if not ref: continue
            key = (ref, v.get("text", ""))
            if key in verse_by: ren[ref] = verse_by[key]; continue
            n = uniq(ref, lab); verse_by[key] = n; ren[ref] = n
            slides.append({"name": n, "type": "verse", "ref": ref, "text": v.get("text", ""), "version": v.get("version", "")})
        for x in p.get("slides") or []:
            if not x.get("name"): continue
            n = uniq(x["name"], lab); ren[x["name"].strip()] = n; o = dict(x); o["name"] = n; slides.append(o)
        if main: ren["Main slide"] = main
        sc = p.get("script") or ""
        # key-point bullets are dropped (the outline stays at movement/point level); their {Ref} slide tags stay in place unless the same tag is already in that part
        parts = re.split(r"(\[#[12](?: [^\[\]\n]*)?\])", sc); buf = parts[0]
        for i in range(1, len(parts), 2):
            m = re.match(r"\[#([12])(?: ([^\[\]\n]*))?\]", parts[i]); lvl = int(m.group(1)) + 2; txt = m.group(2) or ""; body = parts[i + 1]
            refs = [r.strip() for r in re.findall(r"\{([^{}\n]+)\}", txt)]; txt = re.sub(r"\s*\{[^{}\n]+\}", "", txt)
            add = "".join(f"[{r}]" for r in refs if f"[{r}]" not in body)
            buf += add + body
        sc = buf
        def rt(m):
            r = m.group(1).strip()
            if r in ren: return "[" + ren[r] + "]"
            return m.group(0)
        sc = re.sub(r"\[([^\[\]\n]{1,60})\]", rt, sc)
        T.append((("[" + main + "]") if main else "") + ("\n" + sc.strip("\n") if sc.strip() else ""))
text = "\n".join(x for x in T if x is not None)
text = re.sub(r"(\[#[1-4] [^\[\]\n]*\])\n(?=\[)", r"\1\n", text)
o = {k: v for k, v in d.items() if k != "sections"}; o["format"] = "talk/2"; o["text"] = text; o["slides"] = slides; o["times"] = times
json.dump(o, open(out, "w"), indent=1, ensure_ascii=False); open(out, "a").write("\n"); print("wrote", out, len(slides), "slides")
