"use strict";
/* ---------- Grafik-Presets ---------- */
const HAS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if(HAS_TOUCH) document.body.classList.add('has-touch');
const DPR = window.devicePixelRatio || 1;
const PBASE = { hudEvery:1, fuji:false, botLabels:true, flat:ROAD_W/2+5, sink:.5 };
const PRESETS = {
  // Potato = die bisherige Grafik
  potato: Object.assign({}, PBASE, { label:'Potato', hq:false, pr:Math.min(DPR, HAS_TOUCH?1.5:1.75), seg:300, trees:4200, buildings:300, fog:[300,1500], far:4200, shadows:0, bloom:false, grass:0, clouds:0, rocks:0, rails:false, lamps:false, fx:60, skid:false, aniso:4, carSeg:0, lod:0, dyn:false }),
  normal: Object.assign({}, PBASE, { label:'Normal', hq:true, pr:Math.min(DPR, 1.5), seg:340, trees:6000, buildings:340, fog:[380,2100], far:4200, shadows:2048, shadowR:60, bloom:false, grass:HAS_TOUCH?4000:9000, grassS:64, clouds:36, rocks:150, rails:true, lamps:true, fx:160, skid:true, aniso:8, carSeg:1, lod:60, dyn:true }),
  ultra:  Object.assign({}, PBASE, { label:'Ultra', hq:true, pr:Math.min(DPR*1.3, 2.4), seg:480, trees:13000, buildings:520, fog:[600,3200], far:6500, shadows:8192, shadowR:120, bloom:true, grass:36000, grassS:120, clouds:90, rocks:520, rails:true, lamps:true, fx:520, skid:true, aniso:16, carSeg:2, lod:180, dyn:true, leaves:1100, post:true, solas:true }),
};
// Eigene Grafik: alle Regler einzeln (im Menü unter Grafik → Eigene → Anpassen)
const CUSTOM_DEF={ res:1.3, shadows:4096, trees:8000, grass:16000, leaves:1100, clouds:56, fx:360, buildings:380, view:'mittel', seg:400, bloom:1, post:1, solas:1, dyn:1 };
function customCfg(){ return Object.assign({}, CUSTOM_DEF, store.get('gfxc',{})); }
function buildCustom(){ const c=customCfg(), V={nah:[[300,1500],3600], mittel:[[450,2400],5000], weit:[[600,3200],6500]}[c.view]||[[450,2400],5000];
  return Object.assign({}, PRESETS.ultra, { label:'Eigene', pr:Math.min(DPR*c.res,2.6), shadows:c.shadows, shadowR:c.shadows>=8192?120:c.shadows>=4096?85:60, trees:c.trees, grass:c.grass, grassS:c.grass>20000?120:92,
    leaves:c.leaves, clouds:c.clouds, fx:c.fx, buildings:c.buildings, fog:V[0], far:V[1], seg:c.seg, bloom:!!(c.bloom||c.post||c.solas), bloomOn:!!c.bloom, post:!!c.post, solas:!!c.solas, dyn:!!c.dyn, rocks:Math.round(c.trees/25), lod:c.trees>10000?180:120 }); }
PRESETS.custom=buildCustom();
let activeGfx = PRESETS[cfg.gfx] ? cfg.gfx : 'normal';
const gfxKey=()=>activeGfx==='custom'?'custom'+JSON.stringify(customCfg()):activeGfx;
const GP = () => PRESETS[activeGfx];
const HQ = () => GP().hq;

