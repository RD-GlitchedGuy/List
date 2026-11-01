"use strict";
/* =====================================================================
   AUDIO — Motor aus Zylinder-Obertönen, Getriebe, Turbo, Fehlzündungen
   ===================================================================== */
const ENG = {
  sport:   { idle:850,  red:7800,  n:6, cut:.2,  turbo:.9, sc:0,  spec:'i6',  vol:1 },
  muscle:  { idle:700,  red:6400,  n:6, cut:.26, turbo:0,  sc:.9, spec:'v8',  vol:1.15 },
  truck:   { idle:780,  red:6600,  n:5, cut:.28, turbo:.7, sc:0,  spec:'v6',  vol:1.05 },
  formula: { idle:4200, red:14500, n:7, cut:.06, turbo:0,  sc:0,  spec:'v10', vol:.9 },
  mini:    { idle:1000, red:8200,  n:5, cut:.22, turbo:.6, sc:0,  spec:'i3',  vol:.85 },
};
const HARM = { i6:[[6,1],[12,.55],[18,.3],[3,.12],[24,.18]], v8:[[8,1],[4,.9],[2,.4],[16,.45],[12,.3],[6,.22],[24,.2]], v6:[[6,1],[3,.55],[12,.4],[9,.25],[18,.2]], v10:[[10,1],[20,.6],[5,.22],[30,.35],[40,.18]], i3:[[3,1],[6,.6],[9,.35],[1,.25],[2,.3],[12,.2]] };
const AU={ ctx:null, waves:{}, buf:{} };
// Echte Aufnahmen (MIT-Lizenz, aus pmndrs/racing-game) — ohne Internet bleibt der synthetische Motor
const SND_BASE='https://cdn.jsdelivr.net/gh/pmndrs/racing-game@main/public/sounds/', PITCH={sport:1, muscle:.78, truck:.86, formula:1.55, mini:1.22};
function loopSrc(b,dest){ const s=AU.ctx.createBufferSource(); s.buffer=b; s.loop=true; const g=AU.ctx.createGain(); g.gain.value=0; s.connect(g); g.connect(dest||AU.fxG); s.start(); return {s,g}; }
function loadSamples(){ ['engine','accelerate','tire-brake','crash','honk'].forEach(n=>fetch(SND_BASE+n+'.mp3').then(r=>{ if(!r.ok) throw 0; return r.arrayBuffer(); })
  .then(a=>new Promise((res,rej)=>AU.ctx.decodeAudioData(a,res,rej))).then(b=>{ AU.buf[n]=b; if(n==='engine'){ AU.sIdle=loopSrc(b,AU.engF); AU.sNpc=loopSrc(b,AU.pan); } if(n==='accelerate') AU.sAcc=loopSrc(b,AU.engF); if(n==='tire-brake') AU.sSkid=loopSrc(b); if(n==='honk') AU.sHorn=loopSrc(b); }).catch(()=>{})); }
const AUS={ popT:0, lastThr:0 };
const MUSIC={ el:null, i:0, fade:null };
// Sucht die Musik an mehreren Orten/Schreibweisen (GitHub Pages unterscheidet Groß-/Kleinschreibung)
const MUSIC_SRC=['audio/intro.mp3','audio/Intro.mp3','Intro.mp3','intro.mp3','Audio/Intro.mp3','Audio/intro.mp3'];
try{ const el=new Audio(); el.preload='auto'; el.addEventListener('error',()=>{ if(MUSIC.i<MUSIC_SRC.length-1){ MUSIC.i++; el.src=MUSIC_SRC[MUSIC.i]; el.load(); if(MUSIC.want) el.play().catch(()=>{}); } else console.warn('Intro-Musik nicht gefunden – erwartet unter audio/intro.mp3'); }); el.src=MUSIC_SRC[0]; MUSIC.el=el; }catch(e){}
function playMusic(){ const el=MUSIC.el; if(!el) return; MUSIC.want=true; clearInterval(MUSIC.fade); el.volume=cfg.sound?VOL()*MVOL():0; try{ el.currentTime=0; }catch(e){}
  const p=el.play(); if(p&&p.catch) p.catch(()=>{ el.addEventListener('canplay',()=>{ if(MUSIC.want) el.play().catch(()=>{}); },{once:true}); }); }
