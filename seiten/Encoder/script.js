/*
--------------------------------
MARKER (Endung bestimmt den Modus)
--------------------------------
*/

const MARKERS = {
    plain: "::ENCZIP::",
    code:  "::ENCKEY::",
    time:  "::ENCTIME::"
};

/*
--------------------------------
256-BYTE MAPPING (unverändert, damit alte Texte weiter gehen)
--------------------------------
*/

const mapping=[];

for(let i=33;i<=126;i++){
    mapping.push(String.fromCharCode(i));
}

const extraChars = [
'€','‚','ƒ','„','…','†','‡','ˆ','‰','Š','‹','Œ',
'Ž','‘','’','“','”','•','–','—','˜','™','š',
'œ','ž','Ÿ','§','±','µ','¶','¿','¡','¢',
'£','¤','¥','¦','¨','©','ª','«','¬',
'®','¯','°','²','³','´','¸','¹',
'º','»','¼','½','¾','÷','×','∞',
'≈','≠','≤','≥','√','∆','∑','∏',
'◊','●','○','■','□','▲','▼',
'△','▽','☼','☻','☺','♥','♦','♣',
'♠','♪','♫','⚠','❌','✅','⭕',
'❗','❓','⚡','☢','☣','⚙'
];

mapping.push(...extraChars);

const emojiSet=[
'😀','😁','😂','🤣','😃','😄','😅','😆',
'😉','😊','😋','😎','😍','😘','🥰','😗',
'😙','😚','🙂','🤗','🤩','🤔','🤨','😐',
'😑','🙄','😏','😣','😥','😮','🤐','😯',
'😪','😫','🥱','😴','😌','🤓','🥳','😜',
'🤪','🧐','🤖','👾','👽','💀','👻','🔥',
'💎','⭐','🌙','🌟','✨','🌈','🌀','🎲',
'🎯','🎮','🧩','🔒','🔑','🛡','💾','📦',
'📁','📂','📄','🧠','🚀','🛰','💡','🔮',
'🎭','🎪','🧿','🪄','🛸','🌌','💫','🧬'
];

mapping.push(...emojiSet);

while(mapping.length < 256){
    mapping.push(String.fromCodePoint(
        0x1F300 + mapping.length
    ));
}

const byteToChar={};
const charToByte={};

for(let i=0;i<256;i++){
    byteToChar[i]=mapping[i];
    charToByte[mapping[i]]=i;
}

function bytesToSymbols(bytes){
    let result="";
    for(const b of bytes){
        result += byteToChar[b];
    }
    return result;
}

function symbolsToBytes(str){
    const chars=[...str];
    const bytes=new Uint8Array(chars.length);

    chars.forEach((char,index)=>{
        if(!(char in charToByte)){
            throw new Error("Unbekanntes Zeichen erkannt");
        }
        bytes[index]=charToByte[char];
    });

    return bytes;
}

function concatBytes(...parts){
    const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
    let o = 0;
    for(const p of parts){ out.set(p,o); o += p.length; }
    return out;
}

/*
--------------------------------
ZIP (Standard-Modus) + DEFLATE (Code-/Zeitmodus)
--------------------------------
*/

async function zipText(text){
    const zip = new JSZip();
    zip.file("data.txt",text);

    return await zip.generateAsync({
        type:"uint8array",
        compression:"DEFLATE",
        compressionOptions:{level:9}
    });
}

async function unzipText(bytes){
    const zip = await JSZip.loadAsync(bytes);
    const fileName = Object.keys(zip.files)[0];
    return await zip.files[fileName].async("string");
}