/* ---------- Renderer (passt sich jedem Seitenverhältnis an) ---------- */
const renderer = new THREE.WebGLRenderer({ canvas:$('#gl'), antialias: !HAS_TOUCH || activeGfx!=='potato', powerPreference:'high-performance', stencil:false });
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const MAXANISO = renderer.capabilities.getMaxAnisotropy();
const camera = new THREE.PerspectiveCamera(65, 1, 0.3, 3200);
let composer=null, renderPass=null, bloomPass=null, gradePass=null;
const DYN={ acc:0, n:0, scale:1 };
const _v2=new THREE.Vector2();
function viewSize(){ const vv=window.visualViewport; return [Math.round(vv?vv.width:innerWidth), Math.round(vv?vv.height:innerHeight)]; }
function resize(){ const [w,h]=viewSize(); renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); if(composer){ composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w,h); } }
function fitFov(v, aspect){ const ref=1.45; if(aspect>=ref) return v; const hf=2*Math.atan(Math.tan(v*Math.PI/360)*ref); return Math.min(108, 2*Math.atan(Math.tan(hf/2)/aspect)*180/Math.PI); }
// Farben: in den HQ-Presets wird linear gerechnet
const C = hex => { const c=new THREE.Color(hex); if(HQ()) c.convertSRGBToLinear(); return c; };
const _c1=new THREE.Color(), _c2=new THREE.Color(), _c3=new THREE.Color();
const GradeShader = { uniforms:{ tDiffuse:{value:null}, tDepth:{value:null}, sat:{value:1.08}, ultra:{value:0}, solas:{value:0}, speed:{value:0}, time:{value:0}, sun:{value:new THREE.Vector2(.5,.5)}, sunVis:{value:0},
    sunView:{value:new THREE.Vector3(0,1,0)}, sunCol:{value:new THREE.Color(1,.85,.6)}, day:{value:1}, near:{value:.3}, far:{value:5000}, invProj:{value:new THREE.Matrix4()}, aspect:{value:1.7} },
  vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:`uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform float sat, ultra, solas, speed, time, sunVis, day, near, far, aspect; uniform vec2 sun; uniform vec3 sunView, sunCol; uniform mat4 invProj; varying vec2 vUv;
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1.0/2.4))-0.055, step(vec3(0.0031308),c)); }
    vec3 T(vec2 p){ return clamp(texture2D(tDiffuse,p).rgb, 0.0, 16.0); }      // HDR begrenzen (sonst schwarze Sonne durch Überlauf)
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    float linZ(vec2 p){ float d=texture2D(tDepth,p).x; return (near*far)/(far-d*(far-near)); }
    void main(){ vec2 uv=vUv; vec3 c;
      if(ultra>.5){
        vec2 d=uv-.5; float r=length(d); float bl=speed*smoothstep(.12,.75,r)*.05; float ca=.0012+.0035*speed*r;
        vec3 acc=vec3(0.0); for(int i=0;i<10;i++){ float t=float(i)/9.0; vec2 o=d*bl*t; acc.r+=T(uv-o-d*ca).r; acc.g+=T(uv-o).g; acc.b+=T(uv-o+d*ca).b; } c=acc/10.0;
        if(sunVis>0.01){ vec2 dv=uv-sun; vec3 rays=vec3(0.0); vec2 p=uv; float w=1.0; for(int i=0;i<32;i++){ p-=dv*.028; vec3 sc=T(p); float b=smoothstep(.75,1.4,dot(sc,vec3(.2126,.7152,.0722))); rays+=sc*b*w; w*=.95; } c+=rays*.05*sunVis; }
        vec2 px=vec2(1.0)/vec2(1920.0,1080.0); vec3 bln=(T(uv+vec2(px.x,0))+T(uv-vec2(px.x,0))+T(uv+vec2(0,px.y))+T(uv-vec2(0,px.y)))*.25; c+=(c-bln)*.18;
      } else c=T(uv);
      if(solas>.5){
        // Solas-Look: Umgebungsverdeckung (AO) aus der Tiefe, Licht-Streuung in der Luft, Linsenreflexe, warme Farben
        float z=linZ(uv); float ao=0.0; float rad=clamp(14.0/z,.002,.03);
        for(int i=0;i<8;i++){ float a=float(i)*.785+hash(uv*731.0)*.8; vec2 o=vec2(cos(a),sin(a)*aspect)*rad*(.5+.5*float(i)/8.0); float dz=z-linZ(uv+o); ao+=smoothstep(.15,1.2,dz)*(1.0-smoothstep(3.0,9.0,dz)); }
        c*=1.0-ao/8.0*.55*(1.0-smoothstep(150.0,400.0,z));
        vec4 pv=invProj*vec4(uv*2.0-1.0,1.0,1.0); vec3 vd=normalize(pv.xyz/pv.w); float mu=max(dot(vd,sunView),0.0);
        float fogA=1.0-exp(-z*.00075); float ph=pow(mu,10.0)*1.4+pow(mu,2.0)*.25;
        c=mix(c, sunCol*(.6+ph*1.6), clamp(fogA*(.10+ph*.4)*day,0.0,.6));
        if(sunVis>0.01){ vec2 axis=vec2(.5)-sun; vec2 q=(uv-sun)*vec2(aspect,1.0); c+=sunCol*exp(-dot(q,q)*90.0)*.35*sunVis;
          for(int k=1;k<5;k++){ float t=float(k)*.42; vec2 gp=sun+axis*t*2.0; vec2 g=(uv-gp)*vec2(aspect,1.0); float rr=.015+.02*float(k); c+=mix(vec3(1.0,.6,.3),vec3(.4,.7,1.0),float(k)/4.0)*smoothstep(rr,rr*.55,length(g))*.06*sunVis; } }
        c*=mix(vec3(1.0),vec3(1.06,1.0,.92),day);
      }
      c=clamp(c,0.0,1.0); float l=dot(c,vec3(.2126,.7152,.0722)); c=clamp(mix(vec3(l),c,sat+solas*.06),0.0,1.0);
      if(ultra>.5){ float v=length(vUv-.5)*1.3; c*=1.0-.22*pow(v,2.4); c=mix(c, c*c*(3.0-2.0*c), .12); c+=(hash(vUv*vec2(1920.0,1080.0)+fract(time))-.5)*.006; }
      gl_FragColor=vec4(toSRGB(clamp(c,0.0,1.0)),1.0); }` };
