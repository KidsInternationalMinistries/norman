// ✨ AI tools for the talk pages: shared keys, Create image, talk picture style, spelling/grammar/flow check,
// AI drafts of a movement, Prepare (develop a new talk in a chat, then create it), and Listen (natural voice).
// Calls go from the browser straight to OpenAI, ElevenLabs and the ESV API.
(function(){
"use strict";
const T = window.TALKAPP; if (!T) return;
const {C, E, $, GH} = T;
const MODE = document.body.dataset.mode;
const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;

// =====================================================================
// KEYS: one shared set for everyone, kept in the repo encrypted with the presenter password.
// Once unlocked, a browser keeps its copy in localStorage.
// =====================================================================
const KEYFILE = C.root + "/common/keys.json", LK = "ai-keys";
const DEF = {textModel: "", imageQuality: "high", voice: "", voiceName: ""};
let KEYS = (() => { try { return {...DEF, ...JSON.parse(localStorage.getItem(LK) || "{}")} } catch (e) { return {...DEF} } })();
const saveLocal = () => { try { localStorage.setItem(LK, JSON.stringify(KEYS)) } catch (e) {} };
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function aesKey(pass, salt){ const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256"}, base, {name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]) }
async function encrypt(obj, pass){ const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name: "AES-GCM", iv}, await aesKey(pass, salt), new TextEncoder().encode(JSON.stringify(obj)));
  return {format: "keys/1", note: "AI keys for the talk pages, encrypted with the presenter password. Change them in Edit, ✨ AI, Settings.", salt: b64(salt), iv: b64(iv), data: b64(data), updated: new Date().toISOString()} }
async function decrypt(blob, pass){ const out = await crypto.subtle.decrypt({name: "AES-GCM", iv: unb64(blob.iv)}, await aesKey(pass, unb64(blob.salt)), unb64(blob.data)); return JSON.parse(new TextDecoder().decode(out)) }
const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, "0")).join("");
async function keyBlob(){
  if (T.token()) { try { const g = await GH.get(KEYFILE); return {sha: g.sha, blob: JSON.parse(g.text)} } catch (e) { if (e.status === 404) return {sha: null, blob: null} } }
  try { const r = await fetch(new URL("keys.json", SCRIPT_URL).href + "?t=" + Date.now(), {cache: "no-store"}); if (r.ok) return {sha: null, blob: await r.json()} } catch (e) {}
  return {sha: null, blob: null} }
function askPass(why){ return new Promise(ok => { const d = dlg("aipass", `<form method="dialog" class="ed"><h3>Presenter password</h3><p class="note">${E(why)}</p>
    <input type="password" id="aipw" autocomplete="current-password" aria-label="Presenter password"><div class="aimsg" id="aipwm"></div>
    <div class="row"><span style="flex:1"></span><button type="button" class="btn small" id="aipwc">Cancel</button><button class="btn small pri" type="submit">OK</button></div></form>`);
  const done = v => { d.close(); ok(v) };
  $("#aipwc").onclick = () => done(null);
  d.querySelector("form").onsubmit = async e => { e.preventDefault(); const v = $("#aipw").value; if ((await sha(v)) !== C.passHash) { $("#aipwm").textContent = "That's not it. Try again."; return } done(v) };
  show(d); $("#aipw").focus() }) }
// Get the keys this browser needs; unlocks the shared ones the first time.
async function need(k){
  if (KEYS[k]) return KEYS[k];
  const {blob} = await keyBlob();
  if (blob) { const pw = await askPass("Unlocks the shared AI keys on this browser (one time)."); if (!pw) throw quiet("Cancelled");
    try { Object.assign(KEYS, await decrypt(blob, pw)); saveLocal() } catch (e) { throw new Error("Couldn't unlock the saved keys.") } if (KEYS[k]) return KEYS[k] }
  settings(); throw quiet("Add the " + ({openai: "OpenAI", eleven: "ElevenLabs", esv: "ESV"}[k] || k) + " key in Settings first.") }
