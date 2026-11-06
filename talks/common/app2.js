// Talk pages, version 2 (trial, Nov 5 2026): the whole talk is ONE text plus a library of named slides.
// Tags in the text build everything else:
//   [#1 Section]  [#2 Point]  [#3 Sub point]  ([#4 Detail], old)  → the outline (numbers itself: 1, 1.a, 1, a)
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
const LV = ["", "Section", "Point", "Sub point", "Detail"];
const TYPES = {image: "Picture with words", verse: "Verse", plain: "Words only", bullets: "Bullets", bulletsimg: "Bullets on a picture", quote: "Quote", video: "Video", qr: "QR code to the audience page"};
const STOP = {name: "Stop", stop: true};
// Each outline tag can carry a short id ([#2 Joke|k3f9]) so its talking points (d.notes[id]) stay with it when it moves or is renamed.
const newId = () => Math.random().toString(36).slice(2, 7);

// ---------- reading the text ----------
// Every tag in order: outline nodes, slides, stops and cues, with where they sit in the text.
function parse(d){ const t = d.text || "", toks = [], nodes = [], cnt = [0, 0, 0, 0, 0], stack = [];
  for (const m of t.matchAll(TAG)) { const r = m[1].trim(), nm = r.match(/^#([1-4])(?:\s+([\s\S]*))?$/), at = m.index, end = at + m[0].length;
    if (nm) { const lvl = +nm[1]; cnt[lvl]++; for (let k = lvl + 1; k <= 4; k++) cnt[k] = 0; while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop();
      const lab = lvl === 1 ? String(cnt[1]) : lvl === 2 ? (cnt[1] || 0) + "." + letter(cnt[2] - 1) : lvl === 3 ? String(cnt[3]) : letter(cnt[4] - 1);
      const tw = (nm[2] || "").match(/^([\s\S]*?)(?:\|([a-z0-9]{2,12}))?$/), n = {j: nodes.length, lvl, text: tw[1].trim(), id: tw[2] || "", at, end, lab, parent: stack[stack.length - 1] || null, top: lvl === 1 ? null : null, slides: []};
      n.full = lvl <= 2 ? lab : (stack.find(x => x.lvl === 2) ? stack.find(x => x.lvl === 2).lab + " · " : "") + lab;
      nodes.push(n); stack.push(n); toks.push({k: "node", node: n, at, end, ref: r}); continue }
    const cue = CUETAG[r.toLowerCase()]; if (cue) { toks.push({k: "cue", cue, at, end, ref: r}); continue }
    const cl = r[0] === "/" && CUETAG[r.slice(1).trim().toLowerCase()]; if (cl) { toks.push({k: "cue", cue: cl, close: true, at, end, ref: r}); continue }
    const s = r.toLowerCase() === "stop" ? STOP : (d.slides || []).find(x => x && x.name && x.name.trim() === r);
    if (s) toks.push({k: "slide", slide: s, at, end, node: nodes[nodes.length - 1] || null, ref: r}) }
  // a voice cue with its end tag ([Excited]…[/Excited]) covers the words between them
  toks.forEach((x, i) => { if (x.k !== "cue" || x.close) return; for (let q = i + 1; q < toks.length; q++) { const y = toks[q]; if (y.k === "cue" && y.cue === x.cue) { if (y.close && y.pairOf == null) { x.pair = q; y.pairOf = i } break } } });
  nodes.forEach((n, i) => { n.stop = i + 1 < nodes.length ? nodes[i + 1].at : t.length;      // its own words end at the next tag of any level
    let k = i + 1; while (k < nodes.length && nodes[k].lvl > n.lvl) k++; n.last = k < nodes.length ? nodes[k].at : t.length });   // its whole branch ends at the next one at its level or higher
  const P = {toks, nodes, t, times: d.times || {}, wpm: wpmOf(d), normal: wpmOf(d)}; P.fit = fitOf(d, P); if (P.fit) P.wpm = P.fit.wpm; return P }
// Talk length check: the words at the speed that would finish in the talk's length (Countdown minutes), videos counted at their own length.
// vidSecs: a video slide's length (typed in the slide, or read from the video file); VDUR keeps lengths read in this browser.
const VDUR = {};
const vidSecs = sl => sl && sl.type === "video" ? (+sl.secs || VDUR[(sl.url || sl.video || "").trim()] || 0) : 0;
const talkSecs = d => { const m = +d.timerMinutes || +((String(d.length || "").match(/(\d+(?:\.\d+)?)\s*min/i) || [])[1]) || 0; return m > 0 ? m * 60 : 0 };
const vidsIn = (P, a, b) => P.toks.reduce((s, x) => s + (x.k === "slide" && x.at >= a && x.at < b ? vidSecs(x.slide) : 0), 0);
function fitOf(d, P){ const T = talkSecs(d); if (!T) return null; const W = P.t.replace(TAG, " ").split(/\s+/).filter(Boolean).length, V = vidsIn(P, 0, P.t.length), noLen = P.toks.filter(x => x.k === "slide" && x.slide.type === "video" && !vidSecs(x.slide)).length;
  const left = T - V; if (!W) return {T, W, V, noLen, wpm: P.normal, state: "empty"}; const wpm = left > 30 ? Math.round(W / (left / 60)) : 999, r = wpm / P.normal;
  const state = r > 1.12 ? "long" : r < .85 ? "short" : "ok", fitW = Math.round(P.normal * Math.max(0, left) / 60);
  return {T, W, V, noLen, wpm: Math.min(999, Math.max(20, wpm)), state, diffW: W - fitW, diffS: Math.round((W - fitW) / P.normal * 60)} }
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
// The audience page (people follow the talk on their phones) and the QR code slide that opens it.
const audienceURL = () => new URL("audience.html", location.href.replace(/[?#].*$/, "")).href;
function qrSVG(url){ try { const q = window.qrcode(0, "M"); q.addData(url); q.make(); return q.createSvgTag({scalable: true, margin: 2}) } catch (e) { return `<div class="qrno">QR code</div>` } }
function qrSlide(s){ const u = audienceURL(); return `<div class="slide qrs"><div class="qrx"><div class="qrt">${E(s.slideTitle || "Follow along on your phone")}</div>${(s.slide || "").trim() ? `<div class="qrs2">${E(s.slide)}</div>` : ""}<div class="qru">${E(u.replace(/^https?:\/\//, ""))}</div></div><div class="qri">${qrSVG(u)}</div></div>` }
function qrOver(s){ const q = s.qr; return `<div class="qro" style="left:${+q.x || 0}%;top:${+q.y || 0}%;width:${+q.w || 20}%">${qrSVG(audienceURL())}<i class="qrh" title="Drag to resize"></i></div>` }
function slideHTML(s, d){ const h = slideHTML0(s, d); return s && s.qr && typeof s.qr === "object" && s.type !== "qr" ? h.replace(/<\/div>\s*$/, qrOver(s) + "</div>") : h }
function slideHTML0(s, d){ if (s && s.type === "qr") return qrSlide(s); if (!s) return d && d.titleImage ? `<div class="slide">${T.imgTag(d.titleImage)}</div>` : slideBox({layout: "center", slideTitle: d ? d.title : ""});
  if (s.type === "verse") return verseSlide({ref: s.ref || s.name, text: s.text, version: s.version});
  return xsHTML(s.type && SLIDE_TYPES[s.type] ? s : {...s, type: "image"}) }
const icon = s => s.type === "qr" ? "⌗" : s.stop ? "■" : s.type === "verse" ? "✝" : s.type === "video" ? "▶" : s.type === "quote" ? "❝" : /bullets/.test(s.type) ? "☰" : "▣";

async function load(fresh){
  if (fresh || token()) { try { const g = await GH.get(FILE); return {d: JSON.parse(g.text), sha: g.sha} } catch (e) { if (fresh) throw e } }
  const r = await fetch("talk2.json?t=" + Date.now(), {cache: "no-store"}); if (!r.ok) throw new Error("talk2.json " + r.status); return {d: await r.json(), sha: null} }
let bc = null; try { bc = new BroadcastChannel("talk2-" + FOLDER) } catch (e) {}
const relay = d => C.relay + "/" + d.relayTopic;
function topBar(d, active){ return `<div class="top"><h1>${E(d.title)} <span class="v2">new version</span></h1><div class="mode">
  <a class="btn${active === "edit" ? " on" : ""}" href="edit2.html">Edit</a><a class="btn${active === "present" ? " on" : ""}" href="present2.html">Stage</a>
  <a class="btn" href="slides2.html" target="_blank" rel="noopener">Slides</a><a class="btn" href="audience.html" target="_blank" rel="noopener" title="The page the audience follows on their phones">Audience</a><a class="btn" href="edit.html" title="The version you used before">Old version</a></div></div>` }

// =====================================================================
// SLIDES (monitor): follows the presenter; arrows step through the slides here, and it snaps back when the presenter moves.
// =====================================================================
async function slides(){ if (new URLSearchParams(location.search).has("play")) return play();
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
const nil = (P, n) => !!n && !P.t.slice(n.end, n.last).replace(TAG, " ").trim() && !n.slides.some(x => x.slide && !x.slide.stop);
// Time keys and planned seconds: a point's practice time (d.times), else its words at 140 a minute; a section adds up its points.
const wpmOf = d => Math.max(60, Math.min(300, +d.wpm || 140));
const tkey = n => n.id || n.lvl + "|" + n.text;
const mmss = x => { x = Math.max(0, Math.round(x)); return x < 60 ? x + "s" : Math.floor(x / 60) + ":" + String(x % 60).padStart(2, "0") };
const wordsIn = (P, a, b) => P.t.slice(a, b).replace(TAG, " ").split(/\s+/).filter(Boolean).length;
function planSecs(P, n){ if (n.lvl >= 2) { const t = P.times[tkey(n)]; if (!P.fit && t != null && +t >= 5 && n.lvl === 2) return {s: +t, pr: true}; const w = wordsIn(P, n.end, n.last), v = vidsIn(P, n.end, n.last), s0 = w / P.wpm * 60 + v; return {s: s0 ? Math.max(10, Math.round(s0 / 10) * 10) : 0, pr: false} }
  const kids = P.nodes.filter(x => x.parent === n && x.lvl === 2); let s = 0, pr = false, a = n.end;
  for (const c of kids) { s += wordsIn(P, a, c.at) / P.wpm * 60 + vidsIn(P, a, c.at); const q = planSecs(P, c); s += q.s; pr = pr || q.pr; a = c.last } s += wordsIn(P, a, n.last) / P.wpm * 60 + vidsIn(P, a, n.last); return {s: s ? Math.max(10, Math.round(s / 10) * 10) : 0, pr} }
function fitHTML(P){ const f = P.fit; if (!f) return `<div class="tfit"><span class="note">Set the talk length in Talk details to check if the content fits.</span></div>`;
  const n = f.W.toLocaleString(), vt = f.V ? ` + ${mmss(f.V)} of video` : "", miss = f.noLen ? `<div class="note">${f.noLen} video${f.noLen === 1 ? " has" : "s have"} no length yet (set it in the video slide), so ${f.noLen === 1 ? "it isn't" : "they aren't"} counted.</div>` : "";
  if (f.state === "empty") return `<div class="tfit"><span class="note">No words yet.</span></div>`;
  const msg = f.state === "long" ? `<b>Too much content.</b> To finish in ${mmss(f.T)} you'd speak ${f.wpm} words a minute; your normal is ${P.normal}. Cut about ${Math.abs(f.diffW).toLocaleString()} words (about ${mmss(Math.abs(f.diffS))}).`
    : f.state === "short" ? `<b>Too little content.</b> It fills ${mmss(f.T)} only at ${f.wpm} words a minute; your normal is ${P.normal}. You could add about ${Math.abs(f.diffW).toLocaleString()} words (about ${mmss(Math.abs(f.diffS))}).`
    : `<b>About right.</b> ${f.wpm} words a minute fills ${mmss(f.T)}; your normal is ${P.normal}.` + (Math.abs(f.diffS) >= 30 ? ` About ${mmss(Math.abs(f.diffS))} ${f.diffS > 0 ? "long" : "short"} at your normal speed.` : "");
  return `<div class="tfit ${f.state}"><div>${msg}</div><div class="note">${n} words${vt} · the times above use ${f.wpm} words a minute</div>${miss}</div>` }
function treeHTML(P, S, k, big, pick){ const cur = pick || (S[k] && S[k].node); let h = "";
  for (const n of P.nodes) { const sl = n.slides.filter(x => x.slide && !x.slide.stop).length;
    const q = n.lvl <= 2 ? planSecs(P, n) : {s: 0}, w = q.s, tm = w ? mmss(w) : "";
    h += `<button type="button" class="tn l${n.lvl}${cur === n ? " cur" : ""}${nil(P, n) ? " nil" : ""}${q.pr ? " prc" : ""}" data-n="${n.j}" title="${w ? (q.pr ? "Practiced: " + tm : "About " + tm + " at " + P.wpm + " words a minute" + (P.fit ? " (the speed that fits the talk's length)" : "")) : nil(P, n) ? "No words here yet" : ""}"><i>${E(n.lab)}</i><span>${E(n.text || "(no words)")}</span>${tm && !big ? `<span class="tm">${tm}</span>` : ""}</button>` }
  if (h && !big) { const top = P.nodes.filter(n => n.lvl === 1), tot = (top.length ? top : P.nodes.filter(n => n.lvl === 2)).reduce((a, n) => a + planSecs(P, n).s, 0); if (tot) h += `<div class="ttot"><span>Total (estimated)</span><span>${mmss(tot)}</span></div>` + fitHTML(P) }
  return h || `<p class="note" style="padding:8px">No outline yet. Type / in the text to add a section, point or sub point, or use ✨ Outline.</p>` }
// The text with every tag drawn: nodes as numbered chips (a section as a header with its words), slides as named chips, cues as small hints.
// inEdit: chips are editable tags. S: wrap each stretch of words in a span (Stage). blocks: wrap each node's part in an indented block.
const ndTitle = n => `${LV[n.lvl]} ${n.lab}: ${n.text || "(no words)"}`;
const ndInner = n => n.lvl === 1 ? `<b>${E(n.lab)}</b>${E(n.text || "(no words)")}` : `<b>${E(n.lab)}</b>`;
function textHTML(d, P, inEdit, S, blocks){ const t = P.t; let h = "", pos = 0, open = false; const byA = new Map(); if (S) S.forEach((st, i) => { if (st.a != null) byA.set(st.a, i) });
  const tok = x => { const r = x.ref;
    if (x.k === "node") { const n = x.node; return inEdit ? `<span class="vchip nd l${n.lvl}" contenteditable="false" data-ref="${E(r)}" title="${E(ndTitle(n))}. Click to change it, drag to move it">${ndInner(n)}</span>`
      : `<span class="bmark l${n.lvl}" data-n="${n.j}" title="${E(ndTitle(n))}">${n.lvl === 1 ? E(n.lab + " " + n.text) : E(n.lab)}</span>` }
    if (x.k === "cue") { const cc = "cue-" + x.cue.cue.replace(" ", ""); if (x.close) { vz = null; return inEdit ? `<span class="vchip cue end ${cc}" contenteditable="false" data-ref="${E(r)}" title="End of ${E(x.cue.ref)}"></span>` : "" }
      if (x.pair != null) vz = cc; const ranged = x.pair != null && !/pause/.test(x.cue.cue);
      return inEdit ? `<span class="vchip cue ${cc}" contenteditable="false" data-ref="${E(r)}" title="${ranged ? E(x.cue.ref) + ": the marked words after it" : E(x.cue.ref) + (/pause/.test(x.cue.cue) ? "" : ": the next sentence")}">${E(x.cue.icon + " " + x.cue.ref)}<i class="cx" title="Remove">×</i></span>` : `<span class="cuehint cue ${cc}">${E(x.cue.icon + " " + x.cue.ref)}</span>` }
    const s = x.slide; return inEdit ? `<span class="vchip sl${s.stop ? " stop" : ""}" contenteditable="false" data-ref="${E(r)}" title="${s.stop ? "Stop: a pause that keeps the slide" : "Slide. Click to show it; drag to move it"}">${icon(s)} ${E(s.name)}</span>`
      : `<button type="button" class="vtag sl${s.stop ? " stop" : ""}" data-pk="${E(s.name)}">${icon(s)} ${E(s.name)}</button>` };
  let vz = null; const tx = (a, b) => { const w = E(t.slice(a, b)); return vz && w ? `<span class="vz ${vz}">${w}</span>` : w };
  const piece = (a, b) => { let o = "", p = a; for (const x of P.toks) { if (x.k !== "cue" || x.at < a || x.at >= b) continue; o += tx(p, x.at) + tok(x); p = x.end } return o + tx(p, b) };
  const words = b => { if (b <= pos) return; const i = byA.get(pos), w = piece(pos, b); h += i != null ? `<span class="ck" data-s="${i}">${w}</span>` : w };
  for (const x of P.toks) { if (x.k === "cue") continue; words(x.at);
    if (blocks && x.k === "node") { h += (open ? "</div>" : "") + `<div class="sg l${x.node.lvl}" data-seg="1">`; open = true }
    h += tok(x); pos = x.end }
  words(t.length); if (open) h += "</div>"; return h }
// Talking points: free-form notes per outline tag, kept as simple HTML (bold, underline, italics, lists, indents).
function cleanHTML(h){ const tp = document.createElement("template"); tp.innerHTML = h || ""; const OK = /^(B|STRONG|U|I|EM|UL|OL|LI|BR|DIV|P|BLOCKQUOTE)$/;
  const walk = n => { for (const c of [...n.childNodes]) { if (c.nodeType === 3) continue; if (c.nodeType !== 1) { c.remove(); continue } walk(c);
      if (!OK.test(c.tagName)) { c.replaceWith(...c.childNodes); continue } for (const a of [...c.attributes]) c.removeAttribute(a.name) } };
  walk(tp.content); const out = tp.innerHTML.trim(); return out.replace(/<br>$/, "").replace(/<(div|p)><br><\/\1>/g, "<br>") }
const noteText = h => (h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
// The notes for a step: its own outline tag's, else the nearest one above it that has some.
const SLTR = {image: ["eyebrow", "slideTitle", "slide"], plain: ["eyebrow", "slideTitle", "slide"], bulletsimg: ["slideTitle", "bullets"], bullets: ["slideTitle", "bullets"], quote: ["quote", "by"], verse: ["ref", "text"], qr: ["slideTitle", "slide"]};
const slSrc = s => { const f = SLTR[s && s.type] || []; const o = {}; f.forEach(k => { if ((s[k] || "").trim()) o[k] = s[k].trim() }); return Object.keys(o).length ? JSON.stringify(o) : "" };
function slideTrHTML(s, lang){ const src = slSrc(s), t = s && s.tr && s.tr[lang]; if (!src || !t || (s.trSrc || {})[lang] !== src) return ""; const g = k => E(t[k] || "");
  if (s.type === "verse") return `<div class="aust"><div class="austt">${g("text")}</div><div class="austs">${g("ref")}</div></div>`;
  if (s.type === "quote") return `<div class="aust"><div class="austt">“${g("quote")}”</div>${t.by ? `<div class="austs">${g("by")}</div>` : ""}</div>`;
  return `<div class="aust">${t.eyebrow ? `<div class="austs">${g("eyebrow")}</div>` : ""}${t.slideTitle ? `<div class="austt">${g("slideTitle")}</div>` : ""}${t.slide ? `<div class="austs">${g("slide")}</div>` : ""}${t.bullets ? `<ul>${String(t.bullets).split("\n").filter(x => x.trim()).map(x => `<li>${E(x.replace(/^[-•*]\s*/, ""))}</li>`).join("")}</ul>` : ""}</div>` }
// Talking points go with each Next press: d.notes[id] holds press 1 of an outline tag, d.notes[id + ":2"] press 2, and so on.
// A tag that only has d.notes[id] (older talks) shows it for all its presses. ownSteps: the presses that belong to the tag itself.
const ownSteps = (S, n) => S.map((st, i) => st.node === n ? i : -1).filter(i => i >= 0);
const nk = (id, j) => j ? id + ":" + (j + 1) : id;
const perPress = (d, id) => !!id && Object.keys(d.notes || {}).some(x => x.startsWith(id + ":"));
function noteFor(d, n, j){ const N = d.notes || {}; if (n && n.id && j > 0 && perPress(d, n.id)) { const h = N[nk(n.id, j)]; return h && noteText(h) ? {n, h, j} : {n, h: "", j} }
  for (let p = n; p; p = p.parent) { const h = p.id && N[p.id]; if (h && noteText(h)) return {n: p, h} } return null }
// The light box behind the words being read: from the top of the first line to the bottom of the last, across the text column.
function hlBox(host, col, r){ let el = host.querySelector(":scope > .hlb"); const L = r ? [...r.getClientRects()].filter(x => x.width > 1 && x.height > 1) : [];
  if (!L.length) { if (el) el.hidden = true; return } if (!el) { el = document.createElement("div"); el.className = "hlb"; host.appendChild(el) }
  const h = host.getBoundingClientRect(), c = col.getBoundingClientRect(), top = Math.min(...L.map(x => x.top)), bot = Math.max(...L.map(x => x.bottom));
  el.hidden = false; el.style.top = (top - h.top - 6) + "px"; el.style.height = (bot - top + 12) + "px"; el.style.left = (c.left - h.left + 4) + "px"; el.style.width = (c.width - 8) + "px" }
// The first step at or after an outline node (clicking a point in a list).
const firstAt = (S, n) => n ? S.findIndex(z => z.pos >= n.at) : -1;
// Bring a range into view below the sticky parts: in the middle if it fits, else its start at the top.
// Edit and Stage share one layout: outline | text | slide over tabs, with dividers you drag (sizes kept on this computer).
const LAYK = "v2-lay";
function layout(lay, onResize){ let z = {}; try { z = JSON.parse(localStorage.getItem(LAYK) || "{}") } catch (e) {}
  const put = () => { if (z.c1) lay.style.setProperty("--c1", z.c1 + "px"); if (z.c3) lay.style.setProperty("--c3", z.c3 + "px"); if (z.h1) lay.style.setProperty("--h1", z.h1 + "px") };
  const fit = () => { const top = lay.getBoundingClientRect().top, bar = $(".bar"), ct = $(".ctimer:not([hidden])"); let bot = 0; if (bar) bot = innerHeight - bar.getBoundingClientRect().top; else if (ct) bot = ct.offsetHeight;
    lay.style.setProperty("--avail", Math.max(300, innerHeight - top - bot) + "px"); onResize && onResize() };
  put(); fit(); addEventListener("resize", fit);
  lay.addEventListener("pointerdown", e => { const g = e.target.closest(".gut"); if (!g) return; e.preventDefault(); const k = g.dataset.g, L = lay.getBoundingClientRect(), st = lay.querySelector(".stop2"); g.classList.add("on");
    const mv = ev => { if (k === "c1") z.c1 = Math.round(Math.max(150, Math.min(520, ev.clientX - L.left)));
      else if (k === "c3") z.c3 = Math.round(Math.max(260, Math.min(L.width - 420, L.right - ev.clientX)));
      else if (st) z.h1 = Math.round(Math.max(120, Math.min(L.height - 140, ev.clientY - st.getBoundingClientRect().top))); put(); onResize && onResize() };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); g.classList.remove("on"); try { localStorage.setItem(LAYK, JSON.stringify(z)) } catch (err) {} };
    addEventListener("pointermove", mv); addEventListener("pointerup", up) });
  lay.addEventListener("dblclick", e => { const g = e.target.closest(".gut"); if (!g) return; delete z[g.dataset.g]; lay.style.removeProperty("--" + g.dataset.g); try { localStorage.setItem(LAYK, JSON.stringify(z)) } catch (err) {} onResize && onResize() }) }
// Bring a range into view inside a scrolling pane: in the middle if it fits, else its start at the top (pad: room taken by sticky parts at its top).
function scrollPane(pane, r, pad){ if (!pane || !r || !r.height) return; const pr = pane.getBoundingClientRect(), top = pr.top + (pad || 0) + 8, bottom = pr.bottom - 8, room = bottom - top, y = r.height <= room - 16 ? r.top - top - (room - r.height) / 2 : r.top - top - 10;
  if (Math.abs(y) > 2) pane.scrollTo({top: Math.max(0, pane.scrollTop + y), behavior: "smooth"}) }
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
  document.body.innerHTML = topBar(d, "present") + `<div class="lay v2x v2s" id="lay"><nav class="cues tree" id="nav"></nav><div class="gut" data-g="c1" title="Drag to resize; double-click to reset"></div><main class="pane" id="m">
      <div class="row tt"><label class="chk"><input type="checkbox" id="stx"${showText ? " checked" : ""}> Show the full text</label><span class="zm" data-z="t"><button type="button" data-d="-1" title="Smaller text">A−</button><button type="button" data-d="1" title="Bigger text">A+</button></span></div><div class="fulltext" id="ft"${showText ? "" : " hidden"}><div class="script" id="sc"></div></div></main>
      <div class="gut" data-g="c3" title="Drag to resize; double-click to reset"></div>
      <aside class="side side2"><div class="stop2"><div class="scr"></div><div class="cap" id="cap"></div><div class="nxt" id="nx"></div></div><div class="gut h" data-g="h1" title="Drag to resize; double-click to reset"></div>
        <div class="sbot"><div class="ptabs"><button type="button" data-tab="tp" class="on">Talking points</button><span class="zm" data-z="n"><button type="button" data-d="-1" title="Smaller talking points">A−</button><button type="button" data-d="1" title="Bigger talking points">A+</button></span></div><div class="tabbody"><div class="olbox" id="ol"></div></div></div></aside></div>
    <div class="bar"><button class="btn" id="b" type="button">&larr; Back</button><span id="pos"></span><span id="sync"><b></b>Not sent yet</span>
      <span class="pst" id="pst"></span><button class="btn" id="pop" type="button" title="Slides in their own window on this computer; works without internet">Slides window</button><button class="btn pri" id="n" type="button">Next &rarr;</button></div>
    <div class="ctimer idle" id="ct" hidden><div class="ct-track"><i></i></div><span class="ct-txt"></span></div>`;
  $("#sc").innerHTML = textHTML(d, P, false, S, true);
  const pts = P.nodes.filter(n => n.lvl === 2), total = () => P.nodes.filter(n => n.lvl === 1).reduce((a, n) => a + planSecs(P, n).s, 0) || pts.reduce((a, n) => a + planSecs(P, n).s, 0);
  const TIMER = CountTimer($("#ct"), "pres2-timer-" + FOLDER); TIMER.setMinutes(timerMinutes(d, []) || Math.round(total() / 60));
  // Practice: each Next adds the time since you came to that step to its point; the point's time is saved in talk2.json (d.times) and shows in the outline.
  const ptOf = st => { let p = st && st.node; while (p && p.lvl > 2) p = p.parent; return p && p.lvl === 2 ? p : null };
  let run = false, arrive = Date.now(), acc = {}, queue = {}, saveT = null, psaving = false, pmsg = "";
  const record = () => { if (!run || end) return; const p = ptOf(S[k]); const t = (Date.now() - arrive) / 1000; if (!p || t < 1 || t > 3600) return; const key = tkey(p); acc[key] = (acc[key] || 0) + t; queue[key] = Math.round(acc[key]); P.times[key] = queue[key]; clearTimeout(saveT); saveT = setTimeout(savePractice, 1500) };
  async function savePractice(){ if (psaving) { saveT = setTimeout(savePractice, 1000); return } const q = queue; queue = {}; if (!Object.keys(q).length) return; psaving = true;
    try { if (!token()) { pmsg = "Practice times aren't saved on this computer (no GitHub sign-in)."; return }
      for (let a = 0; a < 3; a++) { const g = await GH.get(FILE), dd = JSON.parse(g.text); dd.times = {...(dd.times || {}), ...q}; dd.lastPractice = {date: new Date().toISOString(), total: Math.round(total())};
        try { await GH.put(FILE, b64e(JSON.stringify(dd, null, 1) + "\n"), g.sha, "Practice times for " + (d.title || FOLDER)); d.times = dd.times; d.lastPractice = dd.lastPractice; pmsg = ""; return } catch (e) { if (e.status !== 409 && e.status !== 422) throw e } } }
    catch (e) { Object.assign(queue, q); pmsg = "Practice times not saved yet (" + (e.detail || e.message) + ")"; saveT = setTimeout(savePractice, 5000) } finally { psaving = false; pace() } }
  function pace(){ const el = $("#pst"); if (!el) return; if (pmsg) { el.textContent = pmsg; el.className = "pst slow"; return }
    if (run) { const p = ptOf(S[k]); el.className = "pst"; el.textContent = end ? "Last part timed ✓ Untick Practice when you're done" : p ? `Timing ${p.lab} · ${mmss((Date.now() - arrive) / 1000 + (acc[tkey(p)] || 0))}` : "Practice: press Next at the end of each part"; return }
    const e = TIMER.elapsed(), p = ptOf(S[k]); if (e == null || !p || end) { el.textContent = ""; el.className = "pst"; return }
    const before = P.fit ? wordsIn(P, 0, p.at) / P.wpm * 60 + vidsIn(P, 0, p.at) : pts.filter(x => x.at < p.at).reduce((a, x) => a + planSecs(P, x).s, 0), here = planSecs(P, p).s, plan = before + Math.min((Date.now() - arrive) / 1000, here), dl = e - plan;
    el.className = "pst " + (Math.abs(dl) < 20 ? "even" : dl > 0 ? "slow" : "fast"); el.textContent = Math.abs(dl) < 20 ? "On pace" : dl > 0 ? mmss(dl) + " behind · speed up" : mmss(-dl) + " ahead · slow down" }
  setInterval(pace, 1000);
  // The left list: the same outline as in Edit, to jump to.
  const branch = n => { let p = n; while (p && p.lvl > 2) p = p.parent; return p };     // the point (or section) you're in
  function draw(){ const st = S[k], n = st && st.node, b = n ? branch(n) : null;
    // the outline of the point you're in, big, with the current line lit and its slide chips
    let h = ""; if (b) { const list = P.nodes.filter(x => x.at >= b.at && x.at < b.last);
      h = `<div class="olh">${E(b.lab)} ${E(b.text)}</div><ul class="ol">` + list.filter(x => x !== b).map(x => `<li class="l${x.lvl}${x === n ? " cur" : ""}" data-n="${x.j}"><span class="kn">${E(x.lab)}</span>${E(x.text)}${x.slides.filter(q => q.slide && !q.slide.stop).map(q => { return ` <button type="button" class="vtag${q.step === k || (SH[k] === q.slide && q.step <= k) ? " on" : ""}" data-pk="${E(q.slide.name)}">${icon(q.slide)} ${E(q.slide.name)}</button>` }).join("")}</li>`).join("") + "</ul>";
      const own = b.slides.filter(q => q.slide && !q.slide.stop); if (own.length) h = h.replace("</div>", " " + own.map(q => { return `<button type="button" class="vtag${SH[k] === q.slide && q.step <= k ? " on" : ""}" data-pk="${E(q.slide.name)}">${icon(q.slide)} ${E(q.slide.name)}</button>` }).join("") + "</div>");
      if (n === b) h = h.replace('class="olh"', 'class="olh cur"') }
    const own = n ? ownSteps(S, n) : [], pj = Math.max(0, own.indexOf(k)), nt = n ? noteFor(d, n, pj) : null;
    if (nt && noteText(nt.h)) h = `<div class="olh${n === nt.n ? " cur" : ""}">${E(nt.n.full)} ${E(nt.n.text)}${nt.n === n && own.length > 1 && perPress(d, n.id) ? ` <span class="tpj">${pj + 1} of ${own.length}</span>` : ""}</div><div class="tpn">${cleanHTML(nt.h)}</div>`;
    $("#ol").innerHTML = h || `<div class="olh">${E(d.title)}</div>`; $("#ol").scrollTop = 0;
    $("#nav").innerHTML = treeHTML(P, S, k, true); const cn = $("#nav .cur"); if (cn) { const nv = $("#nav"); if (cn.offsetTop < nv.scrollTop || cn.offsetTop > nv.scrollTop + nv.clientHeight - 30) nv.scrollTo({top: cn.offsetTop - nv.clientHeight / 2, behavior: "smooth"}) }
    const ck = end ? null : $(`#sc .ck[data-s="${k}"]`); requestAnimationFrame(() => { let r = null; if (ck && showText) { r = document.createRange(); r.selectNodeContents(ck) } hlBox($("#ft"), $("#sc"), r) });
    const s = peek ? (d.slides || []).find(x => x.name === peek) : SH[k]; setSlide($("#m").parentElement.querySelector(".scr"), end ? '<div class="slide blank"></div>' : slideHTML(s, d));
    $("#cap").textContent = end ? "End of the talk" : peek ? "Showing " + peek + " · Next or Back goes back" : s ? s.name : "Title slide";
    const nx = S.slice(k + 1).find(z => z.node && z.node !== n); $("#nx").innerHTML = nx ? `Up next: <b>${E(nx.node.lab)}</b> ${E(nx.node.text)}` : "End of the talk";
    $("#pos").textContent = (k + 1) + " of " + S.length; vid();
    requestAnimationFrame(() => { const el = ck || (n && $(`#sc .bmark[data-n="${n.j}"]`)); const ol = $("#ol"), tb = $(".top");
      if (showText && el) scrollPane($("#m"), el.getBoundingClientRect(), $("#m .tt") ? $("#m .tt").offsetHeight : 0) }) }
  function vid(){ const v = $(".side .slide.vid[data-next]"); if (!v || v.dataset.hooked) return; v.dataset.hooked = 1; const at = k; v.addEventListener("vidend", () => setTimeout(() => { if (k === at && !peek) next() }, 1200)) }
  async function push(){ const m = {v: 2, step: k, at: Date.now()}; if (peek) m.pk = peek; if (end) m.end = 1; try { localStorage.setItem("pres2-" + FOLDER, k) } catch (e) {}
    if (bc) try { bc.postMessage(m) } catch (e) {} const se = $("#sync");
    try { const r = await fetch(relay(d), {method: "POST", body: JSON.stringify(m)}); se.className = r.ok ? "ok" : "bad"; se.lastChild.textContent = r.ok ? "Monitors following" : "Sync failed" } catch (e) { se.className = "bad"; se.lastChild.textContent = "Offline: only the slides window follows" } }
  const locked = () => !!$("#gate");
  function go(i, rec){ if (locked()) return; if (rec) record(); const p0 = ptOf(S[k]); peek = null; end = false; k = Math.max(0, Math.min(S.length - 1, i)); if (!rec || ptOf(S[k]) !== p0 || true) arrive = Date.now(); draw(); push(); TIMER.at(k === 0); pace() }
  function next(){ if (locked()) return; if (peek) { peek = null; draw(); push(); return } if (k < S.length - 1) go(k + 1, true); else if (!end) { record(); end = true; arrive = Date.now(); draw(); push(); pace() } }
  function back(){ if (locked()) return; if (peek) { peek = null; draw(); push(); return } if (end) { end = false; draw(); push(); return } if (k > 0) go(k - 1) }
  $("#n").onclick = next; $("#b").onclick = back;

  addEventListener("resize", () => draw());
  // A− / A+ for the text and the talking points, kept on this computer
  let Z = {t: 1, n: 1}; try { Z = {...Z, ...JSON.parse(localStorage.getItem("v2-zoom") || "{}")} } catch (e) {}
  const zoom = () => { const L = $("#lay"); L.style.setProperty("--tz", Z.t); L.style.setProperty("--nz", Z.n) }; zoom();
  document.addEventListener("click", e => { const b = e.target.closest(".zm [data-d]"); if (!b) return; const w = b.parentElement.dataset.z; Z[w] = Math.max(.6, Math.min(2.6, Math.round((Z[w] + .1 * +b.dataset.d) * 10) / 10)); zoom(); try { localStorage.setItem("v2-zoom", JSON.stringify(Z)) } catch (_) {} draw() });
  $("#stx").onchange = e => { showText = e.target.checked; $("#ft").hidden = !showText; try { localStorage.setItem("pres2-text", showText ? "1" : "0") } catch (_) {} draw() };
  document.body.addEventListener("click", e => { const pk = e.target.closest("[data-pk]"); if (pk) { const nm = pk.dataset.pk; if (nm === "Stop") return; peek = peek === nm ? null : nm; draw(); push(); return }
    const t = e.target.closest("[data-n]"); if (t && (t.closest("#nav") || t.closest("#ol") || t.closest("#sc"))) { const j = +t.dataset.n, i = firstAt(S, P.nodes[j]); if (i >= 0) go(i) } });
  $("#pop").onclick = () => { window.open("slides2.html?window=1", "slides2-" + FOLDER, "popup,width=1280,height=720"); setTimeout(push, 900) };
  document.addEventListener("keydown", e => { if (locked() || e.target.closest("input,textarea")) return; if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); next() } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); back() } });
  layout($("#lay"), () => { const ck = !end && $(`#sc .ck[data-s="${k}"]`); if (ck && showText) { const r = document.createRange(); r.selectNodeContents(ck); hlBox($("#ft"), $("#sc"), r) } });
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
  let P = parse(d), S = build(P), SH = S.map(x => x.slide), k = 0, peek = null, dirty = false, saving = false, timer = null, panel = "tp";
  const hist = [];                 // earlier versions of the text and slides, for Undo
  document.body.innerHTML = topBar(d, "edit") + `<div class="lay v2x v2e" id="lay"><nav class="cues tree" id="tree"></nav><div class="gut" data-g="c1" title="Drag to resize; double-click to reset"></div>
    <main class="pane" id="m"><div class="tools"><button type="button" class="btn small" id="det">Talk details</button><button type="button" class="btn small" id="undo" disabled title="Undo the last change">↶ Undo</button>
      <button type="button" class="btn small aib" id="aiol" title="The AI reads your text and adds the outline tags (sections and points); you check them first">✨ Outline from the text</button><button type="button" class="btn small aib" id="aisp" title="Spelling in the whole text and on every slide; you check each change">✨ Check spelling</button><button type="button" class="btn small" id="lis" title="The AI voice reads the talk from where you are; Next steps along">▶ Listen from here</button><button type="button" class="btn small aib" id="narr" title="The whole talk read in the AI voice and saved, with a link anyone can open to watch the slides while it plays">🔊 Narrated version</button>
      <span class="note">Type <b>/</b> for a point, a slide or a reading cue. Drag slides in from the right.</span></div>
      <div class="ftext" id="ftext"></div></main><div class="gut" data-g="c3" title="Drag to resize; double-click to reset"></div>
    <aside class="side side2"><div class="stop2"><div class="scr"></div><div class="cap" id="cap"></div><div class="stepbar"><button type="button" class="btn small" id="eb">&larr; Back</button><span id="epos"></span><button type="button" class="btn small pri" id="en">Next &rarr;</button></div></div><div class="gut h" data-g="h1" title="Drag to resize; double-click to reset"></div>
      <div class="sbot"><div class="ptabs"><button type="button" data-tab="tp" class="on">Talking points</button><button type="button" data-tab="au">Audience notes</button><button type="button" data-tab="lib">Slides</button><button type="button" data-tab="run">In order of use</button><button type="button" class="btn small" id="sadd" hidden>+ New slide</button></div><div class="tabbody">
      <div class="tp" id="tpbox"><div class="tph"><b id="tpt">Talking points</b><span class="tpb"><button type="button" data-c="bold" title="Bold"><b>B</b></button><button type="button" data-c="underline" title="Underline"><u>U</u></button><button type="button" data-c="italic" title="Italic"><i>I</i></button><button type="button" data-c="insertUnorderedList" title="Bullets">•</button><button type="button" data-c="insertOrderedList" title="Numbers">1.</button><button type="button" data-c="outdent" title="Less indent">⇤</button><button type="button" data-c="indent" title="More indent">⇥</button></span><button type="button" class="btn small aib" id="tpai" title="The AI drafts short talking points from this part's text">✨ Draft</button><button type="button" class="btn small aib" id="tpall" title="The AI drafts talking points for every part again, a set for each Next press">✨ Draft all</button></div>
        <div class="aubar" id="aubar" hidden></div>
        <div class="tpe" id="tpe" contenteditable="true" spellcheck="true" data-ph="What you glance at while you talk: a few short lines. Bold, underline and bullets work."></div><div class="trrow" id="trrow" hidden><button type="button" class="btn small aib" id="trone"></button></div></div>
      <input class="psq" id="psq" type="search" placeholder="Find a slide (name or words on it)…" aria-label="Find a slide" hidden><div class="plist" id="plist" hidden></div></div></div></aside></div>
    <dialog class="sdlg v2d" id="sdlg"></dialog><dialog class="verse ved" id="ndlg"></dialog><dialog class="sdlg pdlg" id="pdlg"></dialog>`;
  $(".top h1").insertAdjacentHTML("afterend", `<span id="save">All changes saved</span>`);
  const setSave = (t, err) => { const s = $("#save"); s.textContent = t; s.className = err ? "err" : "" };
  // ---- saving: the whole file, a moment after the last change ----
  function changed(snap){ if (snap !== false) { hist.push(snap); if (hist.length > 100) hist.shift(); $("#undo").disabled = false }
    P = parse(d); S = build(P); SH = S.map(x => x.slide); if (k >= S.length) k = Math.max(0, S.length - 1); dirty = true; setSave("Saving…"); clearTimeout(timer); timer = setTimeout(flush, 900); redraw() }
  const changed0 = s => changed(s), slideEdit0 = (i, f) => slideEdit(i, f);
  const snapshot = () => JSON.stringify({text: d.text, slides: d.slides, notes: d.notes || {}, audNotes: d.audNotes || {}, languages: d.languages || []});
  async function flush(){ if (saving || !dirty) return; saving = true; dirty = false; const body = JSON.stringify(d, null, 1) + "\n";
    try { SHA = await GH.put(FILE, b64e(body), SHA, "Edit " + d.title + " (new version)"); setSave(dirty ? "Saving…" : "Saved. The live pages update in about a minute.") }
    catch (e) { if (e.status === 409 || e.status === 422) { try { SHA = (await GH.get(FILE)).sha; dirty = true } catch (_) {} } else { dirty = true; setSave("Not saved (" + (e.detail || e.message) + "). Retrying…", true) } setTimeout(flush, e.status === 409 || e.status === 422 ? 200 : 5000) }
    saving = false; if (dirty) flush() }
  window.addEventListener("beforeunload", e => { if (dirty || saving) { e.preventDefault(); e.returnValue = "" } });
  $("#undo").onclick = () => { const s = hist.pop(); if (!s) return; const o = JSON.parse(s); d.text = o.text; d.slides = o.slides; d.notes = o.notes || {}; d.audNotes = o.audNotes || {}; d.languages = o.languages || []; $("#undo").disabled = !hist.length; changed(false); drawText() };

  // ---- the text box ----
  const box = () => $("#ftext .rich.big");
  function drawText(){ $("#ftext").innerHTML = `<div class="rich big" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="The talk" data-ph="Type what you want to say. Then use / or ✨ Outline to add the points." data-f="script">${textHTML(d, P, true, null, true)}</div>`; shape = shapeOf(); hl(true) }
  let shape = ""; const shapeOf = () => P.nodes.map(n => n.lvl).join("");
  function richText(el, keepEnd){ let out = ""; const walk = n => { for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue.replace(/​/g, "");
      else if (c.nodeType === 1) { if (c.classList.contains("vchip")) out += "[" + c.dataset.ref + "]"; else if (c.tagName === "BR") out += "\n";
        else { if (/^(DIV|P)$/.test(c.tagName) && !c.dataset.seg && out && !out.endsWith("\n")) out += "\n"; walk(c) } } } }; walk(el); return keepEnd ? out : out.replace(/\n$/, "") }
  // Where a spot in the text box is, as a position in d.text.
  const offsetOf = (node, off) => { const b = box(), r = document.createRange(); r.setStart(b, 0); r.setEnd(node, off); const dv = document.createElement("div"); dv.appendChild(r.cloneContents()); return richText(dv, true).length };
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
    const items = [[1, "Section"], [2, "Point"], [3, "Sub point"]].map(([l, n]) => ({node: l, label: `<b>${["", "1", "1.a", "1"][l]}</b> ${n}`}))
      .concat([{pickSlide: true, label: "▣ Slide…"}, {slide: "Stop", label: "■ Stop (a pause that keeps the slide)"}],
        Object.values(CUETAG).filter(c => /pause/.test(c.cue)).map(c => ({cue: c.ref, label: E(c.icon + " " + c.ref)})));
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
    if (it.node) { nodeEdit({lvl: it.node, text: ""}, v => { restore(); insertAtCaret("#" + v.lvl + " " + v.text + "|" + newId(), true) }); return }
    if (it.pickSlide) { slidePick(nm => { restore(); insertAtCaret(nm, true) }); return }
    insertAtCaret(it.slide || it.cue, true) }
  document.addEventListener("keydown", e => { if (menu) return; const b = e.target.closest && e.target.closest("#ftext .rich.big"); if (!b) return;
    if (e.key === "/") setTimeout(openMenu, 0); else if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak") } });
  // Up / Down (with or without Shift) in the text: Chrome jumps whole blocks when a line starts with a tag chip, so move one line by position instead.
  const caretRect = (node, off) => { const ok = q => q && q.height > 0; if (node.nodeType === 1) { const c = node.childNodes[off], p = node.childNodes[off - 1]; if (c && c.nodeType === 3) return caretRect(c, 0); if (!c && p && p.nodeType === 3) return caretRect(p, p.length) } const r = document.createRange(); let q = null; if (node.nodeType === 3 && off < node.length && node.data[off] !== "\n") { r.setStart(node, off); r.setEnd(node, off + 1); const z = r.getClientRects()[0]; if (ok(z)) return {left: z.left, top: z.top, bottom: z.bottom, height: z.height} } r.setStart(node, off); r.collapse(true); q = r.getClientRects()[0];
    if (!ok(q) && node.nodeType === 3) { if (off < node.length) { r.setStart(node, off); r.setEnd(node, off + 1); const L = r.getClientRects(); q = L[0]; if (ok(q)) q = {left: q.left, top: q.top, bottom: q.bottom, height: q.height} }
      if (!ok(q) && off > 0) { r.setStart(node, off - 1); r.setEnd(node, off); const L = r.getClientRects(), z = L[L.length - 1]; if (ok(z) && node.data[off - 1] !== "\n") q = {left: z.right, top: z.top, bottom: z.bottom, height: z.height} } }
    if (!ok(q)) { const el = node.nodeType === 1 ? (node.childNodes[off] || node.childNodes[off - 1]) : null; const z = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null; if (ok(z)) q = {left: el === node.childNodes[off] ? z.left : z.right, top: z.top, bottom: z.bottom, height: z.height} }
    return ok(q) ? q : null };
  const pointAt = (x, y) => { const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null; if (!r) return null; let n = r.startContainer, o = r.startOffset;
    const ch = (n.nodeType === 1 ? n : n.parentElement).closest(".vchip"); if (ch) { const cr = ch.getBoundingClientRect(), par = ch.parentNode, i = [...par.childNodes].indexOf(ch); n = par; o = x > cr.left + cr.width / 2 ? i + 1 : i } return [n, o] };
  document.addEventListener("keydown", e => { if (menu || (e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.altKey || e.ctrlKey || e.metaKey) return; const b = box(); if (!b || !b.contains(e.target) && e.target !== b) return;
    const sl = getSelection(); if (!sl.rangeCount || !b.contains(sl.focusNode)) return; const q = caretRect(sl.focusNode, sl.focusOffset); if (!q) return;
    const lh = parseFloat(getComputedStyle(b).lineHeight) || 30, pane = $("#m"), pr = pane.getBoundingClientRect(), up = e.key === "ArrowUp";
    let y = up ? q.top - lh * .5 : q.bottom + lh * .5; const x = sl.isCollapsed || keepX == null ? (keepX = keepX == null ? q.left : keepX) : keepX, bx = Math.max(b.getBoundingClientRect().left + 2, x);
    // the toolbar at the top of the pane covers the text under it, so scroll a few lines when the next line is near the edge or hidden
    const scroll = n => { const s0 = pane.scrollTop; pane.scrollTop += n; y -= pane.scrollTop - s0; return pane.scrollTop !== s0 };
    const hidden = yy => { const el = document.elementFromPoint(bx, yy); return yy < pr.top + 10 || yy > pr.bottom - 10 || !el || !b.contains(el) && el !== b };
    if (hidden(up ? y - lh : y + lh)) scroll(up ? -lh * 4 : lh * 4);
    let t = null; for (let tries = 0; tries < 3 && !t; tries++) { for (let dy = 0; dy < lh * 3 && !t; dy += 6) { const yy = up ? y - dy : y + dy; if (hidden(yy)) break; const p = pointAt(bx, yy); if (p && b.contains(p[0]) && !(p[0] === sl.focusNode && p[1] === sl.focusOffset)) t = p } if (!t && !scroll(up ? -lh * 4 : lh * 4)) break }
    e.preventDefault(); if (!t) return; if (e.shiftKey) sl.extend(t[0], t[1]); else sl.collapse(t[0], t[1]) });
  let keepX = null; document.addEventListener("keydown", e => { if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Shift") keepX = null }, true); document.addEventListener("mousedown", () => { keepX = null }, true);
  // Clicking or moving in the text: the outline on the left and the slide follow the spot you're at.
  let followT = null; const follow = () => { clearTimeout(followT); followT = setTimeout(() => { const b = box(), sl = getSelection(); if (!b || LS.on || !sl.rangeCount || !b.contains(sl.focusNode)) return; let pos; try { pos = offsetOf(sl.focusNode, sl.focusOffset) } catch (e) { return }
      let j = -1; for (let i = 0; i < S.length; i++) { const st = S[i], a = st.a != null ? st.a : st.pos; if (a <= pos) j = i; else break } if (j < 0 || j === k) return; if (tpPick) saveTP(); tpPick = null; peek = null; k = j; redraw() }, 250) };
  document.addEventListener("mouseup", e => { if (e.target.closest && e.target.closest("#ftext .rich.big")) follow() }); document.addEventListener("keyup", e => { if (e.target.closest && e.target.closest("#ftext .rich.big") && /^(Arrow|Page|Home|End)/.test(e.key)) follow() });
  document.addEventListener("mousedown", e => { if (menu && !menu.contains(e.target)) closeMenu() });
  // ---- outline tag pop-up ----
  function nodeEdit(cur, done, canDel){ const dl = $("#ndlg");
    dl.innerHTML = `<form method="dialog" class="ed"><div class="pgh"><b>Outline</b></div><div class="row">${[1, 2, 3].concat(cur.lvl === 4 ? [4] : []).map(l => `<label class="chk"><input type="radio" name="nl" value="${l}"${l === cur.lvl ? " checked" : ""}> ${LV[l]}</label>`).join("")}</div>
      <label>Words (what you glance at while you speak)<input id="nx" autocomplete="off" value="${E(cur.text)}"></label>
      ${cur.node ? `<div class="row ai2row"><span class="note">✨ For this ${E(LV[cur.node.lvl].toLowerCase())} and what's under it (about ${Math.max(1, Math.round(words(d.text.slice(cur.node.end, cur.node.last)) / wpmOf(d) * 2) / 2)} min):</span><button type="button" class="btn small aib" data-nai="flow">✨ Grammar and flow</button><button type="button" class="btn small aib" data-nai="tight">✨ Tighten</button><button type="button" class="btn small aib" data-nai="slide">✨ Suggest a slide</button><button type="button" class="btn small aib" data-nai="cues">✨ Reading cues</button></div>` : ""}
      <div class="row"><span style="flex:1"></span>${canDel ? '<button class="btn small danger" type="button" id="ndel">Remove (keeps the text)</button>' : ""}<button class="btn small" type="button" id="ncan">Cancel</button><button class="btn small pri" type="submit">Save</button></div></form>`;
    dl.querySelectorAll("[data-nai]").forEach(b => b.onclick = () => { dl.close(); nodeAI(cur.node, b.dataset.nai) });
    $("#ncan").onclick = () => dl.close(); if (canDel) $("#ndel").onclick = () => { dl.close(); done(null) };
    dl.querySelector("form").onsubmit = ev => { ev.preventDefault(); const v = {lvl: +dl.querySelector('[name="nl"]:checked').value, text: $("#nx").value.replace(/[\[\]\n]+/g, " ").replace(/\s+/g, " ").trim()}; dl.close(); if (v.text) done(v) };
    try { dl.showModal() } catch (e) { dl.setAttribute("open", "") } $("#nx").focus() }
  // ---- slides: library, editor ----
  const usesOf = nm => P.toks.filter(x => x.k === "slide" && x.slide.name === nm).length;
  const slideWords = s => [s.name, s.slideTitle, s.slide, s.eyebrow, s.bullets, s.quote, s.by, s.ref, s.text, s.version, TYPES[s.type]].filter(Boolean).join(" ").toLowerCase();
  const slideHit = (s, q) => !q || q.split(/\s+/).every(w => slideWords(s).includes(w));
  function plist(){ const el = $("#plist"); if (panel === "tp" || panel === "au") return; const q = (($("#psq") || {}).value || "").trim().toLowerCase(); if (panel === "run") { const L = P.toks.filter(x => x.k === "slide" && !x.slide.stop && x.step != null && slideHit(x.slide, q));
      el.innerHTML = L.length ? L.map(x => { const i = x.step; return `<div class="pi run${SH[k] === x.slide && i <= k ? " cur" : ""}" data-step="${i}"><div class="th">${slideHTML(x.slide, d)}</div><div class="pn"><b>${E(x.slide.name)}</b><span>${x.node ? E(x.node.full + " " + x.node.text) : "Opening"}</span></div></div>` }).join("") : `<p class="note">${q ? "No slide matches." : "No slides in the text yet."}</p>`; return }
    el.innerHTML = d.slides.map((s, i) => { if (!slideHit(s, q)) return ""; const u = usesOf(s.name); return `<div class="pi${u ? "" : " unused"}${SH[k] === s ? " cur" : ""}" draggable="true" data-si="${i}"><div class="th">${slideHTML(s, d)}</div><div class="pn"><b>${icon(s)} ${E(s.name)}</b><span>${E(TYPES[s.type] || "Slide")}${u > 1 ? ` · used ${u}×` : u ? "" : " · not in the text"}</span></div></div>` }).join("") || (q ? `<p class="note">No slide matches.</p>` : `<p class="note">No slides yet. Press + New slide.</p>`) }
  function slideNew(done){ const m = document.createElement("div"); m.className = "vmenu"; m.innerHTML = `<div class="vmh">New slide</div>` + Object.entries(TYPES).filter(([t]) => t !== "qr").map(([t, n]) => `<button type="button" data-t="${t}">${E(n)}</button>`).join("");
    document.body.appendChild(m); const r = ($("#sadd") || document.body).getBoundingClientRect(); m.style.left = Math.max(8, Math.min(r.left, innerWidth - 260)) + "px"; m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8) + "px";
    const off = e => { if (!m.contains(e.target)) { m.remove(); removeEventListener("mousedown", off) } }; setTimeout(() => addEventListener("mousedown", off), 0);
    m.onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return; m.remove(); removeEventListener("mousedown", off); const t = b.dataset.t; let n = d.slides.length + 1, nm; do { nm = (t === "verse" ? "Verse " : "Slide ") + n++ } while (d.slides.some(s => s.name === nm));
      const s = snapshot(), o = {name: nm, type: t}; if (t === "qr") Object.assign(o, {name: "QR code", slideTitle: "Follow along on your phone", slide: "Scan for the slides and notes in your language"}); else if (t === "verse") Object.assign(o, {ref: "", text: "", version: "ESV"}); else if (t === "quote") Object.assign(o, {quote: "", by: ""}); else if (t === "video") Object.assign(o, {url: "", video: "", autoNext: true}); else Object.assign(o, {slideTitle: "", slide: "", eyebrow: "", layout: "center", image: "", bullets: ""});
      draft = o; slideEdit(-1, done) } }      // a new slide is only a draft until Save
  // The / menu's "Slide…": every slide as a small picture with its name; pick one to put it in the text.
  function slidePick(done){ const dl = $("#pdlg");
    dl.innerHTML = `<div class="ed"><div class="pgh"><b>Put a slide in the text</b><input class="pf" placeholder="Find a slide (name or words on it)…" aria-label="Find a slide"><button type="button" class="btn small" id="pcan">Cancel</button></div>
      <div class="pgrid"><button type="button" class="pt new" data-new="1"><div class="th"><span>+</span></div><b>New slide</b></button>${d.slides.map((x, i) => `<button type="button" class="pt" data-si="${i}"><div class="th">${slideHTML(x, d)}</div><b>${icon(x)} ${E(x.name)}</b></button>`).join("")}</div></div>`;
    const f = dl.querySelector(".pf"); f.oninput = () => { const q = f.value.toLowerCase(); dl.querySelectorAll(".pt[data-si]").forEach(b => b.hidden = !slideHit(d.slides[+b.dataset.si], q.trim())) };
    f.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); const b = [...dl.querySelectorAll(".pt[data-si]")].find(x => !x.hidden); if (b) b.click() } };
    $("#pcan").onclick = () => { dl.close(); restore() };
    dl.onclick = e => { const b = e.target.closest(".pt"); if (!b) return; dl.close(); if (b.dataset.new) slideNew(done); else done(d.slides[+b.dataset.si].name) };
    try { dl.showModal() } catch (e) { dl.setAttribute("open", "") } f.focus() }
  function renameIn(a, b){ const rep = x => x.split("[" + a + "]").join(b ? "[" + b + "]" : ""); d.text = rep(d.text || "") }
  let draft = null, editCtx = null;      // draft: a new slide being made (not in the talk until Save); editCtx: the slide editor that's open
  function slideEdit(i, onSave){ const dl = $("#sdlg"), o = i < 0 ? draft : d.slides[i]; if (!o) return; editCtx = {i, onSave}; const isNew = i < 0, commit = s => { if (!isNew) changed(s) }; const A = f => `data-f="${f}"`;
    const fld = (f, lb, ta, ph) => ta ? `<label>${lb}<textarea class="auto" ${A(f)} placeholder="${E(ph || "")}">${E(o[f])}</textarea></label>` : `<label>${lb}<input ${A(f)} value="${E(o[f])}" placeholder="${E(ph || "")}"></label>`;
    let h = `<div class="ed"><div class="pgh"><b>${E(TYPES[o.type] || "Slide")}</b>${isNew ? '<span class="note">New slide</span><button type="button" class="btn small" id="scancel">Cancel</button><button type="button" class="btn small pri" id="ssave">Save</button>' : '<button type="button" class="btn small pri" id="sdone">Done</button>'}</div>
      <div class="row"><label style="flex:1 1 220px">Name (its tag in the text)<input id="sname" value="${E(o.name)}"></label><label style="flex:0 1 200px">Kind<select ${A("type")}>${Object.entries(TYPES).filter(([t]) => t !== "qr" || o.type === "qr").map(([t, n]) => `<option value="${t}"${t === (o.type || "image") ? " selected" : ""}>${E(n)}</option>`).join("")}</select></label></div>
      <div class="prev" id="prev">${slideHTML(o, d)}</div><div class="txbar row" id="txbar"></div>` + slideAIRow(o);
    const ty = o.type || "image";
    if (ty === "verse") h += `<div class="row"><label style="flex:1 1 220px">Reference (or some words from the verse)<input data-f="ref" value="${E(o.ref)}" placeholder="John 15:5, or words you remember"></label><label style="flex:0 1 140px">Version<input data-f="version" value="${E(o.version)}" placeholder="ESV, NIV, NLT…"></label></div>` + fld("text", "Text (**bold**, __underline__)", true) + (o.aiText ? `<p class="note">✨ This text came from the AI. Check it against your Bible, then edit it if needed.</p>` : "");
    else if (ty === "quote") h += fld("quote", "Quote", true) + fld("by", "Who said it");
    else if (ty === "video") h += fld("url", "Link (YouTube or a video file)", false, "https://…") + `<label style="max-width:220px">Length (seconds; read from a video file by itself)<input type="number" min="0" step="1" ${A("secs")} value="${E(o.secs || "")}" placeholder="${E(VDUR[(o.url || o.video || "").trim()] || "")}"></label>` + `<label class="chk"><input type="checkbox" ${A("autoNext")}${o.autoNext !== false ? " checked" : ""}> When it ends, go to the next step</label>`;
    else if (ty === "qr") h += fld("slideTitle", "Title", true) + fld("slide", "Text under it", true) + `<p class="note">The code opens ${E(audienceURL())}</p>`;
    else if (/bullets/.test(ty)) h += fld("slideTitle", "Title", true) + fld("bullets", "Bullets (one per line)", true);
    else h += fld("eyebrow", "Small line on top") + fld("slideTitle", "Title", true) + fld("slide", "Subtitle", true) + `<label>Style<select ${A("layout")}><option value="left"${o.layout !== "center" ? " selected" : ""}>Gold title, white subtitle (left)</option><option value="center"${o.layout === "center" ? " selected" : ""}>White title, gold subtitle (centered)</option></select></label>`;
    if (ty === "image" || ty === "bulletsimg") h += `<div class="row"><span class="tag">Picture (no words in it)</span><label class="btn small">${o.image ? "Replace" : "Add"} picture<input type="file" accept="image/*" id="simg" hidden></label>${o.image ? '<button type="button" class="btn small" id="sdelimg">Remove picture</button>' : ""}<span class="note" id="smsg"></span></div>`;
    if (ty !== "qr" && ty !== "video") h += `<label class="chk"><input type="checkbox" id="sqr"${o.qr ? " checked" : ""}> Show a QR code to the audience page (drag it on the slide to move it, drag its corner to resize)</label>`;
    h += `<label class="chk"><input type="checkbox" ${A("keep")}${o.keep ? " checked" : ""}> Keep it up until another slide comes (even after its point ends)</label>
      ${isNew ? "" : `<div class="row"><span class="note" style="flex:1">Used ${usesOf(o.name)}× in the text.</span><button type="button" class="btn small danger" id="sdel">Delete this slide</button></div>`}</div>`;
    dl.innerHTML = h; dl.dataset.si = i; dl.querySelectorAll("textarea.auto").forEach(t => { t.style.height = t.scrollHeight + 4 + "px" });
    // Lines on the slide (top line, title, subtitle): click one to pick it, drag it to move it, drag its side handles to make the box wider or narrower (the words grow or shrink with it).
    let selK = null; const LNM = {eb: "Top line", tt: "Title", sb: "Subtitle"}, isSet = v => !(v === "" || v == null || isNaN(+v)), q1 = v => Math.round(v * 10) / 10;
    const meas = k => { const el = $(`#prev [data-k="${k}"]`); if (!el) return null; const sl = el.closest(".slide").getBoundingClientRect(), r = el.getBoundingClientRect(), bx = el.classList.contains("tx1") ? r : el.parentElement.getBoundingClientRect();
      return {X: q1((bx.left - sl.left) / sl.width * 100), Y: q1((r.top + r.height / 2 - sl.top) / sl.height * 100), W: q1(bx.width / sl.width * 100)} };
    const mat = k => { const m = meas(k), add = {}; if (m) ["X", "Y", "W"].forEach(a => { if (!isSet(o[k + a])) add[k + a] = m[a] }); return add };
    const mark = () => { const pr = $("#prev"); if (!pr) return; let has = false;
      pr.querySelectorAll(".slide [data-k]").forEach(el => { const on = el.dataset.k === selK; el.classList.toggle("ksel", on); if (on) { has = true; if (el.classList.contains("tx1")) el.insertAdjacentHTML("beforeend", '<i class="kh l" data-h="l"></i><i class="kh r" data-h="r"></i>') } });
      const bar = $("#txbar"); if (!bar) return; if (!has) { bar.innerHTML = `<span class="note">${pr.querySelector(".slide [data-k]") ? "Click a line of words on the slide to move it, resize it or line it up." : ""}</span>`; return }
      const al = o[selK + "Align"] || ""; bar.innerHTML = `<b>${LNM[selK] || "Words"}</b><span class="seg">${["left", "center", "right"].map(a => `<button type="button" class="btn small${al === a ? " on" : ""}" data-al="${a}" title="Line up ${a}">${{left: "⯇ Left", center: "Center", right: "Right ⯈"}[a]}</button>`).join("")}</span><button type="button" class="btn small" data-sz="-1" title="Smaller">A−</button><button type="button" class="btn small" data-sz="1" title="Bigger">A+</button><button type="button" class="btn small" data-kreset="1" title="Put it back where it was">Reset</button>` };
    const pv = () => { $("#prev").innerHTML = slideHTML(o, d); mark() };
    const sq = $("#sqr"); if (sq) sq.onchange = () => { const s = snapshot(); if (sq.checked) o.qr = {x: 74, y: 50, w: 22}; else delete o.qr; commit(s); pv() };
    mark();
    $("#txbar").onclick = e => { const b = e.target.closest("button"); if (!b || !selK) return; const s0 = snapshot(), k = selK;
      if (b.dataset.al) o[k + "Align"] = o[k + "Align"] === b.dataset.al ? "" : b.dataset.al;
      else if (b.dataset.sz) o[k + "Size"] = Math.max(30, Math.min(300, Math.round((isSet(o[k + "Size"]) ? +o[k + "Size"] : 100) * (b.dataset.sz > 0 ? 1.1 : 1 / 1.1))));
      else if (b.dataset.kreset) ["X", "Y", "W", "Size", "Align"].forEach(a => delete o[k + a]);
      commit(s0); pv() };
    $("#prev").addEventListener("pointerdown", e => { if (e.target.closest(".qro")) return; let el = e.target.closest(".slide [data-k]"); if (!el) { if (selK) { selK = null; mark() } return } e.preventDefault();
      const k = el.dataset.k, s0 = snapshot(), add = mat(k); selK = k; if (Object.keys(add).length) Object.assign(o, add); pv(); el = $(`#prev [data-k="${k}"]`); if (!el) return;
      const h = e.target.dataset && e.target.dataset.h, box = el.closest(".slide").getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, X0 = +o[k + "X"], Y0 = +o[k + "Y"], W0 = +o[k + "W"], S0 = isSet(o[k + "Size"]) ? +o[k + "Size"] : 100, fs0 = parseFloat(getComputedStyle(el).fontSize);
      const hit = e.target.closest(".kh") ? e.target.closest(".kh").dataset.h : h; let moved = false;
      const mv = ev => { const dx = (ev.clientX - x0) / box.width * 100, dy = (ev.clientY - y0) / box.height * 100; if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 2) moved = true;
        if (hit === "r" || hit === "l") { const w = Math.max(8, Math.min(100, hit === "r" ? W0 + dx : W0 - dx)), r = w / W0; o[k + "W"] = q1(w); if (hit === "l") o[k + "X"] = q1(X0 + (W0 - w)); o[k + "Size"] = Math.max(30, Math.min(300, Math.round(S0 * r)));
          Object.assign(el.style, {width: o[k + "W"] + "%", left: o[k + "X"] + "%", fontSize: (fs0 * r) + "px"}) }
        else { o[k + "X"] = q1(Math.max(0, Math.min(95, X0 + dx))); o[k + "Y"] = q1(Math.max(0, Math.min(100, Y0 + dy))); el.style.left = o[k + "X"] + "%"; el.style.top = o[k + "Y"] + "%" } };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); if (moved || Object.keys(add).length) commit(s0); pv() };
      addEventListener("pointermove", mv); addEventListener("pointerup", up) });
    $("#prev").onpointerdown = e => { const q = e.target.closest(".qro"); if (!q || !o.qr) return; e.preventDefault(); const box = $("#prev .slide").getBoundingClientRect(), rs = e.target.classList.contains("qrh"), s0 = snapshot(), st = {...o.qr}, x0 = e.clientX, y0 = e.clientY;
      const mv = ev => { const dx = (ev.clientX - x0) / box.width * 100, dy = (ev.clientY - y0) / box.height * 100;
        if (rs) o.qr.w = Math.round(Math.max(8, Math.min(60, st.w + dx)) * 10) / 10; else { const hq = st.w * box.width / box.height; o.qr.x = Math.round(Math.max(0, Math.min(100 - st.w, st.x + dx)) * 10) / 10; o.qr.y = Math.round(Math.max(0, Math.min(100 - hq, st.y + dy)) * 10) / 10 }
        Object.assign(q.style, {left: o.qr.x + "%", top: o.qr.y + "%", width: o.qr.w + "%"}) };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); commit(s0) };
      addEventListener("pointermove", mv); addEventListener("pointerup", up) };
    dl.oninput = e => { const f = e.target.dataset.f; if (!f || e.target.type === "checkbox") return; o[f] = e.target.value; if (f === "text") delete o.aiText; pv() };
    dl.onchange = e => { const el = e.target, f = el.dataset.f; if (el.id === "sname") { const nv = el.value.replace(/[\[\]\n]+/g, " ").trim(); if (!nv || nv === o.name) { el.value = o.name; return }
        if (d.slides.some(s => s !== o && s.name === nv) || /^stop$/i.test(nv) || /^#[1-4]/.test(nv) || CUETAG[nv.toLowerCase()]) { el.value = o.name; el.setCustomValidity("That name is taken"); el.reportValidity(); setTimeout(() => el.setCustomValidity(""), 2000); return }
        if (isNew) { o.name = nv; return } const s = snapshot(); renameIn(o.name, nv); o.name = nv; changed(s); drawText(); return }
      if (!f) return; const s = snapshot(); o[f] = el.type === "checkbox" ? el.checked : el.value; commit(s); if (f === "type") slideEdit(i, onSave); else pv() };
    let saved = false;
    if (isNew) { $("#scancel").onclick = () => dl.close(); $("#ssave").onclick = () => { const s = snapshot(); d.slides.push(o); draft = null; saved = true; changed(s); dl.close() } }
    else $("#sdone").onclick = () => dl.close();
    if ($("#sdel")) $("#sdel").onclick = e => { const b = e.target; if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Tap again: also removes it from the text"; return } const s = snapshot(); renameIn(o.name, null); d.slides.splice(d.slides.indexOf(o), 1); dl.close(); changed(s); drawText() };
    const fi = $("#simg"); if (fi) fi.onchange = async () => { const file = fi.files && fi.files[0]; if (!file) return; $("#smsg").textContent = "Uploading…";
      try { const url = await toJpeg(file), path = `slides/s2-${Date.now().toString(36)}.jpg`; await GH.put(PATH + "/" + path, url.split(",")[1], null, "Slide picture"); LOCALIMG[path] = url; const s = snapshot(); o.image = path; commit(s); slideEdit(i, onSave) }
      catch (err) { $("#smsg").textContent = "Upload failed: " + (err.detail || err.message) } };
    const di = $("#sdelimg"); if (di) di.onclick = () => { const s = snapshot(); o.image = ""; commit(s); slideEdit(i, onSave) };
    dl.onclose = () => { dl.onclose = null; editCtx = null; if (isNew) { draft = null; redraw(); if (saved && onSave) onSave(o.name); return } redraw(); if (onSave) onSave(o.name) };
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
      const pm = $("#m"), pr = pm.getBoundingClientRect(); if (e.clientY > pr.bottom - 40) pm.scrollBy(0, 14); else if (e.clientY < pr.top + 60) pm.scrollBy(0, -14) };
    const up = e => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); if (!g) return; dragged = true; setTimeout(() => dragged = false, 300); g.remove(); mark.remove(); c.classList.remove("dragging");
      const r = spot(e); if (!r) return; c.remove(); r.insertNode(c); const pv = c.previousSibling, nx = c.nextSibling; if (pv && pv.nodeType === 3 && /\S$/.test(pv.nodeValue)) pv.nodeValue += " "; if (!nx || nx.nodeType !== 3 || /^\S/.test(nx.nodeValue)) c.after(document.createTextNode(" ")); saveText(); if (c.classList.contains("nd")) drawText() };
    addEventListener("pointermove", mv); addEventListener("pointerup", up) });
  // ---- stepping like Stage, with the slide on the right ----
  function hl(quiet){ const b = box(), st = S[k]; document.querySelectorAll("#ftext .vchip.on").forEach(c => c.classList.remove("on")); try { CSS.highlights && CSS.highlights.delete("kpcur") } catch (e) {}
    if (!b || !st) return; const chips = [...b.querySelectorAll(".vchip")], nodes = b.querySelectorAll(".vchip.nd"), c = st.node ? nodes[st.node.j] : null;
    if (c) c.classList.add("on"); const r = document.createRange();
    if (st.a == null) { const sc = chips[st.pre]; if (!sc) return; sc.classList.add("on"); r.selectNode(sc) }      // a slide with no words after it
    else { if (st.pre >= 0 && chips[st.pre]) r.setStartAfter(chips[st.pre]); else r.setStart(b, 0); if (st.nxt >= 0 && chips[st.nxt]) r.setEndBefore(chips[st.nxt]); else r.setEnd(b, b.childNodes.length);
      }
    hlBox($("#ftext"), b, r); if (!quiet) { const tl = $("#m .tools"); scrollPane($("#m"), r.getBoundingClientRect(), tl ? tl.offsetHeight : 0) } }
  addEventListener("resize", () => hl(true));
  // ---- talking points for the outline tag you're in ----
  let tpKey = null, tpJ = 0, tpT = null; const keyOf = n => n ? (n.id || "@" + n.at) : "";
  let tpPick = null;      // an outline tag picked in the outline on the left: its talking points show, even if Next lands inside a point under it
  function tpNode(){ if (tpPick) { const n = P.nodes.find(x => keyOf(x) === tpPick); if (n) return n } const st = S[k]; return st && st.node || null }
  const tpPress = n => tpPick || !n ? 0 : Math.max(0, ownSteps(S, n).indexOf(k));      // which Next press of the tag you're on (0 = the first)
  // The same editor holds the talking points (tpMode "tp") or the audience notes ("au"; auLang "" = the original, else one translation).
  let tpMode = "tp", auLang = "";
  const AU = id => { d.audNotes = d.audNotes || {}; return d.audNotes[id] || (d.audNotes[id] = {html: "", tr: {}, src: {}}) };
  const getNote = (n, j) => !n || !n.id ? "" : tpMode === "tp" ? (d.notes || {})[nk(n.id, j == null ? tpJ : j)] || "" : (d.audNotes || {})[n.id] ? (auLang ? (d.audNotes[n.id].tr || {})[auLang] || "" : d.audNotes[n.id].html || "") : "";
  function drawTP(force){ const n = tpNode(), e = $("#tpe"); if (!e) return; const j = tpMode === "tp" ? tpPress(n) : 0; if (!force && ((keyOf(n) === tpKey && j === tpJ) || document.activeElement === e)) return; if (tpKey && (keyOf(n) !== tpKey || j !== tpJ)) saveTP(); tpKey = keyOf(n); tpJ = j;
    const np = n && tpMode === "tp" ? ownSteps(S, n).length : 0;
    const what = tpMode === "tp" ? "Talking points" : "Audience notes" + (auLang ? " (" + auLang + ")" : "");
    $("#tpt").textContent = n ? what + " · " + (n.lvl === 1 ? "Section " : "") + n.full + " " + n.text + (np > 1 ? ` · Next ${tpJ + 1} of ${np}` : "") : what + " (step into a point first)"; const none = nil(P, n) && !noteText(getNote(n)); e.contentEditable = n && !none ? "true" : "false"; $("#tpbox").classList.toggle("none", none);
    e.dataset.ph = tpMode === "tp" ? (np > 1 ? `What you glance at during this part of ${n.full} (Next ${tpJ + 1} of ${np}): a few short lines. At the end of them, press Next.` : "What you glance at while you talk: a few short lines. Bold, underline and bullets work.") : auLang ? "No " + auLang + " yet. Write the notes in the original, then press ✨ Translate this. You can change the translation here by hand." : "What the audience sees on their phones for this part: the main idea, a verse, a question to think about…";
    if (none) e.dataset.ph = n.full + " has no words yet, so it has no " + (tpMode === "tp" ? "talking points." : "audience notes.");
    $("#tpai").textContent = tpMode === "au" && auLang ? "✨ Draft " + auLang : "✨ Draft"; $("#tpall").hidden = tpMode !== "tp"; $("#tpai").title = tpMode === "tp" ? "The AI drafts short talking points from this part's text" : auLang ? "The AI drafts the " + auLang + " translation of this note and this part's slides, keeping what was already translated" : "The AI drafts audience notes from this part's text";
    e.innerHTML = cleanHTML(getNote(n)); drawAU(n) }
  function saveTP(){ clearTimeout(tpT); const e = $("#tpe"); if (!e) return; let n = P.nodes.find(x => keyOf(x) === tpKey); if (!n) return; const h = cleanHTML(e.innerHTML), has = !!noteText(h);
    if (getNote(n) === (has ? h : "")) return; const s = snapshot(); d.notes = d.notes || {};
    if (!n.id) { if (!has) return; const id = newId(); d.text = d.text.slice(0, n.end - 1) + "|" + id + d.text.slice(n.end - 1); n.id = id; tpKey = id; var redrawText = true }
    if (tpMode === "tp") { const key = nk(n.id, tpJ); if (has) d.notes[key] = h; else delete d.notes[key] }
    else { const a = AU(n.id); if (auLang) { a.tr[auLang] = has ? h : ""; a.ed = a.ed || {}; a.ed[auLang] = true; if (a.src[auLang] == null) a.src[auLang] = a.html } else a.html = has ? h : "" }
    changed(s); if (redrawText) drawText(); drawAU(n) }
  // ---- languages and translations of the audience notes ----
  const trBusy = new Set();
  const stale = (id, L) => { const a = (d.audNotes || {})[id]; return !!(a && noteText(a.html) && (a.src || {})[L] !== a.html) };
  const nodeSlides = n => n ? [...new Set(n.slides.map(x => x.slide).filter(Boolean))] : [];
  const slStale = (sl, lg) => { const src = slSrc(sl); return !!src && (sl.trSrc || {})[lg] !== src };
  function trShow(n){ const r = $("#trrow"); if (!r) return; const a = n && n.id && (d.audNotes || {})[n.id], L = auLang ? [auLang] : (d.languages || []);
    const need = tpMode === "au" && n && n.id ? L.filter(lg => !trBusy.has(n.id + "|" + lg) && ((a && noteText(a.html) && stale(n.id, lg)) || nodeSlides(n).some(sl => slStale(sl, lg)))) : [];
    r.hidden = !need.length; if (need.length) $("#trone").textContent = "✨ Translate into " + need.join(", ") }
  function drawAU(n){ const bar = $("#aubar"); if (!bar) return; bar.hidden = tpMode !== "au"; if (bar.hidden) { trShow(n); return } const L = d.languages || [];
    const st = lg => !n || !n.id || !noteText(((d.audNotes || {})[n.id] || {}).html) ? "" : trBusy.has(n.id + "|" + lg) ? " …" : stale(n.id, lg) ? " ○" : (((d.audNotes || {})[n.id] || {}).ed || {})[lg] ? " ✎" : " ✓";
    bar.innerHTML = `<div class="row"><span class="note">Show:</span><button type="button" class="lgb${auLang ? "" : " on"}" data-lg="">Original</button>${L.map(lg => `<button type="button" class="lgb${auLang === lg ? " on" : ""}" data-lg="${E(lg)}" title="${{"✓": "Translated", "○": "The original changed: needs translating", "✎": "Translated and changed by hand", "…": "Translating…"}[st(lg).trim()] || ""}">${E(lg)}${st(lg)}</button>`).join("")}</div>
      <div class="row"><span class="note">Languages:</span>${L.map(lg => `<span class="lgc">${E(lg)}<i data-rmlg="${E(lg)}" title="Remove this language">×</i></span>`).join("") || '<span class="note">none yet</span>'}<button type="button" class="btn small" id="addlg">+ Add a language</button>${L.length ? `<button type="button" class="btn small aib" id="trall" title="Drafts a translation of every audience note and slide that is new or changed, into every language, keeping what was already translated">✨ Draft all translations</button>` : ""}</div>${L.length ? '<p class="note trwarn">AI translations can have mistakes. Have someone who speaks the language check them before you use them.</p>' : ""}`; trShow(n) }
  // Audience PDFs: made when Norman goes to Stage and something the audience sees changed since the last ones.
  const pdfHash = () => { const t = JSON.stringify([d.title, d.text, d.slides, d.audNotes || {}, d.languages || []]); let h = 5381; for (let i = 0; i < t.length; i++) h = (h * 33 ^ t.charCodeAt(i)) >>> 0; return h.toString(36) };
  const hasAU = () => Object.values(d.audNotes || {}).some(a => noteText(a.html));
  async function makePDFs(){ saveTP(); const hash = pdfHash(), path = "pdf/audience.pdf";
    const b64 = await talkPDF(d, S, (n, m) => setSave(`Making the audience PDF ${n}/${m}…`)); setSave("Saving the audience PDF…");
    let sha = (d.pdf || {}).sha || null, out;
    for (let t = 0; ; t++) { try { out = await GH.put(PATH + "/" + path, b64, sha, "Audience PDF"); break } catch (e) { if ((e.status !== 409 && e.status !== 422) || t >= 3) throw e; await new Promise(r => setTimeout(r, 1500 * (t + 1)));
        if (e.status === 422 || t > 0) { sha = null; try { sha = (await GH.get(PATH + "/" + path)).sha } catch (_) {} } setSave("Saving the audience PDF (trying again)…") } }
    d.pdf = {file: path, at: Date.now(), sha: out}; delete d.pdfs; d.pdfHash = hash; dirty = true; flush() }
  document.querySelectorAll('a[href="present2.html"]').forEach(a => a.addEventListener("click", async e => { if (!hasAU() || d.pdfHash === pdfHash()) return; e.preventDefault();
    if (a.dataset.busy) return; if (!confirm("The slides or audience notes changed since the audience PDF was made. Make a new one now? It takes about a minute.\n\nCancel goes to Stage without it.")) { location.href = a.href; return }
    a.dataset.busy = "1"; try { await makePDFs(); while (dirty || saving) await new Promise(r => setTimeout(r, 200)); location.href = a.href } catch (err) { delete a.dataset.busy; setSave("The PDF wasn't made (" + (err.detail || err.message) + ").", true) } }));
  async function translateSlides(langs, only, force){ const L = langs || d.languages || []; const jobs = [];
    (only || d.slides || []).forEach(sl => { const src = slSrc(sl); if (src) L.forEach(lg => { if (force || (sl.trSrc || {})[lg] !== src) jobs.push([sl, lg, src]) }) });
    if (!jobs.length) return 0; let i = 0, err = null, done = 0; K().toast(`Translating the words on ${new Set(jobs.map(j => j[0])).size} slide(s)…`);
    await Promise.all(Array.from({length: Math.min(4, jobs.length)}, async () => { while (i < jobs.length) { const [sl, lg, src] = jobs[i++];
        try { const j = await K().chat(`Translate the words on one presentation slide into ${lg} for the audience. Keep it as short as the original. Keep the same JSON keys. For a Bible verse ("ref" and "text"), use the Bible translation most used in ${lg} and the usual ${lg} book name in the reference. "bullets" stays one line per bullet, separated by \\n. A person's name stays as it is. Return only the JSON object with the same keys.` + (sl.tr && sl.tr[lg] ? ` There is already a ${lg} translation, maybe improved by a ${lg} speaker: keep its wording wherever it still fits and change only what the new original needs.` : ""), sl.tr && sl.tr[lg] ? `ORIGINAL BEFORE: ${(sl.trSrc || {})[lg] || "(unknown)"}\nEXISTING ${lg.toUpperCase()} TRANSLATION (keep its wording): ${JSON.stringify(sl.tr[lg])}\nNEW ORIGINAL (translate this, same keys): ${src}` : src, {effort: "high"});
          if (slSrc(sl) === src) { const s0 = snapshot(); const o = {}; Object.keys(JSON.parse(src)).forEach(k => { o[k] = String(j[k] || "") }); sl.tr = sl.tr || {}; sl.trSrc = sl.trSrc || {}; sl.tr[lg] = o; sl.trSrc[lg] = src; changed(s0); done++ } } catch (e) { err = e } } }));
    if (err) aiFail(err); return done }
  async function translateNotes(ids, langs, force, quiet){ saveTP(); const L = langs || d.languages || []; if (!L.length) { K().toast("Add a language first."); return } const jobs = [];
    for (const id of ids) for (const lg of L) { const a = (d.audNotes || {})[id]; if (a && noteText(a.html) && (force || stale(id, lg)) && !trBusy.has(id + "|" + lg)) jobs.push([id, lg]) }
    if (!jobs.length) { if (!quiet) K().toast("Everything is translated already ✓"); return }
    const edited = jobs.filter(([id, lg]) => { const a = d.audNotes[id]; return a.ed && a.ed[lg] && noteText((a.tr || {})[lg]) }).length, had = jobs.filter(([id, lg]) => noteText((d.audNotes[id].tr || {})[lg])).length;
    if (had && !confirm(`${had === 1 ? "There is already a translation" : "There are already " + had + " translations"} here${edited ? ` (${edited} changed by hand)` : ""}. They'll be replaced by a new translation of the current notes, keeping your hand-made changes wherever they still fit. Go ahead?`)) return;
    jobs.forEach(([id, lg]) => trBusy.add(id + "|" + lg)); drawAU(tpNode()); let i = 0, err = null;
    await Promise.all(Array.from({length: Math.min(4, jobs.length)}, async () => { while (i < jobs.length) { const [id, lg] = jobs[i++], a = AU(id), src = a.html;
        const prev = noteText((a.tr || {})[lg]) ? a.tr[lg] : "", was = (a.src || {})[lg] || "";
        try { const sys = `Translate notes for an audience into ${lg}. Keep every HTML tag exactly as it is and translate only the words. Use the Bible book names and wording usual in ${lg}. Natural, simple and warm, not word for word. Return JSON {"html": "..."}.`;
          const j = prev ? await K().chat(sys + `\nThere is already a ${lg} translation, and a local speaker may have improved it by hand. Update it to match the NEW original: keep the wording, word choices and style of the existing translation wherever they still fit, change only what the changes to the original need, and translate any new parts in the same style.`,
              `ORIGINAL BEFORE (what the existing translation was made from):\n${was || "(unknown)"}\n\nEXISTING ${lg.toUpperCase()} TRANSLATION (keep its changes):\n${prev}\n\nNEW ORIGINAL (translate this):\n${src}`, {effort: "high"})
            : await K().chat(sys, src, {effort: "high"});
          if (j.html && a.html === src) { const s = snapshot(); a.tr = a.tr || {}; a.src = a.src || {}; a.tr[lg] = cleanHTML(String(j.html)); a.src[lg] = src; if (a.ed) delete a.ed[lg]; changed(s) } } catch (e) { err = e } finally { trBusy.delete(id + "|" + lg) } } }));
    if (err) aiFail(err); else K().toast("Translated ✓ Have someone who speaks the language check it before you use it."); const n = tpNode(); drawAU(n); if (auLang && n && ids.includes(n.id) && document.activeElement !== $("#tpe")) $("#tpe").innerHTML = cleanHTML(getNote(n)) }
  document.addEventListener("click", e => { const t = e.target; if (!t.closest || !t.closest("#aubar, #trrow")) return;
    const lb = t.closest("[data-lg]"); if (lb) { saveTP(); auLang = lb.dataset.lg; drawTP(true); return }
    const rm = t.closest("[data-rmlg]"); if (rm) { const lg = rm.dataset.rmlg; if (!confirm(`Remove ${lg}? Its translations are deleted too.`)) return; const s = snapshot(); d.languages = (d.languages || []).filter(x => x !== lg); Object.values(d.audNotes || {}).forEach(a => { if (a.tr) delete a.tr[lg]; if (a.src) delete a.src[lg] }); if (auLang === lg) auLang = ""; changed(s); drawTP(true); return }
    if (t.closest("#addlg")) { const lg = (prompt("Which language? (for example Tagalog, Cebuano, Spanish, Korean)") || "").replace(/[<>"]/g, "").trim(); if (!lg) return; const nm = lg[0].toUpperCase() + lg.slice(1);
      if ((d.languages || []).some(x => x.toLowerCase() === nm.toLowerCase())) return; const s = snapshot(); d.languages = [...(d.languages || []), nm]; changed(s); drawAU(tpNode()); K().toast(nm + " added. Press ✨ Translate all that changed when the notes are ready."); return }
    if (t.closest("#trall")) { if (!(d.languages || []).length) { K().toast("Add a language first."); return } (async () => { const n = await translateSlides(); if (n) K().toast(`Slide words translated (${n}) ✓`); await translateNotes(Object.keys(d.audNotes || {}), null, false, !!n) })(); return }
    if (t.closest("#trone")) { saveTP(); const n = tpNode(); if (!n || !n.id) { K().toast("Write the notes for this part first."); return } (async () => { const L = auLang ? [auLang] : null; await translateSlides(L, nodeSlides(n)); await translateNotes([n.id], L, false, true); trShow(tpNode()) })(); return }
    if (t.closest("#addqr")) { let nm = "QR code", q = 2; while (d.slides.some(x => x.name === nm)) nm = "QR code " + q++; draft = {name: nm, type: "qr", slideTitle: "Follow along on your phone", slide: "Scan for the slides and notes in your language"}; slideEdit(-1); return } });
  document.addEventListener("input", e => { if (e.target.id === "psq") plist() });
  document.addEventListener("input", e => { if (e.target.id === "tpe") { clearTimeout(tpT); tpT = setTimeout(() => { saveTP(); trShow(tpNode()) }, 700) } });
  document.addEventListener("focusout", e => { if (e.target.id === "tpe") saveTP() });
  document.addEventListener("keydown", e => { if (e.target.id !== "tpe" || e.key !== "Tab") return; e.preventDefault(); document.execCommand(e.shiftKey ? "outdent" : "indent") });
  document.addEventListener("mousedown", e => { const b = e.target.closest(".tpb [data-c]"); if (!b) return; e.preventDefault(); const t = $("#tpe"); if (document.activeElement !== t) t.focus(); document.execCommand(b.dataset.c); clearTimeout(tpT); tpT = setTimeout(saveTP, 400) });
  // ✨ Draft talking points: a set of short lines for each Next press of a part, so he reads down the set, then presses Next for the next set.
  const TP_RULES = `You turn part of a talk into the speaker's talking points: a few memory triggers he glances at on a screen while he speaks from memory. They only remind him what the points of this part are; he knows the details. The part is split into numbered presses: each time he presses Next, the next press's words come up (often with a new slide). For EACH press write its own short set of lines, in the order he says them; when he reaches the last line of a set, he presses Next.
Keep it sparse: about ONE line per paragraph (two only when a paragraph clearly makes two separate points), and fewer is better; never a line for each sentence, detail, example or step of a story. A whole story is one or two lines. Example: a press with a quote and a paragraph about being called to weakness needs only "Watchman Nee Quote" and "Called To Weakness". A press about Peter (first out of the boat, cut off an ear, "even if all fall away", denied Jesus by the fire, wept, broken) needs only "Peter: Strong, No Character", "Failed By The Fire", "God Uses The Broken".
Each line is a short catch phrase of 1 to 5 words, like a heading, never a sentence. Name the story, image or idea so it triggers his memory ("MC's Face", "Dad: He Is Enough"), in Title Case. Use level 1 only (no sub lines) unless a sub line is truly needed. Mark bold at most one line per press, the one that matters most. Plain text only: no asterisks or Markdown.
A press with no words (only a slide) gets one line naming what the slide shows.
Return JSON {"presses": [{"press": 1, "lines": [{"text": "...", "level": 1, "bold": false}]}]} with exactly one entry per press, in order.`;
  const paras = x => (x || "").split(/\n\s*\n/).map(y => y.replace(TAG, " ").trim()).filter(y => y.split(/\s+/).length >= 4).length || 1;
  const pressesOf = n => ownSteps(S, n).map((i, q) => { const st = S[i], raw = st.a != null ? d.text.slice(st.a, st.b) : "", w = plain(raw); return `Press ${q + 1}${w ? ` (${paras(raw)} paragraph${paras(raw) === 1 ? "" : "s"}, so at most ${paras(raw)} line${paras(raw) === 1 ? "" : "s"}, 2 only if it truly has two separate points)` : ""}: ${w || "(no words; the slide \"" + ((st.slide && st.slide.name) || "") + "\" comes up)"}` });
  const canDraft = n => !!n && !nil(P, n) && ownSteps(S, n).some(i => S[i].a != null && words(d.text.slice(S[i].a, S[i].b)) >= 3);
  const unmd = x => String(x || "").replace(/\*\*|__/g, "").replace(/^\s*[-*•]\s+/, "").trim();
  const linesHTML = L => { let h = "<ul>", open2 = false; for (const x of L) { const t = unmd(x.text), li = `<li>${x.bold || /^\*\*.*\*\*$/.test(String(x.text).trim()) ? "<b>" + E(t) + "</b>" : E(t)}`; if (+x.level === 2 && h !== "<ul>") { h += (open2 ? "</li>" : "<ul>") + li; open2 = true } else { h += (open2 ? "</li></ul></li>" : h === "<ul>" ? "" : "</li>") + li; open2 = false } } return h + (open2 ? "</li></ul></li>" : h === "<ul>" ? "" : "</li>") + "</ul>" };
  // returns one HTML set per press of the tag
  async function draftTP(n){ const ps = pressesOf(n), j = await K().chat(TP_RULES, `${brief()}\n\nThis part: ${n.full} ${n.text} (${ps.length} press${ps.length === 1 ? "" : "es"})\n\n${ps.join("\n\n")}`, {effort: "low"});
    const st = ownSteps(S, n), cap = q => { const x = S[st[q]]; return x && x.a != null ? 2 * paras(d.text.slice(x.a, x.b)) : 1 };
    const out = (j.presses || []).slice(0, ps.length).map((x, q) => { let L = ((x && x.lines) || []).filter(y => y && y.text); if (L.length > cap(q)) L = L.filter(y => +y.level !== 2); return linesHTML(L.slice(0, cap(q))) });
    while (out.length < ps.length) { const sl = S[st[out.length]].slide; out.push(linesHTML([{text: (sl && sl.name) || "…"}])) } return out }
  // put drafted sets into the talk (adding ids to tags that have none), replacing the tag's old talking points
  function putDrafts(map){ const s0 = snapshot(); d.notes = d.notes || {}; let t = d.text;
    [...map.keys()].sort((a, b) => b.end - a.end).forEach(n => { let id = n.id; if (!id) { id = newId(); t = t.slice(0, n.end - 1) + "|" + id + t.slice(n.end - 1) }
      Object.keys(d.notes).forEach(x => { if (x === id || x.startsWith(id + ":")) delete d.notes[x] }); map.get(n).forEach((h, q) => { if (noteText(h)) d.notes[nk(id, q)] = cleanHTML(h) }) });
    d.text = t; tpKey = null; changed(s0); drawText(); drawTP(true) }
  $("#tpai").onclick = async () => { const n = P.nodes.find(x => keyOf(x) === tpKey); if (!n) return; if (tpMode === "au") { auDraft(n); return } if (!canDraft(n)) { K().toast(`${n.full} ${n.text} has no text of its own (only what's under it), so there's nothing to draft from.`); return }
    saveTP(); const np = ownSteps(S, n).length, has = n.id && Object.keys(d.notes || {}).some(x => (x === n.id || x.startsWith(n.id + ":")) && noteText(d.notes[x]));
    if (has && !confirm(`Replace the talking points of ${n.full} ${n.text}` + (np > 1 ? ` (all ${np} Next presses)` : "") + "?")) return; const stop = busy("Drafting the talking points…");
    try { putDrafts(new Map([[n, await draftTP(n)]])) } catch (err) { aiFail(err) } finally { stop() } };
  $("#tpall").onclick = async () => { const list = P.nodes.filter(canDraft); if (!list.length) return;
    if (!confirm(`Draft new talking points for all ${list.length} parts, a set for each Next press? This replaces the talking points there now (↶ Undo brings them back).`)) return;
    saveTP(); const k0 = K(), dl = k0.dlg("ai2busy", `<div class="ed"><p class="aimsg" id="abm"></p></div>`); k0.show(dl); const out = new Map(); let done = 0, bad = 0; const m = () => { $("#abm").textContent = `Drafting talking points… ${done} of ${list.length}` + (bad ? ` (${bad} failed)` : "") }; m();
    try { let q = 0; await Promise.all([0, 1, 2, 3].map(async () => { while (q < list.length) { const n = list[q++]; try { out.set(n, await draftTP(n)) } catch (e) { bad++ } done++; m() } }));
      if (!out.size) throw new Error("The AI didn't answer. Try again."); putDrafts(out); k0.toast(`Drafted ${out.size} parts` + (bad ? `; ${bad} failed, so press ✨ Draft all again for those` : "")) }
    catch (err) { aiFail(err) } finally { dl.close() } };
  async function auDraft(n){ if (auLang) { if (!n.id) { K().toast("Write the notes in Original first."); return } saveTP(); await translateSlides([auLang], nodeSlides(n), true); await translateNotes([n.id], [auLang], true, true); trShow(tpNode()); return } const seg = d.text.slice(n.end, n.stop); if (words(seg) < 5) { K().toast(`${n.full} ${n.text} has no text of its own, so there's nothing to draft from.`); return }
    const e = $("#tpe"); if (noteText(e.innerHTML) && !confirm("Replace the audience notes that are there now?")) return; const stop = busy("Drafting the audience notes…");
    try { const j = await K().chat(`You write the notes people in the audience see on their phones while a Christian ministry leader speaks. For this part of the talk: 2 to 5 short lines: the main idea in plain words, any Bible verse he reads (reference and its key words), and if it fits one question to think about. Friendly and clear, no jargon, no retelling of the whole story. Return JSON {"lines": [{"text": "...", "bold": false}]}.`, `${brief()}\n\nThis part: ${n.full} ${n.text}\n\n${plain(seg)}`, {effort: "low"});
      const L = (j.lines || []).filter(x => x && x.text); e.innerHTML = cleanHTML("<ul>" + L.map(x => `<li>${x.bold ? "<b>" + E(x.text) + "</b>" : E(x.text)}</li>`).join("") + "</ul>"); tpKey = keyOf(n); saveTP() } catch (err) { aiFail(err); return } finally { stop() }
    if ((d.languages || []).length && n.id) { await translateSlides(null, nodeSlides(n)); await translateNotes([n.id], null, false, true); trShow(tpNode()) } }
  function side(){ drawTP(); const s = peek ? d.slides.find(x => x.name === peek) : SH[k]; setSlide($(".side .scr"), slideHTML(s, d)); const st = S[k];
    $("#cap").innerHTML = peek ? `Showing ${E(peek)} · Next or Back goes back` : st ? `${st.node ? E(st.node.full + " " + st.node.text) : "Opening"}${s ? ` · ${E(s.name)} <button type="button" class="linkbtn" data-edit="${E(s.name)}">Edit</button>` : ""}` : "";
    $("#epos").textContent = S.length ? (k + 1) + " / " + S.length : "" }
  function redraw(){ $("#tree").innerHTML = treeHTML(P, S, k, false, tpPick ? tpNode() : null); const c = $("#tree .cur"); if (c) { const t = $("#tree"); if (c.offsetTop < t.scrollTop || c.offsetTop > t.scrollTop + t.clientHeight - 30) t.scrollTo({top: c.offsetTop - t.clientHeight / 2}) } side(); plist(); hl(true) }
  function step(i, quiet, keep, picked){ if (LS.on && !keep) stopListen(); if (!picked) { if (tpPick) saveTP(); tpPick = null } peek = null; k = Math.max(0, Math.min(S.length - 1, i)); redraw(); hl(quiet) }
  const stepTo = i => step(i, false, true);
  $("#en").onclick = () => { if (peek) { peek = null; side(); return } step(k + 1) }; $("#eb").onclick = () => { if (peek) { peek = null; side(); return } step(k - 1) };
  document.addEventListener("keydown", e => { if (e.target.closest && e.target.closest("input,textarea,select,[contenteditable='true'],dialog")) return; if (["PageDown", "ArrowRight"].includes(e.key)) { e.preventDefault(); $("#en").click() } else if (["PageUp", "ArrowLeft"].includes(e.key)) { e.preventDefault(); $("#eb").click() } });
  document.addEventListener("click", e => { const tg = e.target;
    const tn = tg.closest("#tree [data-n]"); if (tn) { const nn = P.nodes[+tn.dataset.n], i = firstAt(S, nn); saveTP(); if (nil(P, nn)) { tpPick = null; if (i >= 0) step(i); return } tpPick = keyOf(nn); if (i >= 0) step(i, false, false, true); else drawTP(true); return }
    const nd = tg.closest("#ftext .vchip.nd"); if (nd) { if (dragged) return; saveText(); const v = nd.dataset.ref.match(/^#([1-4])\s*([\s\S]*)$/), ni = [...box().querySelectorAll(".vchip.nd")].indexOf(nd);
      const nn = P.nodes[ni]; nodeEdit({lvl: +v[1], text: nn ? nn.text : (v[2] || ""), node: nn}, nv => { const s = snapshot(); if (!nv) nd.remove(); else nd.dataset.ref = "#" + nv.lvl + " " + nv.text + (nn && nn.id ? "|" + nn.id : ""); d.text = richText(box()); changed(s); drawText() }, true); return }
    const sc = tg.closest("#ftext .vchip.sl"); if (sc) { if (dragged || sc.classList.contains("stop")) return; const nm = sc.dataset.ref; peek = peek === nm ? null : nm; side(); return }
    const pe = tg.closest("[data-edit]"); if (pe) { const i = d.slides.findIndex(x => x.name === pe.dataset.edit); if (i >= 0) slideEdit(i); return }
    const pi = tg.closest(".pi[data-si]"); if (pi) { slideEdit(+pi.dataset.si); return }
    const pr = tg.closest(".pi[data-step]"); if (pr) { step(+pr.dataset.step); return }
    const tb = tg.closest(".ptabs [data-tab]"); if (tb) { panel = tb.dataset.tab; document.querySelectorAll(".ptabs [data-tab]").forEach(x => x.classList.toggle("on", x === tb)); const tpm = panel === "tp" || panel === "au"; $("#tpbox").hidden = !tpm; $("#plist").hidden = tpm; $("#psq").hidden = tpm; $("#sadd").hidden = tpm; if (tpm) { saveTP(); tpMode = panel; drawTP(true) } plist(); return } });
  $("#sadd").onclick = () => slideNew();
  $("#aisp").onclick = () => spellAll().catch(aiFail); $("#lis").onclick = () => listen(); $("#narr").onclick = () => narrate();
  $("#det").onclick = () => { const dl = $("#ndlg"); const f = (k2, lb, ta) => ta ? `<label>${lb}<textarea data-k="${k2}">${E(d[k2])}</textarea></label>` : `<label>${lb}<input data-k="${k2}" value="${E(d[k2])}"></label>`;
    dl.innerHTML = `<form method="dialog" class="ed"><div class="pgh"><b>Talk details</b></div>${f("title", "Title")}${f("audience", "Audience")}<div class="row">${f("length", "Length")}${f("event", "Date / event")}${f("timerMinutes", "Talk length (minutes; also the countdown)")}<label>Your normal speaking speed (words a minute)<input data-k="wpm" type="number" min="60" max="300" step="5" value="${E(d.wpm || 140)}"></label></div>${f("bigIdea", "Big idea", true)}${f("imageStyle", "Picture style for ✨ pictures (one sentence)", true)}<label>Voice<select id="dvoice"><option value="${E(d.voice || "")}">${E(d.voice ? d.voiceName || "Chosen voice" : "Default voice (from ✨ AI keys and voice)")}</option></select></label><p class="note" id="dvm"></p><label>Expressive voice feel<select data-k="v3Feel"><option value=""${d.v3Feel === "natural" ? "" : " selected"}>Steady (keeps your voice the same all the way through)</option><option value="natural"${d.v3Feel === "natural" ? " selected" : ""}>Lively (more feeling, but the voice can drift)</option></select></label><label>Voice style for Listen<select data-k="voiceModel"><option value=""${d.voiceModel === "v3" || d.voiceModel === "v4" ? "" : " selected"}>Standard (steady)</option><option value="v3"${d.voiceModel === "v3" ? " selected" : ""}>Expressive v3 (reads feeling from the text)</option><option value="v4"${d.voiceModel === "v4" ? " selected" : ""}>Expressive v4 (newest: feeling from the text, and it carries the voice from one piece to the next)</option></select></label><div class="row"><button type="button" class="btn small aib" id="aikeys">✨ AI keys and voice</button></div>
      <div class="row"><span style="flex:1"></span><button class="btn small pri" type="submit">Done</button></div></form>`;
    $("#aikeys").onclick = () => { try { K().settings() } catch (e) { aiFail(e) } };
    (async () => { try { const k0 = K(), key = await k0.need("eleven"), why = await k0.voicePick($("#dvoice"), key, d.voice || "", d.voiceName || "", "Default voice (from ✨ AI keys and voice)"); $("#dvm").textContent = why || "" } catch (e) {} })();
    dl.querySelector("form").onsubmit = ev => { ev.preventDefault(); const s = snapshot(); dl.querySelectorAll("[data-k]").forEach(x => { d[x.dataset.k] = x.value }); const vs = $("#dvoice"); if (vs && vs.value !== "__id") { d.voice = vs.value; d.voiceName = vs.value && vs.selectedOptions[0] ? vs.selectedOptions[0].textContent.replace(/ \(yours\)$/, "") : "" } try { K().setVoice(d.voice || ""); K().setV3(d.v3Feel, d.voiceModel) } catch (e) {} dl.close(); changed(s); $(".top h1").firstChild.textContent = d.title + " " };
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
The outline is only a memory hint for stretches of talk, so keep it sparse. Read the whole text and mark where each part starts. Levels: 1 = section (a big part of the talk, usually 5 to 15 minutes), 2 = point (one stretch of talk, usually 30 seconds to 4 minutes, roughly 80 to 600 words; a 2-6 word cue). Use level 3 (sub point) only rarely, when a long point has clearly separate parts, and never level 4. Never mark single sentences or small ideas. Keep every phrase short (2 to 6 words), in his words where possible, in the order of the text. Every point is inside a section. Each starts at the beginning of a sentence.
For each give "start": the first 6 to 10 words of the sentence where it starts, copied exactly from the text.
Return JSON {"outline": [{"level": 1, "text": "...", "start": "..."}]}.`, JSON.stringify({title: d.title, text: PM.x}), {effort: "medium"});
    const L = Array.isArray(j.outline) ? j.outline : []; let from = 0; const out = [];
    for (const q of L) { const text = String(q.text || "").replace(/[\[\]\n]+/g, " ").trim(), lvl = Math.max(1, Math.min(4, Math.round(+q.level) || 2)), w = String(q.start || "").replace(/\s+/g, " ").trim(); if (!text || w.length < 4) continue;
      let at = PM.x.indexOf(w, from); if (at < 0) at = PM.x.toLowerCase().indexOf(w.toLowerCase().split(" ").slice(0, 5).join(" "), from); if (at < 0) continue; out.push({lvl, text, at: PM.map[at]}); from = at + 1 }
    if (!out.length) { $("#olm").textContent = "The AI's outline didn't match the text. Try again."; return }
    let n = [0, 0, 0, 0, 0]; $("#olm").textContent = (has ? `This replaces the ${has} outline tags there now. ` : "") + "Your words and slides stay as they are. Check it, then put it in:";
    $("#olb").innerHTML = `<div class="aisp">` + out.map(o => { n[o.lvl]++; for (let q = o.lvl + 1; q <= 4; q++) n[q] = 0; const lab = o.lvl === 1 ? n[1] : o.lvl === 2 ? n[1] + "." + letter(n[2] - 1) : o.lvl === 3 ? n[3] : letter(n[4] - 1); return `<p style="margin:2px 0 2px ${(o.lvl - 1) * 1.5}em"><b>${E(String(lab))}</b> ${E(o.text)}</p>` }).join("") + `</div>`;
    const ok = $("#olok"); ok.disabled = false; ok.onclick = () => { let sc = clean, shift = 0; for (const o of out) { const at = o.at + shift, tg = "[#" + o.lvl + " " + o.text + "|" + newId() + "]", pre = at > 0 && !/[\n ]/.test(sc[at - 1]) ? " " : "", nl = o.lvl <= 2 ? "\n" : " ";
        const before = o.lvl <= 2 && at > 0 && sc[at - 1] !== "\n" ? "\n" : pre; sc = sc.slice(0, at) + before + tg + nl + sc.slice(at).replace(/^ /, ""); shift += before.length + tg.length + nl.length }
      const s = snapshot(); d.text = sc; dl.close(); changed(s); drawText(); step(0) } }
  // =====================================================================
  // ✨ AI, where it acts: on a slide (picture, verse text, words, spelling), on an outline tag (grammar and flow,
  // tighten, a slide for it, reading cues), on the whole talk (spelling of the text and every slide), and Listen from here.
  // The building blocks (keys, OpenAI, ElevenLabs, ESV) come from ai.js as TALKAI.kit.
  // =====================================================================
  const K = () => { const k = window.TALKAI && TALKAI.kit; if (!k) throw new Error("The AI tools didn't load. Reload the page."); return k };
  try { K().setVoice(d.voice || ""); K().setV3(d.v3Feel, d.voiceModel) } catch (e) {}
  // A video file's length is read once and saved on the slide, so the talk length check counts it (YouTube lengths are typed in the slide).
  (d.slides || []).forEach(sl => { if (!sl || sl.type !== "video" || +sl.secs) return; const u = (sl.url || "").trim() || sl.video || ""; if (!u || /youtu\.?be/.test(u)) return;
    const v = document.createElement("video"); v.preload = "metadata"; v.muted = true; v.onloadedmetadata = () => { const t = Math.round(v.duration); if (t > 0 && isFinite(t) && !+sl.secs) { VDUR[u] = t; const s0 = snapshot(); sl.secs = t; changed(s0) } v.removeAttribute("src"); v.load() }; v.src = u });
  const aiFail = e => { try { K().fail(e) } catch (_) { alert((e && e.message) || "Something went wrong") } };
  const RE_TAG = /\[[^\[\]\n]{1,300}\]/g, isCue = t => !!CUETAG[t.slice(1, -1).trim().toLowerCase()];
  const plain = x => (x || "").replace(RE_TAG, " ").replace(/\s+/g, " ").trim();
  const words = x => plain(x).split(" ").filter(Boolean).length;
  const brief = () => [`Talk: ${d.title}`, d.audience ? "Audience: " + d.audience : "", d.bigIdea ? "Big idea: " + d.bigIdea : "", "Outline: " + P.nodes.filter(n => n.lvl <= 2).map(n => n.lab + " " + n.text).join("; ")].filter(Boolean).join("\n");
  const around = (at, n) => plain((d.text || "").slice(Math.max(0, at - n), at + n));
  const nodeAt = at => { let r = null; for (const n of P.nodes) if (n.at <= at) r = n; return r };
  const firstUse = nm => P.toks.find(x => x.k === "slide" && x.slide.name === nm);
  const RULES = "Keep every [tag] (anything in square brackets) exactly as written and in the same place in the sentence. Spoken style: keep the speaker's voice, wording and personality.";
  // One walk-through for any list of suggested changes: Accept, Reject, Accept all. done(accepted) applies them.
  function review(title, changes, done){ const k0 = K(); if (!changes.length) { k0.toast("No changes needed ✓"); return } let i = 0;
    const dl = k0.dlg("ai2rev", `<div class="ed"><div class="pgh"><b id="arh"></b><button type="button" class="btn small" data-x>Close</button></div><div id="arb"></div>
      <div class="row"><button type="button" class="btn small" id="arback">← Back</button><span style="flex:1"></span><button type="button" class="btn small" id="arrej">Reject</button><button type="button" class="btn small pri" id="aracc">Accept</button><button type="button" class="btn small" id="arall">Accept all the rest</button></div></div>`, "wide");
    const tg = h => h.replace(/\[([^\[\]\n]{1,300})\]/g, (a, r) => `<span class="aitag">${/^#[1-4]/.test(r) ? r.replace(/^#(\d)\s*/, "$1 ") : r}</span>`);
    const draw = () => { if (i >= changes.length) { dl.close(); return } const c = changes[i];
      $("#arh").textContent = `${title} · ${i + 1} of ${changes.length}${c.label ? " · " + c.label : ""}`;
      $("#arb").innerHTML = (c.pre ? `<p class="aictx">${tg(E(c.pre))}</p>` : "") + `<p class="aichg">${tg(c.after ? k0.wdiff(c.before, c.after) : `<del>${E(c.before)}</del>`)}</p>` + (c.post ? `<p class="aictx">${tg(E(c.post))}</p>` : "") + (c.why ? `<p class="note">${E(c.why)}</p>` : "") + (c.ok != null ? `<p class="note">${c.ok ? "Accepted ✓" : "Rejected"}</p>` : "");
      $("#arback").disabled = i === 0 };
    const fin = () => { const acc = changes.filter(c => c.ok); if (acc.length) { done(acc); k0.toast(`${acc.length} change${acc.length > 1 ? "s" : ""} put in ✓`) } };
    dl.querySelector("[data-x]").onclick = () => dl.close(); $("#aracc").onclick = () => { changes[i].ok = true; i++; draw() }; $("#arrej").onclick = () => { changes[i].ok = false; i++; draw() };
    $("#arback").onclick = () => { if (i > 0) { i--; draw() } }; $("#arall").onclick = () => { for (; i < changes.length; i++) if (changes[i].ok == null) changes[i].ok = true; dl.close() };
    dl.addEventListener("close", fin, {once: true}); draw(); k0.show(dl) }
  // A busy note while the AI works.
  function busy(label){ const k0 = K(), dl = k0.dlg("ai2busy", `<div class="ed"><p class="aimsg" id="abm"></p></div>`); const stop = k0.ticker($("#abm"), label); k0.show(dl); return () => { stop(); dl.close() } }
  // Line by line changes to the text from a to b (lines with words in them), checked so the tags stay as they were.
  async function lineEdit(a, b, mode, opt = {}){ const t0 = d.text || "", seg = t0.slice(a, b), L = seg.split("\n"), items = [];
    L.forEach((x, i) => { if (words(x) >= 3) items.push({i, text: x}) }); if (!items.length) { K().toast("There's no text there yet."); return }
    const tagsKept = (x, y) => { const f = s => (s.match(RE_TAG) || []).filter(q => mode !== "cues" || !isCue(q)).join("|"); return f(x) === f(y) };
    const ask = {
      grammar: `Fix spelling, grammar and punctuation, and smooth the flow where a sentence is awkward or a transition is missing. Don't rewrite lines that are fine. ${RULES}`,
      spelling: `Fix only spelling mistakes, typos and clearly missing or doubled words. Do not change style, grammar choices, punctuation style or wording otherwise. ${RULES}`,
      tighten: `The speaker wants this part to take about ${opt.minutes} minutes when spoken (about ${opt.target} words; it is ${opt.now} words now). Tighten it: cut repetition and side remarks, shorten long lines, and you may drop a whole line (text "") if it holds no [tag]. Keep the stories, the key ideas and his voice. ${RULES}`,
      cues: `Add reading cue tags where a good speaker would change delivery: ${Object.values(CUETAG).map(c => "[" + c.ref + "]").join(" ")}. A cue lasts until [Normal]. Use them sparingly, a few per minute at most, mostly [Pause] before a key line and [Slow] for a line that should land. Never change, add or remove any words or other tags.`}[mode];
    const batches = []; let cur = [], len = 0; for (const it of items) { if (len > 5000 && cur.length) { batches.push(cur); cur = []; len = 0 } cur.push(it); len += it.text.length } if (cur.length) batches.push(cur);
    const stop = busy(mode === "spelling" ? "Checking the spelling…" : mode === "tighten" ? "Tightening…" : mode === "cues" ? "Adding reading cues…" : "Checking grammar and flow…");
    const out = []; try { let i = 0; await Promise.all(Array.from({length: Math.min(4, batches.length)}, async () => { while (i < batches.length) { const bt = batches[i++];
        const j = await K().chat(`You help a Christian ministry leader polish the full text of a talk he gives out loud. ${ask}\nReturn JSON {"changes": [{"i": line number, "text": "the whole new line", "why": "a few words"}]} with only the lines you changed.`,
          `${brief()}\n\nLines (JSON):\n${JSON.stringify(bt)}`, {effort: mode === "spelling" ? "low" : "medium"});
        for (const c of (j.changes || [])) { const src = bt.find(x => x.i === +c.i); if (!src) continue; const after = String(c.text == null ? "" : c.text).replace(/\n+/g, " ");
          if (after === src.text || !tagsKept(src.text, after)) continue; if (mode === "cues" && plain(after) !== plain(src.text)) continue; if (!after.trim() && mode !== "tighten") continue;
          out.push({i: src.i, before: src.text, after, why: c.why || "", label: (nodeAt(a + seg.split("\n").slice(0, src.i).join("\n").length) || {}).lab || ""}) } } })) }
    catch (e) { stop(); aiFail(e); return } stop();
    out.sort((x, y) => x.i - y.i); out.forEach(c => { let p = c.i - 1; while (p >= 0 && !L[p].trim()) p--; let n = c.i + 1; while (n < L.length && !L[n].trim()) n++; c.pre = p >= 0 ? L[p] : ""; c.post = n < L.length ? L[n] : "" });
    if (opt.extra) out.push(...opt.extra);
    review({grammar: "✨ Grammar and flow", spelling: "✨ Spelling", tighten: "✨ Tighten", cues: "✨ Reading cues"}[mode], out, acc => {
      const s = snapshot(), lines = acc.filter(c => c.i != null), others = acc.filter(c => c.apply);
      if (lines.length) { const now = d.text || "", at = now.slice(a, b) === seg ? a : now.indexOf(seg); if (at < 0) { K().toast("The text changed meanwhile, so the text changes weren't put in.", true) }
        else { const M = seg.split("\n"); for (const c of lines) if (M[c.i] === c.before) M[c.i] = c.after; let ns = M.join("\n"); if (mode === "tighten") ns = ns.replace(/\n{3,}/g, "\n\n"); d.text = now.slice(0, at) + ns + now.slice(at + seg.length) } }
      others.forEach(c => c.apply()); changed(s); drawText() }) }
  // ---- on an outline tag ----
  async function tighten(n){ const now = words(d.text.slice(n.end, n.last)), m = prompt(`${n.lab} ${n.text} is about ${now} words, roughly ${Math.max(1, Math.round(now / wpmOf(d) * 2) / 2)} minutes. How many minutes should it be?`, String(Math.max(.5, Math.round(now / 140 * 0.7 * 2) / 2)));
    if (!m || !(+m > 0)) return; await lineEdit(n.end, n.last, "tighten", {minutes: +m, target: Math.round(+m * wpmOf(d)), now}) }
  async function slideFor(n){ const seg = d.text.slice(n.end, n.last); if (words(seg) < 20) { K().toast("Add some text to this part first."); return } const stop = busy("Thinking of a slide…"); let j;
    try { j = await K().chat(`You design one slide for a part of a talk by a Christian ministry leader. Slides show a few strong words, never the script. Pick the best kind: "image" (a picture with a short title and optional subtitle), "quote" (a striking line someone said), "bullets" (2-4 very short lines), or "verse" (only if a Bible verse is read there).
Return JSON {"name": "2-4 word unique name", "type": "image|quote|bullets|verse", "eyebrow": "", "slideTitle": "", "slide": "subtitle", "bullets": "lines separated by \\n", "quote": "", "by": "", "ref": "verse reference", "start": "the first 6-10 words of the sentence where the slide should come up, copied exactly from the text"}`,
      `${brief()}\nExisting slide names: ${d.slides.map(s => s.name).join(", ")}\n\nThe part (${n.lab} ${n.text}):\n${plain(seg)}`, {effort: "low"}) } catch (e) { stop(); aiFail(e); return } stop();
    let nm = String(j.name || "Slide").replace(/[\[\]\n]+/g, " ").trim() || "Slide", q = 2; const base = nm; while (d.slides.some(s => s.name === nm) || CUETAG[nm.toLowerCase()] || /^stop$/i.test(nm)) nm = base + " " + q++;
    const ty = TYPES[j.type] ? j.type : "image", o = {name: nm, type: ty};
    if (ty === "verse") Object.assign(o, {ref: j.ref || "", text: "", version: "ESV"}); else if (ty === "quote") Object.assign(o, {quote: j.quote || "", by: j.by || ""}); else Object.assign(o, {eyebrow: j.eyebrow || "", slideTitle: j.slideTitle || "", slide: j.slide || "", bullets: j.bullets || "", layout: "left", image: ""});
    if (ty === "verse" && o.ref) { try { o.text = await K().esvText(o.ref) || "" } catch (e) {} }
    // where it goes: the start of the sentence the AI named, else right after the tag
    let at = n.end; const w = String(j.start || "").replace(/\s+/g, " ").trim().toLowerCase().split(" ").slice(0, 5).join(" ");
    if (w.length > 6) { let x = "", map = []; for (let i = n.end; i < n.last; i++) { const c = d.text[i]; if (c === "[") { const e = d.text.indexOf("]", i); if (e > 0) { i = e; continue } } const ch = /\s/.test(c) ? " " : c.toLowerCase(); if (ch === " " && x.endsWith(" ")) continue; x += ch; map.push(i) }
      const f = x.indexOf(w); if (f >= 0) at = map[f] }
    draft = o; slideEdit(-1, name => { const s = snapshot(); d.text = d.text.slice(0, at) + "[" + name + "]" + (at === n.end ? "\n" : " ") + d.text.slice(at); changed(s); drawText() }) }      // Save puts it in the text
  function nodeAI(n, act){ saveText(); n = P.nodes.find(x => x.at === n.at) || n; const run = {flow: () => lineEdit(n.end, n.last, "grammar"), tight: () => tighten(n), slide: () => slideFor(n), cues: () => lineEdit(n.end, n.last, "cues")}[act]; if (run) Promise.resolve(run()).catch(aiFail) }
  // ---- on the whole talk ----
  const SLF = {image: ["eyebrow", "slideTitle", "slide"], bulletsimg: ["slideTitle", "bullets"], bullets: ["slideTitle", "bullets"], plain: ["eyebrow", "slideTitle", "slide"], quote: ["quote", "by"]};
  async function slideSpell(list){ const items = []; list.forEach(o => (SLF[o.type || "image"] || []).forEach(f => { if ((o[f] || "").trim()) items.push({id: d.slides.indexOf(o) + "." + f, text: o[f]}) }));
    if (!items.length) return []; const j = await K().chat(`Fix only spelling mistakes and typos in these slide texts. Don't change wording, style or line breaks otherwise. Return JSON {"changes": [{"id": "...", "text": "..."}]} with only the ones you changed.`, JSON.stringify(items), {effort: "low"});
    return (j.changes || []).map(c => { const it = items.find(x => x.id === c.id); if (!it || !c.text || c.text === it.text) return null; const [si, f] = it.id.split("."), o = d.slides[+si];
      return {before: it.text, after: String(c.text), label: "Slide " + o.name, apply: () => { if (o[f] === it.text) o[f] = String(c.text) }} }).filter(Boolean) }
  async function spellAll(){ saveText(); let extra = []; const stop = busy("Checking the slides…"); try { extra = await slideSpell(d.slides) } catch (e) { stop(); aiFail(e); return } stop(); await lineEdit(0, (d.text || "").length, "spelling", {extra}) }
  // ---- on a slide ----
  function slideAIRow(o){ const ty = o.type || "image", b = (a, t, tip) => `<button type="button" class="btn small aib" data-ai2="${a}" title="${E(tip || "")}">${t}</button>`;
    return `<div class="row ai2row">${ty === "verse" ? b("verse", "✨ Get the verse text", "The AI fills in the text for this reference and version; check it, and you can still change it") : ""}${ty === "image" || ty === "bulletsimg" ? b("pic", o.image ? "✨ Change the picture" : "✨ Create a picture") : ""}${SLF[ty] ? b("words", "✨ Suggest the words", "From the text where this slide is used") + b("spell", "✨ Check spelling") : ""}</div>` }
  async function slideAI(i, act){ const o = i < 0 ? draft : d.slides[i]; if (!o) return; const k0 = K(), oS = editCtx && editCtx.onSave, redo = () => slideEdit(i, oS), changed = s => { if (i >= 0) changed0(s) }, use = firstUse(o.name), ctx = use ? around(use.at, 1400) : "", nd = use ? use.node : null;
    if (act === "verse") { let ref = (o.ref || "").trim(); const ver = ((o.version || "").trim().replace(/\s*\(check\)$/i, "")) || "ESV"; if (!ref) { k0.toast("Type a reference, or some words from the verse"); return }
      // not a reference (like "John 15:5" or "1 Cor 13:4-7")? then it's words from the verse: offer the 5 likeliest verses
      if (!/^\s*(?:[1-3]\s*)?[A-Za-z][A-Za-z. ]{1,24}\s+\d{1,3}(?::\d{1,3}(?:\s*[-–]\s*\d{1,3}(?::\d{1,3})?)?)?\s*$/.test(ref)) {
        const st0 = busy("Finding the verse…"); let L = [];
        try { const j = await k0.chat(`The speaker remembers some words or the idea of a Bible verse but not the reference. Find the 5 verses (or short passages) he most likely means, best match first. Return JSON {"options": [{"ref": "Book chapter:verse(s), book name written out", "line": "the key words of that verse in the ${ver}, one short line"}]}.`, ref, {effort: "low"}); L = (j.options || []).filter(x => x && x.ref).slice(0, 5) } catch (e) { st0(); aiFail(e); return } st0();
        if (!L.length) { k0.toast("No verse found for those words. Try other words."); return }
        const pick = await new Promise(ok => { const dv = k0.dlg("ai2vpick", `<div class="ed"><div class="pgh"><b>Which verse?</b><button type="button" class="btn small" data-x>Cancel</button></div><p class="note">For “${E(ref)}”</p><div class="vpick">${L.map((x, q) => `<button type="button" data-q="${q}"><b>${E(x.ref)}</b><span>${E(x.line || "")}</span></button>`).join("")}</div></div>`);
          let done = false; dv.onclick = e => { const b = e.target.closest("[data-q]"); if (b) { done = true; dv.close(); ok(L[+b.dataset.q].ref) } else if (e.target.closest("[data-x]")) dv.close() }; dv.addEventListener("close", () => { if (!done) ok(null) }, {once: true}); k0.show(dv) });
        if (!pick) return; const old = o.ref; ref = String(pick).trim(); o.ref = ref;
        if (o.name === old || /^Verse \d+$/.test(o.name)) { if (!d.slides.some(x => x !== o && x.name === ref)) { if (i >= 0) renameIn(o.name, ref); o.name = ref } } }
      const stop = busy("Getting " + ref + " (" + ver + ")…");
      try { const j = await k0.chat(`Quote the Bible passage word for word in the ${ver} translation. Plain text, no verse numbers, no headings, no reference. Keep the translation's own wording and punctuation exactly. Return JSON {"text": "...", "ref": "the reference written out in full, e.g. John 15:5"}.`, ref + " (" + ver + ")", {effort: "low"});
        if (j.text) { const s = snapshot(); o.text = String(j.text).trim(); o.version = ver; o.aiText = true; changed(s); if (i >= 0) drawText(); redo() } } catch (e) { aiFail(e) } finally { stop() } return }
    if (act === "words") { const fl = SLF[o.type || "image"]; const stop = busy("Writing the slide…");
      try { const j = await k0.chat(`You write the words on one presentation slide for a talk by a Christian ministry leader. Slides show a few strong words, never the script: a title of 2-7 words, an optional short subtitle, an optional small line on top; bullets are 2-4 lines of 1-5 words; a quote is one striking sentence and who said it. Return JSON with only these fields: ${fl.join(", ")}.`,
          `${brief()}\nSlide name: ${o.name}\nKind: ${TYPES[o.type || "image"]}\nNow: ${JSON.stringify(Object.fromEntries(fl.map(f => [f, o[f] || ""])))}\nThe point: ${nd ? nd.full + " " + nd.text : "(not in the text yet)"}\nThe words around where it comes up:\n${ctx || "(not used in the text yet)"}`, {effort: "low"});
        const s = snapshot(); fl.forEach(f => { if (j[f] != null) o[f] = Array.isArray(j[f]) ? j[f].join("\n") : String(j[f]) }); changed(s); redo() } catch (e) { aiFail(e) } finally { stop() } return }
    if (act === "spell") { const stop = busy("Checking…"); let ch; try { ch = await slideSpell([o]) } catch (e) { stop(); aiFail(e); return } stop(); review("✨ Spelling · " + o.name, ch, acc => { const s = snapshot(); acc.forEach(c => c.apply()); changed(s); redo() }); return }
    if (act === "pic") picture(i, ctx, nd) }
  function picture(i, ctx, nd){ const k0 = K(), o = i < 0 ? draft : d.slides[i], oS = editCtx && editCtx.onSave, changed = s => { if (i >= 0) changed0(s) }, slideEdit = (j) => slideEdit0(j, oS); let results = [];
    const dl = k0.dlg("ai2pic", `<div class="ed"><div class="pgh"><b>✨ Picture · ${E(o.name)}</b><button type="button" class="btn small" data-x>Close</button></div>
      <div class="aiimg"><div class="aicur">${o.image ? `<img alt="Current picture" src="${E(LOCALIMG[o.image] || o.image)}"><label class="chk"><input type="checkbox" id="a2base" checked> Start from this picture</label>` : '<div class="aiempty">No picture yet</div>'}</div>
      <div class="aiask"><label>What do you want? (or leave it empty)<textarea id="a2want" rows="3" placeholder="e.g. A potter's hands shaping clay, warm light. Or: same scene at sunrise."></textarea></label>
      <div class="row"><button type="button" class="btn small pri" id="a2go">Create 2 pictures</button><span class="aimsg" id="a2m"></span></div></div></div>
      <div id="a2res" hidden><div class="aires" id="a2r"></div><label>Prompt used (change it and try again)<textarea id="a2p" rows="4"></textarea></label><div class="row"><span style="flex:1"></span><button type="button" class="btn small" id="a2again">Try again with this prompt</button></div></div>
      ${o.prevImage ? `<div class="row"><button type="button" class="btn small" id="a2undo">↶ Go back to the previous picture</button></div>` : ""}</div>`, "wide");
    dl.querySelector("[data-x]").onclick = () => dl.close();
    const base = () => !!($("#a2base") && $("#a2base").checked && o.image);
    async function make(pr){ const b = $("#a2go"), st = k0.ticker($("#a2m"), pr ? "Making 2 pictures (about a minute)…" : "Writing the prompt…"); b.disabled = true;
      try { if (!pr) { const sty = k0.styleOf(d); const j = await k0.chat(`You write prompts for an image model. ${k0.PIC_RULES}\nReturn JSON {"prompt": "..."}: one rich, concrete prompt of 80-160 words: scene, subject, setting, light, mood and composition, grounded in the meaning of this part of the talk. If the request is short, fill in good choices; never contradict it.`,
            `Speaker's request: ${$("#a2want").value.trim() || "(none; choose the best picture for this slide)"}\nSlide text (goes on top, do not draw it): ${[o.eyebrow, o.slideTitle, o.slide, o.bullets].filter(Boolean).join(" / ") || "(none)"}\n${k0.placeNote(o)}\n${sty ? "The talk's picture style (follow it): " + sty + "\n" : ""}${base() ? "The slide's current picture is sent with the prompt: edit it, keep what the speaker didn't ask to change.\n" : ""}${o.imagePrompt ? "Prompt used for the current picture: " + o.imagePrompt + "\n" : ""}The point: ${nd ? nd.full + " " + nd.text : ""}\nThe words around the slide:\n${ctx || "(not used in the text yet)"}\n\n${brief()}`, {effort: "low"});
          pr = String(j.prompt || "").trim(); $("#a2p").value = pr; st(); $("#a2m").textContent = ""; return make(pr) }
        const imgs = []; if (base()) { const bl = await k0.picBlob(o.image); if (bl) imgs.push(bl) } const full = pr + "\n\n" + k0.PIC_RULES;
        results = (await Promise.all([k0.image(full, imgs, 1), k0.image(full, imgs, 1)])).flat();
        $("#a2r").innerHTML = results.map((u, q) => `<button type="button" data-pick="${q}"><img alt="Option ${q + 1}" src="${u}"><span>Use this one</span></button>`).join(""); $("#a2res").hidden = false }
      catch (e) { aiFail(e) } finally { st(); b.disabled = false; $("#a2m").textContent = "" } }
    $("#a2go").onclick = () => make(null); $("#a2again").onclick = () => make($("#a2p").value.trim());
    $("#a2r").onclick = async e => { const b = e.target.closest("[data-pick]"); if (!b) return; b.disabled = true; b.querySelector("span").textContent = "Saving…";
      try { const path = await k0.savePic("v2", results[+b.dataset.pick]); const s = snapshot(); if (o.image) o.prevImage = o.image; o.imagePrompt = $("#a2p").value.trim(); o.image = path; changed(s); dl.close(); slideEdit(i); k0.toast("Picture saved to the slide ✓") }
      catch (err) { b.disabled = false; b.querySelector("span").textContent = "Use this one"; aiFail(err) } };
    if ($("#a2undo")) $("#a2undo").onclick = () => { const s = snapshot(); o.image = o.prevImage; o.prevImage = ""; changed(s); dl.close(); slideEdit(i) };
    k0.show(dl); $("#a2want").focus() }
  document.addEventListener("click", e => { const b = e.target.closest("[data-ai2]"); if (!b) return; const i = +($("#sdlg").dataset.si); slideAI(i, b.dataset.ai2).catch(aiFail) });
  // ---- Listen from here: reads each stretch of text in the talk's voice and steps along as it goes ----
  const LS = {on: false, run: 0, au: null, paused: false, rate: 1}; try { LS.rate = +localStorage.getItem("listen-rate") || 1 } catch (e) {}
  // How a stretch is read. A cue covers the next sentence only, then the voice goes back by itself ([Normal] still ends it early).
  // Pieces are only split where the voice really changes, so it doesn't jump at tags. The expressive voice (v3) gets one piece with the cues inside.
  const V3TAG = {excited: "[excited]", exclaim: "[excited]", calm: "[calm]", gentle: "[softly]", slow: "[slowly]", fast: "[quickly]", pause: "...", "long pause": "[long pause]"};
  const clean = x => x.replace(RE_TAG, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n");
  function partsOf(st, F){ const A = st.a, t = d.text.slice(A, st.b), k0 = K(); F = Math.max(0, (F == null ? A : F) - A);
    if (F > 0) { let q = F; while (q > 0 && !/[.!?…\n]/.test(t[q - 1])) q--; F = q }      // from the start of the sentence the cursor is in
    const pairEnd = x => { const y = x.pair != null ? P.toks[x.pair] : null; return y ? y.at - A : -1 };
    const cueToks = P.toks.filter(x => x.k === "cue" && x.at >= A && x.at < st.b);
    if (d.voiceModel === "v3" || d.voiceModel === "v4") { let x = "", p = 0; for (const c of cueToks) { if (c.at - A >= F) x += t.slice(Math.max(p, F), c.at - A) + (c.close ? " " : " " + (V3TAG[c.cue.cue] || "") + " "); p = c.end - A } x += t.slice(Math.max(p, F));
      x = x.replace(RE_TAG, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
      const out = []; while (x.length > 2800) { let cut = x.lastIndexOf(". ", 2800); if (cut < 800) cut = 2800; out.push({say: x.slice(0, cut + 1).trim(), v3: true}); x = x.slice(cut + 1) } if (x.trim()) out.push({say: x.trim(), v3: true}); return out }
    const out = [], N = {speed: "", tone: ""};
    // the words from a0 to b0 as they're read (tags out, spaces tidied), with where each letter sits in the text (to light up the word being read)
    const cm = (a0, b0) => { let x = "", map = [], ws = ""; const tg = [...t.slice(a0, b0).matchAll(RE_TAG)].map(m => [a0 + m.index, a0 + m.index + m[0].length]); let ti = 0;
      for (let j = a0; j < b0; j++) { if (ti < tg.length && j === tg[ti][0]) { j = tg[ti][1] - 1; ti++; ws += " "; continue } const c = t[j];
        if (/\s/.test(c)) { ws += c; continue } if (ws) { x += /\n/.test(ws) ? "\n" : " "; map.push(A + j - 1); ws = "" } x += c; map.push(A + j) }
      if (ws) { x += /\n/.test(ws) ? "\n" : " "; map.push(A + b0 - 1) } return {x, map} };
    const add = (a0, b0, m) => { a0 = Math.max(a0, F); if (b0 <= a0) return; const c = cm(a0, b0); if (!c.x.trim()) { const l = out[out.length - 1]; if (l && !l.pause) { l.say += c.x; l.map.push(...c.map) } return }
      const vs = k0.voiceOf(m), last = out[out.length - 1]; if (last && !last.pause && JSON.stringify(last.vs) === JSON.stringify(vs)) { last.say += c.x; last.map.push(...c.map) } else out.push({say: c.x, map: c.map, vs}) };
    let pos = 0, cue = null, until = -1;      // cue: the voice after a cue tag; until: where it ends (its end tag), or -1 for "the next sentence"
    const flush = to => { if (!cue) { add(pos, to, N); pos = to; return }
      if (until >= 0) { add(pos, to, cue); pos = to; return }
      const x = t.slice(pos, to).replace(RE_TAG, q => " ".repeat(q.length)), m = x.match(/^[\s\S]*?(?:[.!?…]+["”’)]*(?=\s|$)|\n)/);
      if (!m) { add(pos, to, cue); pos = to; return } add(pos, pos + m[0].length, cue); cue = null; add(pos + m[0].length, to, N); pos = to };
    for (const c of cueToks) { flush(c.at - A); pos = c.end - A; const q = c.cue.cue;
      if (c.close) { cue = null; until = -1; continue }
      if (q === "pause" || q === "long pause") { if (c.at - A >= F) out.push({pause: q === "pause" ? 1.2 : 2.5}); continue }
      if (q === "normal") { cue = null; continue }
      cue = {...(cue || N)}; if (q === "slow" || q === "fast") cue.speed = q; else cue.tone = q; until = pairEnd(c) }
    flush(t.length); out.forEach(o => { if (!o.say) return; const l = o.say.length - o.say.trimStart().length; o.say = o.say.slice(l); o.map = o.map.slice(l); const r = o.say.length - o.say.trimEnd().length; if (r) { o.say = o.say.slice(0, -r); o.map = o.map.slice(0, -r) } }); return out.filter(o => o.pause || o.say) }
  // A spot in d.text as a spot in the text box (the reverse of richText).
  function domAt(abs){ const b = box(); if (!b) return null; let len = 0, last = "", hit = null;
    const walk = n => { for (const c of n.childNodes) { if (hit) return;
        if (c.nodeType === 3) { const v = c.nodeValue.replace(/\u200b/g, ""); if (abs <= len + v.length && v.length) { let q = 0, cnt = 0; while (q < c.nodeValue.length && cnt < abs - len) { if (c.nodeValue[q] !== "\u200b") cnt++; q++ } hit = [c, q]; return } len += v.length; if (v) last = v[v.length - 1] }
        else if (c.nodeType === 1) { if (c.classList.contains("vchip")) { len += c.dataset.ref.length + 2; last = "]" } else if (c.tagName === "BR") { len++; last = "\n" }
          else { if (/^(DIV|P)$/.test(c.tagName) && !c.dataset.seg && len && last !== "\n") { len++; last = "\n" } walk(c) } } } };
    walk(b); return hit }
  function wordLight(p, au, starts){ cancelAnimationFrame(LS.raf); const clear = () => { try { CSS.highlights && CSS.highlights.delete("kpword") } catch (e) {} };
    if (!starts || !p.map || !window.Highlight || !CSS.highlights || !box()) { clear(); return } let lastW = -1;
    const tick = () => { if (LS.au !== au) { clear(); return } LS.raf = requestAnimationFrame(tick); const tm = au.currentTime; let lo = 0, hi = Math.min(starts.length, p.say.length) - 1; if (hi < 0) return;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= tm) lo = mid; else hi = mid - 1 } let a = lo; while (a > 0 && /\S/.test(p.say[a - 1])) a--; let e = lo; while (e < p.say.length && /\S/.test(p.say[e])) e++;
      if (a === lastW || e <= a) return; lastW = a; const x = domAt(p.map[a]), y = domAt(p.map[e - 1] + 1); if (!x || !y) return;
      try { const r = document.createRange(); r.setStart(x[0], x[1]); r.setEnd(y[0], y[1]); CSS.highlights.set("kpword", new Highlight(r)) } catch (err) {} };
    tick() }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function lbar(){ let el = $("#lbar"); if (!LS.on) { if (el) el.remove(); return } if (!el) { el = document.createElement("div"); el.id = "lbar"; document.body.appendChild(el);
      el.onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.l === "stop") stopListen(); else { LS.paused = !LS.paused; if (LS.au) LS.paused ? LS.au.pause() : LS.au.play(); lbar() } } }
    el.innerHTML = `<span>${LS.wait ? "⏳ Getting the voice for" : "🔊 Listening"} · ${E(S[k] && S[k].node ? S[k].node.full : "")}</span><button type="button" class="btn small" data-l="pause">${LS.paused ? "▶ Go on" : "❚❚ Pause"}</button><select id="lrate" title="Speed">${[.75, .9, 1, 1.15, 1.3, 1.5, 1.75, 2].map(r => `<option value="${r}"${r === LS.rate ? " selected" : ""}>${r}×</option>`).join("")}</select><button type="button" class="btn small" data-l="stop">■ Stop</button>`;
    el.querySelector("#lrate").onchange = e => { LS.rate = +e.target.value || 1; try { localStorage.setItem("listen-rate", LS.rate) } catch (x) {} if (LS.au) LS.au.playbackRate = LS.rate } }
  function stopListen(){ try { CSS.highlights && CSS.highlights.delete("kpword") } catch (e) {} LS.on = false; LS.run++; LS.paused = false; LS.wait = false; if (LS.au) { LS.au.pause(); LS.au = null } lbar() }
  let caretPos = null;      // the last spot of the cursor in the text (Listen starts there)
  document.addEventListener("selectionchange", () => { const b = box(), sl = getSelection(); if (!b || !sl.rangeCount || !b.contains(sl.anchorNode) || LS.on) return; caretPos = {node: sl.getRangeAt(0).startContainer, off: sl.getRangeAt(0).startOffset} });
  // The narrated version: every step read in the AI voice and saved (voice/*.mp3 + narration2.json); slides2.html?play plays it for anyone with the link.
  const share = () => new URL("slides2.html?play", location.href.replace(/[?#].*$/, "")).href;
  function narrate(){ const k0 = K(), dl = k0.dlg("narr2", `<div class="ed"><div class="pgh"><b>🔊 Narrated version (share link)</b><button type="button" class="btn small" data-x>Close</button></div>
      <p class="note">This reads the whole talk in the AI voice, with your reading cues, and saves it with the talk. Anyone with the link then watches the slides while the voice reads and moves them on. Parts you already heard with ▶ Listen, or that haven't changed since last time, are reused, so only new or changed words use ElevenLabs credits. A different voice reads everything fresh.</p>
      <p class="aimsg" id="nm"></p><div class="row"><button type="button" class="btn pri" id="ngo">Make the narrated version</button></div>
      <div id="nl" hidden><p class="note">Share this link (it updates about a minute after it's made):</p><div class="row"><input id="nu" readonly value="${E(share())}" style="flex:1"><button type="button" class="btn small" id="nc">Copy</button><a class="btn small" href="${E(share())}" target="_blank" rel="noopener">Open</a></div></div></div>`);
    dl.querySelector("[data-x]").onclick = () => dl.close(); k0.show(dl);
    $("#nc").onclick = () => { $("#nu").select(); try { navigator.clipboard.writeText(share()) } catch (e) { document.execCommand("copy") } k0.toast("Link copied") };
    GH.get(PATH + "/narration2.json").then(g => { const n = JSON.parse(g.text); $("#nm").textContent = "Last made " + new Date(n.made).toLocaleString() + ". Make it again after you change the talk."; $("#nl").hidden = false }).catch(() => {});
    $("#ngo").onclick = async () => { const b = $("#ngo"), m = $("#nm"); b.disabled = true; saveText();
      try { if (!token()) throw new Error("Saving needs the GitHub sign-in on this page first."); k0.setVoice(d.voice || ""); k0.setV3(d.v3Feel, d.voiceModel); const voice = await k0.voiceNow(), model = voiceModel(), saved = await voiceHave();
        let old = {}, osha = null; try { const g = await GH.get(PATH + "/narration2.json"); old = JSON.parse(g.text); osha = g.sha } catch (e) {}
        const have = new Set(saved); (old.steps || []).forEach(x => (x.items || []).forEach(y => y.say && have.add(y.say)));
        const steps = [], jobs = [];
        for (let i = 0; i < S.length; i++) { const st = S[i], items = [];
          if (st.a == null) items.push({pause: 2.5});
          else { const parts = partsOf(st, null);
            for (let q = 0; q < parts.length; q++) { const p = parts[q]; if (p.pause) { items.push({pause: p.pause}); continue } if (!p.say) continue;
              const file = await pieceFile(k0, voice, p); items.push({say: file, text: p.say});
              if (!have.has(file) && !jobs.some(j => j.file === file)) jobs.push({file, p, prev: parts.slice(0, q).map(x => x.say || "").join(" ").slice(-500), next: parts.slice(q + 1).map(x => x.say || "").join(" ").slice(0, 300)}) } }
          steps.push({slide: st.slide ? st.slide.name : null, label: st.node ? st.node.full + " " + st.node.text : "", items}) }
        for (let q = 0; q < jobs.length; q++) { const j = jobs[q]; m.textContent = `Reading part ${q + 1} of ${jobs.length}…`;
          const a = j.p.v3 ? await k0.ttsV3(j.p.say, {prev: j.prev, next: j.next}) : await k0.tts(j.p.say, j.p.vs, {prev: j.prev, next: j.next}), data = a.b64 || await k0.blobB64(a.blob);
          try { await GH.put(PATH + "/" + j.file, data, null, "Narration voice") } catch (e) { if (e.status !== 422) throw e } saved.add(j.file) }
        m.textContent = "Saving…"; const N = {format: "narration/2", voice, model, made: new Date().toISOString(), steps};
        for (let a = 0; a < 3; a++) { try { await GH.put(PATH + "/narration2.json", b64e(JSON.stringify(N, null, 1) + "\n"), osha, "Narrated version"); break } catch (e) { if (a === 2 || (e.status !== 409 && e.status !== 422)) throw e; try { osha = (await GH.get(PATH + "/narration2.json")).sha } catch (_) { osha = null } } }
        m.textContent = `Done. ${jobs.length ? jobs.length + " new part" + (jobs.length > 1 ? "s" : "") + " read" : "Nothing had changed, so no new reading was needed"}.`; $("#nl").hidden = false }
      catch (e) { m.textContent = ""; aiFail(e) } b.disabled = false } }
  // Saved voice pieces: every piece read for Listen or the narrated version is kept in the talk's voice/ folder, named by a hash of
  // the voice, the voice style and the words, so the same words in the same voice are never read (and paid for) twice. Change the voice and everything is read fresh.
  const voiceModel = () => d.voiceModel === "v4" ? (d.v3Feel === "natural" ? "v4" : "v4s") : d.voiceModel === "v3" ? (d.v3Feel === "natural" ? "v3" : "v3s") : "v2";
  const pieceFile = async (k0, voice, p) => "voice/" + (await k0.sha(voice + "|" + voiceModel() + "|" + JSON.stringify(p.vs || {}) + "|" + p.say)).slice(0, 16) + ".mp3";
  let VOICES_HAVE = null;      // the files in voice/ (loaded when Listen or the narrated version starts)
  async function voiceHave(){ try { const r = await fetch(`https://api.github.com/repos/${C.owner}/${C.repo}/contents/${PATH}/voice?ref=${C.branch}&t=${Date.now()}`, {headers: token() ? {Authorization: "Bearer " + token()} : {}, cache: "no-store"});
      VOICES_HAVE = new Set(r.ok ? (await r.json()).map(x => "voice/" + x.name) : []) } catch (e) { VOICES_HAVE = VOICES_HAVE || new Set() } return VOICES_HAVE }
  // play a saved piece: the site copy, or GitHub's copy until the site has it
  const savedPiece = f => new Promise(ok => { const au = new Audio(); let alt = false; au.preload = "auto"; au.oncanplaythrough = () => ok({url: au.src, starts: null, au}); au.onerror = () => { if (alt) return ok(null); alt = true; au.src = RAW + PATH + "/" + f }; au.src = f });
  // new pieces are saved to GitHub one at a time in the background
  const upQ = []; let upBusy = false;
  async function upload(file, data){ upQ.push({file, data}); if (upBusy) return; upBusy = true;
    while (upQ.length) { const j = upQ.shift(); try { await GH.put(PATH + "/" + j.file, j.data, null, "Voice for Listen") } catch (e) {} if (VOICES_HAVE) VOICES_HAVE.add(j.file) } upBusy = false }
  async function listen(from){ if (LS.on) { stopListen(); return } saveText();
    if (from == null && caretPos && caretPos.node.isConnected) { try { from = offsetOf(caretPos.node, caretPos.off) } catch (e) {} }
    let i0 = k; if (from != null) { const j = S.findIndex(st => st.a != null && from < st.b); if (j >= 0) { i0 = j; if (from < S[j].a) from = null } } const k0 = K(); k0.setVoice(d.voice || ""); k0.setV3(d.v3Feel, d.voiceModel); LS.on = true; LS.paused = false; const run = ++LS.run;
    const ctxOf = (i, dir) => { const L = []; for (let q = i + dir; q >= 0 && q < S.length && L.join(" ").length < 400; q += dir) if (S[q].a != null) L[dir < 0 ? "unshift" : "push"](plain(d.text.slice(S[q].a, S[q].b))); return L.join("\n") };
    const voice = await k0.voiceNow(), have = await voiceHave(), PREP = new Map(); let gap = false;      // a second of quiet between recorded pieces
    // get (or start getting) every piece of step i: a saved file if there is one, else ElevenLabs (then saved for next time). Whole steps only are saved.
    const prep = i => { if (PREP.has(i)) return PREP.get(i); const st = S[i]; if (!st || st.a == null) { PREP.set(i, null); return null }
      // starting in the middle of a step still uses the whole step's pieces (saved or cached), and skips ahead to the sentence you're in
      const parts = partsOf(st, null), part = false; let skip = 0; if (i === i0 && from != null) { const len = L => L.reduce((a, x) => a + (x.say ? x.say.length : 0), 0); skip = Math.max(0, len(parts) - len(partsOf(st, from))) }
      const prev = ctxOf(i, -1).slice(-500), next = ctxOf(i, 1).slice(0, 300);
      const jobs = parts.map((p, q) => !p.say ? null : (async () => { const f = await pieceFile(k0, voice, p);
        if (!part && have.has(f)) { const r = await savedPiece(f); if (r) return r }
        const r = p.v3 ? await k0.ttsV3(p.say, {prev: (prev + "\n" + parts.slice(0, q).map(x => x.say || "").join(" ")).slice(-500), next: (parts.slice(q + 1).map(x => x.say || "").join(" ") + "\n" + next).slice(0, 300)}) : await k0.tts(p.say, p.vs, {prev: (prev + "\n" + parts.slice(0, q).map(x => x.say || "").join(" ")).slice(-500), next: (parts.slice(q + 1).map(x => x.say || "").join(" ") + "\n" + next).slice(0, 300)});
        if (!part && !have.has(f)) { have.add(f); (r.b64 ? Promise.resolve(r.b64) : k0.blobB64(r.blob)).then(b => upload(f, b)).catch(() => {}) } return r })());
      jobs.forEach(j => j && j.catch(() => {})); const v = {parts, jobs, skip}; PREP.set(i, v); return v };
    try { for (let i = i0; i < S.length && LS.run === run; i++) { stepTo(i); lbar(); const st = S[i]; if (st.a == null) { prep(i + 1); await wait(1800); continue }
        const {parts, jobs, skip} = prep(i); prep(i + 1);      // the next step is read while this one plays, so there's no gap
        let left = skip;
        for (let q = 0; q < parts.length && LS.run === run; q++) { const p = parts[q]; if (p.pause) { if (left > 0) continue; await wait(p.pause * 1000); continue } if (!jobs[q]) continue;
          if (left >= p.say.length) { left -= p.say.length; continue } const frac = left > 0 ? left / p.say.length : 0; left = 0;
          let r = null; const quick = await Promise.race([jobs[q], new Promise(ok => setTimeout(() => ok(null), 150))]); if (quick) r = quick; else { LS.wait = true; lbar(); r = await jobs[q]; LS.wait = false; lbar() }
          if (LS.run !== run) return; if (gap) { await wait(1000); if (LS.run !== run) return } gap = true;
          await new Promise(ok => { const au = r.au || new Audio(r.url); r.au = null; LS.au = au; const seek = () => { try { au.currentTime = frac && au.duration ? frac * au.duration : 0 } catch (e) {} }; if (au.readyState >= 1) seek(); else au.addEventListener("loadedmetadata", seek, {once: true}); au.playbackRate = LS.rate || 1; au.onended = ok; au.onerror = ok;
            let starts = r.starts; if (!starts && p.say) { const mk = () => { const T = au.duration; if (T > 0 && isFinite(T)) { starts = [...p.say].map((_, c) => c / p.say.length * T); wordLight(p, au, starts) } }; if (au.readyState >= 1) mk(); else au.addEventListener("loadedmetadata", mk, {once: true}) } else wordLight(p, au, starts);
            if (!LS.paused) au.play().catch(ok) }) } }
      if (LS.run === run) stopListen() } catch (e) { stopListen(); aiFail(e) } }
  // ---- ✨ on selected text: grammar, spelling, tighten, listen, and the voice for those words ----
  const VOICES = ["excited", "exclaim", "calm", "gentle", "slow", "fast"];
  let selR = null;
  function selButton(){ const b = box(), sl = getSelection(); let el = $("#selai");
    if (!b || menu || LS.on || !sl.rangeCount || sl.isCollapsed || !b.contains(sl.anchorNode) || !b.contains(sl.focusNode) || !sl.toString().trim()) { if (el && !el.dataset.open) el.remove(); return }
    if (!el) { el = document.createElement("button"); el.type = "button"; el.id = "selai"; el.className = "btn small aib"; el.textContent = "✨"; el.title = "AI and voice for the selected words"; document.body.appendChild(el);
      el.onmousedown = e => e.preventDefault(); el.onclick = () => selMenu(el) }
    selR = sl.getRangeAt(0).cloneRange(); const rc = [...selR.getClientRects()].pop() || selR.getBoundingClientRect(); el.style.left = Math.min(innerWidth - 50, rc.right + 6) + "px"; el.style.top = Math.max(60, rc.top - 34) + "px" }
  let selT = null; document.addEventListener("selectionchange", () => { clearTimeout(selT); selT = setTimeout(selButton, 250) });
  function selRange(){ if (!selR) return null; saveText(); let a = offsetOf(selR.startContainer, selR.startOffset), b = offsetOf(selR.endContainer, selR.endOffset); const t = d.text || "";
    while (a < b && /\s/.test(t[a])) a++; while (b > a && /\s/.test(t[b - 1])) b--; return b > a ? [a, b] : null }
  function selMenu(btn){ let m = $("#selm"); if (m) { m.remove(); btn.dataset.open = ""; return } btn.dataset.open = "1"; m = document.createElement("div"); m.id = "selm"; m.className = "vmenu";
    m.innerHTML = `<div class="vmh">✨ The selected words</div><button type="button" data-s="grammar">✨ Grammar and flow</button><button type="button" data-s="spelling">✨ Spelling</button><button type="button" data-s="tighten">✨ Tighten</button><button type="button" data-s="listen">▶ Listen from here</button>
      <div class="vmh">Voice for these words</div>${VOICES.map(v => `<button type="button" data-v="${v}" class="cuev cue-${v}">${E(CUETAG[v].icon + " " + CUETAG[v].ref)}</button>`).join("")}<button type="button" data-p="pause">⏸ Pause before them</button>`;
    document.body.appendChild(m); const r = btn.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(r.left, innerWidth - 260)) + "px"; m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8) + "px";
    const off = e => { if (!m.contains(e.target) && e.target !== btn) { m.remove(); btn.remove(); removeEventListener("mousedown", off) } }; setTimeout(() => addEventListener("mousedown", off), 0);
    m.onmousedown = e => e.preventDefault();
    m.onclick = e => { const x = e.target.closest("button"); if (!x) return; const R = selRange(); m.remove(); btn.remove(); removeEventListener("mousedown", off); if (!R) return; const [a, b] = R;
      if (x.dataset.s === "listen") { listen(a); return }
      if (x.dataset.s === "tighten") { const now = words(d.text.slice(a, b)), mm = prompt(`The selection is about ${now} words, roughly ${Math.max(.5, Math.round(now / wpmOf(d) * 2) / 2)} minutes. How many minutes should it be?`, String(Math.max(.5, Math.round(now / 140 * .7 * 2) / 2))); if (!mm || !(+mm > 0)) return; lineEdit(a, b, "tighten", {minutes: +mm, target: Math.round(+mm * 140), now}).catch(aiFail); return }
      if (x.dataset.s) { lineEdit(a, b, x.dataset.s).catch(aiFail); return }
      const sn = snapshot(), t = d.text;
      if (x.dataset.p) d.text = t.slice(0, a) + "[Pause] " + t.slice(a);
      else { const nm = CUETAG[x.dataset.v].ref; d.text = t.slice(0, a) + "[" + nm + "]" + t.slice(a, b) + "[/" + nm + "]" + t.slice(b) }
      changed(sn); drawText() } }
  // the × on a voice tag removes it (and its end tag)
  document.addEventListener("click", e => { const x = e.target.closest("#ftext .vchip.cue .cx"); if (!x) return; e.stopPropagation(); saveText(); const c = x.closest(".vchip"), i = [...box().querySelectorAll(".vchip")].indexOf(c), tk = P.toks[i]; if (!tk) return;
    const sn = snapshot(); let t = d.text; const pr = tk.pair != null ? P.toks[tk.pair] : null; if (pr) t = t.slice(0, pr.at) + t.slice(pr.end); t = t.slice(0, tk.at) + t.slice(tk.end); d.text = t; changed(sn); drawText() }, true);
  layout($("#lay"), () => hl(true)); $("#m").addEventListener("scroll", () => { const el = $("#selai"); if (el && !el.dataset.open) el.remove() });
  drawText(); redraw(); hl(true)
}
// =====================================================================
// AUDIENCE (phones): follows the presenter: the slide on top and that part's audience notes, in the language you pick.
// =====================================================================
function auNoteAt(d, S, i, lang){ const st = S[i]; for (let p = st && st.node; p; p = p.parent) { const a = p.id && (d.audNotes || {})[p.id]; if (!a) continue; const h = lang && a.tr && noteText(a.tr[lang]) ? a.tr[lang] : a.html; if (noteText(h)) return h } return "" }
const loadLib = u => new Promise((ok, no) => { if (document.querySelector(`script[src="${u}"]`)) return ok(); const x = document.createElement("script"); x.src = u; x.onload = ok; x.onerror = no; document.head.appendChild(x) });
// One PDF of the whole talk for the audience: each slide, its words in the language, then the notes. Made in Edit and saved with the talk.
async function talkPDF(d, S, prog){ await loadLib("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"); await loadLib("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  const SH = S.map(x => x.slide), L = ["", ...(d.languages || [])], items = []; let prev = null;
  for (let i = 0; i < S.length; i++) { const key = L.map(lg => auNoteAt(d, S, i, lg)).join("|") + "|" + (SH[i] && SH[i].name); if (key !== prev) { prev = key; items.push(i) } }
  const bare = i => L.every(lg => !noteText(auNoteAt(d, S, i, lg)));
  for (let n = items.length - 2; n >= 0; n--) if (bare(items[n]) && SH[items[n]] === SH[items[n + 1]]) items.splice(n, 1);
  const box = document.createElement("div"); box.className = "aupdf"; document.body.appendChild(box);
  try { const pdf = new window.jspdf.jsPDF({unit: "pt", format: "a4", compress: true}), W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 28; let y = M;
    const place = async (html, gap) => { box.innerHTML = html; await Promise.all([...box.querySelectorAll("img")].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r })));
      const c = await window.html2canvas(box, {scale: 1.5, backgroundColor: "#ffffff", useCORS: true}), w = W - 2 * M, h = c.height * w / c.width, img = c.toDataURL("image/jpeg", 0.72);
      if (y + h > H - M && y > M) { pdf.addPage(); y = M }
      pdf.addImage(img, "JPEG", M, y, w, h); let off = H - M - y;
      if (off >= h) { y += h + (gap || 0); return }
      let start = off; while (start < h) { pdf.addPage(); pdf.addImage(img, "JPEG", M, M - start, w, h); y = M + (h - start); start += H - 2 * M } y += gap || 0 };
    await place(`<h1>${E(d.title)}</h1>${L.length > 1 ? `<p>${L.map(lg => E(lg || "English")).join(" · ")}</p>` : ""}`, 10);
    for (let n = 0; n < items.length; n++) { const i = items[n]; if (prog) prog(n + 1, items.length);
      let top = `<div class="aus">${SH[i] && SH[i].type === "video" ? "" : slideHTML(SH[i], d)}</div>`;
      for (const lg of L) { const sw = lg ? slideTrHTML(SH[i], lg) : "", h = auNoteAt(d, S, i, lg); if (!sw && !noteText(h)) continue;
        await place(top + `<div class="aun">${L.length > 1 ? `<div class="aulg">${E(lg || "English")}</div>` : ""}${sw}${sw && h ? '<hr class="auhr">' : ""}${h ? cleanHTML(h) : ""}</div>`, 4); top = "" }
      if (top) await place(top, 4); y += 16 }
    return pdf.output("datauristring").split(",")[1] } finally { box.remove() } }
// slides2.html?play: the narrated version. The slides show while the saved AI voice reads, and the voice moves the slides on.
async function play(){
  document.body.innerHTML = `<div id="s"></div><div id="ui"><button id="pb" type="button" title="Back">⏮</button><button id="pg" type="button" title="Pause">❚❚</button><button id="pn" type="button" title="Next">⏭</button><button id="psp" type="button" title="Speed">1×</button><span id="st"><b></b>Narrated</span><button id="f" type="button">Full screen</button></div><div id="pstart"><button type="button" id="pgo" disabled>Loading…</button><p id="pmsg"></p></div>`;
  let d; try { d = (await load(false)).d } catch (e) { $("#pmsg").textContent = "Couldn't load this talk."; return }
  document.title = d.title + " · narrated"; const lib = n => n ? (d.slides || []).find(x => x.name === n) || null : null;
  let N = null; for (const u of ["narration2.json", RAW + PATH + "/narration2.json"]) { try { const r = await fetch(u + "?t=" + Date.now(), {cache: "no-store"}); if (r.ok) { N = await r.json(); break } } catch (e) {} }
  const L = (N && N.steps) || []; setSlide($("#s"), slideHTML(lib(L[0] && L[0].slide), d));
  if (!L.length) { $("#pgo").textContent = "Not ready yet"; $("#pmsg").textContent = "This talk doesn't have a narrated version yet."; return }
  T.preload(L.map(x => lib(x.slide)).filter(Boolean), d);
  $("#pgo").disabled = false; $("#pgo").textContent = "▶ Play the talk"; $("#pmsg").textContent = "Narrated with an AI voice";
  const au = new Audio(), st = $("#st"); let run = 0, i = 0, paused = false, wake = null;
  const SPD = [.75, 1, 1.25, 1.5, 1.75, 2]; let rate = 1; try { rate = +localStorage.getItem("play-rate") || 1 } catch (e) {} if (!SPD.includes(rate)) rate = 1;
  const setRate = r => { rate = r; au.defaultPlaybackRate = r; au.playbackRate = r; au.preservesPitch = true; $("#psp").textContent = String(r).replace(/^0/, "") + "×"; try { localStorage.setItem("play-rate", r) } catch (e) {} }; setRate(rate);
  $("#psp").onclick = () => setRate(SPD[(SPD.indexOf(rate) + 1) % SPD.length]);
  const pre = f => { const x = new Audio(); x.preload = "auto"; x.src = f };
  const wait = (ms, r) => new Promise(ok => { let left = ms; const t = setInterval(() => { if (r !== run) { clearInterval(t); ok() } else if (!paused && (left -= 100 * rate) <= 0) { clearInterval(t); ok() } }, 100) });
  const say = f => new Promise(ok => { let alt = false; wake = ok; au.onended = () => ok(); au.onerror = () => { if (alt) return ok(); alt = true; au.src = RAW + PATH + "/" + f; au.playbackRate = rate; if (!paused) au.play().catch(() => {}) }; au.src = f; au.playbackRate = rate; if (!paused) au.play().catch(() => {}) });
  let gap = false;      // a second of quiet between two recorded pieces
  async function step(k){ const r = ++run; au.pause(); if (wake) { wake(); wake = null } if (k < 0) k = 0;
    if (k >= L.length) { setSlide($("#s"), `<div class="slide blank"><div class="txt">The end<br><button type="button" id="again" class="btn">▶ Play again</button></div></div>`); st.lastChild.textContent = "The end"; const g = $("#again"); if (g) g.onclick = () => step(0); return }
    i = k; const x = L[k]; setSlide($("#s"), slideHTML(lib(x.slide), d)); st.lastChild.textContent = x.label || "Narrated";
    const items = x.items || [], nx = L[k + 1] && (L[k + 1].items || []).find(y => y.say); items.filter(y => y.say).slice(0, 2).forEach(y => pre(y.say)); if (nx) pre(nx.say);
    // a video that comes up here plays to its end first; the reading waits for it
    const sl = lib(x.slide), was = k > 0 ? lib(L[k - 1].slide) : null;
    if (sl && sl.type === "video" && sl !== was) { const w = $("#s .slide.vid"), lim = ((+sl.secs || vidSecs(sl) || 600) + 5) * 1000;
      if (w) await new Promise(ok => { let done = false; const fin = () => { if (!done) { done = true; clearInterval(tt); ok() } }; w.addEventListener("vidend", fin, {once: true}); let t0 = 0; const tt = setInterval(() => { if (r !== run || !w.isConnected) return fin(); if (!paused && (t0 += 250) >= lim) fin() }, 250) }); if (r !== run) return }
    if (!items.some(y => y.say) && !items.some(y => y.pause)) await wait(3000, r);
    for (let q = 0; q < items.length && r === run; q++) { const it = items[q]; if (it.pause) await wait(it.pause * 1000, r); else if (it.say) { const nf = items.slice(q + 1).find(y => y.say); if (nf) pre(nf.say); if (gap) await wait(1000, r); if (r !== run) break; await say(it.say); gap = true } }
    if (r === run) step(k + 1) }
  const toggle = () => { paused = !paused; $("#pg").textContent = paused ? "▶" : "❚❚"; if (paused) au.pause(); else if (au.src && !au.ended) au.play().catch(() => {}); document.querySelectorAll("#s video").forEach(v => { if (paused) v.pause(); else if (!v.ended) v.play().catch(() => {}) }) };
  $("#pgo").onclick = () => { $("#pstart").remove(); step(0) };
  $("#pn").onclick = () => step(i + 1); $("#pb").onclick = () => step(i - 1); $("#pg").onclick = toggle;
  const full = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() } catch (e) {} }; $("#f").onclick = full;
  document.addEventListener("keydown", e => { if ($("#pstart")) return; if (e.key === "ArrowRight" || e.key === "PageDown") step(i + 1); else if (e.key === "ArrowLeft" || e.key === "PageUp") step(i - 1); else if (e.key === " ") { e.preventDefault(); toggle() } else if (e.key === "f" || e.key === "F") full() });
  let hideT; const ui = $("#ui"); const wk = () => { ui.classList.remove("hide"); clearTimeout(hideT); hideT = setTimeout(() => ui.classList.add("hide"), 3000) };
  document.addEventListener("mousemove", wk); document.addEventListener("touchstart", wk); wk() }
async function audience(){
  document.body.innerHTML = `<div class="au"><div class="auh"><b id="aut">Loading…</b><select id="aul" aria-label="Language"></select></div><div class="aus" id="aus"></div><div class="aun" id="aun"></div>
    <div class="aubtm"><button type="button" id="aub">&larr;</button><span id="aust">Connecting…</span><button type="button" id="aun2">&rarr;</button><button type="button" id="aulive" hidden>Back to live</button><a id="audl" class="audl" hidden title="Download the slides and notes as a PDF">⤓ PDF</a></div></div>`;
  let d; try { d = (await load(false)).d } catch (e) { $("#aut").textContent = "Couldn't load the talk."; return }
  document.title = d.title; $("#aut").textContent = d.title;
  const P = parse(d), S = build(P), SH = S.map(x => x.slide), L = d.languages || [];
  let lang = ""; try { lang = localStorage.getItem("au-lang") || "" } catch (e) {}
  if (!localStorage.getItem("au-lang")) { const nav = (navigator.language || "").toLowerCase(), names = {tl: "Tagalog", fil: "Tagalog", ceb: "Cebuano", es: "Spanish", ko: "Korean", zh: "Chinese", ja: "Japanese", fr: "French", de: "German", pt: "Portuguese", id: "Indonesian", vi: "Vietnamese", th: "Thai"}; const g = names[nav.split("-")[0]]; if (g && L.includes(g)) lang = g }
  if (lang && !L.includes(lang)) lang = "";
  $("#aul").innerHTML = `<option value="">English</option>` + L.map(x => `<option${x === lang ? " selected" : ""}>${E(x)}</option>`).join(""); $("#aul").hidden = !L.length;
  let pres = 0, local = null, end = false, lastAt = 0, on = false, conn = true;
  const noteAt = i => auNoteAt(d, S, i, lang);
  const vidPh = s => `<div class="slide vidph"><div class="vpi">▶</div><div class="vpt">${E(s.name || "Video")}</div><div class="vps">Playing on the main screen</div></div>`;
  const show = () => { const i = local == null ? pres : local; setSlide($("#aus"), end && local == null ? '<div class="slide blank"></div>' : SH[i] && SH[i].type === "video" ? vidPh(SH[i]) : slideHTML(SH[i], d)); const h = noteAt(i), sw = lang && !(end && local == null) ? slideTrHTML(SH[i], lang) : ""; $("#aun").innerHTML = sw + (sw && h ? '<hr class="auhr">' : "") + (h ? cleanHTML(h) : "");
    $("#aulive").hidden = local == null || !on || end; $("#aust").textContent = on && !end ? (local != null ? "Looking back" : "Live") : end ? "The talk is over" : conn ? "Waiting for the speaker…" : "Not connected · browse on your own"; $("#aust").className = local == null && on && !end ? "on" : "" };
  const from = m => { if (!m || m.v !== 2) return; if (m.at && m.at <= lastAt) return; lastAt = m.at || Date.now(); const fresh = !m.at || Date.now() - m.at < 3 * 3600e3; if (fresh && !on) local = null; on = fresh; conn = true; end = !!m.end; pres = Math.max(0, Math.min(S.length - 1, +m.step || 0)); show() };
  const stepL = dd => { const live = on && !end, max = live ? pres : S.length - 1; let i = local == null ? pres : local; const cur = noteAt(i) + "|" + (SH[i] && SH[i].name); do { i += dd } while (i > 0 && i < max && noteAt(i) + "|" + (SH[i] && SH[i].name) === cur); i = Math.max(0, Math.min(max, i)); local = live && i >= pres ? null : i; show() };
  $("#aub").onclick = () => stepL(-1); $("#aun2").onclick = () => stepL(1); $("#aulive").onclick = () => { local = null; show() };
  $("#audl").onclick = async e => { const f = d.pdf, a = $("#audl"); if (!f) return; e.preventDefault(); if (a.dataset.busy) return; a.dataset.busy = 1; const t0 = a.textContent; a.textContent = "Downloading…";
    try { let r = await fetch(f.file + "?t=" + (f.at || ""), {cache: "no-store"}).catch(() => null); if (!r || !r.ok) r = await fetch(RAW + PATH + "/" + f.file + "?t=" + (f.at || ""), {cache: "no-store"}); if (!r.ok) throw 0;
      const u = URL.createObjectURL(await r.blob()), x = document.createElement("a"); x.href = u; x.download = a.getAttribute("download"); document.body.appendChild(x); x.click(); x.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000) }
    catch (_) { alert("The PDF isn't ready yet. Try again in a minute.") } finally { delete a.dataset.busy; a.textContent = t0 } };
  const dl = () => { const f = d.pdf, a = $("#audl"); a.hidden = !f; if (f) { a.href = f.file + "?t=" + (f.at || ""); a.setAttribute("download", (d.title || "Talk").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".pdf") } }; dl();
  $("#aul").onchange = e => { lang = e.target.value; try { localStorage.setItem("au-lang", lang) } catch (_) {} dl(); show() };
  try { const es = new EventSource(relay(d) + "/sse"); es.onopen = () => { conn = true; show() }; es.onerror = () => { conn = false; on = false; show() }; es.onmessage = e => { try { const m = JSON.parse(e.data); if (m.event === "message") from(JSON.parse(m.message)) } catch (_) {} } } catch (e) { conn = false }
  try { const t = await (await fetch(relay(d) + "/json?poll=1&since=12h", {cache: "no-store"})).text(); const Q = t.trim().split("\n").filter(Boolean).map(x => { try { return JSON.parse(JSON.parse(x).message) } catch (e) { return null } }).filter(x => x && x.v === 2); if (Q.length) from(Q[Q.length - 1]) } catch (e) {}
  show() }
({edit2: edit, present2: present, slides2: slides, audience2: audience}[MODE] || (() => {}))();
})();