function setupComposer(){
  if(composer){ try{ composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }catch(e){} }
  composer=null; renderPass=null; bloomPass=null; gradePass=null;
  const P=GP(); if(!P.bloom || !THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.RenderPass || !THREE.ShaderPass) return;
  try{
    const [w,h]=viewSize(), pr=renderer.getPixelRatio(), ext=renderer.extensions, wgl2=renderer.capabilities.isWebGL2;
    const half = wgl2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    const opt={ minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat, type: half?THREE.HalfFloatType:THREE.UnsignedByteType };
    const rt = (wgl2 && THREE.WebGLMultisampleRenderTarget && !P.solas) ? new THREE.WebGLMultisampleRenderTarget(w*pr,h*pr,opt) : new THREE.WebGLRenderTarget(w*pr,h*pr,opt);
    if(P.solas){ rt.depthTexture=new THREE.DepthTexture(); rt.depthTexture.type=THREE.UnsignedIntType; }
    composer=new THREE.EffectComposer(renderer, rt); composer.setPixelRatio(pr); composer.setSize(w,h);
    renderPass=new THREE.RenderPass(show.scene, camera); composer.addPass(renderPass);
    if(P.bloomOn!==false) bloomPass=new THREE.UnrealBloomPass(new THREE.Vector2(w,h), activeGfx==='ultra'?.42:.32, activeGfx==='ultra'?.6:.5, activeGfx==='ultra'?.82:.86); if(bloomPass) composer.addPass(bloomPass);
    gradePass=new THREE.ShaderPass(GradeShader); gradePass.uniforms.ultra.value=P.post?1:0; gradePass.uniforms.solas.value=P.solas?1:0; composer.addPass(gradePass);
  }catch(e){ console.warn('Bloom deaktiviert', e); composer=null; }
}
function draw(scene, cam){ if(composer){ if(gradePass && gradePass.uniforms.solas.value){ const U=gradePass.uniforms; U.tDepth.value=composer.readBuffer.depthTexture; U.near.value=cam.near; U.far.value=cam.far; U.invProj.value.copy(cam.projectionMatrixInverse); U.aspect.value=cam.aspect; } renderPass.scene=scene; renderPass.camera=cam; composer.render(); } else renderer.render(scene, cam); }
// Dynamische Auflösung: hält die Bildrate in Normal/Ultra stabil
function dynRes(dt){ const P=GP(); if(!P.dyn) return; DYN.acc+=dt; DYN.n++; if(DYN.acc<1.5) return; const fps=DYN.n/DYN.acc; DYN.acc=0; DYN.n=0;
  let s=DYN.scale; if(fps<44) s*=.85; else if(fps<54) s*=.94; else if(fps>58.5) s*=1.05; s=clamp(s,.5,1);
  if(Math.abs(s-DYN.scale)>.015){ DYN.scale=s; renderer.setPixelRatio(P.pr*s); resize(); } }
function applyGfx(){
  PRESETS.custom=buildCustom();
  activeGfx = PRESETS[cfg.gfx] ? cfg.gfx : 'normal'; const P=GP();
  DYN.scale=1; DYN.acc=0; DYN.n=0;
  renderer.setPixelRatio(P.pr);
  renderer.outputEncoding = P.hq ? THREE.sRGBEncoding : THREE.LinearEncoding;
  renderer.toneMapping = P.hq ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = P.shadows>0;
  camera.far = P.far; camera.updateProjectionMatrix();
  M=null; paintCache.clear(); carTemplates.clear(); wheelCache.clear(); matCache.clear(); packTpl.clear();
  buildTextures(); buildShowroom(); setupComposer(); resize();
}
addEventListener('resize', resize);
addEventListener('orientationchange', ()=>setTimeout(resize,250));
if(window.visualViewport) visualViewport.addEventListener('resize', resize);
document.addEventListener('gesturestart', e=>e.preventDefault());
document.addEventListener('dblclick', e=>e.preventDefault());

