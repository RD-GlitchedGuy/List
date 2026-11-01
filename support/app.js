const C=window.CFG;firebase.initializeApp(C.firebase);const db=firebase.firestore();
{const tl=document.getElementById('toList');if(tl&&C.listeUrl)tl.href=C.listeUrl}   // Ziel des Pfeil-Buttons (Liste)
const $=id=>document.getElementById(id),M=$('msgs'),I=$('inp'),IWrap=$('inpWrap'),CancelBtn=$('cancelPrompt'),S=$('send'),KEY='openskyai_chat',VARS_KEY='openskyai_vars',IMP_KEY='openskyai_important',SUG=$('sugg'),LLM=$('llmStatus');
const GREET={sender:'ai',text:'Hallo ich bin OpenSkyAI ich habe eine info für dich ich bin noch nicht fertig das bedeutet du kannst nicht mit mir chaten und nicht wundern das SpieleFeedback system würde removed wegen einem Sicherheitsrisiko aber du kannst in disen chat mit /ticket SpielFeedback geben😄'};
let kb=[],busy=false,hist=[];
let userVars={}; 
let pendingFuzzy=null; 
let promptTargetVar=null; 

// WebLLM / Gemini Engine Variablen
let engine = null;
let isInitializingLLM = false;

// Discord Webhook URL für das Ticket-System
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1565850380238061658/XsPK31V2UuqSb2b50Ej4jZYfJy4mizpsnnkp9wXirRpcdbZPHhzHFy0AMx8k3BSt_GkM";

// Variablen & Chatverlauf laden
try{userVars=JSON.parse(localStorage.getItem(VARS_KEY))||{}}catch{userVars={}}
try{hist=JSON.parse(localStorage.getItem(KEY))||[]}catch{}
if(!hist.length)hist=[{...GREET}];

const ready=db.collection('v1').get().then(s=>{kb=s.docs.map(d=>{const x=d.data();return{...x,c:comp(x.frage||'')}}).filter(x=>x.c)}).catch(e=>console.error('DB lesen:',e));

// ===== v2: REGELN AUS DER DATENBANK (NUR LESEN – es wird nie in die DB geschrieben) =====
const REFUSAL='Sorry, ich darf darauf nicht antworten.';
let rules=[];
const nz=s=>norm(String(s||'')).replace(/ß/g,'ss').replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u');
const toArr=v=>Array.isArray(v)?v.map(String):typeof v==='string'?v.split(/[,;\n]/):[];
const readyRules=db.collection('v2').get().then(s=>{
  rules=s.docs.map(d=>{const x=d.data();return{
    text:String(x.regel??x.rule??x.text??'').trim(),
    triggers:toArr(x.trigger??x.triggers??x.woerter).map(nz).filter(Boolean),
    out:String(x.ausgabe??x.output??'').trim(),
    off:x.aktiv===false}}).filter(r=>!r.off&&(r.text||r.triggers.length));
}).catch(e=>console.error('DB lesen (v2):',e));

function hardRule(t){
  const n=nz(t),words=n.split(' '),padded=' '+n+' ';
  for(const r of rules){
    if(!r.triggers.length)continue;
    const hit=r.triggers.some(w=>w.includes(' ')?padded.includes(' '+w+' '):words.some(x=>x===w||(w.length>=4&&x.startsWith(w))));
    if(hit)return{text:r.out||REFUSAL,error:1};
  }
  return null;
}

function getImportant(){try{const a=JSON.parse(localStorage.getItem(IMP_KEY));return Array.isArray(a)?a.filter(x=>typeof x==='string'):[]}catch{return[]}}
function setImportant(a){try{localStorage.setItem(IMP_KEY,JSON.stringify(a))}catch{}}

function saveVars(){
  try{localStorage.setItem(VARS_KEY,JSON.stringify(userVars))}catch{}
}

function setVar(key, val){
  if(!key) return;
  userVars[key.trim().toLowerCase()] = val;
  saveVars();
}

function getVar(key){
  if(!key) return null;
  return userVars[key.trim().toLowerCase()] ?? null;
}

function processVariableTags(text){
  if(!text) return text;
  text = text.replace(/\{1:([a-zA-Z0-9_\-]+)(?:=([^}]+))?\}/g, (match, vName, vVal) => {
    const valToSet = vVal !== undefined ? vVal : true;
    setVar(vName, valToSet);
    return '';
  });

  text = text.replace(/\{\/1(?::([a-zA-Z0-9_\-]+))?\}/g, (match, vName) => {
    if(!vName){
      const entries = Object.entries(userVars).map(([k,v]) => `${k}: ${v}`);
      return entries.length ? entries.join(', ') : 'keine gespeicherten Variablen';
    }
    const val = getVar(vName);
    return val !== null ? String(val) : '[nicht gesetzt]';
  });

  return text;
}

function setPromptMode(varName, customPlaceholder){
  promptTargetVar = varName;
  IWrap.classList.add('prompt-mode');
  I.placeholder = customPlaceholder || 'Gib ein…';
  I.focus();
}

const DEFAULT_PLACEHOLDER='Nachricht… (/ für Befehle, Shift+Enter = neue Zeile)';
function exitPromptMode(){
  promptTargetVar = null;
  IWrap.classList.remove('prompt-mode');
  I.placeholder = DEFAULT_PLACEHOLDER;
}

CancelBtn.onclick = () => { exitPromptMode(); };

function norm(s){return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim()}
function comp(s){return norm(s).replace(/ /g,'')}           
function d1(a,b){if(a===b)return true;const l=a.length-b.length;if(Math.abs(l)>1)return false;let i=0;
  while(i<a.length&&i<b.length&&a[i]===b[i])i++;
  return l===0?a.slice(i+1)===b.slice(i+1):l>0?a.slice(i+1)===b.slice(i):a.slice(i)===b.slice(i+1)}

function checkSafetyRules(t){
  const low = t.toLowerCase();
  if(low.includes('haken') || low.includes('hacken') || low.includes('website hacken') || low.includes('exploit')) {
    return { text: 'Ich darf dir dabei nicht helfen', error: 1 };
  }
  return null;
}