const quiet = m => { const e = new Error(m); e.quiet = true; return e };
// ElevenLabs keys can be limited to speech only; then the voice list is refused (401) and these standard voices are offered.
const STD_VOICES = [["JBFqnCBsd6RMkjVDRZzb", "George (warm, British)"], ["nPczCjzI2devNBz1zQrb", "Brian (deep, American)"], ["pNInz6obpgDQGcFmaJgB", "Adam (American)"], ["TxGEqnHWrfWFTfGW9XjX", "Josh (American)"], ["onwK4e9ZLuTAKqWW03F9", "Daniel (British)"], ["21m00Tcm4TlvDq8ikWAM", "Rachel (American)"], ["EXAVITQu4vr4xnAQ5dPS", "Bella (American)"]];
async function elErr(r){ let m = ""; try { const j = await r.json(), d = j.detail || j; m = d.message || d.status || (typeof d === "string" ? d : "") } catch (e) {} return m }
const mask = v => v ? "Saved · ends …" + v.slice(-4) : "Not set";
function settings(){
  const d = dlg("aiset", `<form method="dialog" class="ed"><div class="pgh"><h3 style="margin:0">✨ AI settings</h3><button type="button" class="btn small" id="aisx">Close</button></div>
    <p class="note">One set of keys for everyone. They are saved in the site's files encrypted with the presenter password, so anyone who knows it can use them. A key is never shown again after it's saved; type a new one to replace it.</p>
    ${[["openai", "OpenAI key", "sk-…", "Pictures, writing, checking"], ["eleven", "ElevenLabs key", "", "Listen to the talk"], ["esv", "ESV API key", "", "Exact ESV verse text (free from api.esv.org)"]].map(([k, l, ph, u]) =>
      `<label>${l} <span class="note">· ${u} · <b data-km="${k}">${mask(KEYS[k])}</b></span><input type="password" autocomplete="off" data-key="${k}" placeholder="${ph || "Paste to set or replace"}"></label>`).join("")}
    <div class="row"><label style="flex:1 1 200px">Default voice (a talk can pick its own in Talk details)<select id="aivoice"><option value="${E(KEYS.voice)}">${E(KEYS.voiceName || (KEYS.voice ? "Saved voice" : "First voice on the account"))}</option></select></label>
      <label style="flex:1 1 160px">Picture quality<select id="aiq">${["high", "medium", "low"].map(q => `<option${KEYS.imageQuality === q ? " selected" : ""}>${q}</option>`).join("")}</select></label>
      <label style="flex:1 1 160px">Writing model (optional)<input id="aitm" value="${E(KEYS.textModel)}" placeholder="automatic"></label></div>
    <div class="aimsg" id="aism"></div>
    <div class="row"><button type="button" class="btn small" id="aist">Test keys</button><button type="button" class="btn small" id="aisf">Forget on this browser</button><span style="flex:1"></span><button class="btn small pri" type="submit">Save for everyone</button></div></form>`);
  const msg = t => { $("#aism").innerHTML = t };
  $("#aisx").onclick = () => d.close();
  const collect = () => { const o = {...KEYS}; d.querySelectorAll("[data-key]").forEach(i => { if (i.value.trim()) o[i.dataset.key] = i.value.trim() });
    const vs = $("#aivoice"); o.voice = vs.value; o.voiceName = vs.selectedOptions[0] ? vs.selectedOptions[0].textContent : ""; o.imageQuality = $("#aiq").value; o.textModel = $("#aitm").value.trim(); return o };
  async function loadVoices(k){ if (!k) return; try { const r = await fetch("https://api.elevenlabs.io/v1/voices", {headers: {"xi-api-key": k}}); const vs = $("#aivoice"), j = r.ok ? await r.json() : {voices: STD_VOICES.map(([voice_id, name]) => ({voice_id, name}))};
    vs.innerHTML = (j.voices || []).map(v => `<option value="${E(v.voice_id)}"${v.voice_id === KEYS.voice ? " selected" : ""}>${E(v.name)}</option>`).join("") } catch (e) {} }
  loadVoices(KEYS.eleven); d.querySelector('[data-key="eleven"]').addEventListener("change", e => loadVoices(e.target.value.trim()));
  $("#aist").onclick = async () => { const o = collect(); msg("Testing…"); const out = [];
    if (o.openai) { try { const r = await fetch("https://api.openai.com/v1/models", {headers: {Authorization: "Bearer " + o.openai}}); out.push("OpenAI: " + (r.ok ? "✓ works" : r.status === 401 ? "✗ key not accepted (expired?)" : "✗ " + r.status)) } catch (e) { out.push("OpenAI: ✗ can't reach it") } }
    if (o.eleven) { try { const r = await fetch("https://api.elevenlabs.io/v1/voices", {headers: {"xi-api-key": o.eleven}});
        if (r.ok) out.push("ElevenLabs: ✓ works");
        else { const why = await elErr(r), t = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${o.voice || STD_VOICES[0][0]}?output_format=mp3_44100_128`, {method: "POST", headers: {"xi-api-key": o.eleven, "Content-Type": "application/json"}, body: JSON.stringify({text: "Hi.", model_id: "eleven_multilingual_v2"})});
          out.push(t.ok ? "ElevenLabs: ✓ works for speech (this key can't list your voices, so the standard voices are offered)" : "ElevenLabs: ✗ " + t.status + " " + ((await elErr(t)) || why) + (t.status === 401 ? ". In ElevenLabs, edit the key and turn on Text to Speech (and Voices: Read)." : "")) } } catch (e) { out.push("ElevenLabs: ✗ can't reach it") } }
    if (o.esv) { try { const r = await fetch("https://api.esv.org/v3/passage/text/?q=John+11:35", {headers: {Authorization: "Token " + o.esv}}); out.push("ESV: " + (r.ok ? "✓ works" : "✗ " + r.status)) } catch (e) { out.push("ESV: ✗ can't reach it from the browser (verses will come from the AI, marked to check)") } }
    msg(out.length ? out.map(E).join("<br>") : "No keys to test.") };
  $("#aisf").onclick = () => { try { localStorage.removeItem(LK) } catch (e) {} KEYS = {...DEF}; d.querySelectorAll("[data-km]").forEach(b => b.textContent = mask("")); msg("Forgotten on this browser. The shared copy is still saved.") };
  d.querySelector("form").onsubmit = async e => { e.preventDefault(); const o = collect();
    if (!T.token()) { msg("This browser isn't connected to GitHub, so it can't save for everyone. Open Edit on a talk first."); return }
    const pw = await askPass("The keys are locked with the presenter password."); if (!pw) return; msg("Saving…");
    try { const {sha: s0} = await keyBlob(); const keep = {openai: o.openai || "", eleven: o.eleven || "", esv: o.esv || "", voice: o.voice, voiceName: o.voiceName, imageQuality: o.imageQuality, textModel: o.textModel};
      await GH.put(KEYFILE, T.b64e(JSON.stringify(await encrypt(keep, pw), null, 1) + "\n"), s0, "Update shared AI keys (encrypted)");
      KEYS = {...DEF, ...keep}; saveLocal(); d.querySelectorAll("[data-key]").forEach(i => { i.value = ""; d.querySelector(`[data-km="${i.dataset.key}"]`).textContent = mask(KEYS[i.dataset.key]) }); msg("Saved for everyone ✓") }
    catch (err) { msg("Couldn't save: " + E(err.detail || err.message)) } };
  show(d) }

// =====================================================================
// SMALL UI HELPERS
// =====================================================================
function dlg(id, html, cls){ let d = document.getElementById(id); if (!d) { d = document.createElement("dialog"); d.id = id; document.body.appendChild(d) } d.className = "aidlg " + (cls || ""); d.innerHTML = html; return d }
function show(d){ if (!d.open) try { d.showModal() } catch (e) { d.setAttribute("open", "") } }
function toast(t, err){ let el = $("#aitoast"); if (!el) { el = document.createElement("div"); el.id = "aitoast"; document.body.appendChild(el) } el.textContent = t; el.className = err ? "err on" : "on"; clearTimeout(el._t); el._t = setTimeout(() => el.className = "", err ? 9000 : 4000) }
const fail = e => { if (e && e.quiet) { if (e.message !== "Cancelled") toast(e.message) } else toast((e && e.message) || "Something went wrong", true) };
function ticker(el, label){ const t0 = Date.now(); const f = () => { if (el.isConnected) el.textContent = label + " " + Math.round((Date.now() - t0) / 1000) + "s" }; f(); const h = setInterval(f, 1000); return () => clearInterval(h) }
async function pool(items, n, fn){ let i = 0; const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k) } }; await Promise.all(Array.from({length: Math.min(n, items.length)}, run)) }
const fileToDataURL = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f) });
const dataURLtoBlob = async u => (await fetch(u)).blob();
const strip = t => (t || "").replace(/\[([^\[\]\n]{1,60})\]/g, (a, r) => /^@/.test(r) ? "" : "[" + r + "]").replace(/[ \t]+/g, " ").trim();
const noTags = t => (t || "").replace(/\[([^\[\]\n]{1,60})\]/g, "").replace(/[ \t]+/g, " ").trim();
function loadScript(src){ return new Promise((ok, no) => { if ([...document.scripts].some(s => s.src === src)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Couldn't load " + src)); document.head.appendChild(s) }) }

// =====================================================================
// OPENAI
// =====================================================================
const TEXT_MODELS = ["gpt-5.1", "gpt-5", "gpt-4.1"], IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"];
let textModelOK = null, imageModelOK = null;
async function oaErr(r){ let m = ""; try { const j = await r.json(); m = (j.error && j.error.message) || "" } catch (e) {}
  if (r.status === 401) { const e = new Error("OpenAI didn't accept the key (it may have expired). Put a new one in ✨ AI, Settings."); e.status = 401; return e }
  const e = new Error("OpenAI: " + (m || r.status)); e.status = r.status; e.model = /model/i.test(m) && /(not exist|not found|does not have access|unsupported|invalid)/i.test(m); return e }
// chat(system, user parts) → parsed JSON. user may be a string or an array of content parts (text, image_url, file).
async function chat(system, user, opt = {}){ const key = await need("openai");
  const list = KEYS.textModel ? [KEYS.textModel] : textModelOK ? [textModelOK] : TEXT_MODELS;
  for (const model of list) {
    const body = {model, messages: [{role: "system", content: system}, {role: "user", content: user}]};
    if (opt.json !== false) body.response_format = {type: "json_object"};
    if (/^gpt-5/.test(model)) body.reasoning_effort = opt.effort || "low";
    let r; for (let a = 0; a < 3; a++) { r = await fetch("https://api.openai.com/v1/chat/completions", {method: "POST", headers: {Authorization: "Bearer " + key, "Content-Type": "application/json"}, body: JSON.stringify(body)}); if (r.status !== 429 && r.status < 500) break; await new Promise(z => setTimeout(z, 3000 * (a + 1))) }
    if (!r.ok) { const e = await oaErr(r); if ((e.model || r.status === 404) && list.length > 1) continue; if (e.status === 401) settings(); throw e }
    textModelOK = model; const j = await r.json(), txt = j.choices[0].message.content || "";
    if (opt.json === false) return txt; try { return JSON.parse(txt) } catch (e) { const m = txt.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error("The AI's answer wasn't readable. Try again.") } }
  throw new Error("No OpenAI writing model was available.") }
// image(prompt, base images as Blobs) → array of JPEG data URLs. With images it edits/combines them; without, it makes a new picture.
async function image(prompt, imgs = [], n = 1){ const key = await need("openai");
  const list = imageModelOK ? [imageModelOK] : IMAGE_MODELS;
  for (const model of list) { let r;
    for (let a = 0; a < 3; a++) {
      if (imgs.length) { const f = new FormData(); f.append("model", model); f.append("prompt", prompt); f.append("n", n); f.append("size", "1536x1024"); f.append("quality", KEYS.imageQuality || "high");
        imgs.forEach((b, i) => f.append("image[]", b, "image" + i + ((b.type || "").includes("png") ? ".png" : ".jpg")));
        r = await fetch("https://api.openai.com/v1/images/edits", {method: "POST", headers: {Authorization: "Bearer " + key}, body: f}) }
      else r = await fetch("https://api.openai.com/v1/images/generations", {method: "POST", headers: {Authorization: "Bearer " + key, "Content-Type": "application/json"}, body: JSON.stringify({model, prompt, n, size: "1536x1024", quality: KEYS.imageQuality || "high"})});
      if (r.status !== 429 && r.status < 500) break; await new Promise(z => setTimeout(z, 8000 * (a + 1))) }
    if (!r.ok) { const e = await oaErr(r); if (e.model && list.length > 1) continue; if (e.status === 401) settings(); throw e }
    imageModelOK = model; const j = await r.json();
    return Promise.all((j.data || []).map(async x => T.toJpeg(await dataURLtoBlob(x.b64_json ? "data:image/png;base64," + x.b64_json : x.url)))) }
  throw new Error("No OpenAI picture model was available.") }
// The current picture of a slide as a Blob (works before the site has redeployed).
async function picBlob(path){ if (!path) return null; const tries = [T.LOCALIMG[path] || path, T.RAW + T.PATH + "/" + path];
  for (const u of tries) { try { const r = await fetch(u); if (r.ok) return await r.blob() } catch (e) {} } return null }
async function savePic(pid, dataURL, tag){ const path = `slides/${tag || "ai"}-${pid}-${Date.now().toString(36)}.jpg`;
  await GH.put(T.PATH + "/" + path, dataURL.split(",")[1], null, "AI picture for " + pid); T.LOCALIMG[path] = dataURL; return path }

// Standing rules for every slide picture.
const PIC_RULES = `It is the full-bleed 16:9 background of a presentation slide for a Christian ministry talk (Kids International Ministries, Philippines).
ABSOLUTELY NO words, letters, numbers, captions, signs, logos or watermarks anywhere in the picture; the slide text is added on top later.
Keep the area where the text will sit calm, simple and darker so white and gold text reads clearly. Cinematic light, rich but not garish color, respectful and hopeful.`;
const styleOf = d => (d && d.imageStyle || "").trim();
function placeNote(o){ const c = o && o.layout === "center"; return c ? "The text will be centered, so keep the middle calm and darker." : "The text will sit on the left, so keep the left 45% calm and darker." }

// =====================================================================
// TALK CONTEXT for the AI
// =====================================================================
function outline(d, opt = {}){ const L = [`Talk: ${d.title}`]; if (d.audience) L.push("Audience: " + d.audience); if (d.event) L.push("Event: " + d.event); if (d.length) L.push("Length: " + d.length); if (d.bigIdea) L.push("Big idea: " + d.bigIdea);
  d.sections.forEach((s, si) => { L.push(`\n## ${si + 1}. ${s.title}${s.minutes ? " (" + s.minutes + " min)" : ""}`);
    s.points.forEach((p, pi) => { const full = opt.full === true || opt.full === s.id;
      L.push(`### ${si + 1}.${T.letter(pi)} ${p.cue || ""}`); const st = [p.eyebrow, p.slideTitle, p.slide].filter(Boolean).join(" / "); if (st) L.push("Slide: " + st);
      (p.keyPoints || []).filter(x => (x || "").trim()).forEach(x => L.push("- " + strip(x)));
      const sc = noTags(p.script); if (sc) L.push(full ? sc : sc.slice(0, opt.cap || 280) + (sc.length > (opt.cap || 280) ? "…" : ""));
      (p.verses || []).filter(v => v && v.ref).forEach(v => L.push(`Verse ${v.ref}${full && v.text ? ": " + v.text.replace(/\*\*|__/g, "") : ""}`)) }) });
  return L.join("\n") }

// =====================================================================
// CREATE IMAGE (any slide with a picture)
// =====================================================================
function imgButton(A){ return `<button type="button" class="btn small aib" data-act="aiimg" ${A}>✨ Create image</button>` }
async function createImage(t){
  const ed = T.ed, D = ed.D(), o = ed.tObj(t); if (!o) return; const f = ed.findPt(t.pid), sec = D.sections.find(s => s.points.includes(f.p)), L = ed.S(), lab = (L.find(x => x.id === t.pid) || {}).label || "";
  const uploads = []; let prompts = null, results = [], style = styleOf(D), styleRef = D.imageStyleRef || "";
  const d = dlg("aiimgd", `<div class="ed"><div class="pgh"><b>✨ Create image · ${E(lab)} ${E(o.name || f.p.cue || "")}</b><button type="button" class="btn small" data-x>Close</button></div>
    <div class="aiimg"><div class="aicur">${o.image ? `<img alt="Current picture" src="${E(T.LOCALIMG[o.image] || o.image)}">` : '<div class="aiempty">No picture yet</div>'}
      ${o.image ? `<label class="chk"><input type="checkbox" id="aibase" checked> Start from this picture</label>` : ""}
      ${styleRef ? `<label class="chk"><input type="checkbox" id="aisref" checked> Match the talk's style picture</label>` : ""}</div>
    <div class="aiask"><label>What do you want?<textarea id="aiwant" rows="3" placeholder="e.g. Same scene at sunrise. Or: a Filipino boy reading a Bible under a mango tree. Or: use my photo, make it look like the other slides."></textarea></label>
      <div class="row"><label class="btn small aiup">+ Add pictures<input type="file" accept="image/*" multiple hidden id="aiupf"></label><div class="aithumbs" id="aithumbs"></div></div>
      <div class="row"><button type="button" class="btn small pri" id="aigo1">Write the prompt</button><span class="aimsg" id="aim1"></span></div></div></div>
    <div id="aistep2" hidden><label>Prompt (change anything you like)<textarea id="aiprompt" rows="6"></textarea></label>
      <div class="row"><button type="button" class="btn small pri" id="aigo2">Create 2 pictures</button><span class="aimsg" id="aim2"></span></div></div>
    <div id="aistep3" hidden><div class="aires" id="aires"></div><div class="row"><span class="note" style="flex:1">Pick one to use it on the slide. The old picture is kept so you can go back.</span><button type="button" class="btn small" id="aiagain">Try again</button></div></div>
    ${o.prevImage ? `<div class="row"><button type="button" class="btn small" id="aiundo">↶ Go back to the previous picture</button></div>` : ""}</div>`, "wide");
  d.querySelector("[data-x]").onclick = () => d.close();
  $("#aiupf").onchange = async e => { for (const file of e.target.files) uploads.push(await T.toJpeg(file)); $("#aithumbs").innerHTML = uploads.map((u, i) => `<span><img alt="" src="${u}"><button type="button" data-rm="${i}" title="Remove">✕</button></span>`).join(""); e.target.value = "" };
  $("#aithumbs").onclick = e => { const b = e.target.closest("[data-rm]"); if (!b) return; uploads.splice(+b.dataset.rm, 1); $("#aithumbs").innerHTML = uploads.map((u, i) => `<span><img alt="" src="${u}"><button type="button" data-rm="${i}">✕</button></span>`).join("") };
  if ($("#aiundo")) $("#aiundo").onclick = () => { ed.setOp(t, "image", o.prevImage); ed.setOp(t, "prevImage", ""); d.close(); afterPic(t) };
  const base = () => !!($("#aibase") && $("#aibase").checked && o.image), useRef = () => !!($("#aisref") && $("#aisref").checked && styleRef);
  $("#aigo1").onclick = async () => { const b = $("#aigo1"); b.disabled = true; const stop = ticker($("#aim1"), "Writing the prompt…");
    try { const imgsNote = [base() ? "Image 1 is the slide's current picture (edit it; keep what the speaker didn't ask to change)." : "", useRef() ? "One image is the talk's style picture: match its look, light and color." : "", uploads.length ? uploads.length + " image(s) were uploaded by the speaker; use them as the request says (as-is, as a base, or as reference)." : ""].filter(Boolean).join(" ");
      const slideText = o.type === "quote" ? o.quote : [o.eyebrow, o.slideTitle, o.slide, o.bullets].filter(Boolean).join(" / ");
      const j = await chat(`You write prompts for an image model. ${PIC_RULES}\nReturn JSON {"prompt": "..."}: one rich, concrete prompt of 80-160 words describing the scene, subject, setting, light, mood and composition. Ground it in the meaning of this point of the talk. If the request is short, fill in good choices; never contradict it.`,
        `Speaker's request: ${$("#aiwant").value.trim() || "(none, choose the best picture for this slide)"}\nSlide text (it goes on top, do not draw it): ${slideText || "(none)"}\n${placeNote(o)}\n${style ? "The talk's picture style (follow it): " + style + "\n" : ""}${imgsNote ? "Images sent with the prompt: " + imgsNote + "\n" : ""}${o.imagePrompt ? "Prompt used for the current picture: " + o.imagePrompt + "\n" : ""}\nThe point this slide is on: ${lab} ${f.p.cue || ""}\n\nThe whole movement it sits in:\n${outline({...D, sections: [sec]}, {full: true})}\n\nThe talk in short:\n${outline(D, {cap: 120})}`, {effort: "low"});
      $("#aiprompt").value = j.prompt || ""; $("#aistep2").hidden = false; $("#aim1").textContent = "" } catch (e) { $("#aim1").textContent = ""; fail(e) } finally { stop(); b.disabled = false; $("#aim1").textContent = "" } };
  async function makePics(){ const b = $("#aigo2"); b.disabled = true; $("#aistep3").hidden = true; const stop = ticker($("#aim2"), "Making 2 pictures (about a minute)…");
    try { const imgs = []; if (base()) { const bl = await picBlob(o.image); if (bl) imgs.push(bl) } if (useRef()) { const bl = await picBlob(styleRef); if (bl) imgs.push(bl) } for (const u of uploads) imgs.push(await dataURLtoBlob(u));
      const pr = $("#aiprompt").value.trim() + "\n\n" + PIC_RULES;
      results = (await Promise.all([image(pr, imgs, 1), image(pr, imgs, 1)])).flat();
      $("#aires").innerHTML = results.map((u, i) => `<button type="button" data-pick="${i}"><img alt="Option ${i + 1}" src="${u}"><span>Use this one</span></button>`).join(""); $("#aistep3").hidden = false }
    catch (e) { fail(e) } finally { stop(); b.disabled = false; $("#aim2").textContent = "" } }
  $("#aigo2").onclick = makePics; $("#aiagain").onclick = makePics;
  $("#aires").onclick = async e => { const b = e.target.closest("[data-pick]"); if (!b) return; b.disabled = true; b.querySelector("span").textContent = "Saving…";
    try { const path = await savePic(t.pid, results[+b.dataset.pick]); if (o.image) ed.setOp(t, "prevImage", o.image); ed.setOp(t, "imagePrompt", $("#aiprompt").value.trim()); ed.setOp(t, "image", path); d.close(); afterPic(t); toast("Picture saved to the slide ✓") }
    catch (err) { b.disabled = false; b.querySelector("span").textContent = "Use this one"; fail(err) } };
  show(d); $("#aiwant").focus() }
function afterPic(t){ const ed = T.ed, sd = $("#sdlg"); if (sd && sd.open) { ed.fillDlg(); ed.refreshSlide() } else ed.render() }

// ---- the talk's picture style (Talk details) ----
function voiceHTML(d){ const v = d.voice || "";
  return `<div class="aibox"><div class="pgh"><b>🔊 Voice for this talk</b></div>
    <p class="note">Used by Listen and the narrated version. Your own ElevenLabs voices (a clone of your voice, for example) show up here too.</p>
    <div class="row"><select id="aitv" style="flex:1"><option value="${E(v)}">${E(v ? d.voiceName || "Chosen voice" : "Default voice (from ✨ AI settings)")}</option></select><button type="button" class="btn small" id="aitvp">▶ Preview</button><span class="aimsg" id="aitvm"></span></div></div>` }
async function talkVoices(){ const sl = $("#aitv"); if (!sl || sl.dataset.loaded) return; sl.dataset.loaded = 1; const m = $("#aitvm"); m.textContent = "Loading voices…";
  try { const key = await need("eleven"); let list = STD_VOICES.map(([voice_id, name]) => ({voice_id, name})), why = "";
    try { const r = await fetch("https://api.elevenlabs.io/v1/voices?t=" + Date.now(), {headers: {"xi-api-key": key}, cache: "no-store"}); if (r.ok) { const j = await r.json(); if ((j.voices || []).length) list = j.voices } else why = r.status === 401 ? "This ElevenLabs key isn't allowed to list voices, so only the standard ones show. Turn on Voices (read) for the key, or paste your voice's ID." : "Couldn't list your voices (" + r.status + ")." } catch (e) { why = "Couldn't list your voices." }
    const d = T.ed.D(), mine = x => x.category && !/premade|professional_library/.test(x.category);
    list.sort((a, b) => (mine(b) ? 1 : 0) - (mine(a) ? 1 : 0));
    sl.innerHTML = `<option value="">Default voice (from ✨ AI settings)</option>` + list.map(x => `<option value="${E(x.voice_id)}"${x.voice_id === d.voice ? " selected" : ""}>${E(x.name)}${mine(x) ? " (yours)" : ""}</option>`).join("");
    if (d.voice && !list.some(x => x.voice_id === d.voice)) sl.insertAdjacentHTML("beforeend", `<option value="${E(d.voice)}" selected>${E(d.voiceName || "Chosen voice")}</option>`);
    sl.insertAdjacentHTML("beforeend", `<option value="__id">Paste a voice ID…</option><option value="__re">↻ Refresh the list</option>`); m.textContent = why }
  catch (e) { sl.dataset.loaded = ""; m.textContent = ""; fail(e) } }
document.addEventListener("focusin", e => { if (e.target.id === "aitv") talkVoices() });
// Preview: a short line from this talk in the chosen voice.
let PV = null;
document.addEventListener("click", async e => { const b = e.target.closest && e.target.closest("#aitvp"); if (!b) return; if (PV) { PV.pause(); PV = null; b.textContent = "▶ Preview"; return }
  const m = $("#aitvm"); b.disabled = true; m.textContent = "Getting the voice…";
  try { const key = await need("eleven"), sl = $("#aitv"), d = T.ed.D(); let voice = sl && sl.value; if (!voice) { const k0 = KEYS.voice; voice = k0 || (await voiceId(key)) }
    let line = ""; for (const sc of d.sections || []) for (const p of sc.points || []) { if (line) break; const t = noTags(String(p.script || "").replace(/\[@[a-z0-9]+\]/g, " ")).replace(/\s+/g, " ").trim(); const mm = t.match(/^.{20,220}?[.!?](?=\s|$)/); if (mm) line = mm[0] }
    const first = (d.title ? d.title + ". " : "") + (line || "This is how the voice will sound when it reads your talk.");
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {method: "POST", headers: {"xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg"}, body: JSON.stringify({text: first, model_id: "eleven_multilingual_v2"})});
    if (!r.ok) throw new Error("ElevenLabs: " + ((await elErr(r)) || r.status));
    PV = new Audio(URL.createObjectURL(await r.blob())); PV.onended = () => { PV = null; b.textContent = "▶ Preview" }; await PV.play(); b.textContent = "■ Stop"; m.textContent = "" }
  catch (err) { m.textContent = ""; fail(err) } finally { b.disabled = false } });
