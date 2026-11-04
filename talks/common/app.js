// One script for every talk page. The page picks its mode with <body data-mode="monitor|present|edit|index">.
// Talk data lives in talk.json in the talk's folder (format "talk/1"); slide images in its slides/ folder.
(function(){
"use strict";
const C = window.TALKS_CONFIG;
const MODE = document.body.dataset.mode;
const $ = s => document.querySelector(s);
const E = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const parts = location.pathname.replace(/\/(index|present|edit)\.html$/, "/").split("/").filter(Boolean);
const FOLDER = MODE === "index" ? "" : decodeURIComponent(parts[parts.length - 1] || "");
const PATH = C.root + "/" + FOLDER;                    // repo path of this talk's folder
const RAW = `https://raw.githubusercontent.com/${C.owner}/${C.repo}/${C.branch}/`;

// ---------- GitHub (contents API) ----------
const tokenKey = "gh-token";
const token = () => { try { return localStorage.getItem(tokenKey) || "" } catch (e) { return "" } };
const b64e = s => btoa(unescape(encodeURIComponent(s)));
const b64d = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
const encPath = p => p.split("/").map(encodeURIComponent).join("/");
function hdr(){ const h = {Accept: "application/vnd.github+json"}; const t = token(); if (t) h.Authorization = "Bearer " + t; return h }
const GH = {
  async get(path){
    const r = await fetch(`https://api.github.com/repos/${C.owner}/${C.repo}/contents/${encPath(path)}?ref=${C.branch}&t=${Date.now()}`, {headers: hdr(), cache: "no-store"});
    if (!r.ok) { const e = new Error("GitHub " + r.status); e.status = r.status; throw e }
    const j = await r.json(); return {sha: j.sha, text: j.content ? b64d(j.content) : ""};
  },
  async put(path, b64, sha, message){
    const body = {message, content: b64, branch: C.branch}; if (sha) body.sha = sha;
    const r = await fetch(`https://api.github.com/repos/${C.owner}/${C.repo}/contents/${encPath(path)}`, {method: "PUT", headers: {...hdr(), "Content-Type": "application/json"}, body: JSON.stringify(body)});
    if (!r.ok) { const e = new Error("GitHub " + r.status); e.status = r.status; try { e.detail = (await r.json()).message } catch (_) {} throw e }
    return (await r.json()).content.sha;
  }
};

// ---------- data helpers ----------
let D = null, SHA = null;
async function loadTalk(fresh){
  if (fresh || token()) { try { const g = await GH.get(PATH + "/talk.json"); SHA = g.sha; return JSON.parse(g.text) } catch (e) { if (fresh) throw e } }
  const r = await fetch("talk.json?t=" + Date.now(), {cache: "no-store"}); if (!r.ok) throw new Error("talk.json " + r.status); return r.json();
}
const letter = i => String.fromCharCode(97 + i);
function steps(d){
  const out = [];
  if (d.coverImage) out.push({id: "cover", label: "", cue: "Opening slide", sec: "", image: d.coverImage, slide: "", keyPoints: [], verses: [], script: ""});   // legacy
  d.sections.forEach((s, si) => s.points.forEach((p, pi) => out.push({...p, label: (si + 1) + "." + letter(pi), sec: (si + 1) + ". " + (s.title || ""), sid: s.id})));
  return out;
}
// Each point's planned time (seconds) comes from a practice run or is typed in Edit; together they make the talk's length.
const ptSecs = p => { const n = parseFloat(p && p.seconds); return n > 0 ? n : 0 };
const talkSecs = d => d.sections.reduce((a, s) => a + s.points.reduce((b, p) => b + ptSecs(p), 0), 0);
const mmss = s => { s = Math.round(Math.abs(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") };
const parseTime = v => { v = String(v || "").trim(); if (!v) return ""; const m = v.match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] * 60 + +m[2]; const n = parseFloat(v); return n >= 0 ? Math.round(n * 60) : "" };
const hasSlide = p => !!(p && (p.image || p.slide || p.slideTitle || p.eyebrow));
function heldIdx(S, i){ for (let k = i; k >= 0; k--) if (hasSlide(S[k])) return k; return -1 }
const LOCALIMG = {};                                   // freshly uploaded images, shown before the site redeploys
window.__imgFallback = el => { const p = el.dataset.p; if (p && !el.dataset.f) { el.dataset.f = 1; el.src = RAW + PATH + "/" + p } };
function imgTag(p){ return `<img alt="" data-p="${E(p)}" src="${E(LOCALIMG[p] || p)}" onerror="__imgFallback(this)">` }
// A slide = background image (no words in it) + live text on top: small eyebrow, title (gold), subtitle (white).
// Sizes are in cqw (percent of the slide's width) so the same slide looks identical at any size.
const fitSize = n => n <= 25 ? 7.5 : n <= 60 ? 5.8 : n <= 95 ? 4.8 : n <= 130 ? 4.2 : 3.5;
// Text placement (all optional, % of the slide). The block: textX = left edge, textY = vertical middle, textW = width, align.
// Each line k (eb = top line, tt = title, sb = subtitle) can also be placed on its own: kX, kY, kW, kAlign, and kSize (100 = normal).
// A line with no kX/kY/kW stays in the block. Empty means the default.
const num = (v, d) => v === "" || v == null || isNaN(+v) ? d : +v;
const isSet = v => !(v === "" || v == null || isNaN(+v));
const ALIGNS = ["left", "center", "right"], SELF = {left: "flex-start", center: "center", right: "flex-end"};
const LINES = [["eb", "eyebrow", "Top line"], ["tt", "slideTitle", "Title"], ["sb", "slide", "Subtitle"]];
const elPos = (p, k) => isSet(p[k + "X"]) || isSet(p[k + "Y"]) || isSet(p[k + "W"]);
function textBox(p){
  const c = p.layout === "center";
  return {x: num(p.textX, c ? 9 : 6.75), y: num(p.textY, 50), w: num(p.textW, c ? 82 : 56), a: ALIGNS.includes(p.align) ? p.align : (c ? "center" : "left")};
}
function slideBox(p){
  const c = p.layout === "center", tl = (p.slideTitle || "").trim(), sb = (p.slide || "").trim(), b = textBox(p), sz = c ? 7.5 : fitSize((tl + " " + sb).trim().length);
  const base = {eb: 2.5, tt: sz, sb: c ? 4.6 : sz}; let inner = "", out = "";
  for (const [k, f] of LINES) { const t = (p[f] || "").trim(); if (!t) continue;
    const al = ALIGNS.includes(p[k + "Align"]) ? p[k + "Align"] : "";
    let st = `font-size:${+(base[k] * num(p[k + "Size"], 100) / 100).toFixed(3)}cqw`; if (/^#[0-9a-f]{6}$/i.test(p[k + "Color"] || "")) st += `;color:${p[k + "Color"]}`;
    if (elPos(p, k)) out += `<div class="${k} tx1" data-k="${k}" style="${st};left:${num(p[k + "X"], b.x)}%;top:${num(p[k + "Y"], 50)}%;width:${num(p[k + "W"], b.w)}%;text-align:${al || b.a}">${E(t)}</div>`;
    else inner += `<div class="${k}" data-k="${k}" style="${st}${al ? `;text-align:${al};align-self:${SELF[al]}` : ""}">${E(t)}</div>`;
  }
  const st = `left:${b.x}%;top:${b.y}%;width:${b.w}%;text-align:${b.a};align-items:${SELF[b.a]}`;
  return `<div class="slide ${c ? "center" : "left"}">${p.image ? imgTag(p.image) : ""}${inner ? `<div class="tx" style="${st}">${inner}</div>` : ""}${out}</div>`;
}
// Verse slides: a tag like [Acts 1:8] in a point's full text (matching one of its verses) adds a slide with just that verse.
const TAG = /\[([^\[\]\n]{1,60})\]/g;
function verseRefsIn(p){ const out = []; if (!p || !p.script) return out; for (const m of p.script.matchAll(TAG)) { const v = (p.verses || []).find(x => x && x.ref && x.ref.trim() === m[1].trim()); if (v) out.push(v) } return out }
const subCount = p => verseRefsIn(p).length;
function verseSlide(v){ const n = (v.text || "").length, sz = n <= 110 ? 4.8 : n <= 220 ? 4 : n <= 360 ? 3.3 : n <= 520 ? 2.8 : 2.3;
  return `<div class="slide verse-s"><div class="vs"><div class="vt" style="font-size:${sz}cqw">${E(v.text || "")}</div><div class="vr">${E(v.ref)}${v.version ? " (" + E(v.version) + ")" : ""}</div></div></div>` }
function stepHTML(S, i, sub, d){ if (sub > 0) { const v = verseRefsIn(S[i])[sub - 1]; if (v) return verseSlide(v) } return slideHTML(S, i, d) }
// One dot per slide on a point (its own slide, then each verse slide); "on" marks the one showing.
function dotsHTML(p, on){ const n = (hasSlide(p) ? 1 : 0) + subCount(p); if (!n) return ""; let h = ""; for (let k = 0; k < n; k++) h += `<b${k === on ? ' class="on"' : ""}></b>`; return `<span class="dots">${h}</span>` }
const dotOf = (p, sub) => sub > 0 ? sub - 1 + (hasSlide(p) ? 1 : 0) : hasSlide(p) ? 0 : -1;
// Full text with the verse tags as buttons (data-sub = which verse slide).
function scriptHTML(p, sub){ let h = "", last = 0, k = 0; const t = p.script || "";
  for (const m of t.matchAll(TAG)) { const v = (p.verses || []).find(x => x && x.ref && x.ref.trim() === m[1].trim()); if (!v) continue;
    k++; h += E(t.slice(last, m.index)) + `<button type="button" class="vtag${k === sub ? " on" : ""}" data-sub="${k}">${E(v.ref)}</button>`; last = m.index + m[0].length }
  return h + E(t.slice(last)) }
function slideHTML(S, i, d){
  const k = heldIdx(S, i), s = k >= 0 ? S[k] : null;
  if (s) return slideBox(s);
  return d.titleImage ? `<div class="slide">${imgTag(d.titleImage)}</div>` : slideBox({layout: "center", slideTitle: d.title});
}
function preload(S, d){ [...new Set(S.map(s => s.image).concat([d.titleImage]).filter(Boolean))].forEach(u => { const im = new Image(); im.onerror = () => { im.onerror = null; im.src = RAW + PATH + "/" + u }; im.src = u }) }
function kpHTML(list){ return list && list.length ? `<ul class="kp">${list.map(x => `<li${/^(🔑|🔁)/u.test(x) ? ' class="key"' : ""}>${E(x)}</li>`).join("")}</ul>` : "" }
function verseTags(p){ const v = (p.verses || []).map((x, i) => [x, i]).filter(([x]) => x && x.ref); return v.length ? `<div class="vtags">${v.map(([x, i]) => `<button type="button" data-v="${i}">${E(x.ref)}</button>`).join("")}</div>` : "" }
function verseDialog(){
  let d = $("#vd"); if (d) return d;
  document.body.insertAdjacentHTML("beforeend", `<dialog class="verse" id="vd"><h3 id="vr"></h3><p id="vx"></p><button class="btn" id="vc" type="button">Close</button></dialog>`);
  d = $("#vd"); $("#vc").onclick = () => d.close();
  d.addEventListener("click", e => { if (e.target !== d) return; const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close() });
  return d;
}
function showVerse(v){ const d = verseDialog(); $("#vr").textContent = v.ref + (v.version ? ` (${v.version})` : ""); $("#vx").textContent = v.text || "No text yet. Add it in Edit."; try { d.showModal() } catch (e) { d.setAttribute("open", "") } }
let bc = null; try { bc = new BroadcastChannel("talk-" + FOLDER) } catch (e) {}
const relayURL = () => C.relay + "/" + D.relayTopic;
function topBar(active){
  return `<div class="top"><h1>${E(D.title)}</h1><div class="mode">
    <a class="btn${active === "edit" ? " on" : ""}" href="edit.html">Edit</a>
    <a class="btn${active === "present" ? " on" : ""}" href="present.html">Stage</a>
    <a class="btn" href="./" target="_blank" rel="noopener">Monitor</a>
    <a class="btn" href="../">All talks</a></div></div>`;
}

// =====================================================================
// MONITOR: slides only, follows the presenter, can step, snaps back.
// =====================================================================
async function monitor(){
  document.body.innerHTML = `<div id="s"></div><div id="ui"><button id="b" type="button">&larr; Back</button><span id="st"><b></b>Connecting&hellip;</span><button id="n" type="button">Next &rarr;</button><button id="f" type="button">Full screen</button></div>`;
  try { D = await loadTalk(false) } catch (e) { $("#s").innerHTML = `<div class="txt">Couldn't load this talk.</div>`; return }
  document.title = D.title + " · slides";
  const S = steps(D), idx = id => S.findIndex(s => s.id === id);
  preload(S, D);
  let pres = 0, psub = 0, local = 0, lsub = 0, follow = true, connected = false, bcSeen = false, lastAt = 0;
  const items = []; S.forEach((s, i) => { if (hasSlide(s)) items.push([i, 0]); for (let k = 1; k <= subCount(s); k++) items.push([i, k]) });
  const st = $("#st");
  let pEnd = false;
  function show(){ const i = follow ? pres : local; $("#s").innerHTML = follow && pEnd ? '<div class="slide blank"></div>' : stepHTML(S, i, follow ? psub : lsub, D);
    st.className = follow ? (connected || bcSeen ? "on" : "") : "local";
    st.lastChild.textContent = follow ? (connected || bcSeen ? "Following the presenter" : "Waiting for the presenter") : "Stepping here, snaps back when the presenter moves" }
  function fromPresenter(m){ if (!m || !m.point) return; if (m.at && m.at <= lastAt) return; lastAt = m.at || Date.now(); if (m.point === "__end") { pEnd = true; follow = true; show(); return } const i = idx(m.point); if (i < 0) return; pEnd = false; pres = i; psub = +m.sub || 0; follow = true; show() }
  function step(d){ const ci = follow ? pres : local, cs = follow ? psub : lsub; let k = -1;
    items.forEach(([i, s], j) => { if (i < ci || (i === ci && s <= cs)) k = j }); if (k < 0 && d < 0) k = 0;
    k = Math.max(0, Math.min(items.length - 1, k + d)); if (!items[k]) return; [local, lsub] = items[k]; follow = false; show() }
  $("#b").onclick = () => step(-1); $("#n").onclick = () => step(1);
  const full = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() } catch (e) {} };
  $("#f").onclick = full;
  document.addEventListener("keydown", e => { if (["ArrowRight","ArrowDown","PageDown"," "].includes(e.key)) { e.preventDefault(); step(1) } else if (["ArrowLeft","ArrowUp","PageUp"].includes(e.key)) { e.preventDefault(); step(-1) } else if (e.key === "f" || e.key === "F") full() });
  let hideT; const ui = $("#ui"); const wake = () => { ui.classList.remove("hide"); clearTimeout(hideT); hideT = setTimeout(() => ui.classList.add("hide"), 3000) };
  document.addEventListener("mousemove", wake); document.addEventListener("touchstart", wake); wake();
  if (bc) bc.onmessage = e => { bcSeen = true; fromPresenter(e.data) };
  async function catchUp(){ try { const t = await (await fetch(relayURL() + "/json?poll=1&since=12h", {cache: "no-store"})).text();
    const L = t.trim().split("\n").filter(Boolean).map(x => { try { return JSON.parse(x) } catch (e) { return null } }).filter(x => x && x.event === "message");
    if (L.length) { try { fromPresenter(JSON.parse(L[L.length - 1].message)) } catch (e) {} } } catch (e) {} }
  try { const es = new EventSource(relayURL() + "/sse"); es.onopen = () => { connected = true; show(); catchUp() }; es.onerror = () => { connected = false; show() };
    es.onmessage = e => { try { const m = JSON.parse(e.data); if (m.event === "message") fromPresenter(JSON.parse(m.message)) } catch (_) {} } } catch (e) {}
  show(); catchUp();
}

// =====================================================================
// PRESENT (Stage): cues, key points, verses, slide, full text, timer, sync.
// =====================================================================
async function present(){
  document.body.innerHTML = `<p class="status">Loading&hellip;</p>`;
  try { D = await loadTalk(false) } catch (e) { document.body.innerHTML = `<p class="status">Couldn't load this talk.</p>`; return }
  document.title = D.title + " · Stage";
  const S = steps(D); preload(S, D);
  document.body.innerHTML = topBar("present") + `<div class="lay"><nav class="cues" id="nav"></nav><main class="pane" id="m"></main></div>
    <div class="bar"><button class="btn" id="b" type="button">&larr; Back</button><span id="pos"></span><span id="sync"><b></b>Not sent yet</span>
      <button class="btn" id="pop" type="button" title="Slides in their own window on this computer; works without internet">Slides window</button><button class="btn pri" id="n" type="button">Next &rarr;</button></div>
    <div id="pace"></div><div class="ctimer idle" id="ct" hidden><div class="ct-track"><i></i></div><span class="ct-txt"></span></div>`;
  let cur = 0, sub = 0; try { const v = +localStorage.getItem("pres-" + FOLDER); if (v >= 0 && v < S.length) cur = v; const w = +localStorage.getItem("pres-sub-" + FOLDER); if (w > 0 && w <= subCount(S[cur])) sub = w } catch (e) {}
  const first = S.findIndex(s => s.id !== "cover");
  const TIMER = CountTimer($("#ct"), "pres-timer-" + FOLDER);
  const setLen = () => { const l = ls("pres-practice-base-" + FOLDER); let x = 0; S.forEach(p => { x += l && l.times[p.id] != null ? l.times[p.id] : ptSecs(p) });
    TIMER.setMinutes(x > 0 ? x / 60 : timerMinutes(D, D.sections)) };
  setLen();
  function nav(){ let h = "", last = null;
    S.forEach((s, i) => { if (s.sec !== last) { last = s.sec; if (s.sec) h += `<div class="sec">${E(s.sec)}</div>` }
      h += `<button type="button" class="it${i === cur ? " cur" : ""}" data-i="${i}"><i>${E(s.label)}</i><span>${E(s.cue)}</span>${dotsHTML(s, i === cur ? dotOf(s, sub) : -1)}</button>` });
    const n = $("#nav"); n.innerHTML = h; const c = n.querySelector(".cur"); if (c) { const top = c.offsetTop - n.clientHeight / 2; n.scrollTo({top, behavior: "smooth"}) } }
  function main(){ if (atEnd) { $("#m").innerHTML = `<div class="head">End of the talk</div><div class="grid"><div><p class="note">The last point is timed. Untick Practice when you're done, or press Back.</p></div><div class="scr-wrap"><div class="scr"><div class="slide blank"></div></div><div class="cap">Blank slide</div></div></div>`; $("#pos").textContent = "End"; return }
    const s = S[cur], k = heldIdx(S, cur), nx = S[cur + 1];
    $("#m").innerHTML = `<div class="sech">${E(s.sec)}</div><div class="head">${s.label ? `<span>${E(s.label)}</span>` : ""}${E(s.cue)}</div>${verseTags(s)}
      <div class="grid"><div>${kpHTML(s.keyPoints) || (cur === 0 ? '<p class="note">The timer starts when you move to 1.b.</p>' : "")}</div>
      <div class="scr-wrap"><div class="scr">${stepHTML(S, cur, sub, D)}</div><div class="cap">${sub > 0 ? "Verse slide " + sub + " of " + subCount(s) : k === cur && hasSlide(s) ? "New slide at this point" : k >= 0 ? "Slide from " + E(S[k].label) + " stays up" : "Title slide"}</div></div></div>
      ${s.script ? `<div class="fulltext"><div class="rule"><span class="tag">Full text</span>${s.scriptDraft ? '<span class="draft">Draft</span>' : ""}</div><p class="script">${scriptHTML(s, sub)}</p></div>` : ""}
      ${nx ? `<div class="next">Up next: <b>${E(nx.label)}</b> ${E(nx.cue)}${hasSlide(nx) && heldIdx(S, cur + 1) === cur + 1 ? " (new slide)" : ""}</div>` : '<div class="next">End of talk</div>'}`;
    $("#pos").textContent = (cur + 1) + " of " + S.length }
  const syncEl = $("#sync"), setSync = (ok, msg) => { syncEl.className = ok ? "ok" : "bad"; syncEl.lastChild.textContent = msg };
  async function push(){ const m = {point: atEnd ? "__end" : S[cur].id, sub, at: Date.now()};
    try { localStorage.setItem("pres-" + FOLDER, cur); localStorage.setItem("pres-sub-" + FOLDER, sub) } catch (e) {}
    if (bc) try { bc.postMessage(m) } catch (e) {}
    try { const r = await fetch(relayURL(), {method: "POST", body: JSON.stringify(m)}); setSync(r.ok, r.ok ? "Monitors following" : "Sync failed (" + r.status + ")") }
    catch (e) { setSync(false, "Offline: only the slides window follows") } }
  const locked = () => !!$("#gate");
  function go(i, s){ if (locked()) return; const was = cur; atEnd = false; cur = Math.max(0, Math.min(S.length - 1, i)); sub = s || 0; if (cur !== was) moved(was); main(); nav(); window.scrollTo(0, 0); push(); TIMER.at(cur <= first) }
  function setSub(k){ if (locked()) return; sub = Math.max(0, Math.min(subCount(S[cur]), k)); main(); nav(); push() }
  // Next (button, arrow or clicker) is the only thing that records a practice time; jumping in the list does not.
  function next(){ if (locked() || atEnd) return; if (sub < subCount(S[cur])) return setSub(sub + 1);
    if (run) record(); if (cur < S.length - 1) return go(cur + 1);
    if (run) { atEnd = true; main(); nav(); push() } }      // practice: a black slide after the last point, so the last point gets timed
  const back = () => { if (atEnd) { atEnd = false; main(); nav(); push(); return } sub > 0 ? setSub(sub - 1) : cur > 0 ? go(cur - 1, subCount(S[cur - 1])) : null };
  let atEnd = false;

  // ---- Practice: time each point; later, compare the real talk against it ----
  // Practice: each Next writes the time spent on that point into its "seconds" in talk.json right away
  // (or keeps it on this computer if it can't reach GitHub). The first point (1.a) isn't timed, like the countdown.
  var PRUN = "pres-practice-" + FOLDER, PBASE = "pres-practice-base-" + FOLDER, PARR = "pres-arrive-" + FOLDER;
  function ls(k, v){ try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)) } catch (e) { return null } }
  let run = !!ls(PRUN), arrive = ls(PARR) || Date.now(), pmsg = "", lastRec = "", queue = {}, saveT = null, saving = false;
  const planned = p => { const l = ls(PBASE); return l && l.times[p.id] != null ? l.times[p.id] : ptSecs(p) };
  const hasPlan = () => S.some(p => planned(p) > 0);
  function moved(){ arrive = Date.now(); ls(PARR, arrive); pmsg = "" }
  function record(){ if (cur <= first) return; const p = S[cur], t = Math.max(1, Math.round((Date.now() - arrive) / 1000));
    queue[p.id] = t; p.seconds = t; const f = findPt(D, p.id); if (f) f.p.seconds = t; setLen(); lastRec = p.label + " " + mmss(t);
    clearTimeout(saveT); saveT = setTimeout(savePractice, 1200) }
  async function savePractice(){ if (saving) { saveT = setTimeout(savePractice, 1000); return } const times = queue; queue = {}; if (!Object.keys(times).length) return; saving = true;
    const date = new Date().toISOString(), apply = d => { d.sections.forEach(s => s.points.forEach(p => { if (times[p.id] != null) p.seconds = times[p.id] })); d.lastPractice = {date, total: talkSecs(d)} };
    const local = () => { const l = ls(PBASE) || {times: {}}; Object.assign(l.times, times); l.date = date; ls(PBASE, l) };
    try {
      if (!token()) { local(); pmsg = "Times kept on this computer only. Open Edit once in this browser to connect GitHub."; return }
      for (let k = 0; k < 4; k++) { try { const g = await GH.get(PATH + "/talk.json"), d = JSON.parse(g.text); apply(d);
          await GH.put(PATH + "/talk.json", b64e(JSON.stringify(d, null, 1) + "\n"), g.sha, "Practice times for " + (d.title || FOLDER)); D.lastPractice = d.lastPractice; pmsg = ""; return }
        catch (e) { if (e.status !== 409 && e.status !== 422) break } }
      local(); pmsg = "Couldn't reach GitHub; times kept on this computer.";
    } finally { saving = false; pace() } }
  function pace(){ const el = $("#pace"); if (!el) return; const b = hasPlan(), atStart = cur <= first;
    let h = `<label class="pchk" title="${run ? "Untick to stop practicing" : "Time each point: press Next when you finish a point"}"><input type="checkbox" id="pchk"${run ? " checked" : ""}> Practice</label>`;
    if (run) h += `<span class="pst rec">● ${atEnd ? "End. Last point timed" : atStart ? "Practicing · timing starts at 1.b" : "Practicing · " + mmss((Date.now() - arrive) / 1000) + " on this point" + (planned(S[cur]) ? " (last " + mmss(planned(S[cur])) + ")" : "")}</span>${lastRec ? `<span class="pst">Saved ${E(lastRec)}</span>` : ""}${pmsg ? `<span class="pst">${E(pmsg)}</span>` : ""}`;
    else if (pmsg) h += `<span class="pst">${E(pmsg)}</span>`;
    else if (b && !atStart && TIMER.elapsed() != null) { let exp = 0; for (let j = first + 1; j < cur; j++) exp += planned(S[j]);
      exp += Math.min((Date.now() - arrive) / 1000, planned(S[cur])); const dl = TIMER.elapsed() - exp;
      h += Math.abs(dl) < 15 ? `<span class="pst even">On pace with practice</span>` : dl > 0 ? `<span class="pst slow">${mmss(dl)} behind · speed up</span>` : `<span class="pst fast">${mmss(dl)} ahead · slow down</span>` }
    else if (b && atStart) h += `<span class="pst">Planned ${mmss(S.reduce((a, p) => a + planned(p), 0))}${D.lastPractice ? " · practiced " + new Date(D.lastPractice.date).toLocaleDateString() : ""}</span>`;
    if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h } }
  document.addEventListener("change", e => { if (e.target.id !== "pchk") return;
    run = e.target.checked; lastRec = ""; pmsg = ""; if (run) { ls(PRUN, 1); arrive = Date.now(); ls(PARR, arrive) } else { ls(PRUN, null); if (atEnd) { atEnd = false; main(); nav(); push() } clearTimeout(saveT); savePractice() } pace() });
  setInterval(pace, 500);
  $("#b").onclick = back; $("#n").onclick = next;
  $("#nav").onclick = e => { const b = e.target.closest("[data-i]"); if (b) go(+b.dataset.i) };
  $("#m").onclick = e => { const t = e.target.closest("[data-sub]"); if (t) { setSub(+t.dataset.sub === sub ? 0 : +t.dataset.sub); return } const b = e.target.closest("[data-v]"); if (b) showVerse(S[cur].verses[+b.dataset.v]) };
  $("#pop").onclick = () => { window.open("./?window=1", "slides-" + FOLDER, "popup,width=1280,height=720"); setTimeout(push, 900) };
  document.addEventListener("keydown", e => { const vd = $("#vd"); if ((vd && vd.open) || locked()) return;
    if (["ArrowRight","ArrowDown","PageDown"," "].includes(e.key)) { e.preventDefault(); next() } else if (["ArrowLeft","ArrowUp","PageUp"].includes(e.key)) { e.preventDefault(); back() } });
  main(); nav();
  presenterGate(C.passHash, "pres-ok", () => { push(); TIMER.at(cur <= first) });
}