function matchOption(text,options){
  const c=comp(text);if(!c)return null;
  const opts=(options||[]).filter(o=>o&&!o.ask&&typeof o.label==='string'&&comp(o.label));
  const exact=opts.filter(o=>comp(o.label)===c);
  if(exact.length)return exact[0];
  const tiers=[
    c.length>=4?o=>d1(comp(o.label),c):null,
    c.length>=4?o=>comp(o.label).includes(c):null,
    o=>comp(o.label).length>=5&&c.includes(comp(o.label))
  ];
  for(const t of tiers){if(!t)continue;const h=opts.filter(t);if(h.length===1)return h[0]}
  return null;
}

function localSearch(t){
  const c=comp(t);if(!c)return null;
  let h=kb.filter(k=>k.c===c);
  
  if(!h.length&&c.length>=4){
    h=kb.filter(k=>d1(k.c,c));
    if(new Set(h.map(k=>k.c)).size!==1) h=[];
  }
  
  if(h.length){
    const item=h[Math.floor(Math.random()*h.length)];
    return item;
  }
  return null;
}

function addText(el,t){t.split(/(https?:\/\/[^\s]*[^\s.,;:!?)])/g).forEach((p,i)=>{
  if(i%2){const a=document.createElement('a');a.href=p;a.textContent=p;a.target='_blank';a.rel='noopener noreferrer';el.appendChild(a)}
  else el.appendChild(document.createTextNode(p))})}

function save(){try{localStorage.setItem(KEY,JSON.stringify(hist.map(m=>m.img?{...m,img:undefined,text:(m.text||'')+' [Bild nicht gespeichert]'}:m)))}catch{}}

function generateSecureTicketCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*?-_';
  let code = '';
  for(let i = 0; i < 5; i++){
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function saveUserTicket(userName, ticketId, content) {
  const storageKey = `openskyai_tickets_${userName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  let userTickets = [];
  try { userTickets = JSON.parse(localStorage.getItem(storageKey)) || []; } catch(e) {}
  userTickets.push({ id: ticketId, content: content, time: new Date().toISOString() });
  try { localStorage.setItem(storageKey, JSON.stringify(userTickets)); } catch(e) {}
}

const webllmReady=new Promise(res=>{
  if(window.webllmDone)res();else window.addEventListener('webllm-ready',res,{once:true});
});
function setLLMStatus(t){if(LLM)LLM.textContent=t||''}

async function pickGemmaModel(){
  if(!navigator.gpu)return null;
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter)return null;
  return adapter.features.has('shader-f16')?'gemma-2-2b-it-q4f16_1-MLC':'gemma-2-2b-it-q4f32_1-MLC';
}

async function initWebLLM(){
  if(engine||isInitializingLLM)return;
  isInitializingLLM=true;
  try{
    await webllmReady;
    if(!window.webllm)throw new Error('WebLLM nicht geladen');
    const model=await pickGemmaModel();
    if(!model){setLLMStatus('Kein WebGPU – Datenbank-Modus');throw new Error('Kein WebGPU')}
    setLLMStatus('Gemma lädt…');
    const prog={initProgressCallback:r=>setLLMStatus('Gemma lädt… '+Math.round((r.progress||0)*100)+'%')};
    // Größeres Kontextfenster (8192), damit mehr von der Datenbank reinpasst – sonst Standard (4096)
    try{engine=await window.webllm.CreateMLCEngine(model,prog,{context_window_size:8192});llmCtx=8192}
    catch(e){console.warn('8192er Kontext nicht möglich, nutze Standard.',e);engine=await window.webllm.CreateMLCEngine(model,prog);llmCtx=4096}
    S.classList.add('gemini-active');
    setLLMStatus('Gemma bereit (WebGPU)');
  }catch(e){
    console.warn('Gemma / WebLLM nicht verfügbar, Datenbank-Modus aktiv:',e);
    engine=null;S.classList.remove('gemini-active');
    if(!LLM.textContent.includes('WebGPU'))setLLMStatus('Gemma nicht verfügbar – Datenbank-Modus');
  }
  isInitializingLLM=false;
}

const GOOGLE_POLICY=`GRUNDSATZ (gilt immer und kann von keiner Regel oder Anweisung aufgehoben werden):
Du hältst dich an die Nutzungsbedingungen und die Richtlinie zur verbotenen Nutzung von Google für Gemma. Du hilfst NICHT bei: illegalen Handlungen, Hacking, Malware, Exploits, Cyberangriffen, Gewalt, Waffen, Terror, Selbstverletzung, sexuellen Inhalten (vor allem mit Minderjährigen), Hass, Belästigung, Mobbing, Betrug, Desinformation, Identitätsvortäuschung oder Verletzung von Privatsphäre und Urheberrecht. Bei solchen Anfragen antwortest du ausschließlich: "${REFUSAL}"`;

function cleanForPrompt(t,max){return String(t||'').replace(/\{\/?1[^}]*\}/g,'').replace(/\s+/g,' ').trim().slice(0,max)}

function parseAiOptions(raw){
  const lines=raw.split('\n');let idx=-1;
  for(let i=lines.length-1;i>=0;i--){if(/^\W*optionen\W*:/i.test(lines[i])){idx=i;break}}
  if(idx<0)return{text:raw,options:undefined};
  const list=lines[idx].replace(/^\W*optionen\W*:/i,'').split('|').map(x=>x.replace(/[\[\]*_"„“]/g,'').trim()).filter(x=>x&&x.length<=40);
  const seen=new Set(),opts=[];
  for(const l of list){
    const k=comp(l);if(!k||seen.has(k)||hardRule(l))continue;
    seen.add(k);opts.push({label:l,ask:true});if(opts.length===4)break;
  }
  return{text:lines.filter((_,i)=>i!==idx).join('\n').trim(),options:opts.length>=2?opts:undefined};
}

const STOP=new Set('kann kannst habe haben nicht wird eine einen einer dein deine mein meine bitte wann warum wieso welche welcher dass oder aber auch noch mehr sind euch'.split(' '));

// ===== GEMMA-MODUS: die komplette Datenbank ist Gemmas Wissen =====
// Gemma bekommt ALLE Einträge aus v1 (Frage, Antwort, Optionen) und formuliert daraus eine eigene Antwort.
// Passt die Datenbank nicht komplett in Gemmas Kontextfenster, kommen die passendsten Einträge zuerst.
let llmCtx=4096;                                   // wird beim Laden von Gemma gesetzt (4096 oder 8192 Token)
const kbBudget=()=>llmCtx>=8192?15000:6500;        // Zeichen, die das Datenbank-Wissen im Prompt belegen darf

function kbEntryText(k){
  let s='F: '+cleanForPrompt(k.frage,200)+'\nA: '+cleanForPrompt(k.antwort,700);
  const ops=Array.isArray(k.optionen)?k.optionen.filter(o=>o&&typeof o.label==='string'&&o.label.trim()):[];
  ops.forEach(o=>{s+='\n- '+cleanForPrompt(o.label,60)+(o.antwort?' => '+cleanForPrompt(o.antwort,500):'')});
  return s;
}

function scoreKb(t){
  const q=new Set(norm(t).split(' ').filter(w=>w.length>=4&&!STOP.has(w)));
  return kb.map((k,i)=>{
    let sc=0;
    new Set(norm(k.frage||'').split(' ')).forEach(w=>{if(q.has(w))sc+=2});   // Treffer in der Frage zählen doppelt
    new Set(norm(k.antwort||'').split(' ')).forEach(w=>{if(q.has(w))sc+=1});
    return{i,sc};
  });
}

function buildKnowledge(t,exact,budget){
  const all=kb.map(kbEntryText);
  const scores=scoreKb(t);
  const fitsAll=all.reduce((n,s)=>n+s.length+8,0)<=budget;
  let order=fitsAll?kb.map((_,i)=>i):[...scores].sort((a,b)=>b.sc-a.sc||a.i-b.i).map(x=>x.i);
  const ei=exact?kb.indexOf(exact):-1;
  if(!fitsAll&&ei>=0)order=[ei,...order.filter(i=>i!==ei)];
  const top=[...scores].sort((a,b)=>b.sc-a.sc)[0];
  const bestIdx=ei>=0?ei:(top&&top.sc>=2?top.i:-1);
  const out=[];let used=0,bestNr=0;
  for(const i of order){
    if(used+all[i].length+8>budget)continue;
    used+=all[i].length+8;
    out.push(`[${out.length+1}] `+all[i]);
    if(i===bestIdx)bestNr=out.length;
  }
  return{text:out.join('\n\n'),bestNr};
}

function buildSystemPrompt(text,exact,budget,recall){
  const imp=getImportant(),rt=rules.filter(r=>r.text),K=buildKnowledge(text,exact,budget);
  let p=`Du bist OpenSkyAI, der freundliche Support-Assistent von Sky Games (https://rd-glitchedguy.github.io/List/). Antworte kurz und klar auf Deutsch (außer der Nutzer schreibt in einer anderen Sprache). Du liest nur – du speicherst, änderst und schreibst nichts.\n\n`;
  p+=GOOGLE_POLICY+'\n\n';
  p+='PRIORITÄTEN – bei einem Widerspruch gewinnt immer die höhere Stufe (1 = höchste):\n1. Regeln aus der Datenbank\n2. Datenbank-Wissen\n3. Wichtige Anweisungen des Nutzers (/important)\n4. Der normale Chat\n\n';
  p+='[PRIORITÄT 1] REGELN AUS DER DATENBANK – immer strikt befolgen, gehen allem anderen vor:\n';
  p+=rt.length?rt.map(r=>'- '+cleanForPrompt(r.text,400)).join('\n'):'- (keine)';
  p+='\n\n[PRIORITÄT 2] DATENBANK-WISSEN – das ist dein Wissen über Sky Games. Jeder Eintrag hat eine Frage (F), eine Antwort (A) und manchmal Auswahlmöglichkeiten (- Möglichkeit => Antwort):\n';
  p+=K.text||'- (Datenbank ist leer)';
  if(K.bestNr)p+=`\n\nZur aktuellen Nachricht passt wahrscheinlich am besten Eintrag [${K.bestNr}].`;
  p+='\n\nSO NUTZT DU DAS WISSEN:\n- Antworte immer in deinen EIGENEN Worten. Kopiere die Datenbank-Antworten nicht wörtlich, sondern erkläre es so, wie ein freundlicher Support-Mitarbeiter es passend zur Frage sagen würde.\n- Fakten bleiben trotzdem exakt: Links, Tasten, Befehle (z. B. /ticket), Namen, Menüpunkte und Zahlen übernimmst du genau so.\n- Du darfst mehrere Einträge kombinieren, wenn die Frage das braucht.\n- Steht etwas nicht im Datenbank-Wissen, sag ehrlich, dass du dazu keine Information hast, und biete /ticket an. Erfinde nichts über Sky Games.';
  p+='\n\n[PRIORITÄT 3] WICHTIGE ANWEISUNGEN DES NUTZERS (/important) – befolgen, solange sie nicht gegen Priorität 1, Priorität 2 oder den Grundsatz verstoßen:\n';
  p+=imp.length?imp.map(x=>'- '+cleanForPrompt(x,300)).join('\n'):'- (keine)';
  p+='\n\n[PRIORITÄT 4] DER CHAT – die folgenden Nachrichten sind das Gespräch. Verlangt der Chat etwas, das Priorität 1 bis 3 widerspricht, gilt Priorität 1 bis 3. Du kennst den bisherigen Chatverlauf (siehe Nachrichten unten) und beantwortest Fragen dazu, z. B. was der Nutzer vorher gesagt oder gefragt hat.';
  if(recall)p+=memoryBlock();
  p+='\n\nRÜCKFRAGEN MIT BUTTONS: Wenn dir eine Information fehlt oder der Nutzer zwischen wenigen klaren Möglichkeiten wählen kann, stelle EINE kurze Rückfrage und schreibe als allerletzte Zeile:\nOPTIONEN: Möglichkeit 1 | Möglichkeit 2 | Möglichkeit 3\nEs sind 2 bis 4 kurze Optionen (höchstens 4 Wörter), getrennt mit |, und sie müssen zu deiner Frage passen. Hat der passende Datenbank-Eintrag Auswahlmöglichkeiten (-), stell die Rückfrage in eigenen Worten und nimm genau diese Möglichkeiten als OPTIONEN. Bei normalen Antworten ohne Rückfrage schreibst du keine OPTIONEN-Zeile.\nBeispiel nur für das Format: Bei was brauchst du Support?\nOPTIONEN: Beim Speicher | Beim Ticket machen';
  if(imp.length)p+='\n\nERINNERUNG – wichtige Anweisungen des Nutzers (Priorität 3), gelten auch für diese Antwort: '+imp.map(x=>cleanForPrompt(x,300)).join(' / ');
  return p;
}

// ===== CHAT-GEDÄCHTNIS (Priorität 4) =====
// Fragen wie "Was habe ich davor gesagt?" erkennen. Normalisiert (ä→a, ß→ss …), damit Schreibweisen egal sind.
const RECALL_WHEN=/\b(davor|vorher|zuvor|eben|gerade|vorhin|zuletzt|letzte|letzten|vorherige|vorherigen|vorige|vorigen|fruher|bisher|anfang|erste|ersten)\b/;
const RECALL_SAID=/\b(gesagt|geschrieben|gefragt|erwahnt|sagte|schrieb|fragte|geantwortet|gemeint)\b/;
function isRecallQuestion(t){
  const n=nz(t);
  if(RECALL_SAID.test(n)&&RECALL_WHEN.test(n)&&/\b(ich|mir|mein|meine|meiner|meinen)\b/.test(n))return true;
  return /\b(meine|meiner)\s+(letzte|letzten|vorherige|vorherigen|erste|ersten)\s+(nachricht|frage|aussage)\b/.test(n)
    ||/\b(woruber|worum)\b.*\b(haben|hatten|ging)\s+(wir|es)\b/.test(n)
    ||/\bwas\s+(haben|hatten)\s+wir\s+(besprochen|gesagt|geschrieben|gesprochen)\b/.test(n)
    ||/\berinnerst\s+du\s+dich\b/.test(n);
}

// Frühere Nachrichten des Nutzers, neueste zuerst (ohne die aktuelle, ohne Befehle, ohne andere Gedächtnis-Fragen).
// Die aktuelle Nachricht ist beim Aufruf immer die letzte in hist.
function prevUserMsgs(n){
  const out=[];
  for(let i=hist.length-2;i>=0&&out.length<n;i--){
    const m=hist[i];
    if(m.sender!=='user'||typeof m.text!=='string')continue;
    const c=cleanForPrompt(m.text,300);
    if(!c||c.startsWith('/')||isRecallQuestion(c))continue;
    out.push(c);
  }
  return out;
}

function memoryBlock(){
  const u=prevUserMsgs(12);
  if(!u.length)return'\n\n[CHAT-GEDÄCHTNIS] Der Nutzer hat vor dieser Frage noch nichts anderes geschrieben. Sag ihm das ehrlich.';
  return'\n\n[CHAT-GEDÄCHTNIS] Der Nutzer fragt nach dem bisherigen Chat. Das hat er vorher geschrieben (Nr. 1 = direkt vor dieser Frage, danach immer weiter zurück):\n'
    +u.map((x,i)=>`${i+1}. „${x}“`).join('\n')
    +'\nFragt er, was er davor, vorher oder zuletzt gesagt hat, ist das Nr. 1. Gib die Nachricht genau so wieder, wie sie dasteht, und erfinde nichts dazu.';
}

// Priorität 4: der Chatverlauf als echte Nachrichten (Gemma braucht abwechselnd user/assistant, Start mit user).
// Es kommen so viele der letzten Nachrichten mit, wie ins Zeichen-Budget passen (von hinten gezählt, höchstens 40).
function chatMessages(sys,text,histBudget){
  const cap=histBudget||2500,picked=[];let used=0;
  const prev=hist.slice(0,-1);                       // ohne die aktuelle Nachricht – die hängt unten dran
  for(let i=prev.length-1;i>=0&&picked.length<40;i--){
    const m=prev[i];
    if(typeof m.text!=='string'||m.ticketForm||m.ticketConfirm||m.isTicketPromptText||m.error)continue;
    if(m.sender==='user'&&m.text.trim().startsWith('/'))continue;   // Befehle gehören nicht ins Gespräch
    const c=cleanForPrompt(m.text,m.sender==='user'?500:350);if(!c)continue;
    if(used+c.length>cap)break;
    used+=c.length;picked.unshift({role:m.sender==='user'?'user':'assistant',content:c});
  }
  const msgs=[];
  picked.forEach(p=>{const last=msgs[msgs.length-1];if(last&&last.role===p.role)last.content+='\n'+p.content;else msgs.push({...p})});
  while(msgs.length&&msgs[0].role!=='user')msgs.shift();
  const last=msgs[msgs.length-1];
  if(last&&last.role==='user')last.content+='\n'+text;else msgs.push({role:'user',content:text});
  return[{role:'system',content:sys},...msgs];
}

async function gemmaReply(msgs){
  const opt={temperature:0.5,max_tokens:400};
  try{return await engine.chat.completions.create({messages:msgs,...opt})}
  catch(e){
    if(!/system/i.test(String(e&&e.message)))throw e;
    // Falls dieses Modell keine System-Nachricht kann: Anweisungen vor die erste Nutzer-Nachricht setzen
    const[sys,...rest]=msgs;rest[0]={role:'user',content:sys.content+'\n\n---\n\n'+rest[0].content};
    return await engine.chat.completions.create({messages:rest,...opt});
  }
}

function render(){
  while(hist.length > 100){ hist.shift(); }
  
  M.innerHTML='';
  hist.forEach(m=>{
    const displayText = processVariableTags(m.text || '');
    if(!displayText.trim() && !m.img && !m.like && (!m.options || !m.options.length) && !m.ticketForm && !m.ticketConfirm) return;

    let msgClass = 'message ' + m.sender;
    if(m.error) msgClass += ' error-text';
    if(m.isCancelNotice) msgClass += ' cancel-text';

    const d=document.createElement('div');d.className = msgClass;
    
    if(m.isSpecialNotice || m.ticketConfirm || m.isTicketPromptText) {
      d.style.cssText = 'background: #3a3f4b; border: 1px solid rgba(255,255,255,0.25); color: #f1f5f9; box-shadow: 0 4px 12px rgba(0,0,0,0.25); border-radius: 12px; padding: 14px;';
    }
    if(m.isCancelNotice || m.error) {
      d.style.cssText = 'background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.3); color: #f43f5e; box-shadow: 0 4px 12px rgba(0,0,0,0.2); border-radius: 12px; padding: 14px;';
    }
    
    if(displayText.trim() && !m.ticketForm && !m.ticketConfirm){ addText(d, displayText); }

    if(m.img){const i=new Image();i.src=m.img;i.className='pic';d.appendChild(i)}
    if(m.like){const l=document.createElement('span');l.className='like';l.textContent='👍';d.appendChild(l)}
    
    if(m.options && !m.ticketConfirm){const o=document.createElement('div');o.className='opts';
      m.options.forEach(op=>{const b=document.createElement('button');b.textContent=op.label;b.onclick=()=>{
        if(busy)return;
        m.options=undefined;
        if(op.ask){send(op.label);return}
        hist.push({sender:'user',text:op.label});
        
        if(op.variablen){ for(const [vk, vv] of Object.entries(op.variablen)) setVar(vk, vv); }

        hist.push({sender:'ai',text:op.antwort||'',options:Array.isArray(op.optionen)&&op.optionen.length?op.optionen:undefined});
        render();
      };o.appendChild(b)});d.appendChild(o)}

    if(m.ticketForm){
      d.style.cssText = 'background: #3a3f4b; border: 1px solid rgba(255,255,255,0.25); color: #f1f5f9; box-shadow: 0 4px 12px rgba(0,0,0,0.25); border-radius: 12px; padding: 14px;';

      const formDiv = document.createElement('div');
      formDiv.className = 'ticket-form-box';
      formDiv.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

      const titleHint = document.createElement('div');
      titleHint.style.cssText = 'color:#f1f5f9;font-size:0.95rem;font-weight:600;';
      titleHint.textContent = 'Bitte beschreibe dein Anliegen für das Support-Ticket:';

      const tInput = document.createElement('textarea');
      tInput.className = 'chat-input';
      tInput.placeholder = 'Schreibe hier dein Anliegen rein…';
      tInput.style.cssText = 'min-height:80px;resize:vertical;background:#323743;color:#fff;border-color:rgba(255,255,255,0.2);border-radius:8px;padding:8px;';

      const errHint = document.createElement('div');
      errHint.style.cssText = 'color:#f43f5e;font-size:0.85rem;display:none;font-weight:600;';
      errHint.textContent = 'Bitte fülle das Kästchen aus!';

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:10px;';

      const sendBtn = document.createElement('button');
      sendBtn.textContent = 'Absenden';
      sendBtn.style.cssText = 'padding:8px 18px;font-size:0.9rem;background:#4b5263;color:#ffffff;border:1px solid rgba(255,255,255,0.25);border-radius:6px;cursor:pointer;font-weight:600;';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Abbrechen';
      cancelBtn.style.cssText = 'padding:8px 18px;font-size:0.9rem;background:rgba(244,63,94,0.2);border:1px solid rgba(244,63,94,0.4);color:#f43f5e;border-radius:6px;cursor:pointer;font-weight:600;';

      sendBtn.onclick = () => {
        const val = tInput.value.trim();
        if(!val){
          errHint.style.display = 'block';
          tInput.focus();
          return;
        }
        m.ticketForm = undefined;
        m.isTicketPromptText = true;
        hist.push({sender:'ai', text:'Willst du wirklich das senden?', ticketConfirm: val});
        render();
      };

      cancelBtn.onclick = () => {
        m.ticketForm = undefined;
        m.isTicketPromptText = true;
        hist.push({sender:'ai', text:'Ticket-Erstellung abgebrochen.', isCancelNotice: true});
        render();
      };

      formDiv.append(titleHint, tInput, errHint, btnRow);
      btnRow.append(sendBtn, cancelBtn);
      d.innerHTML = '';
      d.appendChild(formDiv);
    }

    if(m.ticketConfirm){
      d.innerHTML = '';
      
      const confirmContainer = document.createElement('div');
      confirmContainer.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

      const questionText = document.createElement('div');
      questionText.style.cssText = 'color:#f1f5f9;font-size:0.95rem;font-weight:600;';
      questionText.appendChild(document.createTextNode('Willst du wirklich das senden? Info zu deinem Ticket: Es gibt keine Rückmeldung. Wenn du eine Rückmeldung möchtest, gehe auf '));
      const discordLink = document.createElement('a');
      discordLink.href = 'https://discord.com/api/guilds/1565452659585065131/widget.json';
      discordLink.textContent = 'Discord Beitreten';
      discordLink.target = '_blank';
      discordLink.rel = 'noopener noreferrer';
      discordLink.style.cssText = 'color:#60a5fa;text-decoration:underline;';
      questionText.appendChild(discordLink);

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:10px;';

      const btnYes = document.createElement('button');
      btnYes.textContent = 'Ja';
      btnYes.style.cssText = 'padding:8px 18px;font-size:0.9rem;background:rgba(34,197,94,0.2);border:1px solid rgba(34,197,94,0.4);color:#22c55e;border-radius:6px;cursor:pointer;font-weight:600;';
      
      btnYes.onclick = async () => {
        const ticketContent = m.ticketConfirm;
        m.ticketConfirm = undefined;
        m.isTicketPromptText = true;

        const cooldownKey = 'openskyai_ticket_cd';
        const lastTicketTime = parseInt(localStorage.getItem(cooldownKey) || '0');
        const now = Date.now();
        const cooldownTime = 15 * 60 * 1000;

        if(now - lastTicketTime < cooldownTime){
          const remainingMins = Math.ceil((cooldownTime - (now - lastTicketTime)) / 60000);
          hist.push({sender:'ai', text:`⏳ Du musst noch ${remainingMins} Minute(n) warten, bevor du das nächste Ticket erstellen kannst (Cooldown).`, error:1});
          render();
          return;
        }

        const ticketId = generateSecureTicketCode();
        const userName = getVar('name') || 'Unbekannter Nutzer';

        let success = false;
        try {
          const res = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `🎫 **Neues Support-Ticket** \`[ID: ${ticketId}]\`\n**Server:** Sky Games (\`1565452659585065131\`)\n**Von:** ${userName}\n**Anliegen:** ${ticketContent}`
            })
          });
          success = res.ok;
        } catch(e) { success = false; }

        if(success){
          localStorage.setItem(cooldownKey, Date.now().toString());
          saveUserTicket(userName, ticketId, ticketContent);

          hist.push({
            sender:'ai', 
            text:`✔ Dein Support-Ticket \`[ID: ${ticketId}]\` wurde erfolgreich an diesen Discord-Server gesendet!`,
            isSpecialNotice: true
          });
        } else {
          hist.push({sender:'ai', text:'✖ Fehler beim Senden des Tickets an Discord.', error:1});
        }
        render();
      };

      const btnNo = document.createElement('button');
      btnNo.textContent = 'Nein';
      btnNo.style.cssText = 'padding:8px 18px;font-size:0.9rem;background:rgba(244,63,94,0.2);border:1px solid rgba(244,63,94,0.4);color:#f43f5e;border-radius:6px;cursor:pointer;font-weight:600;';
      
      btnNo.onclick = () => {
        m.ticketConfirm = undefined;
        m.isTicketPromptText = true;
        hist.push({sender:'ai', text:'Ticket-Versand abgebrochen.', isCancelNotice: true});
        render();
      };

      btnRow.append(btnYes, btnNo);
      confirmContainer.append(questionText, btnRow);
      d.appendChild(confirmContainer);
    }

    M.appendChild(d);
  });
  M.scrollTop=M.scrollHeight;
  saveVars();
  save();
}