document.addEventListener("pointerdown", e => { if (e.target.id === "aitv") talkVoices() });
document.addEventListener("change", e => { if (e.target.id !== "aitv") return; const sl = e.target; let o = sl.selectedOptions[0]; const d = T.ed.D();
  if (sl.value === "__re") { sl.dataset.loaded = ""; sl.value = d.voice || ""; talkVoices(); return }
  if (sl.value === "__id") { const id = (prompt("Paste the voice ID from ElevenLabs (My Voices, then the voice's ⋯ menu, then Copy voice ID):") || "").trim(); if (!/^[A-Za-z0-9]{10,40}$/.test(id)) { sl.value = d.voice || ""; return }
    const nm = (prompt("A name for this voice:", "My voice") || "My voice").trim(); sl.insertAdjacentHTML("beforeend", `<option value="${E(id)}">${E(nm)}</option>`); sl.value = id; o = sl.selectedOptions[0] }
  T.ed.op({t: "talk", f: "voice", v: sl.value}); T.ed.op({t: "talk", f: "voiceName", v: sl.value && o ? o.textContent.replace(/ \(yours\)$/, "") : ""}); toast("Voice saved for this talk") });
function styleHTML(d){ const ref = d.imageStyleRef || "";
  return `<div class="aibox"><div class="pgh"><b>✨ Picture style for this talk</b></div>
    <p class="note">Every AI picture follows this, so the slides look like one set. Describe the look; add a style picture to match.</p>
    <textarea data-t="talk" data-f="imageStyle" rows="3" placeholder="e.g. Warm cinematic photographs, golden-hour light, rural Philippines, soft depth of field, deep teal shadows">${E(d.imageStyle || "")}</textarea>
    <div class="row">${ref ? `<img class="aisref" alt="Style picture" src="${E(T.LOCALIMG[ref] || ref)}">` : ""}<label class="btn small aiup">${ref ? "Replace" : "Add"} style picture<input type="file" accept="image/*" hidden data-aistyle></label>
      ${ref ? '<button type="button" class="btn small" data-act="aistyledel">Remove</button>' : ""}<button type="button" class="btn small" data-act="aisample">✨ Make a sample</button><span class="aimsg" id="aistm"></span></div><div class="aires" id="aisres"></div></div>` }
async function styleSample(){ const ed = T.ed, D = ed.D(), m = $("#aistm"); const stop = ticker(m, "Making a sample…");
  try { const p = await chat(`You write prompts for an image model. ${PIC_RULES}\nReturn JSON {"prompt": "..."} (80-140 words): a strong opening picture for this talk that shows the talk's picture style.`, `Picture style: ${styleOf(D) || "(choose one that fits the talk)"}\n\n${outline(D, {cap: 160})}`);
    const imgs = D.imageStyleRef ? [await picBlob(D.imageStyleRef)].filter(Boolean) : []; const [u] = await image(p.prompt + "\n\n" + PIC_RULES, imgs, 1); stop(); m.textContent = "";
    $("#aisres").innerHTML = `<button type="button" data-ssave><img alt="Sample" src="${u}"><span>Use as the style picture</span></button>`;
    $("#aisres [data-ssave]").onclick = async ev => { ev.currentTarget.querySelector("span").textContent = "Saving…"; try { const path = await savePic("style", u, "style"); ed.op({t: "talk", f: "imageStyleRef", v: path}); ed.render() } catch (e) { fail(e) } } }
  catch (e) { fail(e) } finally { stop(); if (m.isConnected && /Making/.test(m.textContent)) m.textContent = "" } }

// =====================================================================
// SPELLING, GRAMMAR AND FLOW: AI suggests, then a walk-through dialog shows each change in context.
// =====================================================================
const tagsIn = t => (t.match(/\[[^\[\]\n]{1,60}\]/g) || []).sort().join("|");
function wdiff(a, b){ const A = a.split(/(\s+)/), B = b.split(/(\s+)/), n = A.length, m = B.length; if (n * m > 400000) return `<del>${E(a)}</del> <ins>${E(b)}</ins>`;
  const M = Array.from({length: n + 1}, () => new Uint16Array(m + 1)); for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) M[i][j] = A[i] === B[j] ? M[i + 1][j + 1] + 1 : Math.max(M[i + 1][j], M[i][j + 1]);
  let i = 0, j = 0, h = "", del = "", ins = ""; const fl = () => { if (del) h += `<del>${E(del)}</del>`; if (ins) h += `<ins>${E(ins)}</ins>`; del = ins = "" };
  while (i < n || j < m) { if (i < n && j < m && A[i] === B[j]) { fl(); h += E(A[i]); i++; j++ } else if (j < m && (i >= n || M[i][j + 1] >= M[i + 1][j])) ins += B[j++]; else del += A[i++] } fl(); return h }
