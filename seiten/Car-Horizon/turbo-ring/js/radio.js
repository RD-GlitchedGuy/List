/* ---------- Turbo FM: Ingame-Radio mit Moderator ----------
   Songs: eigene MP3s in audio/radio/1.mp3 … 8.mp3 (optional), der Intro-Song und
   prozedural erzeugte Tracks. Zwischen den Songs moderiert ein DJ (Sprachausgabe). */
/* ===== HIER EINTRAGEN – beliebig viele Einträge, keine Ober- oder Untergrenze =====
   DJ_ANSAGEN: Dateien in audio/dj/. Ein leerer Eintrag '' = keine Ansage, es kommt direkt der nächste Song.
   EIGENE_SONGS: ['Datei in audio/radio/', 'Anzeigename']. Sind Songs eingetragen, laufen nur diese.
   Leere Liste = eingebaute Computer-Songs.
   Sind beide DJ-Listen leer, spricht die Computerstimme. */
const DJ_ANSAGEN = ['2.mp3'];
const EIGENE_SONGS = [
//  ['aylex-freshness.mp3',                   'Aylex – Freshness'],
//  ['laeko-dont-wanna-know.mp3',             'Laeko – DONT WANNA KNOW'],
//  ['dj-puma-lovesick.mp3',                  'DJ PUMA – LOVESICK'],
//  ['everen-maxwell-wanderlust.mp3',         'Everen Maxwell – Wanderlust'],
//  ['reece-ros-free.mp3',                    'Reece Rosé – Free'],
//  ['cartoon-southby-bounce-on-da-riddim.mp3','Emily J, Cartoon, Southby, NCT – Bounce On Da Riddim'],
//  ['bad-computer-move-like-this.mp3',       'Bad Computer – Move Like This'],
//  ['korzix-ascend.mp3',                     'KORZIX – ascend'],
//  ['jey-vazz-wanna-do.mp3',                 'Jey Vazz – wanna do'],
//  ['hester-kyoto.mp3',                      'Hester – KYOTO'],
//  ['no-hero-tatsunoshin-all-or-nothing.mp3','No Hero, Tatsunoshin – All Or Nothing'],
//  ['syn-cole-feel-good.mp3',                'Syn Cole – Feel Good'],
//  ['ghostnaps-grow-apart.mp3',              'Ghostnaps – grow apart'],
//  ['magnus-like-this.mp3',                  'Magnus – Like This'],
//  ['nomra-your-body.mp3',                   'Nomra – Your Body'],
//  ['whats-gud-magnus-sanity.mp3',           'Whats Gud, Magnus – Sanity'],
//  ['fergo-sam-ourt-love-me.mp3',            'FERGO, Sam Ourt – Love Me'],
  ['intro.mp3',            'intro'],
];
const RADIO={ on:store.get('radio',1)?1:0, state:'off', song:null, el:null, files:[], timer:null, last:-1, dj:[], djLast:-1, djEl:null, voice:null, n:0 };
const SONG_NAMES=['Neon Drift','Fuji Sunrise','Midnight Touge','Kirschblüten-Turbo','Shibuya Lights','Redline Romance','Coastline 300','Boost & Bass','Tokyo Overdrive','Sakura Sprint','Gipfelsturm','Nachtfahrt'];
const DJ_LINES=[
  'Hier ist Turbo FM, euer Festival-Radio! Und jetzt kommt ein absoluter Banger: {s}!',
  'Ihr hört Turbo FM. Fenster runter, Lautstärke hoch, hier ist {s}!',
  'Grüße an alle in {r}! Weiter geht es mit {s}.',
  'Das war heiß! Und es wird noch heißer. Hier ist {s}.',
  'Achtung, Achtung: Wer jetzt nicht Vollgas gibt, verpasst {s}!',
  'Kleiner Tipp vom DJ: Drifts bringen richtig Punkte. Und jetzt: {s}!',
  'Der Fuji ruft! Wer schafft es heute bis zum Gipfel? Der passende Soundtrack dazu: {s}.',
  'Es ist {t} in Japan, und wir haben genau den richtigen Sound dafür: {s}!',
  'Turbo FM, die Nummer eins auf dem Festival. Haltet euch fest, jetzt kommt {s}!',
  'Und weiter geht die wilde Fahrt. Nächster Banger: {s}!',
  'Ihr fahrt, wir liefern die Musik. Das hier ist {s}.' ];

