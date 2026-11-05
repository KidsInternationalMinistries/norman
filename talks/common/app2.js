// Talk pages, version 2 (trial, Nov 5 2026): the whole talk is ONE text plus a library of named slides.
// Tags in the text build everything else:
//   [#1 Movement]  [#2 Point]  [#3 Sub point]  [#4 Detail]   → the outline (numbers itself: 1, 1.a, 1, a)
//   [Slide name]  [Stop]                                     → slides, in the order they appear
//   [Pause] [Slow] [Excited] … [Normal]                     → reading cues (never a Next)
// Next always lights up the next stretch of text to read: the words between two tags (outline or slide tags; reading cues
// don't count). A point with no words of its own is skipped. A slide comes up together with the words after it, so a slide
// at the start of a point shows at once, and one in the middle comes up on the Next after the words before it. A slide with
// no words after it (before the next point) still gets a Next of its own. A slide belongs to the point it's under: moving on
// to the next point at the same level or higher brings back the slide of the point above (or keeps the last one if there's none).
// Data: talks/<Folder>/talk2.json, format "talk/2". Pages: edit2.html, present2.html, slides2.html (mode edit2 | present2 | slides2).
(function(){
"use strict";
const T = window.TALKAPP; if (!T) return;
const {C, E, $, GH, RAW, LOCALIMG, toJpeg, b64e, token, tokenSetup, letter, TAG, CUETAG, fmtVerse, slideBox, xsHTML, verseSlide, setSlide, SLIDE_TYPES} = T;
const MODE = document.body.dataset.mode;
const parts = location.pathname.replace(/\/[^/]*\.html$/, "/").split("/").filter(Boolean);
const FOLDER = decodeURIComponent(parts[parts.length - 1] || ""), PATH = C.root + "/" + FOLDER, FILE = PATH + "/talk2.json";
const LV = ["", "Movement", "Point", "Sub point", "Detail"];
const TYPES = {image: "Picture with words", verse: "Verse", plain: "Words only", bullets: "Bullets", bulletsimg: "Bullets on a picture", quote: "Quote", video: "Video"};
const STOP = {name: "Stop", stop: true};

// ---------- reading the text ----------
// Every tag in order: outline nodes, slides, stops and cues, with where they sit in the text.
function parse(d){ const t = d.text || "", toks = [], nodes = [], cnt = [0, 0, 0, 0, 0], stack = [];
  for (const m of t.matchAll(TAG)) { const r = m[1].trim(), nm = r.match(/^#([1-4])(?:\s+([\s\S]*))?$/), at = m.index, end = at + m[0].length;
    if (nm) { const lvl = +nm[1]; cnt[lvl]++; for (let k = lvl + 1; k <= 4; k++) cnt[k] = 0; while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop();
      const lab = lvl === 1 ? String(cnt[1]) : lvl === 2 ? (cnt[1] || 0) + "." + letter(cnt[2] - 1) : lvl === 3 ? String(cnt[3]) : letter(cnt[4] - 1);
      const n = {j: nodes.length, lvl, text: (nm[2] || "").trim(), at, end, lab, parent: stack[stack.length - 1] || null, top: lvl === 1 ? null : null, slides: []};
      n.full = lvl <= 2 ? lab : (stack.find(x => x.lvl === 2) ? stack.find(x => x.lvl === 2).lab + " · " : "") + lab;
      nodes.push(n); stack.push(n); toks.push({k: "node", node: n, at, end, ref: r}); continue }
    const cue = CUETAG[r.toLowerCase()]; if (cue) { toks.push({k: "cue", cue, at, end, ref: r}); continue }
    const s = r.toLowerCase() === "stop" ? STOP : (d.slides || []).find(x => x && x.name && x.name.trim() === r);
    if (s) toks.push({k: "slide", slide: s, at, end, node: nodes[nodes.length - 1] || null, ref: r}) }
  nodes.forEach((n, i) => { n.stop = i + 1 < nodes.length ? nodes[i + 1].at : t.length;      // its own words end at the next tag of any level
    let k = i + 1; while (k < nodes.length && nodes[k].lvl > n.lvl) k++; n.last = k < nodes.length ? nodes[k].at : t.length });   // its whole branch ends at the next one at its level or higher
  return {toks, nodes, t} }
// The Next steps: one per stretch of words between tags, each with the slide on screen (see the rule at the top).
// A step: {node, a, b (the words, from a to b in the text; null for a slide with no words), pos, slide, pre, nxt (the tags around it, as indexes in P.toks)}.
function build(P){ const t = P.t, S = []; let cur = null, stack = [], fresh = null, last = null, pos = 0, pre = -1;
  P.nodes.forEach(n => { n.slides = [] });
  const top = () => stack.length ? stack[stack.length - 1].s : last;
  const add = st => { S.push(st); last = st.slide; if (fresh) { fresh.step = S.length - 1; fresh = null } };
  const bare = () => { const x = fresh; add({node: x.node, a: null, b: null, pos: x.at, slide: top(), pre: x.i, nxt: x.i}) };
  const words = b => { if (b > pos && t.slice(pos, b).replace(TAG, " ").trim()) add({node: cur, a: pos, b, pos, slide: top(), pre, nxt: -1}) };
  P.toks.forEach((x, i) => { x.i = i; if (x.k === "cue") return; const n0 = S.length; words(x.at); if (S.length > n0) S[S.length - 1].nxt = i;
    if (fresh) bare();
    if (x.k === "node") { stack = stack.filter(e => e.lvl < x.node.lvl); cur = x.node }
    else { if (x.node) x.node.slides.push(x); if (!x.slide.stop) { const at = x.slide.keep ? 0 : cur ? cur.lvl : 0; stack = stack.filter(e => e.lvl < at); stack.push({lvl: at, s: x.slide}); fresh = x } }
    pos = x.end; pre = i });
  words(t.length); if (fresh) bare();
  return S }
function slideHTML(s, d){ if (!s) return d && d.titleImage ? `<div class="slide">${T.imgTag(d.titleImage)}</div>` : slideBox({layout: "center", slideTitle: d ? d.title : ""});
  if (s.type === "verse") return verseSlide({ref: s.ref || s.name, text: s.text, version: s.version});
  return xsHTML(s.type && SLIDE_TYPES[s.type] ? s : {...s, type: "image"}) }
const icon = s => s.stop ? "■" : s.type === "verse" ? "✝" : s.type === "video" ? "▶" : s.type === "quote" ? "❝" : /bullets/.test(s.type) ? "☰" : "▣";

async function load(fresh){
  if (fresh || token()) { try { const g = await GH.get(FILE); return {d: JSON.parse(g.text), sha: g.sha} } catch (e) { if (fresh) throw e } }
  const r = await fetch("talk2.json?t=" + Date.now(), {cache: "no-store"}); if (!r.ok) throw new Error("talk2.json " + r.status); return {d: await r.json(), sha: null} }
let bc = null; try { bc = new BroadcastChannel("talk2-" + FOLDER) } catch (e) {}
const relay = d => C.relay + "/" + d.relayTopic;
function topBar(d, active){ return `<div class="top"><h1>${E(d.title)} <span class="v2">new version</span></h1><div class="mode">
  <a class="btn${active === "edit" ? " on" : ""}" href="edit2.html">Edit</a><a class="btn${active === "present" ? " on" : ""}" href="present2.html">Stage</a>
  <a class="btn" href="slides2.html" target="_blank" rel="noopener">Slides</a><a class="btn" href="edit.html" title="The version you used before">Old version</a></div></div>` }

// =====================================================================
// SLIDES (monitor): follows the presenter; arrows step through the slides here, and it snaps back when the presenter moves.
// =====================================================================
async function slides(){
  document.body.innerHTML = `<div id="s"></div><div id="ui"><button id="b" type="button">&larr; Back</button><span id="st"><b></b>Connecting&hellip;</span><button id="n" type="button">Next &rarr;</button><button id="f" type="button">Full screen</button></div>`;
  let d; try { d = (await load(false)).d } catch (e) { $("#s").innerHTML = `<div class="txt">Couldn't load this talk.</div>`; return }
  document.title = d.title + " · slides"; T.preload(d.slides || [], d);
  const S = build(parse(d)), SH = S.map(x => x.slide); let pres = 0, local = 0, follow = true, pk = null, end = false, lastAt = 0, on = false;
  const st = $("#st");
  const show = () => { const k = follow ? pres : local, pv = follow && pk ? (d.slides || []).find(x => x.name === pk) : null;
    setSlide($("#s"), follow && end ? '<div class="slide blank"></div>' : slideHTML(pv || SH[k], d)); st.className = follow ? (on ? "on" : "") : "local";
    st.lastChild.textContent = follow ? (on ? "Following the presenter" : "Waiting for the presenter") : "Stepping here, snaps back when the presenter moves" };
  const from = m => { if (!m || m.v !== 2) return; if (m.at && m.at <= lastAt) return; lastAt = m.at || Date.now(); on = true; end = !!m.end; pres = Math.max(0, Math.min(S.length - 1, +m.step || 0)); pk = m.pk || null; follow = true; show() };
  const step = dd => { let k = follow ? pres : local; const cur = SH[k]; do { k += dd } while (k > 0 && k < S.length - 1 && SH[k] === cur); local = Math.max(0, Math.min(S.length - 1, k)); follow = false; show() };
  $("#b").onclick = () => step(-1); $("#n").onclick = () => step(1);
  const full = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() } catch (e) {} }; $("#f").onclick = full;
  document.addEventListener("keydown", e => { if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); step(1) } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); step(-1) } else if (e.key === "f" || e.key === "F") full() });
  let hideT; const ui = $("#ui"), wake = () => { ui.classList.remove("hide"); clearTimeout(hideT); hideT = setTimeout(() => ui.classList.add("hide"), 3000) };
  document.addEventListener("mousemove", wake); document.addEventListener("touchstart", wake); wake();
  if (bc) bc.onmessage = e => from(e.data);
  try { const es = new EventSource(relay(d) + "/sse"); es.onmessage = e => { try { const m = JSON.parse(e.data); if (m.event === "message") from(JSON.parse(m.message)) } catch (_) {} } } catch (e) {}
  try { const t = await (await fetch(relay(d) + "/json?poll=1&since=12h", {cache: "no-store"})).text(); const L = t.trim().split("\n").filter(Boolean).map(x => { try { return JSON.parse(JSON.parse(x).message) } catch (e) { return null } }).filter(x => x && x.v === 2); if (L.length) from(L[L.length - 1]) } catch (e) {}
  show() }