// Reines Deflate ohne ZIP-Kopf: keine erkennbare Struktur ("PK...", "data.txt")
async function deflate(bytes){
    const stream = new Blob([bytes]).stream()
        .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes){
    const stream = new Blob([bytes]).stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function requireCrypto(){
    if(!window.crypto || !crypto.subtle){
        throw new Error("Web Crypto nicht verfügbar (Seite über https öffnen)");
    }
    if(typeof CompressionStream === "undefined"){
        throw new Error("Browser zu alt (CompressionStream fehlt)");
    }
}

/*
--------------------------------
CODE -> ZAHL
Jedes Zeichen ist eine Ziffer in einem eigenen Zahlensystem
(wie Hexadezimal, nur mit 104 statt 16 Ziffern).
Bijektiv gezählt (Ziffern 1..104), damit "0a" und "a" verschiedene Zahlen sind.
--------------------------------
*/

let CODE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
for(let i=33;i<=126;i++){
    const c = String.fromCharCode(i);
    if(!CODE_ALPHABET.includes(c)) CODE_ALPHABET += c;
}
CODE_ALPHABET += "äöüÄÖÜß€§°";

const CODE_BASE  = BigInt(CODE_ALPHABET.length);   // 104
const BITS_PER_CHAR = Math.log2(CODE_ALPHABET.length);
const CODE_MAX   = 100;

function normalizeCode(code){
    return code.normalize("NFC");
}

function invalidCodeChars(code){
    return [...new Set([...code].filter(c => !CODE_ALPHABET.includes(c)))];
}

function codeToNumber(code){
    let v = 0n;
    for(const ch of code){
        v = v * CODE_BASE + BigInt(CODE_ALPHABET.indexOf(ch) + 1);
    }
    return v;
}

function numberToBytes(v){
    let hex = v.toString(16);
    if(hex.length % 2) hex = "0" + hex;
    const out = new Uint8Array(hex.length / 2);
    for(let i=0;i<out.length;i++){
        out[i] = parseInt(hex.substr(i*2,2),16);
    }
    return out;
}

function checkCode(code){
    if(!code) throw new Error("Bitte Code eingeben");
    if([...code].length > CODE_MAX) throw new Error("Code ist länger als 100 Zeichen");
    const bad = invalidCodeChars(code);
    if(bad.length) throw new Error("Nicht erlaubte Zeichen im Code: " + bad.join(" "));
}

/*
--------------------------------
MODUS "MIT CODE"
AES-256-CTR ohne Prüfsumme: ein falscher Code liefert Zeichensalat,
keine Fehlermeldung.
Schlüssel: PBKDF2-SHA256, 600.000 Runden (bremst Durchprobieren).
Format: salt(16) | counter(16) | ciphertext
--------------------------------
*/

const PBKDF2_ROUNDS = 600000;

async function codeKey(code,salt){
    const base = await crypto.subtle.importKey(
        "raw", numberToBytes(codeToNumber(code)), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {name:"PBKDF2", salt, iterations:PBKDF2_ROUNDS, hash:"SHA-256"},
        base,
        {name:"AES-CTR", length:256},
        false,
        ["encrypt","decrypt"]
    );
}

async function encryptWithCode(text,code){
    requireCrypto();
    checkCode(code);

    const salt    = crypto.getRandomValues(new Uint8Array(16));
    const counter = crypto.getRandomValues(new Uint8Array(16));
    counter.fill(0,12);   // letzte 4 Bytes zählen hoch

    const key = await codeKey(code,salt);
    const ct  = new Uint8Array(await crypto.subtle.encrypt(
        {name:"AES-CTR", counter, length:32}, key, await deflate(enc.encode(text))
    ));

    return concatBytes(salt,counter,ct);
}

// Zeichensalat aus den (falsch) entschlüsselten Bytes, immer gleich für denselben falschen Code
const NOISE = "abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:!?-";

function noiseText(bytes){
    let s = "";
    for(const b of bytes) s += NOISE[b % NOISE.length];
    return s;
}

async function decryptWithCode(bytes,code){
    requireCrypto();
    checkCode(code);

    if(bytes.length < 33) return noiseText(bytes);

    const salt    = bytes.slice(0,16);
    const counter = bytes.slice(16,32);
    const ct      = bytes.slice(32);

    const key   = await codeKey(code,salt);
    const plain = new Uint8Array(await crypto.subtle.decrypt(
        {name:"AES-CTR", counter, length:32}, key, ct
    ));

    try{
        return dec.decode(await inflate(plain));
    }catch(e){
        return noiseText(plain);
    }
}

/*
--------------------------------
MODUS "ZEITLICH"
Schlüssel = SHA-256 aus dem Ablauf-Datum (volle Stunde, UTC).
Der Ablaufzeitpunkt steht NICHT in der Nachricht; beim Öffnen
werden alle noch gültigen Stunden (max. 30 Tage) durchprobiert.
Format: iv(12) | ciphertext (AES-GCM)
--------------------------------
*/

const HOUR      = 3600000;
const MIN15     = 15 * 60000;
const MAX_HOURS = 24 * 30;

const pad = n => String(n).padStart(2,"0");
const floorHour = ms => Math.floor(ms / HOUR) * HOUR;
const ceilHour  = ms => Math.ceil(ms / HOUR) * HOUR;

// Standard: volle Stunde + 1; bleiben nur 15 Min oder weniger -> noch +1 Stunde
function expiryAuto(now){
    let expiry = floorHour(now) + HOUR;
    if(expiry - now <= MIN15) expiry += HOUR;
    return expiry;
}

function hourStamp(ms){
    const d = new Date(ms);
    return d.getUTCFullYear() + "-" +
           pad(d.getUTCMonth()+1) + "-" +
           pad(d.getUTCDate()) + "T" +
           pad(d.getUTCHours());
}

// Datum -> Code -> Schlüssel
async function timeKey(expiry){
    const digest = await crypto.subtle.digest(
        "SHA-256", enc.encode("TEXT-ENCODER-TIME:" + hourStamp(expiry))
    );
    return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt","decrypt"]);
}

function chosenExpiry(now){
    const v = durationEl.value;
    let expiry;

    if(v === "auto"){
        return expiryAuto(now);
    }
    else if(v === "custom"){
        if(!customEl.value) throw new Error("Bitte einen Zeitpunkt wählen");
        const t = new Date(customEl.value).getTime();
        if(isNaN(t)) throw new Error("Ungültiger Zeitpunkt");
        expiry = ceilHour(t);
    }
    else{
        expiry = ceilHour(now + Number(v) * HOUR);
    }

    if(expiry - now <= MIN15){
        throw new Error("Zeitpunkt muss mindestens 15 Minuten in der Zukunft liegen");
    }
    if(expiry > floorHour(now) + (MAX_HOURS + 1) * HOUR){
        throw new Error("Maximal 30 Tage");
    }
    return expiry;
}

async function encryptTime(text,expiry){
    requireCrypto();
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const key = await timeKey(expiry);
    const ct  = new Uint8Array(await crypto.subtle.encrypt(
        {name:"AES-GCM", iv}, key, await deflate(enc.encode(text))
    ));
    return concatBytes(iv,ct);
}

async function decryptTime(bytes){
    requireCrypto();
    if(bytes.length < 29) throw new Error("Daten unvollständig");

    const iv  = bytes.slice(0,12);
    const ct  = bytes.slice(12);
    const now = Date.now();
    const base = floorHour(now);

    for(let h=1; h<=MAX_HOURS+1; h++){
        const expiry = base + h * HOUR;
        if(expiry <= now) continue;
        try{
            const key   = await timeKey(expiry);
            const plain = new Uint8Array(await crypto.subtle.decrypt(
                {name:"AES-GCM", iv}, key, ct
            ));
            return {text: dec.decode(await inflate(plain)), expiry};
        }catch(e){ /* nächste Stunde */ }
    }

    throw new Error("Abgelaufen oder ungültig");
}

function formatTime(ms){
    const d = new Date(ms);
    const time = d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
        ? time + " Uhr"
        : d.toLocaleDateString("de-DE") + ", " + time + " Uhr";
}

function formatRemaining(ms){
    const min = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    if(d) return `${d} Tg ${h} Std`;
    return h ? `${h} Std ${m} Min` : `${m} Min`;
}

/*
--------------------------------
UI
--------------------------------
*/

const inputEl    = document.getElementById("input");
const outputEl   = document.getElementById("output");
const codeEl     = document.getElementById("code");
const codeWrap   = document.getElementById("codeWrap");
const codeMeter  = document.getElementById("codeMeter");
const toggleBtn  = document.getElementById("toggleCode");
const eyeOpen    = document.getElementById("eyeOpen");
const eyeClosed  = document.getElementById("eyeClosed");
const timeWrap   = document.getElementById("timeWrap");
const durationEl = document.getElementById("duration");
const customEl   = document.getElementById("customTime");
const statusEl   = document.getElementById("status");
const modeInfo   = document.getElementById("modeInfo");
const runBtn     = document.getElementById("runBtn");
const tabs       = document.querySelectorAll(".tab");

let mode = "plain";

function setStatus(text,isError=false){
    statusEl.textContent = text;
    statusEl.className = "text-sm mt-3 min-h-5 " +
        (isError ? "text-red-400" : "text-zinc-400");
}

function toLocalInput(ms){
    const d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) +
           "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function updateModeInfo(){
    if(mode === "plain"){
        modeInfo.textContent = "Komprimiert und in Symbole umgewandelt. Jeder mit dieser Seite kann es lesen.";
    }
    else if(mode === "code"){
        modeInfo.textContent = "Nur mit dem richtigen Code lesbar. Ein falscher Code ergibt Zeichensalat, keine Fehlermeldung.";
    }
    else{
        const now = Date.now();
        customEl.min = toLocalInput(now + MIN15);
        customEl.max = toLocalInput(floorHour(now) + MAX_HOURS * HOUR);
        try{
            const exp = chosenExpiry(now);
            modeInfo.textContent =
                "Gültig bis " + formatTime(exp) +
                " (noch " + formatRemaining(exp - now) + "). Danach lässt es sich hier nicht mehr öffnen.";
        }catch(e){
            modeInfo.textContent = e.message;
        }
    }
}