const showTags = h => h.replace(/\[([^\[\]\n]{1,60})\]/g, (a, r) => `<span class="aitag">${/^@/.test(r) ? "↓" : E(r)}</span>`);
async function checkTalk(){
  const d = dlg("aichk", `<div class="ed"><div class="pgh"><b>✨ Check spelling, grammar and flow</b><button type="button" class="btn small" data-x>Close</button></div>
    <p class="note">Checks the key points and full text of every point. Your ideas, order and voice stay the same. Tags and links are kept. Nothing changes until you accept it.</p>
    <label class="chk"><input type="radio" name="aimode" value="flow" checked> Spelling, grammar, and smooth the flow a little</label>
    <label class="chk"><input type="radio" name="aimode" value="spell"> Spelling and grammar only</label>
    <div class="row"><button type="button" class="btn small pri" id="aichkgo">Check the talk</button><span class="aimsg" id="aichkm"></span></div></div>`);
  d.querySelector("[data-x]").onclick = () => d.close(); show(d);
  $("#aichkgo").onclick = async () => { const ed = T.ed, D = ed.D(), mode = d.querySelector('[name="aimode"]:checked').value, L = ed.S().filter(p => (p.script || "").trim() || (p.keyPoints || []).some(x => (x || "").trim()));
    $("#aichkgo").disabled = true; let done = 0; const m = $("#aichkm"); m.textContent = `Checking 0 of ${L.length} points…`; const changes = [];
    try { await pool(L, 4, async p => { const kp = p.keyPoints || [], sc = (p.script || "").split("\n");
        const j = await chat(`You are a careful copy editor for a speaker's talk notes (a Christian ministry leader). ${mode === "spell" ? "Fix only spelling, grammar and punctuation." : "Fix spelling, grammar and punctuation, and lightly smooth the flow so it reads and sounds clearer when spoken. No major changes: keep every idea, the order, the speaker's voice and wording wherever it already works; do not add new content; keep it about the same length."}
Rules: return JSON {"keyPoints": [...], "script": [...]} with EXACTLY the same number of items as given, item for item. An empty item stays empty. Copy every bracketed tag like [John 15:5], [Stop], [@k3x9] exactly, in the same place. Keep emoji and **bold** marks. Key points stay short memory phrases. If an item is already good, return it unchanged.`,
          JSON.stringify({talk: D.title, point: p.label + " " + (p.cue || ""), keyPoints: kp, script: sc}), {effort: "low"});
        const fix = (from, to, field) => { if (!Array.isArray(to) || to.length !== from.length) return; from.forEach((a, k) => { const b = typeof to[k] === "string" ? to[k] : a;
          if (b.trim() === (a || "").trim() || !(a || "").trim() || tagsIn(a) !== tagsIn(b)) return; changes.push({pid: p.id, label: p.label, cue: p.cue, field, j: k, before: a, after: b, all: from}) }) };
        fix(kp, j.keyPoints, "kp"); fix(sc, j.script, "script"); m.textContent = `Checking ${++done} of ${L.length} points…` });
      const order = ed.S().map(p => p.id); changes.sort((a, b) => order.indexOf(a.pid) - order.indexOf(b.pid) || (a.field === "kp" ? -1 : 1) - (b.field === "kp" ? -1 : 1) || a.j - b.j);
      d.close(); if (!changes.length) { toast("No changes needed. It reads well ✓"); return } review(changes) }
    catch (e) { fail(e); $("#aichkgo").disabled = false; m.textContent = "" } } }
function review(changes){ let k = 0, acc = 0, rej = 0; const ed = T.ed;
  const d = dlg("airev", `<div class="ed"><div class="pgh"><b id="airh"></b><button type="button" class="btn small" data-x>Close</button></div><div id="airb"></div>
    <div class="row"><button type="button" class="btn small" id="airback">← Back</button><span style="flex:1"></span><button type="button" class="btn small" id="airrej">Reject</button><button type="button" class="btn small pri" id="airacc">Accept</button><button type="button" class="btn small" id="airall">Accept all the rest</button></div></div>`, "wide");
  function apply(c){ const f = ed.findPt(c.pid); if (!f) return false;
    if (c.field === "kp") { const L = [...(f.p.keyPoints || [])]; if (L[c.j] !== c.before) return false; L[c.j] = c.after; ed.op({t: "pt", pid: c.pid, f: "keyPoints", v: L}); return true }
    const L = (f.p.script || "").split("\n"); if (L[c.j] !== c.before) return false; L[c.j] = c.after; ed.op({t: "pt", pid: c.pid, f: "script", v: L.join("\n")}); return true }
  function draw(){ if (k >= changes.length) { d.close(); return } const c = changes[k], ctx = c.all, nb = x => x != null && (x || "").trim() ? `<p class="aictx">${showTags(E(x))}</p>` : "";
    let pv = c.j - 1; while (pv >= 0 && !(ctx[pv] || "").trim()) pv--; let nx = c.j + 1; while (nx < ctx.length && !(ctx[nx] || "").trim()) nx++;
    $("#airh").textContent = `Change ${k + 1} of ${changes.length} · ${c.label} ${c.cue || ""} · ${c.field === "kp" ? "Key point " + (c.j + 1) : "Full text"}`;
    $("#airb").innerHTML = nb(ctx[pv]) + `<p class="aichg">${showTags(wdiff(c.before, c.after))}</p>` + nb(ctx[nx]) + (c.state ? `<p class="note">${c.state === "acc" ? "Accepted ✓" : c.state === "skip" ? "This text was changed since, so it was left alone." : "Rejected"}</p>` : "");
    $("#airback").disabled = k === 0 }
  const step = st => { const c = changes[k]; if (st === "acc" && c.state !== "acc") { if (apply(c)) { acc++; c.state = "acc" } else c.state = "skip" } else if (st === "rej" && c.state !== "acc") { c.state = "rej"; rej++ } k++; draw() };
  d.querySelector("[data-x]").onclick = () => d.close(); $("#airacc").onclick = () => step("acc"); $("#airrej").onclick = () => step("rej");
  $("#airback").onclick = () => { if (k > 0) { k--; draw() } };
  $("#airall").onclick = () => { for (; k < changes.length; k++) { const c = changes[k]; if (!c.state) { if (apply(c)) { acc++; c.state = "acc" } else c.state = "skip" } } d.close() };
  d.addEventListener("close", () => { if (acc) { ed.render(); toast(`${acc} change${acc > 1 ? "s" : ""} accepted ✓`) } }, {once: true});
  draw(); show(d) }

// =====================================================================
// GENERATE talk content (shared by Prepare and the movement drafts)
// =====================================================================
const GEN_SHAPE = `JSON shape:
{"title": "...", "audience": "...", "length": "e.g. 30 min", "bigIdea": "one sentence", "imageStyle": "one sentence describing a consistent picture style for all slides",
 "sections": [{"title": "movement title", "minutes": 5, "points": [{
   "cue": "2-6 word memory phrase the speaker glances at",
   "slideTitle": "short slide title (a few words)", "subtitle": "optional short line under it",
   "keyPoints": [{"point": "short phrase the speaker talks from; put a verse tag like [John 15:5], a slide tag like [Three marks], or [Stop] in it where that slide should come up (only slide tags and [Stop] take a Next)",
                  "say": "the full text the speaker says for this key point, paragraphs separated by \\n; put the same tags at the exact spot in the words where each slide should appear"}],
   "script": "optional words before the first key point",
   "verses": ["John 15:5"],
   "slides": [{"type": "bullets | bulletsimg | quote | plain | image", "name": "short unique name used in its tag", "title": "...", "bullets": ["..."], "quote": "...", "by": "...", "imagePrompt": "only for bulletsimg/image"}],
   "imagePrompt": "what the point's background picture shows (scene, subject, light), no words in it"}]}]}
Rules: every verse tag must exactly match an entry in that point's "verses" list. Every slide tag must match one of that point's slides by name. Verse references use full book names. Keep slide text short; the slide is not the script. The first point of the first movement is the opening/title slide (slideTitle = the talk title).`;
let gid = 0; const uid = p => p + Date.now().toString(36) + (gid++).toString(36) + Math.random().toString(36).slice(2, 4);
function toSection(s, first){ return {id: uid("s"), title: s.title || "Movement", minutes: s.minutes ? String(s.minutes) : "", points: (s.points || []).map((p, pi) => toPoint(p, first && pi === 0))} }
// Key points with their own text: each gets a hidden id; its words go in its block of the full text.
function blocksOf(p, clean){ const ids = [], text = {}, kp = [];
  for (const k of p.keyPoints || []) { const pt = clean(typeof k === "string" ? k : k.point || ""), say = clean(typeof k === "string" ? "" : k.say || ""); if (!pt.trim()) continue; const id = uid("k").slice(-8); ids.push(id); kp.push("[@" + id + "] " + pt.trim()); text[id] = say.trim() }
  return {keyPoints: kp, script: T.joinBlocks(clean(p.script || "").trim(), ids, text)} }
function toPoint(p, isTitle){ const refs = [...new Set((p.verses || []).map(v => String(typeof v === "string" ? v : v.ref || "").trim()).filter(Boolean))];
  const xs = (p.slides || []).filter(x => x && x.name).map(x => { const ty = ["bullets", "bulletsimg", "quote", "plain", "image"].includes(x.type) ? x.type : "plain";
    if (ty === "quote") return {name: x.name, type: ty, quote: x.quote || "", by: x.by || ""};
    if (ty === "bullets" || ty === "bulletsimg") return {name: x.name, type: ty, slideTitle: x.title || "", bullets: (x.bullets || []).join("\n"), image: "", imagePrompt: ty === "bulletsimg" ? x.imagePrompt || "" : ""};
    return {name: x.name, type: ty, eyebrow: "", slideTitle: x.title || "", slide: x.subtitle || "", layout: "center", image: "", imagePrompt: ty === "image" ? x.imagePrompt || "" : ""} });
  const known = new Set([...refs, ...xs.map(x => x.name), "Stop", "Main slide"]), clean = t => String(t || "").replace(/\[([^\[\]\n]{1,60})\]/g, (a, r) => known.has(r.trim()) ? "[" + r.trim() + "]" : r);
  return {id: uid("p"), cue: p.cue || "Point", eyebrow: "", slideTitle: p.slideTitle || "", slide: p.subtitle || "", layout: isTitle ? "center" : "left", image: "", imagePrompt: p.imagePrompt || "",
    ...blocksOf(p, clean), verses: refs.map(r => ({ref: r, text: "", version: "ESV"})), scriptDraft: true, ...(xs.length ? {slides: xs} : {})} }
// Fill verse text: the ESV API when there's a key and it can be reached, otherwise the AI (marked "ESV, check").
async function esvText(ref){ const k = KEYS.esv; if (!k) return null;
  try { const r = await fetch("https://api.esv.org/v3/passage/text/?" + new URLSearchParams({q: ref, "include-headings": false, "include-footnotes": false, "include-verse-numbers": false, "include-short-copyright": false, "include-passage-references": false}), {headers: {Authorization: "Token " + k}});
    if (!r.ok) return null; const j = await r.json(); return (j.passages || []).join("\n").replace(/\s+\n/g, "\n").trim() || null } catch (e) { return null } }
async function fillVerses(points){ const all = points.flatMap(p => p.verses || []).filter(v => v.ref && !v.text), miss = [];
  await pool(all, 4, async v => { const t = await esvText(v.ref); if (t) { v.text = t; v.version = "ESV" } else miss.push(v) });
  if (!miss.length) return; const refs = [...new Set(miss.map(v => v.ref))];
  try { const j = await chat(`Quote Bible passages in the ESV (English Standard Version) translation, word for word, as plain text without verse numbers or headings. Return JSON {"verses": {"<reference>": "<text>"}}. If unsure of the exact wording, give your best and it will be checked.`, JSON.stringify(refs));
    miss.forEach(v => { const t = j.verses && j.verses[v.ref]; if (t) { v.text = String(t).trim(); v.version = "ESV (check)" } }) } catch (e) {} }
// Make each slide's picture (1 per slide), saving into the talk folder; onPic(point or slide) after each.
async function makePictures(base, d, jobs, onPic, onProg){ let done = 0; const style = styleOf(d), ref = d.imageStyleRef ? await picBlob(d.imageStyleRef).catch(() => null) : null;
  await pool(jobs, 3, async jb => { try { const o = jb.o, txt = [o.eyebrow, o.slideTitle, o.slide].filter(Boolean).join(" / ");
      const pr = `${o.imagePrompt || txt || jb.cue}\n${style ? "Picture style for the whole talk (follow it closely so all slides match): " + style + "\n" : ""}${ref ? "Match the look, light and color of the reference image.\n" : ""}${placeNote(o)}\nThis slide's text, which goes on top (do not draw it): ${txt || "(none)"}\n\n${PIC_RULES}`;
      const [u] = await image(pr, ref ? [ref] : [], 1); const path = `slides/ai-${jb.pid}-${Date.now().toString(36)}.jpg`;
      await GH.put(base + "/" + path, u.split(",")[1], null, "AI picture for " + jb.pid); T.LOCALIMG[path] = u; await onPic(jb, path) } catch (e) { jb.err = e.message }
    onProg && onProg(++done, jobs.length) }) }
const picJobs = d => d.sections.flatMap(s => s.points.flatMap(p => [...(!p.image && (p.imagePrompt || p.slideTitle) ? [{pid: p.id, o: p, cue: p.cue}] : []), ...(p.slides || []).map((x, i) => ({pid: p.id, i, o: x, cue: p.cue})).filter(j => ["bulletsimg", "image"].includes(j.o.type) && !j.o.image)]));