// =====================================================================
// EDIT: change the talk; every change is committed to talk.json on GitHub.
// =====================================================================
function tokenSetup(onDone){
  document.body.innerHTML = `<div class="setup"><h2>Connect this browser to GitHub (one time)</h2>
    <p class="note">Edits are saved straight into the talk's files on GitHub, so this browser needs a GitHub token that can write to the <b>${E(C.owner)}/${E(C.repo)}</b> repository. It stays only in this browser.</p>
    <ol><li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → new fine-grained token</a>.</li>
      <li>Resource owner: <b>${E(C.owner)}</b>. Repository access: <b>Only select repositories</b> → <b>${E(C.repo)}</b>.</li>
      <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Pick an expiration, then Generate token.</li>
      <li>Paste it here.</li></ol>
    <input id="tok" type="password" placeholder="github_pat_…" autocomplete="off" aria-label="GitHub token">
    <div><button class="btn pri" id="tokSave" type="button">Save and continue</button> <span class="note" id="tokMsg"></span></div></div>`;
  $("#tokSave").onclick = async () => { const v = $("#tok").value.trim(); if (!v) return; $("#tokMsg").textContent = "Checking…";
    try { localStorage.setItem(tokenKey, v) } catch (e) {}
    try { const r = await fetch(`https://api.github.com/repos/${C.owner}/${C.repo}`, {headers: hdr()}); const j = await r.json();
      if (!r.ok || !(j.permissions && j.permissions.push)) throw new Error(r.ok ? "This token can't write to the repository." : "GitHub said " + r.status + ".");
      onDone() } catch (e) { try { localStorage.removeItem(tokenKey) } catch (_) {} $("#tokMsg").textContent = e.message + " Check the steps and try again." } };
}
function findPt(d, pid){ for (const s of d.sections) { const i = s.points.findIndex(p => p.id === pid); if (i >= 0) return {s, i, p: s.points[i]} } return null }
function applyOp(d, o){
  switch (o.t) {
    case "talk": d[o.f] = o.v; break;
    case "sec": { const s = d.sections.find(x => x.id === o.sid); if (s) s[o.f] = o.v; break }
    case "pt": { const f = findPt(d, o.pid); if (!f) break; if (o.v === "" && /^(text[XYW]|align|(eb|tt|sb)(X|Y|W|Size|Align|Color))$/.test(o.f)) delete f.p[o.f]; else f.p[o.f] = o.v; if (o.f === "script") f.p.scriptDraft = false; break }
    case "vset": { const f = findPt(d, o.pid); if (f && f.p.verses && f.p.verses[o.i]) f.p.verses[o.i][o.f] = o.v; break }
    case "vadd": { const f = findPt(d, o.pid); if (f) (f.p.verses = f.p.verses || []).push({ref: "", text: "", version: "NIV"}); break }
    case "vdel": { const f = findPt(d, o.pid); if (f && f.p.verses) f.p.verses.splice(o.i, 1); break }
    case "padd": { const s = d.sections.find(x => x.id === o.sid); if (s && !findPt(d, o.pid)) s.points.push({id: o.pid, cue: "New point", eyebrow: "", slideTitle: "", slide: "", layout: "left", image: "", keyPoints: [], verses: [], script: "", scriptDraft: false}); break }
    case "pdel": { const f = findPt(d, o.pid); if (f) f.s.points.splice(f.i, 1); break }
    case "pmove": { const f = findPt(d, o.pid); if (!f) break; const j = f.i + o.d; if (j < 0 || j >= f.s.points.length) break; const a = f.s.points; [a[f.i], a[j]] = [a[j], a[f.i]]; break }
    case "sadd": if (!d.sections.some(x => x.id === o.sid)) d.sections.push({id: o.sid, title: "New movement", minutes: "", points: []}); break;
    case "sdel": { const i = d.sections.findIndex(x => x.id === o.sid); if (i >= 0 && !d.sections[i].points.length) d.sections.splice(i, 1); break }
    case "smove": { const i = d.sections.findIndex(x => x.id === o.sid), j = i + o.d; if (i < 0 || j < 0 || j >= d.sections.length) break; const a = d.sections; [a[i], a[j]] = [a[j], a[i]]; break }
  }
}
async function edit(){
  if (!token()) { tokenSetup(() => edit()); return }
  document.body.innerHTML = `<p class="status">Loading the latest version from GitHub&hellip;</p>`;
  try { D = await loadTalk(true) } catch (e) {
    if (e.status === 401 || e.status === 403) { try { localStorage.removeItem(tokenKey) } catch (_) {} tokenSetup(() => edit()); return }
    document.body.innerHTML = `<p class="status">Couldn't load this talk from GitHub (${E(e.message)}). Reload to try again.</p>`; return }
  document.title = D.title + " · Edit";
  let sel = {k: "talk"}, pending = [], inflight = [], saving = false, timer = null;
  document.body.innerHTML = topBar("edit") + `<div class="lay"><nav class="cues" id="nav"></nav><main class="pane" id="m"></main></div>`;
  $(".top h1").insertAdjacentHTML("afterend", `<span id="save">All changes saved</span>`);
  const saveEl = () => $("#save");
  function setSave(t, err){ const s = saveEl(); s.textContent = t; s.className = err ? "err" : "" }
  function op(o, structural){ applyOp(D, o); pending.push(o); setSave("Saving…"); clearTimeout(timer); timer = setTimeout(flush, 900); structural ? render() : nav() }
  async function flush(){
    if (saving || !pending.length) return; saving = true; inflight = pending; pending = [];
    try { SHA = await GH.put(PATH + "/talk.json", b64e(JSON.stringify(D, null, 1) + "\n"), SHA, "Edit " + D.title); inflight = [];
      setSave(pending.length ? "Saving…" : "Saved. The live pages update in about a minute.") }
    catch (e) {
      if (e.status === 409 || e.status === 422) {       // someone else saved first: take theirs, replay ours on top
        try { const g = await GH.get(PATH + "/talk.json"); SHA = g.sha; const fresh = JSON.parse(g.text); inflight.concat(pending).forEach(o => applyOp(fresh, o));
          pending = inflight.concat(pending); inflight = []; D = fresh; render(); saving = false; return flush() } catch (_) {} }
      pending = inflight.concat(pending); inflight = [];
      setSave("Not saved (" + (e.detail || e.message) + "). Retrying…", true); setTimeout(flush, 5000) }
    saving = false; if (pending.length) flush();
  }
  window.addEventListener("beforeunload", e => { if (pending.length || inflight.length) { e.preventDefault(); e.returnValue = "" } });
  const S = () => steps(D).filter(s => s.id !== "cover");
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  function nav(){
    let h = `<button type="button" class="it${sel.k === "talk" ? " cur" : ""}" data-sel="talk"><span>Talk details</span></button>`;
    D.sections.forEach((s, si) => {
      h += `<button type="button" class="sec${sel.k === "sec" && sel.id === s.id ? " cur" : ""}" data-sel="sec" data-id="${E(s.id)}"><span>${si + 1}. ${E(s.title)}</span><span>${E(s.minutes)}${s.minutes ? "m" : ""}</span></button>`;
      s.points.forEach((p, pi) => { h += `<button type="button" class="it${sel.k === "pt" && sel.id === p.id ? " cur" : ""}" data-sel="pt" data-id="${E(p.id)}"><i>${si + 1}.${letter(pi)}</i><span>${E(p.cue || "(no cue)")}</span>${dotsHTML(p, -1)}</button>` });
      h += `<button type="button" class="btn small add" data-act="padd" data-id="${E(s.id)}">+ Point in ${si + 1}</button>`;
    });
    h += `<div style="margin:14px 8px"><button type="button" class="btn small" data-act="sadd">+ Movement</button></div>`;
    $("#nav").innerHTML = h;
  }
  function pane(){
    let e = `<div class="ed">`;
    if (sel.k === "talk") {
      e += `<h2>Talk details</h2>
        <label>Talk title<input data-t="talk" data-f="title" value="${E(D.title)}"></label>
        <div class="row"><label style="flex:2 1 240px">Audience<input data-t="talk" data-f="audience" value="${E(D.audience)}"></label>
          <label>Length<input data-t="talk" data-f="length" value="${E(D.length)}"></label><label>Date / event<input data-t="talk" data-f="event" value="${E(D.event)}"></label></div>
        ${talkSecs(D) ? `<p class="note"><b>Talk length: ${mmss(talkSecs(D))}</b>, the total of the times on each point${D.lastPractice ? ` (last practice ${new Date(D.lastPractice.date).toLocaleDateString()})` : ""}. Practice on Stage to set them, or type them on each point.</p>` : `<p class="note">No point times yet. Tick <b>Practice</b> on Stage at 1.a and run through the talk, or type a time on each point.</p>`}
        <label style="max-width:320px">Countdown if no point times (minutes)<input data-t="talk" data-f="timerMinutes" value="${E(D.timerMinutes)}" inputmode="numeric"></label>
        <p class="note">In Stage the timer resets on 1.a and starts when you move to 1.b.</p>
        <label>Big idea<textarea data-t="talk" data-f="bigIdea">${E(D.bigIdea)}</textarea></label>`;
    } else if (sel.k === "sec") {
      const si = D.sections.findIndex(x => x.id === sel.id), s = D.sections[si];
      if (!s) { sel = {k: "talk"}; return pane() }
      e += `<h2><span>${si + 1}.</span>Movement</h2>
        <div class="row"><label style="flex:3 1 240px">Title<input data-t="sec" data-id="${E(s.id)}" data-f="title" value="${E(s.title)}"></label><label style="flex:0 1 120px">Minutes<input data-t="sec" data-id="${E(s.id)}" data-f="minutes" value="${E(s.minutes)}" inputmode="numeric"></label></div>
        <div class="row"><button class="btn small" type="button" data-act="smove" data-id="${E(s.id)}" data-d="-1">↑ Move up</button><button class="btn small" type="button" data-act="smove" data-id="${E(s.id)}" data-d="1">↓ Move down</button>
          <button class="btn small" type="button" data-act="padd" data-id="${E(s.id)}">+ Add point</button><button class="btn small danger" type="button" data-act="sdel" data-id="${E(s.id)}">Delete movement</button></div>
        <p class="note">${s.points.length} points. Pick one on the left to edit it.</p>`;
    } else {
      const f = findPt(D, sel.id); if (!f) { sel = {k: "talk"}; return pane() }
      const p = f.p, L = S(), i = L.findIndex(x => x.id === p.id), lb = L[i].label, pv = L[i - 1], nx = L[i + 1];
      const vt = (p.verses || []).map((v, vi) => v && v.ref ? `<button type="button" data-ve="${vi}">${E(v.ref)}</button>` : "").join("");
      e += `<div class="cuerow"><span class="lbl">${E(lb)}</span><input class="cuein" data-t="pt" data-id="${E(p.id)}" data-f="cue" value="${E(p.cue)}" aria-label="Cue (your memory phrase)" placeholder="Cue">
          <label class="tm" title="Time on this point (m:ss)">Time<input data-t="pt" data-id="${E(p.id)}" data-f="seconds" value="${ptSecs(p) ? mmss(ptSecs(p)) : ""}" placeholder="0:00" inputmode="numeric"></label></div>
        <div class="vtags">${vt}<button type="button" class="vplus" data-ve="new" title="Add a verse">+</button></div>
        <div class="ptgrid"><label class="kpl">Key points<textarea class="kp auto" data-t="pt" data-id="${E(p.id)}" data-f="keyPoints" placeholder="One short phrase per line">${E((p.keyPoints || []).join("\n"))}</textarea></label>
          <div class="picside"><button type="button" class="prev small" id="prevs" data-act="sedit" title="Edit the slide">${prevHTML(p)}</button><button type="button" class="linkbtn" data-act="sedit">Edit slide</button></div></div>
        <div class="ed-l"><span class="tag">What I'll say</span> ${p.scriptDraft ? '<span class="draft">Draft</span>' : ""}<span class="note" style="font-size:12px">Type / to add a verse slide</span></div>
        <div class="rich big" contenteditable="true" spellcheck="true" data-id="${E(p.id)}" data-f="script" role="textbox" aria-multiline="true" aria-label="What I'll say">${richHTML(p)}</div>
        <dialog class="sdlg" id="sdlg"><div class="ed"><div class="pgh"><b>Slide for ${E(lb)}</b><button type="button" class="btn small pri" data-act="sdone">Done</button></div>
        <div class="prev" id="prev">${prevHTML(p)}</div>
        <div class="slideed" id="slideed">
        <div class="row"><label style="flex:1 1 200px">Small line on top (optional)<input data-t="pt" data-id="${E(p.id)}" data-f="eyebrow" value="${E(p.eyebrow)}" placeholder="e.g. Conference theme"></label>
          <label style="flex:0 1 200px">Style<select data-t="pt" data-id="${E(p.id)}" data-f="layout"><option value="left"${p.layout !== "center" ? " selected" : ""}>Gold title, white subtitle</option><option value="center"${p.layout === "center" ? " selected" : ""}>White title, gold subtitle</option></select></label></div>
        <label>Title<textarea class="auto" data-t="pt" data-id="${E(p.id)}" data-f="slideTitle">${E(p.slideTitle)}</textarea></label>
        <label>Subtitle<textarea class="auto" data-t="pt" data-id="${E(p.id)}" data-f="slide">${E(p.slide)}</textarea></label>
        ${posHTML(p)}
        <div class="row"><span class="tag">Picture (no words in it; the text goes on top)</span>${p.image ? `<button class="btn small" type="button" data-act="imgdel" data-id="${E(p.id)}">Remove image</button>` : ""}
          <label class="btn small" style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink);display:inline-flex">${p.image ? "Replace" : "Add"} image<input type="file" accept="image/*" data-img="${E(p.id)}" hidden></label><span class="note" id="imgmsg"></span></div>
        <p class="note">Leave the text and picture empty for no new slide at this point.</p></div></div></dialog>
        <div class="row"><button class="btn small" type="button" data-act="pmove" data-id="${E(p.id)}" data-d="-1">↑ Up</button><button class="btn small" type="button" data-act="pmove" data-id="${E(p.id)}" data-d="1">↓ Down</button>
          <button class="btn small danger" type="button" data-act="pdel" data-id="${E(p.id)}">Delete point</button></div>
        <div class="pager">${pv ? `<button class="btn small" type="button" data-sel="pt" data-id="${E(pv.id)}">← ${E(pv.label)} ${E(pv.cue)}</button>` : "<span></span>"}${nx ? `<button class="btn small" type="button" data-sel="pt" data-id="${E(nx.id)}">${E(nx.label)} ${E(nx.cue)} →</button>` : ""}</div>`;
    }
    $("#m").innerHTML = e + `</div>`; autoAll();
    const dl = $("#sdlg"); if (dl) { dl.addEventListener("close", () => { slideOpen = false; const ps = $("#prevs"), f = findPt(D, sel.id); if (ps && f) ps.innerHTML = prevHTML(f.p) }); if (slideOpen) openSlide() }
  }
  // "What I'll say" is a text box where verse tags are real tags: typing "/" lists this point's verses, picking one inserts a tag,
  // and a tag is removed whole (Backspace, Delete, or selecting it with the text around it). It is saved as [Ref] in the text.
  const chip = ref => `<span class="vchip" contenteditable="false" data-ref="${E(ref)}">${E(ref)}</span>`;
  function richHTML(p){ let h = "", last = 0; const t = p.script || "";
    for (const m of t.matchAll(TAG)) { const v = (p.verses || []).find(x => x && x.ref && x.ref.trim() === m[1].trim()); if (!v) continue; h += E(t.slice(last, m.index)) + chip(v.ref); last = m.index + m[0].length }
    return h + E(t.slice(last)) }
  function richText(el){ let out = "";
    const walk = n => { for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue.replace(/​/g, "");
      else if (c.nodeType === 1) { if (c.classList.contains("vchip")) out += "[" + c.dataset.ref + "]"; else if (c.tagName === "BR") out += "\n";
        else { const blk = /^(DIV|P)$/.test(c.tagName); if (blk && out && !out.endsWith("\n")) out += "\n"; walk(c) } } } };
    walk(el); return out.replace(/\n$/, "") }
  let richT = null;
  function saveRich(el){ clearTimeout(richT); const f = findPt(D, el.dataset.id); if (!f) return; const v = richText(el); if (v === (f.p.script || "")) return;
    op({t: "pt", pid: el.dataset.id, f: "script", v}); const d = el.previousElementSibling && el.previousElementSibling.querySelector(".draft"); if (d) d.remove() }
  document.addEventListener("input", e => { const el = e.target.closest && e.target.closest(".rich"); if (!el) return; clearTimeout(richT); richT = setTimeout(() => saveRich(el), 900) });
  document.addEventListener("focusout", e => { const el = e.target.closest && e.target.closest(".rich"); if (el) saveRich(el) });
  document.addEventListener("paste", e => { const el = e.target.closest && e.target.closest(".rich"); if (!el) return; e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")) });
  let vmenu = null;
  function closeVmenu(){ if (vmenu) { vmenu.el.remove(); vmenu = null } }
  function openVmenu(el){ const f = findPt(D, el.dataset.id); const vs = f ? (f.p.verses || []).filter(v => v && v.ref) : []; if (!vs.length) return;
    const sl = getSelection(); if (!sl.rangeCount) return; const r = sl.getRangeAt(0); const node = r.startContainer, off = r.startOffset;
    if (node.nodeType !== 3 || off < 1 || node.nodeValue[off - 1] !== "/") return;
    closeVmenu(); const m = document.createElement("div"); m.className = "vmenu"; m.innerHTML = `<div class="vmh">Verse slide</div>` + vs.map((v, i) => `<button type="button" data-k="${i}"${i ? "" : ' class="on"'}>${E(v.ref)}</button>`).join("");
    document.body.appendChild(m); const rr = r.getBoundingClientRect(), x = rr.left || el.getBoundingClientRect().left, y = (rr.bottom || el.getBoundingClientRect().top) + 4;
    m.style.left = Math.min(x, innerWidth - 240) + "px"; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + "px";
    vmenu = {el: m, box: el, node, off, vs, k: 0}; m.onmousedown = e => e.preventDefault(); m.onclick = e => { const b = e.target.closest("[data-k]"); if (b) pickV(+b.dataset.k) } }
  function pickV(k){ const {box, node, off, vs} = vmenu; closeVmenu(); if (!node.isConnected || node.nodeValue[off - 1] !== "/") return;
    const after = node.splitText(off); node.nodeValue = node.nodeValue.slice(0, -1);
    const t = document.createElement("template"); t.innerHTML = chip(vs[k].ref); const c = t.content.firstChild; after.parentNode.insertBefore(c, after);
    if (!after.nodeValue.startsWith(" ")) after.nodeValue = "​" + after.nodeValue;
    const r = document.createRange(); r.setStart(after, after.nodeValue.startsWith("​") ? 1 : 0); r.collapse(true); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); box.focus(); saveRich(box) }
  document.addEventListener("keydown", e => {
    if (vmenu) { const n = vmenu.vs.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); vmenu.k = (vmenu.k + (e.key === "ArrowDown" ? 1 : n - 1)) % n; vmenu.el.querySelectorAll("[data-k]").forEach((b, i) => b.classList.toggle("on", i === vmenu.k)); return }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickV(vmenu.k); return }
      closeVmenu(); if (e.key === "Escape") { e.preventDefault(); return } }
    const el = e.target.closest && e.target.closest(".rich"); if (!el) return;
    if (e.key === "/") setTimeout(() => openVmenu(el), 0);
    else if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak") } }, true);
  document.addEventListener("mousedown", e => { if (vmenu && !vmenu.el.contains(e.target)) closeVmenu() });
  // Text boxes grow to fit their text (they can still be dragged bigger).
  const autoSize = t => { t.style.height = "auto"; t.style.height = (t.scrollHeight + 4) + "px" };
  function autoAll(){ document.querySelectorAll("#m textarea.auto").forEach(autoSize) }
  addEventListener("resize", () => autoAll());
  let slideOpen = false;
  function openSlide(){ const dl = $("#sdlg"); if (!dl) return; slideOpen = true; if (!dl.open) try { dl.showModal() } catch (e) { dl.setAttribute("open", "") } autoAll(); const f = findPt(D, sel.id); if (f) fixPos(f.p) }
  // Verse pop-up in Edit: change the reference, text and version, or remove it.
  function verseEdit(pid, i){
    const f = findPt(D, pid); if (!f) return; const isNew = i === "new", v = isNew ? {ref: "", text: "", version: "NIV"} : f.p.verses[+i];
    let d = $("#ved"); if (!d) { document.body.insertAdjacentHTML("beforeend", `<dialog class="verse ved" id="ved"><form method="dialog" class="ed">
        <label>Reference<input id="ver" placeholder="e.g. John 15:5"></label><label>Text<textarea id="vet" class="auto" style="min-height:140px"></textarea></label>
        <div class="row"><label style="flex:0 1 140px">Version<input id="vev"></label><span style="flex:1"></span>
          <button class="btn small danger" type="button" id="vedel">Remove</button><button class="btn small" type="button" id="vecan">Cancel</button><button class="btn small pri" type="submit" id="vesave">Save</button></div></form></dialog>`); d = $("#ved");
      $("#vecan").onclick = () => d.close(); $("#vet").addEventListener("input", e => autoSize(e.target)) }
    $("#ver").value = v.ref || ""; $("#vet").value = v.text || ""; $("#vev").value = v.version || ""; $("#vedel").hidden = isNew; $("#vedel").textContent = "Remove"; delete $("#vedel").dataset.armed;
    $("#vedel").onclick = () => { const b = $("#vedel"); if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Tap again to remove"; return } d.close(); op({t: "vdel", pid, i: +i}, true) };
    d.querySelector("form").onsubmit = ev => { ev.preventDefault(); const nv = {ref: $("#ver").value.trim(), text: $("#vet").value, version: $("#vev").value.trim()}; d.close();
      if (isNew) { if (!nv.ref && !nv.text) return; op({t: "vadd", pid}); i = f.p.verses.length - 1 }
      for (const k of ["ref", "text", "version"]) if (isNew || nv[k] !== (v[k] || "")) op({t: "vset", pid, i: +i, f: k, v: nv[k]});
      render() };
    try { d.showModal() } catch (e) { d.setAttribute("open", "") } setTimeout(() => autoSize($("#vet")), 0); $(isNew ? "#ver" : "#vet").focus();
  }
  function render(){ nav(); pane() }
  let posOpen = false;
  const rng = (p, f, lb, v, lo, hi) => `<label class="rng">${lb} <output>${Math.round(v)}%</output><input type="range" min="${lo}" max="${hi}" step="1" value="${v}" data-t="pt" data-id="${E(p.id)}" data-f="${f}"></label>`;
  const alSel = (p, f, v, dflt) => `<label class="alg">Align<select data-t="pt" data-id="${E(p.id)}" data-f="${f}">${dflt ? `<option value=""${v ? "" : " selected"}>${dflt}</option>` : ""}${ALIGNS.map(a => `<option value="${a}"${v === a ? " selected" : ""}>${a[0].toUpperCase() + a.slice(1)}</option>`).join("")}</select></label>`;
  function posHTML(p){
    const b = textBox(p);
    let h = `<details class="pos" id="pos-${E(p.id)}"${posOpen ? " open" : ""}><summary>Text size, width and color</summary><div class="pgh"><span class="note">Drag any line in the preview to move it.</span><button class="btn small" type="button" data-act="posreset" data-g="all" data-id="${E(p.id)}">Reset all</button></div>`;
    for (const [k, f, lb] of LINES) { if (!(p[f] || "").trim()) continue;
      h += `<div class="pgrp"><div class="pgh"><b>${lb}</b><button class="btn small" type="button" data-act="posreset" data-g="${k}" data-id="${E(p.id)}">Reset</button></div><div class="row">
        ${rng(p, k + "Size", "Size", num(p[k + "Size"], 100), 30, 300)}${rng(p, k + "W", "Width", num(p[k + "W"], b.w), 10, 100)}${alSel(p, k + "Align", p[k + "Align"] || "", "Default")}<label class="clr">Color<input type="color" value="${E(p[k + "Color"] || lineColor(p, k))}" data-t="pt" data-id="${E(p.id)}" data-f="${k}Color"></label></div></div>`;
    }
    return h + `</details>`;
  }
  const lineColor = (p, k) => k === "eb" || (k === "tt") === (p.layout !== "center") ? "#e9b949" : "#ffffff";
  // Where a line sits right now in the preview, in % of the slide (a line in the block takes the block's left edge and width).
  function measure(k){
    const el = $(`#prev [data-k="${k}"]`); if (!el) return null; const sl = el.closest(".slide").getBoundingClientRect(), r = el.getBoundingClientRect(), bx = el.classList.contains("tx1") ? r : el.parentElement.getBoundingClientRect();
    const q = v => Math.round(v * 10) / 10;
    return {X: q((bx.left - sl.left) / sl.width * 100), Y: q((r.top + r.height / 2 - sl.top) / sl.height * 100), W: q(bx.width / sl.width * 100)};
  }
  function missing(p, k){ const m = measure(k), o = {}; if (m) for (const a of ["X", "Y", "W"]) if (!isSet(p[k + a])) o[k + a] = m[a]; return o }
  // Sliders of lines still in the block show where they sit now.
  function fixPos(p){ for (const [k] of LINES) { if (elPos(p, k)) continue; const m = measure(k); if (!m) continue;
    for (const a of ["X", "Y", "W"]) { const i = $(`#pos-${CSS.escape(p.id)} input[data-f="${k + a}"]`); if (i) { i.value = m[a]; i.parentElement.querySelector("output").textContent = Math.round(m[a]) + "%" } } } }
  function refreshSlide(id){ const f = findPt(D, id); if (!f) return; const pv = $("#prev"), ps = $("#prevs"), pp = $("#pos-" + CSS.escape(id)); if (pv) pv.innerHTML = prevHTML(f.p); if (ps) ps.innerHTML = prevHTML(f.p); if (pp) pp.outerHTML = posHTML(f.p); fixPos(f.p) }
  const LF = LINES.flatMap(([k]) => ["X", "Y", "W", "Size", "Align", "Color"].map(a => k + a)), POSF = ["textX", "textY", "textW", "align", ...LF], SLF = ["eyebrow", "slideTitle", "slide", "layout", ...POSF];
  const isLXYW = f => /^(eb|tt|sb)[XYW]$/.test(f);
  document.addEventListener("toggle", ev => { if (ev.target.classList && ev.target.classList.contains("pos")) posOpen = ev.target.open }, true);
  document.addEventListener("mousedown", ev => { if (ev.target.closest && ev.target.closest("#prev [data-k]")) ev.preventDefault() });
  // Drag one line inside the preview to place it on its own.
  document.addEventListener("pointerdown", ev => {
    let el = ev.target.closest("#prev [data-k]"); if (!el || sel.k !== "pt") return; const f = findPt(D, sel.id); if (!f) return;
    ev.preventDefault(); const k = el.dataset.k, add = missing(f.p, k), st = {...f.p, ...add};
    if (Object.keys(add).length) { $("#prev").innerHTML = prevHTML(st); el = $(`#prev [data-k="${k}"]`) }
    const box = el.closest(".slide").getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY, bx = num(st[k + "X"], 0), by = num(st[k + "Y"], 50); let nx = bx, ny = by;
    el.classList.add("drag");
    const mv = e => { nx = Math.round(Math.max(-20, Math.min(95, bx + (e.clientX - x0) / box.width * 100)) * 10) / 10; ny = Math.round(Math.max(0, Math.min(100, by + (e.clientY - y0) / box.height * 100)) * 10) / 10; el.style.left = nx + "%"; el.style.top = ny + "%" };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
      if (nx === bx && ny === by) { refreshSlide(f.p.id); return }
      for (const [a, v] of Object.entries({...add, [k + "X"]: nx, [k + "Y"]: ny})) op({t: "pt", pid: f.p.id, f: a, v});
      refreshSlide(f.p.id) };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });
  function prevHTML(p){ return hasSlide(p) ? slideBox(p) : '<div class="slide"><div class="tx" style="justify-content:center;align-items:center;opacity:.6;font-size:16px;color:#fff">No slide at this point</div></div>' }
  document.addEventListener("input", ev => { const el = ev.target; if (el.matches && el.matches("#m textarea.auto")) autoSize(el); if (el.dataset.t !== "pt" || !SLF.includes(el.dataset.f)) return;
    if (el.type === "range") { const o = el.parentElement.querySelector("output"); if (o) o.textContent = el.value + "%" }
    const f = findPt(D, el.dataset.id), pv = $("#prev"); if (!f || !pv) return;
    const add = isLXYW(el.dataset.f) ? missing(f.p, el.dataset.f.slice(0, 2)) : {};
    pv.innerHTML = prevHTML({...f.p, ...add, [el.dataset.f]: el.value}); if (!isLXYW(el.dataset.f)) fixPos(f.p) });
  document.addEventListener("click", ev => {
    const s = ev.target.closest("[data-sel]"); if (s) { sel = {k: s.dataset.sel, id: s.dataset.id}; render(); if (matchMedia("(max-width:820px)").matches) $("#m").scrollIntoView(); else window.scrollTo(0, 0); return }
    const v = ev.target.closest(".vtags [data-ve]"); if (v && sel.k === "pt") { verseEdit(sel.id, v.dataset.ve); return }
    if (ev.target.closest('[data-act="sedit"]')) { openSlide(); return }
    if (ev.target.closest('[data-act="sdone"]')) { const dl = $("#sdlg"); if (dl) dl.close(); slideOpen = false; return }
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    if (a === "padd") { const pid = newId("p"); op({t: "padd", sid: id, pid}); sel = {k: "pt", id: pid}; render(); return }
    if (a === "sadd") { const sid = newId("s"); op({t: "sadd", sid}); sel = {k: "sec", id: sid}; render(); return }
    if (a === "pmove" || a === "smove") { op({t: a, [a === "pmove" ? "pid" : "sid"]: id, d: +b.dataset.d}, true); return }
    if (a === "vadd") { op({t: "vadd", pid: id}, true); const ins = document.querySelectorAll(`[data-t="v"][data-id="${CSS.escape(id)}"][data-f="ref"]`); if (ins.length) ins[ins.length - 1].focus(); return }
    if (a === "posreset") { const g = b.dataset.g, fs = g === "all" ? POSF : ["X", "Y", "W", "Size", "Align", "Color"].map(x => g + x);
      fs.forEach(k => op({t: "pt", pid: id, f: k, v: ""})); refreshSlide(id); return }
    if (a === "imgdel") { op({t: "pt", pid: id, f: "image", v: ""}, true); return }
    if (a === "vdel" || a === "pdel" || a === "sdel") {
      if (a === "sdel") { const s = D.sections.find(x => x.id === id); if (s && s.points.length) { b.textContent = "Delete its points first"; return } }
      if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Tap again to confirm"; return }
      if (a === "vdel") op({t: "vdel", pid: id, i: +b.dataset.i}, true);
      if (a === "pdel") { const L = S(), i = L.findIndex(x => x.id === id), nb = L[i + 1] || L[i - 1]; sel = nb ? {k: "pt", id: nb.id} : {k: "talk"}; op({t: "pdel", pid: id}, true) }
      if (a === "sdel") { sel = {k: "talk"}; op({t: "sdel", sid: id}, true) }
    }
  });
  document.addEventListener("change", async ev => {
    const el = ev.target;
    if (el.dataset.img) { const file = el.files && el.files[0]; if (!file) return; const pid = el.dataset.img, msg = $("#imgmsg"); if (msg) msg.textContent = "Uploading…";
      try { const url = await toJpeg(file), path = `slides/${pid}-${Date.now().toString(36)}.jpg`;
        await GH.put(PATH + "/" + path, url.split(",")[1], null, "Slide image for " + pid); LOCALIMG[path] = url; op({t: "pt", pid, f: "image", v: path}, true) }
      catch (e) { if (msg) msg.textContent = "Upload failed: " + (e.detail || e.message) } return }
    const t = el.dataset.t; if (!t) return; let v = el.value;
    if (t === "talk") op({t: "talk", f: el.dataset.f, v: el.dataset.f === "timerMinutes" ? v.trim() : v});
    else if (t === "sec") op({t: "sec", sid: el.dataset.id, f: el.dataset.f, v: el.dataset.f === "minutes" ? v.trim() : v});
    else if (t === "pt") { if (el.dataset.f === "keyPoints") v = v.split("\n").map(x => x.trim()).filter(Boolean); if (POSF.includes(el.dataset.f) && el.type === "range") v = +v;
      if (el.dataset.f === "seconds") { v = parseTime(v); el.value = v ? mmss(v) : "" }
      if (isLXYW(el.dataset.f)) { const f0 = findPt(D, el.dataset.id); if (f0 && !elPos(f0.p, el.dataset.f.slice(0, 2))) { const ad = missing(f0.p, el.dataset.f.slice(0, 2)); delete ad[el.dataset.f]; for (const [a, x] of Object.entries(ad)) op({t: "pt", pid: el.dataset.id, f: a, v: x}) } }
      op({t: "pt", pid: el.dataset.id, f: el.dataset.f, v});
      if (el.dataset.f === "script") { const d = el.parentElement.querySelector(".draft"); if (d) d.remove() }
      if (SLF.includes(el.dataset.f)) refreshSlide(el.dataset.id); if (el.dataset.f === "cue") { const h = $(".ed h2"); if (h) h.lastChild.textContent = v } }
    else if (t === "v") { op({t: "vset", pid: el.dataset.id, i: +el.dataset.i, f: el.dataset.f, v: el.dataset.f === "text" ? v : v.trim()}); if (el.dataset.f === "ref") { const tags = document.querySelector(".ed .vtags"); const f = findPt(D, el.dataset.id); if (f) { const nt = verseTags(f.p); if (tags) tags.outerHTML = nt || ""; else if (nt) $(".ed h2").insertAdjacentHTML("afterend", nt) } } }
  });
  render();
}
async function toJpeg(file){
  const bm = await createImageBitmap(file); const w = Math.min(1920, bm.width), h = Math.round(bm.height * w / bm.width);
  const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(bm, 0, 0, w, h); return c.toDataURL("image/jpeg", .85);
}