function updateCodeMeter(){
    const code = normalizeCode(codeEl.value);
    const len  = [...code].length;

    if(!len){
        codeMeter.textContent = "Erlaubt: 0–9, a–z, A–Z, alle Sonderzeichen der Tastatur und äöüß€§°";
        codeMeter.className = "text-sm mt-2 text-zinc-500 min-h-5";
        return;
    }

    const bad = invalidCodeChars(code);
    if(bad.length){
        codeMeter.textContent = "Nicht erlaubt: " + bad.join(" ");
        codeMeter.className = "text-sm mt-2 text-red-400 min-h-5";
        return;
    }

    const bits = Math.round(len * BITS_PER_CHAR);
    let label, color;
    if(bits < 60)       { label = "schwach";    color = "text-red-400"; }
    else if(bits < 100) { label = "ordentlich"; color = "text-yellow-400"; }
    else                { label = "stark";      color = "text-emerald-400"; }

    codeMeter.textContent =
        `${len}/${CODE_MAX} Zeichen · Basis ${CODE_ALPHABET.length} · ca. ${bits} Bit (bei Zufallszeichen) · ${label}`;
    codeMeter.className = "text-sm mt-2 min-h-5 " + color;
}

function setMode(newMode){
    mode = newMode;

    tabs.forEach(t =>
        t.classList.toggle("active", t.dataset.mode === mode)
    );

    codeWrap.classList.toggle("hidden", mode !== "code");
    timeWrap.classList.toggle("hidden", mode !== "time");

    updateModeInfo();
}