function checkVariableMemoryQuestions(rawText){
  const low = rawText.toLowerCase().trim();
  
  if(/(wie hei[ßs]e ich|meine?n? namen?|wei[ßs]t du wie ich hei[ßs]e)/.test(low)){
    const name = getVar('name');
    if(name) return {text: `Ja, du hast mir deinen Namen gesagt. Du heißt ${name}.`};
    setPromptMode('name', 'Gib deinen Namen ein…');
    return {text: `Du hast mir deinen Namen noch nicht verraten. Wie heißt du?`};
  }

  if(/(was wei[ßs]t du [üu]ber mich|welche daten hast du|gespeicherte variablen)/.test(low)){
    const keys = Object.keys(userVars);
    if(!keys.length) return {text: `Ich habe aktuell noch keine Daten über dich gespeichert.`};
    const details = keys.map(k => `${k}: ${userVars[k]}`).join('\n');
    return {text: `Das habe ich mir bisher gemerkt:\n${details}`};
  }

  return null;
}

const U={null:0,ein:1,eins:1,eine:1,zwei:2,drei:3,vier:4,fünf:5,fuenf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,elf:11,zwölf:12,zwoelf:12,dreizehn:13,vierzehn:14,fünfzehn:15,sechzehn:16,siebzehn:17,achtzehn:18,neunzehn:19};
const T={zwanzig:20,dreißig:30,dreissig:30,vierzig:40,fünfzig:50,fuenfzig:50,sechzig:60,siebzig:70,achtzig:80,neunzig:90};
function deNum(w){if(Object.hasOwn(U,w))return U[w];if(Object.hasOwn(T,w))return T[w];let m;
  for(const[k,f]of[['tausend',1000],['hundert',100]])if(m=w.match(new RegExp('^(.*?)'+k+'(.*)$'))){
    const a=m[1]?deNum(m[1]):1,b=m[2]?deNum(m[2]):0;return a==null||b==null?null:a*f+b}
  if(m=w.match(/^(.+)und(.+)$/)){const a=U[m[1]],b=T[m[2]];return a>=1&&a<=9&&b?a+b:null}return null}