// ---------- shared drawing ----------
// The outline: every outline tag, indented by level; cur = the node of the step you're on.
function treeHTML(P, S, k, big){ const cur = S[k] && S[k].node; let h = "";
  for (const n of P.nodes) { const sl = n.slides.filter(x => x.slide && !x.slide.stop).length;
    h += `<button type="button" class="tn l${n.lvl}${cur === n ? " cur" : ""}" data-n="${n.j}"><i>${E(n.lab)}</i><span>${E(n.text || "(no words)")}</span>${sl && !big ? `<b class="sc">${sl}</b>` : ""}</button>` }
  return h || `<p class="note" style="padding:8px">No outline yet. Type / in the text to add a movement, point, sub point or detail, or use ✨ Outline.</p>` }
// The text with every tag drawn: nodes as numbered chips (a movement as a header with its words), slides as named chips, cues as small hints.
// inEdit: chips are editable tags. S: wrap each stretch of words in a span (Stage). blocks: wrap each node's part in an indented block.
const ndTitle = n => `${LV[n.lvl]} ${n.lab}: ${n.text || "(no words)"}`;
const ndInner = n => n.lvl === 1 ? `<b>${E(n.lab)}</b>${E(n.text || "(no words)")}` : `<b>${E(n.lab)}</b>`;
function textHTML(d, P, inEdit, S, blocks){ const t = P.t; let h = "", pos = 0, open = false; const byA = new Map(); if (S) S.forEach((st, i) => { if (st.a != null) byA.set(st.a, i) });
  const tok = x => { const r = x.ref;
    if (x.k === "node") { const n = x.node; return inEdit ? `<span class="vchip nd l${n.lvl}" contenteditable="false" data-ref="${E(r)}" title="${E(ndTitle(n))}. Click to change it, drag to move it">${ndInner(n)}</span>`
      : `<span class="bmark l${n.lvl}" data-n="${n.j}" title="${E(ndTitle(n))}">${n.lvl === 1 ? E(n.lab + " " + n.text) : E(n.lab)}</span>` }
    if (x.k === "cue") return inEdit ? `<span class="vchip cue cue-${x.cue.cue.replace(" ", "")}" contenteditable="false" data-ref="${E(r)}">${E(x.cue.icon + " " + x.cue.ref)}</span>` : `<span class="cuehint cue cue-${x.cue.cue.replace(" ", "")}">${E(x.cue.icon + " " + x.cue.ref)}</span>`;
    const s = x.slide; return inEdit ? `<span class="vchip sl${s.stop ? " stop" : ""}" contenteditable="false" data-ref="${E(r)}" title="${s.stop ? "Stop: a pause that keeps the slide" : "Slide. Click to show it; drag to move it"}">${icon(s)} ${E(s.name)}</span>`
      : `<button type="button" class="vtag sl${s.stop ? " stop" : ""}" data-pk="${E(s.name)}">${icon(s)} ${E(s.name)}</button>` };
  const piece = (a, b) => { let o = "", p = a; for (const x of P.toks) { if (x.k !== "cue" || x.at < a || x.at >= b) continue; o += E(t.slice(p, x.at)) + tok(x); p = x.end } return o + E(t.slice(p, b)) };
  const words = b => { if (b <= pos) return; const i = byA.get(pos), w = piece(pos, b); h += i != null ? `<span class="ck" data-s="${i}">${w}</span>` : w };
  for (const x of P.toks) { if (x.k === "cue") continue; words(x.at);
    if (blocks && x.k === "node") { h += (open ? "</div>" : "") + `<div class="sg l${x.node.lvl}" data-seg="1">`; open = true }
    h += tok(x); pos = x.end }
  words(t.length); if (open) h += "</div>"; return h }
// The first step at or after an outline node (clicking a point in a list).
const firstAt = (S, n) => n ? S.findIndex(z => z.pos >= n.at) : -1;
// Bring a range into view below the sticky parts: in the middle if it fits, else its start at the top.
function scrollToPart(r, top, bottom){ if (!r || !r.height) return; const room = bottom - top, y = r.height <= room - 16 ? r.top - top - (room - r.height) / 2 : r.top - top - 10;
  if (Math.abs(y) > 2) window.scrollTo({top: Math.max(0, scrollY + y), behavior: "smooth"}) }