// =====================================================================
// INDEX: list of talks (talks.json) and New talk.
// =====================================================================
const STUB = mode => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Talk</title>
<link rel="stylesheet" href="../common/app.css?v=12"><link rel="stylesheet" href="../common/countdown.css?v=12"><link rel="stylesheet" href="../common/gate.css?v=12"></head>
<body data-mode="${mode}"><script src="../common/config.js?v=12"></script><script src="../common/countdown.js?v=12"></script><script src="../common/gate.js?v=12"></script><script src="../common/app.js?v=12"></script></body></html>
`;
const folderName = t => t.replace(/&/g, " ").replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join("-");
async function index(){
  document.body.innerHTML = `<div class="setup" style="max-width:820px"><h1 style="margin:0">Talks</h1><div id="list"><p class="note">Loading…</p></div>
    <div><button class="btn" id="new" type="button">+ New talk</button> <span class="note" id="msg"></span></div></div>`;
  let list = []; try { list = await (await fetch("talks.json?t=" + Date.now(), {cache: "no-store"})).json() } catch (e) {}
  $("#list").innerHTML = list.length ? `<ul>${list.map(t => `<li style="margin:6px 0"><b>${E(t.title)}</b>: <a href="${E(t.folder)}/present.html">Stage</a> · <a href="${E(t.folder)}/edit.html">Edit</a> · <a href="${E(t.folder)}/">Monitor (slides)</a></li>`).join("")}</ul>` : '<p class="note">No talks yet.</p>';
  $("#new").onclick = () => presenterGate(C.passHash, "pres-ok", async () => {
    if (!token()) { tokenSetup(() => location.reload()); return }
    const title = prompt("Title of the new talk?"); if (!title) return; const folder = folderName(title); const msg = $("#msg");
    if (!folder) return; if (list.some(t => t.folder === folder)) { msg.textContent = "A talk with that folder already exists."; return }
    msg.textContent = "Creating…";
    try { const base = C.root + "/" + folder;
      const talk = {format: "talk/1", id: folder.toLowerCase(), title, audience: "", length: "", event: "", bigIdea: "", timerMinutes: "", coverImage: "", titleImage: "",
        relayTopic: "kim-talk-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, "0")).join(""),
        sections: [{id: "s1", title: "Opening", minutes: "", points: [{id: "p1", cue: "Opening slide", eyebrow: "", slideTitle: title, slide: "", layout: "center", image: "", keyPoints: [], verses: [], script: "", scriptDraft: false}]}]};
      await GH.put(base + "/talk.json", b64e(JSON.stringify(talk, null, 1) + "\n"), null, "New talk: " + title);
      for (const [f, m] of [["index.html", "monitor"], ["present.html", "present"], ["edit.html", "edit"]]) await GH.put(base + "/" + f, b64e(STUB(m)), null, "New talk: " + title);
      let sha = null, cur = []; try { const g = await GH.get(C.root + "/talks.json"); sha = g.sha; cur = JSON.parse(g.text) } catch (e) {}
      cur.push({folder, title}); await GH.put(C.root + "/talks.json", b64e(JSON.stringify(cur, null, 1) + "\n"), sha, "List new talk: " + title);
      msg.innerHTML = `Created. Its pages go live in about a minute: <a href="${E(folder)}/edit.html">open the editor</a>.` }
    catch (e) { msg.textContent = "Couldn't create it: " + (e.detail || e.message) }
  });
}

({monitor, present, edit, index}[MODE] || (() => {}))();
})();
