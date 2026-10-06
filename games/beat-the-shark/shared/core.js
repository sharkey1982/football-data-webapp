/* ===========================================================================
   shared/core.js — the parts every Beat the Shark game shares.

   Used by the NFL game (and the World Cup and Nations Cup games to come).
   The original football game still carries its own copies of these; moving
   it across is a separate change, to be proved the same way as its first
   split: hundreds of seeded seasons must finish identically before and after.

   Loaded FIRST by each game's index.html.
   =========================================================================== */

/* ---- seeded randomness ---------------------------------------------------
   Deterministic and seeded: the same seed plays the same season. Nothing
   that affects an outcome may call Math.random() (it is used only for
   playback timing jitter). */
const R={s:0,next(){let a=this.s|=0;a=this.s=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
function hashSeed(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
const rng=()=>R.next(),rnd=(a,b)=>a+Math.floor(rng()*(b-a+1)),pick=a=>a[Math.floor(rng()*a.length)];
const shuffle=a=>{const r=a.slice();for(let i=r.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[r[i],r[j]]=[r[j],r[i]]}return r};
const clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
function ord(n){const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])}
const pct=x=>Math.round(x*100)+"%";
/* Run fn with the RNG state saved and restored, so a look-ahead (a win
   chance on a button, the Shark's forecast) never changes what happens next. */
function sandbox(fn,seedSalt){const saved=R.s;if(seedSalt!=null)R.s=hashSeed(String(seedSalt));
  try{return fn()}finally{R.s=saved}}

/* ---- levels ---------------------------------------------------------------
   How much of the game you meet at once -- NOT how hard it is. The Shark's
   target is the same at every level. unlock = full games played before a
   lever appears (Beginner meets one new idea per game). */
const LEVEL_NAMES={beginner:"Beginner",intermediate:"Intermediate",guru:"Advanced"};

/* ---- pacing (the football game's playtest: "too fast to follow") ---------- */
const PACE={commentaryMs:2000,quickCommentaryMs:1100,speeds:{slow:1.35,normal:1,fast:.45}};
let SPEED=null;
function speedName(){return SPEED||"normal"}
function speedFactor(){return PACE.speeds[speedName()]}
function paceControlsHTML(skipLabel){
  return `<div class="pace" role="group" aria-label="Playback speed" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin:8px 0">
    <span style="font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--mute)">SPEED</span>
    ${["slow","normal","fast"].map(k=>`<button class="choice" data-speed="${k}" aria-pressed="${speedName()===k}"
      style="margin:0;padding:4px 9px;width:auto;font-size:12px;${speedName()===k?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}
    <button class="choice" data-skip="1" style="margin:0 0 0 auto;padding:4px 9px;width:auto;font-size:12px">${skipLabel} ⏭</button>
  </div>`;
}
function wirePaceControls(root,onSkip){
  root.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{
    SPEED=b.dataset.speed;
    root.querySelectorAll('[data-speed]').forEach(x=>{const on=x.dataset.speed===SPEED;x.setAttribute('aria-pressed',on);
      x.style.borderColor=on?'var(--amber)':'';x.style.background=on?'color-mix(in srgb,var(--amber) 14%,transparent)':''})});
  const sk=root.querySelector('[data-skip]');if(sk)sk.onclick=onSkip;
}

/* ---- screen helpers ---------------------------------------------------------- */
const $=id=>document.getElementById(id);
function button(id,t,d,primary){return `<button class="choice${primary?' primary':''}" id="${id}"><span class="t">${t}</span>${d?`<span class="d">${d}</span>`:''}</button>`}

/* ---- a decision as cards, as the football game's half time ---------------
   Tap a card to pick it (it lights up), then press the button to confirm.
   Nothing happens until the button: a mis-tap costs nothing. On confirm the
   box is emptied, so no picked card is left on the screen afterwards.
   opts: [{id,t,d,win?}]; box: the element to fill. */
function choiceCards(box,opts,goLabel,onGo){
  let picked=null;
  box.innerHTML=`<div id="cards"></div><button class="choice primary" id="pickGo" style="margin-top:8px" disabled><span class="t">${goLabel}</span></button>`;
  const cards=document.getElementById('cards'),go=document.getElementById('pickGo'),btns=[];cards.innerHTML="";
  const paint=()=>{btns.forEach(b=>{const on=b._id===picked;b.setAttribute('aria-pressed',on);
      b.style.borderColor=on?'var(--amber)':'';b.style.background=on?'color-mix(in srgb,var(--amber) 14%,transparent)':''});
    go.disabled=!picked;go.style.opacity=picked?1:.5};
  opts.forEach(o=>{const b=document.createElement('button');b.className='choice';b._id=o.id;
    b.innerHTML=`<span class="t">${o.t}</span>${o.d||o.win!=null?`<span class="d">${o.d||""}${o.win!=null?`${o.d?" · ":""}win chance <b>${pct(o.win)}</b>`:""}</span>`:""}`;
    b.onclick=()=>{picked=o.id;paint()};btns.push(b);cards.appendChild(b)});
  go.onclick=()=>{if(!picked)return;const id=picked;box.innerHTML="";onGo(id)};
  paint();
}
