/* ---------- Studio-Logo „Sky Games“: läuft direkt nach dem Trailer ----------
   Flugzeug fliegt in den Rahmen, die Sonne wächst über den ganzen Bildschirm, dann erscheint das Menü.
   Überspringen: Klick, Tippen oder Taste. */
function playStudio(done){
  const old=$('#studio'); if(old) old.remove();
  const box=document.createElement('div'); box.id='studio';
  const rays=[...Array(16)].map((_,k)=>{ const a=k*Math.PI/8, m=k%2===0, r1=m?54:56, r2=m?76:68;
    return `<line x1="${(Math.cos(a)*r1).toFixed(1)}" y1="${(Math.sin(a)*r1).toFixed(1)}" x2="${(Math.cos(a)*r2).toFixed(1)}" y2="${(Math.sin(a)*r2).toFixed(1)}"/>`; }).join('');
  box.innerHTML=`<svg viewBox="0 0 680 560" preserveAspectRatio="xMidYMid meet" aria-label="Sky Games">
<defs><g id="pshape"><path d="M0,-110 C14,-110 16,-90 16,-70 L14,95 L0,115 L-14,95 L-16,-70 C-16,-90 -14,-110 0,-110Z"/>
<path d="M-15,-15 L-112,38 L-112,54 L-15,28Z M15,-15 L112,38 L112,54 L15,28Z"/><path d="M-12,82 L-50,106 L-50,116 L-12,102Z M12,82 L50,106 L50,116 L12,102Z"/></g></defs>
<rect x="150" y="70" width="380" height="380" rx="70" fill="#000" stroke="#fff" stroke-width="16"/>
<text x="340" y="516" text-anchor="middle" fill="#fff" style="font:700 32px 'Chakra Petch',sans-serif;letter-spacing:1px">Sky Games</text>
<g class="plane" transform="translate(800,700) rotate(-45) scale(0.95)"><g fill="#fff" stroke="#8A8A8A" stroke-width="7">
<rect x="-62" y="-2" width="14" height="26" rx="7"/><rect x="-92" y="14" width="14" height="26" rx="7"/><rect x="48" y="-2" width="14" height="26" rx="7"/><rect x="78" y="14" width="14" height="26" rx="7"/></g>
<use href="#pshape" fill="#fff" stroke="#8A8A8A" stroke-width="7" stroke-linejoin="round"/></g>
<g class="sun" transform="translate(264,184)"><circle r="42" fill="#FFB000" stroke="#F59E00" stroke-width="6"/><g stroke="#F59E00" stroke-width="6" stroke-linecap="round">${rays}</g></g>
</svg><div class="ld"><i></i>Loading</div>`;
  document.body.appendChild(box);
  const plane=box.querySelector('.plane'), sun=box.querySelector('.sun'), ld=box.querySelector('.ld');
  const T_FLY=1800, T_PAUSE=500, T_GROW=2600, T_LOAD=700, TOTAL=T_FLY+T_PAUSE+T_GROW, easeOut=t=>1-Math.pow(1-t,3), easeIn=t=>t*t*t;
  let t0=null, over=false;
  // kleiner Flugzeug-Sound beim Hereinfliegen
  if(AU.ctx && cfg.sound){ const c=AU.ctx, t=c.currentTime, s=c.createBufferSource(), f=c.createBiquadFilter(), g=c.createGain(); s.buffer=AU.noise; f.type='bandpass'; f.Q.value=1.2;
    f.frequency.setValueAtTime(300,t); f.frequency.exponentialRampToValueAtTime(1600,t+1.6); f.frequency.exponentialRampToValueAtTime(500,t+2.4);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.25,t+1.4); g.gain.exponentialRampToValueAtTime(.001,t+2.6); s.connect(f); f.connect(g); g.connect(AU.fxG||AU.master); s.start(t); s.stop(t+2.7); }
  const finish=()=>{ if(over) return; over=true; box.classList.add('out'); removeEventListener('keydown',skip,true); setTimeout(()=>{ box.remove(); if(done) done(); },600); };
  const skip=e=>{ if(e){ e.preventDefault(); e.stopPropagation(); } finish(); };
  box.addEventListener('pointerdown',skip); addEventListener('keydown',skip,true);
  (function frame(now){ if(over) return; if(t0===null) t0=now; const e=now-t0;
    const p=easeOut(Math.min(e/T_FLY,1)); plane.setAttribute('transform',`translate(${(800-352*p).toFixed(1)},${(700-330*p).toFixed(1)}) rotate(-45) scale(0.95)`);
    const g=clamp((e-T_FLY-T_PAUSE)/T_GROW,0,1); sun.setAttribute('transform',`translate(264,184) scale(${(1+24*easeIn(g)).toFixed(3)})`);
    ld.style.opacity=clamp((e-TOTAL)/400,0,1).toFixed(2);
    if(e>TOTAL+T_LOAD) finish(); else requestAnimationFrame(frame); })(performance.now());
}
