// One script for every talk page. The page picks its mode with <body data-mode="monitor|present|edit|index">.
// Talk data lives in talk.json in the talk's folder (format "talk/1"); slide images in its slides/ folder.
(function(){
"use strict";
const C = window.TALKS_CONFIG;
const MODE = document.body.dataset.mode;
const $ = s => document.querySelector(s);
const E = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const parts = location.pathname.replace(/\/(index|present|edit|present2|edit2|slides2|audience)\.html$/, "/").split("/").filter(Boolean);
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
  if (fresh || token()) { try { const g = await GH.get(PATH + "/talk.json"); SHA = g.sha; return upgrade(JSON.parse(g.text)) } catch (e) { if (fresh) throw e } }
  const r = await fetch("talk.json?t=" + Date.now(), {cache: "no-store"}); if (!r.ok) throw new Error("talk.json " + r.status); return upgrade(await r.json());
}
const letter = i => String.fromCharCode(97 + i);
// Talks saved before Nov 5 kept key points in a separate list with [@id] markers in the text. Turn them into bullet tags in the text.
function upgrade(d){ if (!d || !d.sections) return d; d.sections.forEach(s => s.points.forEach(p => { if (!Array.isArray(p.keyPoints)) return;
  const K = new Set([...(p.verses || []).map(v => v && v.ref && v.ref.trim()), ...(p.slides || []).map(x => x && x.name && x.name.trim()), "Stop", "Main slide"].filter(Boolean));
  const conv = l => l.replace(/\[([^\[\]\n]{1,60})\]/g, (a, r) => K.has(r.trim()) ? "{" + r.trim() + "}" : "(" + r + ")");
  const mk = (lvl, t) => "[#" + lvl + " " + t.replace(/[\[\]\n]+/g, " ").replace(/\s+/g, " ").trim() + "]";
  let sc = (p.script || "").replace(/\[!([^\[\]\n]{1,60})\]\s?/g, ""); const tags = {}, loose = [], seen = new Set();
  for (const x of p.keyPoints) { const m = (x || "").match(/^\s*\[@([a-z0-9]+)\]\s*/), body = (m ? x.slice(m[0].length) : x || "").trim(), L = body.split("\n").map(l => l.trim()).filter(Boolean); if (!L.length) continue;
    const t = mk(1, conv(L[0])) + L.slice(1).map(l => "\n" + mk(2, conv(l))).join(""); if (m && sc.includes("[@" + m[1] + "]")) tags[m[1]] = t; else loose.push(t) }
  sc = sc.replace(/\[@([a-z0-9]+)\]/g, (a, id) => tags[id] && !seen.has(id) ? (seen.add(id), tags[id]) : "");
  for (const t of loose) sc = sc.replace(/\s+$/, "") + (sc.trim() ? "\n" : "") + t;
  p.script = sc; delete p.keyPoints })); return d }
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
const AIH = (k, ...a) => { try { return window.TALKAI && TALKAI.html[k] ? TALKAI.html[k](...a) : "" } catch (e) { return "" } };   // ✨ AI buttons, drawn by ai.js when it is loaded
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
function slideBox(p, cls){
  const c = p.layout === "center", tl = (p.slideTitle || "").trim(), sb = (p.slide || "").trim(), b = textBox(p), sz = c ? 7.5 : fitSize((tl + " " + sb).trim().length);
  const base = {eb: 2.5, tt: sz, sb: c ? 4.6 : sz}; let inner = "", out = "";
  for (const [k, f] of LINES) { const t = (p[f] || "").trim(); if (!t) continue;
    const al = ALIGNS.includes(p[k + "Align"]) ? p[k + "Align"] : "";
    let st = `font-size:${+(base[k] * num(p[k + "Size"], 100) / 100).toFixed(3)}cqw`; if (/^#[0-9a-f]{6}$/i.test(p[k + "Color"] || "")) st += `;color:${p[k + "Color"]}`;
    if (elPos(p, k)) out += `<div class="${k} tx1" data-k="${k}" style="${st};left:${num(p[k + "X"], b.x)}%;top:${num(p[k + "Y"], 50)}%;width:${num(p[k + "W"], b.w)}%;text-align:${al || b.a}">${E(t)}</div>`;
    else inner += `<div class="${k}" data-k="${k}" style="${st}${al ? `;text-align:${al};align-self:${SELF[al]}` : ""}">${E(t)}</div>`;
  }
  const st = `left:${b.x}%;top:${b.y}%;width:${b.w}%;text-align:${b.a};align-items:${SELF[b.a]}`;
  return `<div class="slide ${c ? "center" : "left"}${cls || ""}">${p.image ? imgTag(p.image) : ""}${inner ? `<div class="tx" style="${st}">${inner}</div>` : ""}${out}</div>`;
}
// Tags in a point's key points and full text are its steps on Stage (key points first, then full text):
// [Acts 1:8] (one of its verses) shows that verse alone; [Main slide] brings its own slide back; [Stop] is a pause that keeps the slide.
const TAG = /\[([^\[\]\n]{1,300})\]/g;
const MAIN = "Main slide", MAINTAG = {ref: MAIN, main: true}, STOP = "Stop", STOPTAG = {ref: STOP, stop: true};
// Reading cues: hints for how to say a part (shown on Stage, followed by the AI voice). They never change slides. Normal ends them.
const CUES = {"pause": ["⏸", "Pause"], "long pause": ["⏸", "Long pause"], "slow": ["🐢", "Slow"], "fast": ["🐇", "Fast"], "excited": ["✨", "Excited"], "exclaim": ["❗", "Exclaim"], "calm": ["🌊", "Calm"], "gentle": ["🤍", "Gentle"], "normal": ["↺", "Normal"]};
const CUETAG = {}; for (const [k, [ic, nm]] of Object.entries(CUES)) CUETAG[k] = {ref: nm, cue: k, icon: ic};
function tagOf(p, t){ t = t.trim(); const bm = t.match(/^#([12])(?:\s+([\s\S]*))?$/); if (bm) return {bullet: true, lvl: +bm[1], text: (bm[2] || "").trim(), ref: t}; if (t.length > 60) return null; if (CUETAG[t.toLowerCase()]) return CUETAG[t.toLowerCase()]; if (t[0] === "!") { const v = tagOf(p, t.slice(1)); if (!v) return null; if (v.anchor) return {...v, unplaced: true}; const u = Object.create(v); u.unplaced = true; return u }
  if (/^@[a-z0-9]+$/.test(t)) return {ref: t, anchor: true, id: t.slice(1)}; const l = t.toLowerCase(); if (l === MAIN.toLowerCase()) return MAINTAG; if (l === STOP.toLowerCase()) return STOPTAG; return (p.verses || []).find(x => x && x.ref && x.ref.trim() === t) || (p.slides || []).find(x => x && x.name && x.name.trim() === t) || null }
// Extra slides on a point (p.slides): {name, type: "image" | "plain", eyebrow, slideTitle, slide, layout, image, placement…}. The tag is [name].
// More types can be added here: give each a name, whether it has a picture, and how it draws.
const SLIDE_TYPES = {image: "Image", plain: "Plain", bullets: "Bullets", bulletsimg: "Bullets on image", quote: "Quote", video: "Video"};
const hasPic = t => t === "image" || t === "bulletsimg", isBul = t => t === "bullets" || t === "bulletsimg";
const isXS = v => !!(v && SLIDE_TYPES[v.type]);
function xsHTML(v){ if (v.type === "video") return videoHTML(v); if (v.type === "quote") return quoteHTML(v); if (isBul(v.type)) return bulletsHTML(v); return v.type === "plain" ? slideBox({...v, image: ""}, " plain") : slideBox(v) }
// A video slide plays from the start each time it comes up (sound on the slides screens, muted on Stage and in Edit).
// If "next when it ends" is on, Stage moves to the next step when it finishes.
// The video can be an uploaded file (v.video) or a link (v.url): YouTube, or a direct link to a video file. A link wins if both are set.
function ytInfo(u){ const m = (u || "").match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/); if (!m) return null;
  const t = (u.match(/[?&#](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(\d+)s?/) || []); return {id: m[1], start: (+t[1] || 0) * 3600 + (+t[2] || 0) * 60 + (+t[3] || 0)} }
function videoHTML(v){ const nx = v.autoNext !== false ? ' data-next="1"' : "", url = (v.url || "").trim(), yt = ytInfo(url);
  if (yt) return `<div class="slide vid"${nx}><div class="yt" data-yt="${yt.id}" data-start="${yt.start}"></div></div>`;
  if (url) return `<div class="slide vid"${nx}><video src="${E(url)}" playsinline preload="auto"></video></div>`;
  return v.video ? `<div class="slide vid"${nx}><video data-p="${E(v.video)}" src="${E(LOCALIMG[v.video] || v.video)}" playsinline preload="auto" onerror="__imgFallback(this)"></video></div>`
  : '<div class="slide plain"><div class="tx" style="justify-content:center;align-items:center;opacity:.6;font-size:16px;color:#fff;left:0;width:100%;text-align:center">No video yet</div></div>' }
function soundButton(on){ if (document.getElementById("snd")) return; const b = document.createElement("button"); b.id = "snd"; b.type = "button"; b.textContent = "🔊 Click for sound";
  b.onclick = () => { b.remove(); document.querySelectorAll("video").forEach(x => { x.muted = false }); YTP.forEach(p => { try { p.unMute() } catch (e) {} }); if (on) on() }; document.body.appendChild(b) }
const vidEnded = el => { const w = el.closest && el.closest(".slide.vid"); if (w) w.dispatchEvent(new Event("vidend")) };
function startVideo(vd){ if (vd.dataset.go) return; vd.dataset.go = 1; const mon = MODE === "monitor", inDlg = !!vd.closest("dialog");
  vd.muted = !mon; if (inDlg) vd.controls = true; vd.currentTime = 0; vd.addEventListener("ended", () => vidEnded(vd));
  const p = vd.play(); if (p && p.catch) p.catch(() => { vd.muted = true; vd.play().catch(() => {}); if (mon) soundButton() }) }      // the browser blocked sound until someone clicks this page
// YouTube links play through YouTube's player (the screens need internet for these).
const YTP = []; let ytReady = null;
function ytAPI(){ if (!ytReady) ytReady = new Promise(ok => { if (window.YT && YT.Player) return ok(); const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { if (prev) prev(); ok() };
  const sc = document.createElement("script"); sc.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(sc) }); return ytReady }
function startYT(el){ if (el.dataset.go) return; el.dataset.go = 1; const mon = MODE === "monitor", inDlg = !!el.closest("dialog"), start = +el.dataset.start || 0, wrap = el.closest(".slide");
  ytAPI().then(() => { if (!el.isConnected) return; const pl = new YT.Player(el, {videoId: el.dataset.yt, width: "100%", height: "100%",
    playerVars: {autoplay: 1, controls: inDlg ? 1 : 0, rel: 0, modestbranding: 1, playsinline: 1, start, disablekb: 1, iv_load_policy: 3},
    events: {onReady: e => { if (!mon) e.target.mute(); e.target.seekTo(start, true); e.target.playVideo();
        if (mon) setTimeout(() => { try { if (e.target.getPlayerState() !== 1) { e.target.mute(); e.target.playVideo(); soundButton() } } catch (_) {} }, 1500) },
      onStateChange: e => { if (e.data === 0 && wrap) wrap.dispatchEvent(new Event("vidend")) }}}); YTP.push(pl) }) }
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; (n.matches("video") ? [n] : [...n.querySelectorAll("video")]).forEach(startVideo); (n.matches(".yt") ? [n] : [...n.querySelectorAll(".yt")]).forEach(startYT) }))).observe(document.documentElement, {childList: true, subtree: true});
// Put new slide HTML in a box only if it changed, so a playing video isn't restarted by a redraw of the same slide.
function setSlide(el, h){ if (!el) return; if (el.dataset.h === h && el.firstChild) return; el.dataset.h = h; el.innerHTML = h }
// A quote: large words (fitted like a verse) and who said it.
function quoteHTML(v){ return `<div class="slide verse-s quote"><div class="vs"><div class="vt">${(v.quote || "").trim() ? "“" + fmtVerse(v.quote.trim()) + "”" : ""}</div>${(v.by || "").trim() ? `<div class="vr">— ${E(v.by.trim())}</div>` : ""}</div></div>` }
// A typical PowerPoint slide: a title at the top and bullet points (one per line), on a plain background or on a picture.
function bulletsHTML(v){ const L = (v.bullets || "").split("\n").map(x => x.trim()).filter(Boolean), n = L.length, pic = v.type === "bulletsimg" && v.image;
  const bs = (n <= 3 ? 3.8 : n <= 5 ? 3.3 : n <= 7 ? 2.8 : 2.3) * num(v.blSize, 100) / 100, ts = 5.2 * num(v.ttSize, 100) / 100;
  const tc = /^#[0-9a-f]{6}$/i.test(v.ttColor || "") ? `;color:${v.ttColor}` : "", bc = /^#[0-9a-f]{6}$/i.test(v.blColor || "") ? `;color:${v.blColor}` : "";
  return `<div class="slide bul${pic ? " pic" : " plain"}">${pic ? imgTag(v.image) + '<div class="scrim"></div>' : ""}<div class="bx">${(v.slideTitle || "").trim() ? `<div class="bt" style="font-size:${ts.toFixed(2)}cqw${tc}">${E(v.slideTitle.trim())}</div>` : ""}${n ? `<ul class="bl" style="font-size:${bs.toFixed(2)}cqw${bc}">${L.map(x => `<li>${E(x)}</li>`).join("")}</ul>` : ""}</div></div>` }
// The slide a tag shows: its verse, its extra slide, or the point's own slide.
function tagHTML(S, i, v, d){ if (!v || v.main || v.stop) return slideHTML(S, i, d); return isXS(v) ? xsHTML(v) : verseSlide(v) }
// ---------- Key points come from the full text ----------
// A key point is a bullet tag in the full text: [#1 words] (a main point) or [#2 words] (a sub point). They number themselves
// in the text's order (1, 1.a, 1.b, 2 …), and the list at the top just shows them, so moving text moves its key points.
// A slide tag inside a key point is written {John 15:1}; each key point takes one Next, and each slide tag in it shows its slide.
const BUL = /\[#([12])(?:[ \t]([^\[\]\n]{0,300}))?\]/g;
const BREF = /\{([^{}\n]{1,60})\}/g;
function bullets(p){ const t = (p && p.script) || "", out = []; let n = 0, k = 0;
  for (const m of t.matchAll(BUL)) { const lvl = +m[1], text = (m[2] || "").trim(); if (lvl === 1) { n++; k = 0 } const label = lvl === 1 ? String(n) : (n ? n + "." : "") + letter(k++);
    out.push({j: out.length, lvl, text, label, at: m.index, end: m.index + m[0].length}) }
  return out }
const bulRefs = (p, text) => [...(text || "").matchAll(BREF)].map(m => tagOf(p, m[1])).filter(v => v && !v.anchor && !v.cue && !v.bullet);
const bulPlain = text => (text || "").replace(BREF, "").replace(/\s+/g, " ").trim();
const KEEPTAG = {ref: "", stop: true, keep: true};      // a key point with no slide of its own keeps the slide that is showing
// Steps of a point: its own slide, then one per key point (or one per slide tag in it). a = the key point's spot ("b<j>").
function stepsOf(p){ const out = [{b: -1, sub: 0}]; let k = 0;
  bullets(p).forEach(b => { const R = bulRefs(p, b.text); if (!R.length) out.push({b: b.j, sub: ++k, a: "b" + b.j, v: KEEPTAG});
    else R.forEach((v, i) => out.push({b: b.j, sub: ++k, a: i ? "b" + b.j + "#" + i : "b" + b.j, v})) });
  return out }
function verseRefsIn(p){ return p ? stepsOf(p).slice(1).map(s => s.v) : [] }
// The full text in parts: the words before the first key point (intro), then each key point's words (ids k0, k1 …).
function splitBlocks(t){ t = t || ""; const out = {intro: "", order: [], text: {}, tags: {}}; const L = [...t.matchAll(BUL)];
  out.intro = t.slice(0, L.length ? L[0].index : t.length);
  L.forEach((m, j) => { const id = "k" + j; out.order.push(id); out.tags[id] = m[0]; out.text[id] = t.slice(m.index + m[0].length, L[j + 1] ? L[j + 1].index : t.length) }); return out }
const trimBlk = t => (t || "").replace(/^[ \t]*\n/, "").replace(/\s+$/, "");
const bulTag = (lvl, text) => "[#" + (lvl === 2 ? 2 : 1) + " " + String(text || "").replace(/[\[\]\n]+/g, " ").replace(/\s+/g, " ").trim() + "]";
const subCount = p => verseRefsIn(p).length;
// Which step's slide is showing at step sub (a Stop keeps the slide before it).
function shownAt(p, sub){ const L = verseRefsIn(p); let k = sub; while (k > 0 && L[k - 1] && L[k - 1].stop) k--; return k }
// Verse text may mark **bold** and __underline__ (Ctrl+B / Ctrl+U in Edit's verse pop-up).
const fmtVerse = t => E(t || "").replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>").replace(/__([\s\S]+?)__/g, "<u>$1</u>");
function verseSlide(v){ const n = (v.text || "").replace(/\*\*|__/g, "").length, sz = n <= 110 ? 4.8 : n <= 220 ? 4 : n <= 360 ? 3.3 : n <= 520 ? 2.8 : 2.3;
  return `<div class="slide verse-s"><div class="vs"><div class="vt" style="font-size:${sz}cqw">${fmtVerse(v.text)}</div><div class="vr">${E(v.ref)}${v.version ? " (" + E(v.version) + ")" : ""}</div></div></div>` }
// Fit each verse slide's text: the largest size that fills the slide, but never huge for a short verse.
const fitRO = typeof ResizeObserver !== "undefined" ? new ResizeObserver(es => es.forEach(e => fitVerse(e.target))) : null;
function fitVerse(sl){ const vs = sl.querySelector(".vs"), vt = sl.querySelector(".vt"), vr = sl.querySelector(".vr"); if (!vs || !vt) return;
  const W = sl.clientWidth; if (!W) return; const avail = vs.clientHeight, gap = parseFloat(getComputedStyle(vs).rowGap) || 0;
  let lo = W * .018, hi = W * .056;                     // between about 1.8% and 5.6% of the slide's width
  for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; vt.style.fontSize = mid + "px"; if (vt.offsetHeight + (vr ? vr.offsetHeight + gap : 0) <= avail && vt.scrollWidth <= vs.clientWidth + 1) lo = mid; else hi = mid }
  vt.style.fontSize = lo + "px" }
if (fitRO) new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; (n.matches(".verse-s") ? [n] : [...n.querySelectorAll(".verse-s")]).forEach(x => { fitRO.observe(x); fitVerse(x) }) }))).observe(document.documentElement, {childList: true, subtree: true});
function stepHTML(S, i, sub, d){ const k = shownAt(S[i], sub); if (k > 0) { const v = verseRefsIn(S[i])[k - 1]; if (v && !v.main && !v.stop) return tagHTML(S, i, v, d) } return slideHTML(S, i, d) }
// One dot per slide on a point (its own slide, then each verse / main-slide step; stops aren't slides); "on" marks the one showing.
function dotsHTML(p, on){ const n = (hasSlide(p) ? 1 : 0) + verseRefsIn(p).filter(v => !v.stop).length; if (!n) return ""; let h = ""; for (let k = 0; k < n; k++) h += `<b${k === on ? ' class="on"' : ""}></b>`; return `<span class="dots">${h}</span>` }
function dotOf(p, sub){ const k = shownAt(p, sub), own = hasSlide(p) ? 1 : 0; if (!k) return own ? 0 : -1; return own + verseRefsIn(p).slice(0, k).filter(v => !v.stop).length - 1 }
const tagKey = v => tagName(v);
const tagLabel = v => v.bullet ? "• " + bulPlain(v.text) : v.cue ? v.icon + " " + v.ref : v.anchor ? "↓" : v.main ? "↩ " + MAIN : v.stop ? "■ " + STOP : isXS(v) ? "▣ " + v.name : v.ref;
const tagName = v => isXS(v) ? v.name : v.ref;
const tagCls = v => v.cue ? " cue cue-" + v.cue.replace(" ", "") : v.anchor ? " anc" : v.main ? " main" : v.stop ? " stop" : isXS(v) ? " xs" : "";
// Text with its tags as buttons; k counts steps across key points and full text.
function taggedHTML(t, p, st){ let h = "", last = 0;
  for (const m of t.matchAll(TAG)) { const v = tagOf(p, m[1]); if (!v) continue;
    if (v.anchor) { h += E(t.slice(last, m.index)); last = m.index + m[0].length; continue }
    st.k++; h += E(t.slice(last, m.index)) + `<button type="button" class="vtag${tagCls(v)}${st.k === st.sub ? " on" : ""}" data-sub="${st.k}" data-ref="${E(tagName(v))}">${E(tagLabel(v))}</button>`; last = m.index + m[0].length }
  return h + E(t.slice(last)) }