/* ---------- Texturen (prozedural) ---------- */
const TEX={};
function rng(seed){ let s=(seed>>>0)||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
function tileNoise(n, cells, seed){ const R=rng(seed*9973+7), g=new Float32Array(cells*cells); for(let i=0;i<g.length;i++) g[i]=R(); const out=new Float32Array(n*n);
  for(let y=0;y<n;y++){ const fy=y/n*cells, y0=Math.floor(fy), ty=fy-y0, sy=ty*ty*(3-2*ty), y1=(y0+1)%cells;
    for(let x=0;x<n;x++){ const fx=x/n*cells, x0=Math.floor(fx), tx=fx-x0, sx=tx*tx*(3-2*tx), x1=(x0+1)%cells;
      const a=g[y0*cells+x0], b=g[y0*cells+x1], c=g[y1*cells+x0], d=g[y1*cells+x1]; out[y*n+x]=a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy; } } return out; }
function fbm(n, base, oct, seed){ const out=new Float32Array(n*n); let amp=1, tot=0; for(let o=0;o<oct;o++){ const t=tileNoise(n, Math.min(n, base<<o), seed+o*31); for(let i=0;i<out.length;i++) out[i]+=t[i]*amp; tot+=amp; amp*=.5; } for(let i=0;i<out.length;i++) out[i]/=tot; return out; }
function canvasTex(w,h,draw,srgb=true){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; if(srgb && HQ()) t.encoding=THREE.sRGBEncoding; t.anisotropy=Math.min(GP().aniso, MAXANISO); return t; }
function imgTex(n, fn, srgb=true){ return canvasTex(n,n,g=>{ const img=g.createImageData(n,n), d=img.data; for(let y=0;y<n;y++) for(let x=0;x<n;x++){ const i=(y*n+x)*4, c=fn(x,y); d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=c.length>3?c[3]:255; } g.putImageData(img,0,0); }, srgb); }
function normalTex(h, n, str){ return imgTex(n,(x,y)=>{ const l=h[y*n+(x-1+n)%n], r=h[y*n+(x+1)%n], u=h[((y-1+n)%n)*n+x], d=h[((y+1)%n)*n+x]; const nx=(l-r)*str, ny=(d-u)*str, L=Math.hypot(nx,ny,1); return [(nx/L*.5+.5)*255,(ny/L*.5+.5)*255,(1/L*.5+.5)*255]; }, false); }
function buildTextures(){
  Object.values(TEX).forEach(t=>{ try{ t.dispose(); }catch(e){} });
  const A=512, an=fbm(A,8,5,11), an2=tileNoise(A,96,5), R=rng(3);
  TEX.asphalt = canvasTex(A,A,(g,w,h)=>{ const img=g.createImageData(w,h), d=img.data;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=(y*w+x)*4, u=x/w;
      const wear=Math.exp(-((u-.19)**2)/.0025)+Math.exp(-((u-.31)**2)/.0025)+Math.exp(-((u-.69)**2)/.0025)+Math.exp(-((u-.81)**2)/.0025);
      const v=60+(an[y*w+x]-.5)*30+(an2[y*w+x]-.5)*12+(R()-.5)*18-wear*8; d[i]=v; d[i+1]=v*1.01; d[i+2]=v*1.05; d[i+3]=255; }
    g.putImageData(img,0,0);
    g.fillStyle='rgba(236,236,236,.92)'; g.fillRect(17,0,6,h); g.fillRect(w-23,0,6,h);
    g.fillStyle='rgba(240,240,240,.9)'; g.fillRect(w/2-3,0,6,h*.375); g.fillRect(w/2-3,h*.5,6,h*.375);
    for(let k=0;k<1600;k++){ g.fillStyle=`rgba(55,57,61,${Math.random()*.55})`; g.fillRect(Math.random()*w, Math.random()*h, 2, 2); }
    g.strokeStyle='rgba(30,31,34,.5)'; g.lineWidth=1.2; for(let k=0;k<6;k++){ g.beginPath(); let x=Math.random()*w, y=Math.random()*h; g.moveTo(x,y); for(let s=0;s<8;s++){ x+=(Math.random()-.5)*40; y+=Math.random()*30; g.lineTo(x,y); } g.stroke(); } });
  TEX.asphaltPlain = canvasTex(A,A,(g,w,h)=>{ const img=g.createImageData(w,h), d=img.data; for(let i=0;i<w*h;i++){ const v=60+(an[i]-.5)*30+(an2[i]-.5)*12+(R()-.5)*18-3; d[i*4]=v; d[i*4+1]=v*1.01; d[i*4+2]=v*1.05; d[i*4+3]=255; } g.putImageData(img,0,0); });
  TEX.asphaltN = normalTex(fbm(256,16,3,21),256,3.2);
  TEX.curb = canvasTex(64,128,(g,w,h)=>{ g.fillStyle='#d42424'; g.fillRect(0,0,w,h/2); g.fillStyle='#f4f4f4'; g.fillRect(0,h/2,w,h/2); });
  TEX.check = canvasTex(64,16,g=>{ for(let x=0;x<16;x++) for(let y=0;y<4;y++){ g.fillStyle=(x+y)%2?'#111':'#fff'; g.fillRect(x*4,y*4,4,4);} }); TEX.check.magFilter=THREE.NearestFilter;
  // Fenster: Tagsüber spiegelndes Glas mit Rahmen, nachts leuchtet nur ein Teil (Emissive-Map)
  const lit=[...Array(26*16)].map(()=>Math.random()<.42), wtx=(night)=>canvasTex(128,256,(g,w,h)=>{ g.fillStyle=night?'#000':'#2a3038'; g.fillRect(0,0,w,h); let k=0;
    for(let y=6;y<h;y+=10) for(let x=4;x<w;x+=8){ const L=lit[k++]; if(night){ if(L){ g.fillStyle=`hsl(${34+Math.random()*22},${55+Math.random()*30}%,${55+Math.random()*25}%)`; g.fillRect(x,y,6,7); } }
      else { const v=30+Math.random()*22; g.fillStyle=`hsl(208,${18+Math.random()*12}%,${v}%)`; g.fillRect(x,y,6,7); g.fillStyle='rgba(255,255,255,.18)'; g.fillRect(x,y,6,2); } }
    if(!night){ g.fillStyle='rgba(200,205,210,.35)'; for(let y=4;y<h;y+=10) g.fillRect(0,y,w,1); } });
  TEX.win=wtx(false); TEX.winL=wtx(true);
  // Wohnhaus-Fassade: Putz, Holzbalken, Fenster mit Shoji-Gitter, Sockel
  TEX.house = canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#f4f1ea'; g.fillRect(0,0,w,h); g.fillStyle='rgba(0,0,0,.05)'; for(let i=0;i<300;i++) g.fillRect(Math.random()*w,Math.random()*h,2,2);
    g.fillStyle='#6b4a32'; g.fillRect(0,0,6,h); g.fillRect(w-6,0,6,h); g.fillRect(0,0,w,5); g.fillRect(0,h-22,w,4); g.fillStyle='#8a8f96'; g.fillRect(0,h-18,w,18);
    for(const x0 of [14,74]){ g.fillStyle='#5a4030'; g.fillRect(x0-3,30,46,52); g.fillStyle='#2c3a48'; g.fillRect(x0,33,40,46); g.fillStyle='rgba(255,255,255,.25)'; g.fillRect(x0,33,40,12);
      g.fillStyle='#e9e2cf'; for(let i=1;i<4;i++) g.fillRect(x0+i*10-1,33,2,46); for(let j=1;j<3;j++) g.fillRect(x0,33+j*15,40,2); } });
  const gn=fbm(512,8,6,77), gf=tileNoise(512,128,9);
  TEX.ground = imgTex(512,(x,y)=>{ const v=clamp(175+gn[y*512+x]*70+(gf[y*512+x]-.5)*30+(Math.random()-.5)*14,0,255); return [v,v,v]; });
  TEX.groundN = normalTex(fbm(256,8,5,41),256,5);
  const wh=new Float32Array(256*256), waves=[[1,2,.5],[3,-1,.35],[-2,5,.25],[6,3,.15],[-7,-4,.1],[11,2,.07],[4,13,.05]];
  for(let y=0;y<256;y++) for(let x=0;x<256;x++){ let s=0; for(const [a,b,m] of waves) s+=Math.sin(2*Math.PI*(a*x+b*y)/256+a*1.3)*m; wh[y*256+x]=s; }
  TEX.waterN = normalTex(wh,256,1.6);
  TEX.smoke = canvasTex(64,64,g=>{ const gr=g.createRadialGradient(32,32,2,32,32,31); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.45,'rgba(255,255,255,.55)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); }, false);
  TEX.cloud = canvasTex(256,256,g=>{ for(let i=0;i<26;i++){ const r=rnd(28,70), x=128+rnd(-72,72), y=140+rnd(-28,28)-(r-28)*.45; const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,'rgba(255,255,255,.55)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,256,256); } }, false);
  TEX.blob = canvasTex(64,64,g=>{ const gr=g.createRadialGradient(32,32,4,32,32,32); gr.addColorStop(0,'rgba(0,0,0,.85)'); gr.addColorStop(.6,'rgba(0,0,0,.45)'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); }, false);
  TEX.plate = canvasTex(256,128,(g,w,h)=>{ g.fillStyle='#f4f6f2'; g.fillRect(0,0,w,h); g.strokeStyle='#2f6b3a'; g.lineWidth=8; g.strokeRect(4,4,w-8,h-8); g.fillStyle='#2f6b3a'; g.textAlign='center'; g.font='bold 30px Arial'; g.fillText('TOKYO 330',w/2,42); g.font='bold 64px Arial'; g.fillText('86-86',w/2+10,108); });
  TEX.plate.wrapS=TEX.plate.wrapT=THREE.ClampToEdgeWrapping;
}

/* ---------- Materialien & Geometrie-Helfer ---------- */
function smat(o){ return new THREE.MeshStandardMaterial(o); }
const matCache=new Map();
function mat(c, o={}){ const k=activeGfx+c+JSON.stringify(o); let m=matCache.get(k); if(!m){ m=new THREE.MeshStandardMaterial(Object.assign({color:C(c), roughness:.5, metalness:.1}, o)); matCache.set(k,m); } return m; }
const basic = (c,o={}) => new THREE.MeshBasicMaterial(Object.assign({color:C(c)},o));
function box(w,h,d,m,x,y,z){ const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); o.position.set(x,y,z); o.userData.merge=true; if(HQ()){ o.castShadow=true; o.receiveShadow=true; } return o; }
const BGU = THREE.BufferGeometryUtils || null;
function prep(g, keepUV){ if(!keepUV && g.attributes.uv) g.deleteAttribute('uv'); if(g.attributes.uv2) g.deleteAttribute('uv2');
  if(!g.index){ const n=g.attributes.position.count, a=new (n>65535?Uint32Array:Uint16Array)(n); for(let i=0;i<n;i++) a[i]=i; g.setIndex(new THREE.BufferAttribute(a,1)); }
  if(!g.attributes.normal) g.computeVertexNormals(); return g; }
function mergeList(list){ if(list.length===1) return list[0]; if(!BGU) return list; const keepUV=list.every(g=>g.attributes.uv); list.forEach(g=>prep(g,keepUV)); const m=BGU.mergeBufferGeometries(list); return m || list; }
function smoothify(g){ if(!BGU) return g; g.deleteAttribute('normal'); if(g.attributes.uv) g.deleteAttribute('uv'); const m=BGU.mergeVertices(g, 1e-3); m.computeVertexNormals(); return m; }
function jitter(g, amt, seed){ const p=g.attributes.position; for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i); const hh=Math.sin(x*12.9898+y*78.233+z*37.719+seed)*43758.5453, r=(hh-Math.floor(hh)-.5)*amt; p.setXYZ(i, x*(1+r), y+r*.6, z*(1+r)); } g.computeVertexNormals(); return g; }
function G_(g, x,y,z, rx,ry,rz, sx,sy,sz){ if(sx!=null) g.scale(sx,sy,sz); if(rx||ry||rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx||0,ry||0,rz||0))); g.translate(x,y,z); return g; }
const bx=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
const cyl=(r1,r2,h,s=14)=>new THREE.CylinderGeometry(r1,r2,h,s);
const sph=(s=14)=>new THREE.SphereGeometry(1,s,Math.max(6,s>>1));
function rod(a,b,r,s=8){ const A=new THREE.Vector3(a[0],a[1],a[2]), B=new THREE.Vector3(b[0],b[1],b[2]), d=B.clone().sub(A), L=d.length(); const g=new THREE.CylinderGeometry(r,r,L,s); g.translate(0,L/2,0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), d.normalize()))); g.translate(A.x,A.y,A.z); return g; }