// =====================================================================
// STAGE: the outline is what you talk from; Next lights up the next point (and each slide in it); the text is there to glance at.
// =====================================================================
async function present(){
  document.body.innerHTML = `<p class="status">Loading&hellip;</p>`;
  let d; try { d = (await load(false)).d } catch (e) { document.body.innerHTML = `<p class="status">Couldn't load this talk (${E(e.message)}).</p>`; return }
  document.title = d.title + " · Stage"; T.preload(d.slides || [], d);
  const P = parse(d), S = build(P), SH = S.map(x => x.slide);
  let k = 0, peek = null, end = false, showText = true; try { const v = +localStorage.getItem("pres2-" + FOLDER); if (v >= 0 && v < S.length) k = v; showText = localStorage.getItem("pres2-text") !== "0" } catch (e) {}
  document.body.innerHTML = topBar(d, "present") + `<div class="lay v2s"><nav class="cues" id="nav"></nav><main class="pane" id="m">
      <div class="olbox" id="ol"></div><div class="row tt"><label class="chk"><input type="checkbox" id="stx"${showText ? " checked" : ""}> Show the full text</label></div><div class="fulltext" id="ft"${showText ? "" : " hidden"}><div class="script" id="sc"></div></div></main>
      <aside class="side"><div class="scr"></div><div class="cap" id="cap"></div><div class="nxt" id="nx"></div></aside></div>
    <div class="bar"><button class="btn" id="b" type="button">&larr; Back</button><span id="pos"></span><span id="sync"><b></b>Not sent yet</span>
      <button class="btn" id="pop" type="button" title="Slides in their own window on this computer; works without internet">Slides window</button><button class="btn pri" id="n" type="button">Next &rarr;</button></div>
    <div class="ctimer idle" id="ct" hidden><div class="ct-track"><i></i></div><span class="ct-txt"></span></div>`;
  $("#sc").innerHTML = textHTML(d, P, false, S, true);
  const TIMER = CountTimer($("#ct"), "pres2-timer-" + FOLDER); TIMER.setMinutes(timerMinutes(d, []));
  // The left list: movements and points to jump to.
  $("#nav").innerHTML = P.nodes.filter(n => n.lvl <= 2).map(n => n.lvl === 1 ? `<div class="sec" data-n="${n.j}">${E(n.lab)}. ${E(n.text)}</div>` : `<button type="button" class="it" data-n="${n.j}"><i>${E(n.lab)}</i><span>${E(n.text)}</span></button>`).join("");
  const branch = n => { let p = n; while (p && p.lvl > 2) p = p.parent; return p };     // the point (or movement) you're in
  function draw(){ const st = S[k], n = st && st.node, b = n ? branch(n) : null;
    // the outline of the point you're in, big, with the current line lit and its slide chips
    let h = ""; if (b) { const list = P.nodes.filter(x => x.at >= b.at && x.at < b.last);
      h = `<div class="olh">${E(b.lab)} ${E(b.text)}</div><ul class="ol">` + list.filter(x => x !== b).map(x => `<li class="l${x.lvl}${x === n ? " cur" : ""}" data-n="${x.j}"><span class="kn">${E(x.lab)}</span>${E(x.text)}${x.slides.filter(q => q.slide && !q.slide.stop).map(q => { return ` <button type="button" class="vtag${q.step === k || (SH[k] === q.slide && q.step <= k) ? " on" : ""}" data-pk="${E(q.slide.name)}">${icon(q.slide)} ${E(q.slide.name)}</button>` }).join("")}</li>`).join("") + "</ul>";
      const own = b.slides.filter(q => q.slide && !q.slide.stop); if (own.length) h = h.replace("</div>", " " + own.map(q => { return `<button type="button" class="vtag${SH[k] === q.slide && q.step <= k ? " on" : ""}" data-pk="${E(q.slide.name)}">${icon(q.slide)} ${E(q.slide.name)}</button>` }).join("") + "</div>");
      if (n === b) h = h.replace('class="olh"', 'class="olh cur"') }
    $("#ol").innerHTML = h || `<div class="olh">${E(d.title)}</div>`;
    document.querySelectorAll("#nav [data-n]").forEach(e => e.classList.toggle("cur", !!b && +e.dataset.n === b.j));
    const cn = $("#nav .cur"); if (cn) { const nv = $("#nav"); nv.scrollTo({top: cn.offsetTop - nv.clientHeight / 2, behavior: "smooth"}) }
    document.querySelectorAll("#sc .ck.cur").forEach(e => e.classList.remove("cur")); const ck = $(`#sc .ck[data-s="${k}"]`); if (ck && !end) ck.classList.add("cur");
    const s = peek ? (d.slides || []).find(x => x.name === peek) : SH[k]; setSlide($("#m").parentElement.querySelector(".scr"), end ? '<div class="slide blank"></div>' : slideHTML(s, d));
    $("#cap").textContent = end ? "End of the talk" : peek ? "Showing " + peek + " · Next or Back goes back" : s ? s.name : "Title slide";
    const nx = S.slice(k + 1).find(z => z.node && z.node !== n); $("#nx").innerHTML = nx ? `Up next: <b>${E(nx.node.lab)}</b> ${E(nx.node.text)}` : "End of the talk";
    $("#pos").textContent = (k + 1) + " of " + S.length; vid();
    requestAnimationFrame(() => { const el = ck || (n && $(`#sc .bmark[data-n="${n.j}"]`)); const ol = $("#ol"), tb = $(".top");
      if (showText && el) { const top = (tb ? tb.offsetHeight : 0) + (ol ? ol.offsetHeight : 0) + 20, bar = $(".bar"); scrollToPart(el.getBoundingClientRect(), top, bar ? bar.getBoundingClientRect().top : innerHeight) } }) }
  function vid(){ const v = $(".side .slide.vid[data-next]"); if (!v || v.dataset.hooked) return; v.dataset.hooked = 1; const at = k; v.addEventListener("vidend", () => setTimeout(() => { if (k === at && !peek) next() }, 1200)) }
  async function push(){ const m = {v: 2, step: k, at: Date.now()}; if (peek) m.pk = peek; if (end) m.end = 1; try { localStorage.setItem("pres2-" + FOLDER, k) } catch (e) {}
    if (bc) try { bc.postMessage(m) } catch (e) {} const se = $("#sync");
    try { const r = await fetch(relay(d), {method: "POST", body: JSON.stringify(m)}); se.className = r.ok ? "ok" : "bad"; se.lastChild.textContent = r.ok ? "Monitors following" : "Sync failed" } catch (e) { se.className = "bad"; se.lastChild.textContent = "Offline: only the slides window follows" } }
  const locked = () => !!$("#gate");
  function go(i){ if (locked()) return; peek = null; end = false; k = Math.max(0, Math.min(S.length - 1, i)); draw(); push(); TIMER.at(k === 0) }
  function next(){ if (locked()) return; if (peek) { peek = null; draw(); push(); return } if (k < S.length - 1) go(k + 1); else if (!end) { end = true; draw(); push() } }
  function back(){ if (locked()) return; if (peek) { peek = null; draw(); push(); return } if (end) { end = false; draw(); push(); return } if (k > 0) go(k - 1) }
  $("#n").onclick = next; $("#b").onclick = back;
  $("#stx").onchange = e => { showText = e.target.checked; $("#ft").hidden = !showText; try { localStorage.setItem("pres2-text", showText ? "1" : "0") } catch (_) {} draw() };
  document.body.addEventListener("click", e => { const pk = e.target.closest("[data-pk]"); if (pk) { const nm = pk.dataset.pk; if (nm === "Stop") return; peek = peek === nm ? null : nm; draw(); push(); return }
    const t = e.target.closest("[data-n]"); if (t && (t.closest("#nav") || t.closest("#ol") || t.closest("#sc"))) { const j = +t.dataset.n, i = firstAt(S, P.nodes[j]); if (i >= 0) go(i) } });
  $("#pop").onclick = () => { window.open("slides2.html?window=1", "slides2-" + FOLDER, "popup,width=1280,height=720"); setTimeout(push, 900) };
  document.addEventListener("keydown", e => { if (locked() || e.target.closest("input,textarea")) return; if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); next() } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); back() } });
  draw(); presenterGate(C.passHash, "pres-ok", () => { push(); TIMER.at(k === 0) }) }