// The key points as a numbered list (Stage and Edit). Their slide tags are buttons; st.k counts the steps.
function bulText(b, p, st){ const R = bulRefs(p, b.text); let h = "", last = 0;
  if (!R.length) st.k++;
  for (const m of b.text.matchAll(BREF)) { const v = tagOf(p, m[1]); h += E(b.text.slice(last, m.index)); last = m.index + m[0].length; if (!v || v.anchor || v.cue || v.bullet) continue;
    st.k++; h += `<button type="button" class="vtag${tagCls(v)}${st.k === st.sub ? " on" : ""}" data-sub="${st.k}" data-ref="${E(tagName(v))}">${E(tagLabel(v))}</button>` }
  return h + E(b.text.slice(last)) }
function kpTagged(p, st, bt){ const L = bullets(p); return L.length ? `<ul class="kp bl">${L.map(b => `<li data-b="${b.j}" class="l${b.lvl}${/^(🔑|🔁)/u.test(b.text) ? " key" : ""}${b.j === bt ? " cur" : ""}"><span class="kn">${E(b.label)}</span>${bulText(b, p, st)}</li>`).join("")}</ul>` : "" }
// The full text on Stage: each key point's part is wrapped, so Next can light it up and bring it into view.
function scriptHTML(p){ const t = p.script || "", L = bullets(p); let h = segHTML(p, t.slice(0, L.length ? L[0].at : t.length).replace(/^\s+/, ""));
  L.forEach((b, i) => { const end = L[i + 1] ? L[i + 1].at : t.length; let x = t.slice(b.end, end); if (!L[i + 1]) x = x.replace(/\s+$/, "");
    h += `<span class="seg" data-b="${b.j}"><span class="bmark l${b.lvl}" data-b="${b.j}" title="${E(bulPlain(b.text))}">${E(b.label)}</span>${segHTML(p, x)}</span>` });
  return h.replace(/\s+$/, "") }
function segHTML(p, t){ let h = "", last = 0;
  for (const m of t.matchAll(TAG)) { const v = tagOf(p, m[1]); if (!v || v.bullet) continue; h += E(t.slice(last, m.index)); last = m.index + m[0].length; if (v.anchor || v.unplaced) continue;
    if (v.cue) { h += `<span class="cuehint${tagCls(v)}">${E(tagLabel(v))}</span>`; continue }
    h += `<button type="button" class="vtag ref${tagCls(v)}" data-ref="${E(tagName(v))}" title="Click to show this slide. Next or Back goes back">${E(tagLabel(v))}</button>` }
  return h + E(t.slice(last)) }
// Bring a key point's part of the text into view below the sticky parts: in the middle if it fits, else its start at the top.
function scrollToPart(r, top, bottom){ if (!r) return; const room = bottom - top, y = r.height <= room - 16 ? r.top - top - (room - r.height) / 2 : r.top - top - 10;
  if (Math.abs(y) > 2) window.scrollTo({top: Math.max(0, scrollY + y), behavior: "smooth"}) }
function slideHTML(S, i, d){
  const k = heldIdx(S, i), s = k >= 0 ? S[k] : null;
  if (s) return slideBox(s);
  return d.titleImage ? `<div class="slide">${imgTag(d.titleImage)}</div>` : slideBox({layout: "center", slideTitle: d.title});
}
const KEEP = [];                                        // decoded images held in memory so slides appear instantly
function preload(S, d){
  const urls = [...new Set(S.flatMap(s => [s.image, ...(s.slides || []).flatMap(x => x ? [x.image, x.video] : [])]).concat([d.titleImage]).filter(Boolean))].filter(u => !LOCALIMG[u]);
  const swap = (u, b) => document.querySelectorAll("img[data-p]").forEach(im => { if (im.dataset.p === u && !im.src.startsWith("data:")) im.src = b });
  const get = u => fetch(u).then(r => { if (!r.ok) throw 0; return r.blob() }).catch(() => fetch(RAW + PATH + "/" + u).then(r => { if (!r.ok) throw 0; return r.blob() }));
  let i = 0;
  const one = () => { const u = urls[i++]; if (!u) return;
    get(u).then(b => { if (LOCALIMG[u]) return; const url = URL.createObjectURL(b), im = new Image(); im.src = url; KEEP.push(im);
      return (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { LOCALIMG[u] = url; swap(u, url) }) })
      .catch(() => { const im = new Image(); im.onerror = () => { im.onerror = null; im.src = RAW + PATH + "/" + u }; im.src = u; KEEP.push(im) })
      .then(one) };
  for (let k = 0; k < 4; k++) one();                      // four downloads at a time
}
function kpHTML(list){ return list && list.length ? `<ul class="kp">${list.map(x => `<li${/^(🔑|🔁)/u.test(x) ? ' class="key"' : ""}>${E(x)}</li>`).join("")}</ul>` : "" }
function verseTags(p){ const v = (p.verses || []).map((x, i) => [x, i]).filter(([x]) => x && x.ref), xs = (p.slides || []).filter(x => x && x.name);
  return v.length || xs.length ? `<div class="vtags">${v.map(([x, i]) => `<button type="button" data-v="${i}">${E(x.ref)}</button>`).join("")}${xs.map(x => `<button type="button" class="xs" data-ref="${E(x.name)}" title="Show this slide">▣ ${E(x.name)}</button>`).join("")}</div>` : "" }
function verseDialog(){
  let d = $("#vd"); if (d) return d;
  document.body.insertAdjacentHTML("beforeend", `<dialog class="verse" id="vd"><h3 id="vr"></h3><p id="vx"></p><button class="btn" id="vc" type="button">Close</button></dialog>`);
  d = $("#vd"); $("#vc").onclick = () => d.close();
  d.addEventListener("click", e => { if (e.target !== d) return; const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close() });
  return d;
}
function showVerse(v){ const d = verseDialog(); $("#vr").textContent = v.ref + (v.version ? ` (${v.version})` : ""); if (v.text) $("#vx").innerHTML = fmtVerse(v.text); else $("#vx").textContent = "No text yet. Add it in Edit."; try { d.showModal() } catch (e) { d.setAttribute("open", "") } }
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
// ?play: the narrated version. The slides show while the saved AI voice reads, and the voice moves the slides on.
async function playMode(){
  document.body.innerHTML = `<div id="s"></div><div id="ui"><button id="pb" type="button" title="Previous point">⏮</button><button id="pg" type="button" title="Pause">❚❚</button><button id="pn" type="button" title="Next point">⏭</button><span id="st"><b></b>Narrated</span><button id="f" type="button">Full screen</button></div><div id="pstart"><button type="button" id="pgo" disabled>Loading…</button><p id="pmsg"></p></div>`;
  try { D = await loadTalk(false) } catch (e) { $("#pmsg").textContent = "Couldn't load this talk."; return }
  document.title = D.title + " · narrated"; const S = steps(D); preload(S, D); setSlide($("#s"), stepHTML(S, 0, 0, D));
  let N = null; for (const u of ["narration.json", RAW + PATH + "/narration.json"]) { try { const r = await fetch(u + "?t=" + Date.now(), {cache: "no-store"}); if (r.ok) { N = await r.json(); break } } catch (e) {} }
  if (!N || !N.points) { $("#pgo").textContent = "Not ready yet"; $("#pmsg").textContent = "This talk doesn't have a narrated version yet."; return }
  $("#pgo").disabled = false; $("#pgo").textContent = "▶ Play the talk"; $("#pmsg").textContent = "Narrated with an AI voice";
  const au = new Audio(), st = $("#st"); let run = 0, i = 0, paused = false, wake = null;
  const url = f => f.startsWith("voice/") ? f : "";
  const pre = f => { const x = new Audio(); x.preload = "auto"; x.src = url(f) };
  const show = (k, sub) => { setSlide($("#s"), stepHTML(S, k, sub, D)); st.lastChild.textContent = `${S[k].label} ${S[k].cue || ""}`.trim() };
  const wait = (ms, r) => new Promise(ok => { let left = ms; const t = setInterval(() => { if (r !== run) { clearInterval(t); ok() } else if (!paused && (left -= 100) <= 0) { clearInterval(t); ok() } }, 100) });
  const say = f => new Promise(ok => { let alt = false; wake = ok; au.onended = () => ok(); au.onerror = () => { if (alt) return ok(); alt = true; au.src = RAW + PATH + "/" + f; if (!paused) au.play().catch(() => {}) }; au.src = url(f); if (!paused) au.play().catch(() => {}) });
  async function point(k){ const r = ++run; au.pause(); if (wake) { wake(); wake = null } if (k < 0) k = 0;
    if (k >= S.length) { setSlide($("#s"), `<div class="slide blank"><div class="txt">The end<br><button type="button" id="again" class="btn">▶ Play again</button></div></div>`); st.lastChild.textContent = "The end"; const g = $("#again"); if (g) g.onclick = () => point(0); return }
    i = k; show(k, 0); const items = N.points[S[k].id] || [], says = items.filter(x => x.say); says.slice(0, 2).forEach(x => pre(x.say));
    const nx = S[k + 1] && N.points[S[k + 1].id]; if (nx) { const f = nx.find(x => x.say); if (f) pre(f.say) }
    if (!says.length) await wait(4000, r);
    for (let q = 0; q < items.length && r === run; q++) { const it = items[q];
      if (it.sub != null) show(k, it.sub); else if (it.pause) await wait(it.pause * 1000, r); else if (it.say) { const nf = items.slice(q + 1).find(x => x.say); if (nf) pre(nf.say); await say(it.say) } }
    if (r === run) point(k + 1) }
  const toggle = () => { paused = !paused; $("#pg").textContent = paused ? "▶" : "❚❚"; if (paused) au.pause(); else if (au.src && !au.ended) au.play().catch(() => {}) };
  $("#pgo").onclick = () => { $("#pstart").remove(); point(0) };
  $("#pn").onclick = () => point(i + 1); $("#pb").onclick = () => point(i - 1); $("#pg").onclick = toggle;
  const full = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() } catch (e) {} }; $("#f").onclick = full;
  document.addEventListener("keydown", e => { if ($("#pstart")) return; if (e.key === "ArrowRight" || e.key === "PageDown") point(i + 1); else if (e.key === "ArrowLeft" || e.key === "PageUp") point(i - 1); else if (e.key === " ") { e.preventDefault(); toggle() } else if (e.key === "f" || e.key === "F") full() });
  let hideT; const ui = $("#ui"); const wk = () => { ui.classList.remove("hide"); clearTimeout(hideT); hideT = setTimeout(() => ui.classList.add("hide"), 3000) };
  document.addEventListener("mousemove", wk); document.addEventListener("touchstart", wk); wk() }