// =====================================================================
// AI DRAFT OF A MOVEMENT: the result goes in as a new movement named "… (draft)" right after it.
// =====================================================================
async function readFiles(files){ const out = [];
  for (const f of files) { const n = f.name || "file", ty = f.type || "";
    if (ty.startsWith("image/")) out.push({name: n, kind: "image", url: await T.toJpeg(f)});
    else if (ty === "application/pdf" || /\.pdf$/i.test(n)) out.push({name: n, kind: "pdf", url: await fileToDataURL(f)});
    else if (/\.docx$/i.test(n)) { await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"); const r = await mammoth.extractRawText({arrayBuffer: await f.arrayBuffer()}); out.push({name: n, kind: "text", text: r.value}) }
    else out.push({name: n, kind: "text", text: await f.text()}) } return out }
function parts(text, files){ const P = [{type: "text", text}];
  for (const f of files) { if (f.kind === "text") P.push({type: "text", text: `\n--- Uploaded file: ${f.name} ---\n${f.text.slice(0, 120000)}`});
    else if (f.kind === "image") P.push({type: "text", text: `Uploaded picture: ${f.name}`}, {type: "image_url", image_url: {url: f.url}});
    else if (f.kind === "pdf") P.push({type: "file", file: {filename: f.name, file_data: f.url}}) } return P }
function fileRow(id){ return `<div class="row"><label class="btn small aiup">+ Add files<input type="file" multiple hidden id="${id}" accept=".txt,.md,.docx,.pdf,image/*,text/*"></label><div class="aifiles" id="${id}l"></div></div>` }
function bindFiles(id, list){ const draw = () => { $("#" + id + "l").innerHTML = list.map((f, i) => `<span class="aifile">${f.kind === "image" ? `<img alt="" src="${f.url}">` : "📄"} ${E(f.name)}<button type="button" data-rm="${i}" title="Remove">✕</button></span>`).join("") };
  $("#" + id).onchange = async e => { try { list.push(...await readFiles([...e.target.files])) } catch (err) { fail(err) } e.target.value = ""; draw() };
  $("#" + id + "l").onclick = e => { const b = e.target.closest("[data-rm]"); if (b) { list.splice(+b.dataset.rm, 1); draw() } }; draw() }
async function sectionAI(sid){
  const ed = T.ed, D = ed.D(), s = sid ? D.sections.find(x => x.id === sid) : null, files = [];
  const d = dlg("aisecd", `<div class="ed"><div class="pgh"><b>✨ ${s ? "AI draft of " + E(s.title) : "New movement with AI"}</b><button type="button" class="btn small" data-x>Close</button></div>
    <p class="note">${s ? "Makes a new movement named “" + E(s.title) + " (draft)” right after this one. Compare them, then delete the one you don't want and rename the other." : "Makes a new movement named “… (draft)” at the end of the talk."}</p>
    <label>${s ? "What should change?" : "What is this movement about?"}<textarea id="aisecw" rows="4" placeholder="${s ? "e.g. Tighter, with a story from the Philippines, and end with a challenge. Or: extend it with a third point on prayer." : "e.g. Why calling starts with listening. Use 1 Samuel 3 and a story about a child at the center."}"></textarea></label>
    ${fileRow("aisecf")}
    <label class="chk"><input type="checkbox" id="aisecp" checked> Make a picture for each slide (about a minute each, they arrive while you work)</label>
    <div class="row"><button type="button" class="btn small pri" id="aisecgo">Create the draft</button><span class="aimsg" id="aisecm"></span></div></div>`);
  d.querySelector("[data-x]").onclick = () => d.close(); bindFiles("aisecf", files); show(d); $("#aisecw").focus();
  $("#aisecgo").onclick = async () => { const b = $("#aisecgo"); b.disabled = true; const stop = ticker($("#aisecm"), "Writing the movement…");
    try { const j = await chat(`You help a Christian ministry leader (President of Kids International Ministries in the Philippines) write talks in his own voice: warm, direct, story-driven, Scripture-centered.
Write ONE movement of the talk. ${s ? "Rewrite or extend the given movement as asked." : "Create it as asked."} Fit the rest of the talk: same voice, no repeating what other movements already say.
Return JSON {"section": {...one entry of sections...}} using this ${GEN_SHAPE}`,
        parts(`${s ? "Movement to redo:\n" + outline({...D, sections: [s]}, {full: true}) + "\n\n" : ""}Request: ${$("#aisecw").value.trim() || "(use your judgment)"}\n\nThe whole talk for context:\n${outline(D, {cap: 220})}`, files), {effort: "medium"});
      const ns = toSection(j.section || j, false); ns.title = (ns.title || (s && s.title) || "Movement").replace(/\s*\(draft\)$/i, "") + " (draft)";
      stop(); $("#aisecm").textContent = "Looking up the verses…"; await fillVerses(ns.points);
      ed.op({t: "sins", after: s ? s.id : (D.sections[D.sections.length - 1] || {}).id, sec: ns}); d.close(); ed.go({k: "sec", id: ns.id}); toast("Draft movement added ✓");
      if ($("#aisecp").checked) { const jobs = picJobs({sections: [ns]}); if (jobs.length) { ed.setSave(`Making pictures 0 of ${jobs.length}…`);
        await makePictures(T.PATH, ed.D(), jobs, async (jb, path) => { if (jb.i == null) ed.op({t: "pt", pid: jb.pid, f: "image", v: path}); else ed.op({t: "xset", pid: jb.pid, i: jb.i, f: "image", v: path}) },
          (n, all) => ed.setSave(`Making pictures ${n} of ${all}…`)); ed.render(); toast("Pictures for the draft are in ✓") } } }
    catch (e) { fail(e) } finally { stop(); if (b.isConnected) { b.disabled = false; $("#aisecm").textContent = "" } } } }

// =====================================================================
// LISTEN: the talk read by a natural voice (ElevenLabs), point by point, from the point that's open.
// =====================================================================
const AUD = {};       // text → promise of an object URL, so replaying is instant
// A point as a list of things to do: say some text, or press Next at a tag (like the speaker does when they reach it).
// How the voice reads: the reading cues ([Slow], [Excited], [Normal]…) set its speed and tone until the next cue.
const TONES = {excited: {stability: .3, style: .55, f: 1.05}, exclaim: {stability: .22, style: .8, f: 1}, calm: {stability: .8, style: 0, f: .93}, gentle: {stability: .72, style: .15, f: .9}};
function voiceOf(m){ const v = {stability: .62, similarity_boost: .75, style: 0, speed: m.speed === "slow" ? .82 : m.speed === "fast" ? 1.15 : 1, use_speaker_boost: true}, t = TONES[m.tone];
  if (t) { v.stability = t.stability; v.style = t.style; v.speed *= t.f } v.speed = Math.max(.7, Math.min(1.2, Math.round(v.speed * 100) / 100)); return v }
// ALL CAPS words get stressed: the voice already leans on capitals, and a small breath before the word (as a speaker would) makes it land.
const ACRO = new Set("KIM USA UK ESV NIV KJV CEO TV OK PDF AI CCC DVD USB NASA FBI CIA ASAP RSVP".split(" "));
const capWord = (t, i) => { if (i < 0) return ""; const m = t.slice(i).match(/^[A-Z][A-Z'’]+(?![A-Za-z])/); return m && !ACRO.has(m[0].replace(/['’].*$/, "")) ? m[0] : "" };
const prevWordAt = (t, i) => { let j = i - 1; while (j >= 0 && /[\s,;:—-]/.test(t[j])) j--; if (j < 0 || /[.!?…]/.test(t[j])) return -1; while (j > 0 && /[A-Za-z'’]/.test(t[j - 1])) j--; return j };
function speakPlan(p){ const out = [], vs = p.verses || [], B = T.splitBlocks(p.script), mode = {speed: "", tone: ""}; let cv = voiceOf(mode);
  const seg = (blk, t) => { const n = {}; let last = 0;
    const say = (a, b) => { let x = "", map = [], sp = true; for (let i = a; i < b; i++) { const c = t[i];
        if (/\s/.test(c)) { if (!sp) { x += c === "\n" ? "\n" : " "; map.push(i); sp = true } else if (c === "\n" && x.endsWith(" ")) x = x.slice(0, -1) + "\n" }   // a paragraph break stays a break, so the voice pauses there
        else if (c === "." && t[i + 1] === "." && i + 1 < b) { let j = i; while (t[j + 1] === "." && j + 1 < b) j++; x += "…"; map.push(i); i = j; sp = false }   // ".." and "..." read as one trailing pause
        else if (!/[🔑🔁]/u.test(c)) { if (sp && x) { const w = capWord(t, i); const pj = prevWordAt(t, i); if (w && !(pj >= 0 && /^[A-Z][A-Z'’]*(?![A-Za-z])/.test(t.slice(pj)))) { if (/[A-Za-z0-9'"”’)]$/.test(x.trimEnd())) { const ws = x.slice(x.trimEnd().length); x = x.trimEnd() + "," + ws; map.splice(x.length - 1 - ws.length, 0, i) } } }
          x += c; map.push(i); sp = false } }
      while (/\s$/.test(x)) { x = x.slice(0, -1); map.pop() }
      while (x.length > 3500) { let cut = x.lastIndexOf(". ", 3500); if (cut < 1000) cut = 3500; out.push({say: x.slice(0, cut + 1), blk, map: map.slice(0, cut + 1), vs: cv}); x = x.slice(cut + 1).replace(/^ /, ""); map = map.slice(map.length - x.length) }
      if (x) out.push({say: x, blk, map, vs: cv}) };
    for (const m of t.matchAll(/\[([^\[\]\n]{1,60})\]/g)) { say(last, m.index); last = m.index + m[0].length; const r = m[1].trim(), v = T.tagOf(p, r.replace(/^!/, "")); if (!v || v.anchor) continue;
      if (v.cue) { const c = v.cue; if (c === "pause" || c === "long pause") out.push({pause: c === "pause" ? 1.2 : 2.5}); else if (c === "normal") { mode.speed = ""; mode.tone = "" } else if (c === "slow" || c === "fast") mode.speed = c; else mode.tone = c; cv = voiceOf(mode); continue }
      const key = T.tagKey(v); n[key] = (n[key] || 0) + 1; if (blk !== "intro") out.push({step: blk + "|" + key + "#" + n[key]});
    }
    say(last, t.length) };
  seg("intro", T.trimBlk(B.intro)); for (const x of p.keyPoints || []) { const id = T.kpId(x); if (id) seg(id, T.trimBlk(B.text[id])) }
  if (!out.some(x => x.say)) out.push({pause: 3});      // no full text: show the slides a moment, then go on (slide words are never read)
  // Each part is voiced on its own, so give the voice the words around it; then the tone and pace carry on smoothly across parts.
  const S = out.filter(x => x.say); S.forEach((x, k) => { x.prev = S.slice(0, k).map(y => y.say).join("\n").slice(-500); x.next = S.slice(k + 1).map(y => y.say).join("\n").slice(0, 300) });
  return out }
const cutAt = (x, cut) => ({...x, say: x.say.slice(cut), map: x.map.slice(cut), prev: ((x.prev ? x.prev + "\n" : "") + x.say.slice(0, cut)).slice(-500)});
// Speech plus the time each character is spoken (ElevenLabs "with timestamps"), so the word being read can light up.
function tts(text, vs, ctx){ const k = text + "|" + JSON.stringify(vs || {}); if (!AUD[k]) { AUD[k] = tts0(text, vs, ctx); AUD[k].catch(() => delete AUD[k]) } return AUD[k] }
const talkVoice = () => { try { const d = T.ed ? T.ed.D() : T.D(); return (d && d.voice) || "" } catch (e) { return "" } };
async function voiceId(key){ const tv = talkVoice(); if (tv) return tv; if (KEYS.voice) return KEYS.voice; let j = {}; try { const r = await fetch("https://api.elevenlabs.io/v1/voices", {headers: {"xi-api-key": key}}); if (r.ok) j = await r.json() } catch (e) {}
  KEYS.voice = ((j.voices || [])[0] || {}).voice_id || STD_VOICES[0][0]; saveLocal(); return KEYS.voice }
async function tts0(text, vs, ctx){ const key = await need("eleven"), voice = await voiceId(key);
  const o = {text, model_id: "eleven_multilingual_v2", seed: 7}; if (vs) o.voice_settings = vs; if (ctx && ctx.prev) o.previous_text = ctx.prev; if (ctx && ctx.next) o.next_text = ctx.next; const body = JSON.stringify(o), H = {"xi-api-key": key, "Content-Type": "application/json"};
  let r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {method: "POST", headers: H, body});
  let j = null; if (r.ok) try { j = await r.json() } catch (e) {}
  if (j && j.audio_base64) { const a = j.alignment || {}; const bin = Uint8Array.from(atob(j.audio_base64 || ""), c => c.charCodeAt(0));
    return {url: URL.createObjectURL(new Blob([bin], {type: "audio/mpeg"})), b64: j.audio_base64, starts: a.character_start_times_seconds || null, chars: a.characters || null} }
  if (r.status === 401) { const m = await elErr(r); throw new Error("ElevenLabs: " + (m || r.status) + ". In ElevenLabs, edit the key and turn on Text to Speech.") }
  r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {method: "POST", headers: {...H, Accept: "audio/mpeg"}, body});
  if (!r.ok) { const m = await elErr(r); throw new Error("ElevenLabs: " + (m || r.status)) } const bl = await r.blob(); return {url: URL.createObjectURL(bl), blob: bl, starts: null} }
const blobB64 = b => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.onerror = no; fr.readAsDataURL(b) });
// =====================================================================
// NARRATED VERSION: the whole talk read in the AI voice and saved with the talk (voice/*.mp3 + narration.json),
// so anyone with the ?play link watches the slides while the voice reads and moves them on.
// =====================================================================
function narrate(){ const ed = T.ed, share = new URL("./?play", location.href).href;
  const d = dlg("ainar", `<div class="ed"><div class="pgh"><b>🔊 Narrated version (share link)</b><button type="button" class="btn small" data-x>Close</button></div>
    <p class="note">This reads the whole talk in the AI voice, with your reading cues, and saves it with the talk. Anyone with the link then sees the slides while the voice reads and moves them forward. Only the parts that changed since the last time use ElevenLabs credits.</p>
    <p class="aimsg" id="ainm"></p><div class="row"><button type="button" class="btn" id="aingo">Make the narrated version</button></div>
    <div id="ainl" style="display:none"><p class="note">Share this link (give GitHub a minute or two to publish a fresh version):</p><div class="row"><input id="ainu" readonly value="${E(share)}" style="flex:1"><button type="button" class="btn small" id="ainc">Copy</button><a class="btn small" href="${E(share)}" target="_blank" rel="noopener">Open</a></div></div></div>`);
  d.querySelector("[data-x]").onclick = () => d.close(); $("#ainc").onclick = () => { $("#ainu").select(); try { navigator.clipboard.writeText(share) } catch (e) { document.execCommand("copy") } toast("Link copied") };
  if (!d.open) d.showModal();
  T.GH.get(T.PATH + "/narration.json").then(g => { const n = JSON.parse(g.text); $("#ainm").textContent = "Last made " + new Date(n.made).toLocaleString() + ". Make it again after you change the talk."; $("#ainl").style.display = "" }).catch(() => {});
  $("#aingo").onclick = async () => { const b = $("#aingo"), m = $("#ainm"); b.disabled = true;
    try { if (!T.token()) throw new Error("Saving needs the GitHub sign-in on this page first."); const key = await need("eleven"), voice = await voiceId(key);
      let old = {}, osha = null; try { const g = await GH.get(T.PATH + "/narration.json"); old = JSON.parse(g.text); osha = g.sha } catch (e) {}
      const have = new Set(); Object.values(old.points || {}).forEach(a => (a || []).forEach(x => x.say && have.add(x.say)));
      const points = {}, jobs = [];
      for (const s of ed.S()) { const f = ed.findPt(s.id); if (!f) continue; const st = T.stepsOf(f.p), items = [];
        for (const it of speakPlan(f.p)) { if (it.step) { const x = st.find(y => y.a === it.step); if (x) items.push({sub: x.sub}) } else if (it.pause) items.push({pause: it.pause});
          else if (it.say) { const file = "voice/" + (await sha(voice + "|" + JSON.stringify(it.vs || {}) + "|" + it.say)).slice(0, 16) + ".mp3"; items.push({say: file}); if (!have.has(file) && !jobs.some(j => j.file === file)) jobs.push({file, text: it.say, vs: it.vs, ctx: it}) } }
        points[s.id] = items }
      for (let k = 0; k < jobs.length; k++) { const j = jobs[k]; m.textContent = `Reading part ${k + 1} of ${jobs.length}…`; if (jobs[k + 1]) tts(jobs[k + 1].text, jobs[k + 1].vs, jobs[k + 1].ctx).catch(() => {});
        const a = await tts(j.text, j.vs, j.ctx), data = a.b64 || await blobB64(a.blob);
        try { await GH.put(T.PATH + "/" + j.file, data, null, "Narration voice") } catch (e) { if (e.status !== 422) throw e } }
      m.textContent = "Saving…"; const N = {format: "narration/1", voice, voiceName: KEYS.voiceName || "", made: new Date().toISOString(), points};
      for (let a = 0; a < 3; a++) { try { await GH.put(T.PATH + "/narration.json", T.b64e(JSON.stringify(N, null, 1) + "\n"), osha, "Narrated version"); break } catch (e) { if (a === 2 || (e.status !== 409 && e.status !== 422)) throw e; try { osha = (await GH.get(T.PATH + "/narration.json")).sha } catch (_) { osha = null } } }
      m.textContent = `Done. ${jobs.length ? jobs.length + " new part" + (jobs.length > 1 ? "s" : "") + " read" : "Nothing had changed, so no new reading was needed"}.`; $("#ainl").style.display = "" }
    catch (e) { m.textContent = ""; fail(e) } b.disabled = false } }

// Where the cursor was last in a point's text, so Listen can start there.
let CARET = null;
document.addEventListener("selectionchange", () => { if (LS) return; const sl = getSelection(); if (!sl.rangeCount) return; const r = sl.getRangeAt(0), n = r.startContainer;
  const el = (n.nodeType === 1 ? n : n.parentElement) && (n.nodeType === 1 ? n : n.parentElement).closest(".rich"); if (!el || !el.dataset.id) return;
  if (el.dataset.f === "block") { let key = ""; if (n.nodeType === 3) { const v = n.nodeValue, o = r.startOffset; key = v.slice(o, o + 40).trim().length >= 8 ? "+" + v.slice(o, o + 40) : "-" + v.slice(Math.max(0, o - 40), o) }
    CARET = {pid: el.dataset.id, blk: el.dataset.blk, key} }
  else if (el.dataset.f === "kpline") { const f = T.ed.findPt(el.dataset.id), x = f && (f.p.keyPoints || [])[+el.dataset.j]; CARET = {pid: el.dataset.id, blk: x ? T.kpId(x) : null, key: ""} } });
// Start a plan at a block, at the sentence holding the given words.
function seek(plan, blk, key){ const norm = t => t.replace(/\s+/g, " "), list = plan.map((x, n) => [x, n]).filter(([x]) => x.say && x.blk === blk);
  if (!list.length) { const k = plan.findIndex(x => x.blk === blk); return k < 0 ? 0 : k }
  const w = norm(key.slice(1)).trim(); if (!w) return list[0][1];
  for (const [x, n] of list) { const at = x.say.indexOf(w); if (at < 0) continue; const end = key[0] === "+" ? at : at + w.length - 1;
    let cut = 0; for (const m of x.say.slice(0, end).matchAll(/[.!?…]["”’)]*\s+/g)) cut = m.index + m[0].length;
    if (cut > 0) plan[n] = cutAt(x, cut); return n }
  return list[0][1] }

let LS = null;
function listen(){ const ed = T.ed, L = ed.S(), s = ed.sel(); let i = Math.max(0, s.k === "pt" ? L.findIndex(x => x.id === s.id) : 0), plan = [], q = 0, run = 0, cur = null, raf = 0, lastW = null;
  if (LS) LS.stop(); const bar = document.createElement("div"); bar.id = "ailisten"; bar.innerHTML = `<button type="button" data-l="prev" title="Previous point">⏮</button><button type="button" data-l="play" title="Pause">❚❚</button><button type="button" data-l="next" title="Next point">⏭</button><span id="ailt"></span><select id="ailr" title="Speed">${[0.9, 1, 1.15, 1.3, 1.5].map(r => `<option value="${r}"${r === 1 ? " selected" : ""}>${r}×</option>`).join("")}</select><button type="button" data-l="x" title="Stop">✕</button>`;
  document.body.appendChild(bar); const au = new Audio(), lab = $("#ailt"); let alive = true; ed.listenMode(true);
  LS = {stop(){ alive = false; au.pause(); cancelAnimationFrame(raf); bar.remove(); LS = null; ed.listenMode(false) }};
  const head = () => `${L[i].label} ${L[i].cue || ""}`;
  const warm = (pl, from) => pl.slice(from).filter(x => x.say).slice(0, 2).forEach(x => tts(x.say, x.vs, x).catch(() => {}));
  // Light up the word being said: the time → the character → its place in the block → that word.
  function glow(){ raf = requestAnimationFrame(glow); const it = plan[q]; if (!cur || !it || !it.blk || !cur.starts || au.paused) return; const t = au.currentTime, S = cur.starts;
    let lo = 0, hi = S.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid] <= t) lo = mid; else hi = mid - 1 } const off = it.map[Math.min(lo, it.map.length - 1)]; if (off == null) return;
    const ws = document.querySelectorAll(`#ftext [data-f="block"][data-blk="${CSS.escape(it.blk)}"] .w`); let w = null; for (const x of ws) { if (+x.dataset.o <= off) w = x; else break }
    if (w === lastW) return; if (lastW) lastW.classList.remove("say"); lastW = w; if (!w) return; w.classList.add("say");
    const r = w.getBoundingClientRect(); if (r.top < innerHeight * .35 || r.bottom > innerHeight - 90) window.scrollBy({top: r.top - innerHeight * .45, behavior: "smooth"}) }
  raf = requestAnimationFrame(glow);
  function point(k, at){ if (!alive) return; if (k < 0 || k >= L.length) { lab.textContent = "End of the talk"; return } i = k; run++;
    if (ed.sel().id !== L[i].id) ed.go({k: "pt", id: L[i].id}); plan = speakPlan(ed.findPt(L[i].id).p); q = 0; curQ = -1; lastW = null;
    if (at && at.blk) { q = seek(plan, at.blk, at.key || ""); for (let m = 0; m < q; m++) if (plan[m].step) ed.stepTo(plan[m].step) } warm(plan, q);
    const nx = L[i + 1] && ed.findPt(L[i + 1].id); if (nx) warm(speakPlan(nx.p), 0); go(run) }
  async function go(r){ while (alive && r === run && q < plan.length && (plan[q].step || plan[q].pause)) { const it = plan[q];
      if (it.step) ed.stepTo(it.step); else { lab.textContent = head() + " · pause"; await new Promise(ok => setTimeout(ok, it.pause * 1000 / (+$("#ailr").value || 1))); if (!alive || r !== run) return } q++ }
    if (!alive || r !== run) return; if (q >= plan.length) return point(i + 1);
    const it = plan[q]; lab.textContent = head() + " · getting the voice…";
    try { const a = await tts(it.say, it.vs, it); if (!alive || r !== run) return; warm(plan, q + 1); cur = a; curQ = q; au.src = a.url; au.playbackRate = +$("#ailr").value; await au.play(); bar.querySelector('[data-l="play"]').textContent = "❚❚"; lab.textContent = head() }
    catch (e) { if (!alive || r !== run) return; lab.textContent = ""; fail(e); if (e.quiet && LS) LS.stop() } }
  au.onended = () => { q++; go(run) }; $("#ailr").onchange = () => au.playbackRate = +$("#ailr").value;
  bar.onclick = e => { const b = e.target.closest("[data-l]"); if (!b) return; const a = b.dataset.l;
    if (a === "x") LS.stop(); else if (a === "next") { au.pause(); point(i + 1) } else if (a === "prev") { au.pause(); point(q > 0 || au.currentTime > 3 ? i : i - 1) }
    else if (a === "play") { if (held) resume(); else hold() } };
  // Pause to edit: the text opens for changes; ▶ picks up again where it stopped, reading your changed text.
  let held = null, curQ = -1;
  function hold(){ au.pause(); let qq = q; while (qq < plan.length && !plan[qq].say) qq++; const it = plan[qq]; let ci = 0; const live = curQ === q && qq === q && !au.ended;   // between parts (voice still loading, or a pause cue) nothing has been said yet
    if (it && it.say && live) { if (cur && cur.starts) { const S = cur.starts, t = au.currentTime; while (ci + 1 < S.length && S[ci + 1] <= t) ci++ } else if (au.duration) ci = Math.floor(it.say.length * au.currentTime / au.duration) }
    const same = it && it.say ? plan.slice(0, qq).filter(x => x.say && x.blk === it.blk).length : 0;
    held = {pid: L[i].id, it, ci, same, t: live ? au.currentTime : 0}; run++; if (lastW) lastW.classList.remove("say"); lastW = null; ed.listenMode(false);
    bar.querySelector('[data-l="play"]').textContent = "▶"; lab.textContent = head() + " · paused. Make your changes, then ▶ to go on." }
  function resume(){ const h = held; held = null; const a = document.activeElement; if (a && a.blur) a.blur(); ed.listenMode(true);
    let k = L.findIndex(x => x.id === h.pid); if (k < 0) return point(i); i = k; if (ed.sel().id !== h.pid) ed.go({k: "pt", id: h.pid});
    const f = ed.findPt(h.pid); if (!f) return point(i + 1); plan = speakPlan(f.p); const r = ++run, it = h.it;
    if (!it || !it.say) return point(i + 1);
    const list = plan.map((x, n) => [x, n]).filter(([x]) => x.say && x.blk === it.blk); if (!list.length) { q = 0; return go(r) }
    const exact = list.find(([x]) => x.say === it.say && JSON.stringify(x.vs) === JSON.stringify(it.vs)), [x, n] = exact || list[Math.min(h.same, list.length - 1)];
    for (let m = 0; m < n; m++) if (plan[m].step) ed.stepTo(plan[m].step);
    if (exact) { q = n; curQ = n; lab.textContent = head(); tts(x.say, x.vs, x).then(a => { if (!alive || r !== run) return; cur = a; au.src = a.url; au.playbackRate = +$("#ailr").value;
        au.onloadedmetadata = () => { au.onloadedmetadata = null; au.currentTime = Math.max(0, h.t - .4) }; au.play().catch(() => {}); bar.querySelector('[data-l="play"]').textContent = "❚❚" }).catch(fail); return }
    // The text changed: start again at the sentence that was being read.
    const from = it.say.slice(0, h.ci + 1).search(/[^.!?]*[.!?]?\s*$/), key = it.say.slice(Math.max(0, from), from + 30).trim(); let cut = key ? x.say.indexOf(key) : -1;
    if (cut < 0) { const fr = h.ci / it.say.length; cut = Math.max(0, x.say.lastIndexOf(". ", Math.floor(x.say.length * fr)) + 1); while (x.say[cut] === " ") cut++ }
    plan[n] = cut > 0 ? cutAt(x, cut) : x; q = n; go(r) }
  const c0 = CARET && L[i] && CARET.pid === L[i].id ? CARET : null; point(i, c0) }

// =====================================================================
// SPLIT: the full text of a point (written before the blocks existed) shared out to its key points, for you to check.
// =====================================================================
async function splitPlan(p){ const B = T.splitBlocks(p.script), intro = T.trimBlk(B.intro), paras = intro.split("\n"), kps = (p.keyPoints || []).map((x, j) => ({j, id: T.kpId(x), t: noTags(T.kpBody(x))})).filter(k => k.id);
  if (!intro.trim() || !kps.length) return null;
  const j = await chat(`You sort a speaker's talk text under their key points. The key points are in order; the text usually follows the same order.
For each numbered paragraph, give the number of the key point it belongs to, or 0 if it comes before the first key point. Paragraphs for one key point are usually next to each other. Return JSON {"assign": [n, n, ...]} with exactly one number per paragraph.`,
    JSON.stringify({keyPoints: kps.map((k, i) => (i + 1) + ". " + k.t), paragraphs: paras.map((x, i) => (i + 1) + ". " + noTags(x).slice(0, 600))}));
  const A = Array.isArray(j.assign) && j.assign.length === paras.length ? j.assign.map(n => Math.max(0, Math.min(kps.length, Math.round(+n) || 0))) : null; if (!A) throw new Error("The AI's split didn't line up. Try again.");
  const to = {}, keep = []; paras.forEach((x, i) => { if (!A[i]) keep.push(x); else (to[kps[A[i] - 1].id] = to[kps[A[i] - 1].id] || []).push(x) });
  const text = {}; for (const k of kps) { const add = (to[k.id] || []).join("\n").trim(), old = T.trimBlk(B.text[k.id]); text[k.id] = [old, add].filter(x => x.trim()).join("\n") }
  return {p, kps, keep, to, script: T.joinBlocks(keep.join("\n").trim(), kps.map(k => k.id), text)} }
async function splitTalk(only){ const ed = T.ed, pts = only ? [ed.findPt(only).p] : ed.S().map(x => ed.findPt(x.id).p).filter(p => T.trimBlk(T.splitBlocks(p.script).intro).trim() && (p.keyPoints || []).some(x => T.kpId(x)));
  if (!pts.length) { toast("Nothing to split: every point's text is already under its key points."); return }
  const d = dlg("aisplit", `<div class="ed"><div class="pgh"><b id="aisph">✨ Split the full text into the key points</b><button type="button" class="btn small" data-x>Close</button></div><div id="aispb"><p class="aimsg">Reading ${pts.length} point${pts.length > 1 ? "s" : ""}…</p></div>
    <div class="row"><span style="flex:1"></span><button type="button" class="btn small" id="aispskip">Skip</button><button type="button" class="btn small pri" id="aispok">Apply</button>${pts.length > 1 ? '<button type="button" class="btn small" id="aispall">Apply all the rest</button>' : ""}</div></div>`, "wide");
  d.querySelector("[data-x]").onclick = () => d.close(); show(d); let k = 0, done = 0, plans = [];
  const plansP = pts.map(p => splitPlan(p).catch(e => ({err: e})));
  const apply = pl => { if (!pl || pl.err) return; const f = ed.findPt(pl.p.id); if (!f) return; ed.op({t: "pt", pid: pl.p.id, f: "script", v: pl.script}); ed.sync(f.p); done++ };
  async function draw(){ if (k >= pts.length) { d.close(); return } const pl = await plansP[k]; plans[k] = pl; const p = pts[k], lab = (ed.S().find(x => x.id === p.id) || {}).label || "";
    $("#aisph").textContent = `✨ Split the full text · ${lab} ${p.cue || ""}${pts.length > 1 ? ` (${k + 1} of ${pts.length})` : ""}`;
    if (!pl || pl.err) { $("#aispb").innerHTML = `<p class="aimsg">${E(pl && pl.err ? pl.err.message : "Nothing to split here.")}</p>`; return }
    const sn = x => E(noTags(x).slice(0, 140)) + (noTags(x).length > 140 ? "…" : "");
    $("#aispb").innerHTML = (pl.keep.filter(x => x.trim()).length ? `<div class="aisp"><b>Before the key points</b>${pl.keep.filter(x => x.trim()).map(x => `<p>${sn(x)}</p>`).join("")}</div>` : "") +
      pl.kps.map((q, i) => `<div class="aisp"><b>${q.j + 1}. ${E(q.t)}</b>${(pl.to[q.id] || []).filter(x => x.trim()).map(x => `<p>${sn(x)}</p>`).join("") || '<p class="note">(nothing)</p>'}</div>`).join("") }
  $("#aispok").onclick = () => { apply(plans[k]); k++; draw() }; $("#aispskip").onclick = () => { k++; draw() };
  if ($("#aispall")) $("#aispall").onclick = async () => { for (; k < pts.length; k++) apply(plans[k] || await plansP[k]); d.close() };
  d.addEventListener("close", () => { if (done) { ed.render(); toast(`Split ${done} point${done > 1 ? "s" : ""} ✓ Check the text under each key point.`) } }, {once: true});
  draw() }

// =====================================================================
// PREPARE: develop a new talk in a conversation, then create it (outline, text, verse slides, slides, pictures).
// =====================================================================
const PK = "ai-prepare";
async function prepare(){
  let st = (() => { try { return JSON.parse(localStorage.getItem(PK) || "null") } catch (e) { return null } })() || {msgs: [], brief: "", style: "", title: "", minutes: ""};
  const files = [], keep = () => { try { localStorage.setItem(PK, JSON.stringify(st)) } catch (e) {} };
  document.title = "Prepare a talk";
  document.body.innerHTML = `<div class="top"><h1>✨ Prepare a talk</h1><div class="mode"><button type="button" class="btn" data-act="aiset">Settings</button><a class="btn" href="./">All talks</a></div></div>
    <div class="aiprep"><section class="aichat"><div class="ailog" id="ailog"></div>
      <div class="aicomp">${fileRow("aipf")}<textarea id="aimsg" rows="3" placeholder="Tell me about the talk: the occasion, audience, length, what's on your heart. Paste your notes, key points or verses, or add files (Word, PDF, text, pictures)."></textarea>
        <div class="row"><span class="note" style="flex:1">Ask for ideas, stories, verses, a stronger opening, a different order… Enter sends, Shift+Enter is a new line.</span><button type="button" class="btn small" id="aireset">Start over</button><button type="button" class="btn small pri" id="aisend">Send</button></div></div></section>
    <aside class="aibrief"><div class="pgh"><b>The talk so far</b><span class="note">You can edit this too</span></div><textarea id="aibr" placeholder="As we talk, the working outline shows up here.">${E(st.brief)}</textarea>
      <div class="aibox"><b>Create it</b><div class="row"><label style="flex:2 1 200px">Title<input id="aiti" value="${E(st.title)}" placeholder="From the outline"></label><label style="flex:1 1 90px">Minutes<input id="aimin" value="${E(st.minutes)}" inputmode="numeric" placeholder="30"></label></div>
        <label>Picture style (all slides follow it)<textarea id="aisty" rows="2" placeholder="e.g. Warm cinematic photographs, golden-hour light, rural Philippines">${E(st.style)}</textarea></label>
        <div class="row"><label class="btn small aiup">+ Style picture<input type="file" accept="image/*" hidden id="aisp"></label><button type="button" class="btn small" id="aisamp">✨ Show me a sample</button><span class="aimsg" id="aisampm"></span></div><div class="aires" id="aisampr"></div>
        <label class="chk"><input type="checkbox" id="aipics" checked> Make a picture for every slide</label>
        <div class="row"><button type="button" class="btn pri" id="aicreate">✨ Create the talk</button></div><div class="aimsg" id="aicm"></div></div></aside></div>`;
  let styleRef = null;   // data URL of the chosen style picture
  bindFiles("aipf", files);
  const log = $("#ailog"), md = t => E(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  const drawLog = () => { log.innerHTML = st.msgs.length ? st.msgs.map(m => `<div class="aim ${m.role}">${md(m.text)}${m.files ? `<div class="note">📎 ${E(m.files.join(", "))}</div>` : ""}</div>`).join("") : `<div class="aim assistant">Hi Norman. What's the talk? Tell me the occasion, the audience and how long you have, and drop in anything you already have: a whole talk, key points, verses, stories or pictures. We'll shape it together, and when it feels right press <b>Create the talk</b>.</div>`; log.scrollTop = log.scrollHeight };
  drawLog();
  const sync = () => { st.brief = $("#aibr").value; st.title = $("#aiti").value; st.minutes = $("#aimin").value; st.style = $("#aisty").value; keep() };
  ["#aibr", "#aiti", "#aimin", "#aisty"].forEach(s => $(s).addEventListener("input", sync));
  $("#aireset").onclick = () => { if (!confirm("Start over? This clears the conversation and the outline.")) return; st = {msgs: [], brief: "", style: "", title: "", minutes: ""}; keep(); prepare() };
  $("#aimsg").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#aisend").click() } });
  $("#aisend").onclick = async () => { const text = $("#aimsg").value.trim(); if (!text && !files.length) return; sync();
    const sent = files.splice(0); bindFiles("aipf", files); st.msgs.push({role: "user", text: text || "(files)", files: sent.length ? sent.map(f => f.name) : undefined});
    if (sent.length) st.notes = (st.notes || "") + sent.filter(f => f.kind === "text").map(f => `\n--- ${f.name} ---\n${f.text.slice(0, 60000)}`).join("");
    $("#aimsg").value = ""; drawLog(); log.insertAdjacentHTML("beforeend", '<div class="aim assistant think">…</div>'); log.scrollTop = log.scrollHeight; $("#aisend").disabled = true;
    try { const hist = st.msgs.slice(-24).map(m => (m.role === "user" ? "Norman: " : "You: ") + m.text).join("\n\n");
      const j = await chat(`You are a thoughtful speechwriting partner for Norman Denler, President and CEO of Kids International Ministries (a children's ministry in the Philippines). Help him develop a talk: ask a good question when something important is missing, offer ideas, stories, illustrations, verses, structure and stronger wording, and push back gently when something is weak. Keep replies conversational and fairly short (under 200 words) unless he asks for more.
Also maintain the working outline of the talk ("brief"): title, audience, length, big idea, movements with their points, key verses, stories, and any notes he wants kept. Start from the current brief (he may have edited it), apply what was decided, and return the whole updated brief as plain text with simple markdown.
Return JSON {"reply": "...", "brief": "...", "title": "working title or empty", "minutes": number or null, "imageStyle": "suggested picture style if none chosen yet, else empty"}.`,
        parts(`Current brief:\n${st.brief || "(empty)"}\n\n${st.notes ? "Material he uploaded earlier:" + st.notes.slice(-80000) + "\n\n" : ""}Conversation:\n${hist}`, sent.filter(f => f.kind !== "text")), {effort: "low"});
      st.msgs.push({role: "assistant", text: j.reply || "…"}); if (j.brief) $("#aibr").value = j.brief; if (j.title && !$("#aiti").value) $("#aiti").value = j.title; if (j.minutes && !$("#aimin").value) $("#aimin").value = j.minutes; if (j.imageStyle && !$("#aisty").value) $("#aisty").value = j.imageStyle; sync() }
    catch (e) { st.msgs.push({role: "assistant", text: "⚠ " + e.message}); if (!e.quiet) {} } finally { $("#aisend").disabled = false; keep(); drawLog() } };
  $("#aisp").onchange = async e => { const f = e.target.files[0]; if (!f) return; styleRef = await T.toJpeg(f); $("#aisampr").innerHTML = `<button type="button" class="on"><img alt="Style picture" src="${styleRef}"><span>Style picture ✓</span></button>` };
  $("#aisamp").onclick = async () => { sync(); const stop = ticker($("#aisampm"), "Making a sample…");
    try { const p = await chat(`You write prompts for an image model. ${PIC_RULES}\nReturn JSON {"prompt": "..."} (80-140 words): the opening slide picture for this talk, in the given picture style.`, `Picture style: ${st.style || "(choose one that fits)"}\n\nTalk:\n${st.brief}`);
      const [u] = await image(p.prompt + "\n\n" + PIC_RULES, styleRef ? [await dataURLtoBlob(styleRef)] : [], 1);
      $("#aisampr").insertAdjacentHTML("afterbegin", `<button type="button" data-u="${u}"><img alt="Sample" src="${u}"><span>Use as the style picture</span></button>`) } catch (e) { fail(e) } finally { stop(); $("#aisampm").textContent = "" } };
  $("#aisampr").onclick = e => { const b = e.target.closest("[data-u]"); if (!b) return; styleRef = b.dataset.u; $("#aisampr").querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); const s = x.querySelector("span"); if (s) s.textContent = x === b ? "Style picture ✓" : "Use as the style picture" }) };
  $("#aicreate").onclick = async () => { sync(); const m = $("#aicm"), b = $("#aicreate"); if (!st.brief.trim() && !st.msgs.length) { m.textContent = "Tell me about the talk first."; return }
    if (!T.token()) { T.tokenSetup(() => location.reload()); return }
    const pw = await new Promise(ok => T.presenterGate(C.passHash, "pres-ok", () => ok(true))); if (!pw) return;
    b.disabled = true; let stop = ticker(m, "Writing the whole talk (a minute or two)…");
    try { const hist = st.msgs.map(x => (x.role === "user" ? "Norman: " : "Partner: ") + x.text).join("\n\n").slice(-60000);
      const j = await chat(`You write complete talks for Norman Denler, President and CEO of Kids International Ministries (Philippines), in his voice: warm, direct, story-driven, Scripture-centered.
Turn the outline and conversation into the full talk, ready to present: every movement and point, cue, key points, the full text he would say, verse slides and other slides (bullets, quotes) where they help, and a picture idea for each point. Fit the length (${st.minutes || "about 30"} minutes; about 130 spoken words per minute). Keep everything he provided; where he gave wording, use it.
Return JSON in this ${GEN_SHAPE}`, parts(`Title: ${st.title || "(choose)"}\nPicture style: ${st.style || "(choose)"}\n\nOutline:\n${st.brief}\n\n${st.notes ? "His material:" + st.notes.slice(-90000) + "\n\n" : ""}Conversation:\n${hist}`, []), {effort: "medium"});
      stop(); const title = (st.title || j.title || "New talk").trim(), talk = T.newTalk(title), folder = T.folderName(title);
      let list = []; try { list = await (await fetch("talks.json?t=" + Date.now(), {cache: "no-store"})).json() } catch (e) {}
      if (list.some(t => t.folder === folder)) { m.textContent = "A talk with that title already exists. Change the title and try again."; b.disabled = false; return }
      Object.assign(talk, {audience: j.audience || "", length: j.length || (st.minutes ? st.minutes + " min" : ""), bigIdea: j.bigIdea || "", timerMinutes: st.minutes ? String(st.minutes) : "", imageStyle: st.style || j.imageStyle || ""});
      talk.sections = (j.sections || []).map((s, si) => toSection(s, si === 0)); if (!talk.sections.length) throw new Error("The AI didn't return any movements. Try again.");
      const tp = talk.sections[0].points[0]; if (tp) { tp.slideTitle = tp.slideTitle || title; tp.layout = "center" }
      m.textContent = "Looking up the verses…"; await fillVerses(talk.sections.flatMap(s => s.points));
      m.textContent = "Saving the talk…"; const base = C.root + "/" + folder; let {sha: tsha} = await T.createTalk(talk);
      if (styleRef) { const path = `slides/style-${Date.now().toString(36)}.jpg`; await GH.put(base + "/" + path, styleRef.split(",")[1], null, "Style picture"); talk.imageStyleRef = path; T.LOCALIMG[path] = styleRef }
      const saveTalk = async () => { for (let a = 0; a < 3; a++) { try { tsha = await GH.put(base + "/talk.json", T.b64e(JSON.stringify(talk, null, 1) + "\n"), tsha, "AI pictures for " + title); return } catch (e) { if (e.status !== 409 && e.status !== 422) throw e; tsha = (await GH.get(base + "/talk.json")).sha } } };
      if (styleRef) await saveTalk();
      const link = `<a href="${E(folder)}/edit.html">Open it in the editor</a> (live in about a minute).`;
      if ($("#aipics").checked) { const jobs = picJobs(talk); if (styleRef) T.LOCALIMG[talk.imageStyleRef] = styleRef;
        const prevPATH = T.PATH; m.innerHTML = `Talk created. ${link}<br>Making pictures 0 of ${jobs.length} (about a minute each, 3 at a time). Keep this page open until they're done.`;
        let since = 0; await makePictures(base, talk, jobs, async (jb, path) => { jb.o.image = path; if (++since >= 3) { since = 0; await saveTalk().catch(() => {}) } },
          (n, all) => { m.innerHTML = `Talk created. ${link}<br>Making pictures ${n} of ${all}… Keep this page open until they're done.` });
        await saveTalk(); const bad = jobs.filter(x => x.err).length; m.innerHTML = `Done ✓ ${link}${bad ? `<br>${bad} picture${bad > 1 ? "s" : ""} didn't come out; use ✨ Create image on those slides.` : ""}` }
      else m.innerHTML = `Done ✓ ${link}`;
      st.created = folder; keep() }
    catch (e) { stop(); m.textContent = ""; fail(e) } finally { b.disabled = false } };
}

// =====================================================================
// HOOKS into the editor
// =====================================================================
window.TALKAI = {html: {
  img: (A) => imgButton(A),
  talk: d => voiceHTML(d) + styleHTML(d),
  sec: s => `<div class="row aisecrow"><button type="button" class="btn small aib" data-act="aisec" data-id="${E(s.id)}">✨ AI draft of this movement</button></div>`,
  navsec: () => ` <button type="button" class="btn small aib" data-act="aisec">✨ With AI</button>`,
  split: () => ` <button type="button" class="btn small aib" data-act="aisplit">✨ Split into the key points</button>`,
  esv: () => `<button type="button" class="btn small aib" id="aiesv" title="Fill in the ESV text for this reference">✨ ESV text</button>`
}, chat, image, settings, outline};
function aiMenu(btn){ let m = $("#aimenu"); if (m) { m.remove(); return } m = document.createElement("div"); m.id = "aimenu"; m.className = "vmenu";
  m.innerHTML = `<div class="vmh">✨ AI</div><button type="button" data-a="check">Check spelling, grammar and flow</button><button type="button" data-a="listen">Listen to the talk from here</button><button type="button" data-a="narr">Make the narrated version (share link)</button><button type="button" data-a="split">Split the full text into the key points (whole talk)</button><button type="button" data-a="sec">New movement with AI</button><a href="../prepare.html" class="vbtn">Prepare a new talk…</a><button type="button" data-a="set">Settings and keys</button>`;
  document.body.appendChild(m); const r = btn.getBoundingClientRect(); m.style.top = r.bottom + 6 + "px"; m.style.left = Math.max(8, Math.min(r.left, innerWidth - 290)) + "px";
  m.onclick = e => { const b = e.target.closest("[data-a]"); if (!b) return; m.remove(); const a = b.dataset.a;
    if (a === "check") checkTalk(); else if (a === "listen") listen(); else if (a === "narr") narrate(); else if (a === "split") splitTalk(null).catch(fail); else if (a === "sec") sectionAI(null); else settings() } }
document.addEventListener("mousedown", e => { const m = $("#aimenu"); if (m && !m.contains(e.target) && !e.target.closest("#aibtn")) m.remove() });
document.addEventListener("click", e => {
  if (e.target.closest("#aibtn")) { aiMenu(e.target.closest("#aibtn")); return }
  const b = e.target.closest("[data-act]"); if (!b) { if (e.target.closest("#aiesv")) esvFill(); return } const a = b.dataset.act;
  if (a === "aiimg") createImage({pid: b.dataset.id, i: b.dataset.t === "xs" ? +b.dataset.i : null}).catch(fail);
  else if (a === "aisec") sectionAI(b.dataset.id || null).catch(fail);
  else if (a === "aisplit") splitTalk(T.ed.sel().id).catch(fail);
  else if (a === "aisample") styleSample();
  else if (a === "aistyledel") { T.ed.op({t: "talk", f: "imageStyleRef", v: ""}); T.ed.render() }
  else if (a === "aiset") settings() });
document.addEventListener("change", async e => { const el = e.target; if (!el.matches || !el.matches("[data-aistyle]")) return; const file = el.files && el.files[0]; if (!file) return;
  const m = $("#aistm"); if (m) m.textContent = "Uploading…"; try { const path = await savePic("style", await T.toJpeg(file), "style"); T.ed.op({t: "talk", f: "imageStyleRef", v: path}); T.ed.render() } catch (err) { fail(err) } });
async function esvFill(){ const ref = ($("#ver") || {}).value || ""; if (!ref.trim()) { toast("Type the reference first"); return } const b = $("#aiesv"); b.disabled = true; b.textContent = "Looking up…";
  try { let t = await esvText(ref.trim()), ver = "ESV"; if (!t) { const j = await chat(`Quote the Bible passage in the ESV translation, word for word, plain text, no verse numbers or headings. Return JSON {"text": "..."}.`, ref.trim()); t = j.text; ver = "ESV (check)" }
    if (t) { $("#vet").textContent = t; $("#vev").value = ver } } catch (e) { fail(e) } finally { b.disabled = false; b.textContent = "✨ ESV text" } }
document.addEventListener("talk-edit-ready", () => { const s = $("#save"); if (s && !$("#aibtn")) s.insertAdjacentHTML("beforebegin", `<button type="button" class="btn small aib" id="aibtn" title="AI tools">✨ AI</button>`) });
if (MODE === "prepare") prepare();
})();
