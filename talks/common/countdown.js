// Countdown timer shared by the Talk Prep Stage and the public presenter page.
// root: element holding .ct-track>i and .ct-txt. key: localStorage key (per talk).
function CountTimer(root,key){
  const fill=root.querySelector(".ct-track i"),txt=root.querySelector(".ct-txt");
  let st={start:null},mins=0;try{st=JSON.parse(localStorage.getItem(key))||st}catch(e){}
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(st))}catch(e){}};
  const fmt=s=>{s=Math.max(0,Math.floor(s));const m=Math.floor(s/60),x=s%60;return m+":"+String(x).padStart(2,"0")};
  function draw(){const T=mins*60;if(!T){root.hidden=true;return}root.hidden=false;
    const e=st.start?(Date.now()-st.start)/1000:0,p=e/T;
    fill.style.width=Math.min(100,p*100)+"%";
    root.className="ctimer "+(!st.start?"idle":p>=1?"over":p>=.9?"red":p>=.75?"amber":"green");
    txt.textContent=!st.start?fmt(T)+" · starts when you move to 1.b"
      :p>=1?"+"+fmt(e-T)+" over · "+fmt(e)+" of "+fmt(T):fmt(T-e)+" left · "+fmt(e)+" of "+fmt(T)}
  setInterval(draw,500);
  return {setMinutes(m){mins=+m||0;draw()},
    elapsed(){return st.start?(Date.now()-st.start)/1000:null},
    // atStart: true on 1.a (or anything before it): reset and wait. Otherwise start if not running.
    at(atStart){if(atStart){if(st.start!==null){st.start=null;save()}}else if(!st.start){st.start=Date.now();save()}draw()}};
}
function timerMinutes(t,sections){const n=parseFloat(t&&t.timerMinutes);if(n>0)return n;
  const m=String(t&&t.length||"").match(/(\d+(?:\.\d+)?)/);if(m)return +m[1];
  return (sections||[]).reduce((a,s)=>a+(parseFloat(s.minutes)||0),0)}