function stopMusic(){ const el=MUSIC.el; MUSIC.want=false; if(!el||el.paused) return; clearInterval(MUSIC.fade); MUSIC.fade=setInterval(()=>{ el.volume=Math.max(0,el.volume-.08); if(el.volume<=0){ clearInterval(MUSIC.fade); el.pause(); } },60); }
const musicTime=()=>MUSIC.el && !MUSIC.el.paused && MUSIC.el.currentTime>0 ? MUSIC.el.currentTime : null;
function engineWave(ctx, spec, load){ const N=160, re=new Float32Array(N+1), im=new Float32Array(N+1), R=rng(spec.charCodeAt(0)*977+spec.length*31+(load?1:2));
  for(let k=1;k<=N;k++){ let a=.035/Math.sqrt(k)*(.5+R()); for(const [h,amp] of HARM[spec]){ const d=Math.abs(k-h); if(d<.5) a+=amp; else if(d<1.5) a+=amp*.12; }
    a*=load?Math.exp(-k/70):Math.exp(-k/26); const ph=R()*Math.PI*2; re[k]=a*Math.cos(ph); im[k]=a*Math.sin(ph); }
  return ctx.createPeriodicWave(re, im); }
function waveFor(spec, load){ const k=spec+(load?'+':'-'); return AU.waves[k]||(AU.waves[k]=engineWave(AU.ctx,spec,load)); }
function softClip(k){ const n=1024, c=new Float32Array(n); for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.tanh(k*x)/Math.tanh(k); } return c; }
function makeVoice(ctx, dest){ const v={ type:null };
  v.on=ctx.createOscillator(); v.off=ctx.createOscillator(); v.gOn=ctx.createGain(); v.gOff=ctx.createGain(); v.gOn.gain.value=v.gOff.gain.value=0;
  v.shaper=ctx.createWaveShaper(); v.shaper.curve=softClip(2.4); v.shaper.oversample='2x';
  v.lp=ctx.createBiquadFilter(); v.lp.type='lowpass'; v.lp.Q.value=.8;
  v.body=ctx.createBiquadFilter(); v.body.type='peaking'; v.body.frequency.value=105; v.body.Q.value=1.1; v.body.gain.value=7;
  v.out=ctx.createGain(); v.out.gain.value=0;
  v.on.connect(v.gOn); v.off.connect(v.gOff); v.gOn.connect(v.shaper); v.gOff.connect(v.shaper); v.shaper.connect(v.lp); v.lp.connect(v.body); v.body.connect(v.out); v.out.connect(dest);
  v.on.start(); v.off.start(); return v; }
function voiceType(v, type){ if(v.type===type) return; v.type=type; const E=ENG[type]; v.on.setPeriodicWave(waveFor(E.spec,true)); v.off.setPeriodicWave(waveFor(E.spec,false)); }
function voiceSet(v, rpm, load, gain, rough){ const t=AU.ctx.currentTime, E=ENG[v.type||'sport'], f=rpm/120, rf=clamp((rpm-E.idle)/(E.red-E.idle),0,1);
  v.on.frequency.setTargetAtTime(f,t,.02); v.off.frequency.setTargetAtTime(f,t,.02); v.on.detune.setTargetAtTime(rough,t,.03); v.off.detune.setTargetAtTime(rough,t,.03);
  v.gOn.gain.setTargetAtTime(.2+.8*load,t,.05); v.gOff.gain.setTargetAtTime(.15+.85*(1-load),t,.05);
  v.lp.frequency.setTargetAtTime(380+rf*2800+load*2600,t,.05); v.out.gain.setTargetAtTime(gain,t,.05); }