async function monitor(){
  if (new URLSearchParams(location.search).has("play")) return playMode();
  document.body.innerHTML = `<div id="s"></div><div id="ui"><button id="b" type="button">&larr; Back</button><span id="st"><b></b>Connecting&hellip;</span><button id="n" type="button">Next &rarr;</button><button id="f" type="button">Full screen</button></div>`;
  try { D = await loadTalk(false) } catch (e) { $("#s").innerHTML = `<div class="txt">Couldn't load this talk.</div>`; return }
  document.title = D.title + " · slides";
  const S = steps(D), idx = id => S.findIndex(s => s.id === id);
  preload(S, D);
  let pres = 0, psub = 0, local = 0, lsub = 0, follow = true, connected = false, bcSeen = false, lastAt = 0;
  const items = []; S.forEach((s, i) => { if (hasSlide(s)) items.push([i, 0]); verseRefsIn(s).forEach((v, k) => { if (!v.stop) items.push([i, k + 1]) }) });
  const st = $("#st");
  let pEnd = false, pk = null;
  function show(){ const i = follow ? pres : local; const pv = follow && pk ? tagOf(S[i], pk) : null; setSlide($("#s"), follow && pEnd ? '<div class="slide blank"></div>' : pv ? tagHTML(S, i, pv, D) : stepHTML(S, i, follow ? psub : lsub, D));
    st.className = follow ? (connected || bcSeen ? "on" : "") : "local";
    st.lastChild.textContent = follow ? (connected || bcSeen ? "Following the presenter" : "Waiting for the presenter") : "Stepping here, snaps back when the presenter moves" }
  function fromPresenter(m){ if (!m || !m.point) return; if (m.at && m.at <= lastAt) return; lastAt = m.at || Date.now(); if (m.point === "__end") { pEnd = true; follow = true; show(); return } const i = idx(m.point); if (i < 0) return; pEnd = false; pres = i; psub = +m.sub || 0; pk = m.pk || null; follow = true; show() }
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
  let cur = 0, sub = 0, pos = 0, bt = -1, anc = null, peek = null; try { const v = +localStorage.getItem("pres-" + FOLDER); if (v >= 0 && v < S.length) cur = v; const w = +localStorage.getItem("pres-pos-" + FOLDER); if (w > 0) pos = w } catch (e) {}
  // pos = which step of this point (see stepsOf): bt = its key point, sub = how many slide tags have shown, anc = the full-text spot to scroll to.

  const setPos = k => { const L = stepsOf(S[cur]); pos = Math.max(0, Math.min(L.length - 1, k)); bt = L[pos].b; sub = L[pos].sub; anc = bt >= 0 ? "b" + bt : null };
  setPos(pos);
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
    const st = {k: 0, sub}, kl = kpTagged(s, st, bt);
    $("#m").innerHTML = `<div class="sech">${E(s.sec)}</div><div class="head"><div class="hc">${s.label ? `<span>${E(s.label)}</span>` : ""}${E(s.cue)}</div>${verseTags(s)}</div>
      <div class="grid"><div>${kl ? `<div class="kpbox">${kl}</div>` : (cur === 0 ? '<p class="note">The timer starts when you move to 1.b.</p>' : "")}
      ${s.script ? `<div class="fulltext"><div class="rule"><span class="tag">Full text</span>${s.scriptDraft ? '<span class="draft">Draft</span>' : ""}</div><p class="script">${scriptHTML(s)}</p></div>` : ""}
      ${nx ? `<div class="next">Up next: <b>${E(nx.label)}</b> ${E(nx.cue)}${hasSlide(nx) && heldIdx(S, cur + 1) === cur + 1 ? " (new slide)" : ""}</div>` : '<div class="next">End of talk</div>'}</div>
      <div class="scr-wrap"><div class="scr"></div><div class="cap">${capTxt()}</div></div></div>`; setSlide($("#m .scr"), scrHTML()); vidNext();
    $("#pos").textContent = (cur + 1) + " of " + S.length; markPk(); markSpot(); requestAnimationFrame(toStep) }
  function markSpot(){ document.querySelectorAll("#m .script .seg").forEach(e => e.classList.toggle("cur", +e.dataset.b === bt)) }
  // Clicking a tag shows its slide for a moment (a "peek"); Next or Back goes back to where you were.
  const scrHTML = () => peek ? tagHTML(S, cur, tagOf(S[cur], peek), D) : stepHTML(S, cur, sub, D);
  function capTxt(){ const s = S[cur], k = heldIdx(S, cur); if (peek) { const v = tagOf(s, peek); return "Showing " + E(v ? tagLabel(v) : peek) + " · Next or Back goes back" }
    return sub > 0 ? "Step " + sub + " of " + subCount(s) : k === cur && hasSlide(s) ? "New slide at this point" : k >= 0 ? "Slide from " + E(S[k].label) + " stays up" : "Title slide" }
  function markPk(){ document.querySelectorAll("#m [data-ref]").forEach(b => b.classList.toggle("pk", !!peek && b.dataset.ref === peek)) }
  function updScr(){ const sc = $("#m .scr"), cp = $("#m .cap"); if (!sc || atEnd) return main(); setSlide(sc, scrHTML()); cp.innerHTML = capTxt(); markPk(); vidNext() }
  // A video set to "next when it ends" presses Next for you when it finishes (a moment later, so the slides screens finish too).
  function vidNext(){ const vd = $("#m .scr .slide.vid[data-next]"); if (!vd || vd.dataset.hooked) return; vd.dataset.hooked = 1; const at = [cur, pos, peek];
    vd.addEventListener("vidend", () => setTimeout(() => { if (cur === at[0] && pos === at[1] && peek === at[2] && !atEnd) next() }, 1200)) }
  // Keep the step you're on at the top, just under the sticky header (the page has room below to allow it).
  // The key points stay at the top; Next on a linked key point scrolls the full text up to its spot, just under them (there's room below to allow it).
  // The key points stay at the top; Next lights up the current one's part of the full text and brings it into view below them.
  function toStep(){ const tb = $(".top"), hd = $("#m .head"), kb = $("#m .kpbox"), bar = $(".bar"), off = (tb ? tb.offsetHeight : 0) + (hd ? hd.offsetHeight : 0);
    document.body.style.setProperty("--stk", (off + 12) + "px");
    const li = $(`#m .kpbox li[data-b="${bt}"]`); if (kb && li) kb.scrollTo({top: Math.max(0, li.offsetTop - kb.clientHeight / 3), behavior: "smooth"});
    if (bt < 0) { if (!pos) window.scrollTo({top: 0}); return } const el = $(`#m .script .seg[data-b="${bt}"]`); if (!el) return;
    const top = off + 12 + (kb ? kb.offsetHeight + 10 : 0), bottom = bar ? Math.min(innerHeight, bar.getBoundingClientRect().top) : innerHeight;
    scrollToPart(el.getBoundingClientRect(), top, bottom) }
  function setStep(k){ if (locked()) return; peek = null; const was = anc; setPos(k); document.querySelectorAll("#m .kpbox li").forEach(e => e.classList.toggle("cur", +e.dataset.b === bt));
    document.querySelectorAll("#m .kpbox .vtag").forEach(e => e.classList.toggle("on", sub > 0 && +e.dataset.sub === sub)); markSpot();
    updScr(); nav(); push(); if (anc !== was || !pos) requestAnimationFrame(toStep); else { const kb = $("#m .kpbox"), li = $(`#m .kpbox li[data-b="${bt}"]`); if (kb && li) kb.scrollTo({top: Math.max(0, li.offsetTop - kb.clientHeight / 3), behavior: "smooth"}) } }
  const syncEl = $("#sync"), setSync = (ok, msg) => { syncEl.className = ok ? "ok" : "bad"; syncEl.lastChild.textContent = msg };
  async function push(){ const m = {point: atEnd ? "__end" : S[cur].id, sub, at: Date.now()}; if (peek && !atEnd) m.pk = peek;
    try { localStorage.setItem("pres-" + FOLDER, cur); localStorage.setItem("pres-pos-" + FOLDER, pos) } catch (e) {}
    if (bc) try { bc.postMessage(m) } catch (e) {}
    try { const r = await fetch(relayURL(), {method: "POST", body: JSON.stringify(m)}); setSync(r.ok, r.ok ? "Monitors following" : "Sync failed (" + r.status + ")") }
    catch (e) { setSync(false, "Offline: only the slides window follows") } }
  const locked = () => !!$("#gate");
  function go(i, s){ if (locked()) return; const was = cur; atEnd = false; peek = null; cur = Math.max(0, Math.min(S.length - 1, i)); setPos(s === "last" ? 1e9 : 0); if (cur !== was) moved(was); if (!pos) window.scrollTo(0, 0); main(); nav(); push(); TIMER.at(cur <= first) }
  // Next (button, arrow or clicker) is the only thing that records a practice time; jumping in the list does not.
  function next(){ if (locked() || atEnd) return; if (peek) { peek = null; updScr(); push(); return } if (pos < stepsOf(S[cur]).length - 1) return setStep(pos + 1);
    if (run) record(); if (cur < S.length - 1) return go(cur + 1);
    if (run) { atEnd = true; main(); nav(); push() } }      // practice: a black slide after the last point, so the last point gets timed
  const back = () => { if (locked()) return; if (peek) { peek = null; updScr(); push(); return } if (atEnd) { atEnd = false; main(); nav(); push(); return } pos > 0 ? setStep(pos - 1) : cur > 0 ? go(cur - 1, "last") : null };
  let atEnd = false;

  // ---- Practice: time each point; later, compare the real talk against it ----
  // Practice: each Next writes the time spent on that point into its "seconds" in talk.json right away
  // (or keeps it on this computer if it can't reach GitHub). The first point (1.a) isn't timed, like the countdown.
  var PRUN = "pres-practice-" + FOLDER, PBASE = "pres-practice-base-" + FOLDER, PARR = "pres-arrive-" + FOLDER;
  function ls(k, v){ try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)) } catch (e) { return null } }
  let run = false, arrive = ls(PARR) || Date.now(), pmsg = "", lastRec = "", queue = {}, saveT = null, saving = false;
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
    let h = "";
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
  $("#m").onclick = e => { const t = e.target.closest("[data-ref]"); if (t) { if (locked()) return; const v = tagOf(S[cur], t.dataset.ref); if (!v || v.stop) return; peek = peek === t.dataset.ref ? null : t.dataset.ref; updScr(); push(); return }
    const li = e.target.closest(".kpbox li[data-b], .script .bmark[data-b]"); if (li) { const L = stepsOf(S[cur]), j = L.findIndex(x => x.b === +li.dataset.b); if (j >= 0) setStep(j); return } const b = e.target.closest("[data-v]"); if (b) showVerse(S[cur].verses[+b.dataset.v]) };
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
const PLACEF = /^(text[XYW]|align|(eb|tt|sb)(X|Y|W|Size|Align|Color)|bl(Size|Color))$/;
function applyOp(d, o){
  switch (o.t) {
    case "xset": { const f = findPt(d, o.pid), x = f && f.p.slides && f.p.slides[o.i]; if (!x) break; if (o.v === "" && PLACEF.test(o.f)) delete x[o.f]; else x[o.f] = o.v; break }
    case "xadd": { const f = findPt(d, o.pid); if (f) (f.p.slides = f.p.slides || []).push(JSON.parse(JSON.stringify(o.s))); break }
    case "xdel": { const f = findPt(d, o.pid); if (f && f.p.slides) { f.p.slides.splice(o.i, 1); if (!f.p.slides.length) delete f.p.slides } break }
    case "talk": d[o.f] = o.v; break;
    case "sec": { const s = d.sections.find(x => x.id === o.sid); if (s) s[o.f] = o.v; break }
    case "pt": { const f = findPt(d, o.pid); if (!f) break; if (o.v === "" && PLACEF.test(o.f)) delete f.p[o.f]; else f.p[o.f] = o.v; if (o.f === "script") f.p.scriptDraft = false; break }
    case "vset": { const f = findPt(d, o.pid); if (f && f.p.verses && f.p.verses[o.i]) f.p.verses[o.i][o.f] = o.v; break }
    case "vadd": { const f = findPt(d, o.pid); if (f) (f.p.verses = f.p.verses || []).push({ref: "", text: "", version: "NIV"}); break }
    case "vdel": { const f = findPt(d, o.pid); if (f && f.p.verses) f.p.verses.splice(o.i, 1); break }
    case "padd": { const s = d.sections.find(x => x.id === o.sid); if (s && !findPt(d, o.pid)) s.points.push({id: o.pid, cue: "New point", eyebrow: "", slideTitle: "", slide: "", layout: "left", image: "", verses: [], script: "", scriptDraft: false}); break }
    case "pdel": { const f = findPt(d, o.pid); if (f) f.s.points.splice(f.i, 1); break }
    case "pmove": { const f = findPt(d, o.pid); if (!f) break; const j = f.i + o.d; if (j < 0 || j >= f.s.points.length) break; const a = f.s.points; [a[f.i], a[j]] = [a[j], a[f.i]]; break }
    case "sins": if (!d.sections.some(x => x.id === o.sec.id)) { const i = d.sections.findIndex(x => x.id === o.after); d.sections.splice(i < 0 ? d.sections.length : i + 1, 0, JSON.parse(JSON.stringify(o.sec))) } break;
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
  preload(steps(D), D);
  let sel = {k: "talk"}, pending = [], inflight = [], saving = false, timer = null;
  document.body.innerHTML = topBar("edit") + `<div class="lay"><nav class="cues" id="nav"></nav><main class="pane" id="m"></main></div>`;
  $(".top h1").insertAdjacentHTML("afterend", `<span id="save">All changes saved</span>`);
  const saveEl = () => $("#save");
  function setSave(t, err){ const s = saveEl(); s.textContent = t; s.className = err ? "err" : "" }
  function op(o, structural){ applyOp(D, o); pending.push(o); setSave("Saving…"); clearTimeout(timer); timer = setTimeout(flush, 900);
    structural ? render() : nav() }
  function syncBlocks(){ return false }      // (key points used to be kept separately; now they live in the full text)
  // The full text redrawn from the data; the box you're typing in is kept as it is.
  function redrawText(p){ const box = $("#ftext"); if (!box || box.dataset.id !== p.id) return; const act = box.querySelector(".rich.big");
    if (act && act.contains(document.activeElement) && act.contentEditable === "true" && !lmode) { relabel(p); return }      // you're typing in it: leave it be
    box.innerHTML = ftextHTML(p); relabel(p) }
  // ---- The full text: one box; key points are bullet tags in it (type / and pick Bullet point) ----
  let lmode = false;
  const bulInner = (lb, v) => { const t = bulPlain(v.text), R = [...(v.text || "").matchAll(BREF)].map(m => m[1]);
    return `<b>${E(lb || "")}</b>${E(t.length > 70 ? t.slice(0, 69) + "…" : t || "(no words)")}${R.length ? `<i>${R.map(E).join(" · ")}</i>` : ""}` };
  const bulChip = (v, lb) => `<span class="vchip bul l${v.lvl}" contenteditable="false" data-ref="${E(v.ref)}" title="Key point ${E(lb || "")}. Click to change it; drag it to where you start saying it">${bulInner(lb, v)}</span>`;
  function scriptRich(p){ const t = p.script || "", lb = bullets(p).map(b => b.label); let h = "", last = 0, j = 0;
    for (const m of t.matchAll(TAG)) { const v = tagOf(p, m[1]); if (!v || v.anchor) continue; h += E(t.slice(last, m.index)); last = m.index + m[0].length;
      h += v.bullet ? bulChip(v, lb[j++]) : chip(v, p, true) }
    return h + E(t.slice(last)) }
  // While Listen reads, each key point's part is wrapped so the word being said can light up.
  function listenHTML(p){ const B = splitBlocks(p.script), L = bullets(p); let h = `<span data-f="block" data-blk="intro">${richHTML(p, trimBlk(B.intro), true, null)}</span>`;
    B.order.forEach((id, j) => { const v = tagOf(p, B.tags[id].slice(1, -1)); h += "\n" + bulChip(v, L[j] && L[j].label) + `<span data-f="block" data-blk="${E(id)}">${richHTML(p, trimBlk(B.text[id]), true, id)}</span>` }); return h }
  function ftextHTML(p){ if (lmode) return `<div class="rich big lm" data-id="${E(p.id)}" data-f="script">${listenHTML(p)}</div>`;
    return `<div class="rich big" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="What I'll say" data-ph="What I'll say. Type / to add a bullet point (a key point), a slide or a reading cue" data-id="${E(p.id)}" data-f="script">${scriptRich(p)}</div>` }
  // Which key point's part of the text holds a node: "k<j>" for the last bullet before it, or "intro".
  const blkAt = (box, node) => { let id = "intro", j = 0; for (const m of box.querySelectorAll(".vchip.bul")) { if (m === node || !(m.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) break; id = "k" + j++ } return id };
  // Clicking a key point in the list: put the caret just after its bullet in the text.
  function openBlock(id){ const box = $("#ftext .rich.big"); if (!box || lmode) return; const j = +String(id).replace(/^k/, ""), m = box.querySelectorAll(".vchip.bul")[j]; if (!m) return;
    box.focus(); const r = document.createRange(); r.setStartAfter(m); r.collapse(true); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); m.classList.remove("flash"); void m.offsetWidth; m.classList.add("flash") }
  async function flush(){
    if (saving || !pending.length) return; saving = true; inflight = pending; pending = [];
    try { SHA = await GH.put(PATH + "/talk.json", b64e(JSON.stringify(D, null, 1) + "\n"), SHA, "Edit " + D.title); inflight = [];
      setSave(pending.length ? "Saving…" : "Saved. The live pages update in about a minute.") }
    catch (e) {
      if (e.status === 409 || e.status === 422) {       // someone else saved first: take theirs, replay ours on top
        try { const g = await GH.get(PATH + "/talk.json"); SHA = g.sha; const fresh = upgrade(JSON.parse(g.text)); inflight.concat(pending).forEach(o => applyOp(fresh, o));
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
    h += `<div style="margin:14px 8px"><button type="button" class="btn small" data-act="sadd">+ Movement</button>${AIH("navsec")}</div>`;
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
        <label>Big idea<textarea data-t="talk" data-f="bigIdea">${E(D.bigIdea)}</textarea></label>${AIH("talk", D)}`;
    } else if (sel.k === "sec") {
      const si = D.sections.findIndex(x => x.id === sel.id), s = D.sections[si];
      if (!s) { sel = {k: "talk"}; return pane() }
      e += `<h2><span>${si + 1}.</span>Movement</h2>
        <div class="row"><label style="flex:3 1 240px">Title<input data-t="sec" data-id="${E(s.id)}" data-f="title" value="${E(s.title)}"></label><label style="flex:0 1 120px">Minutes<input data-t="sec" data-id="${E(s.id)}" data-f="minutes" value="${E(s.minutes)}" inputmode="numeric"></label></div>
        <div class="row"><button class="btn small" type="button" data-act="smove" data-id="${E(s.id)}" data-d="-1">↑ Move up</button><button class="btn small" type="button" data-act="smove" data-id="${E(s.id)}" data-d="1">↓ Move down</button>
          <button class="btn small" type="button" data-act="padd" data-id="${E(s.id)}">+ Add point</button><button class="btn small danger" type="button" data-act="sdel" data-id="${E(s.id)}">Delete movement</button></div>${AIH("sec", s)}
        <p class="note">${s.points.length} points. Pick one on the left to edit it.</p>`;
    } else {
      const f = findPt(D, sel.id); if (!f) { sel = {k: "talk"}; return pane() }
      const p = f.p, L = S(), i = L.findIndex(x => x.id === p.id), lb = L[i].label, pv = L[i - 1], nx = L[i + 1];
      if (p.id !== curPid) { syncBlocks(p, null, true); curPid = p.id; setE(p, nextSub ? 1e9 : 0); nextSub = 0; atEnd = false; epeek = null; arrive = Date.now() }
      const vt = (p.verses || []).map((v, vi) => v && v.ref ? `<button type="button" data-ve="${vi}">${E(v.ref)}</button>` : "").join("") + (p.slides || []).map((x, xi) => x && x.name ? `<button type="button" class="xs" data-xe="${xi}" title="${E(SLIDE_TYPES[x.type] || "")} slide">▣ ${E(x.name)}</button>` : "").join("");
      e = `<div class="ed stagev"><div class="sech">${E(L[i].sec || "")}</div>
        <div class="head"><div class="hc"><span>${E(lb)}</span><input class="cuein" data-t="pt" data-id="${E(p.id)}" data-f="cue" value="${E(p.cue)}" aria-label="Cue (your memory phrase)" placeholder="Cue"></div>
          <label class="tm" title="Time on this point (m:ss)">Time<input data-t="pt" data-id="${E(p.id)}" data-f="seconds" value="${ptSecs(p) ? mmss(ptSecs(p)) : ""}" placeholder="0:00" inputmode="numeric"></label>
          <div class="vtags">${vt}<button type="button" class="vplus" data-act="addmenu" title="Add a verse or a slide">+</button></div></div>
        <div class="grid"><div class="lcol">
          <div class="kplist ro" data-id="${E(p.id)}">${kpView(p)}</div>
          <div class="fulltext"><div class="rule"><span class="tag">Full text</span>${p.scriptDraft ? '<span class="draft">Draft</span>' : ""}<span class="note" style="font-size:12px">Type / for a bullet point. Key points come from the bullets; drag one to move it</span>${(p.script || "").trim() ? AIH("split") : ""}</div>
          <div class="ftext" id="ftext" data-id="${E(p.id)}">${ftextHTML(p)}</div></div>
        <div class="row"><button class="btn small" type="button" data-act="pmove" data-id="${E(p.id)}" data-d="-1">↑ Up</button><button class="btn small" type="button" data-act="pmove" data-id="${E(p.id)}" data-d="1">↓ Down</button>
          <button class="btn small danger" type="button" data-act="pdel" data-id="${E(p.id)}">Delete point</button></div>
          <div class="pager">${pv ? `<button class="btn small" type="button" data-sel="pt" data-id="${E(pv.id)}">← ${E(pv.label)} ${E(pv.cue)}</button>` : "<span></span>"}${nx ? `<button class="btn small" type="button" data-sel="pt" data-id="${E(nx.id)}">${E(nx.label)} ${E(nx.cue)} →</button>` : ""}</div></div>
          <div class="scr-wrap"><div class="prev small" id="prevs">${smallHTML(p)}</div><div class="pcap" id="pcap">${capHTML(p)}</div>
            <div class="stepbar"><button type="button" class="btn small" data-act="eprev" title="Back (Page Up)">&larr; Back</button><button type="button" class="btn small pri" data-act="enext" title="Next (Page Down)">Next &rarr;</button></div></div></div>
        <dialog class="sdlg" id="sdlg"></dialog>`;
    }
    $("#m").innerHTML = e + `</div>`; autoAll(); { const fp = sel.k === "pt" && findPt(D, sel.id); if (fp) relabel(fp.p) } const tb0 = $(".top"), hd0 = $("#m .head"); document.body.style.setProperty("--stk", ((tb0 ? tb0.offsetHeight : 0) + (hd0 ? hd0.offsetHeight : 0) + 12) + "px"); hlStep();
    const dl = $("#sdlg"); if (dl) { dl.addEventListener("close", () => { slideOpen = false; if (dlgT && dlgT.i != null) { render(); return } updSmall() }); if (slideOpen) openSlide() }
  }
  // "What I'll say" is a text box where verse tags are real tags: typing "/" lists this point's verses, picking one inserts a tag,
  // and a tag is removed whole (Backspace, Delete, or selecting it with the text around it). It is saved as [Ref] in the text.
  // Key points are a numbered list: type in a line, Enter adds the next one, Backspace on an empty one removes it; ↑ ↓ ✕ on hover.
  // The key points at the top only show the bullets in the full text; click one to go to it.
  function kpView(p){ const h = kpTagged(p, {k: 0, sub: esub}, ebt); return h || `<p class="note kpnone">No key points yet. In the full text below, type <b>/</b> and pick <b>Bullet point</b> where a point starts.</p>` }
  function redrawKp(p){ const b = $("#m .kplist"); if (b) b.innerHTML = kpView(p) }
  const chip = (v, p, inText) => v.bullet ? bulChip(v, "") : v.anchor || v.unplaced ? "" : `<span class="vchip${tagCls(v)}" contenteditable="false" data-ref="${E(tagName(v))}">${E(tagLabel(v))}</span>`;
  // In Listen mode each word is a span with its place in the block, so the word being read can light up.
  const words = (t, base) => lmode ? t.replace(/[^\s]+/g, "\u0000$&\u0001").split(/(\u0000[^\u0001]*\u0001)/).map((x, i, a) => { const o = base + a.slice(0, i).join("").replace(/[\u0000\u0001]/g, "").length; return x[0] === "\u0000" ? `<span class="w" data-o="${o}">${E(x.slice(1, -1))}</span>` : E(x) }).join("") : E(t);
  function richHTML(p, text, inText){ let h = "", last = 0; const t = text != null ? text : p.script || "";
    for (const m of t.matchAll(TAG)) { const v = tagOf(p, m[1]); if (!v) continue; h += words(t.slice(last, m.index), last) + chip(v, p, true); last = m.index + m[0].length }
    return h + words(t.slice(last), last) }
  function richText(el){ let out = "";
    const walk = n => { for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue.replace(/​/g, "");
      else if (c.nodeType === 1) { if (c.classList.contains("vchip")) out += "[" + c.dataset.ref + "]"; else if (c.tagName === "BR") out += "\n";
        else { const blk = /^(DIV|P)$/.test(c.tagName); if (blk && out && !out.endsWith("\n")) out += "\n"; walk(c) } } } };
    walk(el); return out.replace(/\n$/, "") }
  let richT = null;
  function saveRich(el){ clearTimeout(richT); const f = findPt(D, el.dataset.id); if (!f) return;
    if (el.dataset.f === "script") { if (!el.isConnected || el.contentEditable !== "true") return; const txt = richText(el); if (txt === (f.p.script || "")) return;
      op({t: "pt", pid: f.p.id, f: "script", v: txt}); const d = $("#m .fulltext .draft"); if (d) d.remove(); relabel(f.p); return }
    const txt = richText(el); if (txt === (f.p[el.dataset.f] || "")) return; op({t: "pt", pid: el.dataset.id, f: el.dataset.f, v: txt}); relabel(f.p) }
  // Number the bullets in the text (1, 1.a, 2 …) and redraw the key-point list from them.
  function relabel(p){ const box = $("#ftext .rich.big"); if (box) { let n = 0, k = 0;
      box.querySelectorAll(".vchip.bul").forEach(c => { const v = tagOf(null, c.dataset.ref); if (!v || !v.bullet) return; let lab; if (v.lvl === 1) { n++; k = 0; lab = String(n) } else lab = (n ? n + "." : "") + letter(k++);
        const h = bulInner(lab, v); if (c.innerHTML !== h) c.innerHTML = h; c.classList.toggle("l1", v.lvl === 1); c.classList.toggle("l2", v.lvl === 2) }) }
    redrawKp(p); hlStep(true) }
  function prot(){ return false }
  function guard(el){ el._keep = null }
  function unguard(el){ el._keep = null }
  // The tag right next to the caret, in the direction Backspace (-1) or Delete (+1) would remove.
  function chipAt(box, dir){ const sl = getSelection(); if (!sl.rangeCount || !sl.isCollapsed) return null; let n = sl.anchorNode, o = sl.anchorOffset;
    if (n.nodeType === 3) { const t = n.nodeValue; if (dir < 0 ? t.slice(0, o).replace(/​/g, "") : t.slice(o).replace(/​/g, "")) return null; n = dir < 0 ? n.previousSibling : n.nextSibling }
    else n = n.childNodes[dir < 0 ? o - 1 : o];
    while (n && n.nodeType === 3 && !n.nodeValue.replace(/​/g, "")) n = dir < 0 ? n.previousSibling : n.nextSibling;
    return n && n.nodeType === 1 && n.classList.contains("vchip") && box.contains(n) ? n : null }
  document.addEventListener("input", e => { const el = e.target.closest && e.target.closest(".rich"); if (!el) return; clearTimeout(richT); richT = setTimeout(() => saveRich(el), 900) });
  document.addEventListener("focusout", e => { const el = e.target.closest && e.target.closest(".rich"); if (!el) return; saveRich(el) });
  // Copy, cut and paste keep tags and bullets, so cutting a piece of text and pasting it elsewhere moves its key points with it.
  function selText(){ const sl = getSelection(); if (!sl.rangeCount) return ""; const d = document.createElement("div"); d.appendChild(sl.getRangeAt(0).cloneContents()); return richText(d) }
  document.addEventListener("copy", e => { const el = e.target.closest && e.target.closest(".rich"); if (!el) return; e.preventDefault(); e.clipboardData.setData("text/plain", selText()) });
  document.addEventListener("cut", e => { const el = e.target.closest && e.target.closest(".rich"); if (!el) return; e.preventDefault(); e.clipboardData.setData("text/plain", selText()); document.execCommand("delete") });
  document.addEventListener("paste", e => { const el = e.target.closest && e.target.closest(".rich"); if (!el) return; e.preventDefault(); let t = (e.clipboardData || window.clipboardData).getData("text/plain"); const f = findPt(D, el.dataset.id);
    t = t.replace(/\[@[a-z0-9]+\]/g, "");
    if (f && [...t.matchAll(TAG)].some(m => tagOf(f.p, m[1]))) document.execCommand("insertHTML", false, richHTML(f.p, t, true).replace(/\n/g, "<br>")); else document.execCommand("insertText", false, t) });
  let vmenu = null;
  function closeVmenu(){ if (vmenu) { vmenu.el.remove(); vmenu = null } }
  // "/" in the full text: a bullet point (key point) or a reading cue.
  function openVmenu(el){ if (el.dataset.f !== "script") return; const vs = [{newBul: true}, ...Object.values(CUETAG)];
    const sl = getSelection(); if (!sl.rangeCount) return; const r = sl.getRangeAt(0); const node = r.startContainer, off = r.startOffset;
    if (node.nodeType !== 3 || off < 1 || node.nodeValue[off - 1] !== "/") return;
    closeVmenu(); const m = document.createElement("div"); m.className = "vmenu"; m.innerHTML = `<div class="vmh">Add here</div>` + vs.map((v, i) => `<button type="button" data-k="${i}" class="${i ? "" : "on"}${v.cue ? " cueo" : ""}${v.cue && i === 1 ? " main" : ""}${v.newBul ? " new bulo" : ""}">${v.newBul ? "• Bullet point (a key point starts here)" : E(tagLabel(v))}</button>`).join("");
    document.body.appendChild(m); const rr = r.getBoundingClientRect(), x = rr.left || el.getBoundingClientRect().left, y = (rr.bottom || el.getBoundingClientRect().top) + 4;
    m.style.left = Math.min(x, innerWidth - 240) + "px"; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + "px";
    vmenu = {el: m, box: el, node, off, vs, k: 0}; m.onmousedown = e => e.preventDefault(); m.onclick = e => { const b = e.target.closest("[data-k]"); if (b) pickV(+b.dataset.k) } }
  function pickV(k){ const {box, node, off, vs} = vmenu, it = vs[k]; closeVmenu();
    if (it.newBul) { const before = [...box.querySelectorAll(".vchip.bul")].filter(c => c.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).pop(), pv = before && tagOf(null, before.dataset.ref);
      bulEdit(box.dataset.id, {lvl: pv ? pv.lvl : 1, text: ""}, v => insertChip(box, node, off, tagOf(null, bulTag(v.lvl, v.text).slice(1, -1)))); return }
    insertChip(box, node, off, it) }
  function insertChip(box, node, off, v){ if (!v || !node.isConnected || node.nodeValue[off - 1] !== "/") return;
    const after = node.splitText(off); node.nodeValue = node.nodeValue.slice(0, -1);
    const t = document.createElement("template"); t.innerHTML = chip(v, findPt(D, box.dataset.id)?.p, true); const c = t.content.firstChild; after.parentNode.insertBefore(c, after);
    if (!after.nodeValue.startsWith(" ")) after.nodeValue = "​" + after.nodeValue;
    const r = document.createRange(); r.setStart(after, after.nodeValue.startsWith("​") ? 1 : 0); r.collapse(true); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); box.focus(); saveRich(box) }
  // The bullet pop-up: its words, main point or sub point, and which slides it shows. Saving gives {lvl, text}; remove gives null.
  function bulEdit(pid, cur, done, canDel){ const f = findPt(D, pid); if (!f) return; const p = f.p;
    const opts = [...(p.verses || []).filter(v => v && v.ref).map(v => v.ref), ...(p.slides || []).filter(x => x && x.name).map(x => x.name), MAIN, STOP];
    const have = [...(cur.text || "").matchAll(BREF)].map(m => m[1].trim());
    let d = $("#bud"); if (!d) { document.body.insertAdjacentHTML("beforeend", `<dialog class="verse ved bud" id="bud"><form method="dialog" class="ed">
        <div class="pgh"><b>Bullet point (key point)</b></div>
        <div class="row lvl"><label class="chk"><input type="radio" name="bulv" value="1"> 1 · Main point</label><label class="chk"><input type="radio" name="bulv" value="2"> a · Sub point</label></div>
        <label>Words (a short phrase to talk from)<input id="bux" autocomplete="off"></label>
        <div class="ed-l"><span class="tag">Slides it shows (optional)</span></div><div class="vtags" id="bus"></div><p class="note" id="busn"></p>
        <div class="row"><span style="flex:1"></span><button class="btn small danger" type="button" id="budel">Remove</button><button class="btn small" type="button" id="bucan">Cancel</button><button class="btn small pri" type="submit">Save</button></div></form></dialog>`); d = $("#bud");
      $("#bucan").onclick = () => d.close(); $("#bus").onclick = e => { const b = e.target.closest("button[data-r]"); if (b) b.classList.toggle("on") } }
    d.querySelector(`[name="bulv"][value="${cur.lvl === 2 ? 2 : 1}"]`).checked = true; $("#bux").value = bulPlain(cur.text);
    $("#bus").innerHTML = opts.map(r => `<button type="button" data-r="${E(r)}" class="${have.includes(r) ? "on" : ""}${r === MAIN ? " main" : r === STOP ? " stop" : ""}">${E(r === MAIN ? "↩ " + MAIN : r === STOP ? "■ " + STOP : r)}</button>`).join("");
    $("#busn").textContent = opts.length > 2 ? "Each slide you pick takes one Next. With none, the slide that's up stays." : "Add verses or slides with + at the top of the point, then pick them here. With none, the slide that's up stays.";
    $("#budel").hidden = !canDel; $("#budel").textContent = "Remove"; delete $("#budel").dataset.armed;
    $("#budel").onclick = () => { const b = $("#budel"); if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Tap again to remove"; return } d.close(); done(null) };
    d.querySelector("form").onsubmit = ev => { ev.preventDefault(); const lvl = +d.querySelector('[name="bulv"]:checked').value, w = $("#bux").value.replace(/[\[\]{}\n]+/g, " ").replace(/\s+/g, " ").trim();
      const rs = [...$("#bus").querySelectorAll("button.on")].map(b => b.dataset.r); d.close(); if (!w && !rs.length) { if (canDel) done(null); return }
      done({lvl, text: [w, ...rs.map(r => "{" + r + "}")].filter(Boolean).join(" ")}) };
    try { d.showModal() } catch (e) { d.setAttribute("open", "") } $("#bux").focus() }
  // Click a bullet in the text to change it (or remove it; its words stay).
  function bulChange(c){ const box = c.closest(".rich.big"), v = tagOf(null, c.dataset.ref); if (!box || !v) return;
    bulEdit(box.dataset.id, v, nv => { if (!c.isConnected) return; const f = findPt(D, box.dataset.id); if (!nv) c.remove(); else c.dataset.ref = bulTag(nv.lvl, nv.text).slice(1, -1); saveRich(box); if (f) relabel(f.p) }, true) }
  document.addEventListener("keydown", e => {
    if (vmenu) { const n = vmenu.vs.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); vmenu.k = (vmenu.k + (e.key === "ArrowDown" ? 1 : n - 1)) % n; vmenu.el.querySelectorAll("[data-k]").forEach((b, i) => b.classList.toggle("on", i === vmenu.k)); return }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickV(vmenu.k); return }
      closeVmenu(); if (e.key === "Escape") { e.preventDefault(); return } }
    const el = e.target.closest && e.target.closest(".rich"); if (!el) return;
    if ((e.key === "Backspace" || e.key === "Delete") && el.dataset.f === "script") { const dir = e.key === "Delete" ? 1 : -1, c = chipAt(el, dir);
      if (c && prot(el, c)) { e.preventDefault(); c.classList.remove("nope"); void c.offsetWidth; c.classList.add("nope"); const r = document.createRange(); if (dir < 0) r.setStartBefore(c); else r.setStartAfter(c); r.collapse(true); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); return } }
    if (e.key === "/") setTimeout(() => openVmenu(el), 0);
    else if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak") } }, true);
  // Drag a tag in the full text to where you say it (red ones aren't placed yet).
  let dragged = false;
  const caretAt = (x, y) => { if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y); const c = document.caretPositionFromPoint && document.caretPositionFromPoint(x, y); if (!c) return null; const r = document.createRange(); r.setStart(c.offsetNode, c.offset); r.collapse(true); return r };
  // Near the top (under the sticky key points) or the bottom of the window, the page scrolls while you drag or select.
  const edgeTop = () => { let y = 0; for (const q of [".top", "#m .head", "#m .kplist"]) { const el = $(q); if (el) y = Math.max(y, el.getBoundingClientRect().bottom) } return y };
  function edgeScroll(get, onTick){ const t = setInterval(() => { const p = get(); if (!p) return; const top = edgeTop(); let d = 0;
      if (p.y < top + 36) d = -Math.min(28, 6 + (top + 36 - p.y) / 2); else if (p.y > innerHeight - 40) d = Math.min(28, 6 + (p.y - innerHeight + 40) / 2);
      if (d && !(d < 0 && scrollY <= 0)) { scrollBy(0, d); if (onTick) onTick(p, d < 0 ? top + 8 : innerHeight - 8) } }, 30); return () => clearInterval(t) }
  // Selecting text: keep extending the selection while the page scrolls.
  document.addEventListener("mousedown", ev => { const box = ev.target.closest && ev.target.closest("#ftext .rich.big[contenteditable=true]"); if (!box || ev.button || ev.target.closest(".vchip")) return; let pt = null;
    const mv = e => { pt = {x: e.clientX, y: e.clientY} }, stop = edgeScroll(() => pt, (p, y) => { const r = caretAt(p.x, y), sl = getSelection(); if (r && box.contains(r.startContainer) && sl.rangeCount) try { sl.extend(r.startContainer, r.startOffset) } catch (e) {} });
    const up = () => { stop(); removeEventListener("mousemove", mv); removeEventListener("mouseup", up) }; addEventListener("mousemove", mv); addEventListener("mouseup", up) });
  // Drag a marker or a tag. A marker stays between the markers of the key points before and after it; a tag stays in its key point's part.
  document.addEventListener("pointerdown", ev => { const c = ev.target.closest && ev.target.closest("#ftext .rich.big[contenteditable=true] .vchip"); if (!c || ev.button) return; const box = c.closest(".rich.big"), x0 = ev.clientX, y0 = ev.clientY; let g = null, mark = null, pt = null, stop = null; ev.preventDefault();
    const f0 = findPt(D, box.dataset.id); if (!f0) return; const lim = [null, null];      // bullets and tags can go anywhere in the text
    const okAt = r => { const [a, b] = lim; if (a) { const q = document.createRange(); q.setStartAfter(a); if (r.compareBoundaryPoints(Range.START_TO_START, q) < 0) return false } if (b) { const q = document.createRange(); q.setStartBefore(b); if (r.compareBoundaryPoints(Range.START_TO_START, q) > 0) return false } return true };
    const spot = e => { const r = caretAt(e.x, e.y); return r && box.contains(r.startContainer) && !c.contains(r.startContainer) && r.startContainer !== c && okAt(r) ? r : null };
    const show = () => { if (!g || !pt) return; g.style.left = pt.x + 10 + "px"; g.style.top = pt.y + 10 + "px"; const r = spot(pt), rc = r && r.getBoundingClientRect(); mark.hidden = !rc || !rc.height; g.classList.toggle("no", !r); if (rc && rc.height) { mark.style.left = rc.left + "px"; mark.style.top = rc.top + "px"; mark.style.height = rc.height + "px" } };
    const mv = e => { pt = {x: e.clientX, y: e.clientY}; if (!g) { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; g = c.cloneNode(true); g.classList.add("ghost"); document.body.appendChild(g); mark = document.createElement("div"); mark.className = "dropmark"; document.body.appendChild(mark); c.classList.add("dragging"); stop = edgeScroll(() => pt, show) } show() };
    const up = e => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); if (stop) stop(); if (!g) return; dragged = true; setTimeout(() => dragged = false, 300); g.remove(); mark.remove(); c.classList.remove("dragging");
      const r = spot({x: e.clientX, y: e.clientY}); if (!r) { c.classList.remove("nope"); void c.offsetWidth; c.classList.add("nope"); return } let nc = c;
      
      c.remove(); r.insertNode(nc);
      const pv = nc.previousSibling, nx = nc.nextSibling; if (pv && pv.nodeType === 3 && /\S$/.test(pv.nodeValue)) pv.nodeValue += " "; if (!nx || nx.nodeType !== 3 || /^\S/.test(nx.nodeValue)) nc.after(document.createTextNode(" "));
      saveRich(box); relabel(f0.p) };
    addEventListener("pointermove", mv); addEventListener("pointerup", up) });
  document.addEventListener("mousedown", e => { if (vmenu && !vmenu.el.contains(e.target)) closeVmenu(); if (amenu && !amenu.contains(e.target)) { amenu.remove(); amenu = null } });
  // The + in the header: add a verse, or a slide of any type.
  let amenu = null;
  function addMenu(btn){ if (amenu) amenu.remove(); const m = document.createElement("div"); m.className = "vmenu"; amenu = m;
    m.innerHTML = `<div class="vmh">Add</div><button type="button" data-new="verse">Verse</button>` + Object.entries(SLIDE_TYPES).map(([k, n]) => `<button type="button" data-new="${k}">${E(n)} slide</button>`).join("");
    document.body.appendChild(m); const r = btn.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + "px"; m.style.top = (r.bottom + 4) + "px";
    m.onclick = e => { const b = e.target.closest("[data-new]"); if (!b) return; m.remove(); amenu = null; if (sel.k !== "pt") return;
      if (b.dataset.new === "verse") verseEdit(sel.id, "new"); else openSlide(addSlide(sel.id, b.dataset.new)) } }
  function addSlide(pid, type){ const f = findPt(D, pid); let n = (f.p.slides || []).length + 2, name; do { name = "Slide " + n++ } while (tagOf(f.p, name));
    op({t: "xadd", pid, s: type === "video" ? {name, type, url: "", video: "", autoNext: true} : type === "quote" ? {name, type, quote: "", by: ""} : {name, type, slideTitle: "", ...(isBul(type) ? {bullets: ""} : {eyebrow: "", slide: "", layout: "center"}), image: ""}}); return f.p.slides.length - 1 }
  // Renaming a verse or slide renames its tags in the text; removing it (b empty) removes its tags.
  function renameTag(pid, a, b){ const f = findPt(D, pid); if (!f || !a) return; const rep = t => t.split("[" + a + "]").join(b ? "[" + b + "]" : "").split("[!" + a + "]").join(b ? "[!" + b + "]" : "").split("{" + a + "}").join(b ? "{" + b + "}" : "");
    const sc = rep(f.p.script || "");
    if (sc !== (f.p.script || "")) op({t: "pt", pid, f: "script", v: sc}) }
  // Text boxes grow to fit their text (they can still be dragged bigger).
  const autoSize = t => { t.style.height = "auto"; t.style.height = (t.scrollHeight + 4) + "px" };
  function autoAll(){ document.querySelectorAll("#m textarea.auto").forEach(autoSize) }
  addEventListener("resize", () => autoAll());
  let slideOpen = false;
  // ---- Step through slides like Stage (Back / Next, Page Up / Page Down), and practice timing ----
  let esub = 0, ebt = -1, epos = 0, eanc = null, nextSub = 0, curPid = null, atEnd = false, run = false, arrive = Date.now(), lastRec = "", epeek = null;
  function setE(p, k){ const L = stepsOf(p); epos = Math.max(0, Math.min(L.length - 1, k)); esub = L[epos].sub; ebt = L[epos].b; eanc = L[epos].a || null }
  function smallHTML(p){ if (atEnd) return '<div class="slide blank"></div>'; const L = S(), i = L.findIndex(x => x.id === p.id); if (i < 0) return prevHTML(p);
    const pv = epeek && tagOf(p, epeek); return pv ? tagHTML(L, i, pv, D) : stepHTML(L, i, esub, D) }
  const editLink = v => v && !v.stop ? ` · <button type="button" class="linkbtn" data-act="tagedit" data-ref="${E(tagName(v))}">Edit</button>` : "";
  function capHTML(p){ if (atEnd) return "End: blank slide"; const L = S(), i = L.findIndex(x => x.id === p.id), n = subCount(p);
    if (epeek) { const v = tagOf(p, epeek); if (v) return `Showing ${E(tagLabel(v))} · Next or Back goes back${editLink(v)}` }
    if (esub > 0) { const v = verseRefsIn(p)[esub - 1], b = bullets(p)[ebt]; return `Key point ${b ? E(b.label) : ""} · ${v && !v.keep ? "step " + esub + " of " + n + " · " + E(tagLabel(v)) + editLink(v) : "the slide stays"}` }
    if (hasSlide(p)) return `<button type="button" class="linkbtn" data-act="sedit">Edit slide</button>`;
    const k = heldIdx(L, i); return (k >= 0 ? "Slide from " + E(L[k].label) + " stays up" : "No slide yet") + ` · <button type="button" class="linkbtn" data-act="sedit">Add a slide here</button>` }
  function updSmall(){ const f = sel.k === "pt" && findPt(D, sel.id), ps = $("#prevs"), pc = $("#pcap"); if (!f) return; if (ps) setSlide(ps, smallHTML(f.p)); if (pc) pc.innerHTML = capHTML(f.p);
    document.querySelectorAll("#m .rich .vchip, #ftext .vchip").forEach(c => c.classList.toggle("pk", !!epeek && c.dataset.ref === epeek)) }
  // Click a tag (in Key points or Full text) to show its slide; Next or Back puts back what was showing.
  function peekAt(ref){ const f = findPt(D, sel.id), v = f && tagOf(f.p, ref); if (!v || v.stop) return; epeek = epeek === ref ? null : ref; atEnd = false; updSmall() }
  function tagEdit(ref){ const f = findPt(D, sel.id), v = f && tagOf(f.p, ref); if (!v) return; if (v.main) openSlide(null); else if (isXS(v)) openSlide(f.p.slides.indexOf(v)); else if (!v.stop) verseEdit(sel.id, f.p.verses.indexOf(v)) }
  // Like Stage: the key point you are on is lit in the list and its part of the full text is highlighted and brought into view.
  function hlStep(quiet){ const fp = sel.k === "pt" && findPt(D, sel.id), box = $("#ftext .rich.big"), kl = $("#m .kplist"), on = !atEnd && !!fp;
    document.querySelectorAll("#ftext .vchip.on").forEach(c => c.classList.remove("on"));
    document.querySelectorAll("#m .kplist li[data-b]").forEach(e => e.classList.toggle("cur", on && +e.dataset.b === ebt));
    document.querySelectorAll("#m .kplist .vtag[data-sub]").forEach(e => e.classList.toggle("on", on && esub > 0 && +e.dataset.sub === esub));
    try { if (window.CSS && CSS.highlights) CSS.highlights.delete("kpcur") } catch (e) {}
    if (!on || ebt < 0 || !box) return; const cs = box.querySelectorAll(".vchip.bul"), c = cs[ebt]; if (!c) return; c.classList.add("on");
    const r = document.createRange(); r.setStartBefore(c); if (cs[ebt + 1]) r.setEndBefore(cs[ebt + 1]); else r.setEnd(box, box.childNodes.length);
    try { if (window.Highlight && CSS.highlights) CSS.highlights.set("kpcur", new Highlight(r)) } catch (e) {}
    const li = kl && kl.querySelector(`li[data-b="${ebt}"]`); if (kl && li && kl.scrollHeight > kl.clientHeight) kl.scrollTo({top: Math.max(0, li.offsetTop - kl.clientHeight / 3), behavior: "smooth"});
    if (quiet) return; const tb = $(".top"), hd = $("#m .head"), top = (tb ? tb.offsetHeight : 0) + (hd ? hd.offsetHeight : 0) + (kl ? kl.offsetHeight : 0) + 18;
    scrollToPart(r.getBoundingClientRect(), top, innerHeight - 8) }
  function updStep(){ const f = findPt(D, sel.id); if (!f) return; updSmall(); hlStep(); if (!epos || atEnd) window.scrollTo({top: 0, behavior: "smooth"}) }
  function record(p, i){ if (i <= 0) return; const t = Math.max(1, Math.round((Date.now() - arrive) / 1000)); op({t: "pt", pid: p.id, f: "seconds", v: t});
    op({t: "talk", f: "lastPractice", v: {date: new Date().toISOString(), total: talkSecs(D)}}); lastRec = S()[i].label + " " + mmss(t) }
  function enext(){ if (sel.k !== "pt" || atEnd) return; if (epeek) { epeek = null; return updSmall() } const f = findPt(D, sel.id); if (!f) return; const p = f.p;
    if (epos < stepsOf(p).length - 1) { const was = ebt; setE(p, epos + 1); updSmall(); hlStep(ebt === was); return }
    const L = S(), i = L.findIndex(x => x.id === p.id); if (run) record(p, i);
    if (L[i + 1]) { sel = {k: "pt", id: L[i + 1].id}; render(); window.scrollTo(0, 0) } else if (run) { atEnd = true; updStep() } }
  function eprev(){ if (sel.k !== "pt") return; if (epeek) { epeek = null; return updSmall() } if (atEnd) { atEnd = false; return updStep() } if (epos > 0) { const f = findPt(D, sel.id); if (f) setE(f.p, epos - 1); return updStep() }
    const L = S(), i = L.findIndex(x => x.id === sel.id); if (L[i - 1]) { nextSub = 1; sel = {k: "pt", id: L[i - 1].id}; render() } }
  document.addEventListener("keydown", e => { const t = e.target; if (t.closest && (t.closest("input,textarea,select,[contenteditable='true'],dialog"))) return;
    if (["PageDown", "ArrowRight"].includes(e.key)) { e.preventDefault(); enext() } else if (["PageUp", "ArrowLeft"].includes(e.key)) { e.preventDefault(); eprev() } });
  $("#save").insertAdjacentHTML("afterend", `<label class="pchk" title="Time each point: press Next when you finish a point. Jumping in the list doesn't record."><input type="checkbox" id="epchk"> Practice</label><span id="eprac" class="pst"></span>`);
  $("#epchk").onchange = e => { run = e.target.checked; lastRec = ""; arrive = Date.now(); if (!run && atEnd) { atEnd = false; updStep() } pst() };
  function pst(){ const el = $("#eprac"); if (!el) return; let h = "";
    if (run) { const f = sel.k === "pt" && findPt(D, sel.id), L = S(), i = f ? L.findIndex(x => x.id === f.p.id) : -1;
      h = atEnd ? "● End. Last point timed" : !f ? "● Pick a point to start" : i <= 0 ? "● Timing starts at the next point" : `● ${mmss((Date.now() - arrive) / 1000)} on ${E(L[i].label)}${ptSecs(f.p) ? " (last " + mmss(ptSecs(f.p)) + ")" : ""}`;
      if (lastRec) h += ` · saved ${E(lastRec)}` }
    if (el.innerHTML !== h) el.innerHTML = h; el.classList.toggle("rec", run) }
  setInterval(pst, 500);
  // The slide pop-up edits the point's main slide (i = null) or one of its extra slides (i = its index in p.slides).
  let dlgT = null;
  const tObj = t => { const f = t && findPt(D, t.pid); if (!f) return null; return t.i == null ? f.p : (f.p.slides || [])[t.i] || null };
  const tAttr = t => `data-t="${t.i == null ? "pt" : "xs"}" data-id="${E(t.pid)}"${t.i == null ? "" : ` data-i="${t.i}"`}`;
  const elT = el => ({pid: el.dataset.id, i: el.dataset.t === "xs" ? +el.dataset.i : null});
  const setOp = (t, f, v, structural) => op(t.i == null ? {t: "pt", pid: t.pid, f, v} : {t: "xset", pid: t.pid, i: t.i, f, v}, structural);
  const prevOf = (t, o) => t.i == null ? prevHTML(o) : xsHTML(o);
  const posOf = (t, o) => t.i != null && isBul(o.type) ? bulPosHTML(o, tAttr(t)) : posHTML(o, tAttr(t));
  function sdlgHTML(t){ const o = tObj(t); if (!o) return ""; const A = tAttr(t), xs = t.i != null, ty = xs ? o.type : "", pt = S().find(x => x.id === t.pid), lb = pt ? pt.label : "", bul = xs && isBul(ty), pic = !xs || hasPic(ty);
    let h = `<div class="ed"><div class="pgh"><b>${xs ? E(SLIDE_TYPES[ty] || "") + " slide · " + E(lb) : "Main slide for " + E(lb)}</b><button type="button" class="btn small pri" data-act="sdone">Done</button></div>`;
    if (xs) h += `<div class="row"><label style="flex:1 1 200px">Name (its tag in your text)<input ${A} data-f="name" value="${E(o.name)}"></label>
      <label style="flex:0 1 220px">Type<select ${A} data-f="type">${Object.entries(SLIDE_TYPES).map(([k, n]) => `<option value="${k}"${k === ty ? " selected" : ""}>${E(n)}</option>`).join("")}</select></label></div>`;
    h += `<div class="prev" id="prev">${prevOf(t, o)}</div><div class="slideed" id="slideed">`;
    if (ty === "video") h += `<label>Link (YouTube, or a direct link to a video file)<input ${A} data-f="url" value="${E(o.url)}" placeholder="https://www.youtube.com/watch?v=…  (add &t=30 to start at 0:30)"></label>
      <div class="row"><span class="tag">Or upload a file (MP4 works best; keep it under about 50 MB). It works without internet${o.url ? ". The link above is used while it's filled in" : ""}</span>
      <label class="btn small" style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink);display:inline-flex">${o.video ? "Replace" : "Add"} video<input type="file" accept="video/mp4,video/webm,video/quicktime,video/*" data-vid="${E(t.pid)}" data-i="${t.i}" hidden></label><span class="note" id="imgmsg"></span></div>
      <label class="chk"><input type="checkbox" ${A} data-f="autoNext"${o.autoNext !== false ? " checked" : ""}> When the video ends, go to the next slide (like pressing Next)</label>
      <p class="note">It plays from the start every time the slide comes up, with sound on the slides screens. On Stage it plays muted, so you can see where it is.</p>`;
    else if (ty === "quote") h += `<label>Quote<textarea class="auto" ${A} data-f="quote" placeholder="The words, without quote marks. Use **bold** or __underline__ if you like.">${E(o.quote)}</textarea></label>
      <label>Who said it<input ${A} data-f="by" value="${E(o.by)}" placeholder="e.g. Corrie ten Boom"></label>`;
    else if (bul) h += `<label>Title<textarea class="auto" ${A} data-f="slideTitle">${E(o.slideTitle)}</textarea></label>
      <label>Bullet points (one per line)<textarea class="auto" ${A} data-f="bullets" placeholder="First point&#10;Second point">${E(o.bullets)}</textarea></label>${posOf(t, o)}`;
    else h += `<div class="row"><label style="flex:1 1 200px">Small line on top (optional)<input ${A} data-f="eyebrow" value="${E(o.eyebrow)}" placeholder="e.g. Conference theme"></label>
      <label style="flex:0 1 200px">Style<select ${A} data-f="layout"><option value="left"${o.layout !== "center" ? " selected" : ""}>Gold title, white subtitle</option><option value="center"${o.layout === "center" ? " selected" : ""}>White title, gold subtitle</option></select></label></div>
      <label>Title<textarea class="auto" ${A} data-f="slideTitle">${E(o.slideTitle)}</textarea></label>
      <label>Subtitle<textarea class="auto" ${A} data-f="slide">${E(o.slide)}</textarea></label>${posOf(t, o)}`;
    if (pic) h += `<div class="row"><span class="tag">Picture (no words in it; the text goes on top)</span>${AIH("img", A, o)}${o.image ? `<button class="btn small" type="button" data-act="imgdel" ${A}>Remove image</button>` : ""}
      <label class="btn small" style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink);display:inline-flex">${o.image ? "Replace" : "Add"} image<input type="file" accept="image/*" data-img="${E(t.pid)}"${xs ? ` data-i="${t.i}"` : ""} hidden></label><span class="note" id="imgmsg"></span></div>`;
    h += xs ? `<div class="row"><span class="note" style="flex:1">To show it on Next, click a bullet point in the full text and pick this slide there.</span><button class="btn small danger" type="button" data-act="xdel" ${A}>Remove this slide</button></div>`
      : `<p class="note">Leave the text and picture empty for no new slide at this point.</p>`;
    return h + `</div></div>` }
  function fillDlg(){ const dl = $("#sdlg"), o = tObj(dlgT); if (!dl) return; if (!o) { dl.close(); return } dl.innerHTML = sdlgHTML(dlgT); autoAll(); fixPos(o) }
  function openSlide(i){ const dl = $("#sdlg"); if (!dl || sel.k !== "pt") return; if (i !== undefined || !dlgT || dlgT.pid !== sel.id) dlgT = {pid: sel.id, i: i == null ? null : i};
    if (!tObj(dlgT)) dlgT = {pid: sel.id, i: null}; slideOpen = true; dl.innerHTML = sdlgHTML(dlgT); if (!dl.open) try { dl.showModal() } catch (e) { dl.setAttribute("open", "") } autoAll(); fixPos(tObj(dlgT)) }
  // The verse box's bold/underline become **…** and __…__ in the saved text.
  function verseText(el){ let out = "";
    const walk = (n, b, u) => { for (const c of n.childNodes) {
      if (c.nodeType === 3) { const t = c.nodeValue.replace(/\u200b/g, ""); if (!t) continue; out += (b ? "**" : "") + (u ? "__" : "") + t + (u ? "__" : "") + (b ? "**" : "") }
      else if (c.nodeType === 1) { if (c.tagName === "BR") { out += "\n"; continue }
        const cs = c.style || {}, nb = b || /^(B|STRONG)$/.test(c.tagName) || +cs.fontWeight >= 600 || cs.fontWeight === "bold", nu = u || c.tagName === "U" || /underline/.test(cs.textDecoration || "");
        if (/^(DIV|P)$/.test(c.tagName) && out && !out.endsWith("\n")) out += "\n"; walk(c, nb, nu) } } };
    walk(el, false, false); return out.replace(/\*\*\*\*|____/g, "").replace(/\n$/, "") }
  // Verse pop-up in Edit: change the reference, text and version, or remove it.
  function verseEdit(pid, i, onAdd){
    const f = findPt(D, pid); if (!f) return; const isNew = i === "new", v = isNew ? {ref: "", text: "", version: "NIV"} : f.p.verses[+i];
    let d = $("#ved"); if (!d) { document.body.insertAdjacentHTML("beforeend", `<dialog class="verse ved" id="ved"><form method="dialog" class="ed">
        <label>Reference<input id="ver" placeholder="e.g. John 15:5"></label><div class="ed-l"><span class="tag">Text</span><button type="button" class="btn small fmt" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button><button type="button" class="btn small fmt" data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button><span class="note" style="font-size:12px">Select words, then Ctrl+B or Ctrl+U</span></div><div id="vet" class="vtext" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Verse text"></div>
        <div class="row"><label style="flex:0 1 140px">Version<input id="vev"></label>${AIH("esv")}<span style="flex:1"></span>
          <button class="btn small danger" type="button" id="vedel">Remove</button><button class="btn small" type="button" id="vecan">Cancel</button><button class="btn small pri" type="submit" id="vesave">Save</button></div></form></dialog>`); d = $("#ved");
      $("#vecan").onclick = () => d.close();
      d.querySelectorAll(".fmt").forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => { $("#vet").focus(); document.execCommand(b.dataset.cmd) } });
      $("#vet").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak") } });
      $("#vet").addEventListener("paste", e => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")) }) }
    $("#ver").value = v.ref || ""; $("#vet").innerHTML = fmtVerse(v.text).replace(/\n/g, "<br>"); $("#vev").value = v.version || ""; $("#vedel").hidden = isNew; $("#vedel").textContent = "Remove"; delete $("#vedel").dataset.armed;
    $("#vedel").onclick = () => { const b = $("#vedel"); if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Tap again to remove"; return } d.close(); renameTag(pid, (v.ref || "").trim(), null); op({t: "vdel", pid, i: +i}, true) };
    d.querySelector("form").onsubmit = ev => { ev.preventDefault(); const nv = {ref: $("#ver").value.trim(), text: verseText($("#vet")), version: $("#vev").value.trim()}; d.close();
      if (isNew) { if (!nv.ref && !nv.text) return; op({t: "vadd", pid}); i = f.p.verses.length - 1 }
      if (!isNew && v.ref && nv.ref && nv.ref !== v.ref.trim()) renameTag(pid, v.ref.trim(), nv.ref);
      for (const k of ["ref", "text", "version"]) if (isNew || nv[k] !== (v[k] || "")) op({t: "vset", pid, i: +i, f: k, v: nv[k]});
      if (isNew && onAdd && nv.ref) onAdd(nv.ref);
      render() };
    try { d.showModal() } catch (e) { d.setAttribute("open", "") } $(isNew ? "#ver" : "#vet").focus();
  }
  function render(){ nav(); pane() }
  let posOpen = false;
  const rng = (A, f, lb, v, lo, hi) => `<label class="rng">${lb} <output>${Math.round(v)}%</output><input type="range" min="${lo}" max="${hi}" step="1" value="${v}" ${A} data-f="${f}"></label>`;
  const alSel = (A, f, v, dflt) => `<label class="alg">Align<select ${A} data-f="${f}">${dflt ? `<option value=""${v ? "" : " selected"}>${dflt}</option>` : ""}${ALIGNS.map(a => `<option value="${a}"${v === a ? " selected" : ""}>${a[0].toUpperCase() + a.slice(1)}</option>`).join("")}</select></label>`;
  function bulPosHTML(o, A){
    let h = `<details class="pos" id="posd"${posOpen ? " open" : ""}><summary>Text size and color</summary><div class="pgh"><span></span><button class="btn small" type="button" data-act="posreset" data-g="bul" ${A}>Reset all</button></div>`;
    for (const [k, lb, c] of [["tt", "Title", "#e9b949"], ["bl", "Bullet points", "#ffffff"]])
      h += `<div class="pgrp"><div class="pgh"><b>${lb}</b></div><div class="row">${rng(A, k + "Size", "Size", num(o[k + "Size"], 100), 30, 250)}<label class="clr">Color<input type="color" value="${E(o[k + "Color"] || c)}" ${A} data-f="${k}Color"></label></div></div>`;
    return h + `</details>` }
  function posHTML(p, A){
    const b = textBox(p);
    let h = `<details class="pos" id="posd"${posOpen ? " open" : ""}><summary>Text size, width and color</summary><div class="pgh"><span class="note">Drag any line in the preview to move it.</span><button class="btn small" type="button" data-act="posreset" data-g="all" ${A}>Reset all</button></div>`;
    for (const [k, f, lb] of LINES) { if (!(p[f] || "").trim()) continue;
      h += `<div class="pgrp"><div class="pgh"><b>${lb}</b><button class="btn small" type="button" data-act="posreset" data-g="${k}" ${A}>Reset</button></div><div class="row">
        ${rng(A, k + "Size", "Size", num(p[k + "Size"], 100), 30, 300)}${rng(A, k + "W", "Width", num(p[k + "W"], b.w), 10, 100)}${alSel(A, k + "Align", p[k + "Align"] || "", "Default")}<label class="clr">Color<input type="color" value="${E(p[k + "Color"] || lineColor(p, k))}" ${A} data-f="${k}Color"></label></div></div>`;
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
    for (const a of ["X", "Y", "W"]) { const i = $(`#posd input[data-f="${k + a}"]`); if (i) { i.value = m[a]; i.parentElement.querySelector("output").textContent = Math.round(m[a]) + "%" } } } }
  function refreshSlide(){ const o = tObj(dlgT); updSmall(); if (!o) return; const pv = $("#prev"), pp = $("#posd"); if (pv) pv.innerHTML = prevOf(dlgT, o); if (pp) pp.outerHTML = posOf(dlgT, o); fixPos(o) }
  const LF = LINES.flatMap(([k]) => ["X", "Y", "W", "Size", "Align", "Color"].map(a => k + a)), POSF = ["textX", "textY", "textW", "align", ...LF], SLF = ["eyebrow", "slideTitle", "slide", "layout", "bullets", "blSize", "blColor", "quote", "by", ...POSF];
  const isLXYW = f => /^(eb|tt|sb)[XYW]$/.test(f);
  document.addEventListener("toggle", ev => { if (ev.target.classList && ev.target.classList.contains("pos")) posOpen = ev.target.open }, true);
  document.addEventListener("mousedown", ev => { if (ev.target.closest && ev.target.closest("#prev [data-k]")) ev.preventDefault() });
  // Drag one line inside the preview to place it on its own.
  document.addEventListener("pointerdown", ev => {
    let el = ev.target.closest("#prev [data-k]"); if (!el || sel.k !== "pt") return; const T = dlgT, o = tObj(T); if (!o) return;
    ev.preventDefault(); const k = el.dataset.k, add = missing(o, k), st = {...o, ...add};
    if (Object.keys(add).length) { $("#prev").innerHTML = prevOf(T, st); el = $(`#prev [data-k="${k}"]`) }
    const box = el.closest(".slide").getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY, bx = num(st[k + "X"], 0), by = num(st[k + "Y"], 50); let nx = bx, ny = by;
    el.classList.add("drag");
    const mv = e => { nx = Math.round(Math.max(-20, Math.min(95, bx + (e.clientX - x0) / box.width * 100)) * 10) / 10; ny = Math.round(Math.max(0, Math.min(100, by + (e.clientY - y0) / box.height * 100)) * 10) / 10; el.style.left = nx + "%"; el.style.top = ny + "%" };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
      if (nx === bx && ny === by) { refreshSlide(); return }
      for (const [a, v] of Object.entries({...add, [k + "X"]: nx, [k + "Y"]: ny})) setOp(T, a, v);
      refreshSlide() };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });
  function prevHTML(p){ return hasSlide(p) ? slideBox(p) : '<div class="slide"><div class="tx" style="justify-content:center;align-items:center;opacity:.6;font-size:16px;color:#fff">No slide at this point</div></div>' }
  document.addEventListener("input", ev => { const el = ev.target; if (el.matches && el.matches("#m textarea.auto")) autoSize(el); if (!["pt", "xs"].includes(el.dataset.t) || !SLF.includes(el.dataset.f)) return;
    if (el.type === "range") { const o = el.parentElement.querySelector("output"); if (o) o.textContent = el.value + "%" }
    const T = elT(el), o = tObj(T), pv = $("#prev"); if (!o || !pv) return;
    const add = isLXYW(el.dataset.f) ? missing(o, el.dataset.f.slice(0, 2)) : {};
    pv.innerHTML = prevOf(T, {...o, ...add, [el.dataset.f]: el.value}); if (!isLXYW(el.dataset.f)) fixPos(o) });
  document.addEventListener("click", ev => {
    const s = ev.target.closest("[data-sel]"); if (s) { sel = {k: s.dataset.sel, id: s.dataset.id}; render(); if (matchMedia("(max-width:820px)").matches) $("#m").scrollIntoView(); else window.scrollTo(0, 0); return }
    const v = ev.target.closest(".vtags [data-ve]"); if (v && sel.k === "pt") { verseEdit(sel.id, v.dataset.ve); return }
    const xe = ev.target.closest(".vtags [data-xe]"); if (xe && sel.k === "pt") { openSlide(+xe.dataset.xe); return }
    const ad = ev.target.closest('[data-act="addmenu"]'); if (ad) { addMenu(ad); return }
    const km = ev.target.closest("#ftext .vchip.bul"); if (km && sel.k === "pt") { if (dragged) { dragged = false; return } bulChange(km); return }
    const kl = ev.target.closest("#m .kplist li[data-b]"); if (kl && sel.k === "pt" && !ev.target.closest(".vtag")) { const f = findPt(D, sel.id); if (!f) return; const k = stepsOf(f.p).findIndex(x => x.b === +kl.dataset.b); if (k >= 0) { epeek = null; atEnd = false; setE(f.p, k); updStep() } return }
    const kt = ev.target.closest("#m .kplist .vtag[data-sub]"); if (kt && sel.k === "pt") { const f = findPt(D, sel.id); if (!f) return; epeek = null; atEnd = false; setE(f.p, +kt.dataset.sub); updStep(); return }
    const ch = ev.target.closest("#m .rich .vchip, #ftext .vchip"); if (ch && sel.k === "pt") { if (dragged) { dragged = false; return } peekAt(ch.dataset.ref.replace(/^!/, "")); return }
    const te = ev.target.closest('[data-act="tagedit"]'); if (te) { tagEdit(te.dataset.ref); return }
    if (ev.target.closest('[data-act="sedit"]')) { openSlide(null); return }
    if (ev.target.closest('[data-act="enext"]')) { enext(); return } if (ev.target.closest('[data-act="eprev"]')) { eprev(); return }
    if (ev.target.closest('[data-act="sdone"]')) { const dl = $("#sdlg"); if (dl) dl.close(); slideOpen = false; return }
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    if (a === "padd") { const pid = newId("p"); op({t: "padd", sid: id, pid}); sel = {k: "pt", id: pid}; render(); return }
    if (a === "sadd") { const sid = newId("s"); op({t: "sadd", sid}); sel = {k: "sec", id: sid}; render(); return }
    if (a === "pmove" || a === "smove") { op({t: a, [a === "pmove" ? "pid" : "sid"]: id, d: +b.dataset.d}, true); return }
    if (a === "vadd") { op({t: "vadd", pid: id}, true); const ins = document.querySelectorAll(`[data-t="v"][data-id="${CSS.escape(id)}"][data-f="ref"]`); if (ins.length) ins[ins.length - 1].focus(); return }
    if (a === "posreset") { const g = b.dataset.g, fs = g === "bul" ? ["ttSize", "ttColor", "blSize", "blColor"] : g === "all" ? POSF : ["X", "Y", "W", "Size", "Align", "Color"].map(x => g + x), T = elT(b);
      fs.forEach(k => setOp(T, k, "")); refreshSlide(); return }
    if (a === "imgdel") { setOp(elT(b), "image", "", true); return }
    if (a === "xdel") { if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Tap again to remove"; return }
      const T = elT(b), o = tObj(T); if (!o) return; renameTag(T.pid, o.name, null); dlgT = null; slideOpen = false; const dl = $("#sdlg"); if (dl && dl.open) dl.close(); op({t: "xdel", pid: T.pid, i: T.i}, true); return }
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
    if (el.dataset.vid) { const file = el.files && el.files[0]; if (!file) return; const pid = el.dataset.vid, T = {pid, i: +el.dataset.i}, msg = $("#imgmsg");
      if (file.size > 95e6) { if (msg) msg.textContent = "That video is too big for GitHub (over 95 MB). Shrink it and try again."; return }
      if (msg) msg.textContent = `Uploading ${Math.round(file.size / 1e6)} MB…`; if (tObj(T) && tObj(T).url) setOp(T, "url", "");
      try { const b64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = no; r.readAsDataURL(file) });
        const ext = (file.name.match(/\.([a-z0-9]{2,5})$/i) || [, "mp4"])[1].toLowerCase(), path = `slides/video/${pid}-${Date.now().toString(36)}.${ext}`;
        await GH.put(PATH + "/" + path, b64, null, "Video for " + pid); LOCALIMG[path] = URL.createObjectURL(file); setOp(T, "video", path, true) }
      catch (e) { if (msg) msg.textContent = "Upload failed: " + (e.detail || e.message) } return }
    if (el.dataset.img) { const file = el.files && el.files[0]; if (!file) return; const pid = el.dataset.img, msg = $("#imgmsg"); if (msg) msg.textContent = "Uploading…";
      const T = {pid, i: el.dataset.i != null && el.dataset.i !== "" ? +el.dataset.i : null};
      try { const url = await toJpeg(file), path = `slides/${pid}-${Date.now().toString(36)}.jpg`;
        await GH.put(PATH + "/" + path, url.split(",")[1], null, "Slide image for " + pid); LOCALIMG[path] = url; setOp(T, "image", path, true) }
      catch (e) { if (msg) msg.textContent = "Upload failed: " + (e.detail || e.message) } return }
    const t = el.dataset.t; if (!t) return; let v = el.value;
    if (t === "talk") op({t: "talk", f: el.dataset.f, v: el.dataset.f === "timerMinutes" ? v.trim() : v});
    else if (t === "sec") op({t: "sec", sid: el.dataset.id, f: el.dataset.f, v: el.dataset.f === "minutes" ? v.trim() : v});
    else if (t === "pt") { if (el.dataset.f === "keyPoints") v = v.split("\n").map(x => x.trim()).filter(Boolean); if (POSF.includes(el.dataset.f) && el.type === "range") v = +v;
      if (el.dataset.f === "seconds") { v = parseTime(v); el.value = v ? mmss(v) : "" }
      if (isLXYW(el.dataset.f)) { const f0 = findPt(D, el.dataset.id); if (f0 && !elPos(f0.p, el.dataset.f.slice(0, 2))) { const ad = missing(f0.p, el.dataset.f.slice(0, 2)); delete ad[el.dataset.f]; for (const [a, x] of Object.entries(ad)) op({t: "pt", pid: el.dataset.id, f: a, v: x}) } }
      op({t: "pt", pid: el.dataset.id, f: el.dataset.f, v});
      if (el.dataset.f === "script") { const d = el.parentElement.querySelector(".draft"); if (d) d.remove() }
      if (SLF.includes(el.dataset.f)) { if (!dlgT || dlgT.pid !== el.dataset.id || dlgT.i != null) dlgT = {pid: el.dataset.id, i: null}; refreshSlide() } if (el.dataset.f === "cue") { const h = $(".ed h2"); if (h) h.lastChild.textContent = v } }
    else if (t === "xs") { const T = elT(el), o = tObj(T), f = el.dataset.f; if (!o) return; if (el.type === "checkbox") { setOp(T, f, el.checked); return }
      if (f === "name") { const nv = v.trim(), pt = findPt(D, T.pid); if (!nv || nv === o.name) { el.value = o.name; return }
        if (tagOf(pt.p, nv) || /^(main slide|stop)$/i.test(nv)) { el.value = o.name; const m = $("#imgmsg") || el.parentElement; el.setCustomValidity("That name is already used on this point"); el.reportValidity(); setTimeout(() => el.setCustomValidity(""), 2500); return }
        renameTag(T.pid, o.name, nv); setOp(T, "name", nv); refreshSlide(); return }
      if (el.type === "range") v = +v;
      if (isLXYW(f) && !elPos(o, f.slice(0, 2))) { const ad = missing(o, f.slice(0, 2)); delete ad[f]; for (const [a, x] of Object.entries(ad)) setOp(T, a, x) }
      setOp(T, f, v); if (f === "type") fillDlg(); else refreshSlide() }
    else if (t === "v") { op({t: "vset", pid: el.dataset.id, i: +el.dataset.i, f: el.dataset.f, v: el.dataset.f === "text" ? v : v.trim()}); if (el.dataset.f === "ref") { const tags = document.querySelector(".ed .vtags"); const f = findPt(D, el.dataset.id); if (f) { const nt = verseTags(f.p); if (tags) tags.outerHTML = nt || ""; else if (nt) $(".ed h2").insertAdjacentHTML("afterend", nt) } } }
  });
  window.TALKAPP.ed = {sync: p => { const f = findPt(D, p.id); if (f) { relabel(f.p); redrawText(f.p) } }, listenMode(on){ lmode = !!on; const f = sel.k === "pt" && findPt(D, sel.id); if (f) redrawText(f.p) }, openBlock, redrawText: () => { const f = sel.k === "pt" && findPt(D, sel.id); if (f) redrawText(f.p) }, stepTo(key){ const f = sel.k === "pt" && findPt(D, sel.id); if (!f) return false; const L = stepsOf(f.p), k = L.findIndex(x => x.a === key || x.m === key); if (k < 0) return false; epeek = null; setE(f.p, k); updStep(); return true },
    stepNext: () => enext(), steps: () => { const f = sel.k === "pt" && findPt(D, sel.id); return f ? stepsOf(f.p) : [] }, pos: () => epos, D: () => D, op, render, flush, sel: () => sel, go(s){ sel = s; render(); window.scrollTo(0, 0) }, findPt: id => findPt(D, id), S, newId, tObj, setOp, refreshSlide, fillDlg, dlgT: () => dlgT, setSave};
  render(); document.dispatchEvent(new Event("talk-edit-ready"));
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
<link rel="stylesheet" href="../common/app.css?v=84"><link rel="stylesheet" href="../common/countdown.css?v=84"><link rel="stylesheet" href="../common/gate.css?v=84"></head>
<body data-mode="${mode}"><script src="../common/config.js?v=84"></script><script src="../common/countdown.js?v=84"></script><script src="../common/gate.js?v=84"></script><script src="../common/app.js?v=84"></script>${mode === "edit" ? '<script src="../common/ai.js?v=84"></script>' : ""}</body></html>
`;
const folderName = t => t.replace(/&/g, " ").replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join("-");
const newTalk = title => ({format: "talk/1", id: folderName(title).toLowerCase(), title, audience: "", length: "", event: "", bigIdea: "", timerMinutes: "", coverImage: "", titleImage: "",
  relayTopic: "kim-talk-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, "0")).join(""),
  sections: [{id: "s1", title: "Opening", minutes: "", points: [{id: "p1", cue: "Opening slide", eyebrow: "", slideTitle: title, slide: "", layout: "center", image: "", verses: [], script: "", scriptDraft: false}]}]});
// ---- New version (talk/2): one text with outline tags and a slide library ----
const STUB2 = mode => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Talk</title>
<link rel="stylesheet" href="../common/app.css?v=84"><link rel="stylesheet" href="../common/app2.css?v=84"><link rel="stylesheet" href="../common/countdown.css?v=84"><link rel="stylesheet" href="../common/gate.css?v=84"></head>
<body data-mode="${mode}"><script src="../common/config.js?v=84"></script><script src="../common/countdown.js?v=84"></script><script src="../common/gate.js?v=84"></script><script src="../common/app.js?v=84"></script><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script><script src="../common/app2.js?v=84"></script>${mode === "edit2" ? '<script src="../common/ai.js?v=84"></script>' : ""}</body></html>
`;
const relayTopic = () => "kim-talk-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, "0")).join("");
const newTalk2 = title => ({format: "talk/2", id: folderName(title).toLowerCase(), title, audience: "", length: "", event: "", bigIdea: "", timerMinutes: "", relayTopic: relayTopic(),
  text: "[#1 Opening]\n[Title]\n", slides: [{name: "Title", type: "image", eyebrow: "", slideTitle: title, slide: "", layout: "center", image: ""}], times: {}, notes: {}, audNotes: {}, languages: []});
// A talk in the old shape (sections → points with their own text) turned into the new one (same as convert_talk2.py).
function toV2(d){ const PLACE = /^(text[XYW]|align|(eb|tt|sb)(X|Y|W|Size|Align|Color)|bl(Size|Color))$/, slides = [], names = new Set(), times = {}, verseBy = {}, T = [];
  const uniq = (n, lab) => { n = String(n || "").replace(/[\[\]{}\n]+/g, " ").trim() || "Slide"; if (["stop", "main slide"].includes(n.toLowerCase())) n += " slide"; if (!names.has(n)) { names.add(n); return n } let k = `${n} (${lab})`, i = 2; while (names.has(k)) k = `${n} (${lab} ${i++})`; names.add(k); return k };
  const tag = (l, t) => `[#${l} ` + String(t).replace(/[\[\]\n]+/g, " ").replace(/\s+/g, " ").trim() + "]";
  (d.sections || []).forEach((s, si) => { T.push(tag(1, s.title || "Section " + (si + 1)));
    (s.points || []).forEach((p, pi) => { const lab = (si + 1) + "." + String.fromCharCode(97 + pi), ren = {}; T.push(tag(2, p.cue || "Point")); if (p.seconds) times["2|" + String(p.cue || "Point").replace(/\s+/g, " ").trim()] = p.seconds;
      let main = null; if (p.image || (p.slideTitle || "").trim() || (p.slide || "").trim() || (p.eyebrow || "").trim()) { main = uniq(p.cue || "Slide", lab);
        const o = {name: main, type: "image", eyebrow: p.eyebrow || "", slideTitle: p.slideTitle || "", slide: p.slide || "", layout: p.layout || "left", image: p.image || ""}; for (const [k, v] of Object.entries(p)) if (PLACE.test(k) || ["imagePrompt", "prevImage", "imageStyle"].includes(k)) o[k] = v; slides.push(o) }
      for (const v of p.verses || []) { const ref = (v.ref || "").trim(); if (!ref) continue; const key = ref + "|" + (v.text || ""); if (verseBy[key]) { ren[ref] = verseBy[key]; continue } const n = uniq(ref, lab); verseBy[key] = n; ren[ref] = n; slides.push({name: n, type: "verse", ref, text: v.text || "", version: v.version || ""}) }
      for (const x of p.slides || []) { if (!x.name) continue; const n = uniq(x.name, lab); ren[x.name.trim()] = n; slides.push({...x, name: n}) }
      if (main) ren["Main slide"] = main;
      const parts = (p.script || "").split(/(\[#[12](?: [^\[\]\n]*)?\])/); let sc = parts[0];
      for (let i = 1; i < parts.length; i += 2) { const m = parts[i].match(/\[#[12](?: ([^\[\]\n]*))?\]/), txt = (m && m[1]) || "", body = parts[i + 1] || "", refs = [...txt.matchAll(/\{([^{}\n]+)\}/g)].map(x => x[1].trim()); sc += refs.filter(r => !body.includes("[" + r + "]")).map(r => "[" + r + "]").join("") + body }
      sc = sc.replace(/\[([^\[\]\n]{1,60})\]/g, (a, r) => ren[r.trim()] ? "[" + ren[r.trim()] + "]" : a);
      T.push((main ? "[" + main + "]" : "") + (sc.trim() ? "\n" + sc.replace(/^\n+|\n+$/g, "") : "")) }) });
  const o = {...d}; delete o.sections; return Object.assign(o, {format: "talk/2", text: T.join("\n"), slides, times, notes: d.notes || {}, audNotes: d.audNotes || {}, languages: d.languages || []}) }
// Makes a new-version talk's folder (talk2.json + its pages) and lists it. Returns the folder and talk2.json's sha.
async function createTalk2(talk){ const folder = folderName(talk.title), base = C.root + "/" + folder;
  const sha = await GH.put(base + "/talk2.json", b64e(JSON.stringify(talk, null, 1) + "\n"), null, "New talk: " + talk.title);
  for (const [f, m] of [["index.html", "slides2"], ["slides2.html", "slides2"], ["present2.html", "present2"], ["edit2.html", "edit2"], ["audience.html", "audience2"]]) await GH.put(base + "/" + f, b64e(STUB2(m)), null, "New talk: " + talk.title);
  let lsha = null, cur = []; try { const g = await GH.get(C.root + "/talks.json"); lsha = g.sha; cur = JSON.parse(g.text) } catch (e) {}
  if (!cur.some(t => t.folder === folder)) { cur.push({folder, title: talk.title, v: 2}); await GH.put(C.root + "/talks.json", b64e(JSON.stringify(cur, null, 1) + "\n"), lsha, "List new talk: " + talk.title) }
  return {folder, sha} }
// Makes the talk's folder (talk.json + its three pages) and lists it. Returns the folder and talk.json's sha.
async function createTalk(talk){ const folder = folderName(talk.title), base = C.root + "/" + folder;
  const sha = await GH.put(base + "/talk.json", b64e(JSON.stringify(talk, null, 1) + "\n"), null, "New talk: " + talk.title);
  for (const [f, m] of [["index.html", "monitor"], ["present.html", "present"], ["edit.html", "edit"]]) await GH.put(base + "/" + f, b64e(STUB(m)), null, "New talk: " + talk.title);
  let lsha = null, cur = []; try { const g = await GH.get(C.root + "/talks.json"); lsha = g.sha; cur = JSON.parse(g.text) } catch (e) {}
  if (!cur.some(t => t.folder === folder)) { cur.push({folder, title: talk.title}); await GH.put(C.root + "/talks.json", b64e(JSON.stringify(cur, null, 1) + "\n"), lsha, "List new talk: " + talk.title) }
  return {folder, sha} }
async function index(){
  document.body.innerHTML = `<div class="setup" style="max-width:820px"><h1 style="margin:0">Talks</h1><div id="list"><p class="note">Loading…</p></div>
    <div><button class="btn" id="new" type="button">+ New talk</button> <a class="btn" href="prepare.html">✨ Prepare a new talk with AI</a> <span class="note" id="msg"></span></div></div>`;
  let list = []; try { list = await (await fetch("talks.json?t=" + Date.now(), {cache: "no-store"})).json() } catch (e) {}
  $("#list").innerHTML = list.length ? `<ul>${list.map(t => `<li style="margin:6px 0"><b>${E(t.title)}</b>: ${t.v === 2 || t.v2 ? `<a href="${E(t.folder)}/present2.html">Stage</a> · <a href="${E(t.folder)}/edit2.html">Edit</a> · <a href="${E(t.folder)}/slides2.html">Slides</a> · <a href="${E(t.folder)}/audience.html">Audience</a>${t.v2 ? ` · <a class="note" href="${E(t.folder)}/edit.html">old version</a>` : ""}` : `<a href="${E(t.folder)}/present.html">Stage</a> · <a href="${E(t.folder)}/edit.html">Edit</a> · <a href="${E(t.folder)}/">Monitor (slides)</a>`}</li>`).join("")}</ul>` : '<p class="note">No talks yet.</p>';
  $("#new").onclick = () => presenterGate(C.passHash, "pres-ok", async () => {
    if (!token()) { tokenSetup(() => location.reload()); return }
    const title = prompt("Title of the new talk?"); if (!title) return; const folder = folderName(title); const msg = $("#msg");
    if (!folder) return; if (list.some(t => t.folder === folder)) { msg.textContent = "A talk with that folder already exists."; return }
    msg.textContent = "Creating…";
    try { await createTalk2(newTalk2(title));
      msg.innerHTML = `Created. Its pages go live in about a minute: <a href="${E(folder)}/edit2.html">open the editor</a>.` }
    catch (e) { msg.textContent = "Couldn't create it: " + (e.detail || e.message) }
  });
}

window.TALKAPP = {setSlide, imgTag, preload, SLIDE_TYPES, isXS, hasPic, isBul, stepsOf, CUETAG, tagKey, bullets, bulRefs, bulPlain, bulTag, BUL, BREF, splitBlocks, trimBlk, C, E, $, GH, PATH, FOLDER, RAW, LOCALIMG, toJpeg, b64e, token, tokenSetup, presenterGate: window.presenterGate, folderName, newTalk, createTalk, newTalk2, createTalk2, toV2, steps, letter, TAG, tagOf, fmtVerse, slideBox, xsHTML, verseSlide, D: () => D};
({monitor, present, edit, index}[MODE] || (() => {}))();
})();