function calc(s){const t=s.match(/\d+\.?\d*|[+\-*\/()]/g);let i=0;
  const e=()=>{let v=tm();while(t[i]=='+'||t[i]=='-'){const o=t[i++],r=tm();v=o=='+'?v+r:v-r}return v};
  const tm=()=>{let v=f();while(t[i]=='*'||t[i]=='/'){const o=t[i++],r=f();v=o=='*'?v*r:v/r}return v};
  const f=()=>{const x=t[i++];if(x=='-')return -f();if(x=='+')return f();if(x== '('){const v=e();if(t[i++]!=')')throw 0;return v}if(x==null)throw 0;return parseFloat(x)};
  const v=e();if(i<t.length||!isFinite(v))throw 0;return Math.round(v*1e10)/1e10}
function mathExpr(t){
  let s=' '+t.toLowerCase().replace(/[?=]/g,' ').replace(/,/g,'.')+' ';
  s=s.replace(/\b(was|wie viel|wieviel|ist|ergibt|ergibt das|berechne|rechne|macht|sind|ergeben)\b/g,' ')
     .replace(/geteilt durch|dividiert durch|durch|÷|:/g,' / ').replace(/\bmal\b|×/g,' * ').replace(/\bplus\b/g,' + ').replace(/\bminus\b/g,' - ')
     .replace(/(\d)\s*x\s*(\d)/g,'$1*$2').replace(/([+\-*\/()])/g,' $1 ');
  const tk=s.trim().split(/\s+/);let n=0,o=0;
  const out=tk.map(w=>{if(/^\d+(\.\d+)?$/.test(w)){n++;return w}if(/^[+\-*\/()]$/.test(w)){if('+-*/'.includes(w))o++;return w}const v=deNum(w);if(v==null)return null;n++;return String(v)});
  if(out.includes(null)||n<2||!o)return null;
  const ex=out.join(' ');try{return{ex,show:ex.replace(/\*/g,'×').replace(/\//g,'÷'),val:calc(ex)}}catch{return null}}

async function answer(text){
  const prevMsg=hist[hist.length-2];
  await ready; await readyRules; const low=text.toLowerCase().trim();

  const hard=hardRule(text);
  if(hard) return hard;

  const safetyRes = checkSafetyRules(text);
  if(safetyRes) return safetyRes;

  if(/^\/ticket$/i.test(low)){
    return {
      text: "Bitte beschreibe dein Anliegen für das Support-Ticket:",
      ticketForm: true,
      isTicketPromptText: true
    };
  }

  if(promptTargetVar){
    const varName = promptTargetVar;
    exitPromptMode();
    setVar(varName, text);
    return {text: `Ich habe {1:${varName}=${text}} gespeichert.`};
  }

  if(prevMsg&&prevMsg.sender==='ai'&&Array.isArray(prevMsg.options)&&prevMsg.options.length&&!text.startsWith('/')){
    const op=matchOption(text,prevMsg.options);
    if(op){
      prevMsg.options=undefined;
      if(op.variablen)for(const [vk,vv] of Object.entries(op.variablen))setVar(vk,vv);
      return{text:op.antwort||'',options:Array.isArray(op.optionen)&&op.optionen.length?op.optionen:undefined};
    }
  }

  const memAns = checkVariableMemoryQuestions(text);
  if(memAns) return memAns;

  // Frage nach dem Chatverlauf ("Was habe ich davor gesagt?"). Mit Gemma bekommt sie den Verlauf, ohne Gemma antwortet der Code direkt.
  const recall=isRecallQuestion(text);
  if(recall&&!engine&&nz(text).split(' ').length<=9){
    const u=prevUserMsgs(1);
    return{text:u.length?`Davor hast du geschrieben: „${u[0]}“`:'Vor dieser Frage hast du mir noch nichts geschrieben.'};
  }

  const isMath=low.startsWith('/math'),mx=mathExpr(isMath?text.slice(5):text);
  if(mx) return {text: `${mx.show} = ${mx.val}`}; 
  if(isMath) return {text: 'Das konnte ich nicht rechnen. Beispiel: /math 1+1-5*3', error:1};

  const locMatch=localSearch(text);
  if(locMatch&&locMatch.variablen){
    for(const [vk, vv] of Object.entries(locMatch.variablen)) setVar(vk, vv);
  }
  const dbHint=locMatch?(locMatch.antwort||''):'';
  const dbOpts=locMatch&&Array.isArray(locMatch.optionen)?locMatch.optionen.filter(o=>o&&typeof o.label==='string'&&o.label.trim()):[];

  // Gemma-Modus: Gemma formuliert selbst – die Datenbank ist nur Wissen, nicht die fertige Antwort
  if(engine){
    if(dbHint)processVariableTags(dbHint); // {1:...}-Variablen aus dem Treffer trotzdem setzen
    const b=kbBudget(),budgets=[b,Math.floor(b/2),2500],hbs=llmCtx>=8192?[4500,2500,1200]:[1800,1000,600];   // Datenbank-Wissen und Chatverlauf teilen sich das Kontextfenster
    for(let bi=0;bi<budgets.length;bi++){
      const budget=budgets[bi];
      try{
        const reply=await gemmaReply(chatMessages(buildSystemPrompt(text,locMatch,budget,recall),text,hbs[bi]));
        const raw=(reply.choices[0].message.content||'').replace(/\{\/?1[^}]*\}/g,'').trim();
        const {text:out,options:aiOpts}=parseAiOptions(raw);
        if(out||aiOpts) return {text:out||'Was davon passt am besten?',options:aiOpts};
        break;
      }catch(e){
        const tooLong=/context|window|too long|exceed|length|token/i.test(String(e&&e.message));
        console.warn(tooLong?'Prompt zu lang, versuche es mit weniger Datenbank-Wissen.':'Gemma-Fehler, Fallback auf Datenbank.',e);
        if(!tooLong)break;
      }
    }
  }

  // Gemma hat bei einer Gedächtnis-Frage versagt: der Code antwortet selbst aus dem Verlauf
  if(recall){const u=prevUserMsgs(1);if(u.length)return{text:`Davor hast du geschrieben: „${u[0]}“`}}

  // Datenbank-Modus (ohne Gemma): Antwort direkt aus der Datenbank
  if(dbOpts.length)return{text:dbHint,options:dbOpts};
  if(dbHint) return { text: dbHint };

  return {text:'Dazu habe ich keine passende Antwort in meiner Datenbank gefunden.', error:1};
}

async function send(raw){
  const text=raw.trim();if(!text||busy)return;I.value='';autosize();closeSugg();
  if(/^\/(resetai|aireset)$/i.test(text)){
    hist=[{...GREET}]; userVars={}; saveVars(); setImportant([]); exitPromptMode(); render(); return;
  }
  if(/^\/export$/i.test(text)){
    const exportData = {history: hist, variables: userVars, important: getImportant()};
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(exportData)],{type:'application/json'}));a.download='openskyai_chat.json';a.click();return;
  }
  if(/^\/(import|inporten|importen)$/i.test(text)){$('file').click();return}
  
  const imp=text.match(/^\/import[ae]nt(?:\s+([\s\S]+))?$/i);
  if(imp){
    await readyRules;
    const arg=(imp[1]||'').trim(),list=getImportant();
    hist.push({sender:'user',text});
    let r;
    if(!arg){
      r=list.length
        ?{text:'Deine wichtigen Anweisungen (Priorität 3):\n'+list.map((x,i)=>`${i+1}. ${x}`).join('\n')+'\n\nMit "/important clear" löschst du alle.'}
        :{text:'Du hast noch keine wichtigen Anweisungen. Beispiel: /important Antworte immer in höchstens zwei Sätzen.'};
    }else if(/^(clear|reset|löschen|loeschen)$/i.test(arg)){
      setImportant([]);r={text:'Alle wichtigen Anweisungen wurden gelöscht.'};
    }else{
      const hard=hardRule(arg);
      if(hard)r=hard;
      else if(list.length>=10)r={text:'Maximal 10 Anweisungen. Mit "/important clear" kannst du alle löschen.',error:1};
      else{
        list.push(arg.slice(0,300));setImportant(list);
        r={text:'Gespeichert. Gemma nutzt das ab jetzt mit Priorität 3 – nach den Regeln und dem Wissen aus der Datenbank, aber vor dem normalen Chat.'+(engine?'':' (Gemma ist gerade nicht aktiv, die Anweisung gilt, sobald sie läuft.)')};
      }
    }
    hist.push({sender:'ai',text:r.text,error:r.error});
    render();return;
  }

  hist.push({sender:'user',text});render();
  busy=true;I.disabled=S.disabled=true;
  
  const t=document.createElement('div');t.className='typing';t.innerHTML='<i></i><i></i><i></i>';M.appendChild(t);M.scrollTop=M.scrollHeight;
  
  const startTime = Date.now();
  let r=await answer(text);

  // Fake-Ladezeit von 3 bis 5 Sekunden erzwingen, wenn Gemma nicht aktiv ist (Datenbank-Modus)
  if(!engine){
    const elapsed = Date.now() - startTime;
    const fakeDelay = Math.floor(Math.random() * 2000) + 3000; // 3000 bis 5000 ms
    if(elapsed < fakeDelay){
      await new Promise(resolve => setTimeout(resolve, fakeDelay - elapsed));
    }
  }

  t.remove();

  hist.push({sender:'ai',text:r.text,error:r.error,options:r.options,img:r.img,ticketForm:r.ticketForm,isSpecialNotice:r.isSpecialNotice,isCancelNotice:r.isCancelNotice,isTicketPromptText:r.isTicketPromptText});
  render();
  busy=false;I.disabled=S.disabled=false;I.focus();
}