function noiseChain(ctx, dest, type, f, q){ const s=ctx.createBufferSource(); s.buffer=AU.noise; s.loop=true; s.playbackRate.value=.8+Math.random()*.4; const fl=ctx.createBiquadFilter(); fl.type=type; fl.frequency.value=f; fl.Q.value=q; const g=ctx.createGain(); g.gain.value=0; s.connect(fl); fl.connect(g); g.connect(dest); s.start(); return {s,f:fl,g}; }
function oscChain(ctx, dest, type){ const o=ctx.createOscillator(); o.type=type; const g=ctx.createGain(); g.gain.value=0; o.connect(g); g.connect(dest); o.start(); return {o,g}; }
function initAudio(){
  if(AU.ctx){ if(AU.ctx.state==='suspended') AU.ctx.resume(); return; }
  try{ const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx) return; const ctx=new Ctx(); AU.ctx=ctx;
    const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-16; comp.ratio.value=4; comp.attack.value=.004; comp.release.value=.2; AU.vol=ctx.createGain(); AU.vol.gain.value=VOL(); comp.connect(AU.vol); AU.vol.connect(ctx.destination);
    const master=ctx.createGain(); master.gain.value=cfg.sound?.8:0; master.connect(comp); AU.master=master;
    // Mischpult: eigene Kanäle für Autos und Effekte
    AU.carG=ctx.createGain(); AU.carG.gain.value=CVOL(); AU.carG.connect(master); AU.fxG=ctx.createGain(); AU.fxG.gain.value=FVOL(); AU.fxG.connect(master); const car=AU.carG, fx=AU.fxG;
    const b=ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; AU.noise=b;
    AU.eng=makeVoice(ctx, car);
    AU.pan=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain(); AU.pan.connect(car); AU.npc=makeVoice(ctx, AU.pan);
    AU.intake=noiseChain(ctx,car,'bandpass',900,.9); AU.wind=noiseChain(ctx,fx,'lowpass',520,.5); AU.skid=noiseChain(ctx,fx,'bandpass',1150,7); AU.skid2=noiseChain(ctx,fx,'bandpass',1650,9);
    AU.gravel=noiseChain(ctx,fx,'lowpass',260,.7); AU.pop=noiseChain(ctx,car,'lowpass',1400,.8); AU.bov=noiseChain(ctx,car,'bandpass',2600,1.2); AU.crash=noiseChain(ctx,fx,'lowpass',900,.6);
    AU.turbo=oscChain(ctx,car,'sine'); AU.sc=oscChain(ctx,car,'triangle');
    const hb=ctx.createBiquadFilter(); hb.type='bandpass'; hb.frequency.value=700; hb.Q.value=1.5; const hg=ctx.createGain(); hg.gain.value=0; hb.connect(hg); hg.connect(car);
    [392,494].forEach(f=>{ const o=ctx.createOscillator(); o.type='square'; o.frequency.value=f; o.connect(hb); o.start(); }); AU.horn=hg;
    AU.engF=ctx.createBiquadFilter(); AU.engF.type='lowpass'; AU.engF.frequency.value=2000; AU.engF.Q.value=.5; AU.engF.connect(car);
    loadSamples();
  }catch(e){ AU.ctx=null; } }