function radioPrime(){ // iOS braucht die erste Sprachausgabe in einer Nutzer-Geste
  try{ if(window.speechSynthesis){ const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); } }catch(e){}
  RADIO.files=EIGENE_SONGS.filter(Boolean).map(e=>Array.isArray(e)?e:[e,e.replace(/\.mp3$/i,'')]).map(([n,t])=>({src:'audio/radio/'+n, name:t})); RADIO.dj=DJ_ANSAGEN.map(n=>n?'audio/dj/'+n:''); }
function pickVoice(){ if(RADIO.voice || !window.speechSynthesis) return RADIO.voice; const v=speechSynthesis.getVoices().filter(v=>/^de/i.test(v.lang)); RADIO.voice=v.find(x=>/male|mann|markus|yannick|conrad|stefan/i.test(x.name))||v[0]||null; return RADIO.voice; }
function radioToggle(){ RADIO.on=RADIO.on?0:1; store.set('radio',RADIO.on); toast(RADIO.on?'📻 Turbo FM an':'📻 Radio aus'); if(typeof renderOpts==='function') renderOpts(); radioTick(); }
const radioWanted=()=>RADIO.on && cfg.sound && AU.ctx && game.mode==='roam';
function radioTick(){ const want=radioWanted();
  if(!want && RADIO.state!=='off') radioStop();
  else if(want && RADIO.state==='off') radioNext();
  if(RADIO.state==='song' && RADIO.song && AU.ctx && AU.ctx.currentTime>RADIO.song.end) radioNext();
  if(RADIO.song) radioSchedule(); }
setInterval(radioTick, 100);

function radioStop(){ RADIO.state='off'; try{ speechSynthesis.cancel(); }catch(e){} if(RADIO.djEl){ RADIO.djEl.pause(); RADIO.djEl=null; } if(RADIO.el){ const el=RADIO.el; RADIO.el=null; fadeEl(el); } if(RADIO.song){ const g=RADIO.song.bus; g.gain.setTargetAtTime(0,AU.ctx.currentTime,.15); setTimeout(()=>g.disconnect(),900); RADIO.song=null; } }
function fadeEl(el){ const iv=setInterval(()=>{ el.volume=Math.max(0,el.volume-.06); if(el.volume<=0){ clearInterval(iv); el.pause(); } },50); }

/* Nächster Song: erst der DJ, dann Musik */
function radioNext(){ if(RADIO.song){ const g=RADIO.song.bus; g.gain.setTargetAtTime(0,AU.ctx.currentTime,.4); setTimeout(()=>g.disconnect(),2500); RADIO.song=null; } if(RADIO.el){ fadeEl(RADIO.el); RADIO.el=null; }
  const own=RADIO.files.length, pool=own||(1+SONG_NAMES.length); let k; do k=Math.floor(Math.random()*pool); while(k===RADIO.last && pool>1); RADIO.last=k;
  let src=null, name; if(own){ src=RADIO.files[k].src; name=RADIO.files[k].name; }
  else if(k===0 && MUSIC.el && MUSIC.el.currentSrc){ src=MUSIC.el.currentSrc; name='Turbo Ring Anthem'; }
  else name=SONG_NAMES[(k-1+SONG_NAMES.length)%SONG_NAMES.length];
  RADIO.state='dj'; const tod=W&&W.night>.5?'Nacht':(cfg.tod==='dusk'?'Abend':'Tag');
  const line=(RADIO.n++===0?'Willkommen bei Turbo FM! ':'')+pick(DJ_LINES).replace('{s}',name).replace('{r}',game.region||'Japan').replace('{t}',tod);
  toast('📻 Turbo FM · '+name); djJingle(); const go=()=>{ if(RADIO.state!=='dj'||!radioWanted()) return; RADIO.state='song'; src?playFile(src):playSynth(name); };
  let done=false; const fin=()=>{ if(!done){ done=true; setTimeout(go,350); } };
  if(RADIO.dj.length){ let j; do j=Math.floor(Math.random()*RADIO.dj.length); while(j===RADIO.djLast && RADIO.dj.length>1); RADIO.djLast=j;
    if(!RADIO.dj[j]){ done=true; go(); return; }   // leerer Eintrag: keine Ansage
    const el=new Audio(RADIO.dj[j]); el.volume=VOL()*RVOL(); RADIO.djEl=el; el.onended=fin; el.onerror=fin; el.play().catch(fin); setTimeout(fin,30000); return; }
  try{ if(!window.speechSynthesis) throw 0; speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(line); u.lang='de-DE'; const v=pickVoice(); if(v) u.voice=v; u.rate=1.08; u.pitch=1.05; u.volume=1; u.onend=fin; u.onerror=fin; speechSynthesis.speak(u); setTimeout(fin, 9000); }
  catch(e){ setTimeout(fin, 2500); } }
