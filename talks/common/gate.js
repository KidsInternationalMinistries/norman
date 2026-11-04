// Light presenter lock: keeps casual visitors from driving the monitors. Not real security.
// Asks once per browser; the password's SHA-256 is compared, so the page source never holds the password itself.
async function presenterGate(hash, key, onOk){
  const ok=()=>{try{return localStorage.getItem(key)===hash}catch(e){return false}};
  if(ok()){onOk();return}
  const d=document.createElement("div");d.id="gate";
  d.innerHTML='<form><h2>Presenter</h2><p>This page controls the slides on every screen. Enter the presenter password.</p><input type="password" autocomplete="current-password" aria-label="Password" required><div class="gmsg" role="alert"></div><button type="submit">Open</button><p class="gnote">Just here to watch? <a href="./">Open the slides</a>.</p></form>';
  document.body.appendChild(d);const f=d.querySelector("form"),inp=d.querySelector("input"),msg=d.querySelector(".gmsg");inp.focus();
  f.onsubmit=async e=>{e.preventDefault();
    const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(inp.value));
    const h=[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
    if(h===hash){try{localStorage.setItem(key,hash)}catch(_){}d.remove();onOk()}else{msg.textContent="That's not it. Try again.";inp.select()}};
}