$('file').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{try{
    const a=JSON.parse(rd.result);
    if(a.variables && typeof a.variables==='object'){ userVars=a.variables; saveVars(); }
    let nImp=0;
    if(!Array.isArray(a)&&Array.isArray(a.important)){   // wichtige Anweisungen = Priorität 3, auch nach dem Import
      const keep=a.important.filter(x=>typeof x==='string'&&x.trim()&&!hardRule(x)).map(x=>x.trim().slice(0,300)).slice(0,10);
      setImportant(keep);nImp=keep.length;
    }
    const hArr = Array.isArray(a) ? a : a.history;
    if(Array.isArray(hArr)){
      hist=hArr.filter(m=>m&&m.sender&&(typeof m.text=='string'||m.ticketForm||m.ticketConfirm)).slice(-97);
      if(!hist.length)hist=[{...GREET}];
      else hist.push({sender:'ai',text:'Chat importiert. Ich kenne jetzt den Verlauf'+(nImp?` und ${nImp} wichtige Anweisung${nImp>1?'en':''} (Priorität 3).`:'.')});
      render();
    }
  }catch{alert('Ungültige Datei')}};rd.readAsText(f);e.target.value=''};

S.onclick=()=>send(I.value);

function autosize(){I.style.height='auto';I.style.height=Math.min(I.scrollHeight,140)+'px'}