function playFile(src){ const el=new Audio(src); el.volume=.55*VOL()*RVOL(); RADIO.el=el; el.onended=()=>{ if(RADIO.el===el) radioNext(); }; el.play().catch(()=>radioNext()); }
function djJingle(){ if(!AU.ctx) return; [784,988,1319].forEach((f,i)=>blip(f,.18,'sine',.07,i*.09)); }

/* ---------- Prozedurale Songs: Drums, Bass, Akkorde, Melodie ---------- */
function seeded(str){ let h=2166136261; for(const ch of str){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619); } return ()=>{ h=Math.imul(h^(h>>>15),2246822507); h=Math.imul(h^(h>>>13),3266489909); return ((h^=h>>>16)>>>0)/4294967296; }; }
const PROGS=[[0,5,3,4],[0,3,4,4],[5,3,0,4],[0,4,5,3],[5,4,3,4]], SCALE=[0,2,3,5,7,8,10];
function playSynth(name){ const R=seeded(name), ctx=AU.ctx, bus=ctx.createGain(); bus.gain.value=0; bus.connect(AU.master); bus.gain.setTargetAtTime(.36*RVOL(),ctx.currentTime,.3);
  const bpm=100+Math.floor(R()*30), root=40+Math.floor(R()*8), prog=PROGS[Math.floor(R()*PROGS.length)], mel=[...Array(16)].map(()=>R()<.62?Math.floor(R()*7):-1), four=R()<.6, bars=48;
  RADIO.song={ bus, bpm, root, prog, mel, four, bars, t0:ctx.currentTime+.1, next:0, end:ctx.currentTime+.1+bars*4*60/bpm+1.5 }; }
function radioSchedule(){ const S=RADIO.song; if(!S||!S.t0) return; const ctx=AU.ctx, st=60/S.bpm/4, ahead=ctx.currentTime+.35;
  while(S.t0+S.next*st<ahead && S.next<S.bars*16){ const i=S.next++, t=Math.max(ctx.currentTime,S.t0+i*st), bar=Math.floor(i/16), s=i%16, sec=bar<4?0:bar<20?1:bar<28?2:bar<44?1:3;
    const deg=S.prog[bar%4], ch=[0,2,4].map(k=>SCALE[(deg+k)%7]+12*Math.floor((deg+k)/7)), hz=n=>440*Math.pow(2,(n-69)/12);
    if(sec===1||sec===3){ if(s%4===0 && (S.four||s%8===0)) rKick(S.bus,t); if(s===4||s===12) rSnare(S.bus,t); }
    if(sec>=1 && s%2===0) rHat(S.bus,t,s%4===2?.09:.045);
    if(sec>=1 && sec<3 && s%2===0) rNote(S.bus,t,hz(S.root+ch[0]),st*1.6,'sawtooth',.11,500+(s%4)*150);
    if(s===0) ch.forEach(n=>rNote(S.bus,t,hz(S.root+24+n),st*15,'triangle',sec===2?.05:.035,1800));
    if(sec===1 && S.mel[s]>=0){ const n=SCALE[(S.mel[s]+deg)%7]; rNote(S.bus,t,hz(S.root+36+n),st*1.8,'square',.03,2600); }
    if(sec===2 && s%3===0) rNote(S.bus,t,hz(S.root+36+ch[s%3]),st*2,'sine',.05,3000); } }
function rNote(bus,t,f,d,type,vol,cut){ const c=AU.ctx, o=c.createOscillator(), fl=c.createBiquadFilter(), g=c.createGain(); o.type=type; o.frequency.value=f; fl.type='lowpass'; fl.frequency.value=cut;
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.01); g.gain.exponentialRampToValueAtTime(.0005,t+d); o.connect(fl); fl.connect(g); g.connect(bus); o.start(t); o.stop(t+d+.05); }
function rKick(bus,t){ const c=AU.ctx, o=c.createOscillator(), g=c.createGain(); o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(42,t+.12); g.gain.setValueAtTime(.9,t); g.gain.exponentialRampToValueAtTime(.001,t+.32); o.connect(g); g.connect(bus); o.start(t); o.stop(t+.35); }
function rNoise(bus,t,hp,vol,dec){ const c=AU.ctx, s=c.createBufferSource(), f=c.createBiquadFilter(), g=c.createGain(); s.buffer=AU.noise; f.type='highpass'; f.frequency.value=hp; g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dec); s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t+dec+.02); }
function rSnare(bus,t){ rNoise(bus,t,1400,.35,.16); rNote(bus,t,190,.1,'triangle',.18,2000); }
function rHat(bus,t,v){ rNoise(bus,t,7000,v,.05); }