tabs.forEach(t =>
    t.addEventListener("click", () => setMode(t.dataset.mode))
);

toggleBtn.addEventListener("click", () => {
    const show = codeEl.type === "password";
    codeEl.type = show ? "text" : "password";
    eyeOpen.classList.toggle("hidden", show);
    eyeClosed.classList.toggle("hidden", !show);
    toggleBtn.setAttribute("aria-label", show ? "Code verbergen" : "Code anzeigen");
});

codeEl.addEventListener("input", updateCodeMeter);

durationEl.addEventListener("change", () => {
    const custom = durationEl.value === "custom";
    customEl.classList.toggle("hidden", !custom);
    if(custom && !customEl.value){
        customEl.value = toLocalInput(ceilHour(Date.now() + 2 * HOUR));
    }
    updateModeInfo();
});

customEl.addEventListener("input", updateModeInfo);

setInterval(() => {
    if(mode === "time") updateModeInfo();
}, 10000);

updateCodeMeter();
setMode("plain");

/*
--------------------------------
AUSFÜHREN (Entschlüsseln wird automatisch erkannt)
--------------------------------
*/

runBtn.addEventListener("click", async ()=>{

    const input = inputEl.value.trim();
    if(!input) return;

    const code = normalizeCode(codeEl.value);

    runBtn.disabled = true;
    setStatus("Arbeite...");

    try{

        const detected = Object.entries(MARKERS)
            .find(([,marker]) => input.endsWith(marker));

        let result;

        if(detected){

            const [type, marker] = detected;
            const bytes = symbolsToBytes(input.slice(0, -marker.length));

            if(type === "plain"){
                result = await unzipText(bytes);
                setStatus("Entschlüsselt (Standard)");
            }
            else if(type === "code"){
                setMode("code");
                result = await decryptWithCode(bytes, code);
                setStatus("Entschlüsselt");
            }
            else{
                setMode("time");
                const r = await decryptTime(bytes);
                result = r.text;
                setStatus("Entschlüsselt – Nachricht gültig bis " + formatTime(r.expiry));
            }
        }
        else{

            if(mode === "plain"){
                result = bytesToSymbols(await zipText(input)) + MARKERS.plain;
                setStatus("Verschlüsselt (Standard)");
            }
            else if(mode === "code"){
                result = bytesToSymbols(await encryptWithCode(input, code)) + MARKERS.code;
                setStatus("Verschlüsselt – nur mit diesem Code lesbar");
            }
            else{
                const expiry = chosenExpiry(Date.now());
                result = bytesToSymbols(await encryptTime(input, expiry)) + MARKERS.time;
                setStatus("Verschlüsselt – gültig bis " + formatTime(expiry));
            }
        }

        outputEl.value = result;

    }
    catch(error){
        outputEl.value = "";
        setStatus("Fehler: " + error.message, true);
    }
    finally{
        runBtn.disabled = false;
    }

});

/*
--------------------------------
COPY
--------------------------------
*/

document.getElementById("copyBtn")
.addEventListener("click", async ()=>{

    const value = outputEl.value;
    if(!value) return;

    await navigator.clipboard.writeText(value);

    const btn = document.getElementById("copyBtn");
    const oldText = btn.textContent;

    btn.textContent="Kopiert";

    setTimeout(()=>{
        btn.textContent=oldText;
    },1500);

});