function burst(g, vol, dur){ if(!AU.ctx) return; const t=AU.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0005,t+dur); g.gain.setValueAtTime(0,t+dur+.01); }
function blip(freq, dur=.12, type='triangle', vol=.18, when=0){ if(!AU.ctx||!cfg.sound) return; const ctx=AU.ctx, t=ctx.currentTime+when; const o=ctx.createOscillator(), g=ctx.createGain(); o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dur); o.connect(g); g.connect(AU.fxG||AU.master); o.start(t); o.stop(t+dur+.02); }
const jingle = () => [523,659,784,1046].forEach((f,i)=>blip(f,.2,'triangle',.16,i*.09));
function crashSound(imp){ if(!AU.ctx) return; if(AU.buf.crash){ const s=AU.ctx.createBufferSource(), g=AU.ctx.createGain(); s.buffer=AU.buf.crash; g.gain.value=Math.min(1,imp*.05); s.connect(g); g.connect(AU.fxG); s.start(); return; } burst(AU.crash.g, Math.min(.55,imp*.03), .3); blip(70,.22,'sine',Math.min(.45,imp*.03)); }
function audioUpdate(me, inp, dt, on){
  if(!AU.ctx||!AU.eng) return; const t=AU.ctx.currentTime;
  if(!on||!me||!me.gb){ AU.eng.out.gain.setTargetAtTime(0,t,.08); AU.npc.out.gain.setTargetAtTime(0,t,.08); [AU.intake,AU.wind,AU.skid,AU.skid2,AU.gravel,AU.turbo,AU.sc].forEach(c=>c.g.gain.setTargetAtTime(0,t,.08)); AU.horn.gain.setTargetAtTime(0,t,.05); [AU.sIdle,AU.sAcc,AU.sSkid,AU.sHorn,AU.sNpc].forEach(c=>c&&c.g.gain.setTargetAtTime(0,t,.08)); return; }
  voiceType(AU.eng, me.def.type);
  const E=ENG[me.def.type], gb=me.gb, rpm=gb.rpm, rf=clamp((rpm-E.idle)/(E.red-E.idle),0,1), thr=inp.thr||0, load=gb.shiftT>0?.05:thr;
  const real=!!(AU.sIdle&&AU.sAcc);
  voiceSet(AU.eng, rpm, load, (real?0:(.2+.22*rf+.12*load)*E.vol), (Math.random()-.5)*(rpm<E.idle*1.3?34:8));
  if(real){ const pr=PITCH[me.def.type]*(.55+rf*1.45); AU.sIdle.s.playbackRate.setTargetAtTime(pr,t,.03); AU.sAcc.s.playbackRate.setTargetAtTime(pr,t,.03);
    AU.sIdle.g.gain.setTargetAtTime((.35+.25*rf)*(1-load*.85)*E.vol,t,.06); AU.sAcc.g.gain.setTargetAtTime((.25+.45*rf)*load*E.vol,t,.06); AU.engF.frequency.setTargetAtTime(900+load*5000+rf*3000,t,.06); }
  AU.intake.f.frequency.setTargetAtTime(500+rf*2200,t,.05); AU.intake.g.gain.setTargetAtTime(load*rf*.05,t,.05);
  AU.turbo.o.frequency.setTargetAtTime(2400+gb.boost*5200,t,.08); AU.turbo.g.gain.setTargetAtTime(E.turbo&&!real?gb.boost*.022*E.turbo:0,t,.08);
  AU.sc.o.frequency.setTargetAtTime(rpm*.55,t,.03); AU.sc.g.gain.setTargetAtTime(E.sc&&!real?thr*rf*.03*E.sc:0,t,.05);
  if(AUS.lastThr>.6 && thr<.2 && !me.air){ if(E.turbo && gb.boost>.35) burst(AU.bov.g, .09*gb.boost, .35); if(rf>.45) AUS.popT=.75; }
  AUS.lastThr=thr;
  if(AUS.popT>0){ AUS.popT-=dt; if(Math.random()<dt*13){ burst(AU.pop.g, .2+Math.random()*.22, .04+Math.random()*.05); spawnFlame(me); } }
  const spd=Math.abs(me.fwd); AU.wind.g.gain.setTargetAtTime(Math.min(.16,(spd/70)**2*.13),t,.1); AU.wind.f.frequency.setTargetAtTime(300+spd*8,t,.1);
  const skid=(!me.air && !me.offroad && Math.abs(me.lat)>3.2 && spd>5) ? clamp((Math.abs(me.lat)-3)/6,0,1) : 0;
  const ss=AU.sSkid?0:1; if(AU.sSkid) AU.sSkid.g.gain.setTargetAtTime(skid*.55,t,.05); AU.skid.g.gain.setTargetAtTime(skid*.1*ss,t,.04); AU.skid2.g.gain.setTargetAtTime(skid*.06*ss,t,.04); AU.skid.f.frequency.setTargetAtTime(980+Math.sin(t*9)*90+skid*220,t,.05);
  AU.gravel.g.gain.setTargetAtTime(me.offroad && !me.air ? Math.min(.14, spd/40*.14) : 0,t,.08);
  if(AU.sHorn){ AU.sHorn.g.gain.setTargetAtTime(inp.horn?.5:0,t,.02); AU.horn.gain.setTargetAtTime(0,t,.02); } else AU.horn.gain.setTargetAtTime(inp.horn?.1:0,t,.02);
  // nächstes anderes Auto
  let best=null, bd=3600; for(const r of game.racers){ if(r===me || !r.mesh.visible || !r.gb) continue; const d=(r.x-camera.position.x)**2+(r.z-camera.position.z)**2; if(d<bd){ bd=d; best=r; } }
  if(best){ voiceType(AU.npc, best.def.type); const d=Math.sqrt(bd), k=(1-d/60)**2; const BE=ENG[best.def.type], brf=clamp((best.gb.rpm-BE.idle)/(BE.red-BE.idle),0,1); voiceSet(AU.npc, best.gb.rpm, best.gb.load||.5, real?0:.16*k*BE.vol, 0);
    if(AU.sNpc){ AU.sNpc.s.playbackRate.setTargetAtTime(PITCH[best.def.type]*(.55+brf*1.45),t,.05); AU.sNpc.g.gain.setTargetAtTime(.3*k*BE.vol,t,.08); }
    if(AU.pan.pan){ const rx=_v3.setFromMatrixColumn(camera.matrixWorld,0); AU.pan.pan.setTargetAtTime(clamp(((best.x-camera.position.x)*rx.x+(best.z-camera.position.z)*rx.z)/Math.max(d,1),-1,1)*.8,t,.05); } }
  else { AU.npc.out.gain.setTargetAtTime(0,t,.1); if(AU.sNpc) AU.sNpc.g.gain.setTargetAtTime(0,t,.1); }
}
const _v3=new THREE.Vector3();

/* Lautstärke live anwenden (Mischpult) */
function applyVolume(){ const set=(g,v)=>{ if(g&&AU.ctx) g.gain.setTargetAtTime(v, AU.ctx.currentTime, .05); }; set(AU.vol,VOL()); set(AU.carG,CVOL()); set(AU.fxG,FVOL());
  if(MUSIC.el && MUSIC.want && !MUSIC.el.paused) MUSIC.el.volume=cfg.sound?VOL()*MVOL():0;
  if(typeof RADIO!=='undefined'){ if(RADIO.el) RADIO.el.volume=.55*VOL()*RVOL(); if(RADIO.djEl) RADIO.djEl.volume=VOL()*RVOL(); if(RADIO.song) set(RADIO.song.bus,.36*RVOL()); } }