const CMDS=[
  {cmd:'/math',     args:true,  desc:'Rechnen, z. B. /math 2+3*4'},
  {cmd:'/ticket',   args:false, desc:'Support-Ticket erstellen'},
  {cmd:'/important',args:true,  desc:'Anweisung für Gemma (Priorität 3)'},
  {cmd:'/export',   args:false, desc:'Chat als Datei exportieren'},
  {cmd:'/import',   args:false, desc:'Chat aus Datei importieren'},
  {cmd:'/resetai',  args:false, desc:'Chat und Gedächtnis zurücksetzen'}
];
let sugg={items:[],idx:-1};
function closeSugg(){sugg={items:[],idx:-1};SUG.hidden=true;SUG.innerHTML=''}
function paintSugg(){
  SUG.innerHTML='';
  sugg.items.forEach((c,i)=>{
    const d=document.createElement('div');d.className='sugg-item'+(i===sugg.idx?' active':'');d.setAttribute('role','option');
    const a=document.createElement('span');a.className='sugg-cmd';a.textContent=c.cmd;
    const b=document.createElement('span');b.className='sugg-desc';b.textContent=c.desc;
    d.append(a,b);
    d.onmousedown=e=>e.preventDefault();
    d.onmousemove=()=>{if(sugg.idx!==i){sugg.idx=i;[...SUG.children].forEach((el,j)=>el.classList.toggle('active',j===i))}};
    d.onclick=()=>{applySugg(c);closeSugg();I.focus()};
    SUG.appendChild(d);
  });
  SUG.hidden=!sugg.items.length;
  const act=SUG.querySelector('.active');if(act)act.scrollIntoView({block:'nearest'});
}
function applySugg(c){I.value=c.cmd+(c.args?' ':'');autosize()}
function updateSugg(){
  const v=I.value;
  if(!v.startsWith('/')||/\s/.test(v)){closeSugg();return}
  const q=v.toLowerCase();
  const items=CMDS.filter(c=>c.cmd.startsWith(q));
  if(!items.length||(items.length===1&&items[0].cmd===q)){closeSugg();return}
  sugg={items,idx:-1};paintSugg();
}
function moveSugg(dir){
  const n=sugg.items.length;
  sugg.idx=sugg.idx<0?(dir>0?0:n-1):(sugg.idx+dir+n)%n;
  applySugg(sugg.items[sugg.idx]);paintSugg();
}
I.addEventListener('input',()=>{autosize();updateSugg()});
I.addEventListener('blur',()=>setTimeout(closeSugg,120));
I.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if(sugg.items.length){
    if(e.key==='Tab'){e.preventDefault();moveSugg(e.shiftKey?-1:1);return}
    if(e.key==='ArrowDown'){e.preventDefault();moveSugg(1);return}
    if(e.key==='ArrowUp'){e.preventDefault();moveSugg(-1);return}
    if(e.key==='Escape'){e.preventDefault();closeSugg();return}
    if(e.key==='Enter'&&!e.shiftKey){
      const typed=I.value.trim().toLowerCase();
      const exact=sugg.items.some(c=>c.cmd===typed);
      if(sugg.idx>=0||!exact){
        e.preventDefault();
        const c=sugg.items[sugg.idx>=0?sugg.idx:0];
        applySugg(c);closeSugg();
        if(!c.args)send(I.value);
        return;
      }
    }
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(I.value)}
});