// =====================================================================
// EDIT: one text for the whole talk, the outline on the left, the slides on the right.
// =====================================================================
async function edit(){
  if (!token()) { tokenSetup(() => edit()); return }
  document.body.innerHTML = `<p class="status">Loading the latest version from GitHub&hellip;</p>`;
  let d, SHA; try { const g = await load(true); d = g.d; SHA = g.sha } catch (e) {
    if (e.status === 401 || e.status === 403) { try { localStorage.removeItem("gh-token") } catch (_) {} tokenSetup(() => edit()); return }
    document.body.innerHTML = `<p class="status">Couldn't load this talk's new version from GitHub (${E(e.message)}).</p>`; return }
  d.slides = d.slides || []; document.title = d.title + " · Edit"; T.preload(d.slides, d);
  let P = parse(d), S = build(P), SH = S.map(x => x.slide), k = 0, peek = null, dirty = false, saving = false, timer = null, panel = "lib";
  const hist = [];                 // earlier versions of the text and slides, for Undo
  document.body.innerHTML = topBar(d, "edit") + `<div class="lay v2e"><nav class="cues tree" id="tree"></nav>
    <main class="pane" id="m"><div class="tools"><button type="button" class="btn small" id="det">Talk details</button><button type="button" class="btn small" id="undo" disabled title="Undo the last change">↶ Undo</button>
      <button type="button" class="btn small aib" id="aiol" title="The AI reads your text and adds the outline tags (movements and points); you check them first">✨ Outline from the text</button>
      <span class="note">Type <b>/</b> for a point, a slide or a reading cue. Drag slides in from the right.</span></div>
      <div class="ftext" id="ftext"></div></main>
    <aside class="side"><div class="scr"></div><div class="cap" id="cap"></div><div class="stepbar"><button type="button" class="btn small" id="eb">&larr; Back</button><span id="epos"></span><button type="button" class="btn small pri" id="en">Next &rarr;</button></div>
      <div class="ptabs"><button type="button" data-tab="lib" class="on">Slides</button><button type="button" data-tab="run">In order of use</button><button type="button" class="btn small" id="sadd">+ New slide</button></div><div class="plist" id="plist"></div></aside></div>
    <dialog class="sdlg v2d" id="sdlg"></dialog><dialog class="verse ved" id="ndlg"></dialog>`;
  $(".top h1").insertAdjacentHTML("afterend", `<span id="save">All changes saved</span>`);
  const setSave = (t, err) => { const s = $("#save"); s.textContent = t; s.className = err ? "err" : "" };
  // ---- saving: the whole file, a moment after the last change ----
  function changed(snap){ if (snap !== false) { hist.push(snap); if (hist.length > 100) hist.shift(); $("#undo").disabled = false }
    P = parse(d); S = build(P); SH = S.map(x => x.slide); if (k >= S.length) k = Math.max(0, S.length - 1); dirty = true; setSave("Saving…"); clearTimeout(timer); timer = setTimeout(flush, 900); redraw() }
  const snapshot = () => JSON.stringify({text: d.text, slides: d.slides});
  async function flush(){ if (saving || !dirty) return; saving = true; dirty = false; const body = JSON.stringify(d, null, 1) + "\n";
    try { SHA = await GH.put(FILE, b64e(body), SHA, "Edit " + d.title + " (new version)"); setSave(dirty ? "Saving…" : "Saved. The live pages update in about a minute.") }
    catch (e) { if (e.status === 409 || e.status === 422) { try { SHA = (await GH.get(FILE)).sha; dirty = true } catch (_) {} } else { dirty = true; setSave("Not saved (" + (e.detail || e.message) + "). Retrying…", true) } setTimeout(flush, e.status === 409 || e.status === 422 ? 200 : 5000) }
    saving = false; if (dirty) flush() }
  window.addEventListener("beforeunload", e => { if (dirty || saving) { e.preventDefault(); e.returnValue = "" } });
  $("#undo").onclick = () => { const s = hist.pop(); if (!s) return; const o = JSON.parse(s); d.text = o.text; d.slides = o.slides; $("#undo").disabled = !hist.length; changed(false); drawText() };

  // ---- the text box ----
  const box = () => $("#ftext .rich.big");
  function drawText(){ $("#ftext").innerHTML = `<div class="rich big" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="The talk" data-ph="Type what you want to say. Then use / or ✨ Outline to add the points." data-f="script">${textHTML(d, P, true, null, true)}</div>`; shape = shapeOf(); hl(true) }
  let shape = ""; const shapeOf = () => P.nodes.map(n => n.lvl).join("");
  function richText(el){ let out = ""; const walk = n => { for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue.replace(/​/g, "");
      else if (c.nodeType === 1) { if (c.classList.contains("vchip")) out += "[" + c.dataset.ref + "]"; else if (c.tagName === "BR") out += "\n";
        else { if (/^(DIV|P)$/.test(c.tagName) && !c.dataset.seg && out && !out.endsWith("\n")) out += "\n"; walk(c) } } } }; walk(el); return out.replace(/\n$/, "") }
  let typeT = null;
  function saveText(){ clearTimeout(typeT); const b = box(); if (!b) return; const t = richText(b); if (t === (d.text || "")) return; const s = snapshot(); d.text = t; changed(s); relabel() }
  // Number the outline chips again after a change (the text box itself is left as you're typing it).
  function relabel(){ const b = box(); if (!b) return; const cs = [...b.querySelectorAll(".vchip.nd")]; cs.forEach((c, i) => { const n = P.nodes[i]; if (!n) return; const h = ndInner(n); if (c.innerHTML !== h) c.innerHTML = h; c.className = "vchip nd l" + n.lvl; c.title = ndTitle(n) + ". Click to change it, drag to move it" }) }
  document.addEventListener("input", e => { if (!e.target.closest || !e.target.closest("#ftext .rich.big")) return; clearTimeout(typeT); typeT = setTimeout(saveText, 800) });
  document.addEventListener("focusout", e => { if (e.target.closest && e.target.closest("#ftext .rich.big")) { saveText(); if (shapeOf() !== shape) drawText() } });   // new or moved points: draw the blocks again
  const selText = () => { const sl = getSelection(); if (!sl.rangeCount) return ""; const dv = document.createElement("div"); dv.appendChild(sl.getRangeAt(0).cloneContents()); return richText(dv) };
  const chipsHTML = t => { const fake = {...d, text: t}; return textHTML(fake, parse(fake), true).replace(/\n/g, "<br>") };
  document.addEventListener("copy", e => { if (!e.target.closest || !e.target.closest("#ftext .rich.big")) return; e.preventDefault(); e.clipboardData.setData("text/plain", selText()) });
  document.addEventListener("cut", e => { if (!e.target.closest || !e.target.closest("#ftext .rich.big")) return; e.preventDefault(); e.clipboardData.setData("text/plain", selText()); document.execCommand("delete") });
  document.addEventListener("paste", e => { if (!e.target.closest || !e.target.closest("#ftext .rich.big")) return; e.preventDefault(); const t = e.clipboardData.getData("text/plain");
    if (/\[[^\[\]\n]{1,300}\]/.test(t)) document.execCommand("insertHTML", false, chipsHTML(t)); else document.execCommand("insertText", false, t) });
  // Put a chip where the caret is (after removing the "/" that opened the menu).
  function insertAtCaret(ref, slash){ const b = box(); if (!b) return; b.focus(); const sl = getSelection(); if (!sl.rangeCount) return; let r = sl.getRangeAt(0);
    if (slash && r.startContainer.nodeType === 3 && r.startOffset > 0 && r.startContainer.nodeValue[r.startOffset - 1] === "/") { const q = document.createRange(); q.setStart(r.startContainer, r.startOffset - 1); q.setEnd(r.startContainer, r.startOffset); q.deleteContents(); r = sl.getRangeAt(0) }
    insertAt(r, ref) }
  function insertAt(r, ref){ const tp = document.createElement("template"); tp.innerHTML = chipsHTML("[" + ref + "]"); const c = tp.content.firstChild; if (!c) return; r.insertNode(c);
    const sp = document.createTextNode(c.classList.contains("nd") ? "​" : " "); c.after(sp); const q = document.createRange(); q.setStartAfter(sp); q.collapse(true); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(q); saveText() }
  // ---- the / menu ----
  let menu = null, mrange = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null } };
  function openMenu(){ const b = box(), sl = getSelection(); if (!b || !sl.rangeCount) return; const r = sl.getRangeAt(0); if (r.startContainer.nodeType !== 3 || r.startContainer.nodeValue[r.startOffset - 1] !== "/") return; mrange = r.cloneRange();
    const items = [[1, "Movement"], [2, "Point"], [3, "Sub point"], [4, "Detail"]].map(([l, n]) => ({node: l, label: `<b>${["", "1", "1.a", "1", "a"][l]}</b> ${n}`}))
      .concat(d.slides.filter(s => s && s.name).map(s => ({slide: s.name, label: `${icon(s)} ${E(s.name)}`})), [{newSlide: true, label: "+ New slide…"}, {slide: "Stop", label: "■ Stop (a pause that keeps the slide)"}],
        Object.values(CUETAG).map(c => ({cue: c.ref, label: E(c.icon + " " + c.ref)})));
    closeMenu(); menu = document.createElement("div"); menu.className = "vmenu v2m";
    menu.innerHTML = `<input class="mf" placeholder="Type to find…" aria-label="Find"><div class="ml">${items.map((it, i) => `<button type="button" data-i="${i}" class="${it.node ? "nd" : it.cue ? "cueo" : ""}${i ? "" : " on"}">${it.label}</button>`).join("")}</div>`;
    document.body.appendChild(menu); const rr = r.getBoundingClientRect(); menu.style.left = Math.min(rr.left, innerWidth - 300) + "px"; menu.style.top = Math.min(rr.bottom + 4, innerHeight - menu.offsetHeight - 8) + "px";
    const f = menu.querySelector(".mf"); let on = 0;
    const vis = () => [...menu.querySelectorAll(".ml button")].filter(x => !x.hidden), mark = () => vis().forEach((x, i) => x.classList.toggle("on", i === on));
    f.oninput = () => { const q = f.value.toLowerCase(); menu.querySelectorAll(".ml button").forEach(x => x.hidden = !!q && !x.textContent.toLowerCase().includes(q)); on = 0; mark() };
    f.onkeydown = e => { const L = vis(); if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); on = (on + (e.key === "ArrowDown" ? 1 : L.length - 1)) % Math.max(1, L.length); mark(); L[on] && L[on].scrollIntoView({block: "nearest"}) }
      else if (e.key === "Enter") { e.preventDefault(); if (L[on]) pick(items[+L[on].dataset.i]) } else if (e.key === "Escape") { closeMenu(); restore() } };
    menu.onmousedown = e => { if (e.target !== f) e.preventDefault() }; menu.onclick = e => { const x = e.target.closest("[data-i]"); if (x) pick(items[+x.dataset.i]) };
    setTimeout(() => f.focus(), 0) }
  function restore(){ const b = box(); if (!b || !mrange) return; b.focus(); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(mrange) }
  function pick(it){ closeMenu(); restore();
    if (it.node) { nodeEdit({lvl: it.node, text: ""}, v => { restore(); insertAtCaret("#" + v.lvl + " " + v.text, true) }); return }
    if (it.newSlide) { slideNew(nm => { restore(); insertAtCaret(nm, true) }); return }
    insertAtCaret(it.slide || it.cue, true) }
  document.addEventListener("keydown", e => { if (menu) return; const b = e.target.closest && e.target.closest("#ftext .rich.big"); if (!b) return;
    if (e.key === "/") setTimeout(openMenu, 0); else if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak") } });
  document.addEventListener("mousedown", e => { if (menu && !menu.contains(e.target)) closeMenu() });
  // ---- outline tag pop-up ----
  function nodeEdit(cur, done, canDel){ const dl = $("#ndlg");
    dl.innerHTML = `<form method="dialog" class="ed"><div class="pgh"><b>Outline</b></div><div class="row">${[1, 2, 3, 4].map(l => `<label class="chk"><input type="radio" name="nl" value="${l}"${l === cur.lvl ? " checked" : ""}> ${LV[l]}</label>`).join("")}</div>
      <label>Words (what you glance at while you speak)<input id="nx" autocomplete="off" value="${E(cur.text)}"></label>
      <div class="row"><span style="flex:1"></span>${canDel ? '<button class="btn small danger" type="button" id="ndel">Remove (keeps the text)</button>' : ""}<button class="btn small" type="button" id="ncan">Cancel</button><button class="btn small pri" type="submit">Save</button></div></form>`;
    $("#ncan").onclick = () => dl.close(); if (canDel) $("#ndel").onclick = () => { dl.close(); done(null) };
    dl.querySelector("form").onsubmit = ev => { ev.preventDefault(); const v = {lvl: +dl.querySelector('[name="nl"]:checked').value, text: $("#nx").value.replace(/[\[\]\n]+/g, " ").replace(/\s+/g, " ").trim()}; dl.close(); if (v.text) done(v) };
    try { dl.showModal() } catch (e) { dl.setAttribute("open", "") } $("#nx").focus() }
  // ---- slides: library, editor ----
  const usesOf = nm => P.toks.filter(x => x.k === "slide" && x.slide.name === nm).length;
  function plist(){ const el = $("#plist"); if (panel === "run") { const L = P.toks.filter(x => x.k === "slide" && !x.slide.stop && x.step != null);
      el.innerHTML = L.length ? L.map(x => { const i = x.step; return `<div class="pi run${SH[k] === x.slide && i <= k ? " cur" : ""}" data-step="${i}"><div class="th">${slideHTML(x.slide, d)}</div><div class="pn"><b>${E(x.slide.name)}</b><span>${x.node ? E(x.node.full + " " + x.node.text) : "Opening"}</span></div></div>` }).join("") : `<p class="note">No slides in the text yet.</p>`; return }
    el.innerHTML = d.slides.map((s, i) => { const u = usesOf(s.name); return `<div class="pi${u ? "" : " unused"}${SH[k] === s ? " cur" : ""}" draggable="true" data-si="${i}"><div class="th">${slideHTML(s, d)}</div><div class="pn"><b>${icon(s)} ${E(s.name)}</b><span>${E(TYPES[s.type] || "Slide")}${u > 1 ? ` · used ${u}×` : u ? "" : " · not in the text"}</span></div></div>` }).join("") || `<p class="note">No slides yet. Press + New slide.</p>` }
  function slideNew(done){ const m = document.createElement("div"); m.className = "vmenu"; m.innerHTML = `<div class="vmh">New slide</div>` + Object.entries(TYPES).map(([t, n]) => `<button type="button" data-t="${t}">${E(n)}</button>`).join("");
    document.body.appendChild(m); const r = ($("#sadd") || document.body).getBoundingClientRect(); m.style.left = Math.max(8, Math.min(r.left, innerWidth - 260)) + "px"; m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8) + "px";
    const off = e => { if (!m.contains(e.target)) { m.remove(); removeEventListener("mousedown", off) } }; setTimeout(() => addEventListener("mousedown", off), 0);
    m.onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return; m.remove(); removeEventListener("mousedown", off); const t = b.dataset.t; let n = d.slides.length + 1, nm; do { nm = (t === "verse" ? "Verse " : "Slide ") + n++ } while (d.slides.some(s => s.name === nm));
      const s = snapshot(), o = {name: nm, type: t}; if (t === "verse") Object.assign(o, {ref: "", text: "", version: "ESV"}); else if (t === "quote") Object.assign(o, {quote: "", by: ""}); else if (t === "video") Object.assign(o, {url: "", video: "", autoNext: true}); else Object.assign(o, {slideTitle: "", slide: "", eyebrow: "", layout: "center", image: "", bullets: ""});
      d.slides.push(o); changed(s); slideEdit(d.slides.length - 1, done) } }
  function renameIn(a, b){ const rep = x => x.split("[" + a + "]").join(b ? "[" + b + "]" : ""); d.text = rep(d.text || "") }
  function slideEdit(i, onSave){ const dl = $("#sdlg"), o = d.slides[i]; if (!o) return; const A = f => `data-f="${f}"`;
    const fld = (f, lb, ta, ph) => ta ? `<label>${lb}<textarea class="auto" ${A(f)} placeholder="${E(ph || "")}">${E(o[f])}</textarea></label>` : `<label>${lb}<input ${A(f)} value="${E(o[f])}" placeholder="${E(ph || "")}"></label>`;
    let h = `<div class="ed"><div class="pgh"><b>${E(TYPES[o.type] || "Slide")}</b><button type="button" class="btn small pri" id="sdone">Done</button></div>
      <div class="row"><label style="flex:1 1 220px">Name (its tag in the text)<input id="sname" value="${E(o.name)}"></label><label style="flex:0 1 200px">Kind<select ${A("type")}>${Object.entries(TYPES).map(([t, n]) => `<option value="${t}"${t === (o.type || "image") ? " selected" : ""}>${E(n)}</option>`).join("")}</select></label></div>
      <div class="prev" id="prev">${slideHTML(o, d)}</div>`;
    const ty = o.type || "image";
    if (ty === "verse") h += fld("ref", "Reference") + fld("text", "Text (**bold**, __underline__)", true) + fld("version", "Version");
    else if (ty === "quote") h += fld("quote", "Quote", true) + fld("by", "Who said it");
    else if (ty === "video") h += fld("url", "Link (YouTube or a video file)", false, "https://…") + `<label class="chk"><input type="checkbox" ${A("autoNext")}${o.autoNext !== false ? " checked" : ""}> When it ends, go to the next step</label>`;
    else if (/bullets/.test(ty)) h += fld("slideTitle", "Title", true) + fld("bullets", "Bullets (one per line)", true);
    else h += fld("eyebrow", "Small line on top") + fld("slideTitle", "Title", true) + fld("slide", "Subtitle", true) + `<label>Style<select ${A("layout")}><option value="left"${o.layout !== "center" ? " selected" : ""}>Gold title, white subtitle (left)</option><option value="center"${o.layout === "center" ? " selected" : ""}>White title, gold subtitle (centered)</option></select></label>`;
    if (ty === "image" || ty === "bulletsimg") h += `<div class="row"><span class="tag">Picture (no words in it)</span><label class="btn small">${o.image ? "Replace" : "Add"} picture<input type="file" accept="image/*" id="simg" hidden></label>${o.image ? '<button type="button" class="btn small" id="sdelimg">Remove picture</button>' : ""}<span class="note" id="smsg"></span></div>`;
    h += `<label class="chk"><input type="checkbox" ${A("keep")}${o.keep ? " checked" : ""}> Keep it up until another slide comes (even after its point ends)</label>
      <div class="row"><span class="note" style="flex:1">Used ${usesOf(o.name)}× in the text.</span><button type="button" class="btn small danger" id="sdel">Delete this slide</button></div></div>`;
    dl.innerHTML = h; dl.querySelectorAll("textarea.auto").forEach(t => { t.style.height = t.scrollHeight + 4 + "px" });
    const pv = () => { $("#prev").innerHTML = slideHTML(o, d) };
    dl.oninput = e => { const f = e.target.dataset.f; if (!f || e.target.type === "checkbox") return; o[f] = e.target.value; pv() };
    dl.onchange = e => { const el = e.target, f = el.dataset.f; if (el.id === "sname") { const nv = el.value.replace(/[\[\]\n]+/g, " ").trim(); if (!nv || nv === o.name) { el.value = o.name; return }
        if (d.slides.some(s => s !== o && s.name === nv) || /^stop$/i.test(nv) || /^#[1-4]/.test(nv) || CUETAG[nv.toLowerCase()]) { el.value = o.name; el.setCustomValidity("That name is taken"); el.reportValidity(); setTimeout(() => el.setCustomValidity(""), 2000); return }
        const s = snapshot(); renameIn(o.name, nv); o.name = nv; changed(s); drawText(); return }
      if (!f) return; const s = snapshot(); o[f] = el.type === "checkbox" ? el.checked : el.value; changed(s); if (f === "type") slideEdit(i, onSave); else pv() };
    $("#sdone").onclick = () => dl.close();
    $("#sdel").onclick = e => { const b = e.target; if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Tap again: also removes it from the text"; return } const s = snapshot(); renameIn(o.name, null); d.slides.splice(d.slides.indexOf(o), 1); dl.close(); changed(s); drawText() };
    const fi = $("#simg"); if (fi) fi.onchange = async () => { const file = fi.files && fi.files[0]; if (!file) return; $("#smsg").textContent = "Uploading…";
      try { const url = await toJpeg(file), path = `slides/s2-${Date.now().toString(36)}.jpg`; await GH.put(PATH + "/" + path, url.split(",")[1], null, "Slide picture"); LOCALIMG[path] = url; const s = snapshot(); o.image = path; changed(s); slideEdit(i, onSave) }
      catch (err) { $("#smsg").textContent = "Upload failed: " + (err.detail || err.message) } };
    const di = $("#sdelimg"); if (di) di.onclick = () => { const s = snapshot(); o.image = ""; changed(s); slideEdit(i, onSave) };
    dl.onclose = () => { dl.onclose = null; redraw(); if (onSave) onSave(o.name) };
    if (!dl.open) try { dl.showModal() } catch (e) { dl.setAttribute("open", "") } }
  // ---- dragging: slides from the panel into the text or into a new order; chips inside the text ----
  const caretAt = (x, y) => { if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y); const c = document.caretPositionFromPoint && document.caretPositionFromPoint(x, y); if (!c) return null; const r = document.createRange(); r.setStart(c.offsetNode, c.offset); r.collapse(true); return r };
  let dragSi = null;
  document.addEventListener("dragstart", e => { const it = e.target.closest && e.target.closest(".pi[data-si]"); if (!it) return; dragSi = +it.dataset.si; e.dataTransfer.setData("text/plain", "[" + d.slides[dragSi].name + "]"); e.dataTransfer.effectAllowed = "copyMove" });
  document.addEventListener("dragend", () => { dragSi = null; document.querySelectorAll(".pi.over").forEach(x => x.classList.remove("over")) });
  document.addEventListener("dragover", e => { if (dragSi == null) return; const it = e.target.closest(".pi[data-si]"), b = e.target.closest("#ftext .rich.big"); if (!it && !b) return; e.preventDefault();
    document.querySelectorAll(".pi.over").forEach(x => x.classList.toggle("over", x === it)); if (it && !it.classList.contains("over")) it.classList.add("over") });
  document.addEventListener("drop", e => { if (dragSi == null) return; const it = e.target.closest(".pi[data-si]"), b = e.target.closest("#ftext .rich.big"); if (!it && !b) return; e.preventDefault(); const si = dragSi; dragSi = null;
    if (it) { const to = +it.dataset.si; if (to === si) return; const s = snapshot(), [x] = d.slides.splice(si, 1); d.slides.splice(to, 0, x); changed(s); return }
    const r = caretAt(e.clientX, e.clientY); if (!r || !b.contains(r.startContainer)) return; b.focus(); insertAt(r, d.slides[si].name) });
  let dragged = false;
  document.addEventListener("pointerdown", ev => { const c = ev.target.closest && ev.target.closest("#ftext .rich.big .vchip"); if (!c || ev.button) return; const b = c.closest(".rich.big"), x0 = ev.clientX, y0 = ev.clientY; let g = null, mark = null; ev.preventDefault();
    const spot = e => { const r = caretAt(e.clientX, e.clientY); return r && b.contains(r.startContainer) && !c.contains(r.startContainer) ? r : null };
    const mv = e => { if (!g) { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; g = c.cloneNode(true); g.classList.add("ghost"); document.body.appendChild(g); mark = document.createElement("div"); mark.className = "dropmark"; document.body.appendChild(mark); c.classList.add("dragging") }
      g.style.left = e.clientX + 10 + "px"; g.style.top = e.clientY + 10 + "px"; const r = spot(e), rc = r && r.getBoundingClientRect(); mark.hidden = !rc || !rc.height; if (rc && rc.height) { mark.style.left = rc.left + "px"; mark.style.top = rc.top + "px"; mark.style.height = rc.height + "px" }
      if (e.clientY > innerHeight - 40) scrollBy(0, 14); else if (e.clientY < 140) scrollBy(0, -14) };
    const up = e => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); if (!g) return; dragged = true; setTimeout(() => dragged = false, 300); g.remove(); mark.remove(); c.classList.remove("dragging");
      const r = spot(e); if (!r) return; c.remove(); r.insertNode(c); const pv = c.previousSibling, nx = c.nextSibling; if (pv && pv.nodeType === 3 && /\S$/.test(pv.nodeValue)) pv.nodeValue += " "; if (!nx || nx.nodeType !== 3 || /^\S/.test(nx.nodeValue)) c.after(document.createTextNode(" ")); saveText(); if (c.classList.contains("nd")) drawText() };
    addEventListener("pointermove", mv); addEventListener("pointerup", up) });
  // ---- stepping like Stage, with the slide on the right ----
  function hl(quiet){ const b = box(), st = S[k]; document.querySelectorAll("#ftext .vchip.on").forEach(c => c.classList.remove("on")); try { CSS.highlights && CSS.highlights.delete("kpcur") } catch (e) {}
    if (!b || !st) return; const chips = [...b.querySelectorAll(".vchip")], nodes = b.querySelectorAll(".vchip.nd"), c = st.node ? nodes[st.node.j] : null;
    if (c) c.classList.add("on"); const r = document.createRange();
    if (st.a == null) { const sc = chips[st.pre]; if (!sc) return; sc.classList.add("on"); r.selectNode(sc) }      // a slide with no words after it
    else { if (st.pre >= 0 && chips[st.pre]) r.setStartAfter(chips[st.pre]); else r.setStart(b, 0); if (st.nxt >= 0 && chips[st.nxt]) r.setEndBefore(chips[st.nxt]); else r.setEnd(b, b.childNodes.length);
      try { if (window.Highlight && CSS.highlights) CSS.highlights.set("kpcur", new Highlight(r)) } catch (e) {} }
    if (!quiet) { const tb = $(".top"), tl = $("#m .tools"); scrollToPart(r.getBoundingClientRect(), (tb ? tb.offsetHeight : 0) + (tl ? tl.offsetHeight : 0) + 12, innerHeight - 8) } }
  function side(){ const s = peek ? d.slides.find(x => x.name === peek) : SH[k]; setSlide($(".side .scr"), slideHTML(s, d)); const st = S[k];
    $("#cap").innerHTML = peek ? `Showing ${E(peek)} · Next or Back goes back` : st ? `${st.node ? E(st.node.full + " " + st.node.text) : "Opening"}${s ? ` · ${E(s.name)} <button type="button" class="linkbtn" data-edit="${E(s.name)}">Edit</button>` : ""}` : "";
    $("#epos").textContent = S.length ? (k + 1) + " / " + S.length : "" }
  function redraw(){ $("#tree").innerHTML = treeHTML(P, S, k); const c = $("#tree .cur"); if (c) { const t = $("#tree"); if (c.offsetTop < t.scrollTop || c.offsetTop > t.scrollTop + t.clientHeight - 30) t.scrollTo({top: c.offsetTop - t.clientHeight / 2}) } side(); plist() }
  function step(i, quiet){ peek = null; k = Math.max(0, Math.min(S.length - 1, i)); redraw(); hl(quiet) }
  $("#en").onclick = () => { if (peek) { peek = null; side(); return } step(k + 1) }; $("#eb").onclick = () => { if (peek) { peek = null; side(); return } step(k - 1) };
  document.addEventListener("keydown", e => { if (e.target.closest && e.target.closest("input,textarea,select,[contenteditable='true'],dialog")) return; if (["PageDown", "ArrowRight"].includes(e.key)) { e.preventDefault(); $("#en").click() } else if (["PageUp", "ArrowLeft"].includes(e.key)) { e.preventDefault(); $("#eb").click() } });
  document.addEventListener("click", e => { const tg = e.target;
    const tn = tg.closest("#tree [data-n]"); if (tn) { const i = firstAt(S, P.nodes[+tn.dataset.n]); if (i >= 0) step(i); return }
    const nd = tg.closest("#ftext .vchip.nd"); if (nd) { if (dragged) return; const v = nd.dataset.ref.match(/^#([1-4])\s*([\s\S]*)$/);
      nodeEdit({lvl: +v[1], text: v[2] || ""}, nv => { const s = snapshot(); if (!nv) nd.remove(); else nd.dataset.ref = "#" + nv.lvl + " " + nv.text; d.text = richText(box()); changed(s); drawText() }, true); return }
    const sc = tg.closest("#ftext .vchip.sl"); if (sc) { if (dragged || sc.classList.contains("stop")) return; const nm = sc.dataset.ref; peek = peek === nm ? null : nm; side(); return }
    const pe = tg.closest("[data-edit]"); if (pe) { const i = d.slides.findIndex(x => x.name === pe.dataset.edit); if (i >= 0) slideEdit(i); return }
    const pi = tg.closest(".pi[data-si]"); if (pi) { slideEdit(+pi.dataset.si); return }
    const pr = tg.closest(".pi[data-step]"); if (pr) { step(+pr.dataset.step); return }
    const tb = tg.closest(".ptabs [data-tab]"); if (tb) { panel = tb.dataset.tab; document.querySelectorAll(".ptabs [data-tab]").forEach(x => x.classList.toggle("on", x === tb)); plist(); return } });
  $("#sadd").onclick = () => slideNew();
  $("#det").onclick = () => { const dl = $("#ndlg"); const f = (k2, lb, ta) => ta ? `<label>${lb}<textarea data-k="${k2}">${E(d[k2])}</textarea></label>` : `<label>${lb}<input data-k="${k2}" value="${E(d[k2])}"></label>`;
    dl.innerHTML = `<form method="dialog" class="ed"><div class="pgh"><b>Talk details</b></div>${f("title", "Title")}${f("audience", "Audience")}<div class="row">${f("length", "Length")}${f("event", "Date / event")}${f("timerMinutes", "Countdown (minutes)")}</div>${f("bigIdea", "Big idea", true)}
      <div class="row"><span style="flex:1"></span><button class="btn small pri" type="submit">Done</button></div></form>`;
    dl.querySelector("form").onsubmit = ev => { ev.preventDefault(); const s = snapshot(); dl.querySelectorAll("[data-k]").forEach(x => { d[x.dataset.k] = x.value }); dl.close(); changed(s); $(".top h1").firstChild.textContent = d.title + " " };
    try { dl.showModal() } catch (e) { dl.setAttribute("open", "") } };
  // ---- ✨ Outline from the text ----
  $("#aiol").onclick = () => outlineAI().catch(e => alert((e && e.message) || "Something went wrong"));
  function plainMap(t){ let x = "", map = [], i = 0; const re = /\[[^\[\]\n]{1,300}\]/g; let m;
    const add = (a, b) => { for (let q = a; q < b; q++) { const ch = /\s/.test(t[q]) ? " " : t[q]; if (ch === " " && x.endsWith(" ")) continue; x += ch; map.push(q) } };
    while ((m = re.exec(t))) { add(i, m.index); i = m.index + m[0].length } add(i, t.length); return {x, map} }
  async function outlineAI(){ if (!window.TALKAI || !TALKAI.chat) throw new Error("The AI tools didn't load. Reload the page.");
    const t0 = d.text || "", clean = t0.replace(/\[#[1-4](?:[ \t][^\[\]\n]*)?\]/g, ""), PM = plainMap(clean); if (PM.x.trim().length < 40) throw new Error("Type or paste the talk's text first.");
    const dl = $("#ndlg"); dl.innerHTML = `<div class="ed"><div class="pgh"><b>✨ Outline from the text</b></div><p class="aimsg" id="olm">Reading the talk…</p><div id="olb"></div><div class="row"><span style="flex:1"></span><button class="btn small" type="button" id="olc">Cancel</button><button class="btn small pri" type="button" id="olok" disabled>Put it in the text</button></div></div>`;
    $("#olc").onclick = () => dl.close(); try { dl.showModal() } catch (e) {}
    const has = P.nodes.length;
    const j = await TALKAI.chat(`You build the speaking outline for a talk by a Christian ministry leader. He talks from the outline, glancing at it, not reading the text.
The outline is only a memory hint for stretches of talk, so keep it sparse. Read the whole text and mark where each part starts. Levels: 1 = movement (a big section of the talk, usually 5 to 15 minutes), 2 = point (one stretch of talk, usually 30 seconds to 4 minutes, roughly 80 to 600 words; a 2-6 word cue). Use level 3 (sub point) only rarely, when a long point has clearly separate parts, and never level 4. Never mark single sentences or small ideas. Keep every phrase short (2 to 6 words), in his words where possible, in the order of the text. Every point is inside a movement. Each starts at the beginning of a sentence.
For each give "start": the first 6 to 10 words of the sentence where it starts, copied exactly from the text.
Return JSON {"outline": [{"level": 1, "text": "...", "start": "..."}]}.`, JSON.stringify({title: d.title, text: PM.x}), {effort: "medium"});
    const L = Array.isArray(j.outline) ? j.outline : []; let from = 0; const out = [];
    for (const q of L) { const text = String(q.text || "").replace(/[\[\]\n]+/g, " ").trim(), lvl = Math.max(1, Math.min(4, Math.round(+q.level) || 2)), w = String(q.start || "").replace(/\s+/g, " ").trim(); if (!text || w.length < 4) continue;
      let at = PM.x.indexOf(w, from); if (at < 0) at = PM.x.toLowerCase().indexOf(w.toLowerCase().split(" ").slice(0, 5).join(" "), from); if (at < 0) continue; out.push({lvl, text, at: PM.map[at]}); from = at + 1 }
    if (!out.length) { $("#olm").textContent = "The AI's outline didn't match the text. Try again."; return }
    let n = [0, 0, 0, 0, 0]; $("#olm").textContent = (has ? `This replaces the ${has} outline tags there now. ` : "") + "Your words and slides stay as they are. Check it, then put it in:";
    $("#olb").innerHTML = `<div class="aisp">` + out.map(o => { n[o.lvl]++; for (let q = o.lvl + 1; q <= 4; q++) n[q] = 0; const lab = o.lvl === 1 ? n[1] : o.lvl === 2 ? n[1] + "." + letter(n[2] - 1) : o.lvl === 3 ? n[3] : letter(n[4] - 1); return `<p style="margin:2px 0 2px ${(o.lvl - 1) * 1.5}em"><b>${E(String(lab))}</b> ${E(o.text)}</p>` }).join("") + `</div>`;
    const ok = $("#olok"); ok.disabled = false; ok.onclick = () => { let sc = clean, shift = 0; for (const o of out) { const at = o.at + shift, tg = "[#" + o.lvl + " " + o.text + "]", pre = at > 0 && !/[\n ]/.test(sc[at - 1]) ? " " : "", nl = o.lvl <= 2 ? "\n" : " ";
        const before = o.lvl <= 2 && at > 0 && sc[at - 1] !== "\n" ? "\n" : pre; sc = sc.slice(0, at) + before + tg + nl + sc.slice(at).replace(/^ /, ""); shift += before.length + tg.length + nl.length }
      const s = snapshot(); d.text = sc; dl.close(); changed(s); drawText(); step(0) } }
  drawText(); redraw(); hl(true)
}
({edit2: edit, present2: present, slides2: slides}[MODE] || (() => {}))();
})();