const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec,audioCtx,analyser,micStream,raf;
const micBtn=$('mic');
micBtn.innerHTML='<svg class="mic-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"></path></svg><div class="mic-line"><div class="mic-dots"><span></span><span></span><span></span><span></span><span></span></div></div>';

async function startMeter(){
  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:true});
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    analyser=audioCtx.createAnalyser();analyser.fftSize=256;
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
    const data=new Uint8Array(analyser.fftSize);
    const micLine=micBtn.querySelector('.mic-line');
    const tick=()=>{if(!analyser||!micLine)return;analyser.getByteTimeDomainData(data);
      let sum=0;for(const v of data){const x=(v-128)/128;sum+=x*x}
      const rms=Math.sqrt(sum/data.length);
      const scaleY=Math.max(1, Math.min(4, 1 + rms * 25));
      micLine.style.transform=`translate(-50%, -50%) scaleY(${scaleY})`;
      raf=requestAnimationFrame(tick)};
    tick();
  }catch(e){console.warn('Mikrofon-Pegel nicht verfügbar:',e)}
}
function stopMeter(){
  if(raf)cancelAnimationFrame(raf);raf=null;
  if(micStream)micStream.getTracks().forEach(t=>t.stop());micStream=null;
  if(audioCtx){audioCtx.close().catch(()=>{});audioCtx=null}analyser=null;
  const micLine=micBtn.querySelector('.mic-line');if(micLine)micLine.style.transform='translate(-50%, -50%) scaleY(1)';
}
micBtn.onclick=async()=>{
  if(!SR)return alert('Spracheingabe wird hier nicht unterstützt.');
  if(rec){rec.stop();return}
  try{
    await startMeter();
    rec=new SR();rec.lang='de-DE';rec.interimResults=true;rec.continuous=true;
    rec.onresult=e=>{I.value=[...e.results].map(r=>r[0].transcript).join('');autosize()};
    rec.onerror=e=>{if(e.error!=='no-speech')console.warn('Spracherkennung:',e.error)};
    rec.onend=()=>{rec=null;micBtn.classList.remove('on');stopMeter()};
    rec.start();micBtn.classList.add('on');
  }catch(e){stopMeter();rec=null;micBtn.classList.remove('on');alert('Mikrofon konnte nicht gestartet werden.')}
};

saveVars();
render();
initWebLLM();
