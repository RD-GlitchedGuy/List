import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const gltfL=()=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const toward=(v,t,d)=>v<t?Math.min(t,v+d):Math.max(t,v-d);
const DEG=Math.PI/180, KT=1.94384, FT=3.28084, RWY=20, WORLD=64000;
const sos=a=>340.3-0.0041*clamp(a,0,11000);
const fmtT=t=>String(Math.floor(t)).padStart(2,'0')+':'+String(Math.floor((t%1)*60)).padStart(2,'0');

/* ================= Gelände-Funktion (prozedural, deterministisch) ================= */
function hash(x,z){const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s);}
function vnoise(x,z){const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
 const a=hash(xi,zi),b=hash(xi+1,zi),c=hash(xi,zi+1),d=hash(xi+1,zi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function fbm(x,z,o=6){let f=0,a=0.5;for(let i=0;i<o;i++){f+=a*vnoise(x,z);x*=2.03;z*=2.03;a*=0.5;}return f/(1-Math.pow(0.5,o));}
function rawHeight(x,z){
 const n=fbm(x*0.00022+3.1,z*0.00022+7.7);
 const r=1-Math.abs(fbm(x*0.0006+11.3,z*0.0006+2.9,5)*2-1);
 const d=Math.hypot(x,z)*0.36;   // größere Insel (~2,8× Fläche)
 let h=(n-0.42)*1150+Math.pow(r,4)*1900*smooth(0.45,0.66,n)+(1-smooth(2000,7000,d))*120;
 h-=smooth(7000,11500,d)*1000;
 h-=smooth(25000,31000,Math.max(Math.abs(x),Math.abs(z)))*1500;   // Weltrand: offenes Meer
 // Tiefland zu sanften Ebenen stauchen (landbar), Gebirge bleibt
 return h<=0?h:h<400?h*0.3:120+(h-400);
}
/* ===== Flugplätze: Landerichtung hdg (0 = Norden = -z), lokale Achsen wie Piste 36: Anflug von +z ===== */
function mkRwy(o){const c=Math.cos(o.hdg),s=Math.sin(o.hdg),r={...o,hl:o.len/2,c,s};
 r.L=(x,z)=>{const dx=x-r.cx,dz=z-r.cz;return[dx*c+dz*s,-dx*s+dz*c];};r.W=(lx,lz)=>[r.cx+lx*c-lz*s,r.cz+lx*s+lz*c];
 if(r.elev==null){let a=0,n=0;for(let u=-r.hl;u<=r.hl;u+=100){const[x,z]=r.W(0,u);a+=rawHeight(x,z);n++;}r.elev=Math.max(12,Math.round(a/n));}
 const n1=((Math.round(o.hdg/DEG/10)+35)%36)+1;r.num=String(n1).padStart(2,'0');r.num2=String(((n1+17)%36)+1).padStart(2,'0');return r;}
const RUNWAYS=[mkRwy({name:'Skyline Intl',cx:0,cz:0,hdg:0,len:3000,w:45,elev:RWY,main:true}),
 mkRwy({name:'Nordost-Feld',cx:2500,cz:-8000,hdg:60*DEG,len:2500,w:45}),
 mkRwy({name:'Südhafen',cx:7000,cz:7000,hdg:0,len:2400,w:40}),
 mkRwy({name:'Westküste',cx:-12500,cz:-12500,hdg:120*DEG,len:2800,w:45})];
const CITY={cx:1750,cz:0,hs:730};let curRw=RUNWAYS[0];
function heightAt(x,z){
 let h=rawHeight(x,z);
 for(const r of RUNWAYS){const[lx,lz]=r.L(x,z),ax=Math.abs(lx),az=Math.abs(lz);
  // freier Anflugkorridor (max. 3,5 % Steigung) in beiden Richtungen
  if(az>r.hl-300&&az<r.hl+30000&&ax<2600){const cap=r.elev+(az-r.hl)*0.035,w=1-smooth(1200,2600,ax);h=lerp(h,Math.min(h,cap),w*(1-smooth(26000,30000,az)));}
  // breite ebene Fläche (> 2 Geländezellen), damit kein Geländedreieck über die Piste ragt
  const d=Math.hypot(Math.max(ax-420,0),Math.max(az-r.hl-1150,0));h=lerp(r.elev,h,smooth(0,1100,d));}
 {const d=Math.hypot(Math.max(Math.abs(x-CITY.cx)-CITY.hs-200,0),Math.max(Math.abs(z-CITY.cz)-CITY.hs-200,0));h=lerp(RWY,h,smooth(0,500,d));}
 return h;
}
const TSEG=(()=>{try{return (JSON.parse(localStorage.getItem('skyflight_cfg_v1')||'{}').gfx||{}).preset==='ultra'?1152:384;}catch(e){return 384;}})(),TCS=WORLD/TSEG;let TG=null;const _gn=new THREE.Vector3(0,1,0);
function gridH(x,z,wantN){if(!TG)return heightAt(x,z);
 const fx=(x+WORLD/2)/TCS,fz=(z+WORLD/2)/TCS;if(fx<0||fz<0||fx>=TSEG||fz>=TSEG){if(wantN)_gn.set(0,1,0);return -200;}
 const ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz,N=TSEG+1,ha=TG[iz*N+ix],hd=TG[iz*N+ix+1],hb=TG[(iz+1)*N+ix],hc=TG[(iz+1)*N+ix+1];let h,dx,dz;
 if(u+v<=1){h=ha+(hd-ha)*u+(hb-ha)*v;dx=(hd-ha)/TCS;dz=(hb-ha)/TCS;}else{h=hc+(hb-hc)*(1-u)+(hd-hc)*(1-v);dx=(hc-hb)/TCS;dz=(hc-hd)/TCS;}
 if(wantN)_gn.set(-dx,1,-dz).normalize();return h;}
/* glatte (bikubische) Bodenfläche für die Physik – keine Knicke zwischen Mesh-Dreiecken */
const cr=(p0,p1,p2,p3,t)=>p1+0.5*t*(p2-p0+t*(2*p0-5*p1+4*p2-p3+t*(3*(p1-p2)+p3-p0)));
function smoothH(x,z){if(!TG)return heightAt(x,z);const fx=(x+WORLD/2)/TCS,fz=(z+WORLD/2)/TCS;if(fx<1||fz<1||fx>=TSEG-2||fz>=TSEG-2)return gridH(x,z);
 const ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz,N=TSEG+1,row=j=>{const o=(iz+j)*N+ix;return cr(TG[o-1],TG[o],TG[o+1],TG[o+2],u);};
 return cr(row(-1),row(0),row(1),row(2),v);}
function pavedElev(x,z){for(const r of RUNWAYS){const[lx,lz]=r.L(x,z);if(Math.abs(lx)<r.w/2+7&&Math.abs(lz)<r.hl+10)return r.elev+0.03;}
 return ((x>100&&x<275&&z>-510&&z<210)||(x>20&&x<112&&((z>-462&&z<-438)||(z>238&&z<262))))?RWY+0.03:null;}
const onPaved=(x,z)=>pavedElev(x,z)!=null;
const onPavedOld=(x,z)=>(Math.abs(x)<30&&Math.abs(z)<1510)||(x>100&&x<275&&z>-510&&z<210)||(x>20&&x<112&&((z>-462&&z<-438)||(z>238&&z<262)));
function physH(x,z,wantN){const pe=pavedElev(x,z);if(pe!=null){if(wantN)_gn.set(0,1,0);return pe;}const h=smoothH(x,z);if(wantN){const e=1.5;_gn.set(smoothH(x-e,z)-smoothH(x+e,z),2*e,smoothH(x,z-e)-smoothH(x,z+e)).normalize();}return h;}
const groundH=(x,z)=>Math.max(gridH(x,z),0);

/* ================= Konfiguration & Speicherung ================= */
const ACTIONS=[['pitchUp','Nase hoch',1],['pitchDown','Nase runter',1],['rollLeft','Rollen links',1],['rollRight','Rollen rechts',1],
 ['yawLeft','Seitenruder links',1],['yawRight','Seitenruder rechts',1],['throttleUp','Schub +',1],['throttleDown','Schub −',1],
 ['brakes','Bremsen / Speedbrake',1],['trimUp','Trimmung Nase hoch',1],['trimDown','Trimmung Nase runter',1],['flaps','Landeklappen (Stufe)',0],['gear','Fahrwerk ein/aus',0],['camera','Kamera wechseln',0],
 ['aircraft','Flugzeug wechseln',0],['time','Tageszeit +1 h',0],['restart','Neustart (Piste)',0],['sound','Karte öffnen (M)',0],['autoland','Landehilfe / Autoland',0],['approach','Anflug-Start',0],['pause','Pause',0],
 ['fire','Bordkanone (halten)',1],['missile','IR-Rakete (Fox 2)',0],['flares','Flares / Täuschkörper',0],['score','Rangliste (halten)',1],['lobby','Multiplayer-Lobby',0]];
const HOLD=new Set(ACTIONS.filter(a=>a[2]).map(a=>a[0]));
const SHORT={gear:'GEAR',flaps:'FLAPS',brakes:'BRAKE',camera:'CAM',aircraft:'A/C',time:'+1h',restart:'RESET',approach:'APP',pause:'❚❚',pitchUp:'NOSE↑',pitchDown:'NOSE↓',rollLeft:'ROLL◀',rollRight:'ROLL▶',yawLeft:'YAW◀',yawRight:'YAW▶',throttleUp:'THR+',throttleDown:'THR−',trimUp:'TRIM↑',trimDown:'TRIM↓',sound:'KARTE',autoland:'AUTOLAND',fire:'FIRE',missile:'FOX-2',flares:'FLARE',score:'SCORE',lobby:'LOBBY'};
const DEF={kb:{pitchUp:'KeyS',pitchDown:'KeyW',rollLeft:'KeyA',rollRight:'KeyD',yawLeft:'KeyQ',yawRight:'KeyE',throttleUp:'ShiftLeft',throttleDown:'KeyX',brakes:'KeyB',trimUp:'KeyK',trimDown:'KeyI',flaps:'KeyF',gear:'KeyG',camera:'KeyC',aircraft:'KeyV',time:'KeyT',restart:'KeyN',sound:'KeyM',autoland:'ControlLeft',approach:'KeyL',pause:'KeyP',fire:'Space',missile:'KeyR',flares:'KeyH',score:'Tab',lobby:'KeyO'},
 pad:{pitchUp:-1,pitchDown:-1,rollLeft:-1,rollRight:-1,yawLeft:4,yawRight:5,throttleUp:7,throttleDown:6,brakes:10,trimUp:-1,trimDown:-1,flaps:12,gear:13,camera:3,aircraft:14,time:-1,restart:-1,sound:-1,autoland:15,approach:-1,pause:-1,fire:0,missile:1,flares:2,score:8,lobby:-1},padV:2,
 axes:{roll:0,pitch:1,yaw:2,thr:-1,inv:false,dz:0.12},touch:['gear','flaps','brakes','camera'],
 gfx:{bloom:true,blur:true,shadows:true,clouds:true,res:1,touchUI:'auto'},tspeed:2,wind:1,sound:true,vol:0.7};
const KEY='skyflight_cfg_v1';
function loadCfg(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s)return{...structuredClone(DEF),...s,kb:{...DEF.kb,...s.kb},pad:{...DEF.pad,...(s.padV===2?s.pad:{})},padV:2,axes:{...DEF.axes,...s.axes},gfx:{...DEF.gfx,...s.gfx},touch:(s.touch||DEF.touch).slice(0,4)};}catch(e){}return structuredClone(DEF);}
function saveCfg(){try{localStorage.setItem(KEY,JSON.stringify(cfg));}catch(e){}}
const MOBILE=/iPad|iPhone|Android/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const PRESETS={
 potato:{preset:'potato',bloom:false,blur:false,shadows:false,clouds:false,res:0.75,waves:3,direct:true},   // Ziel: stabile 60 fps auf iPad 9. Gen.
 normal:{preset:'normal',bloom:true,blur:true,shadows:true,clouds:true,res:1,waves:6,direct:false},
 ultra:{preset:'ultra',bloom:true,blur:true,shadows:true,clouds:true,res:1.25,waves:10,direct:false}};   // Ultra: nur für starke PCs
Object.assign(DEF.gfx,PRESETS[MOBILE?'potato':'normal']);
let cfg=loadCfg();cfg.gfx={...PRESETS[MOBILE?'potato':'normal'],...cfg.gfx};
const POTATO=cfg.gfx.preset==='potato';const ULTRA=cfg.gfx.preset==='ultra';   // Potato: ohne Log-Depth-Buffer (spart auf iPad-GPUs viel Füllrate)
const TSPEED=[0,1,60,600],TSLABEL=['Angehalten','Echtzeit','60× (1 h pro Minute)','600×'];
/* ================= Renderer, Szene, Post-Processing ================= */
const renderer=new THREE.WebGLRenderer({antialias:true,logarithmicDepthBuffer:!POTATO,powerPreference:'high-performance'});
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=ULTRA?0.66:0.6;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.domElement.id='gl';document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x9fb8d8,0.000055);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.3,400000);
const composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:MOBILE?0:ULTRA?Math.min(8,renderer.capabilities.maxSamples||4):4}));
composer.addPass(new RenderPass(scene,camera));
const afterPass=new AfterimagePass(0);composer.addPass(afterPass);
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),ULTRA?0.75:0.6,ULTRA?0.55:0.45,2.2);composer.addPass(bloom);
composer.addPass(new OutputPass());
/* Ultra: Gottesstrahlen (Sonnenstrahlen durch Berge/Wolken), Farbgrading, Vignette, Filmkorn */
const gradePass=ULTRA?new ShaderPass({uniforms:{tDiffuse:{value:null},uSun:{value:new THREE.Vector2(0.5,0.5)},uVis:{value:0},uT:{value:0},uAsp:{value:1}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 uSun;uniform float uVis,uT,uAsp;varying vec2 vUv;
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){vec2 uv=vUv,dc=uv-.5;
 vec3 col=texture2D(tDiffuse,uv).rgb;
 if(uVis>0.001){vec2 d=(uv-uSun)/64.0;vec2 p=uv;float w=1.0;vec3 acc=vec3(0.0);
  for(int i=0;i<64;i++){p-=d;vec3 s=texture2D(tDiffuse,p).rgb;float near=1.0-smoothstep(0.0,0.45,length((p-uSun)*vec2(uAsp,1.0)));acc+=s*max(lum(s)-0.9,0.0)*near*w;w*=0.965;}
  float fall=1.0-smoothstep(0.0,1.1,length((uv-uSun)*vec2(uAsp,1.0)));col+=acc/64.0*uVis*14.0*vec3(1.0,0.86,0.66)*(0.25+fall);}
 float l=lum(col);col=mix(vec3(l),col,1.22);col=clamp(col,0.0,1.0);col=mix(col,col*col*(3.0-2.0*col),0.35);
 col+=mix(vec3(-0.015,0.0,0.03),vec3(0.035,0.014,-0.022),smoothstep(0.15,0.85,l));
 col*=1.0-0.38*smoothstep(0.3,1.0,length(dc*vec2(uAsp*0.8,1.0)));
 col+=(fract(sin(dot(uv+fract(uT),vec2(12.9898,78.233)))*43758.5453)-0.5)*0.016;
 gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);}`}):null;
if(gradePass)composer.addPass(gradePass);
const _gS=new THREE.Vector3();
function updGrade(){if(TREE_WT)TREE_WT.value=simTime;if(!gradePass)return;const u=gradePass.uniforms;u.uT.value=(u.uT.value+0.0137)%1;u.uAsp.value=innerWidth/innerHeight;
 _gS.copy(camera.position).addScaledVector(sunDir,5000).project(camera);const vis=_gS.z<1&&sunDir.y>-0.05?(1-smooth(1.0,1.6,Math.max(Math.abs(_gS.x),Math.abs(_gS.y)))):0;
 u.uVis.value=vis*smooth(-0.05,0.12,sunDir.y);u.uSun.value.set(_gS.x*0.5+0.5,_gS.y*0.5+0.5);}
let dynRes=1;
const ANISO=renderer.capabilities.getMaxAnisotropy();
const dm=new THREE.Object3D(),Y=new THREE.Vector3(0,1,0),X=new THREE.Vector3(1,0,0);

/* Licht & Himmel (Rayleigh/Mie) */
const light=new THREE.DirectionalLight(0xffffff,8);light.castShadow=true;light.shadow.mapSize.setScalar(ULTRA?Math.min(8192,renderer.capabilities.maxTextureSize):MOBILE?1024:2048);
light.shadow.bias=-0.0004;light.shadow.normalBias=0.04;light.shadow.camera.near=1;light.shadow.camera.far=2500;
scene.add(light,light.target);
const hemi=new THREE.HemisphereLight(0xb8ccff,0x4a4535,1.5);scene.add(hemi);
const sky=new Sky();sky.scale.setScalar(300000);scene.add(sky);
const su=sky.material.uniforms;su.turbidity.value=5;su.rayleigh.value=ULTRA?1.7:1.5;su.mieCoefficient.value=ULTRA?0.006:0.005;su.mieDirectionalG.value=ULTRA?0.88:0.8;

function canvasTex(w,h,fn,srgb=true){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=ANISO;return t;}
const softTex=canvasTex(64,64,(x,w)=>{const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.5,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);});
const cloudTex=canvasTex(128,128,x=>{for(let i=0;i<16;i++){const px=64+(Math.random()-.5)*56,py=64+(Math.random()-.5)*34,r=18+Math.random()*30;const g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.arc(px,py,r,0,7);x.fill();}});

/* Sterne */
const stars=(()=>{const n=2500,p=new Float32Array(n*3);for(let i=0;i<n;i++){const v=new THREE.Vector3().randomDirection();v.y=Math.abs(v.y)+0.03;v.normalize().multiplyScalar(100000);p.set([v.x,v.y,v.z],i*3);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
 const s=new THREE.Points(g,new THREE.PointsMaterial({size:1.7,sizeAttenuation:false,color:0xffffff,transparent:true,opacity:0,fog:false,depthWrite:false}));s.frustumCulled=false;scene.add(s);return s;})();

/* Terrain-Mesh mit Höhen-/Hangfarben + Detailtextur */
const terrain=(()=>{const SEG=TSEG,g=new THREE.PlaneGeometry(WORLD,WORLD,SEG,SEG);g.rotateX(-Math.PI/2);
 const pa=g.attributes.position;for(let i=0;i<pa.count;i++)pa.setY(i,heightAt(pa.getX(i),pa.getZ(i)));TG=new Float32Array(pa.count);for(let i=0;i<pa.count;i++)TG[i]=pa.getY(i);g.computeVertexNormals();
 const no=g.attributes.normal,col=new Float32Array(pa.count*3),c=new THREE.Color();
 for(let i=0;i<pa.count;i++){const x=pa.getX(i),z=pa.getZ(i),h=pa.getY(i),ny=no.getY(i),v=0.88+hash(x*0.013,z*0.017)*0.2;
  if(h<6)c.setRGB(0.74,0.68,0.5,THREE.SRGBColorSpace);
  else if(h>1250&&ny>0.72)c.setRGB(0.93,0.95,0.98,THREE.SRGBColorSpace);
  else if(ny<0.8||h>950){const t=smooth(950,1250,h);c.setRGB(lerp(0.4,0.55,t),lerp(0.37,0.53,t),lerp(0.33,0.52,t),THREE.SRGBColorSpace);}
  else{const t=fbm(x*0.0015,z*0.0015,3);c.setRGB(lerp(0.2,0.45,t),lerp(0.36,0.43,t),lerp(0.12,0.2,t),THREE.SRGBColorSpace);}
  col.set([c.r*v,c.g*v,c.b*v],i*3);}
 g.setAttribute('color',new THREE.BufferAttribute(col,3));
 const det=canvasTex(256,256,(x)=>{const d=x.createImageData(256,256);for(let i=0;i<d.data.length;i+=4){const v=200+Math.random()*55;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}x.putImageData(d,0,0);});
 det.wrapS=det.wrapT=THREE.RepeatWrapping;det.repeat.set(600,600);
 const tmat=new THREE.MeshStandardMaterial({vertexColors:true,map:det,roughness:1,metalness:0});
 if(ULTRA){const S=512,hc=new Float32Array(S*S);for(let y=0;y<S;y++)for(let x=0;x<S;x++){let v=0,a=1,f=4;for(let o=0;o<5;o++){const u=x/S*f,w=y/S*f,ix=Math.floor(u),iy=Math.floor(w);const hh=(i,j)=>hash(((i%f)+f)%f*7.1+o*31.7,((j%f)+f)%f*3.3+o*17.3);const fu=u-ix,fw=w-iy,su=fu*fu*(3-2*fu),sw=fw*fw*(3-2*fw);v+=a*lerp(lerp(hh(ix,iy),hh(ix+1,iy),su),lerp(hh(ix,iy+1),hh(ix+1,iy+1),su),sw);a*=0.55;f*=2;}hc[y*S+x]=v;}
  const nt=canvasTex(S,S,(x)=>{const d=x.createImageData(S,S);for(let y=0;y<S;y++)for(let xx=0;xx<S;xx++){const H=(a,b)=>hc[((b+S)%S)*S+((a+S)%S)];const dx=(H(xx+1,y)-H(xx-1,y))*3,dy=(H(xx,y+1)-H(xx,y-1))*3,l=Math.hypot(dx,dy,1),i=(y*S+xx)*4;
   d.data[i]=(-dx/l*0.5+0.5)*255;d.data[i+1]=(-dy/l*0.5+0.5)*255;d.data[i+2]=(1/l*0.5+0.5)*255;d.data[i+3]=255;}x.putImageData(d,0,0);},false);
  nt.wrapS=nt.wrapT=THREE.RepeatWrapping;nt.repeat.set(900,900);tmat.normalMap=nt;tmat.normalScale.set(0.9,0.9);}
 const m=new THREE.Mesh(g,tmat);m.receiveShadow=true;m.castShadow=ULTRA;scene.add(m);return m;})();

let ICE_ON=false;const TREE_MS=[];
/* Wasser-Shader: Wellen, Fresnel, Glanz, Schaumkronen */
const water=new THREE.Mesh(new THREE.PlaneGeometry(200000,200000,80,80).rotateX(-Math.PI/2),new THREE.ShaderMaterial({
 uniforms:{uT:{value:0},uSun:{value:new THREE.Vector3(0,1,0)},uSunC:{value:new THREE.Color(1,1,1)},uSky:{value:new THREE.Color()},uFog:{value:new THREE.Color()},uFogD:{value:0.00005},uDay:{value:1}},
 vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;
#include <logdepthbuf_vertex>
}`,
 fragmentShader:`#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uT,uFogD,uDay;uniform vec3 uSun,uSunC,uSky,uFog;varying vec3 vW;
float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
void main(){
#include <logdepthbuf_fragment>
 vec2 p=vW.xz;vec2 g=vec2(0.);float h=0.;float dist=length(cameraPosition-vW);float fade=1.0/(1.0+dist*0.0006);
 for(int i=0;i<WAVES;i++){float fi=float(i);float an=fi*1.7+0.4;vec2 d=vec2(cos(an),sin(an));float fr=0.035*pow(1.7,fi);float am=1.4/pow(1.9,fi);
  float ph=dot(d,p)*fr+uT*sqrt(9.81*fr);h+=am*sin(ph);g+=am*fr*cos(ph)*d;}
 g*=fade;vec3 n=normalize(vec3(-g.x,1.0,-g.y));vec3 v=normalize(cameraPosition-vW);
 float fres=0.02+0.98*pow(1.0-max(dot(n,v),0.0),5.0);
 vec3 col=mix(vec3(0.004,0.025,0.05),vec3(0.01,0.11,0.13),clamp(h*0.3+0.45,0.,1.))*(0.15+uDay);
 vec3 r=reflect(-v,n);float sp=pow(max(dot(r,uSun),0.0),280.0)*6.0+pow(max(dot(r,uSun),0.0),30.0)*0.15;
 col=mix(col,uSky,fres)+uSunC*sp;
 float foam=smoothstep(1.4,2.3,h+vn(p*0.15+uT*0.2)*1.2)*fade;col=mix(col,vec3(0.85)*(0.05+uDay),foam*0.55);
 col=mix(col,uFog,1.0-exp(-uFogD*uFogD*dist*dist));gl_FragColor=vec4(col,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`}));
water.material.defines={WAVES:cfg.gfx.waves||6};scene.add(water);

/* Landebahnen mit Markierungen (eine Textur je Pistenkennung) */
function rwTexFor(r){return canvasTex(256,4096,(x)=>{x.fillStyle='#2c2d30';x.fillRect(0,0,256,4096);
 for(let i=0;i<9000;i++){const v=28+Math.random()*30|0;x.fillStyle=`rgb(${v},${v},${v+2})`;x.fillRect(Math.random()*256,Math.random()*4096,2,2+Math.random()*6);}
 x.fillStyle='rgba(8,8,8,.35)';for(let i=0;i<70;i++){x.fillRect(108+Math.random()*40,3150+Math.random()*600,3,30+Math.random()*120);x.fillRect(108+Math.random()*40,350+Math.random()*600,3,30+Math.random()*120);}
 x.fillStyle='#e8e8e2';x.fillRect(8,0,4,4096);x.fillRect(244,0,4,4096);
 for(let y=230;y<3860;y+=82)x.fillRect(125,y,6,48);
 for(const y0 of [16,3996])for(let k=0;k<8;k++){x.fillRect(22+k*12,y0,7,84);x.fillRect(138+k*12,y0,7,84);}
 for(const y of [3420,560]){x.fillRect(72,y,24,70);x.fillRect(160,y,24,70);}
 x.font='bold 60px sans-serif';x.textAlign='center';
 x.save();x.translate(128,3975);x.scale(1,2.2);x.fillText(r.num,0,0);x.restore();
 x.save();x.translate(128,121);x.rotate(Math.PI);x.scale(1,2.2);x.fillText(r.num2,0,0);x.restore();});}
for(const r of RUNWAYS){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(r.w,r.len).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({map:rwTexFor(r),roughness:0.85,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 mesh.position.set(r.cx,r.elev+0.03,r.cz);mesh.rotation.y=-r.hdg;mesh.receiveShadow=true;scene.add(mesh);}
const apron=new THREE.Mesh(new THREE.PlaneGeometry(160,700).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x3a3b3e,roughness:0.9,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
apron.position.set(190,RWY+0.03,-150);apron.receiveShadow=true;scene.add(apron);
for(const z of [-450,250]){const t=new THREE.Mesh(new THREE.PlaneGeometry(90,23).rotateX(-Math.PI/2),apron.material);t.position.set(66,RWY+0.03,z);scene.add(t);}
(()=>{const con=new THREE.MeshStandardMaterial({color:0xb9b4aa,roughness:0.8}),gl=new THREE.MeshStandardMaterial({color:0x1d3348,metalness:0.8,roughness:0.15}),hg=new THREE.MeshStandardMaterial({color:0x8e98a2,roughness:0.6,metalness:0.4});
 const add=(g,m,x,y,z)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.receiveShadow=true;o.castShadow=ULTRA;scene.add(o);};
 add(new THREE.CylinderGeometry(3,4,28,12),con,300,RWY+14,250);add(new THREE.CylinderGeometry(6.5,5,5,12),gl,300,RWY+30,250);
 for(let i=0;i<3;i++)add(new THREE.BoxGeometry(48,16,40),hg,300,RWY+8,-150-i*55);})();

/* Befeuerung: Randfeuer, Schwellen, Anflugbefeuerung, Blitzfeuer, PAPI */
const lightMats=[];
function lightSet(pts,base,size){const mt=new THREE.MeshBasicMaterial({color:base.clone()});mt.userData.base=base;lightMats.push(mt);
 const im=new THREE.InstancedMesh(new THREE.SphereGeometry(size,8,6),mt,pts.length);
 pts.forEach((p,i)=>{dm.position.set(p[0],p[1],p[2]);dm.scale.setScalar(1);dm.rotation.set(0,0,0);dm.updateMatrix();im.setMatrixAt(i,dm.matrix);});im.frustumCulled=false;scene.add(im);}
{const e=[],th=[],en=[],ap=[];
 for(const r of RUNWAYS){const P=(lx,lz,dy)=>{const[x,z]=r.W(lx,lz);return[x,r.elev+dy,z];},hw=r.w/2+1.5,hl=r.hl;
  for(let z=-hl;z<=hl;z+=60)for(const s of [-hw,hw])e.push(P(s,z,0.4));
  for(let x=-r.w/2;x<=r.w/2;x+=2.5){th.push(P(x,hl+2,0.4));en.push(P(x,-hl-2,0.4));}
  for(let z=hl+30;z<=hl+900;z+=30)for(let x=-6;x<=6;x+=3)ap.push(P(x,z,0.9));
  for(let x=-18;x<=18;x+=2)if(Math.abs(x)>7)ap.push(P(x,hl+300,0.9));}
 lightSet(e,new THREE.Color(1,1,0.85),0.35);lightSet(th,new THREE.Color(0.15,1,0.3),0.4);lightSet(en,new THREE.Color(1,0.08,0.05),0.4);lightSet(ap,new THREE.Color(1,0.95,0.8),0.45);}
const strobe=new THREE.Mesh(new THREE.SphereGeometry(0.9,10,8),new THREE.MeshBasicMaterial({color:0xffffff}));scene.add(strobe);
const papi=[];for(const r of RUNWAYS)for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(0.6,10,8),new THREE.MeshBasicMaterial({color:0xffffff}));const[x,z]=r.W(-r.w/2-11.5-i*9,r.hl-300);m.position.set(x,r.elev+0.8,z);m.userData={r,i};scene.add(m);papi.push(m);}
const PAPI_TH=[3.5,3.17,2.83,2.5];

let TREE_WT=null;   /* Wind in den Baumkronen: läuft komplett auf der Grafikkarte */
/* Ultra-Bäume: Stamm + mehrstufige Krone, Vertex-Farben, leicht zerzauste Kronen */
function ultraTrees(){const tint=(g,r,gg,b,jit)=>{g=g.index?g.toNonIndexed():g;const p=g.attributes.position,c=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){if(jit){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=(hash(x*3.1+y*1.7,z*2.3-y)-0.5)*jit;p.setXYZ(i,x*(1+n),y+n*0.6,z*(1+n));}const s=0.86+hash(i*0.37,i*0.11)*0.28;c.set([r*s,gg*s,b*s],i*3);}
  g.setAttribute('color',new THREE.BufferAttribute(c,3));g.deleteAttribute('uv');g.computeVertexNormals();return g;};
 const merge=parts=>{let n=0;for(const g of parts)n+=g.attributes.position.count;const P=new Float32Array(n*3),N=new Float32Array(n*3),C=new Float32Array(n*3);let o=0;
  for(const g of parts){P.set(g.attributes.position.array,o*3);N.set(g.attributes.normal.array,o*3);C.set(g.attributes.color.array,o*3);o+=g.attributes.position.count;}
  const m=new THREE.BufferGeometry();m.setAttribute('position',new THREE.BufferAttribute(P,3));m.setAttribute('normal',new THREE.BufferAttribute(N,3));m.setAttribute('color',new THREE.BufferAttribute(C,3));return m;};
 const T=(g,x,y,z)=>{g.translate(x,y,z);return g;};
 const conG=merge([tint(T(new THREE.CylinderGeometry(0.28,0.5,4,10),0,2,0),0.07,0.04,0.022,0),
  tint(T(new THREE.ConeGeometry(3.9,5.5,16,3),0,4.6,0),0.018,0.055,0.02,0.12),tint(T(new THREE.ConeGeometry(3.1,5,16,3),0,7.2,0),0.021,0.064,0.023,0.12),
  tint(T(new THREE.ConeGeometry(2.2,4.4,14,2),0,9.6,0),0.025,0.074,0.027,0.1),tint(T(new THREE.ConeGeometry(1.2,3.2,12,2),0,11.8,0),0.03,0.085,0.03,0.08)]);
 const brG=merge([tint(T(new THREE.CylinderGeometry(0.3,0.5,5,10),0,2.5,0),0.085,0.055,0.03,0),
  tint(T(new THREE.IcosahedronGeometry(3.3,2).scale(1,0.85,1),0,6.8,0),0.045,0.105,0.022,0.22),tint(T(new THREE.IcosahedronGeometry(2.3,2),1.9,5.9,0.8),0.055,0.12,0.026,0.22),
  tint(T(new THREE.IcosahedronGeometry(2.1,2),-1.7,6.1,-1),0.04,0.092,0.02,0.22),tint(T(new THREE.IcosahedronGeometry(1.9,2),0.3,8.6,0.2),0.065,0.135,0.032,0.2)]);
 const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.92,metalness:0}),NC=17000,NB=13000;
 TREE_WT={value:0};mat.onBeforeCompile=sh=>{sh.uniforms.uWT=TREE_WT;sh.vertexShader='uniform float uWT;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
#ifdef USE_INSTANCING
 vec3 ip=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
#else
 vec3 ip=vec3(0.0);
#endif
 float sw=max(position.y-2.5,0.0)*0.03;transformed.x+=sin(uWT*1.3+ip.x*0.05+ip.z*0.03)*sw;transformed.z+=cos(uWT*1.1+ip.z*0.05)*sw*0.7;`);};
 const con=new THREE.InstancedMesh(conG,mat,NC),br=new THREE.InstancedMesh(brG,mat,NB),col=new THREE.Color();let nc=0,nb=0;
 for(let k=0;k<700000&&(nc<NC||nb<NB);k++){const x=(Math.random()-.5)*WORLD*0.8,z=(Math.random()-.5)*WORLD*0.8;if(RUNWAYS.some(r=>{const[lx,lz]=r.L(x,z);return Math.abs(lx)<400&&Math.abs(lz)<r.hl+1300;}))continue;
  if(Math.abs(x-CITY.cx)<CITY.hs+80&&Math.abs(z-CITY.cz)<CITY.hs+80)continue;if(fbm(x*0.0008+5,z*0.0008,3)<0.5)continue;const h=gridH(x,z);if(h<10||h>900)continue;if(Math.abs(gridH(x+6,z)-h)+Math.abs(gridH(x,z+6)-h)>4)continue;
  const pine=h>420||Math.random()<0.45,M=pine?con:br;if(pine?nc>=NC:nb>=NB)continue;const s=0.65+Math.random()*0.9;
  dm.position.set(x,h-0.4,z);dm.rotation.set((Math.random()-.5)*0.08,Math.random()*6.3,(Math.random()-.5)*0.08);dm.scale.set(s,s*(0.85+Math.random()*0.4),s);dm.updateMatrix();
  const i=pine?nc++:nb++;M.setMatrixAt(i,dm.matrix);col.setRGB(0.85+Math.random()*0.3,0.85+Math.random()*0.3,0.8+Math.random()*0.25);M.setColorAt(i,col);}
 con.count=nc;br.count=nb;TREE_MS.push(con,br);for(const M of [con,br]){M.frustumCulled=false;M.castShadow=true;M.receiveShadow=true;scene.add(M);}
 {const mm=new THREE.Matrix4();br.getMatrixAt(0,mm);window.__ultraTrees={nc,nb,x:mm.elements[12],y:mm.elements[13],z:mm.elements[14]};}}
/* Wälder (instanziert) */
(()=>{if(ULTRA){ultraTrees();return;}const tg=new THREE.ConeGeometry(3.5,12,6);tg.translate(0,6,0);const N=POTATO?4500:ULTRA?26000:9000,tr=new THREE.InstancedMesh(tg,new THREE.MeshStandardMaterial({color:0x2b4a22,roughness:1}),N);let n=0;
 for(let k=0;k<(ULTRA?600000:160000)&&n<N;k++){const x=(Math.random()-.5)*WORLD*0.8,z=(Math.random()-.5)*WORLD*0.8;if(RUNWAYS.some(r=>{const[lx,lz]=r.L(x,z);return Math.abs(lx)<400&&Math.abs(lz)<r.hl+1300;}))continue;
  if(Math.abs(x-CITY.cx)<CITY.hs+80&&Math.abs(z-CITY.cz)<CITY.hs+80)continue;if(fbm(x*0.0008+5,z*0.0008,3)<0.52)continue;const h=gridH(x,z);if(h<10||h>850)continue;
  if(Math.abs(gridH(x+6,z)-h)+Math.abs(gridH(x,z+6)-h)>4)continue;
  const s=0.6+Math.random()*0.9;dm.position.set(x,h-0.6,z);dm.rotation.set(0,Math.random()*6,0);dm.scale.set(s,s*(0.8+Math.random()*0.5),s);dm.updateMatrix();tr.setMatrixAt(n++,dm.matrix);}
 tr.count=n;TREE_MS.push(tr);tr.frustumCulled=false;tr.castShadow=ULTRA;tr.receiveShadow=ULTRA;scene.add(tr);})();

/* Wolkenfelder */
const clouds=(()=>{const p=[];for(let c=0;c<(ULTRA?380:170);c++){const cx=(Math.random()-.5)*WORLD*1.1,cz=(Math.random()-.5)*WORLD*1.1,cy=1700+Math.random()*900,n=10+Math.random()*12|0;
 for(let i=0;i<n;i++)p.push(cx+(Math.random()-.5)*700,cy+(Math.random()-.5)*120,cz+(Math.random()-.5)*500);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
 const N=p.length/3,sz=new Float32Array(N);for(let i=0;i<N;i++)sz[i]=560+Math.random()*420;
 const ig=new THREE.InstancedBufferGeometry();ig.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));ig.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));ig.setIndex([0,1,2,0,2,3]);
 ig.setAttribute('ofs',new THREE.InstancedBufferAttribute(new Float32Array(p),3));ig.setAttribute('sz',new THREE.InstancedBufferAttribute(sz,1));ig.instanceCount=N;
 const U=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{map:{value:null},uColor:{value:new THREE.Color(1,1,1)},uOp:{value:ULTRA?0.8:0.6},uSh:{value:ULTRA?1:0}}]);U.map.value=cloudTex;
 const mat=new THREE.ShaderMaterial({uniforms:U,fog:true,transparent:true,depthWrite:false,
  vertexShader:`attribute vec3 ofs;attribute float sz;varying vec2 vUv;varying float vA;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(ofs,1.0);float d=-mvPosition.z;mvPosition.xy+=position.xy*sz;
 vA=smoothstep(300.0,1100.0,d);gl_Position=projectionMatrix*mvPosition;
#include <logdepthbuf_vertex>
#include <fog_vertex>
}`,
  fragmentShader:`uniform sampler2D map;uniform vec3 uColor;uniform float uOp,uSh;varying vec2 vUv;varying float vA;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main(){
#include <logdepthbuf_fragment>
vec4 t=texture2D(map,vUv);gl_FragColor=vec4(uColor*t.rgb*mix(1.0,mix(0.62,1.12,vUv.y),uSh),t.a*uOp*vA);if(gl_FragColor.a<0.004)discard;
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`});mat.color=U.uColor.value;
 const m=new THREE.Mesh(ig,mat);m.frustumCulled=false;m.renderOrder=1;scene.add(m);return m;})();

/* Partikelsystem: Kondensstreifen, Reifenrauch, Crash */
const PMAX=ULTRA?14000:4000,pPos=new Float32Array(PMAX*3),pDat=new Float32Array(PMAX*2),pCol=new Float32Array(PMAX*3),pVel=new Float32Array(PMAX*3),pLife=new Float32Array(PMAX),pMaxL=new Float32Array(PMAX),pS0=new Float32Array(PMAX),pGr=new Float32Array(PMAX),pA0=new Float32Array(PMAX);let pHead=0;
const pGeo=new THREE.BufferGeometry();
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('pdata',new THREE.BufferAttribute(pDat,2).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('pcol',new THREE.BufferAttribute(pCol,3).setUsage(THREE.DynamicDrawUsage));
const pMat=new THREE.ShaderMaterial({uniforms:{uScale:{value:500},uTex:{value:softTex}},transparent:true,depthWrite:false,
 vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 pdata;attribute vec3 pcol;uniform float uScale;varying float vA;varying vec3 vC;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=pdata.x*uScale/max(-mv.z,0.1);vA=pdata.y;vC=pcol;
#include <logdepthbuf_vertex>
}`,
 fragmentShader:`#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex;varying float vA;varying vec3 vC;
void main(){
#include <logdepthbuf_fragment>
 float a=texture2D(uTex,gl_PointCoord).a*vA;if(a<0.005)discard;gl_FragColor=vec4(vC,a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
const particles=new THREE.Points(pGeo,pMat);particles.frustumCulled=false;scene.add(particles);
function emit(x,y,z,vx,vy,vz,life,size,grow,alpha,r,g,b){const i=pHead;pHead=(pHead+1)%PMAX;pPos.set([x,y,z],i*3);pVel.set([vx,vy,vz],i*3);pCol.set([r,g,b],i*3);pLife[i]=pMaxL[i]=life;pS0[i]=size;pGr[i]=grow;pA0[i]=alpha;}
function updParticles(dt){const damp=1-0.8*dt;
 for(let i=0;i<PMAX;i++){if(pLife[i]<=0)continue;pLife[i]-=dt;if(pLife[i]<=0){pDat[i*2+1]=0;continue;}
  const k=i*3;pPos[k]+=pVel[k]*dt;pPos[k+1]+=pVel[k+1]*dt;pPos[k+2]+=pVel[k+2]*dt;pVel[k]*=damp;pVel[k+1]*=damp;pVel[k+2]*=damp;
  const age=pMaxL[i]-pLife[i],t=age/pMaxL[i];pDat[i*2]=pS0[i]+pGr[i]*age;pDat[i*2+1]=pA0[i]*(1-t)*(1-t)*smooth(0,0.08,t);}
 for(const n of ['position','pdata','pcol'])pGeo.attributes[n].needsUpdate=true;}
/* ================= Prozedurale Flugzeugmodelle ================= */
const M=(c,r=0.45,mt=0.25)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:mt});
const glassM=M(0x18232f,0.06,0.9),goldM=new THREE.MeshStandardMaterial({color:0xc9a24a,roughness:0.08,metalness:1,transparent:true,opacity:0.85});
const navR=new THREE.MeshBasicMaterial({color:0xff0000}),navG=new THREE.MeshBasicMaterial({color:0x00ff00}),navW=new THREE.MeshBasicMaterial({color:0xffffff});
function mk(p,g,m,x=0,y=0,z=0,rx=0,ry=0,rz=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.castShadow=true;p.add(o);return o;}
function cylZ(rf,rb,len,seg=16,open=false){const g=new THREE.CylinderGeometry(rb,rf,len,seg,1,open);g.rotateX(Math.PI/2);return g;}
function coneZ(r,len,seg,back){const g=new THREE.ConeGeometry(r,len,seg);g.rotateX(back?Math.PI/2:-Math.PI/2);return g;}
function flat(pts,th){const g=new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(p=>new THREE.Vector2(p[0],p[1]))),{depth:th,bevelEnabled:false});g.rotateX(Math.PI/2);g.translate(0,th/2,0);return g;}
function fin(pts,th){const g=new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(p=>new THREE.Vector2(p[0],p[1]))),{depth:th,bevelEnabled:false});g.rotateY(-Math.PI/2);g.translate(th/2,0,0);return g;}
function base(){return{group:new THREE.Group(),legs:[],gearPts:[],crashPts:[],tips:[],ab:[],prop:null,disc:null,belly:null};}
function gearLeg(m,x,y,z,len,wr,th,axis,sign){const piv=new THREE.Group();piv.position.set(x,y,z);m.group.add(piv);
 mk(piv,new THREE.CylinderGeometry(th,th,len,8),M(0x9aa0a6,0.4,0.7),0,-len/2,0);
 const w=new THREE.CylinderGeometry(wr,wr,wr*0.7,16);w.rotateZ(Math.PI/2);mk(piv,w,M(0x141414,0.9,0),0,-len,0);
 m.legs.push({piv,axis,sign});m.gearPts.push(new THREE.Vector3(x,y-len-wr,z));}
const pfdC=document.createElement('canvas');pfdC.width=320;pfdC.height=200;const pfdCtx=pfdC.getContext('2d');
const ndC=document.createElement('canvas');ndC.width=320;ndC.height=200;const ndCtx=ndC.getContext('2d');
const pfdTex=new THREE.CanvasTexture(pfdC),ndTex=new THREE.CanvasTexture(ndC);pfdTex.colorSpace=ndTex.colorSpace=THREE.SRGBColorSpace;
function finish(m,o){Object.assign(m,o);const pg=new THREE.Group();pg.position.copy(o.panel);m.group.add(pg);
 mk(pg,new THREE.BoxGeometry(o.pw,o.ph,0.06),M(0x1b1e22,0.8,0.2));
 const sh=o.ph*0.84,sw=sh*1.6;[[pfdTex,-1],[ndTex,1]].forEach(([t,s])=>{const sc=new THREE.Mesh(new THREE.PlaneGeometry(sw,sh),new THREE.MeshBasicMaterial({map:t,color:new THREE.Color(1.7,1.7,1.7)}));sc.position.set(s*(sw/2+0.015),0,0.032);pg.add(sc);});
 const ns=o.nav;m.tips.forEach((t,i)=>{const l=mk(m.group,new THREE.SphereGeometry(ns,8,6),i===0?navR:navG,t.x,t.y,t.z);l.castShadow=false;});
 mk(m.group,new THREE.SphereGeometry(ns*1.2,8,6),navW,o.tail.x,o.tail.y,o.tail.z).castShadow=false;
 const bw=Math.abs(m.tips[0].x)*0.25;m.bellyPts=[m.belly.clone().add(V3(0,0,-2)),m.belly.clone().add(V3(-bw,0,1.5)),m.belly.clone().add(V3(bw,0,1.5)),...(m.extraBelly||[])];
 m.gearY=Math.min(...m.gearPts.map(p=>p.y));return m;}
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);

function buildCessna(){const m=base(),g=m.group,W=M(0xf2f2f0,0.35,0.1),R=M(0xb3202a,0.4,0.1),D=M(0x222222,0.6,0.3);
 mk(g,cylZ(0.62,0.26,6.4,18),W,0,0,0.6);mk(g,new THREE.BoxGeometry(1.12,0.5,2.3),W,0,0.5,-0.85);mk(g,new THREE.BoxGeometry(1.16,0.36,1.7),glassM,0,0.52,-0.85);
 mk(g,cylZ(0.5,0.62,1.1,18,true),W,0,0,-3.0);mk(g,coneZ(0.24,0.5,14),R,0,0,-3.8);
 m.prop=new THREE.Group();m.prop.position.z=-3.62;g.add(m.prop);mk(m.prop,new THREE.BoxGeometry(0.13,1.9,0.035),D);
 m.disc=new THREE.Mesh(new THREE.CircleGeometry(0.95,28),new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:0.14,side:THREE.DoubleSide,depthWrite:false}));m.disc.position.z=-3.6;g.add(m.disc);
 mk(g,new THREE.BoxGeometry(11,0.14,1.5),W,0,0.92,-0.6);for(const s of [-1,1]){mk(g,new THREE.BoxGeometry(0.12,0.16,1.52),R,s*5.5,0.92,-0.6);mk(g,new THREE.BoxGeometry(0.07,2.26,0.13),W,s*1.55,0.37,-0.55,0,0,-s*1.087);}
 mk(g,new THREE.BoxGeometry(3.4,0.08,0.9),W,0,0.12,3.45);mk(g,fin([[2.9,0.25],[3.95,0.25],[4.05,1.65],[3.55,1.65]],0.08),W);mk(g,fin([[3.55,1.25],[4.0,1.25],[4.05,1.65],[3.6,1.65]],0.1),R);
 mk(g,cylZ(0.63,0.5,1.2,18,true),R,0,0,-1.6).scale.set(1.01,1.01,0.08);
 gearLeg(m,0,-0.4,-2.55,0.7,0.27,0.04,'x',0);gearLeg(m,-1.05,-0.35,0.55,0.75,0.29,0.05,'z',1);gearLeg(m,1.05,-0.35,0.55,0.75,0.29,0.05,'z',-1);
 m.tips=[V3(-5.5,0.92,-0.6),V3(5.5,0.92,-0.6)];m.crashPts=[V3(0,0,-4.0),V3(-5.5,0.92,-0.6),V3(5.5,0.92,-0.6),V3(0,0.3,3.9),V3(0,1.65,3.8)];m.belly=V3(0,-0.62,0);
 return finish(m,{eye:V3(-0.28,0.5,-1.0),panel:V3(0,0.12,-1.72),pw:1.15,ph:0.34,camD:13,camH:3.2,shadowR:10,nav:0.07,tail:V3(0,1.66,4.05)});}

function buildJet(){const m=base(),g=m.group,G1=M(0x7d848c,0.55,0.45),G2=M(0x5c636b,0.6,0.5),N=M(0x2b2b2b,0.7,0.6);
 mk(g,new THREE.BoxGeometry(2.4,1.1,13),G1,0,0,1);for(const s of [-1,1]){mk(g,new THREE.BoxGeometry(1.0,1.0,4.5),G2,s*1.6,-0.15,-1.2);mk(g,new THREE.BoxGeometry(1.0,0.9,1.4),N,s*0.62,0,8.1);}
 const ng=new THREE.ConeGeometry(1.6,5.6,4);ng.rotateY(Math.PI/4);ng.rotateX(-Math.PI/2);ng.scale(1,0.5,1);mk(g,ng,G1,0,0,-8.3);
 mk(g,new THREE.SphereGeometry(1,20,14),goldM,0,0.62,-5.0).scale.set(0.62,0.55,2.3);
 mk(g,flat([[0,-4],[6.8,2.2],[6.8,4],[2,4.6],[0,4.2],[-2,4.6],[-6.8,4],[-6.8,2.2]],0.22),G1,0,-0.1,0);
 mk(g,flat([[1.2,6.2],[4.6,8.7],[4.6,9.9],[1.2,9.5],[-1.2,9.5],[-4.6,9.9],[-4.6,8.7],[-1.2,6.2]],0.14),G1);
 for(const s of [-1,1])mk(g,fin([[5.0,0],[8.3,0],[9.4,3.2],[7.6,3.2]],0.14),G1,s*1.55,0.5,0,0,0,-s*0.42);
 const abMat=new THREE.MeshBasicMaterial({color:new THREE.Color(4,1.8,0.6),transparent:true,opacity:0.85,blending:THREE.AdditiveBlending,depthWrite:false});
 for(const s of [-1,1]){const cg=coneZ(0.42,2.6,14,true);cg.translate(0,0,1.3);const c=mk(g,cg,abMat,s*0.62,0,8.8);c.castShadow=false;m.ab.push(c);}
 gearLeg(m,0,-0.5,-5.2,1.15,0.33,0.07,'x',-1);gearLeg(m,-1.7,-0.45,1.6,1.2,0.4,0.08,'z',1);gearLeg(m,1.7,-0.45,1.6,1.2,0.4,0.08,'z',-1);
 m.tips=[V3(-6.8,-0.1,3.1),V3(6.8,-0.1,3.1)];m.crashPts=[V3(0,0,-11.1),V3(-6.8,-0.1,3.1),V3(6.8,-0.1,3.1),V3(-4.6,0,9.6),V3(4.6,0,9.6)];m.belly=V3(0,-0.65,0);
 return finish(m,{eye:V3(0,1.0,-5.0),panel:V3(0,0.5,-5.85),pw:1.2,ph:0.36,camD:26,camH:6,shadowR:16,nav:0.1,tail:V3(0,0.55,9.3)});}

/* ===== F-15C aus eingebettetem GLB: automatisch ausrichten, skalieren, Cockpit-Punkte ableiten ===== */
let F15=null;
async function loadF15(){const el=$('f15glb');if(!el)return null;
 const bin=Uint8Array.from(atob(el.textContent.trim()),c=>c.charCodeAt(0));el.remove();
 const gl=await gltfL().parseAsync(bin.buffer,'');gl.scene.updateMatrixWorld(true);
 const ms=[];gl.scene.traverse(o=>{if(o.isMesh)ms.push(o);});
 const glassO=ms.find(o=>o.material.transparent)||ms[0];
 const oth=ms.filter(o=>o!==glassO).sort((a,b)=>b.geometry.attributes.position.count-a.geometry.attributes.position.count);
 const bake=o=>o.geometry.clone().applyMatrix4(o.matrixWorld);
 const body=bake(oth[0]),gear=oth[1]?bake(oth[1]):null,glass=bake(glassO),all=[body,gear,glass].filter(Boolean);
 const bb=g=>{g.computeBoundingBox();return g.boundingBox.clone();},C=b=>b.getCenter(new THREE.Vector3()).toArray();
 const B0=bb(body),sz=B0.getSize(new THREE.Vector3()).toArray(),bc=C(B0),gc=C(bb(glass)),grc=gear?C(bb(gear)):null;
 const idx=[0,1,2].sort((a,b)=>sz[a]-sz[b]),H=idx[0],L=idx[2];
 const f=new THREE.Vector3(),u=new THREE.Vector3();f.setComponent(L,Math.sign(gc[L]-bc[L])||1);
 u.setComponent(H,grc?(Math.sign(bc[H]-grc[H])||1):(Math.sign(gc[H]-bc[H])||1));
 const r=new THREE.Vector3().crossVectors(f,u),sc=19.4/sz[L];
 const M4=new THREE.Matrix4().set(r.x,r.y,r.z,0,u.x,u.y,u.z,0,-f.x,-f.y,-f.z,0,0,0,0,1).premultiply(new THREE.Matrix4().makeScale(sc,sc,sc));
 all.forEach(g=>g.applyMatrix4(M4));[body,gear].filter(Boolean).forEach(g=>{const ix=g.index;if(ix){const a=ix.array;for(let i=0;i<a.length;i+=3){const t=a[i+1];a[i+1]=a[i+2];a[i+2]=t;}ix.needsUpdate=true;}});
 let B=bb(body),G=gear?bb(gear):B,Cb=bb(glass);
 const off=new THREE.Vector3(-(B.min.x+B.max.x)/2,-(G.max.y+Cb.min.y)/2,-(G.max.z-1.4));
 all.forEach(g=>{g.translate(off.x,off.y,off.z);g.computeBoundingSphere();});
 B=bb(body);G=gear?bb(gear):B;Cb=bb(glass);
 const P=body.attributes.position,v=new THREE.Vector3();let tip=null,nose=null,tail=null;
 for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i);if(!tip||v.x>tip.x)tip=v.clone();if(!nose||v.z<nose.z)nose=v.clone();if(!tail||v.y>tail.y)tail=v.clone();}
 let nz=-1e9;const cand=[];for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i);if(Math.abs(v.x)<1.4&&v.y<Cb.min.y&&v.y>G.max.y-0.5){cand.push(v.clone());nz=Math.max(nz,v.z);}}
 let nx=0,ny=0,nn=0;for(const c of cand)if(c.z>nz-0.3&&Math.abs(c.x)>0.15){nx+=Math.abs(c.x);ny+=c.y;nn++;}nx=nn?nx/nn:0.6;ny=nn?ny/nn:0;
 const gy=G.min.y,tipL=tip.clone();tipL.x*=-1;
 const eye=V3(0,Cb.min.y+0.62*(Cb.max.y-Cb.min.y),Cb.min.z+0.45*(Cb.max.z-Cb.min.z));
 const bodyMat=oth[0].material;bodyMat.side=THREE.DoubleSide;
 const glassMat=new THREE.MeshStandardMaterial({color:0xa9c4d8,transparent:true,opacity:0.16,roughness:0.03,metalness:0.1,side:THREE.DoubleSide,depthWrite:false});
 [body,gear,glass].forEach(g=>g&&(g.userData.keep=true));
 return{body,gear,glass,bodyMat,gearMat:oth[1]?oth[1].material:bodyMat,glassMat,
  gearPts:[V3(0,gy,G.min.z+0.35),V3(-G.max.x*0.85,gy,G.max.z-0.35),V3(G.max.x*0.85,gy,G.max.z-0.35)],
  tips:[tipL,tip],crash:[nose,tipL,tip],belly:V3(0,B.min.y+0.05,0),eye,panel:eye.clone().add(V3(0,-0.4,-0.72)),tail,nozzles:[V3(-nx,ny,nz),V3(nx,ny,nz)]};}
function buildF15(){const m=base(),g=m.group,T=F15;
 const add=(geo,mat,sh)=>{const o=new THREE.Mesh(geo,mat);o.castShadow=sh;g.add(o);return o;};
 add(T.body,T.bodyMat,true);add(T.glass,T.glassMat,false).renderOrder=2;if(T.gear)m.gearMesh=add(T.gear,T.gearMat,true);
 m.gearPts=T.gearPts.map(v=>v.clone());m.tips=T.tips.map(v=>v.clone());m.crashPts=T.crash.map(v=>v.clone());m.belly=T.belly.clone();
 const abMat=new THREE.MeshBasicMaterial({color:new THREE.Color(4,1.8,0.6),transparent:true,opacity:0.85,blending:THREE.AdditiveBlending,depthWrite:false});
 for(const n of T.nozzles){const cg=coneZ(0.4,2.6,14,true);cg.translate(0,0,1.3);const c=mk(g,cg,abMat,n.x,n.y,n.z);c.castShadow=false;m.ab.push(c);}
 return finish(m,{eye:T.eye.clone(),panel:T.panel.clone(),pw:0.95,ph:0.3,camD:24,camH:5.5,shadowR:16,nav:0.1,tail:T.tail.clone()});}

/* ===== Boeing 747 / VC-25 aus eingebettetem GLB ===== */
let B747=null;
async function loadB747(){const el=$('b747glb');if(!el)return null;
 const bin=Uint8Array.from(atob(el.textContent.trim()),c=>c.charCodeAt(0));el.remove();
 const gl=await gltfL().parseAsync(bin.buffer,'');const sc=gl.scene;
 const tag=(o,re)=>{for(let p=o;p;p=p.parent)if(re.test(p.name||''))return true;return false;};
 const glassMat=new THREE.MeshStandardMaterial({color:0xa9c4d8,transparent:true,opacity:0.14,roughness:0.03,metalness:0.1,side:THREE.DoubleSide,depthWrite:false});
 sc.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;const mn=(o.material.name||'');
  if(/glass|windshield/i.test(mn)||tag(o,/^(Windshield|Glass)/)){o.material=glassMat;o.castShadow=false;o.renderOrder=2;o.userData.glass=true;}
  else{o.material.side=THREE.DoubleSide;}
  if(tag(o,/^(LGFront|LGBack|CoversFrontOpen|CoverOpen)/))o.userData.gear=1;
  else if(tag(o,/^(CoversClosed|CoversFrontClosed)/))o.userData.gear=-1;
  if(tag(o,/^Engine\d/))o.userData.engine=true;});
 sc.updateMatrixWorld(true);
 const boxOf=f=>{const b=new THREE.Box3();sc.traverse(o=>{if(o.isMesh&&f(o))b.expandByObject(o);});return b;};
 const body=boxOf(o=>!o.userData.glass&&!o.userData.gear),gr=boxOf(o=>o.userData.gear===1),gs=boxOf(o=>o.userData.glass);
 const sz=body.getSize(new THREE.Vector3()).toArray(),bc=body.getCenter(new THREE.Vector3()).toArray(),gc=gs.getCenter(new THREE.Vector3()).toArray(),grc=gr.getCenter(new THREE.Vector3()).toArray();
 const idx=[0,1,2].sort((a,b)=>sz[a]-sz[b]),H=idx[0];let L=idx[2];
 // Länge = Achse, entlang der die Cockpitscheibe am weitesten vom Zentrum liegt (747: Spannweite ≈ Länge)
 const cand=[0,1,2].filter(i=>i!==H);L=Math.abs(gc[cand[0]]-bc[cand[0]])>Math.abs(gc[cand[1]]-bc[cand[1]])?cand[0]:cand[1];
 const f=new THREE.Vector3(),u=new THREE.Vector3();f.setComponent(L,Math.sign(gc[L]-bc[L])||1);u.setComponent(H,Math.sign(bc[H]-grc[H])||1);
 const r=new THREE.Vector3().crossVectors(f,u),s=70.7/sz[L];
 const wrap=new THREE.Group();wrap.add(sc);
 sc.applyMatrix4(new THREE.Matrix4().set(r.x,r.y,r.z,0,u.x,u.y,u.z,0,-f.x,-f.y,-f.z,0,0,0,0,1).premultiply(new THREE.Matrix4().makeScale(s,s,s)));
 wrap.updateMatrixWorld(true);
 const box2=f2=>{const b=new THREE.Box3();sc.traverse(o=>{if(o.isMesh&&f2(o))b.expandByObject(o);});return b;};
 // Gear-Vertices: Bug- und Hauptfahrwerk trennen
 const gv=[],v=new THREE.Vector3();sc.traverse(o=>{if(o.isMesh&&o.userData.gear===1){const P=o.geometry.attributes.position;for(let i=0;i<P.count;i+=3)gv.push(v.fromBufferAttribute(P,i).applyMatrix4(o.matrixWorld).clone());}});
 const G=box2(o=>o.userData.gear===1),noseZ=G.min.z,mains=gv.filter(p=>p.z>noseZ+8);
 const mz=mains.reduce((a,p)=>a+p.z,0)/mains.length,mx=Math.max(...mains.map(p=>Math.abs(p.x)));
 const Cb=box2(o=>o.userData.glass),B=box2(o=>!o.userData.glass&&!o.userData.gear);
 const off=new THREE.Vector3(-(B.min.x+B.max.x)/2,-(G.max.y+Cb.min.y)/2,-(mz-2.5));sc.position.add(off);wrap.updateMatrixWorld(true);
 const sh=p=>p.clone().add(off);
 let tip=null,nose=null;sc.traverse(o=>{if(!o.isMesh||o.userData.gear)return;const P=o.geometry.attributes.position;for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(o.matrixWorld);if(!tip||v.x>tip.x)tip=v.clone();if(!nose||v.z<nose.z)nose=v.clone();}});
 const eng=[];sc.traverse(o=>{if(o.isMesh&&o.userData.engine&&o.geometry.attributes.position.count>800){const b=new THREE.Box3().setFromObject(o);eng.push(V3((b.min.x+b.max.x)/2,b.min.y,(b.min.z+b.max.z)/2));}});
 const gy=G.min.y+off.y,Cs=Cb.clone().translate(off),Bs=B.clone().translate(off);
 const eye=V3(-0.55,(Cs.min.y+Cs.max.y)/2-0.05,Cs.max.z+0.7);
 const tl=tip.clone();tl.x*=-1;
 return{wrap,gearPts:[V3(0,gy,G.min.z+off.z+0.6),V3(-mx*0.8,gy,mz+off.z),V3(mx*0.8,gy,mz+off.z)],tips:[tl,tip],crash:[nose,tl,tip],
  belly:V3(0,Bs.min.y+0.1,0),extraBelly:eng,eye,panel:eye.clone().add(V3(0.55,-0.5,-0.75)),tail:V3(0,Bs.max.y,Bs.max.z-3)};}
function buildB747(){const m=base(),T=B747,w=T.wrap.clone(true);m.group.add(w);m.gearOn=[];m.gearOff=[];
 w.traverse(o=>{if(!o.isMesh)return;o.geometry.userData.keep=true;if(o.userData.gear===1)m.gearOn.push(o);else if(o.userData.gear===-1)m.gearOff.push(o);});
 m.gearPts=T.gearPts.map(v=>v.clone());m.tips=T.tips.map(v=>v.clone());m.crashPts=T.crash.map(v=>v.clone());m.belly=T.belly.clone();m.extraBelly=T.extraBelly.map(v=>v.clone());
 return finish(m,{eye:T.eye.clone(),panel:T.panel.clone(),pw:1.3,ph:0.36,camD:105,camH:22,shadowR:60,nav:0.3,tail:T.tail.clone()});}

/* ===== Lockheed SR-71 Blackbird aus eingebettetem GLB ===== */
let SR71=null;
async function loadSR71(){const el=$('sr71glb');if(!el)return null;
 const bin=Uint8Array.from(atob(el.textContent.trim()),c=>c.charCodeAt(0));el.remove();
 const gl=await gltfL().parseAsync(bin.buffer,'');let inner=null;gl.scene.traverse(o=>{if(!inner&&/sr71/i.test(o.name||''))inner=o;});if(!inner)return null;
 inner.parent.remove(inner);const wrap=new THREE.Group();wrap.add(inner);
 inner.position.set(0,-1.4,-5.5);inner.quaternion.identity();inner.scale.set(1,1,1);   // Modell-Rahmen: y oben, Nase -z, Meter; Schwerpunkt in den Ursprung
 const glassMat=new THREE.MeshStandardMaterial({color:0x9fb6c8,transparent:true,opacity:0.14,roughness:0.03,metalness:0.1,side:THREE.DoubleSide,depthWrite:false});
 const STRUCT=/^(fuzel_I01|kabina|dvig|dvig01|dvig_stv|dvig_stv01|Line\d+|Object01|Object12|Cone0\d|Box01|Cylinder01)$/;
 inner.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;const base=(o.name||'').split('-')[0],mn=o.material.name||'';
  if(/kabina/i.test(mn)||o.material.transparent){o.material=glassMat;o.castShadow=false;o.renderOrder=2;}
  else{o.material=o.material.clone();o.material.side=THREE.DoubleSide;o.material.color.multiplyScalar(0.35);o.material.roughness=0.55;}
  if(!STRUCT.test(base))o.userData.gear=1;});
 return{wrap,gearPts:[V3(0,-1.94,-9.14),V3(-2.48,-1.92,2.44),V3(2.48,-1.92,2.44)],tips:[V3(-8.3,0.25,9.0),V3(8.3,0.25,9.0)],
  crash:[V3(0,-0.3,-19.6),V3(-8.3,0.25,9.0),V3(8.3,0.25,9.0)],belly:V3(0,-0.5,0),extraBelly:[V3(-4.27,-0.55,5),V3(4.27,-0.55,5)],
  eye:V3(0,0.75,-13.5),panel:V3(0,0.43,-14.05),tail:V3(0,0.6,12.3),nozzles:[V3(-4.27,0.385,9.45),V3(4.27,0.385,9.45)]};}
function buildSR71(){const m=base(),T=SR71,w=T.wrap.clone(true);m.group.add(w);m.gearOn=[];m.gearOff=[];
 w.traverse(o=>{if(!o.isMesh)return;o.geometry.userData.keep=true;if(o.userData.gear)m.gearOn.push(o);});
 m.gearPts=T.gearPts.map(v=>v.clone());m.tips=T.tips.map(v=>v.clone());m.crashPts=T.crash.map(v=>v.clone());m.belly=T.belly.clone();m.extraBelly=T.extraBelly.map(v=>v.clone());
 const abMat=new THREE.MeshBasicMaterial({color:new THREE.Color(4,1.8,0.6),transparent:true,opacity:0.85,blending:THREE.AdditiveBlending,depthWrite:false});
 for(const n of T.nozzles){const cg=coneZ(0.62,4.2,16,true);cg.translate(0,0,2.1);const c=mk(m.group,cg,abMat,n.x,n.y,n.z);c.castShadow=false;m.ab.push(c);
  // Schockdiamanten im Nachbrennerstrahl
  for(let k=1;k<=3;k++){const d=new THREE.Mesh(new THREE.SphereGeometry(0.28-k*0.05,10,8),abMat);d.scale.z=1.8;d.position.set(0,0,k*1.05);c.add(d);}}
 return finish(m,{eye:T.eye.clone(),panel:T.panel.clone(),pw:0.9,ph:0.28,camD:36,camH:7,shadowR:24,nav:0.12,tail:T.tail.clone()});}

/* ===== Lockheed F-117 Nighthawk aus eingebettetem GLB (Modell ohne Fahrwerk -> prozedurales Fahrwerk) ===== */
let F117=null;
async function loadF117(){const el=$('f117glb');if(!el)return null;
 const bin=Uint8Array.from(atob(el.textContent.trim()),c=>c.charCodeAt(0));el.remove();
 const gl=await gltfL().parseAsync(bin.buffer,'');let inner=null;gl.scene.traverse(o=>{if(!inner&&/cleaner|F-?117/i.test(o.name||'')&&o.children.length>3)inner=o;});if(!inner)return null;
 inner.parent.remove(inner);const wrap=new THREE.Group();wrap.add(inner);
 // Modell-Rahmen: x quer, y längs (Nase -y), z oben, Meter -> Spiel: y oben, Nase -z; Schwerpunkt in den Ursprung
 inner.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(-1,0,0),V3(0,0,1),V3(0,1,0)));inner.scale.set(1,1,1);inner.position.set(0,-0.5,1.0);
 const glassMat=new THREE.MeshStandardMaterial({color:0x9a8a50,transparent:true,opacity:0.16,roughness:0.03,metalness:0.4,side:THREE.DoubleSide,depthWrite:false});
 inner.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;
  if(o.material.transparent){o.material=glassMat;o.castShadow=false;o.renderOrder=2;}else o.material.side=THREE.DoubleSide;});
 return{wrap};}
function buildF117(){const m=base(),w=F117.wrap.clone(true);m.group.add(w);w.traverse(o=>{if(o.isMesh)o.geometry.userData.keep=true;});
 gearLeg(m,0,-0.95,-3.5,1.15,0.32,0.07,'x',-1);gearLeg(m,-2.1,-0.95,1.3,1.15,0.38,0.08,'z',1);gearLeg(m,2.1,-0.95,1.3,1.15,0.38,0.08,'z',-1);
 m.tips=[V3(-6.5,-0.5,6.0),V3(6.5,-0.5,6.0)];m.crashPts=[V3(0,-0.5,-9.2),V3(-6.5,-0.5,6.0),V3(6.5,-0.5,6.0)];m.belly=V3(0,-1.0,0);
 const panel=V3(0,0.25,-5.6),r=finish(m,{eye:V3(0,0.82,-4.65),panel,pw:0.6,ph:0.2,camD:26,camH:5.5,shadowR:16,nav:0.08,tail:V3(0,1.5,11.4)});
 r.group.children.forEach(c=>{if(c.isGroup&&c.position.equals(panel))c.visible=false;});   // eigenes, detailliertes Cockpit des Modells statt Zusatz-Bildschirmen
 return r;}

function buildAirliner(){const m=base(),g=m.group,W=M(0xf4f6f8,0.35,0.15),B=M(0x1d4ea6,0.4,0.2),Gr=M(0xaab2bb,0.45,0.5),D=M(0x1a1f26,0.3,0.6);
 mk(g,cylZ(2,2,28,24,true),W);mk(g,new THREE.SphereGeometry(2,24,16),W,0,0,-14).scale.set(1,1,2);
 mk(g,new THREE.SphereGeometry(2.03,24,6,Math.PI*1.5-0.9,1.8,1.05,0.32),D,0,0,-14).scale.set(1,1,2);
 mk(g,coneZ(2,8,24,true),W,0,0,18);mk(g,new THREE.BoxGeometry(4.06,0.26,24),D,0,0.55,-1);
 mk(g,flat([[1.8,-3.5],[17,5],[17,7],[1.8,4.5]],0.4),Gr,0,-1.3,0,0,0,0.06);mk(g,flat([[-1.8,-3.5],[-1.8,4.5],[-17,7],[-17,5]],0.4),Gr,0,-1.3,0,0,0,-0.06);
 for(const s of [-1,1]){mk(g,new THREE.BoxGeometry(0.12,2.0,1.3),B,s*17,0.6,6.4);mk(g,cylZ(1.05,0.85,4.2,20),Gr,s*5.6,-2.6,-2.0);
  const fd=new THREE.CircleGeometry(0.95,20);fd.rotateY(Math.PI);mk(g,fd,D,s*5.6,-2.6,-4.11);mk(g,new THREE.BoxGeometry(0.3,1.0,3.2),Gr,s*5.6,-1.75,-1.4);}
 mk(g,flat([[0.8,11.5],[6.4,15.3],[6.4,16.5],[0.8,15.6]],0.25),W,0,0.9,0);mk(g,flat([[-0.8,11.5],[-0.8,15.6],[-6.4,16.5],[-6.4,15.3]],0.25),W,0,0.9,0);
 mk(g,fin([[11,1.6],[16.5,1.6],[19.5,9.2],[17,9.2]],0.35),B);
 gearLeg(m,0,-1.6,-11.5,1.75,0.45,0.12,'x',-1);gearLeg(m,-3.2,-1.4,1.6,1.8,0.6,0.16,'z',1);gearLeg(m,3.2,-1.4,1.6,1.8,0.6,0.16,'z',-1);
 m.tips=[V3(-17,-0.3,6.6),V3(17,-0.3,6.6)];m.crashPts=[V3(0,0,-18),V3(-17,-0.3,6.6),V3(17,-0.3,6.6)];m.extraBelly=[V3(-5.6,-3.65,-2),V3(5.6,-3.65,-2)];m.belly=V3(0,-2.05,0);
 return finish(m,{eye:V3(-0.6,0.85,-15.6),panel:V3(0,0.2,-16.7),pw:2.0,ph:0.45,camD:70,camH:15,shadowR:40,nav:0.22,tail:V3(0,9.2,19.4)});}

/* ================= Flugzeugtypen (SI-Einheiten) ================= */
const TYPES={
 cessna:{name:'Cessna-172-Stil (Sport)',build:buildCessna,m:1100,S:16.2,prop:true,T:3800,vT:90,cl0:0.3,cla:5.0,clf:0.6,aStall:0.27,cd0:0.03,k:0.06,cdf:0.05,cdg:0,cdsb:0,mcrit:0.6,wave:2,
  rate:[1.3,0.7,1.9],agil:4,qRef:1500,stabP:1.0,stabY:1.6,dih:0.35,I:[1825,2667,1285],gLim:4.4,maxSink:3.5,gearFixed:true,torque:0.10,mu:0.35,vApp:36,thrApp:0.38,flApp:2},
 airliner:{name:'A320-Stil (Airliner)',build:buildAirliner,m:64000,S:122,T:210000,cl0:0.25,cla:5.2,clf:1.0,aStall:0.24,cd0:0.022,k:0.045,cdf:0.07,cdg:0.025,cdsb:0.04,mcrit:0.78,wave:10,
  rate:[0.38,0.22,0.6],agil:1.6,qRef:9000,stabP:0.7,stabY:1.2,dih:0.2,I:[9.5e6,1.5e7,6e6],gLim:2.5,maxSink:3.2,mu:0.45,vApp:74,thrApp:0.42,flApp:2},
 jet:{mmax:2.25,name:'F-22-Stil (Kampfjet)',build:buildJet,m:25000,S:78,T:210000,ab:1.55,cl0:0.05,cla:4.2,clf:0.35,aStall:0.45,cd0:0.017,k:0.12,cdf:0.05,cdg:0.03,cdsb:0.08,mcrit:0.92,wave:0.35,waveCap:0.35,
  rate:[1.25,0.6,4.2],agil:6,qRef:12000,stabP:0.8,stabY:1.4,dih:0,I:[2.3e5,3e5,4e4],gLim:9,maxSink:5,mu:0.5,vApp:82,thrApp:0.35,flApp:1}};
TYPES.f15={mmax:2.5,name:'F-15C Eagle (3D-Modell)',build:buildF15,m:20000,S:56.5,T:135000,ab:1.6,cl0:0.05,cla:4.0,clf:0.3,aStall:0.42,cd0:0.018,k:0.12,cdf:0.05,cdg:0.03,cdsb:0.1,mcrit:0.9,wave:0.4,waveCap:0.35,
 rate:[1.1,0.5,3.6],agil:5,qRef:11000,stabP:0.8,stabY:1.4,dih:0,I:[1.9e5,2.3e5,3.5e4],gLim:9,maxSink:5,mu:0.5,vApp:75,thrApp:0.4,flApp:1};
TYPES.b747={name:'Boeing 747 VC-25 (Air Force One)',build:buildB747,m:280000,S:511,T:1000000,cl0:0.25,cla:5.5,clf:1.1,aStall:0.24,cd0:0.022,k:0.045,cdf:0.07,cdg:0.02,cdsb:0.04,mcrit:0.82,wave:10,
 rate:[0.3,0.2,0.5],agil:1.4,qRef:9000,stabP:0.7,stabY:1.2,dih:0.2,I:[4.4e7,6.7e7,2.5e7],gLim:2.5,maxSink:3.0,mu:0.45,vApp:75,thrApp:0.45,flApp:2};
TYPES.sr71={name:'SR-71 Blackbird (Mach 3+)',build:buildSR71,m:50000,S:170,T:250000,ab:1.5,ram:1.05,mmax:3.4,cl0:0.0,cla:3.2,clf:0.05,aStall:0.42,cd0:0.011,k:0.2,cdf:0,cdg:0.025,cdsb:0.06,mcrit:0.95,wave:0.22,waveCap:0.3,
 rate:[0.9,0.4,2],agil:3,qRef:15000,stabP:0.8,stabY:1.4,dih:0,I:[1.5e6,1.6e6,1.6e5],gLim:3,maxSink:3.5,mu:0.4,vApp:82,thrApp:0.55,flApp:0};
TYPES.f117={name:'F-117 Nighthawk (Stealth)',build:buildF117,m:18000,S:73,T:96000,cl0:0,cla:2.8,clf:0,aStall:0.35,cd0:0.02,k:0.2,cdf:0,cdg:0.03,cdsb:0.08,mcrit:0.85,wave:8,mmax:0.95,
 rate:[0.9,0.4,2],agil:3,qRef:9000,stabP:0.8,stabY:1.4,dih:0,I:[1.6e5,2e5,6e4],gLim:6,maxSink:3.5,mu:0.5,vApp:85,thrApp:0.5,flApp:0};
TYPES.airliner.rev=TYPES.b747.rev=true;TYPES.cessna.cmf=0.05;TYPES.airliner.cmf=TYPES.b747.cmf=-0.04;
const ORDER=['sr71','f117','f15','b747','cessna','airliner','jet'];
/* Stabilitäts- und Steuerderivate (pro rad), Bezugsflügeltiefe c, Spannweite b; fbw = Fly-by-Wire-Regler */
const AERO={
 b747:{c:8.3,b:64.4,spool:0.4,Cma:-1.0,Cmq:-25,Cmde:1.3,Clda:0.1,Clp:-0.45,Clb:-0.1,Cndr:0.08,Cnr:-0.25,Cnb:0.12,Cnda:-0.005,cyb:0.8,deMax:0.45,daMax:0.35,drMax:0.35,steer:0.5,fbw:true,qMax:0.1,pMax:0.2,atrim:0.04},
 sr71:{c:11,b:16.9,spool:1.0,Cma:-0.3,Cmq:-12,Cmde:0.9,Clda:0.12,Clp:-0.3,Clb:-0.05,Cndr:0.08,Cnr:-0.25,Cnb:0.09,Cnda:0,cyb:0.6,deMax:0.4,daMax:0.35,drMax:0.35,steer:0.5,fbw:true,qMax:0.3,pMax:1.4,atrim:0.06},
 f117:{c:9,b:13.2,spool:1.0,Cma:-0.15,Cmq:-12,Cmde:0.8,Clda:0.12,Clp:-0.3,Clb:-0.05,Cndr:0.07,Cnr:-0.25,Cnb:0.08,Cnda:0,cyb:0.6,deMax:0.4,daMax:0.35,drMax:0.35,steer:0.5,fbw:true,qMax:0.35,pMax:1.6,atrim:0.05},
 cessna:{c:1.49,b:11,T:3200,pw:120000,spool:2.5,Cma:-0.89,Cmq:-12.4,Cmde:1.28,Clda:0.18,Clp:-0.47,Clb:-0.09,Cndr:0.065,Cnr:-0.1,Cnb:0.065,Cnda:-0.01,cyb:0.6,deMax:0.35,daMax:0.3,drMax:0.3,steer:0.6,ptq:420,pfac:250,atrim:0.03,k:0.057},
 airliner:{c:4.2,b:34,spool:0.45,Cma:-1.0,Cmq:-25,Cmde:1.4,Clda:0.1,Clp:-0.5,Clb:-0.1,Cndr:0.08,Cnr:-0.2,Cnb:0.12,Cnda:-0.005,cyb:0.8,deMax:0.45,daMax:0.35,drMax:0.35,steer:0.5,fbw:true,qMax:0.12,pMax:0.26,atrim:0.04,I:[4e6,7e6,2.6e6],k:0.042},
 jet:{c:5.7,b:13.6,spool:1.2,Cma:-0.3,Cmq:-18,Cmde:1.2,Clda:0.18,Clp:-0.35,Clb:-0.05,Cndr:0.1,Cnr:-0.3,Cnb:0.1,Cnda:0,cyb:0.7,deMax:0.4,daMax:0.35,drMax:0.35,steer:0.5,fbw:true,qMax:0.55,pMax:4.0,atrim:0.03},
 f15:{c:4.9,b:13,spool:1.0,Cma:-0.4,Cmq:-15,Cmde:1.1,Clda:0.15,Clp:-0.35,Clb:-0.06,Cndr:0.09,Cnr:-0.25,Cnb:0.1,Cnda:0,cyb:0.7,deMax:0.4,daMax:0.35,drMax:0.35,steer:0.5,fbw:true,qMax:0.5,pMax:3.3,atrim:0.03}};
for(const k in AERO){Object.assign(TYPES[k],AERO[k]);TYPES[k].cm0=-TYPES[k].Cma*TYPES[k].atrim;}
let acType='cessna',tod=14,simTime=0,paused=false,menuOpen=false,camMode=1;
const ac={P:null,model:null,pos:new THREE.Vector3(),vel:new THREE.Vector3(),q:new THREE.Quaternion(),omega:new THREE.Vector3(),thr:0,flaps:0,flapsSet:0,gearDown:true,gearAnim:1,
 brakes:false,onGround:true,g:1,n1:0,abN:0,trim:0,fbwI:0,ias:0,seed:Math.random()*10,alpha:0,stall:0,mach:0,ab:false,crashed:null,wasG:[],lastTip:[]};
const input={pitch:0,roll:0,yaw:0};

function spawn(air){const A=ac,P=A.P,m=A.model;
 A.vel.set(0,0,0);A.omega.set(0,0,0);A.q.identity();A.thr=0;A.flapsSet=0;A.flaps=0;A.gearDown=true;A.gearAnim=1;A.crashed=null;A.g=1;A.lastTip=[];A.brakes=false;A.n1=0;A.abN=0;A.trim=0;A.fbwI=0;A.ias=0;
 const r=curRw,yaw=new THREE.Quaternion().setFromAxisAngle(Y,-r.hdg);
 if(!air){const[x,z]=r.W(0,r.hl-60);A.pos.set(x,r.elev-m.gearY+0.03,z);A.q.copy(yaw);A.wasG=m.gearPts.map(()=>true);A.onGround=true;}
 else{const V=P.vApp,gs=3*DEG,lz=r.hl+5500,[x,z]=r.W(0,lz);A.flapsSet=P.flApp;A.flaps=P.flApp/3;A.thr=P.thrApp;A.n1=P.thrApp;A.pos.set(x,r.elev+(lz-r.hl+300)*Math.tan(gs)-m.gearY,z);
  A.vel.set(V*Math.cos(gs)*r.s,-V*Math.sin(gs),-V*Math.cos(gs)*r.c);const rho=1.225*Math.exp(-A.pos.y/8500),CL=P.m*9.81/(0.5*rho*V*V*P.S);
  A.q.copy(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(X,(CL-P.cl0-A.flaps*P.clf)/P.cla-gs));A.wasG=m.gearPts.map(()=>false);A.onGround=false;}
 fbPos=null;if(typeof AP!=='undefined')AP.on=false;if(P.tank)tankSpawn();else ac.tank=null;}

/* ================= Flugphysik (Auftrieb, Widerstand, Schub, Gewicht, Fahrwerk) ================= */
const _f=new THREE.Vector3(),_u=new THREE.Vector3(),_r=new THREE.Vector3(),_F=new THREE.Vector3(),_T=new THREE.Vector3(),_vd=new THREE.Vector3(),_ld=new THREE.Vector3(),
 _wp=new THREE.Vector3(),_rr=new THREE.Vector3(),_pv=new THREE.Vector3(),_wW=new THREE.Vector3(),_fg=new THREE.Vector3(),_rg=new THREE.Vector3(),_gF=new THREE.Vector3(),
 _t1=new THREE.Vector3(),_qi=new THREE.Quaternion(),_dq=new THREE.Quaternion();
const WIND_KT=[0,6,15,25],wind=new THREE.Vector3(),_va=new THREE.Vector3(),_n=new THREE.Vector3(),_wf=new THREE.Vector3(),_wl=new THREE.Vector3(),_tb=new THREE.Vector3();
function updWind(t){const sp=WIND_KT[cfg.wind??1]/KT,h=(typeof curRw!=='undefined'&&curRw?curRw.hdg:330*DEG),g=1+0.25*Math.sin(t*0.7)+0.15*Math.sin(t*1.9+1)+0.1*Math.sin(t*4.3);
 const agl=Math.max(1,ac.pos.y-groundH(ac.pos.x,ac.pos.z)),prof=clamp(Math.log(agl/0.05)/Math.log(300/0.05),0.35,1);
 wind.set(-Math.sin(h),0,Math.cos(h)).multiplyScalar(sp*g*prof);const tb=sp*0.15*(1-smooth(300,1500,agl));
 wind.x+=tb*Math.sin(t*3.1+ac.pos.z*0.01);wind.y+=tb*0.6*Math.sin(t*2.3+ac.pos.x*0.013);wind.z+=tb*Math.sin(t*2.7+ac.pos.x*0.008);}
function step(dt){const A=ac,P=A.P,m=A.model,q=A.q;if(P.tank){stepTank(dt);return;}
 _f.set(0,0,-1).applyQuaternion(q);_u.set(0,1,0).applyQuaternion(q);_r.set(1,0,0).applyQuaternion(q);
 // Anströmung relativ zur (bewegten) Luftmasse
 _va.copy(A.vel).sub(wind);
 const V=_va.length(),alt=A.pos.y,rho=1.225*Math.exp(-Math.max(alt,0)/8500),qd=0.5*rho*V*V,V2=Math.max(V,5);
 const vF=_va.dot(_f),vU=_va.dot(_u),vR=_va.dot(_r);
 const a=V>1?Math.atan2(-vU,vF):0,beta=V>1?Math.asin(clamp(vR/V,-1,1)):0;
 A.ias=V*Math.sqrt(rho/1.225);A.alpha=a;
 // Bodeneffekt (weniger induzierter Widerstand unter ~1 Spannweite)
 const hA=Math.max(0.1,A.pos.y+m.gearY-groundH(A.pos.x,A.pos.z)),ge=(16*hA/P.b)**2,geF=ge/(1+ge);
 // Auftrieb inkl. Strömungsabriss -> Platten-Strömung
 const aS=P.aStall+A.flaps*0.03,over=a>aS?a-aS:a<-aS?-aS-a:0,bl=smooth(0,0.12,over);
 const att=a>0?Math.min(P.cl0+P.cla*a,P.cl0+P.cla*aS):Math.max(P.cl0+P.cla*a,P.cl0-P.cla*aS);
 let cl=lerp(att,1.8*Math.sin(a)*Math.cos(a),bl)+A.flaps*P.clf*(1-bl);cl*=1+0.1*(1-geF);
 const spl=A.onGround&&(A.brakes||(P.rev&&A.thr<0.15))?1:0;A.spoil=toward(A.spoil||0,spl,dt*2.5);cl*=1-0.8*A.spoil;
 const Mach=V/sos(alt);let dm=Math.max(0,Mach-P.mcrit);if(P.waveCap)dm=Math.min(dm,P.waveCap);const sa=Math.sin(a);
 const cd=P.cd0+P.k*geF*cl*cl+A.flaps*P.cdf+A.gearAnim*P.cdg+P.wave*dm*dm+(P.mmax?3*Math.max(0,Mach-P.mmax)**2:0)+1.7*sa*sa*bl+Math.abs(beta)*0.25+(A.brakes?P.cdsb*(A.onGround?1.5:1):0)+0.08*(A.spoil||0);
 A.stall=over;A.mach=Mach;
 _F.set(0,0,0);
 if(V>0.5){_vd.copy(_va).divideScalar(V);_ld.copy(_u).addScaledVector(_vd,-_u.dot(_vd));if(_ld.lengthSq()>1e-8)_ld.normalize();
  _F.addScaledVector(_ld,qd*P.S*cl).addScaledVector(_vd,-qd*P.S*cd).addScaledVector(_r,-qd*P.S*P.cyb*beta);}
 // Triebwerk mit Hochlaufzeit (N1), Propeller: Leistung/Geschwindigkeit
 A.n1+=(Math.max(A.thr,0)-A.n1)*(1-Math.exp(-P.spool*dt));let T;
 if(P.prop)T=Math.min(P.T*A.n1,0.8*P.pw*A.n1/Math.max(vF,1))*(rho/1.225);
 else{A.abN+=((A.thr>0.95&&P.ab&&A.n1>0.9?1:0)-A.abN)*(1-Math.exp(-2*dt));A.ab=A.abN>0.3;T=P.ram?P.T*A.n1*Math.pow(rho/1.225,0.3)*(1+P.ram*Math.min(Mach,3.4)):P.T*A.n1*(0.35+0.65*rho/1.225)*(1+0.15*Math.min(Mach,1.5));if(P.ab)T*=1+(P.ab-1)*A.abN;}
 {const rc=A.onGround?clamp(-A.thr/0.1,0,1):0;A.revN=toward(A.revN||0,rc,dt*(P.prop?2.5:1.5));if(A.revN>0.01)T-=P.T*0.6*A.revN*clamp(A.vel.length()/12,0.35,1);}
 _F.addScaledVector(_f,T);_F.y-=P.m*9.81;
 // Bodenkontakt auf dem echten Gelände-Mesh (Hangneigung, Untergrund, Reifenkräfte)
 _T.set(0,0,0);let onG=false,crash=null;_wW.copy(A.omega).applyQuaternion(q);
 _fg.set(_f.x,0,_f.z);if(_fg.lengthSq()<1e-6)_fg.set(0,0,-1);_fg.normalize();
 const gearOK=P.gearFixed||A.gearAnim>0.98,isG=gearOK,pts=gearOK?m.gearPts:m.bellyPts,n=pts.length;
 const kg=P.m*9.81/(n*(isG?0.07:0.05)),cg=1.8*Math.sqrt(kg*P.m/n);
 for(let i=0;i<n;i++){_wp.copy(pts[i]).applyQuaternion(q).add(A.pos);
  const th=physH(_wp.x,_wp.z,true);_n.copy(_gn);const pen=(Math.max(th,0)+(isG?0.075:0)-_wp.y)*(th<0?1:_n.y);   // Reifen-/Federweg-Einfederung ausgleichen: Räder stehen sichtbar auf der Bahn
  const ice=ICE_ON&&th<0.2,wat=P.sea&&th<0.2&&!ice;if(wat||ice)_n.set(0,1,0);
  if(pen>0){if(th<0.2&&!P.sea&&!ICE_ON){crash='Ins Wasser gestürzt';break;}
   _rr.copy(_wp).sub(A.pos);_pv.copy(_wW).cross(_rr).add(A.vel);const vn=_pv.dot(_n);
   if(!A.wasG[i]){const lim=wat?4.2:isG?P.maxSink:2.5,sink=Math.min(_pv.y,vn*0.5);if(sink<-2*lim)crash=(wat?'Zu hart aufs Wasser geklatscht':isG?'Zu harte Landung':'Bauchlandung zu hart')+' ('+Math.round(-sink*196.85)+' ft/min)';
    else if((isG||wat)&&simTime-(A.lastTD||-99)>0.6){if(wat)sBurst('lowpass',500,0.7,0.5,0.6);const fpm=Math.round(-sink*196.85),air=simTime-(A.lastLift||-99);A.lastTD=simTime;A.shake=Math.max(A.shake||0,clamp(fpm/500,0.15,1.5));
     if(air>0.25&&air<6&&A.landed){A.bounces=(A.bounces||0)+1;flash('BOUNCE ×'+A.bounces+'  ('+fpm+' ft/min)');sThump();}
     else if(!A.landed&&A.vel.length()>15){A.landed=true;A.tdFpm=fpm;A.tdX=A.pos.x;A.tdZ=A.pos.z;A.tdT=simTime;A.bounces=0;flash(fpm<120?'Butterweich! ('+fpm+' ft/min)':fpm<300?'Gute Landung ('+fpm+' ft/min)':fpm<600?'Feste Landung ('+fpm+' ft/min)':'Harte Landung! ('+fpm+' ft/min)');if(fpm>300)sThump();}}else if(vn<-0.6||V>20)touchSmoke(_wp,Math.min(1,-vn/3+V/80));}
   if(pen>2&&!wat)crash='Fahrwerk gebrochen';
   const N=Math.max(0,kg*pen-cg*vn*(isG?(vn<0?0.42:0.14):1));
   _wf.copy(_fg).addScaledVector(_n,-_fg.dot(_n)).normalize();_wl.copy(_wf).cross(_n);
   if((isG||wat)&&i===0){const st=clamp(input.yaw+input.roll,-1,1)*P.steer*clamp(1-V/45,0.15,1),c=Math.cos(st),sn=Math.sin(st);_t1.copy(_wf).multiplyScalar(c).addScaledVector(_wl,sn);_wl.multiplyScalar(c).addScaledVector(_wf,-sn);_wf.copy(_t1);}
   const rw=onPaved(_wp.x,_wp.z);
   const muB=isG&&i!==(m.noseI??(m.noseI=m.gearPts.reduce((b,p,k,a)=>p.z<a[b].z?k:b,0)))&&A.brakes?Math.max(P.mu,0.5)*(rw?1:0.6):0,mu=ice?(isG?0.02+(muB?0.13:0):0.07):wat?0.1+0.1*smooth(3,13,V)*(1-smooth(17,33,V))+0.00009*V*V:Math.max(isG?(rw?0.015:0.06):0.45,muB),muL=ice?(isG?0.06:0.05):wat?0.45:isG?(rw?0.85:0.6):0.45;
   _gF.copy(_n).multiplyScalar(N).addScaledVector(_wf,-Math.tanh(_pv.dot(_wf)/0.3)*mu*N).addScaledVector(_wl,-Math.tanh(_pv.dot(_wl)/0.4)*muL*N);
   if(wat&&V>3&&Math.random()<0.18){const c=0.9;emit(_wp.x,0.2,_wp.z,(Math.random()-.5)*4-A.vel.x*0.15,1.5+Math.random()*3*Math.min(V/20,2),(Math.random()-.5)*4-A.vel.z*0.15,0.8+Math.random()*0.6,1.2,2.6+V*0.05,0.6,c,c,c);}
   _F.add(_gF);_T.add(_t1.copy(_rr).cross(_gF));onG=true;A.wasG[i]=true;}else A.wasG[i]=false;}
 // Nase/Flügelspitzen: schrammen statt sofort Crash; Crash nur bei echtem Aufprall
 if(!crash)for(const c of m.crashPts){_wp.copy(c).applyQuaternion(q).add(A.pos);const th=physH(_wp.x,_wp.z,true),pen=Math.max(th,0)-_wp.y;
  if(pen>0){if(th<0.2&&!P.sea&&!ICE_ON){crash='Ins Wasser gestürzt';break;}_n.copy(_gn);if((P.sea||ICE_ON)&&th<0.2)_n.set(0,1,0);_rr.copy(_wp).sub(A.pos);_pv.copy(_wW).cross(_rr).add(A.vel);const vn=_pv.dot(_n);
   if(vn<-7||pen>2.5){crash='Aufprall – Struktur zerstört';break;}
   const kc=P.m*9.81/0.25,N=Math.max(0,kc*pen-1.5*Math.sqrt(kc*P.m)*vn);_gF.copy(_n).multiplyScalar(N);
   _t1.copy(_pv).addScaledVector(_n,-vn);const vt=_t1.length();if(vt>0.01)_gF.addScaledVector(_t1,-0.5*N/Math.max(vt,0.5));
   _F.add(_gF);_T.add(_t1.copy(_rr).cross(_gF));onG=true;}}
 if(crash){A.crashed=crash;crashFx();return;}
 if(A.onGround&&!onG)A.lastLift=simTime;if(!onG&&A.pos.y+m.gearY-groundH(A.pos.x,A.pos.z)>15)A.landed=false;
 A.onGround=onG;
 // Ruder: mechanisch (Cessna, mit Trimmung) oder Fly-by-Wire (Nickraten-/G-Befehl, Rollratenbefehl, Gierdämpfer, Alpha-Schutz)
 const w=A.omega,p=-w.z,qq=w.x,r=-w.y,ac2=clamp(a,-0.6,0.6);let de,da,dr;
 if(P.fbw){
  if(onG&&A.ias<35)A.fbwI=0;
  const qMax=Math.min(P.qMax,P.gLim*9.81/V2);let qc=input.pitch*(input.pitch>0?qMax:qMax*0.5);
  if(a>aS*0.85)qc=Math.min(qc,-(a-aS*0.85)*3);
  if(A.g<-P.gLim*0.35&&qc<0)qc=0;
  A.fbwI=clamp(A.fbwI+(qc-qq)*dt*2,-2,2);
  de=-(P.Cma*ac2+P.Cmq*qq*P.c/(2*V2)-0.25*bl)/P.Cmde+(4*(qc-qq)+A.fbwI)*P.I[0]/Math.max(qd*P.S*P.c*P.Cmde,1);
  da=-(P.Clb*beta+P.Clp*p*P.b/(2*V2))/P.Clda+5*(input.roll*P.pMax-p)*P.I[2]/Math.max(qd*P.S*P.b*P.Clda,1);
  const bk=Math.atan2(-_r.y,_u.y);dr=input.yaw*P.drMax+beta*2.5-(r-9.81*Math.tan(clamp(bk,-1.2,1.2))/V2*Math.cos(clamp(Math.asin(clamp(_f.y,-1,1)),-1.5,1.5)))*0.8;
 }else{de=input.pitch*P.deMax+A.trim*P.deMax*0.5;if(a>aS*0.7&&de>0)de*=clamp(1-(a-aS*0.7)/(aS*0.25),0,1);/* Strömungsabriss-Schutz: Nase-hoch wird kurz vorm Abriss zurückgenommen */da=input.roll*P.daMax;dr=input.yaw*P.drMax;}
 de=clamp(de,-P.deMax,P.deMax);da=clamp(da,-P.daMax,P.daMax);dr=clamp(dr,-P.drMax,P.drMax);
 // Aerodynamische Momente (Nick/Roll/Gier) aus Stabilitätsderivaten
 const Mp=qd*P.S*P.c*((P.cmf||0)*A.flaps+P.Cma*ac2+P.Cmde*de+P.Cmq*qq*P.c/(2*V2)-0.25*bl);
 const Lr=qd*P.S*P.b*(P.Clda*da+P.Clp*p*P.b/(2*V2)+P.Clb*beta+bl*0.05*Math.sin(simTime*0.9+A.seed));
 const Nr=qd*P.S*P.b*(P.Cndr*dr+P.Cnr*r*P.b/(2*V2)+P.Cnb*beta+P.Cnda*da);
 let tx=Mp,ty=-Nr,tz=-Lr;
 /* Propeller-Drehmoment & P-Faktor ausgeschaltet: zogen das Flugzeug ohne Eingabe nach links */
 _qi.copy(q).invert();_tb.copy(_T).applyQuaternion(_qi);tx+=_tb.x;ty+=_tb.y;tz+=_tb.z;
 // Euler-Gleichungen inkl. Kreiseleffekt
 const Ix=P.I[0],Iy=P.I[1],Iz=P.I[2];
 tx-=w.y*Iz*w.z-w.z*Iy*w.y;ty-=w.z*Ix*w.x-w.x*Iz*w.z;tz-=w.x*Iy*w.y-w.y*Ix*w.x;
 w.x+=tx/Ix*dt;w.y+=ty/Iy*dt;w.z+=tz/Iz*dt;if(onG&&V<3)w.multiplyScalar(1-3*dt);
 A.vel.addScaledVector(_F,dt/P.m);A.pos.addScaledVector(A.vel,dt);
 const ang=w.length()*dt;if(ang>1e-9){_dq.setFromAxisAngle(_t1.copy(w).normalize(),ang);q.multiply(_dq).normalize();}
 _F.y+=P.m*9.81;A.g=lerp(A.g,_F.dot(_u)/(P.m*9.81),0.08);}

function touchSmoke(p,k){sScreech(k);const c=0.8*(0.25+0.9*dayF),v=ac.vel;for(let i=0;i<6+18*k;i++)emit(p.x+(Math.random()-.5),p.y+0.3,p.z+(Math.random()-.5),v.x*0.25+(Math.random()-.5)*3,1+Math.random()*2,v.z*0.25+(Math.random()-.5)*3,1.8+Math.random(),1.2,4,0.5,c,c,c);}
function crashFx(){sBurst('lowpass',200,0.7,1,2.5);const p=ac.pos;for(let i=0;i<260;i++){const fire=i<110,r=Math.random;
 emit(p.x+(r()-.5)*6,p.y+r()*3,p.z+(r()-.5)*6,(r()-.5)*(fire?20:8),fire?r()*12:3+r()*6,(r()-.5)*(fire?20:8),fire?1+r():5+r()*3,fire?3:5,fire?5:12,fire?0.9:0.55,fire?4:0.06,fire?1.5:0.06,fire?0.3:0.06);}}
/* ================= Tag/Nacht & Umgebung ================= */
const sunDir=new THREE.Vector3(),moonDir=new THREE.Vector3(),fogCol=new THREE.Color(),tmpC=new THREE.Color();let sinE=1,dayF=1,nightF=0,dirL=sunDir;
function updEnv(){
 const e=Math.sin((tod-6)/24*Math.PI*2)*72*DEG,az=tod/24*Math.PI*2;
 sunDir.set(Math.cos(e)*Math.sin(az),Math.sin(e),-Math.cos(e)*Math.cos(az));sinE=sunDir.y;moonDir.copy(sunDir).negate();su.sunPosition.value.copy(sunDir);
 dayF=smooth(-0.12,0.2,sinE);nightF=1-dayF;const sunset=smooth(0.3,0,Math.abs(sinE-0.02))*(sinE>-0.12?1:0);
 fogCol.setRGB(lerp(0.015,0.66,dayF),lerp(0.02,0.76,dayF),lerp(0.045,0.9,dayF),THREE.SRGBColorSpace).lerp(tmpC.setRGB(0.95,0.55,0.35,THREE.SRGBColorSpace),sunset*0.5);
 scene.fog.color.copy(fogCol).multiplyScalar(1.3);
 const sunI=9*smooth(-0.02,0.22,sinE),moonI=0.8*smooth(-0.02,-0.25,sinE);
 if(sunI>=moonI){const t=smooth(0,0.35,sinE);light.color.setRGB(1,lerp(0.55,0.96,t),lerp(0.3,0.9,t));dirL=sunDir;}else{light.color.setRGB(0.55,0.65,1);dirL=moonDir;}
 light.intensity=Math.max(sunI,moonI);hemi.intensity=0.15+1.85*dayF;
 stars.material.opacity=1-smooth(-0.18,0.02,sinE);
 const cl=lerp(0.1,1.7,dayF);clouds.material.color.setRGB(cl,cl*lerp(1,0.8,sunset),cl*lerp(1.05,0.7,sunset));
 const L=lerp(2.5,10,nightF);lightMats.forEach(m=>m.color.copy(m.userData.base).multiplyScalar(L));
 navR.color.setRGB(L,0,0);navG.color.setRGB(0,L,0);navW.color.setScalar((simTime%1.3)<0.07?L*3:0);
 strobe.material.color.setScalar(L*2.5);strobe.position.set(0,RWY+1.2,2400-((simTime*2)%1)*880);
 const A=ac;papi.forEach(p=>{const{r,i}=p.userData,ang=Math.atan2(A.pos.y+A.model.gearY-r.elev,Math.hypot(A.pos.x-p.position.x,A.pos.z-p.position.z))/DEG;p.material.color.setRGB(L,ang>PAPI_TH[i]?L:0.05*L,ang>PAPI_TH[i]?L*0.95:0.04*L);});
 const wu=water.material.uniforms;wu.uT.value=simTime;wu.uSun.value.copy(dirL);wu.uSunC.value.copy(light.color).multiplyScalar(light.intensity*0.35);
 wu.uSky.value.copy(fogCol).multiplyScalar(1.2);wu.uFog.value.copy(scene.fog.color);wu.uFogD.value=scene.fog.density;wu.uDay.value=dayF;
 light.position.copy(A.pos).addScaledVector(dirL,1000);light.target.position.copy(A.pos);
 sky.position.copy(camera.position);stars.position.copy(camera.position);
 clouds.visible=cfg.gfx.clouds;clouds.position.x=(simTime*6)%4000;updGrade();
}

/* ================= Kameras ================= */
const CAMN=['Cockpit','Verfolger','Vorbeiflug','Orbit'];
const orbit={th:0.6,ph:1.25,r:30},camOff=new THREE.Vector3(),_cp=new THREE.Vector3();let fbPos=null;
const head={y:0,p:0},fol={y:0,p:0,z:1,t:0},_he=new THREE.Euler(0,0,0,'YXZ'),_hq=new THREE.Quaternion();
function setCam(i){camMode=i;head.y=head.p=fol.y=fol.p=0;fol.z=1;fbPos=null;orbit.r=ac.model.camD*1.3;camera.up.set(0,1,0);camOff.set(0,ac.model.camH,ac.model.camD).applyQuaternion(ac.q);flash('Kamera: '+CAMN[i]);}
function updCamera(dt){const A=ac,m=A.model;_f.set(0,0,-1).applyQuaternion(A.q);_u.set(0,1,0).applyQuaternion(A.q);_r.set(1,0,0).applyQuaternion(A.q);
 let fov=60;camera.near=POTATO?1:0.3;
 if(camMode===0){camera.position.copy(m.eye).applyQuaternion(A.q).add(A.pos);camera.quaternion.copy(A.q).multiply(_hq.setFromEuler(_he.set(head.p,head.y,0)));fov=72;camera.near=POTATO?0.15:0.05;}
 else if(camMode===1){if(!drag&&performance.now()-fol.t>1800){fol.y=Math.atan2(Math.sin(fol.y),Math.cos(fol.y));const k=1-Math.exp(-dt*1.5);fol.y=lerp(fol.y,0,k);fol.p=lerp(fol.p,0,k);}
  _cp.set(0,m.camH,m.camD).multiplyScalar(fol.z).applyEuler(_he.set(fol.p,fol.y,0)).applyQuaternion(A.q);camOff.lerp(_cp,1-Math.exp(-dt*4));camera.position.copy(A.pos).add(camOff);
  camera.up.copy(_u).lerp(Y,0.55).normalize();camera.lookAt(_cp.copy(A.pos).addScaledVector(_f,m.camD*0.4));}
 else if(camMode===2){const V=A.vel.length();
  if(!fbPos||(fbPos.distanceTo(A.pos)>Math.max(500,V*5)&&_cp.copy(A.pos).sub(fbPos).dot(A.vel)>0)){
   _vd.copy(V>5?A.vel:_f).normalize();fbPos=A.pos.clone().addScaledVector(_vd,Math.max(200,V*3)).addScaledVector(_r,m.camD*0.7);fbPos.y+=m.camH*0.6;fbPos.y=Math.max(fbPos.y,groundH(fbPos.x,fbPos.z)+3);}
  camera.position.copy(fbPos);camera.up.set(0,1,0);camera.lookAt(A.pos);fov=clamp(2400/Math.max(fbPos.distanceTo(A.pos),1),12,60);}
 else{camera.position.setFromSphericalCoords(orbit.r,orbit.ph,orbit.th).add(A.pos);camera.up.set(0,1,0);camera.lookAt(A.pos);}
 if(camMode>0){const gh=groundH(camera.position.x,camera.position.z)+1;if(camera.position.y<gh){camera.position.y=gh;camera.lookAt(A.pos);}}
 {const A2=ac,V=A2.vel.length();A2.shake=Math.max(0,(A2.shake||0)-dt*2.5);
  let k=A2.shake*0.6+(A2.onGround?clamp(V/60,0,1)*(onPaved(A2.pos.x,A2.pos.z)?0.05:0.3):0)+smooth(0,0.1,A2.stall)*0.6+(A2.mach>0.9&&A2.mach<1.1&&!A2.onGround?0.15:0)+(Math.abs(A2.g)>4?0.05*(Math.abs(A2.g)-4):0);
  if(k>0.002){const s=(camMode===0?0.012:0.03)*k*Math.min(1,m.camD/26),t=simTime;camera.position.x+=Math.sin(t*61)*s;camera.position.y+=Math.sin(t*73+1)*s;camera.position.z+=Math.sin(t*67+2)*s*0.5;
   if(camMode===0)camera.rotateZ(Math.sin(t*41)*0.004*k);}}
 camera.fov=fov;camera.updateProjectionMatrix();}

/* ================= Eingabe: Tastatur, Gamepad, Touch ================= */
const kbDown=new Set(),kbA={pitch:0,roll:0,yaw:0},touchIn={pitch:0,roll:0,thr:null},padIn={pitch:0,roll:0,yaw:0,thr:null};
let padHeld={},touchHeld={},padPrev=[],padName='',listenKey=null,listenPad=null;
const held=a=>Math.max(kbDown.has(cfg.kb[a])?1:0,padHeld[a]||0,touchHeld[a]?1:0);
const keyName=c=>!c?'—':c.replace(/^Key/,'').replace(/^Digit/,'').replace('Left',' L').replace('Right',' R').replace(/^Arrow/,'Pfeil ').replace('Control','Strg');
addEventListener('keydown',e=>{
 if(listenKey){e.preventDefault();if(e.code!=='Escape'){for(const a in cfg.kb)if(cfg.kb[a]===e.code)cfg.kb[a]='';cfg.kb[listenKey]=e.code;saveCfg();}listenKey=null;renderMenu();return;}
 if(e.code==='Escape'){if(mp.adminOpen){closeAdmin();return;}if(mp.lobbyOpen){closeLobby();return;}toggleMenu();return;}
 if(menuOpen)return;
 if(e.code.startsWith('Arrow')||e.code==='Space'||e.code==='Tab')e.preventDefault();
 kbDown.add(e.code);if(!e.repeat&&e.code==='ControlRight'&&cfg.kb.autoland==='ControlLeft')doAction('autoland');if(!e.repeat)for(const [a] of ACTIONS)if(!HOLD.has(a)&&cfg.kb[a]===e.code)doAction(a);});
addEventListener('keyup',e=>kbDown.delete(e.code));addEventListener('blur',()=>kbDown.clear());
let PAD=null,navIdx=0,navLast='',navT=0;
function rumble(ms,s,w){try{PAD&&PAD.vibrationActuator&&PAD.vibrationActuator.playEffect('dual-rumble',{duration:ms,strongMagnitude:s,weakMagnitude:w});}catch(e){}}
/* Menü/Lobby mit dem Controller bedienen: Steuerkreuz/Stick = Auswahl, A = OK, B = zurück, links/rechts = Auswahlliste ändern */
function padNav(gp,pr){const root=mp.lobbyOpen?$('lobbyWrap'):$('menuWrap'),it=[...root.querySelectorAll('button,select,input')].filter(e=>e.offsetParent!==null);if(!it.length)return;
 const ay=gp.axes[1]||0,ax=gp.axes[0]||0,d=pr[12]||ay<-0.6?'u':pr[13]||ay>0.6?'d':pr[14]||ax<-0.6?'l':pr[15]||ax>0.6?'r':'',now=performance.now();
 navIdx=clamp(navIdx,0,it.length-1);let el=it[navIdx];
 if(d&&(d!==navLast||now>navT)){navT=now+(d!==navLast?380:140);
  if(el.tagName==='SELECT'&&(d==='l'||d==='r')){el.selectedIndex=clamp(el.selectedIndex+(d==='r'?1:-1),0,el.options.length-1);el.dispatchEvent(new Event('change',{bubbles:true}));}
  else navIdx=clamp(navIdx+(d==='u'||d==='l'?-1:1),0,it.length-1);}
 navLast=d;
 const it2=[...root.querySelectorAll('button,select,input')].filter(e=>e.offsetParent!==null);navIdx=clamp(navIdx,0,it2.length-1);el=it2[navIdx];
 root.querySelectorAll('.padf').forEach(e=>{if(e!==el)e.classList.remove('padf');});if(el&&!el.classList.contains('padf')){el.classList.add('padf');el.scrollIntoView({block:'nearest'});}
 if(pr[0]&&!padPrev[0]&&el){if(el.tagName==='SELECT'){el.selectedIndex=(el.selectedIndex+1)%el.options.length;el.dispatchEvent(new Event('change',{bubbles:true}));}else if(el.tagName==='INPUT')el.focus();else{uiPulse(el);el.click();}}
 if(pr[1]&&!padPrev[1]){if(document.activeElement&&document.activeElement.tagName==='INPUT')document.activeElement.blur();else if(mp.lobbyOpen)closeLobby();else toggleMenu(false);}}
function pollPad(){padHeld={};padIn.pitch=padIn.roll=padIn.yaw=0;padIn.thr=null;
 let pads=[];try{pads=navigator.getGamepads?[...navigator.getGamepads()]:[];}catch(e){}let gp=null;
 for(const p of pads)if(p&&p.connected!==false&&p.buttons.length&&(!gp||(p.mapping==='standard')>(gp.mapping==='standard')||((p.mapping==='standard')===(gp.mapping==='standard')&&p.timestamp>gp.timestamp)))gp=p;
 PAD=gp;
 if(!gp)return;if(gp.id!==padName){padName=gp.id;const pi=$('padinfo');if(pi)pi.textContent='Erkannt: '+padName;}
 const pr=gp.buttons.map(b=>b.pressed||b.value>0.4);
 if(listenPad){const b=pr.findIndex((v,i)=>v&&!padPrev[i]);if(b>=0){cfg.pad[listenPad]=b;saveCfg();listenPad=null;renderMenu();}padPrev=pr;return;}
 if(pr[9]&&!padPrev[9]){if(mp.lobbyOpen)closeLobby();else toggleMenu();padPrev=pr;return;}
 if(menuOpen&&!listenKey){padNav(gp,pr);padPrev=pr;return;}
 if(!menuOpen){const dz=cfg.axes.dz,ax=i=>{if(i<0||i>=gp.axes.length)return 0;const v=gp.axes[i];return Math.abs(v)<dz?0:Math.sign(v)*(Math.abs(v)-dz)/(1-dz);};
  padIn.roll=ax(cfg.axes.roll);padIn.pitch=ax(cfg.axes.pitch)*(cfg.axes.inv?-1:1);padIn.yaw=ax(cfg.axes.yaw);
  if(cfg.axes.thr>=0&&cfg.axes.thr<gp.axes.length)padIn.thr=(1-gp.axes[cfg.axes.thr])/2;
  for(const [a] of ACTIONS){const b=cfg.pad[a];if(b<0||!gp.buttons[b])continue;const v=gp.buttons[b].value||(gp.buttons[b].pressed?1:0);
   if(HOLD.has(a))padHeld[a]=v;else if(pr[b]&&!padPrev[b])doAction(a);}}
 padPrev=pr;}
function gatherInput(dt){
 const tp=(held('pitchUp')||kbDown.has('ArrowDown')?1:0)-(held('pitchDown')||kbDown.has('ArrowUp')?1:0);
 const tr=(held('rollRight')||kbDown.has('ArrowRight')?1:0)-(held('rollLeft')||kbDown.has('ArrowLeft')?1:0);
 kbA.pitch=toward(kbA.pitch,tp,dt*3);kbA.roll=toward(kbA.roll,tr,dt*4);kbA.yaw=toward(kbA.yaw,held('yawRight')-held('yawLeft'),dt*3);
 input.pitch=clamp(kbA.pitch+padIn.pitch+touchIn.pitch,-1,1);input.roll=clamp(kbA.roll+padIn.roll+touchIn.roll,-1,1);input.yaw=clamp(kbA.yaw+padIn.yaw,-1,1);
 if(!menuOpen&&!paused){if(padIn.thr!==null)ac.thr=padIn.thr;ac.thr=clamp(ac.thr+(held('throttleUp')-held('throttleDown'))*0.5*dt,held('brakes')>0.3?-0.1:0,1);if(touchIn.thr!==null)ac.thr=touchIn.thr;}
 trDrunkIn(dt);ac.brakes=held('brakes')>0.3;ac.revCmd=ac.onGround&&ac.thr<0.02&&held('throttleDown')>0.3;if(!menuOpen&&!paused)ac.trim=clamp(ac.trim+(held('trimUp')-held('trimDown'))*0.3*dt,-1,1);}
let toast={t:0,msg:''};const flash=m=>{toast={t:2,msg:m};};
function doAction(a){const A=ac,P=A.P;if(menuOpen)return;if(P.tank&&['gear','flaps','autoland','approach'].includes(a))return;
 switch(a){
  case 'flaps':A.flapsSet=(A.flapsSet+1)%4;flash(`Landeklappen ${A.flapsSet}/3`);break;
  case 'gear':if(P.gearFixed)flash('Festes Fahrwerk');else if(A.onGround&&!(P.sea&&groundH(A.pos.x,A.pos.z)<0.3))flash('Fahrwerk am Boden gesperrt');else{A.gearDown=!A.gearDown;sThump();flash(A.gearDown?'Fahrwerk AUS':'Fahrwerk EIN');}break;
  case 'camera':setCam((camMode+1)%4);break;
  case 'aircraft':{const L=[...ORDER.slice(0,3),'seaplane','b2','tank'];setAircraft(L[(L.indexOf(acType)+1)%L.length]);}break;
  case 'time':tod=(tod+1)%24;flash('Tageszeit '+fmtT(tod));break;
  case 'restart':if(mp.lobby){mpSpawnRunway();break;}spawn(false);flash('Neustart: '+curRw.name+' Piste '+curRw.num);break;
  case 'approach':spawn(true);flash('Anflug '+curRw.name+' Piste '+curRw.num+' – 3° Gleitpfad, PAPI links');break;
  case 'sound':toggleBigMap();break;
  case 'autoland':toggleAP();break;
  case 'missile':fireMissile();break;
  case 'flares':dropFlares();break;
  case 'lobby':openLobby();break;
  case 'pause':if(!mp.lobby)paused=!paused;break;}}
/* Maus-Orbit */
let drag=null;renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&camMode===0){drag=null;head.y=head.p=0;return;}drag={x:e.clientX,y:e.clientY};});
addEventListener('pointerup',()=>drag=null);
addEventListener('pointermove',e=>{if(!drag||(e.pointerType==='touch'&&camMode===0))return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(camMode===0){head.y=clamp(head.y-dx*0.005,-2.6,2.6);head.p=clamp(head.p-dy*0.005,-1.1,1.3);}
 else if(camMode===1){fol.y-=dx*0.006;fol.p=clamp(fol.p-dy*0.006,-1.3,1.0);fol.t=performance.now();}
 else if(camMode===3){orbit.th-=dx*0.006;orbit.ph=clamp(orbit.ph-dy*0.006,0.1,3.0);}drag={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('dblclick',()=>{head.y=head.p=fol.y=fol.p=0;fol.z=1;});
renderer.domElement.addEventListener('wheel',e=>{if(camMode===1)fol.z=clamp(fol.z*(1+e.deltaY*0.001),0.35,4);if(camMode===3)orbit.r=clamp(orbit.r*(1+e.deltaY*0.001),5,2000);},{passive:true});
/* Touch-HUD */
const joy=$('joy'),knob=$('knob'),thrEl=$('thr');let joyId=null,thrId=null;
joy.addEventListener('pointerdown',e=>{joyId=e.pointerId;joy.setPointerCapture(e.pointerId);joyMove(e);});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)joyMove(e);});
const yokeEl=$('yoke');
const joyEnd=e=>{if(e.pointerId!==joyId)return;joyId=null;touchIn.pitch=touchIn.roll=0;knob.style.transform='';yokeEl.style.transform='';};
joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
function joyMove(e){const r=joy.getBoundingClientRect();let dx=(e.clientX-r.left-r.width/2)/(r.width/2),dy=(e.clientY-r.top-r.height/2)/(r.height/2);const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}
 touchIn.roll=dx;touchIn.pitch=dy;knob.style.transform=`translate(${dx*r.width*0.32}px,${dy*r.width*0.32}px)`;yokeEl.style.transform=`translate(${dx*r.width*0.3}px,${dy*r.width*0.3}px) rotate(${dx*18}deg)`;}
thrEl.addEventListener('pointerdown',e=>{thrId=e.pointerId;thrEl.setPointerCapture(e.pointerId);thrMove(e);});
thrEl.addEventListener('pointermove',e=>{if(e.pointerId===thrId)thrMove(e);});
const thrEnd=e=>{if(e.pointerId===thrId){thrId=null;touchIn.thr=null;}};thrEl.addEventListener('pointerup',thrEnd);thrEl.addEventListener('pointercancel',thrEnd);
function thrMove(e){const r=thrEl.getBoundingClientRect();{const f=1-(e.clientY-r.top)/r.height;touchIn.thr=f<0.15?-0.1*clamp(1-f/0.15,0,1):clamp((f-0.15)/0.85,0,1);}}
function tbList(){if(!Array.isArray(cfg.tbtn))cfg.tbtn=[...new Set([...cfg.touch,'autoland','fire','missile','flares'])];return cfg.tbtn.filter(a=>ACTIONS.some(x=>x[0]===a));}
function renderTouch(){const show=cfg.gfx.touchUI==='on'||(cfg.gfx.touchUI==='auto'&&(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0));
 $('touch').style.display=show?'block':'none';const tb=$('tbtns');tb.innerHTML=tbList().map(a=>`<button data-act="${a}">${SHORT[a]||a}</button>`).join('');
 tb.querySelectorAll('button').forEach(b=>{const a=b.dataset.act;
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.classList.add('act');if(HOLD.has(a))touchHeld[a]=true;else doAction(a);});
  const up=()=>{b.classList.remove('act');touchHeld[a]=false;};b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up);});}

/* ================= Einstellungsmenü & Keybinding-Manager ================= */
const menuWrap=$('menuWrap');
function toggleMenu(v){menuOpen=v===undefined?!menuOpen:v;$('menu').style.display=menuOpen?'block':'none';listenKey=listenPad=null;kbDown.clear();if(menuOpen)renderMenu();}
$('menuBtn').addEventListener('click',()=>toggleMenu());
const docEl=document.documentElement,FS_OK=!!(docEl.requestFullscreen||docEl.webkitRequestFullscreen);
const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement;
function toggleFS(){try{if(fsEl())(document.exitFullscreen||document.webkitExitFullscreen).call(document);
 else{const r=(docEl.requestFullscreen||docEl.webkitRequestFullscreen).call(docEl,{navigationUI:'hide'});if(r&&r.catch)r.catch(()=>flash('Vollbild nicht möglich'));}}catch(e){flash('Vollbild nicht möglich');}}
['fullscreenchange','webkitfullscreenchange'].forEach(ev=>document.addEventListener(ev,()=>{resize();if(menuOpen)renderMenu();}));
function renderMenu(){
 const chk=(k,l)=>`<label><input type="checkbox" data-gfx="${k}" ${cfg.gfx[k]?'checked':''}> ${l}</label>`;
 const axSel=k=>`<select data-axis="${k}">${[-1,0,1,2,3,4,5,6,7].map(i=>`<option value="${i}" ${cfg.axes[k]===i?'selected':''}>${i<0?'—':'Achse '+i}</option>`).join('')}</select>`;
 const rows=ACTIONS.map(([a,l])=>`<tr><td>${l}</td><td><button class="b ${listenKey===a?'wait':''}" data-kb="${a}">${listenKey===a?'Taste drücken…':keyName(cfg.kb[a])}</button></td>
  <td><button class="b ${listenPad===a?'wait':''}" data-pad="${a}">${listenPad===a?'Button drücken…':(cfg.pad[a]>=0?'Button '+cfg.pad[a]:'—')}</button><button class="x" data-padclr="${a}" title="Entfernen">×</button></td></tr>`).join('');
 menuWrap.innerHTML=`<div class="top"><h1>✈ Skyline Flight</h1><div class="row">${FS_OK?`<button class="b" data-fs>${fsEl()?'⤡ Vollbild beenden':'⤢ Vollbild'}</button>`:''}${isAdmin()?'<button class="b" data-admin>🛠 Admin</button>':''}<button class="b" data-mp>🎮 Multiplayer-Lobby</button><button class="b on" data-close>Weiterfliegen ▶</button></div></div>
 <h2>Flugzeug</h2><div class="row">${ORDER.map(k=>`<button class="b ${k===acType?'on':''}" data-ac="${k}">${TYPES[k].name}</button>`).join('')}</div>
 <div class="row" style="margin-top:10px"><label>Flugplatz <select data-rw>${RUNWAYS.map((r,i)=>`<option value="${i}" ${r===curRw?'selected':''}>${r.name} – Piste ${r.num} (${r.len} m)</option>`).join('')}</select></label><button class="b" data-spawn="0">Start auf der Piste</button><button class="b" data-spawn="1">Anflug-Start (3°-Gleitpfad)</button></div>
 <h2>Quests</h2><p class="note">Interaktive Aufgaben mit Zeitmessung. Ringe durchfliegen (gelb = nächster), dem gelben Pfeil im HUD folgen. Bestzeiten werden gespeichert.</p>
 <table>${QUESTS.map(q=>{const sv=qSave[q.id];const act=Q.q&&Q.q.id===q.id;return`<tr><td style="width:24px">${sv&&sv.done?'★':'☆'}</td><td><b>${q.name}</b> <span class="note">(${TYPES[q.ac]?TYPES[q.ac].name.split(' (')[0]:''})</span><br><span class="note">${q.desc}${sv&&sv.best?' · Bestzeit '+fmtDur(sv.best):''}</span></td><td style="text-align:right;white-space:nowrap"><button class="b ${act?'on':''}" data-quest="${q.id}">${act?'Neu starten':'Starten'}</button></td></tr>`;}).join('')}</table>
 ${Q.q?'<div class="row" style="margin-top:8px"><button class="b" data-qend>Aktuelle Quest beenden</button></div>':''}
 <h2>Umgebung</h2><div class="row"><label>Tageszeit <input type="range" min="0" max="23.9" step="0.1" value="${tod.toFixed(1)}" data-tod> <span id="todv">${fmtT(tod)}</span></label>
 <label>Wind <select data-wind>${WIND_KT.map((v,i)=>`<option value="${i}" ${cfg.wind===i?'selected':''}>${v?v+' kt aus 330° + Böen':'Windstill'}</option>`).join('')}</select></label>
 <label>Lautstärke <input type="range" min="0" max="1" step="0.05" value="${cfg.vol}" data-vol></label>
 <label>Zeitraffer <select data-tspeed>${TSPEED.map((v,i)=>`<option value="${i}" ${cfg.tspeed===i?'selected':''}>${TSLABEL[i]}</option>`).join('')}</select></label></div>
 <h2>Grafik</h2><div class="row"><label>Preset <select data-preset><option value="potato" ${cfg.gfx.preset==='potato'?'selected':''}>Potato (60 fps, iPad)</option><option value="normal" ${cfg.gfx.preset==='normal'?'selected':''}>Normal</option><option value="ultra" ${cfg.gfx.preset==='ultra'?'selected':''}>Ultra (nur starke PCs)</option></select></label>${chk('bloom','Bloom')}${chk('blur','Motion Blur')}${chk('shadows','Schatten')}${chk('clouds','Wolken')}
 <label>Auflösung <select data-res>${[0.6,0.8,1].map(v=>`<option value="${v}" ${cfg.gfx.res==v?'selected':''}>${v*100}%</option>`).join('')}</select></label>
 <label>Touch-Steuerung <select data-touchui>${[['auto','automatisch'],['on','an'],['off','aus']].map(([v,l])=>`<option value="${v}" ${cfg.gfx.touchUI===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
 <h2>Tastatur &amp; Controller</h2><p class="note">Belegung anklicken, dann neue Taste bzw. Controller-Button drücken (Esc bricht ab). Pfeiltasten steuern zusätzlich immer Nicken/Rollen. Esc und Controller-Start (Button 9) öffnen das Menü. Alles wird im Browser gespeichert.</p>
 <table><tr><th>Aktion</th><th>Tastatur</th><th>Gamepad</th></tr>${rows}</table>
 <h2>Gamepad- / Flightstick-Achsen</h2><div class="row"><label>Rollen ${axSel('roll')}</label><label>Nicken ${axSel('pitch')}</label><label>Gieren ${axSel('yaw')}</label><label>Schubhebel ${axSel('thr')}</label>
 <label><input type="checkbox" data-inv ${cfg.axes.inv?'checked':''}> Nicken invertieren</label><label>Deadzone <input type="range" min="0" max="0.4" step="0.01" value="${cfg.axes.dz}" data-dz></label></div>
 <p class="note" id="padinfo">${padName?'Erkannt: '+padName:'Kein Controller erkannt – drück eine Taste am Controller.'}</p>
 <h2>Touch-Buttons <small style="font-weight:400;opacity:.7">(antippen = an/aus)</small></h2><div class="tbgrid">${ACTIONS.filter(([k])=>!/^(pitch|roll)/.test(k)).map(([k,l])=>`<label class="tbchk"><input type="checkbox" data-tbtn="${k}" ${tbList().includes(k)?'checked':''}><span>${l}</span></label>`).join('')}</div>
 <p class="note" style="margin-top:18px">Sounds: „Airplane Prop Loop“ von jakobthiesen/AntumDeluge (CC BY 3.0), „Rocket Engine“ von theMinesAreShakin (CC0), beide via OpenGameArt.org; weitere Geräusche synthetisch erzeugt.</p>
 <div class="row" style="margin-top:18px"><button class="b" data-reset>Standardbelegung wiederherstellen</button></div>`;}
menuWrap.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
 if(d.close!==undefined)toggleMenu(false);
 else if(d.quest){startQuest(d.quest);}
 else if(d.qend!==undefined){endQuest();renderMenu();}
 else if(d.fs!==undefined)toggleFS();
 else if(d.kb){listenKey=d.kb;listenPad=null;renderMenu();}
 else if(d.pad){listenPad=d.pad;listenKey=null;renderMenu();}
 else if(d.padclr){cfg.pad[d.padclr]=-1;saveCfg();renderMenu();}
 else if(d.ac){setAircraft(d.ac);renderMenu();}
 else if(d.admin!==undefined){toggleMenu(false);openAdmin();}
 else if(d.mp!==undefined){toggleMenu(false);openLobby();}
 else if(d.spawn){spawn(d.spawn==='1');toggleMenu(false);}
 else if(d.reset!==undefined){cfg=structuredClone(DEF);saveCfg();applyGfx();renderTouch();renderMenu();}});
menuWrap.addEventListener('input',e=>{const t=e.target,d=t.dataset;
 if(d.tod!==undefined){tod=+t.value;$('todv').textContent=fmtT(tod);}
 else if(d.dz!==undefined){cfg.axes.dz=+t.value;saveCfg();}
 else if(d.vol!==undefined){cfg.vol=+t.value;saveCfg();}});
menuWrap.addEventListener('change',e=>{const t=e.target,d=t.dataset;
 if(d.rw!==undefined){curRw=RUNWAYS[+t.value];return;}
 if(d.tspeed!==undefined)cfg.tspeed=+t.value;
 else if(d.wind!==undefined)cfg.wind=+t.value;
 else if(d.gfx)cfg.gfx[d.gfx]=t.checked;
 else if(d.preset!==undefined){const old=cfg.gfx.preset;Object.assign(cfg.gfx,PRESETS[t.value]);saveCfg();if(old!==t.value){location.reload();return;}}
 else if(d.res!==undefined)cfg.gfx.res=+t.value;
 else if(d.touchui!==undefined)cfg.gfx.touchUI=t.value;
 else if(d.axis)cfg.axes[d.axis]=+t.value;
 else if(d.inv!==undefined)cfg.axes.inv=t.checked;
 else if(d.touch!==undefined)cfg.touch[+d.touch]=t.value;
 else if(d.tbtn!==undefined){const L=tbList(),k=d.tbtn;cfg.tbtn=ACTIONS.map(x=>x[0]).filter(x=>x===k?t.checked:L.includes(x));}
 saveCfg();applyGfx();renderTouch();});
function applyGfx(){bloom.enabled=cfg.gfx.bloom;light.castShadow=cfg.gfx.shadows;resize();}

/* ================= HUD, Instrumente, Mini-Map, Lens Flare ================= */
const hud=$('hud'),hctx=hud.getContext('2d'),mini=$('mini'),mctx=mini.getContext('2d');
const mapC=document.createElement('canvas');mapC.width=mapC.height=512;
(()=>{const x=mapC.getContext('2d'),img=x.createImageData(512,512);
 for(let j=0;j<512;j++)for(let i=0;i<512;i++){const h=gridH((i+.5)/512*WORLD-WORLD/2,(j+.5)/512*WORLD-WORLD/2);let c;
  if(h<0){const d=clamp(-h/300,0,1);c=[20-10*d,70-30*d,110-30*d];}else if(h<8)c=[190,180,130];else if(h>1250)c=[235,238,242];else if(h>900)c=[125,115,105];else{const t=h/900;c=[60+70*t,110+10*t,50+25*t];}
  const k=(j*512+i)*4;img.data[k]=c[0];img.data[k+1]=c[1];img.data[k+2]=c[2];img.data[k+3]=255;}x.putImageData(img,0,0);})();
const fd={};const hf=new THREE.Vector3(),hu=new THREE.Vector3(),hr=new THREE.Vector3(),_sp=new THREE.Vector3();
function computeFD(){const A=ac;hf.set(0,0,-1).applyQuaternion(A.q);hu.set(0,1,0).applyQuaternion(A.q);hr.set(1,0,0).applyQuaternion(A.q);
 fd.V=A.vel.length();fd.kt=(A.ias||0)*KT;fd.mach=fd.V/sos(A.pos.y);fd.pitch=Math.asin(clamp(hf.y,-1,1))/DEG;fd.bank=Math.atan2(-hr.y,hu.y);
 fd.hdgRad=Math.atan2(hf.x,-hf.z);fd.hdg=(fd.hdgRad/DEG+360)%360;fd.altFt=A.pos.y*FT;fd.agl=Math.max(0,(A.pos.y+A.model.gearY-groundH(A.pos.x,A.pos.z))*FT);
 fd.vsi=A.vel.y*FT*60;fd.vF=A.vel.dot(hf);fd.vU=A.vel.dot(hu);fd.vR=A.vel.dot(hr);}
function hbox(c,x,y,w,h,t){c.save();c.shadowBlur=0;c.fillStyle='rgba(0,0,0,.45)';c.fillRect(x-w/2,y-h/2,w,h);c.strokeRect(x-w/2,y-h/2,w,h);c.restore();c.fillText(t,x,y);}
function drawFlare(c,W,H){if(sinE<0.01)return;_sp.copy(camera.position).addScaledVector(sunDir,1000).project(camera);
 if(_sp.z>1||Math.abs(_sp.x)>1.3||Math.abs(_sp.y)>1.3)return;const p=camera.position;
 for(let d=60;d<15000;d*=1.4)if(groundH(p.x+sunDir.x*d,p.z+sunDir.z*d)>p.y+sunDir.y*d)return;
 const sx=(_sp.x+1)/2*W,sy=(1-_sp.y)/2*H,k=smooth(0.01,0.12,sinE)*(1-smooth(0.9,1.3,Math.max(Math.abs(_sp.x),Math.abs(_sp.y))));if(k<=0)return;
 c.save();c.globalCompositeOperation='lighter';const m=Math.min(W,H);
 const glow=(x,y,r,col,a)=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${col},${a})`);g.addColorStop(1,`rgba(${col},0)`);c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,7);c.fill();};
 glow(sx,sy,m*0.28,'255,230,190',0.32*k);const dx=W/2-sx,dy=H/2-sy;
 [[0.35,0.03,'255,190,120',0.22],[0.6,0.015,'140,210,255',0.3],[0.9,0.06,'170,255,200',0.12],[1.25,0.025,'255,140,90',0.22],[1.7,0.1,'130,150,255',0.1]].forEach(([t,r,col,a])=>glow(sx+dx*t*2,sy+dy*t*2,m*r,col,a*k));
 c.restore();}
let gLoad=0;
function drawHUD(fps){const W=innerWidth,H=innerHeight,c=hctx,A=ac;c.clearRect(0,0,W,H);if(A.P.tank){tankHUD(c,W,H);return;}
 gLoad=lerp(gLoad,A.crashed?0:A.g>5.5?(A.g-5.5)/3.5:A.g<-2?(A.g+2)/2:0,0.02);
 if(Math.abs(gLoad)>0.02){const k=Math.min(Math.abs(gLoad),1),g=c.createRadialGradient(W/2,H/2,Math.min(W,H)*(0.6-0.45*k),W/2,H/2,Math.max(W,H)*0.75);
  const col=gLoad>0?'0,0,0':'120,0,0';g.addColorStop(0,`rgba(${col},0)`);g.addColorStop(1,`rgba(${col},${0.95*k})`);c.fillStyle=g;c.fillRect(0,0,W,H);}
 const s=clamp(Math.min(W,H)/820,0.5,1.25),cx=W/2,cy=H/2,GR='rgba(120,255,170,0.95)';
 drawFlare(c,W,H);
 c.strokeStyle=GR;c.fillStyle=GR;c.lineWidth=1.6*s;c.font=`600 ${Math.round(14*s)}px ui-monospace,Menlo,Consolas,monospace`;c.textBaseline='middle';c.shadowColor='rgba(0,0,0,.85)';c.shadowBlur=3;
 const ppd=(H/2)/Math.tan(camera.fov*DEG/2)*Math.tan(DEG)*(camMode===0?1:0.7),LW=190*s,LH=170*s;
 c.save();c.beginPath();c.rect(cx-LW*1.25,cy-LH,LW*2.5,LH*2);c.clip();c.translate(cx,cy);c.rotate(-fd.bank);
 for(let d=-90;d<=90;d+=5){const y=(fd.pitch-d)*ppd;if(Math.abs(y)>LH*1.5)continue;
  if(d===0){c.beginPath();c.moveTo(-LW*1.4,y);c.lineTo(-30*s,y);c.moveTo(30*s,y);c.lineTo(LW*1.4,y);c.stroke();continue;}
  const w=(d%10===0?64:34)*s,gp=34*s,tk=(d>0?7:-7)*s;c.setLineDash(d<0?[7*s,5*s]:[]);
  c.beginPath();c.moveTo(-gp-w,y);c.lineTo(-gp,y);c.lineTo(-gp,y+tk);c.moveTo(gp+w,y);c.lineTo(gp,y);c.lineTo(gp,y+tk);c.stroke();c.setLineDash([]);
  if(d%10===0){c.textAlign='right';c.fillText(Math.abs(d),-gp-w-5*s,y);c.textAlign='left';c.fillText(Math.abs(d),gp+w+5*s,y);}}
 c.restore();
 c.beginPath();c.moveTo(cx-40*s,cy);c.lineTo(cx-14*s,cy);c.lineTo(cx-7*s,cy+8*s);c.lineTo(cx,cy);c.lineTo(cx+7*s,cy+8*s);c.lineTo(cx+14*s,cy);c.lineTo(cx+40*s,cy);c.stroke();
 if(fd.V>8){const fx=cx+clamp(Math.atan2(fd.vR,Math.max(fd.vF,1))/DEG*ppd,-LW,LW),fy=cy+clamp(Math.atan2(-fd.vU,Math.max(fd.vF,1))/DEG*ppd,-LH,LH);
  c.beginPath();c.arc(fx,fy,6*s,0,Math.PI*2);c.moveTo(fx-6*s,fy);c.lineTo(fx-16*s,fy);c.moveTo(fx+6*s,fy);c.lineTo(fx+16*s,fy);c.moveTo(fx,fy-6*s);c.lineTo(fx,fy-12*s);c.stroke();}
 const R=LH*1.02;c.beginPath();c.arc(cx,cy,R,-Math.PI/2-60*DEG,-Math.PI/2+60*DEG);c.stroke();
 for(const a of [-60,-45,-30,-20,-10,0,10,20,30,45,60]){const an=-Math.PI/2+a*DEG,l=(a%30===0?13:7)*s;c.beginPath();c.moveTo(cx+Math.cos(an)*R,cy+Math.sin(an)*R);c.lineTo(cx+Math.cos(an)*(R+l),cy+Math.sin(an)*(R+l));c.stroke();}
 c.save();c.translate(cx,cy);c.rotate(-fd.bank);c.beginPath();c.moveTo(0,-R+2*s);c.lineTo(-7*s,-R+14*s);c.lineTo(7*s,-R+14*s);c.closePath();c.fill();c.restore();
 // Kompass
 const ty=30*s;c.textAlign='center';
 for(let h=Math.ceil((fd.hdg-30)/5)*5;h<=fd.hdg+30;h+=5){const x=cx+(h-fd.hdg)*6*s,hh=((h%360)+360)%360;c.beginPath();c.moveTo(x,ty+10*s);c.lineTo(x,ty+(hh%10===0?20:15)*s);c.stroke();
  if(hh%10===0)c.fillText({0:'N',90:'E',180:'S',270:'W'}[hh]??String(hh/10).padStart(2,'0'),x,ty);}
 hbox(c,cx,ty+36*s,54*s,22*s,String(Math.round(fd.hdg)%360).padStart(3,'0'));
 // Fahrtmesser
 const sx=cx-LW*1.55;c.textAlign='right';
 for(let k=Math.ceil((fd.kt-60)/10)*10;k<=fd.kt+60;k+=10){if(k<0)continue;const y=cy-(k-fd.kt)*2.4*s;c.beginPath();c.moveTo(sx,y);c.lineTo(sx-8*s,y);c.stroke();if(k%20===0)c.fillText(k,sx-12*s,y);}
 c.textAlign='center';hbox(c,sx-34*s,cy,64*s,24*s,Math.round(fd.kt));c.textAlign='right';
 c.fillText('KIAS',sx,cy-LH*0.92);c.fillText(`M ${fd.mach.toFixed(2)}`,sx,cy+LH*0.8);c.fillText(`G ${A.g.toFixed(1)}`,sx,cy+LH*0.8+18*s);c.fillText(`AoA ${(A.alpha/DEG).toFixed(1)}°`,sx,cy+LH*0.8+36*s);
 // Höhenmesser + Variometer
 const ax=cx+LW*1.55;c.textAlign='left';
 for(let k=Math.ceil((fd.altFt-500)/100)*100;k<=fd.altFt+500;k+=100){const y=cy-(k-fd.altFt)*0.29*s;c.beginPath();c.moveTo(ax,y);c.lineTo(ax+8*s,y);c.stroke();if(k%500===0)c.fillText(k,ax+12*s,y);}
 c.textAlign='center';hbox(c,ax+42*s,cy,78*s,24*s,Math.round(fd.altFt));c.textAlign='left';
 c.fillText('FT MSL',ax,cy-LH*0.92);c.fillText(`AGL ${Math.round(fd.agl)}`,ax,cy+LH*0.8);
 const vx=ax+96*s,vh=clamp(fd.vsi/2000,-1,1)*LH*0.75;c.lineWidth=4*s;c.beginPath();c.moveTo(vx,cy);c.lineTo(vx,cy-vh);c.stroke();c.lineWidth=1.6*s;
 c.beginPath();c.moveTo(vx-5*s,cy);c.lineTo(vx+5*s,cy);c.stroke();c.fillText((fd.vsi>=0?'+':'')+Math.round(fd.vsi/10)*10,vx+7*s,cy-vh);c.fillText('VS',vx-4*s,cy-LH*0.92);
 // Status
 c.textAlign='left';const gs=A.P.gearFixed?'FEST':A.gearAnim>0.98?'AUS ▼':A.gearAnim<0.02?'EIN':'IN BEWEGUNG';
 const lines=[`${A.P.name}  ·  ${CAMN[camMode]}  ·  ${fmtT(tod)}  ·  ${fps} fps`,`${A.thr<0?'UMKEHRSCHUB '+Math.round(-A.thr*1000)+'%'+(A.onGround?'':' (nur am Boden)'):'SCHUB '+Math.round(A.thr*100)+'%'}${A.ab?'  NACHBRENNER':''}`,`KLAPPEN ${A.flapsSet}/3   FAHRWERK ${gs}${A.brakes?'   BREMSE':''}`,`${AP.on?'AUTOLAND: '+AP.mode+'   ':''}N1 ${Math.round(A.n1*100)}%   TRIMM ${A.P.fbw?'AUTO (FBW)':(A.trim>=0?'+':'')+A.trim.toFixed(2)}   WIND 330°/${Math.round(wind.length()*KT)} kt`];
 lines.forEach((l,i)=>c.fillText(l,14,18+i*20*s));
 c.save();c.shadowBlur=0;c.strokeRect(14,18+4*20*s-6*s,160*s,10*s);c.fillRect(14,18+4*20*s-6*s,160*s*A.thr,10*s);c.restore();
 // Warnungen
 const blink=(performance.now()%600)<350;let warn=null;
 if(!A.crashed&&!A.onGround){if(A.stall>0.01)warn='STALL';else if(fd.agl<1500&&fd.vsi<-Math.max(1500,fd.agl*2.5))warn='PULL UP';else if(fd.agl<600&&!A.gearDown&&fd.vsi<-200)warn='GEAR';}
 c.textAlign='center';
 if(warn&&blink){c.fillStyle='#ff4a3d';c.font=`800 ${Math.round(28*s)}px ui-monospace,monospace`;c.fillText(warn,cx,cy+LH*0.62);}
 if(A.crashed&&!(mp.dead&&mp.kc)){c.fillStyle='rgba(0,0,0,.6)';c.fillRect(cx-260*s,cy-60*s,520*s,120*s);c.fillStyle='#ff6a5a';c.font=`800 ${Math.round(30*s)}px system-ui`;c.fillText('ABSTURZ',cx,cy-22*s);
  c.fillStyle='#fff';c.font=`500 ${Math.round(15*s)}px system-ui`;c.fillText(A.crashed,cx,cy+8*s);c.fillText(`${keyName(cfg.kb.restart)}: Neustart  ·  ${keyName(cfg.kb.approach)}: Anflug-Start`,cx,cy+34*s);}
 if(paused){c.fillStyle='#fff';c.font=`800 ${Math.round(30*s)}px system-ui`;c.fillText('PAUSE',cx,cy-LH*0.55);}
 drawQuest(c,W,H,s);
 if(toast.t>0){c.globalAlpha=clamp(toast.t,0,1);c.fillStyle='#fff';c.font=`600 ${Math.round(16*s)}px system-ui`;c.fillText(toast.msg,cx,cy+LH+40*s);c.globalAlpha=1;}}
function drawMap(c,cx,cy,R,range){const A=ac,ds=R/range;
 c.save();c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.clip();c.fillStyle='#0b2236';c.fillRect(cx-R,cy-R,2*R,2*R);
 c.translate(cx,cy);c.rotate(-fd.hdgRad);c.scale(ds,ds);c.translate(-A.pos.x,-A.pos.z);c.imageSmoothingEnabled=true;c.drawImage(mapC,-WORLD/2,-WORLD/2,WORLD,WORLD);
 if(Q.target){c.fillStyle='#ffd400';c.beginPath();c.arc(Q.target.x,Q.target.z,5/ds,0,7);c.fill();c.strokeStyle='#000';c.lineWidth=1.5/ds;c.stroke();}
for(const r of RUNWAYS){c.save();c.translate(r.cx,r.cz);c.rotate(r.hdg);c.fillStyle='#fff';c.fillRect(-r.w,-r.hl,2*r.w,r.len);c.fillStyle='#ffd27a';c.fillRect(-8,r.hl,16,900);c.restore();}c.restore();
 c.save();c.translate(cx,cy);c.strokeStyle='rgba(120,255,170,.5)';c.lineWidth=1;c.beginPath();c.arc(0,0,R*0.5,0,7);c.stroke();
 c.fillStyle='#ffd400';c.beginPath();c.moveTo(0,-8);c.lineTo(6,7);c.lineTo(0,3);c.lineTo(-6,7);c.closePath();c.fill();
 c.fillStyle='#fff';c.font='bold 12px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('N',(R-10)*Math.sin(-fd.hdgRad),-(R-10)*Math.cos(-fd.hdgRad));c.restore();}
function drawScreens(){const c=pfdCtx;c.fillStyle='#000';c.fillRect(0,0,320,200);
 c.save();c.beginPath();c.rect(62,8,196,160);c.clip();c.translate(160,88);c.rotate(-fd.bank);const y=fd.pitch*4;
 c.fillStyle='#2f78c8';c.fillRect(-300,-600+y,600,600);c.fillStyle='#7a4f2a';c.fillRect(-300,y,600,600);c.strokeStyle='#fff';c.lineWidth=1.5;c.beginPath();c.moveTo(-300,y);c.lineTo(300,y);c.stroke();
 c.fillStyle='#fff';c.font='10px monospace';for(let d=-30;d<=30;d+=10){if(!d)continue;const yy=y-d*4;c.beginPath();c.moveTo(-24,yy);c.lineTo(24,yy);c.stroke();c.fillText(Math.abs(d),28,yy+3);}c.restore();
 c.strokeStyle='#ffd400';c.lineWidth=3;c.beginPath();c.moveTo(118,88);c.lineTo(148,88);c.lineTo(160,96);c.lineTo(172,88);c.lineTo(202,88);c.stroke();
 c.fillStyle='#000';c.fillRect(0,8,60,160);c.fillRect(260,8,60,160);c.textAlign='center';c.fillStyle='#3f3';c.font='bold 16px monospace';
 c.fillText(Math.round(fd.kt),30,92);c.fillText(Math.round(fd.altFt),290,92);c.font='10px monospace';c.fillStyle='#aaa';c.fillText('KT',30,26);c.fillText('FT',290,26);
 c.fillText('M'+fd.mach.toFixed(2),30,140);c.fillText((fd.vsi>=0?'+':'')+Math.round(fd.vsi),290,140);c.fillStyle='#fff';c.font='bold 13px monospace';c.fillText('HDG '+String(Math.round(fd.hdg)%360).padStart(3,'0'),160,186);
 const n=ndCtx;n.fillStyle='#000';n.fillRect(0,0,320,200);drawMap(n,100,100,92,6000);n.fillStyle='#3f3';n.font='bold 13px monospace';n.textAlign='left';n.textBaseline='alphabetic';
 [`THR ${Math.round(ac.thr*100)}%`,`FLP ${ac.flapsSet}/3`,`GEAR ${ac.P.gearFixed||ac.gearAnim>0.98?'DN':'UP'}`,`G ${ac.g.toFixed(1)}`,`AGL ${Math.round(fd.agl)}`].forEach((t,i)=>n.fillText(t,206,40+i*28));
 pfdTex.needsUpdate=ndTex.needsUpdate=true;}

/* ================= Landehilfe / Autoland (Strg): Anflug -> Endanflug ILS 3° -> Abfangen -> Ausrollen ================= */
const AP={on:false,mode:'',I:0,thrI:0,rw:RUNWAYS[0]};
function toggleAP(){const A=ac;if(AP.on){AP.on=false;A.brakes=false;flash('Landehilfe AUS');return;}
 if(A.crashed)return;if(A.onGround&&A.vel.length()<20){flash('Landehilfe nur im Flug verfügbar');return;}
 // nächstgelegene Piste wählen
 let best=null,bd=1e18;for(const r of RUNWAYS){const d=Math.hypot(A.pos.x-r.cx,A.pos.z-r.cz);if(d<bd){bd=d;best=r;}}AP.rw=best;
 AP.on=true;AP.I=0;AP.thrI=0;AP.msaT=0;const[lx,lz]=best.L(A.pos.x,A.pos.z),lvx=A.vel.x*best.c+A.vel.z*best.s,lvz=-A.vel.x*best.s+A.vel.z*best.c,tr=Math.atan2(lvx,-lvz);
 AP.mode=lz>best.hl+1000&&Math.abs(lx)<1200&&Math.abs(tr)<0.8?'ENDANFLUG':'ANFLUG';AP.turn=false;flash('Landehilfe AN – '+AP.mode+' '+best.name+' Piste '+best.num);}
const _af=new THREE.Vector3(),_au=new THREE.Vector3(),_ar=new THREE.Vector3();
function updAP(dt){if(!AP.on)return;const A=ac,P=A.P,m=A.model,R=AP.rw;if(A.crashed){AP.on=false;return;}
 if(Math.abs(kbA.pitch+padIn.pitch+touchIn.pitch)>0.6||Math.abs(kbA.roll+padIn.roll+touchIn.roll)>0.6){AP.on=false;flash('Landehilfe AUS (manuell übersteuert)');return;}
 _af.set(0,0,-1).applyQuaternion(A.q);_au.set(0,1,0).applyQuaternion(A.q);_ar.set(1,0,0).applyQuaternion(A.q);
 // alles im Pisten-Koordinatensystem (Anflug von +z, Landerichtung -z)
 const[x,z]=R.L(A.pos.x,A.pos.z),lvx=A.vel.x*R.c+A.vel.z*R.s,lvz=-A.vel.x*R.s+A.vel.z*R.c,hl=R.hl,EL=R.elev,gH=(lx,lz)=>{const[wx,wz]=R.W(lx,lz);return groundH(wx,wz);};
 const V=Math.max(A.vel.length(),1),gs=Math.max(Math.hypot(lvx,lvz),1),bank=Math.atan2(-_ar.y,_au.y),track=Math.atan2(lvx,-lvz);
 const gy=A.pos.y+m.gearY,agl=gy-groundH(A.pos.x,A.pos.z),tan3=Math.tan(3*DEG);
 const loc=()=>Math.atan2(-clamp(x*0.05,-gs*0.5,gs*0.5),gs);
 let trackT=0,vsT=0,spdT=P.vApp;
 if(AP.mode==='ANFLUG'){spdT=P.vApp*1.3;A.flapsSet=Math.max(A.flapsSet,1);
  // Anflug-Fix weit draußen im freien Anflugkorridor, dann gerader Endanflug
  if(z>hl+2500&&Math.abs(x)<2500&&Math.abs(track)<0.8)AP.mode='ENDANFLUG';
  else{const wz=hl+22000;if(!AP.turn){const dx=-x,dz=wz-z;trackT=Math.atan2(dx,-dz);if(Math.hypot(dx,dz)<2500)AP.turn=true;}else{trackT=Math.atan2(-clamp(x*0.05,-gs*0.5,gs*0.5),gs);if(z<hl+2500){AP.turn=false;AP.gaT=45;}}}
  // Geländeausweichen
  AP.avT=(AP.avT||0)-dt;if(AP.avT<=0){AP.avT=1;const ridge=a=>{let g=0;for(let d=300;d<=4000;d+=300)g=Math.max(g,gH(x+Math.sin(a)*d,z-Math.cos(a)*d));return g;};
   AP.avoid=null;if(ridge(trackT)>A.pos.y-150){let best=null,bg=1e9;for(const o of [0.5,-0.5,1,-1,1.6,-1.6,2.4,-2.4]){const g=ridge(track+o);if(g<bg-50){bg=g;best=track+o;}}AP.avoid=best;}}
  if(AP.avoid!=null)trackT=AP.avoid;
  // regionale Sicherheitshöhe (Gelände im Umkreis von 6 km)
  AP.msaT=(AP.msaT||0)-dt;if(AP.msaT<=0){AP.msaT=3;let mx=0;for(let rr=0;rr<=6000;rr+=1500)for(let k=0;k<16;k++){const a=k/16*Math.PI*2;mx=Math.max(mx,groundH(A.pos.x+Math.cos(a)*rr,A.pos.z+Math.sin(a)*rr));}AP.msa=mx+450;}
  let gmax=gH(x,z);for(let d=400;d<=6000;d+=400){gmax=Math.max(gmax,gH(x+Math.sin(track)*d,z-Math.cos(track)*d));}
  let gC=0;for(let d=0;d<=4000;d+=400)gC=Math.max(gC,gH(x,z-d));
  const inCorr=z>hl+2500&&(AP.turn||(Math.abs(x)<1000&&Math.abs(track)<0.9)),altT=inCorr?Math.max(EL+(z-hl+300)*tan3,gC+200):Math.max(AP.msa||0,gmax+450,EL+600);
  vsT=clamp((altT-A.pos.y)*0.06,inCorr?-11:-8,12);
  // Durchstarten: geradeaus über die Piste im freien Korridor steigen
  if(AP.gaT>0){AP.gaT-=dt;trackT=loc();vsT=10;spdT=P.vApp*1.25;}}
 if(AP.mode==='ENDANFLUG'){trackT=loc();const hGS=EL+Math.max(z-hl+300,0)*tan3;vsT=-gs*tan3+clamp((hGS-gy)*0.2,-8,3);
  if(z<hl-0.3*R.len||(z<hl+2500&&gy-hGS>250)){AP.mode='ANFLUG';AP.turn=false;AP.gaT=45;A.flapsSet=1;flash('Landehilfe: Durchstarten (zu hoch)');}
  A.gearDown=true;const d=z-hl;A.flapsSet=Math.max(A.flapsSet,d<6000?Math.min(3,P.flApp+1):P.flApp);
  if(Math.min(agl,gy-EL)<(P.m>50000?14:P.prop?5:9)&&z<hl+600){AP.mode='ABFANGEN';AP.fl=0;flash('Landehilfe: Abfangen');}}
 if(AP.mode==='ABFANGEN'){AP.fl=(AP.fl||0)+dt;trackT=loc();vsT=-Math.max(AP.fl>5?1.2:0.6,agl*0.12);spdT=0;
  if(z<hl-0.7*R.len&&!A.onGround){AP.mode='ANFLUG';AP.turn=false;AP.gaT=45;AP.fl=0;A.flapsSet=1;flash('Landehilfe: Durchstarten');}if(A.onGround&&AP.mode==='ABFANGEN'){AP.mode='AUSROLLEN';flash('Landehilfe: Aufgesetzt – Ausrollen');}}
 if(AP.mode==='AUSROLLEN'){input.pitch=0;input.roll=clamp(-bank*2,-1,1);{let h=Math.atan2(_af.x,-_af.z)-R.hdg;h=Math.atan2(Math.sin(h),Math.cos(h));const hd=clamp(-x*0.02,-0.1,0.1);input.yaw=clamp((hd-h)*1.5+A.omega.y*0.8,-0.6,0.6);}A.thr=0;A.brakes=gs>1.5;
  if(gs<=1.5){AP.on=false;A.brakes=false;flash('Gelandet – Landehilfe AUS');}return;}
 // Querachse: Kurs über Grund -> Querneigung -> Rollbefehl
 let te=trackT-track;te=Math.atan2(Math.sin(te),Math.cos(te));const bankT=clamp(te*2.2,-25*DEG,25*DEG),p=-A.omega.z;
 input.roll=P.fbw?clamp((bankT-bank)*2.5/P.pMax,-1,1):clamp((bankT-bank)*3-p*0.6,-1,1);input.yaw=0;
 // Längsachse: Flugbahnwinkel aus Soll-Sinkrate
 const gT=Math.asin(clamp(vsT/V,-0.5,0.5)),ga=Math.asin(clamp(A.vel.y/V,-1,1)),ge=gT-ga;
 if(P.fbw)input.pitch=clamp((ge*0.8-A.omega.x*0.3)/P.qMax,-1,1);
 else{AP.I=clamp(AP.I+ge*dt*1.5,-0.6,0.6);input.pitch=clamp(3*ge-0.8*A.omega.x+AP.I,-1,1);}
 // Auto-Schub
 if(spdT>0){const e=spdT-A.ias;AP.thrI=clamp(AP.thrI+e*dt*0.02,-0.5,0.8);A.thr=clamp(0.35+e*0.06+AP.thrI,0,1);}else A.thr=0;A.brakes=false;}

/* ================= Sound: Web-Loops (OpenGameArt) + synthetische Schichten ================= */
// Prop: "Airplane Prop Loop" – jakobthiesen / AntumDeluge, CC BY 3.0 · Jet: "Rocket Engine" – theMinesAreShakin, CC0
const SND={ctx:null,on:false,nextBeep:0},SRC={prop:'https://opengameart.org/sites/default/files/airplane_prop_0.ogg',jet:'https://opengameart.org/sites/default/files/rocket_engine.001.wav'};
function initAudio(){if(SND.ctx)return;try{const C=new (window.AudioContext||window.webkitAudioContext)();SND.ctx=C;
 const master=C.createGain();master.gain.value=0;master.connect(C.destination);SND.master=master;
 const nb=C.createBuffer(1,C.sampleRate*2,C.sampleRate),d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;SND.nb=nb;
 const noise=(type,f,q)=>{const s=C.createBufferSource();s.buffer=nb;s.loop=true;const fl=C.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=C.createGain();g.gain.value=0;s.connect(fl).connect(g).connect(master);s.start();return{fl,g};};
 SND.wind=noise('bandpass',600,0.6);SND.roar=noise('lowpass',300,0.8);SND.roll=noise('lowpass',160,1.2);
 const o=C.createOscillator();o.type='sawtooth';const of=C.createBiquadFilter();of.type='bandpass';of.Q.value=10;const og=C.createGain();og.gain.value=0;o.connect(of).connect(og).connect(master);o.start();SND.whine={o,of,g:og};
 SND.el={};for(const k in SRC){const a=new Audio();a.src=SRC[k];a.loop=true;a.preload='auto';a.volume=0;a.preservesPitch=a.mozPreservesPitch=a.webkitPreservesPitch=false;
  a.addEventListener('error',()=>{SND.el[k]=null;});SND.el[k]=a;a.play().catch(()=>{});}
 SND.on=true;}catch(e){console.warn('Audio nicht verfügbar',e);}}
['pointerdown','keydown','touchstart'].forEach(ev=>addEventListener(ev,()=>{initAudio();if(SND.ctx&&SND.ctx.state==='suspended')SND.ctx.resume();for(const k in (SND.el||{}))if(SND.el[k]&&SND.el[k].paused)SND.el[k].play().catch(()=>{});}));
function sBurst(type,f,q,vol,dur){if(!SND.on||!cfg.sound)return;const C=SND.ctx,t=C.currentTime,s=C.createBufferSource();s.buffer=SND.nb;const fl=C.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;
 const g=C.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);s.connect(fl).connect(g).connect(SND.master);s.start(t);s.stop(t+dur+0.05);}
const sScreech=k=>sBurst('bandpass',2400,3,0.5*k+0.1,0.35+0.4*k);
const sThump=()=>sBurst('lowpass',120,2,0.9,0.5);
function sBeep(f,dur,vol){if(!SND.on||!cfg.sound)return;const C=SND.ctx,t=C.currentTime,o=C.createOscillator(),g=C.createGain();o.type='square';o.frequency.value=f;
 g.gain.setValueAtTime(vol,t);g.gain.setValueAtTime(0,t+dur);o.connect(g).connect(SND.master);o.start(t);o.stop(t+dur+0.02);}
const _dv=new THREE.Vector3();
function updAudio(){if(!SND.on)return;const C=SND.ctx,A=ac,P=A.P,m=A.model,t=C.currentTime;
 const vol=(paused||menuOpen||!cfg.sound)?0:cfg.vol;SND.master.gain.setTargetAtTime(vol,t,0.1);
 const n1=A.crashed?0:A.n1,V=fd.V||0,inC=camMode===0,dist=camera.position.distanceTo(A.pos),att=inC?0.55:clamp(m.camD*1.3/Math.max(dist,1),0.05,1);
 // Doppler (spürbar bei Vorbeiflug-Kamera)
 _dv.copy(camera.position).sub(A.pos);const radial=dist>1?A.vel.dot(_dv)/dist:0,dop=inC?1:clamp(340/(340-radial),0.6,1.7);
 const big=P.m>50000,jet=!P.prop;
 const ep=SND.el.prop,ej=SND.el.jet;
 if(ep){ep.volume=P.prop?clamp((0.2+0.8*n1)*att*vol,0,1):0;ep.playbackRate=clamp((0.55+0.95*n1)*dop,0.25,4);}
 if(ej){ej.volume=jet?clamp((0.15+0.85*n1)*att*vol*(A.ab?1:0.8),0,1):0;ej.playbackRate=clamp((0.6+0.7*n1+(A.ab?0.2:0))*dop,0.25,4);}
 const fallback=(P.prop&&!ep)||(jet&&!ej);
 SND.roar.g.gain.setTargetAtTime((jet?(A.ab?0.6:0.12*n1):0)*att+(fallback?0.45*n1*att:0),t,0.15);
 SND.roar.fl.frequency.setTargetAtTime((P.prop?120:250)+(A.ab?900:500)*n1,t,0.2);
 const wf=(big?1400:2200)+(big?2600:4200)*n1;SND.whine.o.frequency.setTargetAtTime(wf*dop,t,0.2);SND.whine.of.frequency.setTargetAtTime(wf*dop,t,0.2);
 SND.whine.g.gain.setTargetAtTime(jet?(big?0.05:0.03)*n1*att*(inC?0.5:1):0,t,0.2);
 SND.wind.g.gain.setTargetAtTime(Math.pow(clamp((V-15)/250,0,1),1.4)*(inC?0.4:0.22),t,0.2);SND.wind.fl.frequency.setTargetAtTime(350+V*5,t,0.2);
 SND.roll.g.gain.setTargetAtTime(A.onGround&&!A.crashed?clamp(V/40,0,1)*0.35:0,t,0.1);SND.roll.fl.frequency.setTargetAtTime(90+V*2.5,t,0.2);
 const warn=!A.crashed&&!A.onGround&&(A.stall>0.01||(fd.agl<1500&&fd.vsi<-Math.max(1500,fd.agl*2.5)));
 if(warn&&t>SND.nextBeep){sBeep(A.stall>0.01?820:620,0.12,0.12);SND.nextBeep=t+0.25;}}

const spdEl=$('spd'),spdV=$('spdV'),spdS=$('spdS'),spdB=$('spdB'),spdSt=$('spdStall');
function drawSpeed(){const A=ac,P=A.P,kt=fd.kt,vs=P.vApp/1.3*KT*Math.sqrt(1/(1+A.flaps*P.clf/Math.max(P.cla*P.aStall,0.1))),top=(P.mmax?P.mmax*340:P.prop?75:P.m>50000?280:450)*KT;
 spdV.textContent=Math.round(kt);spdS.textContent=`GS ${Math.round(Math.hypot(A.vel.x,A.vel.z)*3.6)} km/h · M ${fd.mach.toFixed(2)}`;
 spdB.style.width=clamp(kt/top*100,0,100)+'%';spdSt.style.left=clamp(vs/top*100,0,100)+'%';
 const air=!A.onGround&&!A.crashed;spdEl.className=air&&(A.stall>0.01||kt<vs*1.05)?'bad':air&&(kt<vs*1.2||(P.mmax&&fd.mach>P.mmax*0.97))?'warn':'';}
/* ================= Interaktive Quests ================= */
const QKEY='skyflight_quests_v1';let qSave={};try{qSave=JSON.parse(localStorage.getItem(QKEY))||{};}catch(e){}
const qStore=()=>{try{localStorage.setItem(QKEY,JSON.stringify(qSave));}catch(e){}};
const RWP=(ri,lx,lz,agl,abs)=>{const r=RUNWAYS[ri],[x,z]=r.W(lx,lz);return{x,z,y:Math.max(abs??0,groundH(x,z)+agl)};};
const ring=(p,rad)=>({type:'ring',p,rad:rad||90});
const land=(ri,extra)=>({type:'land',ri,...extra});
const QUESTS=[
 {id:'pattern',name:'Platzrunde',ac:'cessna',rw:0,desc:'Starte in Skyline Intl, fliege die Platzrunde durch 5 Ringe und lande wieder auf Piste 36.',
  steps:()=>{const r=RUNWAYS[0],y=r.elev+300;return[ring(RWP(0,0,-r.hl-1400,150,y-100),70),ring(RWP(0,-1100,-r.hl-1400,200,y),70),ring(RWP(0,-1100,0,200,y),70),ring(RWP(0,-1100,r.hl+1800,200,y),70),ring(RWP(0,0,r.hl+2200,120,r.elev+170),70),land(0)];}},
 {id:'hopper',name:'Inselhüpfer',ac:'airliner',rw:0,desc:'Mit dem A320 von Skyline Intl zum Nordost-Feld, landen, dann weiter zum Südhafen und dort landen.',
  steps:()=>[land(1),land(2)]},
 {id:'canyon',name:'Canyon-Run',ac:'f15',rw:3,air:{lz:25000,agl:250},desc:'Tiefflug durch das Anflugtal der Westküste: 8 Ringe knapp über dem Boden, dann Landung.',
  steps:()=>{const r=RUNWAYS[3],a=[];for(let k=0;k<8;k++)a.push(ring(RWP(3,(k%2?1:-1)*350,r.hl+21000-k*2400,90),80));a.push(land(3));return a;}},
 {id:'mach3',name:'Mach-3-Sprint',ac:'sr71',rw:0,desc:'Mit der SR-71 auf über 8.000 m steigen, Mach 3 erreichen und 5 Sekunden halten, dann irgendwo landen.',
  steps:()=>[{type:'alt',min:8000},{type:'mach',min:3,hold:5},land(-1)]},
 {id:'precision',name:'Präzisionslandung',ac:'cessna',rw:2,air:{lz:5500,glide:true},desc:'Lande am Südhafen weich (unter 300 ft/min) und in den ersten 600 m der Piste.',
  steps:()=>[land(2,{maxFpm:300,zone:600})]},
 {id:'lowpass',name:'Tiefflug-Tour',ac:'f15',rw:0,desc:'Überfliege alle vier Flugplätze im Tiefflug durch die Ringe über den Pistenmitten, dann lande in Skyline Intl.',
  steps:()=>[ring(RWP(1,0,0,45),70),ring(RWP(3,0,0,45),70),ring(RWP(2,0,0,45),70),ring(RWP(0,0,-800,45),70),land(0)]},
 {id:'around',name:'Inselumrundung',ac:'f117',rw:0,desc:'Zeitrennen mit der F-117: 8 Ringe rund um die Insel, zurück nach Skyline Intl.',
  steps:()=>{const a=[];for(let k=0;k<8;k++){const t=-Math.PI/2+k/8*Math.PI*2,x=Math.cos(t)*21000,z=Math.sin(t)*21000;a.push(ring({x,z,y:Math.max(900,groundH(x,z)+450)},140));}a.push(land(0));return a;}}];
const Q={q:null,steps:[],i:0,t:0,hold:0,meshes:[],target:null,done:false,fail:null};
const qGroup=new THREE.Group();scene.add(qGroup);
const qMat=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,toneMapped:false,depthWrite:false});
const qOn=qMat(new THREE.Color(3,2.4,0.3),0.95),qNext=qMat(new THREE.Color(0.3,1.6,2.2),0.45);
function qBuild(){qGroup.clear();Q.meshes=[];Q.steps.forEach((st,k)=>{if(st.type!=='ring')return;const m=new THREE.Mesh(new THREE.TorusGeometry(st.rad,st.rad*0.07,10,48),qNext);m.position.set(st.p.x,st.p.y,st.p.z);
  const nx=Q.steps.slice(k+1).find(o=>o.type==='ring'),aim=nx?nx.p:(()=>{const r=RUNWAYS[0];return{x:r.cx,y:st.p.y,z:r.cz};})();m.lookAt(aim.x,aim.y,aim.z);m.userData.k=k;qGroup.add(m);Q.meshes.push(m);});qColor();}
function qColor(){Q.meshes.forEach(m=>{m.visible=m.userData.k>=Q.i;m.material=m.userData.k===Q.i?qOn:qNext;});}
function startQuest(id){const q=QUESTS.find(o=>o.id===id);if(!q)return;
 curRw=RUNWAYS[q.rw];if(TYPES[q.ac]&&ORDER.includes(q.ac))setAircraft(q.ac);else spawn(false);
 if(q.air){const A=ac,P=A.P,r=curRw;if(q.air.glide)spawn(true);else{const[x,z]=r.W(0,r.hl+q.air.lz),V=P.vApp*1.6,yaw=new THREE.Quaternion().setFromAxisAngle(Y,-r.hdg);
  A.pos.set(x,groundH(x,z)+q.air.agl,z);A.vel.set(V*r.s,0,-V*r.c);A.q.copy(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(X,0.05));A.thr=0.75;A.n1=0.75;A.gearDown=false;A.gearAnim=0;A.wasG=A.model.gearPts.map(()=>false);A.onGround=false;}}
 Object.assign(Q,{q,steps:q.steps(),i:0,t:0,hold:0,done:false,fail:null,prev:ac.pos.clone()});ac.landed=!q.air;ac.tdT=-1;qBuild();toggleMenu(false);flash('Quest: '+q.name);sBeep(880,0.15,0.15);}
function endQuest(){Q.q=null;Q.steps=[];Q.target=null;qGroup.clear();}
function qNextStep(){Q.i++;Q.hold=0;sBeep(1320,0.1,0.18);if(Q.i>=Q.steps.length){Q.done=true;const sv=qSave[Q.q.id]||{};const best=!sv.best||Q.t<sv.best;qSave[Q.q.id]={done:true,best:best?Q.t:sv.best};qStore();
  flash('✔ Quest geschafft: '+Q.q.name+' in '+fmtDur(Q.t)+(best?' – neue Bestzeit!':''));setTimeout(()=>sBeep(1760,0.25,0.2),180);}qColor();}
const fmtDur=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
function onRunway(ri,x,z){const list=ri<0?RUNWAYS:[RUNWAYS[ri]];for(const r of list){const[lx,lz]=r.L(x,z);if(Math.abs(lx)<r.w/2+3&&Math.abs(lz)<r.hl+5)return r;}return null;}
function updQuest(dt){if(!Q.q||Q.done||Q.fail)return;const A=ac,st=Q.steps[Q.i];Q.t+=dt;
 if(A.crashed){Q.fail='Absturz';sBeep(220,0.4,0.2);return;}
 Q.target=null;
 if(st.type==='ring'){Q.target=st.p;const d=A.pos.distanceTo(_t1.set(st.p.x,st.p.y,st.p.z));
  // Durchflug: Abstand zum Ringzentrum < Radius beim Durchqueren der Ringebene
  const m=Q.meshes.find(o=>o.userData.k===Q.i);if(m){_vd.set(0,0,1).applyQuaternion(m.quaternion);const a=_rr.copy(Q.prev).sub(m.position).dot(_vd),b=_pv.copy(A.pos).sub(m.position).dot(_vd);
   if(d<st.rad*1.05&&(a<=0)!==(b<=0))qNextStep();else if(d<st.rad*0.8)qNextStep();}}
 else if(st.type==='land'){const r=st.ri<0?null:RUNWAYS[st.ri];if(r)Q.target={x:r.cx,y:r.elev,z:r.cz};
  const rw=onRunway(st.ri,A.pos.x,A.pos.z);
  if(rw&&A.onGround&&A.vel.length()<3){
   if(st.maxFpm&&(A.tdFpm||999)>st.maxFpm){Q.fail='Zu hart aufgesetzt ('+A.tdFpm+' ft/min, max. '+st.maxFpm+')';sBeep(220,0.4,0.2);return;}
   if(st.zone){const[,lz]=rw.L(A.tdX,A.tdZ);if(rw.hl-lz>st.zone||rw.hl-lz<-30){Q.fail='Aufsetzpunkt verfehlt ('+Math.round(rw.hl-lz)+' m hinter der Schwelle, Ziel 0–'+st.zone+' m)';sBeep(220,0.4,0.2);return;}}
   flash('Gelandet: '+rw.name);qNextStep();}}
 else if(st.type==='alt'){if(A.pos.y>=st.min)qNextStep();}
 else if(st.type==='mach'){if(A.mach>=st.min){Q.hold+=dt;if(Q.hold>=(st.hold||0))qNextStep();}else Q.hold=0;}
 Q.prev.copy(A.pos);}
function qText(){const st=Q.steps[Q.i];if(!st)return'';const n=Q.steps.filter(o=>o.type==='ring').length,k=Q.steps.slice(0,Q.i).filter(o=>o.type==='ring').length;
 if(st.type==='ring')return`Ring ${k+1}/${n} durchfliegen`;
 if(st.type==='land')return st.ri<0?'Auf einem beliebigen Flugplatz landen und anhalten':`Landen und anhalten: ${RUNWAYS[st.ri].name} (Piste ${RUNWAYS[st.ri].num})`+(st.maxFpm?` · < ${st.maxFpm} ft/min · erste ${st.zone} m`:'');
 if(st.type==='alt')return`Steige auf ${(st.min/1000).toFixed(0)}.000 m (jetzt ${Math.round(ac.pos.y)} m)`;
 if(st.type==='mach')return`Mach ${st.min.toFixed(1)} halten: ${Q.hold.toFixed(1)}/${st.hold} s (jetzt M ${ac.mach.toFixed(2)})`;return'';}
function drawQuest(c,W,H,s){if(!Q.q)return;const x=14,y=18+5*20*s,w=Math.min(380*s,W-28),h=(Q.target?84:66)*s;
 c.save();c.shadowBlur=0;c.fillStyle='rgba(6,14,24,.7)';c.strokeStyle=Q.fail?'#ff5040':Q.done?'#8fffb8':'#ffd24a';c.lineWidth=2;c.beginPath();c.roundRect?c.roundRect(x,y,w,h,10):c.rect(x,y,w,h);c.fill();c.stroke();
 c.textAlign='left';c.textBaseline='top';c.fillStyle=c.strokeStyle;c.font=`700 ${Math.round(14*s)}px system-ui`;c.fillText('★ '+Q.q.name+'   '+fmtDur(Q.t),x+10,y+8*s);
 c.fillStyle='#e8f0f7';c.font=`500 ${Math.round(13*s)}px system-ui`;
 c.fillText(Q.fail?'✖ Fehlgeschlagen: '+Q.fail:Q.done?'✔ Geschafft! Menü → Quests für die nächste':qText(),x+10,y+30*s,w-20);
 if(Q.fail||Q.done){c.fillStyle='#9ab';c.fillText('Menü (Esc/☰) → Quests: neu starten oder beenden',x+10,y+48*s,w-20);}
 else if(Q.target){const dx=Q.target.x-ac.pos.x,dz=Q.target.z-ac.pos.z,dist=Math.hypot(dx,dz),brg=Math.atan2(dx,-dz);let rel=brg-fd.hdgRad;rel=Math.atan2(Math.sin(rel),Math.cos(rel));
  const ax=x+w-34*s,ay=y+h/2+4*s;c.save();c.translate(ax,ay);c.rotate(rel);c.fillStyle='#ffd24a';c.beginPath();c.moveTo(0,-16*s);c.lineTo(10*s,10*s);c.lineTo(0,4*s);c.lineTo(-10*s,10*s);c.closePath();c.fill();c.restore();
  c.fillStyle='#ffd24a';c.fillText(`Ziel: ${dist>2000?(dist/1000).toFixed(1)+' km':Math.round(dist)+' m'} · Höhe Ziel ${Math.round(Q.target.y*FT)} ft`,x+10,y+52*s,w-60*s);}
 c.restore();}

/* ================= Flugzeugwechsel, Resize, Spielschleife ================= */
function setAircraft(k){if(ac.model){scene.remove(ac.model.group);ac.model.group.traverse(o=>{if(o.geometry&&!o.geometry.userData.keep)o.geometry.dispose();});}
 acType=k;ac.P=TYPES[k];ac.model=TYPES[k].build();scene.add(ac.model.group);
 const sc=light.shadow.camera,r=ULTRA?Math.max(ac.model.shadowR,260):ac.model.shadowR;sc.left=sc.bottom=-r;sc.right=sc.top=r;sc.updateProjectionMatrix();
 spawn(false);setCam(camMode);flash(ac.P.name);}
function resize(){const w=innerWidth,h=innerHeight,pr=ULTRA?Math.min(Math.min(devicePixelRatio,2)*cfg.gfx.res,2.5):Math.min(devicePixelRatio,MOBILE?1.25:1.5)*cfg.gfx.res*dynRes,dpr=Math.min(devicePixelRatio,POTATO?1:2);
 renderer.setPixelRatio(pr);renderer.setSize(w,h);composer.setPixelRatio(pr);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
 hud.width=w*dpr;hud.height=h*dpr;hud.style.width=w+'px';hud.style.height=h+'px';hctx.setTransform(dpr,0,0,dpr,0,0);
 const ms=mini.clientWidth||180;mini.width=mini.height=ms*dpr;mctx.setTransform(dpr,0,0,dpr,0,0);}
addEventListener('resize',resize);
/* iOS meldet nach dem Drehen die neue Größe oft verspätet -> mehrfach nachmessen */
{const re=()=>{resize();setTimeout(resize,150);setTimeout(resize,500);setTimeout(resize,1000);};addEventListener('orientationchange',re);addEventListener('pageshow',re);
 if(window.visualViewport)visualViewport.addEventListener('resize',re);if(screen.orientation)screen.orientation.addEventListener?.('change',re);}
const clock=new THREE.Clock(),HSTEP=1/120;let accum=0,fpsS=60,dynT=0;
function emitters(){const A=ac,m=A.model,V=A.vel.length(),on=!A.crashed&&V>60&&(A.g>3||A.pos.y>7000),cc=0.3+1.1*dayF;
 m.tips.forEach((t,i)=>{_wp.copy(t).applyQuaternion(A.q).add(A.pos);const last=A.lastTip[i];
  if(on&&last){const d=_wp.distanceTo(last),k=Math.min(14,Math.ceil(d/2));for(let j=1;j<=k;j++){const f=j/k;emit(lerp(last.x,_wp.x,f),lerp(last.y,_wp.y,f),lerp(last.z,_wp.z,f),0,0,0,3.5,0.8,2.5,A.pos.y>7000?0.5:0.35,cc,cc,cc);}}
  if(last)last.copy(_wp);else A.lastTip[i]=_wp.clone();});}
function updModel(dt){const A=ac,m=A.model,P=A.P;m.group.position.copy(A.pos);m.group.quaternion.copy(A.q);
 if(m.gearMesh)m.gearMesh.visible=A.gearAnim>0.5;if(m.gearOn){const d=A.gearAnim>0.5;m.gearOn.forEach(o=>o.visible=d);m.gearOff.forEach(o=>o.visible=!d);}
 for(const l of m.legs){const t=(1-A.gearAnim)*1.55;if(l.axis==='x')l.piv.rotation.x=t*l.sign;else l.piv.rotation.z=t*l.sign;l.piv.visible=P.gearFixed||A.gearAnim>0.03;}
 if(m.prop){const sp=A.crashed?0:(8+A.thr*110);m.prop.rotation.z+=sp*dt;m.disc.visible=sp>30;m.prop.visible=sp<=30||camMode!==0;}
 for(const c of m.ab){c.visible=A.thr>0.03&&!A.crashed;const s=(A.ab?1:0.2+0.35*A.thr)*(0.9+Math.random()*0.2);c.scale.set(A.ab?1.1:0.8,A.ab?1.1:0.8,s);c.material.color.setRGB(A.ab?4:1.5,A.ab?1.8:0.9,A.ab?0.6:1.4);}}
function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),0.05);fpsS=lerp(fpsS,1/Math.max(dt,1e-3),0.05);
 dynT+=dt;if(dynT>2&&!ULTRA){dynT=0;const o=dynRes;if(fpsS<55&&dynRes>0.5)dynRes=Math.max(0.5,dynRes-0.1);else if(fpsS>58.5&&dynRes<1)dynRes=Math.min(1,dynRes+0.05);if(o!==dynRes)resize();}
 pollPad();gatherInput(dt);if(!paused&&!menuOpen)updAP(dt);
 if(!paused&&!menuOpen){updWind(simTime);tod=(tod+dt*TSPEED[cfg.tspeed]/3600+24)%24;simTime+=dt;accum+=dt;let n=0;
  while(accum>=HSTEP&&n++<10){if(!ac.crashed)step(HSTEP);accum-=HSTEP;}
  ac.flaps=toward(ac.flaps,ac.flapsSet/3,dt*0.35);ac.gearAnim=toward(ac.gearAnim,ac.gearDown?1:0,dt*0.4);
  emitters();updParticles(dt);toast.t-=dt;updQuest(dt);}
 updModel(dt);mpUpdate(dt);updCamera(dt);mpCam(dt);cineTick(dt);updEnv();computeFD();
 pMat.uniforms.uScale.value=renderer.domElement.height/(2*Math.tan(camera.fov*DEG/2));
 const blur=cfg.gfx.blur?clamp((fd.V-120)/350,0,0.55)*(camMode===2?0.3:1):0;afterPass.enabled=blur>0.02;afterPass.uniforms.damp.value=blur;
 updAudio();drawSpeed();if(cfg.gfx.direct)renderer.render(scene,camera);else composer.render(dt);
 drawHUD(Math.round(fpsS));mpDrawHUD();mctx.clearRect(0,0,mini.width,mini.height);const ms=mini.clientWidth||180;drawMap(mctx,ms/2,ms/2,ms/2,6000);
 if(camMode===0&&(!POTATO||(++scrF%3===0)))drawScreens();}
/* ================= MULTIPLAYER (PeerJS): Lobbys · Bordkanone · IR-Raketen (Fox 2) · Flares · Kill-Feed ================= */
const MPV='skyline-flight-v1-',MAXP=10,NOW=()=>performance.now()/1000;
const GUN={v:1050,rate:16,life:2.2,dmg:6,ammo:800};
const IR={ammo:4,range:4500,cone:13*DEG,gimbal:45*DEG,burn:2.6,acc:270,gmax:30,life:14,fuse:15,lockT:0.35,reload:25};
const r1=x=>Math.round(x*10)/10,r4=x=>Math.round(x*1e4)/1e4;
let mpName='';try{mpName=localStorage.getItem('skyflt_name')||'';}catch(e){}
const mp={peer:null,conns:new Map(),host:false,hostConn:null,lobby:null,connected:false,retries:0,myId:Math.random().toString(36).slice(2,10),
 name:mpName||('Pilot'+(100+Math.random()*900|0)),players:new Map(),feed:[],kills:0,deaths:0,hp:100,dead:false,deadT:0,inv:0,lastHit:null,shot:false,
 gun:GUN.ammo,ir:IR.ammo,irT:0,flares:30,flareN:0,sendT:0,gunCD:0,firing:false,lock:null,lockT:0,toneT:0,warnT:0,warn:null,status:'',center:null,
 hits:new Map(),wsel:'ir',rkt:38,atgm:8,rktT:0,atgmT:0,salvo:0,salvoT:0,hpI:0,tankKills:0,kc:null,lastTank:-1,known:new Map(),gone:new Map(),hostPid:null,sq:0,pingT:0,ping:null,hitW:'gun',hitT:0,hitMark:0,dmgFlash:0,nums:[],ownR:10,ownM:null,lobbyOpen:false,started:false,smokeT:0};
const _ma=new THREE.Vector3(),_mb=new THREE.Vector3(),_mc=new THREE.Vector3(),_md=new THREE.Vector3(),_me=new THREE.Vector3(),_mp=new THREE.Vector3(),
 _ga=new THREE.Vector3(),_gb=new THREE.Vector3(),_gc=new THREE.Vector3(),_gd=new THREE.Vector3(),_gp=new THREE.Vector3(),_sf=new THREE.Vector3(),_st=new THREE.Vector3(),_q1=new THREE.Quaternion(),_mq=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_mq2=new THREE.Quaternion();
const pname=id=>id==='tank'?'Flak-Panzer':/^T\d+$/.test(id)?'Panzer':id===mp.myId?mp.name:(mp.players.get(id)?.n||'Unbekannt');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function segDist(a,b,p){_mc.copy(b).sub(a);const l2=_mc.lengthSq();const t=l2>0?clamp(_md.copy(p).sub(a).dot(_mc)/l2,0,1):0;return _md.copy(a).addScaledVector(_mc,t).distanceTo(p);}
function modelR(g){const s=new THREE.Box3().setFromObject(g).getBoundingSphere(new THREE.Sphere());return clamp(s.radius,4,40);}

/* ---------- Effekte ---------- */
function mpBoom(p,s=1){const d=camera.position.distanceTo(p);sBurst('lowpass',260,0.7,clamp(900/Math.max(d,1),0.05,0.9)*s,1.4);
 for(let i=0,N=(POTATO?35:70)*s;i<N;i++){const r=Math.random,fire=i<N/2,sp=(fire?38:20)*s;
  emit(p.x,p.y,p.z,(r()-.5)*sp,(r()-.5)*sp,(r()-.5)*sp,fire?0.9+r()*0.6:3+r()*3,fire?5*s:7*s,fire?18*s:9*s,fire?1:0.55,fire?5:0.18,fire?2.2:0.17,fire?0.5:0.16);}}
/* ---------- Ultra: krasse Explosionen (Feuerball, Druckwelle, Lichtblitz, Trümmer, Rauchpilz) ---------- */
const MB={list:[],pool:[],light:null};
if(ULTRA){MB.light=new THREE.PointLight(0xffa050,0,0,2);MB.light.castShadow=false;scene.add(MB.light);
 MB.ballG=new THREE.IcosahedronGeometry(1,3);MB.ringG=new THREE.RingGeometry(0.82,1,72);}
function mbMesh(geo){const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:true}));m.frustumCulled=false;scene.add(m);return m;}
function megaBoom(p,s=1){if(!ULTRA)return;const r=Math.random,P=p.clone(),d=camera.position.distanceTo(P);
 // Feuerball, heißer Kern, Druckwelle
 MB.list.push({m:mbMesh(MB.ballG),t:0,T:1.1,k:'ball',s,p:P});MB.list.push({m:mbMesh(MB.ballG),t:0,T:0.35,k:'core',s,p:P});MB.list.push({m:mbMesh(MB.ringG),t:0,T:0.7,k:'ring',s,p:P});
 MB.lt=0.7;MB.li=9e4*s;MB.light.position.copy(P);
 // Partikel: Feuer, Funken/Trümmer, Rauchpilz
 for(let i=0;i<160*s;i++){const v=55*s*(0.4+r());const a=r()*6.283,b=Math.acos(2*r()-1);emit(P.x,P.y,P.z,Math.sin(b)*Math.cos(a)*v,Math.cos(b)*v,Math.sin(b)*Math.sin(a)*v,0.8+r()*0.9,6*s,22*s,1,7+r()*3,2.4+r(),0.5);}
 for(let i=0;i<110*s;i++){const v=140*(0.5+r());emit(P.x,P.y,P.z,(r()-.5)*v,(r()-.2)*v,(r()-.5)*v,1.2+r()*1.6,1.1,0.5,1,9,5,1.6);}
 for(let i=0;i<90*s;i++)emit(P.x+(r()-.5)*12*s,P.y+(r()-.5)*8*s,P.z+(r()-.5)*12*s,(r()-.5)*14,6+r()*16,(r()-.5)*14,5+r()*4,9*s,16*s,0.6,0.09,0.085,0.08);
 // Donner (verzögert mit Schallgeschwindigkeit), Wackeln wenn nah
 setTimeout(()=>{sBurst('lowpass',110,0.7,clamp(1600/Math.max(d,1),0.08,1)*Math.min(s,1.4),3.2);sBurst('bandpass',900,0.8,clamp(500/Math.max(d,1),0.03,0.6),0.6);},Math.min(d/340,2.5)*1000);
 if(d<1800)ac.shake=Math.max(ac.shake||0,(1-d/1800)*1.6*s);}
function megaTick(dt){if(!ULTRA)return;
 if(MB.lt>0){MB.lt-=dt;MB.light.intensity=MB.li*Math.max(0,MB.lt/0.7)**2;}else MB.light.intensity=0;
 for(let i=MB.list.length-1;i>=0;i--){const e=MB.list[i];e.t+=dt;const f=e.t/e.T,m=e.m;
  if(f>=1){scene.remove(m);m.material.dispose();MB.list.splice(i,1);continue;}
  m.position.copy(e.p);
  if(e.k==='ball'){const sc=(4+30*(1-Math.pow(1-f,3)))*e.s;m.scale.setScalar(sc);const h=1-f;m.material.color.setRGB(4.2*h,(1.6*h)*h+0.12*h,0.3*h*h);m.material.opacity=Math.min(1,h*1.4);}
  else if(e.k==='core'){m.scale.setScalar((3+18*f)*e.s);m.material.color.setRGB(7,5.5,3.5);m.material.opacity=1-f;}
  else{m.lookAt(camera.position);m.scale.setScalar((6+160*Math.pow(f,0.6))*e.s);m.material.color.setRGB(1.4,1.15,0.9);m.material.opacity=(1-f)*0.45;}}}
function mpSpark(p){for(let i=0;i<8;i++)emit(p.x,p.y,p.z,(Math.random()-.5)*40,(Math.random()-.5)*40,(Math.random()-.5)*40,0.35,1.2,3,1,6,4,1.5);}
function mpFlareFx(p,v){for(let i=0;i<6;i++){const s=i%2?1:-1;emit(p.x,p.y-1,p.z,v.x*0.5+s*(18+Math.random()*12),v.y*0.5-12-Math.random()*8,v.z*0.5+(Math.random()-.5)*20,2.6,2.6,1.2,1,7,4.5,1.6);}}
/* Raketen-Meshes (Pool) */
const msGeo=cylZ(0.14,0.14,3,8),msMat=M(0xe8e8e8,0.4,0.3),msFl=new THREE.MeshBasicMaterial({color:new THREE.Color(6,3.2,1),toneMapped:false}),msFlG=new THREE.SphereGeometry(0.35,8,6),msPool=[];
function msMesh(){let m=msPool.pop();if(!m){m=new THREE.Mesh(msGeo,msMat);const f=new THREE.Mesh(msFlG,msFl);f.position.z=-1.9;f.scale.set(1,1,3);m.add(f);m.userData.f=f;}scene.add(m);return m;}
function msFree(m){scene.remove(m);msPool.push(m);}
function msPose(mesh,p,v,burn){mesh.position.copy(p);_ma.copy(p).add(v);mesh.lookAt(_ma);mesh.userData.f.visible=burn;}
function msTrail(a,b,burn){const c=burn?0.85:0.6,n=POTATO?1:3;for(let i=0;i<n;i++){const f=i/n;emit(lerp(a.x,b.x,f),lerp(a.y,b.y,f),lerp(a.z,b.z,f),(Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2,burn?3.5:1.5,1.4,4,burn?0.5:0.15,c,c,c);}}
/* Leuchtspur-Geschosse */
const TRN=500,trPos=new Float32Array(TRN*6),trGeo=new THREE.BufferGeometry();trGeo.setAttribute('position',new THREE.BufferAttribute(trPos,3).setUsage(THREE.DynamicDrawUsage));
const tracers=new THREE.LineSegments(trGeo,new THREE.LineBasicMaterial({color:new THREE.Color(7,4.5,1.2),toneMapped:false}));tracers.frustumCulled=false;scene.add(tracers);
const bullets=[];
/* Leichte Zielhilfe für die Bordkanone: liegt ein Gegner (mit Vorhalt) knapp am Fadenkreuz, werden die Kugeln etwas zu ihm gezogen */
const _aa=new THREE.Vector3(),_ab=new THREE.Vector3(),_ac=new THREE.Vector3();
function gunAssist(o,fwd){const A=ac;let best=false,ba=3.2*DEG;
 const test=(p,v)=>{const d=p.distanceTo(o);if(d>1800||d<5)return;const tof=d/GUN.v;_aa.copy(p).addScaledVector(_ab.copy(v).sub(A.vel),tof);_aa.y+=0.5*9.81*tof*tof;_aa.sub(o).normalize();
  const a=_aa.angleTo(fwd);if(a<ba){ba=a;best=true;_ac.copy(_aa);}};
 for(const r of mp.players.values())if(!r.dead&&r.model&&!r.iv)test(r.pos,r.vel);
 for(const t of TANKS)if(!t.dead)test(t.c,_ZV);
 return best?_ab.copy(fwd).lerp(_ac,0.6).normalize():fwd;}
function shoot(o,dir,vel,mine){if(bullets.length>=TRN)bullets.shift();const v=dir.clone();v.x+=(Math.random()-.5)*0.007;v.y+=(Math.random()-.5)*0.007;v.z+=(Math.random()-.5)*0.007;
 v.normalize().multiplyScalar(GUN.v).add(vel);bullets.push({p:o.clone(),v,life:GUN.life,mine});}

/* ---------- Treffer ---------- */
function addHit(id,dmg,w,p){mp.hits.set(id,(mp.hits.get(id)||0)+dmg);mp.hitW=w;mp.hitMark=0.25;
 const last=mp.nums[mp.nums.length-1];if(last&&last.id===id&&last.w===w&&last.t>0.6){last.d+=dmg;last.t=0.95;}else mp.nums.push({id,w,p:p.clone(),d:dmg,t:0.95});
 if(SND.on)sBeep(w==='ir'?700:1900,0.03,0.07);}
function flushHits(){for(const [id,d] of mp.hits)mpSend({t:'hit',to:id,from:mp.myId,dmg:d,w:mp.hitW});mp.hits.clear();}
function mpOnHit(m){if(mp.dead||ac.crashed||(mp.inv>0&&!m.adm))return;const d=clamp(+m.dmg||0,0,200)*(ac.P.tank&&(m.w==='gun'||m.w==='flak')?0.35:1);mp.hp-=d;mp.lastHit={by:m.from,w:m.w,t:NOW()};
 mp.dmgFlash=Math.min(1,mp.dmgFlash+d/40);rumble(m.w==='ir'?600:120,m.w==='ir'?1:0.5,0.6);sBurst('bandpass',900,1,0.4,0.12);
 if(mp.hp<=0){mp.hp=0;mp.shot=true;ac.crashed='Abgeschossen von '+pname(m.from)+(({ir:' (IR-Rakete)',rkt:' (Raketen)',atgm:' (Hellfire)',flak:'',nuke:' (Atombombe)'})[m.w]??' (Bordkanone)');crashFx();}}
function mpOnKill(e){const K=(e.k?tagH(e.k):'')+esc(e.kn),V=tagH(e.v)+esc(e.vn||'?');let h;
 if(e.w==='coll'){if(e.q){renderLobbyIfOpen();return;}h=`💥 <b>${V}</b> und <b>${esc(e.wn||'?')}</b> sind zusammengestoßen`;}
 else if(e.w==='crash')h=`💥 <b>${V}</b> ist abgestürzt`;
 else if(e.w==='ground')h=`<b>${K}</b> hat <b>${V}</b> in den Boden getrieben`;
 else h=`<b>${K}</b><span class="wpn">${({ir:'🚀 IR-Rakete',rkt:'🚀 Raketen',atgm:'🎯 Hellfire',flak:'💥 Flak',nuke:'☢ Atombombe'})[e.w]||'︻デ═ Kanone'}</span><b>${V}</b>`;
 mpFeed(h,e.k===mp.myId&&e.v!==mp.myId?'me':e.v===mp.myId?'dead':'');
 if(e.k===mp.myId&&e.v!==mp.myId){mp.kills++;mp.center={t:2.6,big:'ELIMINIERT',small:(e.vn||'')+'  ·  '+mp.kills+(mp.kills===1?' Kill':' Kills')};
  sBeep(1500,0.08,0.2);setTimeout(()=>sBeep(2000,0.12,0.2),90);}
 if(e.v===mp.myId&&e.kn)mp.center={t:3.5,big:'ABGESCHOSSEN',small:'von '+e.kn,bad:true};
 renderLobbyIfOpen();}

/* ---------- Waffen ---------- */
/* Suchkreis in Bildschirm-Koordinaten (genau der gestrichelte Kreis im HUD) */
function seekCircle(){const A=ac,f=_sf.set(0,0,-1).applyQuaternion(A.q),u=_st.set(0,1,0).applyQuaternion(A.q);
 const c0=scr(_gc.copy(A.pos).addScaledVector(f,1000)),e=scr(_gd.copy(A.pos).addScaledVector(f,1000).addScaledVector(u,1000*Math.tan(IR.cone)));
 return mp.seekC=c0&&e?[c0[0],c0[1],Math.max(30,Math.hypot(e[0]-c0[0],e[1]-c0[1]))]:null;}
/* Ziel im Kreis = Lock. Ein bestehender Lock hält, solange das Ziel im 1,7-fachen Kreis bleibt */
function seek(keep,only){const A=ac,C=seekCircle(),f=_sf.set(0,0,-1).applyQuaternion(A.q);let best=null,bs=1e9;
 if(only!=='T')for(const r of mp.players.values()){if(r.dead||!r.model||r.iv)continue;_ga.copy(r.pos).sub(A.pos);const d=_ga.length();if(d<60||d>IR.range||_ga.dot(f)<=0)continue;
  let k;if(C){const p=scr(r.pos);if(!p)continue;k=Math.hypot(p[0]-C[0],p[1]-C[1])/C[2];}else k=_ga.angleTo(f)/IR.cone;
  if(k>(r.id===keep?1.7:1))continue;const sc=k+d/IR.range*0.3;if(sc<bs){bs=sc;best=r.id;}}
 if(only!=='P')for(let i=0;i<TANKS.length;i++){const t=TANKS[i];if(t.dead)continue;_ga.copy(t.c).sub(A.pos);const d=_ga.length();if(d<60||d>IR.range*0.75||_ga.dot(f)<=0)continue;   // Panzer (warmer Motor) – Flugzeuge haben Vorrang
  let k;if(C){const p=scr(t.c);if(!p)continue;k=Math.hypot(p[0]-C[0],p[1]-C[1])/C[2];}else k=_ga.angleTo(f)/IR.cone;const id='T'+i;
  if(k>(id===keep?1.7:1))continue;const sc=k+d/IR.range*0.3+0.25;if(sc<bs){bs=sc;best=id;}}
 return best;}
const _ZV=new THREE.Vector3();
function tgtOf(id){if(typeof id==='string'&&id[0]==='T'){const i=+id.slice(1),t=TANKS[i];return t&&!t.dead?{pos:t.c,vel:_ZV,dead:false,model:true,flT:-9,ti:i}:null;}return mp.players.get(id);}
const WPN={ir:{burn:IR.burn,acc:IR.acc,gmax:IR.gmax,fuse:IR.fuse,life:IR.life,gimbal:IR.gimbal,drag:0.07,splR:35,splD:60},
 rkt:{burn:1.1,acc:420,gmax:0,fuse:8,life:7,gimbal:0,drag:0.03,dmg:55,splR:22,splD:35},
 atgm:{burn:3.2,acc:200,gmax:22,fuse:10,life:16,gimbal:60*DEG,drag:0.04,dmg:80,splR:30,splD:60}};
const selAmmo=()=>!ac.P.heli||mp.wsel==='ir'?mp.ir:mp.wsel==='rkt'?mp.rkt:mp.atgm;
const myMs=[];let msSeq=0;
function launchFrom(k,tg,v0){const A=ac,f=_me.set(0,0,-1).applyQuaternion(A.q).clone(),hp=A.model.hard||[V3(0,-2.5,0)];mp.hpI=(mp.hpI+1)%hp.length;
 const p=hp[mp.hpI].clone().applyQuaternion(A.q).add(A.pos),v=A.vel.clone().addScaledVector(f,v0);if(k==='rkt'){v.x+=(Math.random()-.5)*3;v.y+=(Math.random()-.5)*3;v.z+=(Math.random()-.5)*3;}
 myMs.push({k,id:++msSeq,p,v,t:0,tg,fl:NOW(),mesh:msMesh()});}
function fireHeli(){const A=ac;if(A.crashed||mp.dead)return;
 if(mp.wsel==='rkt'){if(mp.rkt<1){flash('Keine Raketen – Nachladen läuft');return;}if(mp.salvo<=0){mp.salvo=Math.min(4,Math.floor(mp.rkt));mp.salvoT=0;}return;}
 if(mp.atgm<1){flash('Keine Hellfire – Nachladen läuft');return;}
 const tg=mp.lock&&mp.lock[0]==='T'&&mp.lockT>=IR.lockT?mp.lock:seek(mp.lock,'T');if(!tg){flash('Kein Panzer im Suchkreis');return;}
 mp.atgm--;mp.atgmT=0;launchFrom('atgm',tg,25);flash('HELLFIRE → Panzer');rumble(250,0.4,0.3);sBurst('highpass',600,0.7,0.5,1.1);}
function updWpnBtn(){const b=document.querySelector('#tbtns button[data-act=missile]');if(b)b.textContent=ac.P.heli?{ir:'STINGER',rkt:'RAKETEN',atgm:'HELLFIRE'}[mp.wsel]:ac.P.b2?'☢ BOMBE':ac.P.tank?'BASILISK':'FOX-2';}
function cycleWeapon(){if(!ac.P.heli){flash('Waffenwahl gibt es nur im Hubschrauber');return;}const L=['ir','rkt','atgm'],N={ir:'Stinger (Luft-Luft, Wärmesuche)',rkt:'Raketen-Salven (ungelenkt)',atgm:'Hellfire (Panzerabwehr)'};
 mp.wsel=L[(L.indexOf(mp.wsel)+1)%3];mp.lock=null;mp.lockT=0;flash('Waffe: '+N[mp.wsel]);updWpnBtn();}
function fireMissile(){const A=ac;if(A.P.b2){dropBomb();return;}if(A.P.heli&&mp.wsel!=='ir'){fireHeli();return;}if(A.crashed||mp.dead)return;if(mp.ir<1){flash('Keine IR-Raketen – Nachladen läuft');return;}
 mp.ir--;mp.irT=0;if(mp.infMs)mp.ir=IR.ammo;const f=_me.set(0,0,-1).applyQuaternion(A.q).clone(),dn=_mb.set(0,-1,0).applyQuaternion(A.q);
 const tg=mp.lock&&mp.lockT>=IR.lockT?mp.lock:seek(mp.lock,A.P.heli?'P':undefined);
 myMs.push({k:'ir',id:++msSeq,p:A.P.tank?A.model.pod.localToWorld(new THREE.Vector3(0,0,-1.6)):A.pos.clone().addScaledVector(dn,2.5),v:A.vel.clone().addScaledVector(f,20),t:0,tg,fl:NOW(),mesh:msMesh()});
 flash(tg?WPN_NAME()+' → '+pname(tg):WPN_NAME()+' – ohne Lock');if(A.P.tank){const pp=A.model.pod.localToWorld(new THREE.Vector3(0,0,-1.2));for(let i=0;i<14;i++)emit(pp.x,pp.y,pp.z,(Math.random()-.5)*8,Math.random()*4,(Math.random()-.5)*8,1.2+Math.random(),2,5,0.5,0.6,0.58,0.55);}rumble(250,0.4,0.3);sBurst('highpass',700,0.7,0.55,1.0);}
function dropFlares(){const A=ac;if(A.crashed||mp.dead||A.P.tank)return;if(mp.flares<=0){flash('Keine Flares mehr');return;}
 mp.flares--;mp.flareN++;mpFlareFx(A.pos,A.vel);sBurst('highpass',2500,0.8,0.3,0.25);}
function updMyMissiles(dt,now){for(let i=myMs.length-1;i>=0;i--){const m=myMs[i],W=WPN[m.k||'ir'];m.t+=dt;let sp=m.v.length();const d=_ga.copy(m.v).divideScalar(sp||1);
 if(m.t<W.burn)sp+=W.acc*dt;sp*=1-(m.t<W.burn?0.02:W.drag)*dt;
 let r=m.tg?tgtOf(m.tg):null;if(r&&(r.dead||!r.model)){r=null;m.tg=null;}
 if(r&&m.k==='ir'&&r.flT>m.fl){m.fl=r.flT;if(Math.random()<(r.ab?0.35:0.6)){r=null;m.tg=null;}}   // von Flares abgelenkt
 if(r&&W.gmax){const los=_gb.copy(r.pos).sub(m.p),dist=los.length();if(los.angleTo(d)>W.gimbal)m.tg=null;else{
   const cl=Math.max(150,-_gc.copy(r.vel).sub(m.v).dot(los)/Math.max(dist,1)),tgo=Math.min(dist/cl,6);
   const aim=_gd.copy(r.pos).addScaledVector(r.vel,tgo).sub(m.p).normalize(),ang=d.angleTo(aim),mx=W.gmax*9.81/Math.max(sp,50)*dt;
   if(ang>1e-4)d.lerp(aim,Math.min(1,mx/ang)).normalize();}}
 m.v.copy(d).multiplyScalar(sp);if(!m.tg)m.v.y-=9.81*dt*(m.k==='rkt'?1:0.5);
 const p0=_gp.copy(m.p);m.p.addScaledVector(m.v,dt);let boom=false;
 if(m.t>0.25)for(const o of mp.players.values()){if(o.dead||!o.model||o.iv)continue;const dd=segDist(p0,m.p,o.pos);
  if(dd<W.fuse+o.hitR*0.3){flushHits();addHit(o.id,m.k==='ir'||!m.k?Math.round(clamp(140-dd*7,45,130)):W.dmg,m.k||'ir',o.pos);flushHits();boom=true;break;}}
 if(!boom&&m.t>0.25&&r&&r.ti!=null&&segDist(p0,m.p,r.pos)<W.fuse){tankHit(r.ti,TANK_HP,r.pos);boom=true;}
 if(!boom&&m.k==='rkt'&&m.t>0.15)for(const t of TANKS)if(!t.dead&&segDist(p0,m.p,t.c)<6){boom=true;break;}
 if(!boom&&(m.t>W.life||m.p.y<groundH(m.p.x,m.p.z)||(m.t>0.2&&cityHit(m.p))))boom=true;
 if(boom){for(let k=0;k<TANKS.length;k++){const t=TANKS[k];if(!t.dead&&t.c.distanceTo(m.p)<W.splR)tankHit(k,W.splD,t.c);}mpBoom(m.p,m.k==='rkt'?0.5:0.7);megaBoom(m.p,m.k==='rkt'?0.6:1);msFree(m.mesh);myMs.splice(i,1);continue;}
 msPose(m.mesh,m.p,m.v,m.t<W.burn);msTrail(p0,m.p,m.t<W.burn);}}

/* ---------- Fremde Spieler ---------- */
function mpRemove(id){const r=mp.players.get(id);if(!r)return;if(r.model){scene.remove(r.model.group);r.model.group.traverse(o=>{if(o.geometry&&!o.geometry.userData.keep)o.geometry.dispose();});}
 for(const x of r.ms.values())msFree(x.mesh);mp.players.delete(id);}
function mpOnState(m){if(!Array.isArray(m.p)||!Array.isArray(m.q)||!m.id||m.id===mp.myId)return;const now=NOW();if(m.se&&!mp.host&&m.id===mp.hostPid){mp.lcBots=!!m.bo;if(m.se!==mp.season)setSeason(m.se);}let r=mp.players.get(m.id);if(r&&m.sq!=null&&r.sq!=null&&m.sq<=r.sq)return;   // veraltetes Paket (ungeordneter Kanal)
 if(!r){r={id:m.id,pos:new THREE.Vector3(...m.p),vel:new THREE.Vector3(),q:new THREE.Quaternion(...m.q),tp:new THREE.Vector3(),tv:new THREE.Vector3(),tq:new THREE.Quaternion(),
  ms:new Map(),fl:m.fl,flT:-9,gunT:0,model:null,ty:null,dead:!!m.dead,hitR:8,wv:new THREE.Vector3(),lat:0.05};mp.players.set(m.id,r);renderLobbyIfOpen();}
 const ty=ORDER.includes(m.ty)?m.ty:ORDER[0];
 if(r.ty!==ty){if(r.model)scene.remove(r.model.group);r.ty=ty;try{r.model=TYPES[ty].build();r.model.group.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});scene.add(r.model.group);r.hitR=modelR(r.model.group)*0.55;}catch(e){r.model=null;}}
 if(r.lts!=null&&m.ts>r.lts&&!m.dead&&!r.dead){const dtp=(m.ts-r.lts)/1000;_q1.set(...m.q).multiply(_q2.copy(r.tq).invert());if(_q1.w<0)_q1.set(-_q1.x,-_q1.y,-_q1.z,-_q1.w);
  const sn=Math.sqrt(Math.max(0,1-_q1.w*_q1.w));if(sn>1e-5&&dtp>0.005){const w=Math.min(2*Math.acos(Math.min(1,_q1.w))/dtp,4);r.wv.lerp(_ma.set(_q1.x/sn*w,_q1.y/sn*w,_q1.z/sn*w),0.6);}else r.wv.multiplyScalar(0.5);}
 r.lts=m.ts;r.sq=m.sq;r.tkp=Array.isArray(m.tkp)?m.tkp:null;{const c=mp.conns.get(m.id);r.lat=clamp(c&&c.open&&c.rtt!=null?c.rtt/2000:((mp.hostConn?.rtt??60)/2000+(m.hl??30)/1000),0,0.4);}
 r.n=String(m.n||'?').slice(0,16);r.tag=tagOk(m.tg);r.tp.set(...m.p);r.tv.set(...(m.v||[0,0,0]));r.tq.set(...m.q);r.rt=now;r.th=m.th||0;r.ab=m.ab;r.gd=m.gd;r.gun=m.g;r.hp=m.hp??100;r.k=m.k||0;r.d=m.d||0;r.tk=m.tk||0;r.iv=m.iv;
 if(m.dead&&!r.dead){mpBoom(r.pos,1.3);if(r.model&&!r.model.isTank)wreck(r.pos,r.vel,r.hitR/0.55);megaBoom(r.pos,1.8);const P=r.pos.clone();if(ULTRA)for(let i=1;i<=3;i++)setTimeout(()=>megaBoom(P.clone().add(new THREE.Vector3((Math.random()-.5)*30,(Math.random()-.5)*20,(Math.random()-.5)*30)),0.55),180*i+Math.random()*150);}
 if(!m.dead&&r.dead){r.pos.copy(r.tp);r.q.copy(r.tq);}
 r.dead=!!m.dead;
 if(m.fl!==r.fl){r.fl=m.fl;r.flT=now;mpFlareFx(r.pos,r.tv);}
 const seen=new Set();for(const a of m.ms||[]){seen.add(a[0]);let x=r.ms.get(a[0]);if(!x){x={p:new THREE.Vector3(),v:new THREE.Vector3(),mesh:msMesh()};r.ms.set(a[0],x);}
  x.p.set(a[1],a[2],a[3]);x.v.set(a[4],a[5],a[6]);x.tg=a[7];}
 for(const [id,x] of r.ms)if(!seen.has(id)){mpBoom(x.p,0.6);megaBoom(x.p,1);msFree(x.mesh);r.ms.delete(id);}}
function updRemote(r,dt,now){const m=r.model,g=m.group;
 const lead=Math.min(now-r.rt+r.lat,0.6);_ma.copy(r.tp).addScaledVector(r.tv,lead);r.vel.copy(r.tv);r.pos.addScaledVector(r.vel,dt).lerp(_ma,Math.min(1,dt*10));if(r.pos.distanceTo(_ma)>250)r.pos.copy(_ma);
 const w=r.wv.length();if(w>1e-3){_mq.setFromAxisAngle(_mb.copy(r.wv).divideScalar(w),w*Math.min(lead,0.35));_mq2.copy(_mq).multiply(r.tq);}else _mq2.copy(r.tq);
 r.q.slerp(_mq2,Math.min(1,dt*15));const far=r.pos.distanceToSquared(camera.position)>7000*7000;g.visible=!r.dead&&!far;g.position.copy(r.pos);g.quaternion.copy(r.q);if(m.isTank&&r.tkp){r.tkT=(r.tkT||0)+r.tv.length()*dt*(r.tkp[5]<0?-1:1);tankPose(m,r.tkp[0],r.tkp[1],r.tkp[2],r.tkp[3],r.tkp[4],r.tkT);}
 const P=TYPES[r.ty];if(!far){for(const l of m.legs){l.piv.rotation.set(0,0,0);l.piv.visible=!!(P.gearFixed||r.gd);}
 if(m.gearMesh)m.gearMesh.visible=!!r.gd;if(m.gearOn){m.gearOn.forEach(o=>o.visible=!!r.gd);m.gearOff.forEach(o=>o.visible=!r.gd);}
 if(m.prop){m.prop.rotation.z+=(8+r.th*110)*dt;m.disc.visible=true;m.prop.visible=false;}
 if(m.props){for(const pp of m.props)pp.visible=false;for(const d of m.discs)d.visible=true;}if(m.floats)seaFloatPose(m,toward(m.floatK||0,r.gd?0:1,dt*0.45));
 if(m.rotors){const w=r.dead?0:(2+r.th*36);for(const o of m.rotors)o.rotation.y+=w*dt;m.rotorDisc.material.opacity=r.dead?0:clamp((r.th-0.1)*0.45,0,0.2);}
 for(const c of m.ab){c.visible=r.th>0.03&&!r.dead;const s=(r.ab?1:0.2+0.35*r.th)*(0.9+Math.random()*0.2);c.scale.set(r.ab?1.1:0.8,r.ab?1.1:0.8,s);c.material.color.setRGB(r.ab?4:1.5,r.ab?1.8:0.9,r.ab?0.6:1.4);}}
 if(r.gun&&!r.dead){r.gunT-=dt;const f=_mb.set(0,0,-1).applyQuaternion(r.q);while(r.gunT<0){r.gunT+=1/GUN.rate;_ma.copy(r.pos).addScaledVector(f,r.hitR);shoot(_ma,f,r.vel,false);}}
 for(const x of r.ms.values()){_ma.copy(x.p);x.p.addScaledVector(x.v,dt);msPose(x.mesh,x.p,x.v,true);msTrail(_ma,x.p,true);
  if(x.tg===mp.myId&&!mp.dead){const d=x.p.distanceTo(ac.pos);if(mp.warn===null||d<mp.warn)mp.warn=d;}}}

/* ---------- Netzwerk: Mesh – jeder Spieler direkt mit jedem verbunden (ungeordnete, aber zuverlässige Kanäle = kein Stau bei Paketverlust).
   Der Host ist nur Lobby-Anker (feste ID) und Relais, falls zwei Spieler keine Direktverbindung bekommen. ---------- */
/* ICE-Server: STUN + TURN. TURN (Umleitung) ist nötig, wenn Handys im Mobilfunk/hinter CGNAT keine Direktverbindung bekommen.
   Open Relay (Metered) mit zeitlich begrenzten Zugangsdaten per HMAC; PeerJS-TURN als Reserve. */
const PROTO=13;
let ICE=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']},{urls:'stun:stun.cloudflare.com:3478'},{urls:['turn:eu-0.turn.peerjs.com:3478','turn:us-0.turn.peerjs.com:3478'],username:'peerjs',credential:'peerjsp'}];
(async()=>{try{if(!window.crypto||!crypto.subtle)return;const user=(Math.floor(Date.now()/1000)+3*86400)+':skyline';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('openrelayprojectsecret'),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(user)));let bin='';for(const x of sig)bin+=String.fromCharCode(x);
 ICE=[ICE[0],ICE[1],{urls:['turn:staticauth.openrelay.metered.ca:80','turn:staticauth.openrelay.metered.ca:80?transport=tcp','turn:staticauth.openrelay.metered.ca:443','turns:staticauth.openrelay.metered.ca:443?transport=tcp'],username:user,credential:btoa(bin)},ICE[2]];}catch(e){}})();
const PEER_OPTS=()=>Object.assign({debug:0,config:{iceServers:ICE}},window.SKY_PEER||{}),CONN_OPTS={reliable:false,serialization:'json'};
let evSeq=0;const seenEv=new Set();
function mpStatus(s){mp.status=s;const e=$('lbStatus');if(e)e.textContent=s;}
function mpRaw(c,m){try{if(c&&c.open)c.send(m);}catch(e){}}
function mpSend(m){if(!mp.connected)return;if(m.t!=='s'&&!m.eid)m.eid=mp.myId+':'+(++evSeq);
 if(m.to&&mp.host&&String(m.to).startsWith('bot-')){mpHandle(m);return;}
 if(m.to){const c=mp.conns.get(m.to);if(c&&c.open)mpRaw(c,m);else if(!mp.host)mpRaw(mp.hostConn,Object.assign({},m,{rl:[m.to]}));return;}
 const miss=[];if(!mp.host)for(const id of mp.known.keys())if(id!==mp.hostPid&&!mp.conns.get(id)?.open)miss.push(id);
 for(const [id,c] of mp.conns){if(miss.length&&id===mp.hostPid)continue;mpRaw(c,m);}
 if(miss.length)mpRaw(mp.hostConn,Object.assign({},m,{rl:miss}));}
function mpWire(p,c){c.on('data',m=>{if(mp.peer===p)mpRecv(c,m);});c.on('close',()=>{if(mp.peer===p)mpConnClosed(c);});c.on('error',()=>{});}
function mpDial(id,peerId){if(!mp.peer||mp.conns.get(id)?.open)return;const p=mp.peer,c=p.connect(peerId,CONN_OPTS);mpWire(p,c);
 c.on('open',()=>{if(mp.peer!==p)return;c.pid=id;mp.conns.set(id,c);mpRaw(c,{t:'hello2',id:mp.myId,n:mp.name});});}
function mpRecv(c,m){if(!m||typeof m!=='object')return;
 switch(m.t){
  case 'pi':mpRaw(c,{t:'po',ts:m.ts});return;
  case 'po':{const rtt=performance.now()-m.ts;if(rtt>=0&&rtt<5000)c.rtt=c.rtt==null?rtt:lerp(c.rtt,rtt,0.3);return;}
  case 'hello':if(!mp.host)return;
   if(m.v!==PROTO){mpRaw(c,{t:'old',v:PROTO});setTimeout(()=>c.close(),600);return;}
   if(mp.conns.size+1>=MAXP){mpRaw(c,{t:'full'});setTimeout(()=>c.close(),400);return;}
   {const id=String(m.id).slice(0,16),n=String(m.n||'').slice(0,16),peers=[...mp.known].filter(([k])=>k!==id).map(([k,v])=>({id:k,n:v.n,peer:v.peer}));
    c.pid=id;mp.conns.set(id,c);mp.known.set(id,{n,peer:c.peer});mp.gone.delete(id);mpRaw(c,{t:'welcome',v:PROTO,hid:mp.myId,hn:mp.name,peers});
    const j={t:'join',id,n,peer:c.peer};mpSend(j);mpHandle(j);}return;
  case 'hello2':c.pid=String(m.id).slice(0,16);mp.conns.set(c.pid,c);if(!mp.known.has(c.pid))mp.known.set(c.pid,{n:m.n,peer:c.peer});return;
  case 'old':mpLeave();mpStatus('⚠ Unterschiedliche Spielversionen! Alle müssen dieselbe, neueste index.html benutzen.');renderLobbyIfOpen();return;
  case 'welcome':if(mp.host||c!==mp.hostConn)return;if(m.v!==PROTO){mpLeave();mpStatus('⚠ Der Host benutzt eine ältere Spielversion – alle brauchen dieselbe, neueste index.html.');renderLobbyIfOpen();return;}clearTimeout(mp.joinTO);c.pid=mp.hostPid=String(m.hid);mp.conns.set(c.pid,c);mp.known.set(c.pid,{n:m.hn,peer:c.peer});
   mp.connected=true;mp.retries=0;mpStatus('Verbunden: '+lobbyName());mpFeed('Du bist <b>'+esc(lobbyName())+'</b> beigetreten','sys');renderLobbyIfOpen();
   for(const p of m.peers||[]){mp.known.set(p.id,{n:p.n,peer:p.peer});mpDial(p.id,p.peer);}return;
  case 'full':mpStatus('Lobby ist voll ('+MAXP+' Spieler).');mpLeave();renderLobbyIfOpen();return;}
 if(!c.pid)return;
 if(mp.host&&Array.isArray(m.rl)){const tg=m.rl;delete m.rl;for(const id of tg){const o=mp.conns.get(id);if(o&&o!==c)mpRaw(o,m);}}
 if(m.to&&m.to!==mp.myId&&!(mp.host&&String(m.to).startsWith('bot-')))return;
 if(m.eid){if(seenEv.has(m.eid))return;seenEv.add(m.eid);if(seenEv.size>600)seenEv.delete(seenEv.values().next().value);}
 mpHandle(m);}
function mpConnClosed(c){const id=c.pid;if(id&&mp.conns.get(id)===c)mp.conns.delete(id);
 if(!mp.host&&c===mp.hostConn){mpHostLost();return;}
 if(mp.host&&id&&mp.known.has(id)){const m={t:'leave',id};mpSend(m);mpHandle(m);}}
function mpHandle(m){if(!m||typeof m!=='object')return;switch(m.t){
 case 's':if(!mp.gone.has(m.id))mpOnState(m);break;
 case 'hit':if(m.to===mp.myId)mpOnHit(m);else if(mp.host&&String(m.to).startsWith('bot-'))botOnHit(m);break;
 case 'kill':if(m.v!==mp.myId)mpOnKill(m);break;
 case 'js':if(m.to===mp.myId)jumpscare();break;
 case 'tag':if(m.to===mp.myId)setMyTag(m.tg?tagOk(m.tg):null);break;
 case 'tpg':if(m.to===mp.myId)setTP(!!m.on);break;
 case 'col':if(m.to===mp.myId)collHit(m.from,String(m.n||'?').slice(0,16),!m.q);else if(mp.host&&String(m.to).startsWith('bot-')){const b=BOTS.find(x=>x.id===m.to);if(b&&!b.dead)botDie(b,null,'coll',true);}break;
 case 'tr':if(m.to===mp.myId&&typeof m.k==='string')troll(m.k,String(m.n||'Admin').slice(0,16),typeof m.from==='string'?m.from:null);break;
 case 'nk':if(Array.isArray(m.p)&&m.from!==mp.myId)nukeFx(new THREE.Vector3(+m.p[0],+m.p[1],+m.p[2]));break;
 case 'tk':if(TANKS[m.i])tankDestroy(m.i,false,String(m.n||'?').slice(0,16));break;
 case 'join':if(m.id===mp.myId)break;mp.known.set(m.id,{n:m.n,peer:m.peer});mp.gone.delete(m.id);mpFeed(`<b>${esc(m.n)}</b> ist beigetreten`,'sys');renderLobbyIfOpen();break;
 case 'leave':{if(m.id===mp.myId)break;const n=mp.known.get(m.id)?.n||pname(m.id);mp.known.delete(m.id);mp.gone.set(m.id,NOW());
  const c=mp.conns.get(m.id);if(c){mp.conns.delete(m.id);try{c.close();}catch(e){}}
  mpRemove(m.id);mpFeed(`<b>${esc(n)}</b> hat die Lobby verlassen`,'sys');renderLobbyIfOpen();break;}}}
function mpLeave(){mp.lobby=null;mp.connected=false;mp.host=false;mp.hostPid=null;const p=mp.peer;mp.peer=null;mp.hostConn=null;
 for(const c of mp.conns.values())try{c.close();}catch(e){}mp.conns.clear();mp.known.clear();if(p)try{p.destroy();}catch(e){}
 for(const id of [...mp.players.keys()])mpRemove(id);}
const lobbyName=()=>!mp.lobby?'Einzelspieler':mp.lobby.startsWith('pub-')?'Öffentliche Lobby '+mp.lobby.slice(4):'Private Lobby '+mp.lobby.slice(5);
function mpHostLost(){const id=mp.lobby;mpLeave();mp.lobby=id;
 mpFeed('Host weg – Lobby wird neu aufgebaut …','sys');mpStatus('Verbindung zum Host verloren – verbinde neu …');
 setTimeout(()=>{if(mp.lobby===id&&!mp.connected)mpJoin(id,'claim',true);},300+Math.random()*1700);}
/* mode: 'claim' = Host werden falls frei, sonst beitreten · 'host' = neue private Lobby · 'client' = nur beitreten */
function mpJoin(id,mode,retry){mpLeave();if(!retry){mp.retries=0;seasonFor(id,mode);}
 if(typeof Peer==='undefined'){mpStatus('PeerJS konnte nicht geladen werden – Internetverbindung prüfen.');renderLobbyIfOpen();return;}
 mp.lobby=id;mpStatus('Verbinde mit '+lobbyName()+' …');renderLobbyIfOpen();const anchor=MPV+id;
 const onErr=(p,e)=>{if(mp.peer!==p)return;const t=e&&e.type;
  if(t==='peer-unavailable'){if(!String(e.message||'').includes(anchor))return;   // nur ein Mitspieler nicht erreichbar -> Relais übernimmt
   if(mode==='client'){mpLeave();mpStatus('Lobby „'+id.slice(5)+'“ nicht gefunden.');renderLobbyIfOpen();}
   else if(mp.retries++<6)setTimeout(()=>{if(mp.lobby===id&&!mp.connected)mpJoin(id,'claim',true);},800+Math.random()*1500);
   else{mpLeave();mpStatus('Lobby nicht erreichbar.');renderLobbyIfOpen();}}
  else if(t==='network'||t==='server-error'||t==='socket-error'||t==='socket-closed'||t==='browser-incompatible'||t==='ssl-unavailable')mpStatus('Netzwerkfehler ('+t+') – bitte erneut versuchen.');
  else if(t&&t!=='unavailable-id'&&!mp.connected)mpStatus('Verbindungsproblem ('+t+') – versuche weiter …');};
 const common=p=>{p.on('connection',c=>mpWire(p,c));p.on('disconnected',()=>{try{if(mp.peer===p&&!p.destroyed)p.reconnect();}catch(e){}});};
 const asClient=()=>{const p=new Peer(PEER_OPTS());mp.peer=p;common(p);p.on('error',e=>onErr(p,e));
  p.on('open',()=>{if(mp.peer!==p)return;const c=p.connect(anchor,CONN_OPTS);mp.hostConn=c;mpWire(p,c);c.on('open',()=>mpRaw(c,{t:'hello',v:PROTO,id:mp.myId,n:mp.name}));
   clearTimeout(mp.joinTO);mp.joinTO=setTimeout(()=>{if(mp.peer!==p||mp.connected)return;   // WebRTC kommt nicht zustande (z. B. Mobilfunk-Sperre)
    if(mp.retries++<2){mpStatus('Verbindung zum Host hängt – neuer Versuch …');mpJoin(id,mode,true);}
    else{mpLeave();mpStatus('❌ Keine Verbindung zum Host möglich. Das Netzwerk blockiert vermutlich die Verbindung (Schul-WLAN/Mobilfunk). Tipp: anderes WLAN oder Handy-Hotspot probieren.');renderLobbyIfOpen();}},15000);});};
 if(mode==='client'){asClient();return;}
 const p=new Peer(anchor,PEER_OPTS());mp.peer=p;common(p);
 p.on('open',()=>{if(mp.peer!==p)return;mp.host=true;mp.connected=true;mp.retries=0;mpStatus((mode==='host'?'Private Lobby erstellt':'Lobby bereit')+' – du bist Host.');mpFeed('<b>'+esc(lobbyName())+'</b> läuft – du bist Host','sys');renderLobbyIfOpen();});
 p.on('error',e=>{if(mp.peer!==p)return;if(e.type==='unavailable-id'){mp.peer=null;try{p.destroy();}catch(_){}
   if(mode==='host')mpJoin('priv-'+mkCode(),'host',true);else asClient();}else onErr(p,e);});}
const mkCode=()=>Array.from({length:5},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random()*32|0]).join('');
function mpPing(){if(mp.host){const a=[...mp.conns.values()].map(c=>c.rtt).filter(x=>x!=null);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;}return mp.hostConn?.rtt??null;}
function mpState(){const A=ac;return{t:'s',id:mp.myId,sq:++mp.sq,ts:Math.round(performance.now()),hl:mp.host?0:Math.round((mp.hostConn?.rtt||60)/2),n:mp.name,ty:acType,
 p:[r1(A.pos.x),r1(A.pos.y),r1(A.pos.z)],q:[r4(A.q.x),r4(A.q.y),r4(A.q.z),r4(A.q.w)],
 v:[r1(A.vel.x),r1(A.vel.y),r1(A.vel.z)],th:Math.round(A.thr*100)/100,ab:A.ab?1:0,gd:A.gearDown?1:0,g:mp.firing?1:0,dead:mp.dead?1:0,hp:Math.ceil(mp.hp),tg:mp.tag||undefined,se:mp.host?mp.season:undefined,bo:mp.host?(mp.lcBots?1:0):undefined,tkp:A.P.tank&&A.tank?[r4(A.tank.yaw),r4(A.tank.tur),r4(A.tank.el),r4(A.tank.pitch),r4(A.tank.roll),Math.sign(A.tank.spd)]:undefined,k:mp.kills,d:mp.deaths,tk:mp.tankKills,
 iv:mp.inv>0?1:0,fl:mp.flareN,ms:myMs.map(m=>[m.id,r1(m.p.x),r1(m.p.y),r1(m.p.z),r1(m.v.x),r1(m.v.y),r1(m.v.z),m.tg||0]).concat(admMs?[[admMs.id,r1(admMs.p.x),r1(admMs.p.y),r1(admMs.p.z),r1(admMs.v.x),r1(admMs.v.y),r1(admMs.v.z),mp.myId]]:[])};}

/* ---------- Tod & Respawn ---------- */
function mpRevive(){mp.coll=null;mp.nk=NUKE_N;mp.kc=null;mp.rage=null;mp.dead=false;mp.rkt=38;mp.atgm=8;mp.salvo=0;mp.hp=100;mp.gun=GUN.ammo;mp.ir=IR.ammo;mp.flares=30;mp.inv=3;mp.lastHit=null;mp.shot=false;ac.model.group.visible=true;}
/* Zufällige Piste – bevorzugt frei (kein anderer Spieler darauf/im Anflug) und nicht dieselbe wie zuletzt */
function mpPickRunway(){const cnt=RUNWAYS.map(r=>{let n=0;for(const p of mp.players.values()){if(p.dead)continue;const[lx,lz]=r.L(p.pos.x,p.pos.z);
  if(Math.abs(lx)<600&&Math.abs(lz)<r.hl+1500&&p.pos.y<r.elev+400)n++;}return n;});
 const lo=Math.min(...cnt),pool=RUNWAYS.filter((r,i)=>cnt[i]===lo),other=pool.filter(r=>r!==curRw),L=other.length?other:pool;return L[Math.random()*L.length|0];}
function mpSpawnRunway(){curRw=mpPickRunway();spawn(false);mp.spawnProt=true;mp.inv=3;flash('Spawn: '+curRw.name+' – Piste '+curRw.num+(mp.players.size?'':' '));}

/* ---------- VISUELLE EFFEKTE: Kondensstreifen · Überschall-Dampfkegel · Wrackteile · Wetter · Polarlichter · Stadt bei Nacht ---------- */
const LDV='#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}';
const _fa=new THREE.Vector3(),_fb=new THREE.Vector3(),_fc=new THREE.Vector3(),_fr=new THREE.Vector3(),_fu=new THREE.Vector3();
/* Dampfkegel-Geometrie (vorne scharfe Kante, nach hinten ausfransend) */
const CONE_G=(()=>{const pts=[];for(let i=0;i<=10;i++){const t=i/10;pts.push(new THREE.Vector2(0.3+0.62*Math.pow(t,0.7),0.32-t*0.75));}const g=new THREE.LatheGeometry(pts,40);g.rotateX(-Math.PI/2);return g;})();
const CONE_FS=`#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uA,uT;varying vec2 vUv;
void main(){
#include <logdepthbuf_fragment>
 float s=0.6+0.4*sin(vUv.x*6.2832*17.0+uT*9.0+sin(vUv.x*40.0)*2.0);float a=uA*smoothstep(0.0,0.06,vUv.y)*pow(1.0-vUv.y,1.6)*s;gl_FragColor=vec4(vec3(0.93,0.96,1.0),a);}`;
const FXT=new Map();
function fxPlanes(){const L=[],A=ac;
 if(!A.crashed&&!mp.dead&&!A.P.tank&&!A.P.heli)L.push({id:'_me',pos:A.pos,vel:A.vel,q:A.q,R:mp.ownR||12,me:true});
 for(const r of mp.players.values())if(!r.dead&&r.model&&r.model.group.visible&&!r.model.isTank&&!TYPES[r.ty]?.heli)L.push({id:r.id,pos:r.pos,vel:r.vel,q:r.q,R:r.hitR/0.55});return L;}
function fxTick(dt){if(dt<=0)return;const seen=new Set(),day=0.15+0.85*dayF;
 for(const p of fxPlanes()){seen.add(p.id);let t=FXT.get(p.id);if(!t){t={pv:p.vel.clone(),d:0,M:0,cone:null};FXT.set(p.id,t);}
  const V=p.vel.length(),f=_fa.set(0,0,-1).applyQuaternion(p.q),rt=_fr.set(1,0,0).applyQuaternion(p.q);
  // Lastvielfaches aus Richtungsänderung
  const ang=V>30&&t.pv.lengthSq()>1?t.pv.angleTo(p.vel):0,G=ang/dt*V/9.81;t.pv.copy(p.vel);t.G=lerp(t.G||1,G,Math.min(1,dt*6));
  // Kondensstreifen ab ~2300 m
  const k=smooth(2200,3000,p.pos.y);t.d+=V*dt;
  if(k>0.01&&V>60&&t.d>9){t.d=0;for(const s of p.R>9?[-0.11,0.11]:[0]){_fb.copy(p.pos).addScaledVector(f,-p.R*0.5).addScaledVector(rt,s*p.R);
   emit(_fb.x,_fb.y,_fb.z,p.vel.x*0.02,p.vel.y*0.02,p.vel.z*0.02,7,p.R*0.24,p.R*0.55,0.75*k,day,day,day*1.02);}}
  else if(t.d>9)t.d=0;
  // Flügelspitzen-Wirbel bei hoher Last
  if(t.G>3.8&&V>70){const a=0.32*smooth(3.8,7,t.G);for(const s of [-0.47,0.47]){_fb.copy(p.pos).addScaledVector(rt,s*p.R).addScaledVector(f,-p.R*0.12);
   emit(_fb.x,_fb.y,_fb.z,0,0,0,0.55,p.R*0.035,p.R*0.06,a,day,day,day);}}
  // Überschall-Dampfkegel
  const M=V/sos(p.pos.y),cA=smooth(0.93,0.985,M)*(1-smooth(1.02,1.09,M))*0.8;
  if(cA>0.01&&!t.cone){t.cone=new THREE.Mesh(CONE_G,new THREE.ShaderMaterial({uniforms:{uA:{value:0},uT:{value:0}},vertexShader:LDV,fragmentShader:CONE_FS,transparent:true,depthWrite:false,side:THREE.DoubleSide}));t.cone.frustumCulled=false;scene.add(t.cone);}
  if(t.cone){t.cone.visible=cA>0.01&&!(p.me&&camMode===0);if(t.cone.visible){t.cone.position.copy(p.pos).addScaledVector(f,-p.R*0.05);t.cone.quaternion.copy(p.q);t.cone.scale.setScalar(p.R*0.62);
   t.cone.material.uniforms.uA.value=cA*(0.4+0.6*day);t.cone.material.uniforms.uT.value=simTime;}}
  if(t.M<1&&M>=1&&t.M>0.85){const d=p.me?0:p.pos.distanceTo(camera.position);if(d<3000){sBurst('lowpass',85,0.8,1.3*(1-d/3000),1.3);setTimeout(()=>sBurst('lowpass',60,0.7,0.9*(1-d/3000),1.6),120);if(p.me){ac.shake=Math.max(ac.shake||0,1.2);rumble(350,1,0.8);flash('💥 Schallmauer durchbrochen!');}}}
  t.M=M;}
 for(const [id,t] of FXT)if(!seen.has(id)){if(t.cone){scene.remove(t.cone);t.cone.material.dispose();}FXT.delete(id);}
 wreckTick(dt);auroraTick();cityNight(dt);}

/* ---------- Wrackteile beim Abschuss ---------- */
const WRK=[],WRK_M=[new THREE.MeshStandardMaterial({color:0x4a4d52,roughness:0.55,metalness:0.6}),new THREE.MeshStandardMaterial({color:0x1c1c1e,roughness:0.9,metalness:0.2})];
const WRK_G=[new THREE.BoxGeometry(1,0.06,0.42),new THREE.CylinderGeometry(0.2,0.24,0.75,8).rotateX(Math.PI/2),new THREE.BoxGeometry(0.28,0.16,0.34),new THREE.BoxGeometry(0.5,0.04,0.3)];
function wreck(pos,vel,R){R=clamp(R||12,4,40);const n=POTATO?7:10;
 for(let i=0;i<n;i++){if(WRK.length>=40){const o=WRK.shift();scene.remove(o.m);}
  const gi=i<2?0:i<4?1:i<6?3:2,m=new THREE.Mesh(WRK_G[gi],WRK_M[i%3===0?1:0]);m.scale.setScalar(R*(gi===0?0.42:gi===1?0.4:0.3)*(0.7+Math.random()*0.5));m.position.copy(pos);m.castShadow=false;scene.add(m);
  const v=new THREE.Vector3().randomDirection().multiplyScalar(14+Math.random()*30);v.y=Math.abs(v.y)*0.8+6;v.addScaledVector(vel,0.35);
  WRK.push({m,v,w:new THREE.Vector3((Math.random()-.5)*12,(Math.random()-.5)*12,(Math.random()-.5)*12),life:3.5+Math.random()*2.5,age:0,fT:0,fire:Math.random()<0.75,s0:m.scale.x});}}
function wreckTick(dt){for(let i=WRK.length-1;i>=0;i--){const o=WRK[i],m=o.m;o.age+=dt;
  if(o.age>o.life){scene.remove(m);WRK.splice(i,1);continue;}
  o.v.y-=9.81*dt;o.v.multiplyScalar(1-0.25*dt);m.position.addScaledVector(o.v,dt);m.rotation.x+=o.w.x*dt;m.rotation.y+=o.w.y*dt;m.rotation.z+=o.w.z*dt;
  const gh=Math.max(groundH(m.position.x,m.position.z),0);if(m.position.y<gh+0.3){m.position.y=gh+0.3;o.v.multiplyScalar(0.3);o.v.y=Math.abs(o.v.y)*0.3;o.w.multiplyScalar(0.5);}
  if(o.life-o.age<0.6)m.scale.setScalar(o.s0*Math.max(0.01,(o.life-o.age)/0.6));
  if((o.fT-=dt)<=0){o.fT=POTATO?0.08:0.045;const p=m.position,burn=o.fire&&o.age<o.life*0.75;
   if(burn)emit(p.x,p.y,p.z,(Math.random()-.5)*2,1.5,(Math.random()-.5)*2,0.45,o.s0*0.35,o.s0*0.6,0.85,4,1.5,0.3);
   emit(p.x,p.y,p.z,(Math.random()-.5)*1.5,2,(Math.random()-.5)*1.5,2.2,o.s0*0.3,o.s0*1.4,0.4,0.07,0.07,0.075);}}}

/* ---------- POLARLICHTER (Winternächte, klarer Himmel) ---------- */
let AUR=null;
function auroraTick(){const want=mp.season==='winter'&&nightF>0.05;if(!want&&!AUR)return;
 if(!AUR){AUR=new THREE.Mesh(new THREE.CylinderGeometry(42000,42000,15000,96,1,true,Math.PI*0.35,Math.PI*1.3),new THREE.ShaderMaterial({uniforms:{uT:{value:0},uA:{value:0}},vertexShader:LDV,
  fragmentShader:`#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uT,uA;varying vec2 vUv;
float ah(float x){return fract(sin(x*127.1)*43758.5453);}float an(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(ah(i),ah(i+1.),f);}
void main(){
#include <logdepthbuf_fragment>
 float x=vUv.x*36.0;float c=an(x*0.45+uT*0.04)*0.65+an(x*1.6-uT*0.07)*0.35;float base=0.08+c*0.22+0.05*sin(vUv.x*80.0+uT*0.25);
 float y=vUv.y;float sh=smoothstep(base,base+0.06,y)*(1.0-smoothstep(base+0.12,base+0.75,y));
 float rays=0.55+0.45*an(vUv.x*700.0+uT*0.6);vec3 col=mix(vec3(0.12,1.0,0.5),vec3(0.65,0.25,1.0),smoothstep(base+0.15,base+0.6,y));
 float a=uA*sh*(0.35+0.65*c)*rays*smoothstep(0.0,0.08,vUv.x)*(1.0-smoothstep(0.92,1.0,vUv.x));gl_FragColor=vec4(col*a*1.4,1.0);}`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));AUR.frustumCulled=false;AUR.renderOrder=-1;scene.add(AUR);}
 const a=want?smooth(0.05,0.6,nightF):0;AUR.visible=a>0.01;if(AUR.visible){AUR.position.set(camera.position.x,camera.position.y+9000,camera.position.z);AUR.material.uniforms.uA.value=a;AUR.material.uniforms.uT.value=simTime;}}

/* ---------- STADT BEI NACHT: Laternen-Lichtkegel, fahrende Autos mit Scheinwerfern, Flugwarnlichter ---------- */
let CNL=null;
function cityNight(dt){const ni=nightF;if(ni<0.03&&!CNL)return;
 if(!CNL){const Y=RWY,L=CN*CPITCH,hp=[],pool=[];
  for(let k=0;k<=CN;k++)for(let t=CPITCH/2;t<L;t+=CPITCH/2)for(const sd of [-1,1])for(const [x,z,ry] of [[CX0+k*CPITCH+sd*(CSTREET/2+1),CZ0+t,sd>0?Math.PI:0],[CX0+t,CZ0+k*CPITCH+sd*(CSTREET/2+1),sd>0?-Math.PI/2:Math.PI/2]]){
   const hx=x+Math.cos(ry)*2.1,hz=z-Math.sin(ry)*2.1;hp.push(hx,Y+7.7,hz);pool.push(hx,Y+0.6,hz);}
  const mk=(arr,size,col,op)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));const m=new THREE.Points(g,new THREE.PointsMaterial({map:softTex,size,color:col,transparent:true,opacity:op,depthWrite:false,blending:THREE.AdditiveBlending}));m.frustumCulled=false;m.userData.op=op;scene.add(m);return m;};
  const cars=[];for(let i=0;i<(POTATO?110:200);i++){const k=Math.random()*(CN+1)|0,ax=Math.random()<.5,sd=Math.random()<.5?-1:1;cars.push({k,ax,sd,t:Math.random()*L,v:(9+Math.random()*7)*sd});}
  const cp=new Float32Array(cars.length*6),cc=new Float32Array(cars.length*6);cars.forEach((c,i)=>{cc.set([2.2,2.1,1.7,2.2,0.08,0.04],i*6);});
  const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.BufferAttribute(cp,3));cg.setAttribute('color',new THREE.BufferAttribute(cc,3));
  const carP=new THREE.Points(cg,new THREE.PointsMaterial({map:softTex,size:8,vertexColors:true,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending}));carP.frustumCulled=false;carP.userData.op=1;scene.add(carP);
  const tall=CITYB.filter(b=>b.h-Y>85).flatMap(b=>[(b.x0+b.x1)/2,b.h+1,(b.z0+b.z1)/2]);
  CNL={heads:mk(hp,11,0xffe2b0,1),pools:mk(pool,60,0xffa860,0.5),carP,cars,L,av:mk(tall,14,0xff2a1a,1)};}
 const vis=ni>0.03;for(const o of [CNL.heads,CNL.pools,CNL.carP,CNL.av]){o.visible=vis;o.material.opacity=o.userData.op*ni;}if(!vis)return;
 CNL.av.material.opacity=(simTime%1.6<0.55?1:0.08)*ni;
 const a=CNL.carP.geometry.attributes.position.array,L=CNL.L,Y=RWY+0.8;CNL.cars.forEach((c,i)=>{c.t=((c.t+c.v*dt)%L+L)%L;const lane=CX0+c.k*CPITCH+c.sd*3.2,d=Math.sign(c.v)*2.3,o=i*6;
  if(c.ax){a[o]=lane;a[o+1]=Y;a[o+2]=CZ0+c.t+d;a[o+3]=lane;a[o+4]=Y;a[o+5]=CZ0+c.t-d;}else{const ln=CZ0+c.k*CPITCH-c.sd*3.2;a[o]=CX0+c.t+d;a[o+1]=Y;a[o+2]=ln;a[o+3]=CX0+c.t-d;a[o+4]=Y;a[o+5]=ln;}});
 CNL.carP.geometry.attributes.position.needsUpdate=true;}

/* ---------- Saison-Designs für Lobby & Menü (automatisch nach Datum; Admin kann im Admin-Menü testen) ---------- */
const THEMES={
 halloween:{n:'🎃 Halloween',ban:'🎃 Happy Halloween! 👻',a:'#ff8a1f',bd:'#7a3d12',bg:'radial-gradient(ellipse at 78% 12%,rgba(255,150,40,.32),transparent 38%),linear-gradient(180deg,#1b0a2a 0%,#2a0f1e 55%,#120806 100%)',
  p:[{e:'🦇',n:7,a:'fly',s:[22,40],d:[7,14]},{e:'👻',n:4,a:'rise',s:[30,46],d:[16,26],o:.55},{e:'🕸️',n:0}],x:'moon,web,pumpkins'},
 xmas:{n:'🎄 Weihnachten',ban:'🎄 Frohe Weihnachten! 🎅',a:'#ff4a4a',bd:'#2f6a3a',bg:'radial-gradient(ellipse at 50% 0%,rgba(80,140,255,.25),transparent 50%),linear-gradient(180deg,#071a2e 0%,#0b2a24 60%,#05110c 100%)',
  p:[{e:'❄',n:26,a:'fall',s:[10,24],d:[9,18],c:'#fff',o:.85},{e:'⭐',n:5,a:'twinkle',s:[10,16],d:[2,4]},{e:'🛷🦌🦌',n:1,a:'fly',s:[30,30],d:[18,18]}],x:'lights,trees'},
 newyear:{n:'🎆 Silvester',ban:()=>'🎆 Frohes neues Jahr '+(new Date().getMonth()===11?new Date().getFullYear()+1:new Date().getFullYear())+'! 🥂',a:'#ffd84a',bd:'#5a4a8c',bg:'linear-gradient(180deg,#05040f 0%,#120a2c 60%,#1a0f22 100%)',
  p:[{e:'conf',n:30,a:'fall',s:[6,10],d:[6,12]},{e:'boom',n:7,a:'burst',s:[90,170],d:[2.2,3.4]}],x:''},
 valentine:{n:'💘 Valentinstag',ban:'💘 Happy Valentine’s Day! 💕',a:'#ff5c9a',bd:'#8a2c58',bg:'radial-gradient(ellipse at 50% 100%,rgba(255,80,150,.35),transparent 60%),linear-gradient(180deg,#2a0a1c 0%,#3a0f2a 100%)',
  p:[{e:'💗',n:12,a:'rise',s:[16,34],d:[8,15]},{e:'💕',n:6,a:'rise',s:[14,26],d:[9,16]}],x:''},
 easter:{n:'🐣 Ostern',ban:'🐣 Frohe Ostern! 🐰',a:'#ffd34a',bd:'#4f8a5a',bg:'radial-gradient(ellipse at 50% 110%,rgba(120,220,140,.35),transparent 55%),linear-gradient(180deg,#1b2a4a 0%,#2a2350 55%,#1c3a2a 100%)',
  p:[{e:'🌷',n:6,a:'float',s:[20,30],d:[5,9]},{e:'🌼',n:6,a:'float',s:[18,26],d:[5,9]},{e:'🐇',n:1,a:'hop',s:[40,40],d:[14,14]}],x:'eggs'},
 april:{n:'🤡 1. April',ban:'🤡 1. April – nichts ist, wie es scheint 🐟',a:'#ff6af0',bd:'#5a7a2a',bg:'linear-gradient(200deg,#0e2a2a 0%,#2a0e2a 100%)',
  p:[{e:'🐟',n:10,a:'fall',s:[18,30],d:[7,13]},{e:'🤡',n:2,a:'float',s:[34,44],d:[4,7]}],x:'tilt'}};
function easterDate(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;return new Date(y,Math.floor(n/31)-1,n%31+1);}
function autoTheme(d=new Date()){const md=(d.getMonth()+1)*100+d.getDate(),de=Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-easterDate(d.getFullYear()))/864e5);
 if(md>=1227||md<=102)return 'newyear';if(md>=1201)return 'xmas';if(md>=1021&&md<=1102)return 'halloween';if(md>=210&&md<=214)return 'valentine';
 if(de>=-7&&de<=1)return 'easter';if(md===401)return 'april';return null;}
const thPref=()=>{try{const q=new URLSearchParams(location.search).get('theme');if(q)return q;return localStorage.getItem('skyflt_theme')||'auto';}catch(_){return 'auto';}};
let TH=null,THK=null;
(()=>{const st=document.createElement('style');st.textContent=`
.thLayer{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0}#lobby>.wrap,#menu>.wrap{position:relative;z-index:1}
.thP{position:absolute;left:0;top:0;line-height:1;will-change:transform;user-select:none}
@keyframes thFall{from{transform:translate3d(0,-12vh,0) rotate(0)}to{transform:translate3d(var(--dx),112vh,0) rotate(var(--r))}}
@keyframes thRise{from{transform:translate3d(0,112vh,0) rotate(-8deg)}50%{transform:translate3d(calc(var(--dx)*-1),50vh,0) rotate(8deg)}to{transform:translate3d(var(--dx),-15vh,0) rotate(-8deg)}}
@keyframes thFly{0%{transform:translate3d(-14vw,0,0) scaleY(1)}25%{transform:translate3d(20vw,-5vh,0) scaleY(.7)}50%{transform:translate3d(50vw,2vh,0) scaleY(1)}75%{transform:translate3d(80vw,-6vh,0) scaleY(.7)}100%{transform:translate3d(114vw,0,0) scaleY(1)}}
@keyframes thFloat{0%,100%{transform:translate3d(0,0,0) rotate(-6deg)}50%{transform:translate3d(0,-14px,0) rotate(6deg)}}
@keyframes thTw{0%,100%{opacity:.15;transform:scale(.6)}50%{opacity:1;transform:scale(1.1)}}
@keyframes thBurst{0%{transform:scale(.05);opacity:1}70%{opacity:1}100%{transform:scale(1);opacity:0}}
@keyframes thHopX{from{transform:translateX(-10vw)}to{transform:translateX(110vw)}}@keyframes thHopY{0%,100%{transform:translateY(0)}50%{transform:translateY(-34px)}}
@keyframes thBlink{0%,100%{opacity:1;filter:brightness(1.3)}50%{opacity:.35;filter:brightness(.7)}}
@keyframes thFlick{0%,100%{filter:drop-shadow(0 0 6px #ff8a1f)}50%{filter:drop-shadow(0 0 16px #ffb04a)}}
.thBan{display:inline-block;margin-left:12px;padding:5px 12px;border-radius:999px;font-weight:800;font-size:14px;background:var(--thA);color:#140a00;box-shadow:0 0 18px var(--thA);vertical-align:middle}
body[data-th] #lobby{background:var(--thBg)}body[data-th] #menu{background:linear-gradient(rgba(6,10,20,.55),rgba(6,10,20,.55)),var(--thBg)}
body[data-th] #lobby .card,body[data-th] #menu .card{background:rgba(10,16,28,.66);border-color:var(--thBd);box-shadow:0 0 0 1px #0004,0 8px 30px #0006}
body[data-th] #lobby h2,body[data-th] #menu h2{color:var(--thA)}
body[data-th] #lobby .b.on,body[data-th] #menu .b.on{background:var(--thA);border-color:var(--thA);color:#140a00}
body[data-th=april] #lobby .card:nth-child(odd){transform:rotate(-.7deg)}body[data-th=april] #lobby .card:nth-child(even){transform:rotate(.6deg)}
.thMoon{position:absolute;right:7vw;top:6vh;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle at 38% 35%,#fff6d8,#ffd27a 60%,#d9902a);box-shadow:0 0 60px 20px rgba(255,190,90,.35)}
.thWeb{position:absolute;left:0;top:0;width:190px;height:190px;opacity:.5}
.thRow{position:absolute;left:0;right:0;bottom:4px;display:flex;justify-content:space-around;font-size:38px}
.thRow span{animation:thFlick 1.6s ease-in-out infinite}
.thLights{position:absolute;left:0;right:0;top:-6px;height:40px;display:flex;justify-content:space-around;align-items:flex-start;border-top:2px solid #1d3a22}
.thLights i{width:10px;height:15px;border-radius:50% 50% 45% 45%;margin-top:6px;animation:thBlink 1.4s ease-in-out infinite;box-shadow:0 0 12px currentColor;background:currentColor}
.thTree{position:absolute;bottom:0;font-size:84px;filter:drop-shadow(0 0 14px #ffd84a66)}
.thBoom{border-radius:50%;width:6px;height:6px}
`;document.head.appendChild(st);})();
function thParts(L,P,key){const R=(a,b)=>a+Math.random()*(b-a),W=innerWidth,H=innerHeight;
 for(const q of P){for(let i=0;i<q.n;i++){const el=document.createElement('div');el.className='thP';const sz=R(q.s[0],q.s[1]),du=R(q.d[0],q.d[1]),dl=-Math.random()*du;
  if(q.e==='conf'){const pal=q.pal||['#ff4a4a','#ffd84a','#3ee07a','#4ab0ff','#ff5cf0','#fff'];el.style.cssText+=`width:${sz}px;height:${sz*0.5}px;background:${pal[i%pal.length]};border-radius:2px`;}
  else if(q.e==='boom'){const pal=['#ffd84a','#ff5c5c','#5cf0ff','#8aff5c','#ff8af0','#fff'],c=pal[i%pal.length];let sh=[];for(let k=0;k<18;k++){const a=k/18*6.283;sh.push(`${Math.cos(a)*sz/2}px ${Math.sin(a)*sz/2}px 0 2px ${c}`);}
   el.classList.add('thBoom');el.style.boxShadow=sh.join(',');el.style.left=R(10,90)+'vw';el.style.top=R(8,55)+'vh';el.style.animation=`thBurst ${du}s ease-out ${dl}s infinite`;L.appendChild(el);continue;}
  else{el.textContent=q.e;el.style.fontSize=sz+'px';if(q.c)el.style.color=q.c;}
  if(q.o)el.style.opacity=q.o;el.style.setProperty('--dx',R(-12,12)+'vw');el.style.setProperty('--r',R(-540,540)+'deg');
  if(q.a==='fall'){el.style.left=R(0,100)+'vw';el.style.animation=`thFall ${du}s linear ${dl}s infinite`;}
  else if(q.a==='rise'){el.style.left=R(0,95)+'vw';el.style.animation=`thRise ${du}s ease-in-out ${dl}s infinite`;}
  else if(q.a==='fly'){el.style.top=R(5,q.e.length>2?18:45)+'vh';el.style.animation=`thFly ${du}s linear ${dl}s infinite`;}
  else if(q.a==='float'){el.style.left=R(2,92)+'vw';el.style.top=R(55,85)+'vh';el.style.animation=`thFloat ${du}s ease-in-out ${dl}s infinite`;}
  else if(q.a==='twinkle'){el.style.left=R(0,100)+'vw';el.style.top=R(2,40)+'vh';el.style.animation=`thTw ${du}s ease-in-out ${dl}s infinite`;}
  else if(q.a==='hop'){el.style.top='calc(100vh - 70px)';el.style.animation=`thHopX ${du}s linear ${dl}s infinite`;const s=document.createElement('div');s.textContent=q.e;s.style.cssText='animation:thHopY .6s ease-in-out infinite;transform-origin:bottom';el.textContent='';el.appendChild(s);}
  L.appendChild(el);}}}
function thExtras(L,x){const add=h=>L.insertAdjacentHTML('beforeend',h);
 if(x.includes('moon'))add('<div class="thMoon"></div>');
 if(x.includes('web'))add('<svg class="thWeb" viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width=".6">'+[0,15,30,45,60,75,90].map(a=>`<line x1="0" y1="0" x2="${100*Math.cos(a*Math.PI/180)}" y2="${100*Math.sin(a*Math.PI/180)}"/>`).join('')+[20,38,56,74,92].map(r=>`<path d="${[0,15,30,45,60,75,90].map((a,i)=>(i?'Q':'M')+(i?` ${r*0.82*Math.cos((a-7.5)*Math.PI/180)} ${r*0.82*Math.sin((a-7.5)*Math.PI/180)} `:'')+` ${r*Math.cos(a*Math.PI/180)} ${r*Math.sin(a*Math.PI/180)}`).join('')}"/>`).join('')+'</svg>');
 if(x.includes('pumpkins'))add('<div class="thRow">'+'🎃🕯️🎃💀🎃🕯️🎃'.match(/\p{Extended_Pictographic}️?/gu).map((e,i)=>`<span style="animation-delay:${i*0.3}s">${e}</span>`).join('')+'</div>');
 if(x.includes('lights'))add('<div class="thLights">'+Array.from({length:Math.max(12,Math.round(innerWidth/45))},(_,i)=>`<i style="color:${['#ff4040','#ffd84a','#40ff7a','#4ab0ff'][i%4]};animation-delay:${(i%4)*0.35}s"></i>`).join('')+'</div>');
 if(x.includes('trees'))add('<div class="thTree" style="left:1vw">🎄</div><div class="thTree" style="right:1vw;font-size:64px">🎁</div>');
 if(x.includes('eggs'))add('<div class="thRow" style="font-size:30px">'+['#ff8ac8','#8ad8ff','#ffe17a','#a8ff8a','#c89aff','#ffb27a','#7affe0'].map((c,i)=>`<span style="animation:none;display:inline-block;width:26px;height:34px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:repeating-linear-gradient(${i*25}deg,${c} 0 7px,#fff8 7px 10px);box-shadow:0 4px 8px #0006"></span>`).join('')+'</div>');
}
function applyTheme(){const pref=thPref(),k=pref==='auto'?autoTheme():(THEMES[pref]?pref:null);if(k===THK&&document.querySelector('.thLayer'))return;THK=k;TH=k?THEMES[k]:null;
 document.querySelectorAll('.thLayer').forEach(e=>e.remove());const B=document.body;
 if(!TH){delete B.dataset.th;renderLobbyIfOpen();return;}
 B.dataset.th=k;B.style.setProperty('--thA',TH.a);B.style.setProperty('--thBd',TH.bd);B.style.setProperty('--thBg',TH.bg);
 for(const id of ['lobby','menu']){const host=$(id);if(!host)continue;const L=document.createElement('div');L.className='thLayer';thParts(L,TH.p,k);thExtras(L,TH.x||'');host.insertBefore(L,host.firstChild);}
 renderLobbyIfOpen();}
const thBan=()=>TH&&THK==='newyear'?`<span class="thBan">${typeof TH.ban==='function'?TH.ban():TH.ban}</span>`:'';
setTimeout(applyTheme,0);setInterval(applyTheme,600000);

/* ---------- JAHRESZEITEN: Sommer · Herbst (orange) · Winter (Schnee, Eis zum Landen/Schlittern) · Frühling (sattes Grün) ---------- */
const SEASONS=['summer','autumn','winter','spring'],SN={summer:'☀ Sommer',autumn:'🍂 Herbst',winter:'❄ Winter',spring:'🌸 Frühling'};
const SEAS_U={uSn:{value:0},uAu:{value:0},uSp:{value:0}};
mp.season='summer';mp.lcBots=false;mp.pickBo=true;mp.pickSe=(()=>{try{const s=localStorage.getItem('skyflt_se');return SEASONS.includes(s)?s:'winter';}catch(_){return 'winter';}})();
let seasDone=false,SNOW=null;
const UPV='float up=dot(normal,normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz));vec3 c=diffuseColor.rgb;float lum=dot(c,vec3(0.3,0.59,0.11));';
const TERR_GL=`{${UPV}float sat=1.0-c.b/max(c.g,1e-4);float gr=smoothstep(0.45,0.75,sat)*step(c.b,c.g);
 vec3 wp=cameraPosition+transpose(mat3(viewMatrix))*(-vViewPosition);
 float n1=sVn(wp.xz*0.0035)*0.55+sVn(wp.xz*0.018)*0.3+sVn(wp.xz*0.09)*0.15,n2=sVn(wp.xz*0.0011+7.3);
 c*=mix(1.0,0.8+0.4*n1,gr);
 vec3 au=mix(vec3(lum*2.7,lum*0.88,lum*0.12),vec3(lum*1.8,lum*1.25,lum*0.25),smoothstep(0.3,0.7,n1));
 c=mix(c,au,gr*uAu*mix(0.35,0.85,n2));
 c=mix(c,vec3(c.r*0.8,c.g*1.22,c.b*0.8)*(0.88+0.24*n2),gr*uSp);
 if(uSn>0.5){
  c=mix(c,vec3(lum*1.15,lum*0.95,lum*0.7)*0.85,gr);
  float cover=smoothstep(0.36,0.66,up)*smoothstep(0.42,0.54,n1+(up-0.75));cover=max(cover,0.5*smoothstep(0.12,0.42,up)*smoothstep(0.35,0.6,n1));
  vec3 sc=mix(vec3(0.15,0.19,0.27),vec3(0.33,0.355,0.4),smoothstep(0.6,0.97,up));
  sc*=(0.5+0.95*n1)*mix(vec3(0.78,0.85,1.0),vec3(1.12),smoothstep(-20.,900.,wp.y));
  c=mix(c,sc,cover);}
 diffuseColor.rgb=c;}`;
const treeGL=k=>`{${UPV}float hv=fract(lum*731.0);vec3 au=mix(vec3(3.5,0.85,0.1),vec3(2.7,1.75,0.14),hv)*lum;
 c=mix(c,au,uAu*${k});c=mix(c,vec3(c.r*0.8,c.g*1.4,c.b*0.8),uSp);
 c=mix(c,vec3(0.6,0.64,0.7),uSn*(0.18+0.62*smoothstep(0.05,0.65,up)));diffuseColor.rgb=c;}`;
function seasPatchMat(mat,code,key){const prev=mat.onBeforeCompile,pk=mat.customProgramCacheKey.bind(mat);
 mat.onBeforeCompile=(sh,r)=>{if(prev)prev.call(mat,sh,r);Object.assign(sh.uniforms,SEAS_U);sh.fragmentShader='uniform float uSn,uAu,uSp;\nfloat sHs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat sVn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sHs(i),sHs(i+vec2(1,0)),f.x),mix(sHs(i+vec2(0,1)),sHs(i+vec2(1,1)),f.x),f.y);}\n'+sh.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+code);};
 mat.customProgramCacheKey=()=>pk()+key;mat.needsUpdate=true;}
function seasInit(){if(seasDone)return;seasDone=true;
 seasPatchMat(terrain.material,TERR_GL,'seasT');
 if(TREE_MS.length===2){const m0=TREE_MS[0].material,m1=m0.clone();m1.onBeforeCompile=m0.onBeforeCompile;TREE_MS[1].material=m1;seasPatchMat(m0,treeGL('0.15'),'seasP');seasPatchMat(m1,treeGL('1.0'),'seasL');}
 else for(const t of TREE_MS){if(!t.instanceColor){const c=new THREE.Color();for(let i=0;i<t.count;i++)t.setColorAt(i,c.setScalar(0.8+Math.random()*0.4));}seasPatchMat(t.material,treeGL('1.0'),'seasL');}
 const wm=water.material;wm.uniforms.uIce={value:0};
 wm.fragmentShader=wm.fragmentShader.replace('uniform float uT,','uniform float uIce;uniform float uT,').replace(' col=mix(col,uFog,1.0-exp(',
 ` if(uIce>0.5){float c1=vn(p*0.0035)*0.55+vn(p*0.021)*0.3+vn(p*0.13)*0.15;vec3 ic=mix(vec3(0.34,0.48,0.6),vec3(0.80,0.87,0.94),smoothstep(0.25,0.85,c1));
  float k=abs(vn(p*0.009)-0.5);ic*=0.78+0.22*smoothstep(0.0,0.025,k);ic*=(0.12+uDay*0.88);vec3 rr=reflect(-v,vec3(0.,1.,0.));float fr=0.04+0.96*pow(1.0-max(v.y,0.0),5.0);
  col=mix(ic,uSky,fr*0.45)+uSunC*pow(max(dot(rr,uSun),0.0),90.0)*1.2;}
 col=mix(col,uFog,1.0-exp(`);wm.needsUpdate=true;}
function setSeason(s){if(!SEASONS.includes(s))s='summer';seasInit();const ch=mp.season!==s;mp.season=s;
 SEAS_U.uSn.value=s==='winter'?1:0;SEAS_U.uAu.value=s==='autumn'?1:0;SEAS_U.uSp.value=s==='spring'?1:0;ICE_ON=s==='winter';water.material.uniforms.uIce.value=ICE_ON?1:0;
 if(ICE_ON&&!SNOW){const n=MOBILE||POTATO?1200:3000,p=new Float32Array(n*3);for(let i=0;i<n*3;i++)p[i]=Math.random()*400;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p.slice(),3));
  SNOW=new THREE.Points(g,new THREE.PointsMaterial({map:softTex,size:0.9,color:0xffffff,transparent:true,opacity:0.85,depthWrite:false}));SNOW.frustumCulled=false;SNOW.userData.b=p;scene.add(SNOW);}
 if(SNOW)SNOW.visible=ICE_ON;if(ch&&mp.started)flash('Jahreszeit: '+SN[s]);if(ch)renderLobbyIfOpen();}
function seasonFor(id,mode){const priv=id.startsWith('priv-');setSeason(id==='pub-2'||(priv&&mode==='host')?mp.pickSe:'summer');mp.lcBots=id==='pub-3'||(priv&&mode==='host'&&mp.pickBo);}
function seasonTick(dt){if(!SNOW||!SNOW.visible)return;const a=SNOW.geometry.attributes.position,b=SNOW.userData.b,c=camera.position,t=simTime;
 for(let i=0;i<a.count;i++){const j=i*3,dr=Math.sin(i*1.7+t*0.6)*1.5;a.array[j]=c.x+((b[j]+dr*t*0.3-c.x)%400+600)%400-200;a.array[j+1]=c.y+((b[j+1]-t*(4+(i%5))-c.y)%400+600)%400-200;a.array[j+2]=c.z+((b[j+2]-c.z)%400+600)%400-200;}a.needsUpdate=true;}
function seasonUI(){const L=mp.lobby||'',can=mp.host&&(L==='pub-2'||L.startsWith('priv-'));
 let h='<div class="row" style="margin:8px 0"><span>Jahreszeit:</span>'+(can?SEASONS.map(s=>`<button class="b ${mp.season===s?'on':''}" data-lb="se" data-s="${s}">${SN[s]}</button>`).join(''):
  `<b>${SN[mp.season]}</b><span class="note">${L==='pub-1'?'Lobby 1 bleibt immer Sommer':L==='pub-2'?'vom Ersten in der Lobby gewählt':L==='pub-3'?'Bot-Krieg':'vom Host gewählt'}</span>`)+'</div>';
 if(L.startsWith('priv-')&&mp.host)h+=`<div class="row"><span>Bots:</span><button class="b ${mp.lcBots?'on':''}" data-lb="bo">${mp.lcBots?'🤖 Mit Bots':'Ohne Bots'}</button></div>`;
 else if(mp.lcBots)h+='<p class="note">🤖 Bot-Krieg: KI-Jets jagen dich – und schießen sich auch gegenseitig ab.</p>';return h;}

/* ---------- BOTS (nur der Host rechnet sie; für alle anderen sind es normale Mitspieler) ---------- */
const BOT_OFF=Math.random()*10|0,BOTS=[],BOT_N=['Viper','Ghost','Iceman','Falcon','Raptor','Hawk','Blaze','Storm','Jester','Cobra'],_bv=new THREE.Vector3(),_bw=new THREE.Vector3(),_br=new THREE.Vector3(),_bu=new THREE.Vector3(),_bq=new THREE.Quaternion(),_bm=new THREE.Matrix4(),BUP=new THREE.Vector3(0,1,0);
function botSpawn(b){const a=Math.random()*6.28,r=3000+Math.random()*6000;b.pos.set(Math.cos(a)*r,1400+Math.random()*1800,Math.sin(a)*r);b.pos.y=Math.max(b.pos.y,Math.max(groundH(b.pos.x,b.pos.z),0)+900);
 b.dir.set(-Math.cos(a),0,-Math.sin(a)).applyAxisAngle(BUP,(Math.random()-.5)*1.5).normalize();b.spd=220+Math.random()*30;b.hp=100;b.dead=false;b.tg=null;b.tgT=0;b.bank=0;b.lh=null;}
function botNew(i){const tys=['f15','f15','f117','seaplane','f15'].filter(t=>ORDER.includes(t)),b={id:'bot-'+Math.random().toString(36).slice(2,7),n:'🤖 '+BOT_N[(i+BOT_OFF)%BOT_N.length],ty:tys[i%tys.length]||ORDER[0],
 pos:new THREE.Vector3(),dir:new THREE.Vector3(0,0,-1),vel:new THREE.Vector3(),q:new THREE.Quaternion(),spd:230,k:0,d:0,sq:0,sendT:Math.random()*0.1,fireT:0,firing:false,respT:0,wp:new THREE.Vector3()};botSpawn(b);return b;}
function botsClear(){for(const b of BOTS)mpRemove(b.id);BOTS.length=0;}
function botTargets(){const L=[];if(!mp.dead&&!ac.crashed&&!menuOpen&&!ac.P.tank&&mp.inv<=0)L.push({id:mp.myId,pos:ac.pos,vel:ac.vel,h:1});
 for(const r of mp.players.values())if(!r.dead&&r.model&&!r.model.isTank&&!r.iv&&!r.id.startsWith('bot-'))L.push({id:r.id,pos:r.pos,vel:r.vel,h:1});
 for(const b of BOTS)if(!b.dead)L.push({id:b.id,pos:b.pos,vel:b.vel,h:0,b});return L;}
function botDmg(id,from,dmg){if(id===mp.myId)mpOnHit({to:id,from,dmg,w:'gun'});else if(id.startsWith('bot-'))botOnHit({to:id,from,dmg,w:'gun'});else mpSend({t:'hit',to:id,from,dmg,w:'gun'});}
function botOnHit(m){const b=BOTS.find(x=>x.id===m.to);if(!b||b.dead)return;b.hp-=clamp(+m.dmg||0,0,200);b.lh={by:m.from,w:m.w,t:NOW()};if(m.from&&m.from!==b.id&&Math.random()<0.6)b.tg=m.from;if(b.hp<=0)botDie(b,m.from,m.w);}
function botDie(b,by,w,quiet){b.dead=true;b.respT=7;b.d++;b.firing=false;if(w==='coll'){mpSend({t:'kill',k:null,kn:null,v:b.id,vn:b.n,w:'coll',q:1});botSend(b);return;}const kb=by&&by!==b.id?by:null;if(kb){const kbot=BOTS.find(x=>x.id===kb);if(kbot)kbot.k++;}
 const ev={t:'kill',k:kb,kn:kb?pname(kb):null,v:b.id,vn:b.n,w:kb?(w||'gun'):'crash'};mpSend(ev);mpOnKill(ev);botSend(b);}
function botSend(b){const m={t:'s',id:b.id,sq:++b.sq,ts:Math.round(performance.now()),hl:0,n:b.n,ty:b.ty,p:[r1(b.pos.x),r1(b.pos.y),r1(b.pos.z)],q:[r4(b.q.x),r4(b.q.y),r4(b.q.z),r4(b.q.w)],
 v:[r1(b.vel.x),r1(b.vel.y),r1(b.vel.z)],th:0.85,ab:b.spd>245?1:0,gd:0,g:b.firing?1:0,dead:b.dead?1:0,hp:Math.max(0,Math.ceil(b.hp)),k:b.k,d:b.d,tk:0,iv:0,fl:0,ms:[]};
 mpSend(m);mpOnState(m);}
function botTick(dt){if(!(mp.host&&mp.connected&&mp.lcBots)){if(BOTS.length)botsClear();return;}
 while(BOTS.length<6)BOTS.push(botNew(BOTS.length));botCollTick();const T=botTargets();
 for(const b of BOTS){if((b.sendT-=dt)<=0){b.sendT=0.1;botSend(b);}
  if(b.dead){if((b.respT-=dt)<=0){botSpawn(b);botSend(b);}continue;}
  // Ziel wählen: Menschen bevorzugt, aber auch andere Bots
  let tg=T.find(t=>t.id===b.tg&&t.id!==b.id);if(!tg||(b.tgT-=dt)<=0){b.tgT=3+Math.random()*4;let sum=0;const W=T.filter(t=>t.id!==b.id).map(t=>{const w=(t.h?2.6:1)/(t.pos.distanceTo(b.pos)+1500);sum+=w;return[t,w];});
   let x=Math.random()*sum;tg=null;for(const[t,w] of W){if((x-=w)<=0){tg=t;break;}}b.tg=tg?tg.id:null;}
  const des=_bv;if(tg){const d=tg.pos.distanceTo(b.pos);des.copy(tg.pos).addScaledVector(tg.vel,clamp(d/900,0,2.5)).sub(b.pos).normalize();}
  else{if(b.wp.distanceTo(b.pos)<800||!b.wp.lengthSq())b.wp.set((Math.random()-.5)*WORLD*0.6,1500+Math.random()*1500,(Math.random()-.5)*WORLD*0.6);des.copy(b.wp).sub(b.pos).normalize();}
  // Gelände ausweichen + Spielfeldgrenze
  let need=0;for(const t of [1,3,6]){_bw.copy(b.pos).addScaledVector(b.dir,b.spd*t);need=Math.max(need,(Math.max(groundH(_bw.x,_bw.z),0)+260-_bw.y)/(200*t));}
  if(need>0){des.y=Math.max(des.y,0)+need*2;des.normalize();}if(b.pos.y>7500)des.y=Math.min(des.y,-0.2);
  if(Math.abs(b.pos.x)>WORLD*0.42||Math.abs(b.pos.z)>WORLD*0.42){des.x-=Math.sign(b.pos.x)*0.6;des.z-=Math.sign(b.pos.z)*0.6;des.normalize();}
  // Drehen mit begrenzter Rate
  _bw.copy(b.dir);const ang=b.dir.angleTo(des),mx=(need>0.3?0.9:0.72)*dt;if(ang>1e-4){_br.crossVectors(b.dir,des);if(_br.lengthSq()<1e-8)_br.set(0,1,0);_br.normalize();b.dir.applyAxisAngle(_br,Math.min(ang,mx)).normalize();}
  let vt=240;if(tg){const d=tg.pos.distanceTo(b.pos);if(d<1600&&ang<0.6)vt=clamp(tg.vel.length()+(d-500)*0.08,150,290);}b.spd=clamp(b.spd-b.dir.y*9.81*dt*0.6+(vt-b.spd)*0.5*dt,150,300);b.vel.copy(b.dir).multiplyScalar(b.spd);b.pos.addScaledVector(b.vel,dt);
  // Querneigung aus Kurvenbeschleunigung
  _br.crossVectors(b.dir,BUP);if(_br.lengthSq()<1e-6)_br.set(1,0,0);_br.normalize();_bu.crossVectors(_br,b.dir);
  const lat=_bw.sub(b.dir).multiplyScalar(-b.spd/Math.max(dt,1e-3)).dot(_br);b.bank=lerp(b.bank,clamp(Math.atan2(lat,9.81),-1.35,1.35),Math.min(1,dt*3));
  const cb=Math.cos(b.bank),sb=Math.sin(b.bank);_bw.copy(_br).multiplyScalar(cb).addScaledVector(_bu,-sb);_bu.multiplyScalar(cb).addScaledVector(_br,sb);_br.copy(_bw);
  _bm.makeBasis(_br,_bu,_bw.copy(b.dir).negate());b.q.setFromRotationMatrix(_bm);
  if(b.pos.y<Math.max(groundH(b.pos.x,b.pos.z),0)+4){const lh=b.lh&&NOW()-b.lh.t<12?b.lh:null;botDie(b,lh?lh.by:null,lh?'ground':null);continue;}
  // Bordkanone
  b.firing=false;if(tg){const d=tg.pos.distanceTo(b.pos);if(d<1100&&b.dir.angleTo(_bw.copy(tg.pos).sub(b.pos))<5*DEG){b.firing=true;if((b.fireT-=dt)<=0){b.fireT=0.12;if(Math.random()<0.55*(1-d/1250))botDmg(tg.id,b.id,6);}}}}}



/* ---------- TAGS: Admins vergeben [Tags] mit eigener Farbe; bleiben dauerhaft auf dem Gerät des Spielers ---------- */
const tagSig=(t,c)=>fnv(t+'|'+c+'|sky-tag-v1');
function tagOk(tg){if(!Array.isArray(tg)||typeof tg[0]!=='string'||typeof tg[1]!=='string')return null;const t=tg[0].replace(/[\[\]<>]/g,'').trim().slice(0,12);return t&&/^#[0-9a-f]{6}$/i.test(tg[1])?[t,tg[1]]:null;}
mp.tag=(()=>{try{const a=JSON.parse(localStorage.getItem('skyflt_tag')||'null');const t=tagOk(a);return t&&a[2]===tagSig(t[0],t[1])?t:null;}catch(_){return null;}})();
function setMyTag(tg){mp.tag=tg;try{if(tg)localStorage.setItem('skyflt_tag',JSON.stringify([tg[0],tg[1],tagSig(tg[0],tg[1])]));else localStorage.removeItem('skyflt_tag');}catch(_){}
 flash(tg?'🏷 Du hast den Tag ['+tg[0]+'] bekommen!':'🏷 Dein Tag wurde entfernt');renderLobbyIfOpen();}
const tagOf=id=>id===mp.myId?mp.tag:(mp.players.get(id)?.tag||null);
const tagH=id=>{const t=tagOf(id);return t?`<b style="color:${t[1]}">[${esc(t[0])}]</b> `:'';};
const tagS=id=>{const t=tagOf(id);return t?'['+t[0]+'] ':'';};


/* ---------- TELEPORT-FÄHIGKEIT: von Admins vergeben, dauerhaft auf dem Gerät; 2 km hinter ein gegnerisches Flugzeug, 90 s Cooldown ---------- */
const TP_CD=90,TP_SIG=()=>String(fnv('tp|sky-tag-v1'));
mp.tpOK=(()=>{try{return localStorage.getItem('skyflt_tp')===TP_SIG();}catch(_){return false;}})();mp.tpT=0;
function setTP(on){mp.tpOK=!!on;try{if(on)localStorage.setItem('skyflt_tp',TP_SIG());else localStorage.removeItem('skyflt_tp');}catch(_){}
 flash(on?'⚡ Du hast die Teleport-Fähigkeit bekommen! (Taste J / ⚡-Knopf)':'⚡ Teleport-Fähigkeit entfernt');tpBtnUpd(true);}
function tpTarget(){const A=ac,lk=mp.lock&&mp.lock.model?mp.lock:null;if(lk&&!lk.dead&&mp.players.get(lk.id)===lk&&!lk.model.isTank)return lk;
 let best=null,bd=1e18;for(const r of mp.players.values()){if(r.dead||!r.model||r.model.isTank)continue;const d=r.pos.distanceToSquared(A.pos);if(d<bd){bd=d;best=r;}}return best;}
function doTP(){const A=ac;if(!mp.tpOK||A.crashed||mp.dead||A.P.tank||menuOpen)return;if(mp.tpT>0){flash('⚡ Teleport lädt noch '+Math.ceil(mp.tpT)+' s');return;}
 const r=tpTarget();if(!r){flash('⚡ Kein gegnerisches Flugzeug in der Nähe');return;}
 const f=new THREE.Vector3(0,0,-1).applyQuaternion(r.q),P=r.pos.clone().addScaledVector(f,-2000);P.y=Math.max(P.y,Math.max(groundH(P.x,P.z),0)+200);
 mpBoom(A.pos,0.5);A.pos.copy(P);A.q.copy(r.q);A.omega.set(0,0,0);A.vel.copy(f).multiplyScalar(Math.max(A.vel.length(),r.vel.length(),140));
 A.onGround=false;A.gearDown=false;A.gearAnim=0;A.landed=false;A.thr=Math.max(A.thr,0.85);if(typeof AP!=='undefined')AP.on=false;mp.spawnProt=false;mp.inv=0;
 mp.tpT=TP_CD;flash('⚡ Teleportiert – 2 km hinter '+r.n);sBurst('highpass',1800,0.8,0.5,0.4);sBurst('lowpass',200,0.7,0.6,0.5);tpBtnUpd(true);}
let tpBtn=null,tpU=0;
function tpBtnUpd(force){if(!tpBtn){tpBtn=document.createElement('button');tpBtn.id='tpBtn';tpBtn.style.cssText='position:fixed;z-index:44;left:calc(var(--g,14px) + 60px + var(--sal,0px));bottom:calc(var(--g,14px) + var(--joy,150px) + 14px + var(--sab,0px));min-width:64px;height:44px;padding:0 10px;border-radius:12px;border:2px solid #b38cff;background:rgba(40,16,80,.6);color:#fff;font:800 13px system-ui;cursor:pointer;touch-action:manipulation;display:none';
  tpBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();doTP();});document.body.appendChild(tpBtn);}
 const show=mp.tpOK&&!ac.P.tank&&!menuOpen;tpBtn.style.display=show?'block':'none';if(!show)return;
 const t=mp.tpT>0?`⚡ ${Math.floor(mp.tpT/60)}:${String(Math.ceil(mp.tpT)%60).padStart(2,'0')}`:'⚡ TP';if(tpBtn.textContent!==t)tpBtn.textContent=t;tpBtn.style.opacity=mp.tpT>0?0.55:1;}
function tpTick(dt){mp.tpT=Math.max(0,mp.tpT-dt);if((tpU-=dt)<=0){tpU=0.25;tpBtnUpd();}}
addEventListener('keydown',e=>{if(e.code==='KeyJ'&&!e.repeat&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')&&mp.tpOK)doTP();});

/* ---------- LUFTKOLLISIONEN: zwei Flugzeuge berühren sich -> beide explodieren ---------- */
const _ka=new THREE.Vector3(),_kb=new THREE.Vector3();
function collDist(p,v,dt){_kb.copy(p).addScaledVector(v,-dt);const d=_kb.clone().sub(p),L2=d.lengthSq();if(L2<1e-6)return p.length();const t=clamp(-_kb.dot(_ka.copy(d).negate())/L2,0,1);return _ka.copy(_kb).addScaledVector(d.negate(),t).length();}
function collHit(id,name,quiet){const A=ac;if(A.crashed||mp.dead)return;mp.coll={n:name,q:quiet};mp.shot=true;mp.lastHit=null;A.crashed='Kollision mit '+name;crashFx();mpBoom(A.pos,1.4);megaBoom(A.pos,1.8);
 rumble(600,1,1);sBurst('lowpass',120,0.8,1.3,1.6);}
function collTick(dt){const A=ac;if(dt<=0||A.crashed||mp.dead||A.P.tank||mp.inv>0||A.onGround)return;const R1=mp.ownR||10;
 for(const r of mp.players.values()){if(r.dead||!r.model||r.model.isTank||r.iv)continue;_ka.subVectors(r.pos,A.pos);if(_ka.lengthSq()>250*250)continue;
  const lim=(R1+r.hitR/0.55)*0.42,rel=_kb.subVectors(r.vel,A.vel);const p=_ka.clone(),d=collDist(p,rel.clone(),dt);
  if(d<lim){const bot=String(r.id).startsWith('bot-'),quiet=!bot&&mp.myId>r.id;collHit(r.id,r.n,quiet);
   if(String(r.id).startsWith('bot-')&&mp.host){const b=BOTS.find(x=>x.id===r.id);if(b&&!b.dead)botDie(b,null,'coll');}
   else mpSend({t:'col',to:r.id,from:mp.myId,n:mp.name,q:quiet?1:0});return;}}}
function botCollTick(){for(let i=0;i<BOTS.length;i++){const a=BOTS[i];if(a.dead)continue;for(let j=i+1;j<BOTS.length;j++){const b=BOTS[j];if(b.dead)continue;
  if(a.pos.distanceToSquared(b.pos)<11*11){const ev={t:'kill',k:null,kn:null,v:a.id,vn:a.n,w:'coll',wn:b.n};mpSend(ev);mpOnKill(ev);botDie(a,null,'coll',true);botDie(b,null,'coll',true);break;}}}}

/* ---------- Hauptupdate (jedes Frame) ---------- */
function mpUpdate(dt){const now=NOW(),A=ac,frozen=(menuOpen||paused)&&!mp.lobby;
 seasonTick(dt);botTick(dt);fxTick(dt);collTick(dt);tpTick(dt);trollTick(dt);megaTick(dt);tankTick(dt);seaTick(dt);nukeTick(dt);if(!frozen)updBombs(dt);
 if(!A.P.tank&&!A.crashed&&!mp.dead){const b=cityHit(A.pos,1);if(b){A.crashed='In ein Gebäude geflogen';crashFx();}}
 {if(!mp.apBtn||!mp.apBtn.isConnected)mp.apBtn=document.querySelector('#tbtns button[data-act=autoland]');if(mp.apBtn)mp.apBtn.classList.toggle('apOn',!!AP.on);}
 if(mp.ownM!==A.model){mp.ownM=A.model;mp.ownR=modelR(A.model.group);document.body.classList.toggle('heli',!!A.P.heli);if(A.P.tank&&camMode!==0)setCam(0);if(!A.P.heli)mp.wsel='ir';mp.lock=null;updWpnBtn();}
 {const mm=A.model;if(mm.rotors){const w=A.crashed?0:(2+A.n1*36);for(const o of mm.rotors)o.rotation.y+=w*dt;mm.rotorDisc.material.opacity=A.crashed?0:clamp((A.n1-0.1)*0.45,0,0.2);}}
 if(A.crashed&&!mp.dead){if(!A.P.tank)wreck(A.pos,A.vel,mp.ownR);mp.dead=true;mp.deadT=0;mp.deaths++;mp.hp=0;mp.lock=null;if(mp.shot)A.model.group.visible=false;
  const lh=mp.lastHit&&now-mp.lastHit.t<15?mp.lastHit:null;if(lh)mp.kc={id:lh.by,ti:mp.lastTank,n:pname(lh.by)};
  const ev=mp.coll?{t:'kill',k:null,kn:null,v:mp.myId,vn:mp.name,w:'coll',wn:mp.coll.n,q:mp.coll.q?1:0}:{t:'kill',k:lh?lh.by:null,kn:lh?pname(lh.by):null,v:mp.myId,vn:mp.name,w:lh?(mp.shot?lh.w:'ground'):'crash'};mpSend(ev);mpOnKill(ev);mp.rage=rageMsg(ev.w,lh);}
 if(mp.dead){mp.deadT+=dt;if(!A.crashed)mpRevive();else if(mp.lobby&&mp.deadT>4&&!menuOpen)mpSpawnRunway();}
 if(mp.spawnProt){if(!A.onGround||mp.firing||A.crashed||(A.P.tank&&Math.abs(A.tank?.spd||0)>1.5))mp.spawnProt=false;else mp.inv=Math.max(mp.inv,0.5);}
 const alive=!A.crashed;mp.inv=Math.max(0,mp.inv-dt);mp.dmgFlash=Math.max(0,mp.dmgFlash-dt*1.5);mp.hitMark=Math.max(0,mp.hitMark-dt);
 if(mp.center&&(mp.center.t-=dt)<=0)mp.center=null;
 if(mp.ir<IR.ammo&&(mp.irT+=dt)>IR.reload){mp.irT=0;mp.ir++;}
 if(mp.rkt<38&&mp.salvo<=0&&(mp.rktT+=dt)>4){mp.rktT=0;mp.rkt++;}if(mp.atgm<8&&(mp.atgmT+=dt)>20){mp.atgmT=0;mp.atgm++;}
 if(mp.salvo>0){if(A.crashed||mp.rkt<1)mp.salvo=0;else if((mp.salvoT-=dt)<=0){mp.salvoT=0.09;mp.salvo--;mp.rkt--;mp.rktT=0;launchFrom('rkt',null,90);sBurst('highpass',900,0.8,0.35,0.5);rumble(60,0.3,0.2);}}
 const fwd=_me.set(0,0,-1).applyQuaternion(A.q);
 const fh=alive&&!menuOpen&&held('fire')>0.3;if(A.P.b2){if(fh&&!mp.fPrev)dropBomb();mp.fPrev=fh;}const trig=fh&&!A.P.b2&&mp.gun>=1;mp.firing=trig;
 if(trig){mp.gunCD-=dt;while(mp.gunCD<=0&&mp.gun>=1){mp.gunCD+=1/GUN.rate;mp.gun--;_mb.set(0,-1,0).applyQuaternion(A.q);if(A.P.tank)A.model.muzzle.getWorldPosition(_ma);else _ma.copy(A.pos).addScaledVector(fwd,mp.ownR*0.55).addScaledVector(_mb,0.6);
  shoot(_ma,gunAssist(_ma,fwd),A.vel,true);if(mp.gun%4<1)rumble(50,0,0.35);if(mp.gun%2<1)sBurst('bandpass',160,1.2,0.35,0.07);}}
 else{mp.gunCD=Math.max(0,mp.gunCD);if(mp.gun<GUN.ammo)mp.gun=Math.min(GUN.ammo,mp.gun+dt*12);}
 // IR-Suchkopf mit Growl-Ton
 const ws=A.P.heli?mp.wsel:'ir';
 if(alive&&!A.P.b2&&selAmmo()>=1&&ws!=='rkt'){const c=seek(mp.lock,A.P.heli?(ws==='ir'?'P':'T'):undefined);if(c&&c===mp.lock)mp.lockT+=dt;else{mp.lock=c;mp.lockT=0;}
  if(mp.saidLock&&mp.saidLock!==c)mp.saidLock=null;   // Lock verloren/Ziel gewechselt
  if(c&&c[0]!=='T'&&!menuOpen&&mp.lockT>=IR.lockT&&!mp.saidLock){mp.saidLock=c;sayLock();}/* nur Flugzeuge, keine Töne bei Panzern */}
 else{mp.lock=null;mp.lockT=0;}
 // Geschosse (im pausierten Einzelspieler eingefroren)
 if(!frozen)for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.life-=dt;_ma.copy(b.p);b.v.y-=9.81*dt;b.p.addScaledVector(b.v,dt);let gone=b.life<=0;const under=b.p.y<groundH(b.p.x,b.p.z)-3;
  if(!gone&&b.mine)for(const r of mp.players.values()){if(r.dead||!r.model||r.iv)continue;if(segDist(_ma,b.p,r.pos)<r.hitR){gone=true;mpSpark(b.p);addHit(r.id,GUN.dmg,'gun',r.pos);break;}}
  if(!gone&&b.mine)for(let k=0;k<TANKS.length;k++){const t=TANKS[k];if(t.dead||Math.abs(b.p.x-t.x)>70||Math.abs(b.p.z-t.z)>70)continue;if(segDist(_ma,b.p,t.c)<3.6*TANK_S){gone=true;mpSpark(b.p);tankHit(k,GUN.dmg,t.c);break;}}
  if(!gone&&b.foe&&!mp.dead&&!ac.crashed&&segDist(_ma,b.p,ac.pos)<mp.ownR*0.45){gone=true;mpSpark(b.p);mp.lastTank=b.ti;mpOnHit({from:'tank',dmg:4,w:'flak'});}
  if(gone||under)bullets.splice(i,1);}
 let k=0;for(const b of bullets){_mb.copy(b.v).normalize();trPos[k++]=b.p.x;trPos[k++]=b.p.y;trPos[k++]=b.p.z;trPos[k++]=b.p.x-_mb.x*30;trPos[k++]=b.p.y-_mb.y*30;trPos[k++]=b.p.z-_mb.z*30;}
 if(bullets.length||mp.trN){trGeo.setDrawRange(0,bullets.length*2);trGeo.attributes.position.needsUpdate=true;}mp.trN=bullets.length;
 if((mp.hitT+=dt)>0.12){mp.hitT=0;if(mp.hits.size)flushHits();}
 if(!frozen){updMyMissiles(dt,now);updTanks(dt,now);}
 mp.warn=null;for(const r of [...mp.players.values()]){if(now-r.rt>(r.id===mp.hostPid?5:8)){mpRemove(r.id);renderLobbyIfOpen();if(r.id===mp.hostPid&&!mp.host&&mp.connected){mpHostLost();break;}continue;}if(r.model)updRemote(r,dt,now);}
 if(!frozen)updAdmMs(dt);trollWarn();
 mp.gpws=alive&&!frozen?terrainAhead():0;
 if(mp.gpws&&!menuOpen){if((mp.gpwsB=(mp.gpwsB||0)-dt)<=0){mp.gpwsB=mp.gpws<4?0.18:0.35;sBeep(900,0.07,0.14);}if(NOW()-gpwsSay>3){gpwsSay=NOW();speak('Terrain! Pull up!',1.25);}}
 {const f=$('thrFill'),rf=$('thrRevFill');if(f&&rf){f.style.height=(Math.max(A.thr,0)*85)+'%';rf.style.height=(Math.max(-A.thr,0)*150)+'%';}}
 if(A.thr<-0.02&&alive){if(!mp.revMsg){mp.revMsg=1;flash(A.onGround?'UMKEHRSCHUB':'Umkehrschub geht nur am Boden');}}else mp.revMsg=0;
 if(mp.warn!==null&&alive&&(mp.warnT-=dt)<=0){mp.warnT=mp.warn<1200?0.12:0.3;sBeep(1250,0.06,0.12);}
 if((mp.smokeT+=dt)>0.05){mp.smokeT=0;const sm=(p,hp)=>emit(p.x,p.y,p.z,0,1,0,3,3,6,hp<30?0.6:0.3,0.12,0.12,0.12);
  if(alive&&mp.hp<55)sm(A.pos,mp.hp);for(const r of mp.players.values())if(!r.dead&&r.model&&r.hp<55)sm(r.pos,r.hp);}
 for(let i=mp.nums.length-1;i>=0;i--)if((mp.nums[i].t-=dt)<=0)mp.nums.splice(i,1);
 if((mp.sendT+=dt)>=1/20&&mp.connected){mp.sendT=0;mpSend(mpState());}
 if((mp.pingT+=dt)>2&&mp.connected){mp.pingT=0;const ts=performance.now();for(const c of mp.conns.values())mpRaw(c,{t:'pi',ts});mp.ping=mpPing();}
 for(const [id,t] of mp.gone)if(NOW()-t>6)mp.gone.delete(id);
 updFeedDom(now);}

/* ---------- Kill-Feed (Fortnite-Stil) ---------- */
let feedSeq=0;
function mpFeed(html,cls=''){mp.feed.push({html,cls,t:NOW(),id:++feedSeq,el:null});while(mp.feed.length>6)mp.feed.shift().el?.remove();}
function updFeedDom(now){const box=$('mpFeed'),chip=$('mpChip');
 const t=mp.lobby?`👥 ${mp.players.size+1}   🎯 ${mp.kills} ${mp.kills===1?'Kill':'Kills'}   ☠ ${mp.deaths}${mp.tankKills?'   💥 '+mp.tankKills+' Panzer':''}${mp.ping!=null?'   📶 '+Math.round(mp.ping)+' ms':''}`:'';if(chip.textContent!==t){chip.textContent=t;chip.style.display=t?'':'none';}
 const ck=mp.kills+'|'+mp.deaths+'|'+mp.tankKills;if(mp.chipKey!==undefined&&ck!==mp.chipKey){chip.classList.remove('bump');void chip.offsetWidth;chip.classList.add('bump');}mp.chipKey=ck;
 for(let i=mp.feed.length-1;i>=0;i--)if(now-mp.feed[i].t>8){mp.feed[i].el?.remove();mp.feed.splice(i,1);}
 for(const f of mp.feed)if(!f.el){f.el=document.createElement('div');f.el.className='f '+f.cls;f.el.innerHTML=f.html;box.appendChild(f.el);}}

/* ---------- Kampf-HUD ---------- */
function scr(v){_mp.copy(v).project(camera);if(_mp.z>1)return null;return[(_mp.x+1)/2*innerWidth,(1-_mp.y)/2*innerHeight];}
function txtO(c,t,x,y){c.strokeText(t,x,y);c.fillText(t,x,y);}
function mpDrawHUD(){const c=hctx,W=innerWidth,H=innerHeight,A=ac,alive=!A.crashed,sc0=clamp(Math.min(W,H)/820,0.5,1.25),topP=H<540||$('touch').style.display==='block',py=topP?Math.round(84*sc0)+16:H-58,wy=topP?Math.max(H*0.2,py+36):H*0.2,cy=Math.max(H*0.3,wy+44);c.save();c.shadowBlur=0;c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
 if(mp.dmgFlash>0){const g=c.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3,W/2,H/2,Math.max(W,H)*0.7);g.addColorStop(0,'rgba(255,0,0,0)');g.addColorStop(1,`rgba(255,20,20,${0.55*mp.dmgFlash})`);c.fillStyle=g;c.fillRect(0,0,W,H);}
 {const s=clamp(Math.min(W,H)/820,0.5,1.25),y=30*s+15*s,blink=(performance.now()%300)<170;   // Kompass-Punkte (Fortnite-Stil)
  const dot=(p,col,big,always)=>{const dx=p.x-A.pos.x,dz=p.z-A.pos.z,d=Math.hypot(dx,dz,p.y-A.pos.y);let df=((Math.atan2(dx,-dz)/DEG-fd.hdg)%360+540)%360-180;
   const edge=Math.abs(df)>30;if(edge&&!always)return;df=clamp(df,-30,30);c.globalAlpha=edge?0.55:1;c.fillStyle=col;c.strokeStyle='#000b';c.lineWidth=1.2;
   c.beginPath();c.arc(W/2+df*6*s,y,(big?6.5:4.5)*s*clamp(2500/Math.max(d,1),0.75,1.5),0,7);c.fill();c.stroke();};
  for(const r of mp.players.values()){if(r.dead||!r.model)continue;dot(r.pos,r.gun?(blink?'#ff1a0a':'#ff7a50'):'#ff3b30',r.gun&&blink,!!r.gun);
   for(const x of r.ms.values())if(x.tg===mp.myId)dot(x.p,blink?'#ffb000':'#ff6a00',true,true);}
  c.globalAlpha=1;}
 const fwd=_me.set(0,0,-1).applyQuaternion(A.q);let near=null,nd=1e9;
 for(const r of mp.players.values()){if(r.dead||!r.model)continue;const d=r.pos.distanceTo(A.pos);
  if(d<nd&&_ma.copy(r.pos).sub(A.pos).dot(fwd)>0){nd=d;near=r;}
  const s=scr(r.pos);if(!s)continue;const lk=mp.lock===r.id,full=lk&&mp.lockT>=IR.lockT,sz=clamp(r.hitR*900/Math.max(d,1),9,60);
  c.strokeStyle=r.iv?'#7fd8ff':'#ff4a3d';c.lineWidth=2;c.beginPath();c.moveTo(s[0],s[1]-sz);c.lineTo(s[0]+sz,s[1]);c.lineTo(s[0],s[1]+sz);c.lineTo(s[0]-sz,s[1]);c.closePath();c.stroke();
  c.font='600 12px system-ui';c.fillStyle='#ffd4cf';c.strokeStyle='#000a';c.lineWidth=3;txtO(c,`${r.n}  ${d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km'}`,s[0],s[1]-sz-10);if(r.tag){c.font='800 12px system-ui';c.fillStyle=r.tag[1];txtO(c,'['+r.tag[0]+']',s[0],s[1]-sz-25);}
  c.fillStyle='#000a';c.fillRect(s[0]-22,s[1]+sz+6,44,4);c.fillStyle=r.hp>50?'#5f5':r.hp>25?'#fc3':'#f43';c.fillRect(s[0]-22,s[1]+sz+6,44*clamp(r.hp/100,0,1),4);
  if(lk){c.strokeStyle=full?'#ff2a2a':'#ffd23a';c.lineWidth=full?3:2;c.beginPath();c.arc(s[0],s[1],sz+8,0,7);c.stroke();
   if(full){c.font='800 13px system-ui';c.fillStyle='#ff2a2a';c.strokeStyle='#000a';c.lineWidth=3;txtO(c,'LOCK',s[0],s[1]+sz+22);}}}
 if(alive){const gd=near&&nd<1800?nd:700,gs=scr(_ma.copy(A.pos).addScaledVector(fwd,gd));
  if(gs){c.strokeStyle='#bfffd6';c.lineWidth=1.5;c.beginPath();c.moveTo(gs[0]-9,gs[1]);c.lineTo(gs[0]-3,gs[1]);c.moveTo(gs[0]+3,gs[1]);c.lineTo(gs[0]+9,gs[1]);c.moveTo(gs[0],gs[1]-9);c.lineTo(gs[0],gs[1]-3);c.moveTo(gs[0],gs[1]+3);c.lineTo(gs[0],gs[1]+9);c.stroke();
   if(mp.hitMark>0){c.strokeStyle=`rgba(255,255,255,${mp.hitMark*4})`;c.lineWidth=2.5;c.beginPath();for(const[a,b]of[[1,1],[1,-1],[-1,1],[-1,-1]]){c.moveTo(gs[0]+a*7,gs[1]+b*7);c.lineTo(gs[0]+a*15,gs[1]+b*15);}c.stroke();}
   if(selAmmo()>=1&&!(A.P.heli&&mp.wsel==='rkt')){_mb.set(0,1,0).applyQuaternion(A.q);const e=scr(_mc.copy(A.pos).addScaledVector(fwd,1000).addScaledVector(_mb,1000*Math.tan(IR.cone))),s0=scr(_md.copy(A.pos).addScaledVector(fwd,1000));
    if(e&&s0){const L=mp.lock&&mp.lockT>=IR.lockT;if(!L)c.setLineDash([6,6]);c.strokeStyle=L?'#ff2a2a':mp.lock?'#ffd23a':'#ffffff66';c.lineWidth=L?3:1.5;c.beginPath();c.arc(s0[0],s0[1],Math.max(30,Math.hypot(e[0]-s0[0],e[1]-s0[1])),0,7);c.stroke();c.setLineDash([]);
    if(L){c.font='800 14px system-ui';c.fillStyle='#ff2a2a';c.strokeStyle='#000a';c.lineWidth=3;txtO(c,'LOCK – FEUER ('+keyName(cfg.kb.missile)+' / B)',s0[0],s0[1]+Math.max(30,Math.hypot(e[0]-s0[0],e[1]-s0[1]))+16);}}}}
  if(A.P.heli&&mp.wsel==='rkt'&&mp.rkt>=1){const ps=scr(_mc.copy(A.pos).addScaledVector(fwd,600).add(_md.set(0,-4,0)));if(ps){c.strokeStyle='#ffb14a';c.lineWidth=2;c.beginPath();c.arc(ps[0],ps[1],10,0,7);c.moveTo(ps[0]-18,ps[1]);c.lineTo(ps[0]-11,ps[1]);c.moveTo(ps[0]+11,ps[1]);c.lineTo(ps[0]+18,ps[1]);c.stroke();}}
  if(near&&nd<1800){const t=nd/GUN.v;_ma.copy(near.pos).addScaledVector(near.vel,t).addScaledVector(A.vel,-t);_ma.y+=0.5*9.81*t*t;const s=scr(_ma);
   if(s){c.strokeStyle='#ffe066';c.lineWidth=1.5;c.beginPath();c.arc(s[0],s[1],8,0,7);c.stroke();c.fillStyle='#ffe066';c.beginPath();c.arc(s[0],s[1],2,0,7);c.fill();}}}
 c.strokeStyle='#000c';c.lineWidth=4;
 for(const n of mp.nums){const s=scr(n.p);if(!s)continue;c.globalAlpha=clamp(n.t*2,0,1);c.font=`900 ${n.w!=='gun'?26:20}px system-ui`;c.fillStyle=n.w!=='gun'?'#ffb14a':'#fff';txtO(c,n.d,s[0]+24,s[1]-24-(0.95-n.t)*40);}
 c.globalAlpha=1;
 if(mp.warn!==null&&alive&&(performance.now()%400)<260){c.font='900 24px system-ui';c.fillStyle='#ff3b30';c.strokeStyle='#000c';c.lineWidth=5;
  txtO(c,`⚠ RAKETE IM ANFLUG  ${(mp.warn/1000).toFixed(1)} km  –  FLARES (${keyName(cfg.kb.flares)})!`,W/2,wy);}
 if(mp.gpws&&alive&&(performance.now()%500)<330){const ty=Math.max(wy+34,H*0.27);c.font='900 26px system-ui';c.fillStyle='#ff2a1a';c.strokeStyle='#000d';c.lineWidth=5;
  txtO(c,'⚠ TERRAIN – PULL UP!  ('+Math.ceil(mp.gpws)+' s)',W/2,ty);c.strokeStyle='rgba(255,40,30,.75)';c.lineWidth=8;c.strokeRect(4,4,W-8,H-8);}
 if(mp.center){c.globalAlpha=clamp(mp.center.t/0.4,0,1);c.font='900 42px system-ui';c.lineWidth=7;c.strokeStyle='#000b';c.fillStyle=mp.center.bad?'#ff5a4a':'#ffd84a';txtO(c,mp.center.big,W/2,cy);
  c.font='700 18px system-ui';c.lineWidth=4;c.fillStyle='#fff';txtO(c,mp.center.small,W/2,cy+36);c.globalAlpha=1;}
 for(let ti=0;ti<TANKS.length;ti++){const t=TANKS[ti];if(t.dead)continue;const d=t.c.distanceTo(A.pos);if(d>4000)continue;const s=scr(t.c);if(!s)continue;const z=clamp(4000/d,5,12);
  if(mp.lock==='T'+ti){const full=mp.lockT>=IR.lockT;c.strokeStyle=full?'#ff2a2a':'#ffd23a';c.lineWidth=full?3:2;c.beginPath();c.arc(s[0],s[1],z+9,0,7);c.stroke();if(full){c.font='800 12px system-ui';c.fillStyle='#ff2a2a';c.strokeStyle='#000a';c.lineWidth=3;txtO(c,'LOCK',s[0],s[1]+z+20);}}
  c.strokeStyle='#ff8a3d';c.lineWidth=1.5;c.strokeRect(s[0]-z,s[1]-z,2*z,2*z);if(d<2500){c.font='600 10px system-ui';c.fillStyle='#ffc9a8';c.strokeStyle='#000a';c.lineWidth=3;txtO(c,`PANZER ${(d/1000).toFixed(1)} km`,s[0],s[1]-z-9);}}
 if(mp.dead&&mp.kc){c.font='800 17px system-ui';c.fillStyle='#ff5a4a';c.strokeStyle='#000b';c.lineWidth=4;txtO(c,'🎥 KILLCAM · '+mp.kc.n+(mp.lobby?'':'   ·   '+keyName(cfg.kb.restart)+': Neustart'),W/2,wy);}
 if(mp.dead&&mp.rage){c.font='italic 700 19px system-ui';c.fillStyle='#ffd23f';c.strokeStyle='#000c';c.lineWidth=5;txtO(c,mp.rage,W/2,H*0.5+128);}
 if(mp.dead&&mp.lobby){c.font='700 17px system-ui';c.fillStyle='#fff';c.strokeStyle='#000b';c.lineWidth=4;txtO(c,`Respawn in ${Math.max(1,Math.ceil(4-mp.deadT))} …`,W/2,H*0.5+90);}
 if(mp.inv>0&&alive){c.font='700 14px system-ui';c.fillStyle='#7fd8ff';c.strokeStyle='#000b';c.lineWidth=3;txtO(c,'🛡 Spawnschutz',W/2,H*0.5+70);}
 b2Ccip(c);b2SafeHUD(c,W,py);
 {const y=py,sl=k=>mp.wsel===k?'►':'',t=A.P.heli?`KANONE ${Math.floor(mp.gun)}  ${sl('ir')}STINGER ${'▮'.repeat(mp.ir)}${'▯'.repeat(IR.ammo-mp.ir)}  ${sl('rkt')}RAKETEN ${mp.rkt}  ${sl('atgm')}HELLFIRE ${mp.atgm}  FLARES ${mp.flares}`:A.P.b2?`☢ B61 ${'▮'.repeat(mp.nk)}${'▯'.repeat(NUKE_N-mp.nk)}   FLARES ${mp.flares}`:`KANONE ${Math.floor(mp.gun)}   ${WPN_NAME()} ${'▮'.repeat(mp.ir)}${'▯'.repeat(IR.ammo-mp.ir)}${A.P.tank?'':'   FLARES '+mp.flares}`;
  c.font=`700 ${W<760?11:13}px ui-monospace,Menlo,Consolas,monospace`;const w=c.measureText(t).width+26;c.fillStyle='rgba(0,0,0,.5)';c.fillRect(W/2-w/2,y-14,w,28);
  c.fillStyle='#8fffb8';c.fillText(t,W/2,y);
  /* Lebensanzeige: großer Balken direkt unter der Waffenleiste */
  const f=clamp(mp.hp/100,0,1),now=NOW(),bw=Math.max(w,W<760?220:280),bh=W<760?14:18,x0=W/2-bw/2,y0=y+18,rr=bh/2;
  if(mp.hpG==null||f>mp.hpG)mp.hpG=f;else mp.hpG=Math.max(f,mp.hpG-(now-(mp.hpGt||now))*0.35);mp.hpGt=now;
  const rnd=(x,yy,ww,hh)=>{c.beginPath();if(c.roundRect)c.roundRect(x,yy,ww,hh,rr);else c.rect(x,yy,ww,hh);};
  const low=f<0.3&&alive,pulse=low?0.5+0.5*Math.sin(now*9):0;
  c.save();if(low){c.shadowColor='rgba(255,40,30,'+(0.6+0.4*pulse)+')';c.shadowBlur=14+10*pulse;}
  rnd(x0-2,y0-2,bw+4,bh+4);c.fillStyle='rgba(0,0,0,.7)';c.fill();c.restore();
  c.save();rnd(x0,y0,bw,bh);c.clip();c.fillStyle='rgba(255,255,255,.08)';c.fillRect(x0,y0,bw,bh);
  c.fillStyle='rgba(255,235,200,.75)';c.fillRect(x0,y0,bw*mp.hpG,bh);
  const col=f>0.6?['#3df57a','#17b84f']:f>0.3?['#ffd23a','#e59a00']:['#ff5b4a','#c41d12'],g=c.createLinearGradient(0,y0,0,y0+bh);g.addColorStop(0,col[0]);g.addColorStop(1,col[1]);
  c.fillStyle=g;c.fillRect(x0,y0,bw*f,bh);c.fillStyle='rgba(255,255,255,.28)';c.fillRect(x0,y0,bw*f,bh*0.35);
  c.fillStyle='rgba(0,0,0,.35)';for(let i=1;i<10;i++)c.fillRect(x0+bw*i/10-0.5,y0,1,bh);c.restore();
  c.save();rnd(x0,y0,bw,bh);c.lineWidth=1.5;c.strokeStyle=low?`rgba(255,120,110,${0.6+0.4*pulse})`:'rgba(255,255,255,.55)';c.stroke();c.restore();
  c.font=`900 ${W<760?11:13}px system-ui`;c.textAlign='left';c.fillStyle='#fff';c.strokeStyle='#000c';c.lineWidth=3;txtO(c,`❤ ${Math.ceil(Math.max(mp.hp,0))}`,x0+8,y0+bh/2+1);c.textAlign='center';}
 if(held('score')>0.3&&mp.lobby){const L=[{id:mp.myId,n:mp.name,k:mp.kills,d:mp.deaths,me:1,ty:acType,tk:mp.tankKills},...[...mp.players.values()].map(r=>({id:r.id,n:r.n,k:r.k||0,d:r.d||0,tk:r.tk||0,ty:r.ty,pg:Math.round(r.lat*2000)}))].sort((a,b)=>b.k-a.k||a.d-b.d);
  const w=Math.min(480,W-32),h=62+L.length*26,x=(W-w)/2,y=H*0.16;c.fillStyle='rgba(5,12,24,.88)';c.fillRect(x,y,w,h);c.strokeStyle='#ffffff30';c.lineWidth=1;c.strokeRect(x,y,w,h);
  c.textAlign='left';c.font='800 15px system-ui';c.fillStyle='#8fe8b0';c.fillText('RANGLISTE · '+lobbyName(),x+14,y+20);
  c.font='600 12px system-ui';c.fillStyle='#9ab';c.fillText('Pilot',x+14,y+44);c.textAlign='right';c.fillText('Panzer',x+w-124,y+44);c.fillText('Kills',x+w-70,y+44);c.fillText('Tode',x+w-16,y+44);
  L.forEach((p,i)=>{const yy=y+68+i*26;c.textAlign='left';c.font=(p.me?'800 ':'500 ')+'14px system-ui';c.fillStyle=p.me?'#ffd84a':'#fff';{const tg=tagOf(p.id),pre=`${i+1}. `;c.fillText(pre,x+14,yy);let xx=x+14+c.measureText(pre).width;if(tg){c.fillStyle=tg[1];const t='['+tg[0]+'] ';c.fillText(t,xx,yy);xx+=c.measureText(t).width;c.fillStyle=p.me?'#ffd84a':'#fff';}c.fillText(p.n,xx,yy);}
   c.fillStyle='#9ab';c.font='12px system-ui';c.fillText((TYPES[p.ty]?.name||'').split(' (')[0]+(p.pg!=null?'  ·  '+p.pg+' ms':''),x+w*0.4,yy);c.textAlign='right';c.font='700 14px system-ui';c.fillStyle='#fff';c.fillText(p.tk||0,x+w-124,yy);c.fillText(p.k,x+w-70,yy);c.fillText(p.d,x+w-16,yy);});}
 c.restore();}

/* ---------- Lobby-Bildschirm ---------- */
function openLobby(){mp.lobbyOpen=true;menuOpen=true;$('menu').style.display='none';$('lobby').style.display='block';kbDown.clear();renderLobby();}
function closeLobby(){mp.lobbyOpen=false;mp.started=true;menuOpen=false;$('lobby').style.display='none';kbDown.clear();if(mp.lobby&&!mp.lobbySpawned){mp.lobbySpawned=true;mpSpawnRunway();}if(!mp.cineDone){mp.cineDone=true;cineStart();}}
function renderLobbyIfOpen(){if(mp.lobbyOpen&&!(document.activeElement&&document.activeElement.tagName==='INPUT'))renderLobby();}
function renderLobby(){const el=$('lobbyWrap'),inL=!!mp.lobby,code=inL&&mp.lobby.startsWith('priv-')?mp.lobby.slice(5):null;
 const pl=[{id:mp.myId,n:mp.name+' (du)',k:mp.kills,d:mp.deaths,ty:acType},...[...mp.players.values()].map(r=>({id:r.id,n:r.n,k:r.k||0,d:r.d||0,ty:r.ty})),...[...mp.known].filter(([id])=>id!==mp.myId&&!mp.players.has(id)).map(([id,v])=>({n:(v.n||'?')+' ⏳ verbindet …',k:0,d:0,ty:''}))];
 el.innerHTML=`<div class="top"><h1>✈ Skyline Flight · Dogfight ${thBan()}</h1>${mp.started&&!inL?`<button class="b on big" data-lb="close">${TYPES[acType]?.tank?'Weiterfahren':'Weiterfliegen'} ▶</button>`:''}</div>
 <div class="card"><div class="row"><label>Pilotenname <input type="text" id="lbName" maxlength="16" value="${esc(mp.name)}"></label>
 <label>Flugzeug <select id="lbAc">${ORDER.map(k=>`<option value="${k}" ${k===acType?'selected':''}>${esc(TYPES[k].name)}</option>`).join('')}</select></label></div></div>
 ${inL?`<div class="card"><h2 style="margin-top:0">${esc(lobbyName())}</h2>
  ${code?`<div class="row"><span>Lobby-Code:</span><span class="code">${code}</span><button class="b" data-lb="copy">Kopieren</button></div><p class="note">Freunde geben diesen Code unter „Private Lobby beitreten“ ein.</p>`:''}
  <p class="note">${mp.connected?(mp.host?'✅ Du bist Host dieser Lobby.':'✅ Mit dem Host verbunden.'):'⏳ Verbinde … (noch nicht verbunden)'} · ${pl.length}/${MAXP} Spieler${mp.connected?' · Direktverbindungen: '+[...mp.conns.values()].filter(c=>c.open).length+(mp.ping!=null?' · Ping '+Math.round(mp.ping)+' ms':''):''}</p>
  ${seasonUI()}
  ${pl.map(p=>`<div class="pl"><span>${p.id?tagH(p.id):''}${esc(p.n)}</span><span>${esc((TYPES[p.ty]?.name||'').split(' (')[0])} · 🎯 ${p.k} · ☠ ${p.d}</span></div>`).join('')}
  <div class="row" style="margin-top:12px"><button class="b on big" data-lb="close">${TYPES[acType]?.tank?'Losfahren':'Losfliegen'} ▶</button><button class="b" data-lb="leave">Lobby verlassen</button></div></div>`
 :`<div class="card"><h2 style="margin-top:0">Öffentliche Lobbys</h2><p class="note">Jeder kann beitreten – rein und losballern.</p>
  <div class="row">${[1,2,3].map(n=>`<button class="b big ${n===1?'on':''}" data-lb="pub" data-n="${n}">${['','☀','🍂','🤖'][n]} Lobby ${n}</button>`).join('')}</div>
  <p class="note"><b>Lobby 1:</b> normal, immer Sommer · <b>Lobby 2:</b> der Erste in der Lobby wählt die Jahreszeit (${SN[mp.pickSe]} vorgewählt) · <b>Lobby 3:</b> Krieg gegen Bots</p></div>
 <div class="card"><h2 style="margin-top:0">Private Lobby</h2><div class="row"><span>Jahreszeit:</span>${SEASONS.map(s=>`<button class="b ${mp.pickSe===s?'on':''}" data-lb="pse" data-s="${s}">${SN[s]}</button>`).join('')}</div>
  <div class="row" style="margin-top:6px"><span>Bots:</span><button class="b ${mp.pickBo?'on':''}" data-lb="pbo">${mp.pickBo?'🤖 Mit Bots':'Ohne Bots'}</button></div>
  <div class="row" style="margin-top:10px"><button class="b big" data-lb="create">🔒 Private Lobby erstellen</button></div>
  <div class="row" style="margin-top:10px"><input type="text" id="lbCode" maxlength="5" placeholder="CODE" style="text-transform:uppercase;width:120px"><button class="b big" data-lb="join">Beitreten</button></div></div>
 <div class="card"><div class="row"><button class="b" data-lb="solo">Einzelspieler / Freiflug</button></div></div>`}
 <div id="lbStatus">${esc(mp.status)}</div>
 <div class="card"><h2 style="margin-top:0">Kampf-Steuerung</h2><p class="note"><b>${keyName(cfg.kb.fire)}</b> Bordkanone (halten) · <b>${keyName(cfg.kb.missile)}</b> IR-Rakete „Fox 2“ – Gegner in den gestrichelten Suchkreis bringen, bis der Ton hoch wird und LOCK erscheint · <b>${keyName(cfg.kb.flares)}</b> Flares gegen anfliegende Raketen · <b>${keyName(cfg.kb.score)}</b> Rangliste · <b>${keyName(cfg.kb.lobby)}</b> Lobby. Wie in War Thunder sind IR-Raketen von hinten (heißes Triebwerk, Nachbrenner) viel wirksamer als frontal. Der gelbe Kreis zeigt den Vorhaltepunkt für die Kanone.</p><p class="note"><b>🎮 Controller:</b> Linker Stick Nicken/Rollen · Rechter Stick Gieren · RT/LT Schub · <b>A</b> Kanone · <b>B</b> Rakete · <b>X</b> Flares · <b>Y</b> Kamera · <b>Back/Share</b> Rangliste · <b>Start</b> Menü · LB/RB Seitenruder · L3 Bremse · Steuerkreuz ↑ Klappen ↓ Fahrwerk ← Flugzeug → Landehilfe. Im Menü: Steuerkreuz wählen, A bestätigen, B zurück.${padName?' — Erkannt: '+esc(padName):''}</p></div>`;}
$('lobby').addEventListener('click',e=>{const b=e.target.closest('[data-lb]');if(!b)return;const a=b.dataset.lb;
 if(a==='pub'||a==='create'||a==='join')mp.lobbySpawned=false;
 switch(a){
  case 'close':closeLobby();break;
  case 'se':if(mp.host){setSeason(b.dataset.s);mp.pickSe=mp.season;try{localStorage.setItem('skyflt_se',mp.pickSe);}catch(_){}}renderLobby();break;
  case 'bo':if(mp.host){mp.lcBots=!mp.lcBots;mp.pickBo=mp.lcBots;}renderLobby();break;
  case 'pse':mp.pickSe=b.dataset.s;try{localStorage.setItem('skyflt_se',mp.pickSe);}catch(_){}renderLobby();break;
  case 'pbo':mp.pickBo=!mp.pickBo;renderLobby();break;
  case 'solo':mpLeave();setSeason('summer');mp.lcBots=false;mpStatus('');closeLobby();break;
  case 'pub':mpJoin('pub-'+b.dataset.n,'claim');break;
  case 'create':mpJoin('priv-'+mkCode(),'host');break;
  case 'join':{const c=($('lbCode').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length<4){mpStatus('Bitte den Lobby-Code eingeben.');break;}mpJoin('priv-'+c,'client');break;}
  case 'leave':mpLeave();setSeason('summer');mp.lcBots=false;mpStatus('Lobby verlassen.');renderLobby();break;
  case 'copy':try{navigator.clipboard.writeText(mp.lobby.slice(5));mpStatus('Code kopiert.');}catch(_){}break;}});
$('lobby').addEventListener('input',e=>{if(e.target.id==='lbName'){const v=e.target.value.trim().slice(0,16);if(v){mp.name=v;try{localStorage.setItem('skyflt_name',v);}catch(_){}}}});
$('lobby').addEventListener('change',e=>{if(e.target.id==='lbAc'){setAircraft(e.target.value);renderLobby();}});
/* ---------- Bodenziele: feststehende Flak-Panzer (fester Zufalls-Seed -> bei allen Spielern an denselben Stellen) ---------- */
const TANK_S=1.7,TANK_HP=60,TANKS=[];
{let seed=1337;const rnd=()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 for(const r of RUNWAYS)for(let n=0,k=0;n<6&&k<300;k++){const lx=(rnd()<.5?-1:1)*(500+rnd()*2200),lz=(rnd()*2-1)*(r.hl+2500),[x,z]=r.W(lx,lz),h=heightAt(x,z);
  if(h<8||h>700||Math.abs(heightAt(x+8,z)-h)+Math.abs(heightAt(x,z+8)-h)>2.5||TANKS.some(t=>Math.hypot(t.x-x,t.z-z)<250)||(Math.abs(x-CITY.cx)<CITY.hs+150&&Math.abs(z-CITY.cz)<CITY.hs+150))continue;
  const gh=gridH(x,z);TANKS.push({x,z,y:gh-0.2,yaw:rnd()*6.28,ty:rnd()*6.28,el:0,c:new THREE.Vector3(x,gh+1.6*TANK_S,z),hp:TANK_HP,dead:0,cd:rnd()*3,burst:0,bt:0,smk:0});n++;}}
const tkHullG=new THREE.BoxGeometry(3.4,1.2,6.4);tkHullG.translate(0,0.8,0);
const tkTurG=new THREE.BoxGeometry(2.3,0.9,2.8);tkTurG.translate(0,0,0.2);
const tkBarG=cylZ(0.14,0.14,4,8);tkBarG.translate(0,0,-3.2);
const tkMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.85,metalness:0.2});
const tkHull=new THREE.InstancedMesh(tkHullG,tkMat,TANKS.length),tkTur=new THREE.InstancedMesh(tkTurG,tkMat,TANKS.length),tkBar=new THREE.InstancedMesh(tkBarG,M(0x2a2d22,0.7,0.4),TANKS.length);
const OLIVE=new THREE.Color(0x4f5a2a),OLIVE2=new THREE.Color(0x5d6a32),WRECK=new THREE.Color(0x1c1c1a);
function tkPose(i){const t=TANKS[i];dm.rotation.set(0,t.yaw,0);dm.position.set(t.x,t.y,t.z);dm.scale.setScalar(TANK_S);dm.updateMatrix();tkHull.setMatrixAt(i,dm.matrix);
 dm.position.set(t.x,t.y+1.85*TANK_S,t.z);dm.rotation.set(0,t.ty,0);dm.scale.setScalar(t.dead?0.0001:TANK_S);dm.updateMatrix();tkTur.setMatrixAt(i,dm.matrix);
 dm.rotation.set(t.el,t.ty,0,'YXZ');dm.updateMatrix();tkBar.setMatrixAt(i,dm.matrix);dm.rotation.set(0,0,0,'XYZ');}
TANKS.forEach((t,i)=>{tkHull.setColorAt(i,OLIVE);tkTur.setColorAt(i,OLIVE2);tkPose(i);});
for(const m of [tkHull,tkTur,tkBar]){m.frustumCulled=false;m.castShadow=!POTATO;m.receiveShadow=!POTATO;scene.add(m);}
const tkDirty=()=>{tkHull.instanceMatrix.needsUpdate=tkTur.instanceMatrix.needsUpdate=tkBar.instanceMatrix.needsUpdate=true;};
function tankHit(i,dmg,p){const t=TANKS[i];if(t.dead)return;t.hp-=dmg;mp.hitMark=0.25;
 const last=mp.nums[mp.nums.length-1],id='tk'+i;if(last&&last.id===id&&last.t>0.6){last.d+=dmg;last.t=0.95;}else mp.nums.push({id,w:'gun',p:p.clone(),d:dmg,t:0.95});
 if(SND.on)sBeep(1900,0.03,0.07);if(t.hp<=0)tankDestroy(i,true);}
function tankDestroy(i,mine,by){const t=TANKS[i];if(!t||t.dead)return;t.dead=NOW();t.hp=0;t.burst=0;mpBoom(t.c,1.2);tkHull.setColorAt(i,WRECK);tkHull.instanceColor.needsUpdate=true;tkPose(i);tkDirty();
 if(mine){mp.tankKills++;mp.center={t:1.8,big:'PANZER ZERSTÖRT',small:mp.tankKills+' Panzer'};mpFeed('💥 Du hast einen Panzer zerstört','me');mpSend({t:'tk',i,n:mp.name});sBeep(1200,0.08,0.15);}
 else mpFeed(`<b>${esc(by)}</b> hat einen Panzer zerstört`,'');}
function updTanks(dt,now){const A=ac;let dirty=false;
 for(let i=0;i<TANKS.length;i++){const t=TANKS[i];
  if(t.dead){if(now-t.dead>60){t.dead=0;t.hp=TANK_HP;tkHull.setColorAt(i,OLIVE);tkHull.instanceColor.needsUpdate=true;tkPose(i);dirty=true;}
   else if((t.smk-=dt)<=0){t.smk=POTATO?0.25:0.12;if(camera.position.distanceToSquared(t.c)<36e6)emit(t.x+(Math.random()-.5)*3,t.y+3,t.z+(Math.random()-.5)*3,(Math.random()-.5)*2,6,(Math.random()-.5)*2,5,4,7,0.45,0.1,0.1,0.1);}
   continue;}
  const dx=A.pos.x-t.x,dz=A.pos.z-t.z,dy=A.pos.y-t.c.y,d2=dx*dx+dz*dz;if(d2>2500*2500||A.crashed){t.burst=0;continue;}
  const hd=Math.sqrt(d2),da=((Math.atan2(-dx,-dz)-t.ty+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
  t.ty+=clamp(da,-1.4*dt,1.4*dt);t.el=lerp(t.el,clamp(Math.atan2(dy,hd),0,1.3),Math.min(1,dt*3));tkPose(i);dirty=true;
  if(mp.dead||menuOpen||A.onGround||dy<15||mp.inv>0||hd>1800||Math.abs(da)>0.3){t.burst=0;continue;}
  if(t.burst>0){if((t.bt-=dt)<=0){t.bt=0.12;t.burst--;const D=Math.hypot(hd,dy),tt=D/800;
    _gp.set(A.pos.x+A.vel.x*tt,A.pos.y+A.vel.y*tt+0.5*9.81*tt*tt,A.pos.z+A.vel.z*tt);_gb.copy(_gp).sub(t.c).normalize();
    _gb.x+=(Math.random()-.5)*0.03;_gb.y+=(Math.random()-.5)*0.03;_gb.z+=(Math.random()-.5)*0.03;_gb.normalize();
    if(bullets.length>=TRN)bullets.shift();bullets.push({p:t.c.clone().addScaledVector(_gb,6*TANK_S),v:_gb.clone().multiplyScalar(800),life:3,mine:false,foe:true,ti:i});
    if(D<1000)sBurst('bandpass',220,1.2,0.12,0.05);}}
  else if((t.cd-=dt)<=0){t.cd=2.2+Math.random()*2.5;t.burst=6;t.bt=0;}}
 if(dirty)tkDirty();}

/* ---------- Sprachansage „Missile lock“ (eingebaute Browser-Stimme, offline) ---------- */
let lockVoice=null,lastSay=0;
function sayLock(){const now=NOW();if(!cfg.sound||now-lastSay<2.5||!window.speechSynthesis)return;lastSay=now;
 try{sBeep(1500,0.03,0.05);const u=new SpeechSynthesisUtterance('Missile lock');u.lang='en-US';u.rate=1.15;u.pitch=0.85;u.volume=Math.min(1,(cfg.vol??0.7)+0.25);
  if(!lockVoice){const vs=speechSynthesis.getVoices();lockVoice=vs.find(v=>/^en[-_]US/i.test(v.lang)&&/daniel|alex|fred|aaron|google us|male/i.test(v.name))||vs.find(v=>/^en[-_](US|GB)/i.test(v.lang))||vs.find(v=>/^en/i.test(v.lang))||null;}
  if(lockVoice)u.voice=lockVoice;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(e){}}
if(window.speechSynthesis){try{speechSynthesis.getVoices();speechSynthesis.addEventListener?.('voiceschanged',()=>{lockVoice=null;});}catch(e){}}
/* ---------- Bodenwarnung (GPWS): Flugbahn 10 s vorausrechnen, Gelände prüfen ---------- */
let gpwsSay=0;
function speak(text,rate=1.15){if(!cfg.sound||!window.speechSynthesis)return;try{const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=rate;u.pitch=0.85;u.volume=Math.min(1,(cfg.vol??0.7)+0.25);
 if(!lockVoice){const vs=speechSynthesis.getVoices();lockVoice=vs.find(v=>/^en[-_]US/i.test(v.lang)&&/daniel|alex|fred|aaron|google us|male/i.test(v.name))||vs.find(v=>/^en/i.test(v.lang))||null;}
 if(lockVoice)u.voice=lockVoice;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(e){}}
function terrainAhead(){const A=ac;if(A.crashed||A.onGround)return 0;const V=A.vel.length();if(V<25)return 0;
 for(const r of RUNWAYS){const[lx,lz]=r.L(A.pos.x,A.pos.z);if(A.gearDown&&!A.P.gearFixed&&Math.abs(lx)<450&&lz>-r.hl-300&&lz<r.hl+9000)return 0;   // Landeanflug: keine Fehlwarnung
  if(A.P.gearFixed&&Math.abs(lx)<450&&Math.abs(lz)<r.hl+3000&&A.vel.y>-6)return 0;}
 for(let t=0.5;t<=10;t+=0.5){const x=A.pos.x+A.vel.x*t,y=A.pos.y+A.vel.y*t,z=A.pos.z+A.vel.z*t;if(A.P.sea&&groundH(x,z)<=0.3&&A.vel.y>-8)continue;if(y-Math.max(groundH(x,z),0)<20+V*0.06)return t;}return 0;}
/* ---------- Killcam: Kamera zeigt bis zum Respawn, wer dich erwischt hat ---------- */
const _kc=new THREE.Vector3(),_kp=new THREE.Vector3();
function mpCam(dt){const k=mp.kc;if(!mp.dead||!k)return;let tp=null,tq=null;
 if(k.id==='tank'){const t=TANKS[k.ti];if(t)tp=t.c;}else{const r=mp.players.get(k.id);if(r&&!r.dead&&r.model){tp=r.pos;tq=r.q;}}
 if(!tp)return;if(tq){_kc.set(0,0,1).applyQuaternion(tq).multiplyScalar(45);_kc.y+=12;}else _kc.set(35,28,35);
 _kp.copy(tp).add(_kc);if(!k.pos)k.pos=_kp.clone();else k.pos.lerp(_kp,Math.min(1,dt*4));camera.position.copy(k.pos);camera.up.set(0,1,0);camera.lookAt(tp);}

/* ---------- UI-Feedback: Leucht-Welle + kurzes Aufblitzen beim Antippen von Knöpfen ---------- */
function uiPulse(b,x,y){if(!b||!b.getBoundingClientRect)return;const r=b.getBoundingClientRect();if(!r.width)return;if(x==null){x=r.left+r.width/2;y=r.top+r.height/2;}
 const s=Math.max(r.width,r.height)*2.4,w=document.createElement('div'),d=document.createElement('i');w.className='ripw';
 w.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(b).borderRadius||'8px'}`;
 d.style.cssText=`left:${x-r.left-s/2}px;top:${y-r.top-s/2}px;width:${s}px;height:${s}px`;w.appendChild(d);document.body.appendChild(w);setTimeout(()=>w.remove(),520);
 b.classList.remove('flash');void b.offsetWidth;b.classList.add('flash');setTimeout(()=>b.classList.remove('flash'),380);}
addEventListener('pointerdown',e=>{const b=e.target.closest&&e.target.closest('button,.b,#teacherBtn');if(b)uiPulse(b,e.clientX,e.clientY);},true);
/* ---------- Admin-Menü (nur mit Dev-Cookie) & Jumpscare ---------- */
function fnv(s){let h=2166136261;for(const ch of s){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function devKey(){let v='';try{v=localStorage.getItem('d')||(document.cookie.match(/(?:^|;\s*)d=([^;]+)/)||[])[1]||'';}catch(e){}try{return decodeURIComponent(v);}catch(e){return v;}}
function isAdmin(){return fnv(String(devKey()))===3096940589;}
/* Geheime Adresse: index.html?d=SCHLÜSSEL (oder #d=SCHLÜSSEL) speichert den Admin-Schlüssel und entfernt ihn sofort aus der Adresszeile */
try{const u=new URL(location.href),q=u.searchParams.get('d')??(new URLSearchParams(u.hash.slice(1))).get('d');
 if(q!=null){localStorage.setItem('d',q);u.searchParams.delete('d');if(/(^#|&)d=/.test(u.hash))u.hash='';history.replaceState(null,'',u.pathname+u.search+u.hash);}}catch(e){}
if(isAdmin())console.log('%c🛠 Skyline Admin aktiv – M oder ☰ → Admin','color:#ff5a4a;font-weight:bold');
mp.adSel=new Set();
function openAdmin(){if(!isAdmin())return;let el=$('adminP');if(!el){el=document.createElement('div');el.id='adminP';document.body.appendChild(el);
  el.addEventListener('click',adminClick);el.addEventListener('input',e=>{if(e.target.id==='adTag'||e.target.id==='adTagC'){mp.adTagT=$('adTag').value;mp.adTagC=$('adTagC').value;const pv=$('adTagPv');if(pv){pv.textContent='['+(mp.adTagT.replace(/[\[\]<>]/g,'').trim()||'Tag')+']';pv.style.color=mp.adTagC;}}});el.addEventListener('change',e=>{if(e.target.id==='adSelf'){mp.adSelf=e.target.checked;return;}const c=e.target.closest('[data-pid]');if(c){c.checked?mp.adSel.add(c.dataset.pid):mp.adSel.delete(c.dataset.pid);}});}
 renderAdmin();el.style.display='block';menuOpen=true;mp.adminOpen=true;kbDown.clear();}
function closeAdmin(){const el=$('adminP');if(el)el.style.display='none';mp.adminOpen=false;menuOpen=false;kbDown.clear();}
function renderAdmin(){const el=$('adminP');if(!el)return;const pl=[...mp.players.values()];
 el.innerHTML=`<div class="adm"><div class="top"><h1>🛠 Admin</h1><button class="b" data-ad="close">✕ Schließen</button></div>
 ${mp.connected?'':'<p class="note">⚠ Du bist in keiner Lobby – Jumpscares gehen nur im Multiplayer.</p>'}
 <h2>Spieler in der Lobby</h2>${pl.length?pl.map(r=>`<label class="pl"><span><input type="checkbox" data-pid="${esc(r.id)}" ${mp.adSel.has(r.id)?'checked':''}> ${tagH(r.id)}${esc(r.n)}</span><span>${esc((TYPES[r.ty]?.name||'').split(' (')[0])}</span></label>`).join(''):'<p class="note">Niemand sonst in der Lobby.</p>'}
 <div class="row" style="margin-top:14px"><button class="b" data-ad="all">Alle auswählen</button><button class="b" data-ad="none">Keinen</button></div>
 <label class="pl" style="border:none;margin-top:6px"><span><input type="checkbox" id="adSelf" ${mp.adSelf?'checked':''}> An mir selbst testen (statt an die Auswahl)</span></label>
 <h2>Cheats (nur für dich)</h2><div class="row"><button class="b ${mp.infMs?'jsb':''}" data-ad="inf">♾️ Unendlich Raketen: ${mp.infMs?'AN':'AUS'}</button></div>
 <h2>🏷 Tags vergeben</h2><div class="row" style="align-items:center"><input type="text" id="adTag" maxlength="12" placeholder="z. B. Crafter" value="${esc(mp.adTagT||'')}" style="background:#0b1626;color:#fff;border:1px solid #33506f;border-radius:7px;padding:8px 10px;font:inherit;width:150px">
  <input type="color" id="adTagC" value="${mp.adTagC||'#ffb020'}" style="width:46px;height:38px;border:none;background:none;padding:0"><span id="adTagPv" style="font-weight:800;color:${mp.adTagC||'#ffb020'}">[${esc(mp.adTagT||'Tag')}]</span> <span>${esc(mp.name)}</span></div>
 <div class="row"><button class="b" data-ad="tag">🏷 Tag an Auswahl geben</button><button class="b" data-ad="untag">Tag entfernen</button></div>
 <h2>⚡ Teleport-Fähigkeit</h2><div class="row"><button class="b" data-ad="tpg">⚡ Teleport geben</button><button class="b" data-ad="tpr">Teleport wegnehmen</button></div>
 <p class="note">Spieler mit dieser Fähigkeit bekommen einen ⚡-Knopf (Taste J): teleportiert 2 km hinter das gegnerische Flugzeug (anvisiertes oder nächstes), 1:30 Min Cooldown. Bleibt dauerhaft auf ihrem Gerät gespeichert.${mp.tpOK?' <b>Du hast sie gerade.</b>':''}</p>
 <p class="note">Gilt für die angehakten Spieler (oder für dich, wenn „An mir selbst testen“ an ist). Der Tag bleibt dauerhaft auf dem Gerät des Spielers gespeichert.</p>
 <h2>🎨 UI-Design testen</h2><div class="row"><button class="b ${thPref()==='auto'?'jsb':''}" data-ad="th" data-k="auto">Automatisch (${autoTheme()?THEMES[autoTheme()].n:'heute kein Anlass'})</button>${Object.entries(THEMES).map(([k,t])=>`<button class="b ${thPref()===k?'jsb':''}" data-ad="th" data-k="${k}">${t.n}</button>`).join('')}<button class="b ${thPref()==='none'?'jsb':''}" data-ad="th" data-k="none">Normal</button></div>
 <h2>Troll-Aktionen</h2><div class="trgrid">${TROLLS.map(([k,l])=>`<button class="b ${k==='js'||k==='amsl'||k==='apcrash'?'jsb':''}" data-tr="${k}">${l}</button>`).join('')}</div>
 <p class="note" id="adStat"></p></div>`;}
function adminClick(e){const tb=e.target.closest('[data-tr]');if(tb){const k=tb.dataset.tr,st=$('adStat'),L=TROLLS.find(x=>x[0]===k)[1];
  if(mp.adSelf){closeAdmin();setTimeout(()=>troll(k,mp.name,mp.myId),300);return;}
  const ids=[...mp.adSel].filter(id=>mp.players.has(id));if(!mp.connected){st.textContent='Nicht verbunden – nutze „An mir selbst testen“.';return;}if(!ids.length){st.textContent='Niemand ausgewählt.';return;}
  for(const id of ids)mpSend(k==='js'?{t:'js',to:id}:{t:'tr',to:id,k,n:mp.name,from:mp.myId});st.textContent='😈 '+L+' → '+ids.map(pname).join(', ');return;}
 const b=e.target.closest('[data-ad]');if(!b)return;const a=b.dataset.ad;
 if(a==='close')closeAdmin();
 else if(a==='all'){for(const id of mp.players.keys())mp.adSel.add(id);renderAdmin();}
 else if(a==='none'){mp.adSel.clear();renderAdmin();}
 else if(a==='tpg'||a==='tpr'){const st=$('adStat'),on=a==='tpg';if(mp.adSelf){setTP(on);renderAdmin();$('adStat').textContent=on?'⚡ Du hast jetzt Teleport':'⚡ Teleport bei dir entfernt';return;}
  const ids=[...mp.adSel].filter(id=>mp.players.has(id)&&!id.startsWith('bot-'));if(!mp.connected){st.textContent='Nicht verbunden – nutze „An mir selbst testen“.';return;}if(!ids.length){st.textContent='Niemand ausgewählt.';return;}
  for(const id of ids)mpSend({t:'tpg',to:id,on:on?1:0});st.textContent='⚡ Teleport '+(on?'gegeben an ':'entfernt bei ')+ids.map(pname).join(', ');}
 else if(a==='tag'||a==='untag'){const st=$('adStat'),tg=a==='tag'?tagOk([mp.adTagT||'',mp.adTagC||'#ffb020']):null;if(a==='tag'&&!tg){st.textContent='Bitte zuerst einen Tag-Text eingeben.';return;}
  if(mp.adSelf){setMyTag(tg);renderAdmin();$('adStat').textContent=tg?'🏷 Du trägst jetzt ['+tg[0]+']':'🏷 Dein Tag ist weg';return;}
  const ids=[...mp.adSel].filter(id=>mp.players.has(id)&&!id.startsWith('bot-'));if(!mp.connected){st.textContent='Nicht verbunden – nutze „An mir selbst testen“.';return;}if(!ids.length){st.textContent='Niemand ausgewählt.';return;}
  for(const id of ids)mpSend({t:'tag',to:id,tg});st.textContent='🏷 '+(tg?'['+tg[0]+'] → ':'Tag entfernt bei ')+ids.map(pname).join(', ');}
 else if(a==='th'){try{localStorage.setItem('skyflt_theme',b.dataset.k);}catch(_){}THK='?';applyTheme();renderAdmin();$('adStat').textContent='🎨 Design: '+(THEMES[b.dataset.k]?.n||b.dataset.k);}
 else if(a==='inf'){mp.infMs=!mp.infMs;if(mp.infMs)mp.ir=IR.ammo;renderAdmin();$('adStat').textContent=mp.infMs?'♾️ Unendlich Raketen aktiv':'Unendlich Raketen aus';}
 else if(a==='test'){closeAdmin();setTimeout(jumpscare,300);}
 else if(a==='js'){const ids=[...mp.adSel].filter(id=>mp.players.has(id));const st=$('adStat');
  if(!mp.connected){st.textContent='Nicht verbunden.';return;}if(!ids.length){st.textContent='Niemand ausgewählt.';return;}
  for(const id of ids)mpSend({t:'js',to:id});st.textContent='😈 Jumpscare gesendet an: '+ids.map(pname).join(', ');}}
const JS_SVG=`<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="jbg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#5a0000"/><stop offset="1" stop-color="#000"/></radialGradient>
<radialGradient id="jfc" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="#e9e4da"/><stop offset=".55" stop-color="#a59d90"/><stop offset="1" stop-color="#3a342e"/></radialGradient>
<radialGradient id="jey" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff2a10"/><stop offset=".25" stop-color="#600"/><stop offset="1" stop-color="#000"/></radialGradient></defs>
<rect width="400" height="400" fill="url(#jbg)"/><path d="M200 40C120 40 78 110 82 190c3 60 30 112 62 150 20 24 36 34 56 34s36-10 56-34c32-38 59-90 62-150 4-80-38-150-118-150z" fill="url(#jfc)"/>
<path d="M140 95l18 40-12 30M262 92l-14 44 16 28M190 60l6 30-10 22" stroke="#4a3f36" stroke-width="3" fill="none"/>
<ellipse cx="148" cy="178" rx="34" ry="42" fill="url(#jey)" transform="rotate(-12 148 178)"/><ellipse cx="252" cy="178" rx="34" ry="42" fill="url(#jey)" transform="rotate(12 252 178)"/>
<circle cx="150" cy="182" r="5" fill="#ff5030"/><circle cx="250" cy="182" r="5" fill="#ff5030"/>
<path d="M118 140l60 18M282 140l-60 18" stroke="#1a0f0a" stroke-width="9" stroke-linecap="round"/><path d="M188 222l12 22 12-22" fill="#2a2018"/>
<path d="M136 268c20-14 108-14 128 0-4 52-28 92-64 92s-60-40-64-92z" fill="#050000"/>
<path d="M140 270l10 22 10-20 10 24 10-24 10 26 10-26 10 26 10-24 10 24 10-20 10 22 10-24M150 352l10-26 12 22 10-28 10 30 10-28 10 28 10-28 10 24 12-22 8 24" fill="none" stroke="#e8e0cc" stroke-width="5" stroke-linejoin="round"/>
<path d="M95 230c-14 30-10 70 8 96M305 230c14 30 10 70-8 96" stroke="#5a0000" stroke-width="5" fill="none" opacity=".7"/></svg>`;
let jsBusy=false;
function jumpscare(){if(jsBusy)return;jsBusy=true;let el=$('jsOv');if(!el){el=document.createElement('div');el.id='jsOv';el.innerHTML=JS_SVG;document.body.appendChild(el);}
 el.style.display='flex';el.classList.remove('go');void el.offsetWidth;el.classList.add('go');scream();rumble(900,1,1);try{navigator.vibrate&&navigator.vibrate([350,60,450]);}catch(e){}
 setTimeout(()=>{el.style.display='none';el.classList.remove('go');jsBusy=false;},1800);}
function scream(){const C=SND.ctx;if(!C||!cfg.sound)return;try{if(C.state==='suspended')C.resume();const t=C.currentTime,g=C.createGain(),v=0.5*(cfg.vol??0.7);
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+0.03);g.gain.setValueAtTime(v,t+1.1);g.gain.exponentialRampToValueAtTime(0.001,t+1.6);
 const ws=C.createWaveShaper(),k=new Float32Array(256);for(let i=0;i<256;i++)k[i]=Math.tanh((i/128-1)*4);ws.curve=k;ws.connect(g);g.connect(C.destination);
 for(const [f0,f1,ty] of [[620,1700,'sawtooth'],[930,2300,'square'],[310,880,'sawtooth']]){const o=C.createOscillator(),lfo=C.createOscillator(),lg=C.createGain(),og=C.createGain();
  o.type=ty;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+0.35);o.frequency.exponentialRampToValueAtTime(f1*0.8,t+1.5);
  lfo.frequency.value=13;lg.gain.value=f0*0.06;lfo.connect(lg);lg.connect(o.frequency);og.gain.value=0.25;o.connect(og);og.connect(ws);o.start(t);o.stop(t+1.6);lfo.start(t);lfo.stop(t+1.6);}
 if(SND.nb){const s=C.createBufferSource(),bp=C.createBiquadFilter(),ng=C.createGain();s.buffer=SND.nb;s.loop=true;bp.type='bandpass';bp.frequency.value=2500;bp.Q.value=0.7;ng.gain.value=0.5;s.connect(bp);bp.connect(ng);ng.connect(ws);s.start(t);s.stop(t+1.6);}}catch(e){}}

/* ---------- Troll-Aktionen (nur Admin kann sie senden; beim Opfer kurz & harmlos) ---------- */
const TROLLS=[['js','😱 Jumpscare'],['black','⬛ Black Screen (1 s)'],['disc','🔌 Fake-Verbindungsabbruch (3 s)'],['flip','🙃 Auf dem Kopf (5 s)'],['eng','🛑 Motorausfall (3 s)'],['emoji','🎉 Emoji-Regen (3 s)'],['fake','💀 Fake-Abschuss'],['drunk','🍺 Betrunkener Pilot (8 s)'],['crack','💔 Display kaputt (10 s)'],['fwarn','📢 Fake-Raketenwarnung (5 s)'],['teach','👨‍🏫 Fake-Lehreralarm'],['amsl','🚀 Admin-Rakete (echt!)'],['tristan','📘 Tristan-Modus (15 s)'],['apcrash','🏔️ Autopilot in den Berg']];
function trollOverlay(id,html,ms){let el=$(id);if(!el){el=document.createElement('div');el.id=id;el.className='trov';document.body.appendChild(el);}el.innerHTML=html;el.style.display='flex';clearTimeout(el._t);el._t=setTimeout(()=>{el.style.display='none';el.innerHTML='';},ms);return el;}
function troll(k,from,fid){const A=ac;
 if(k==='apcrash'){apCrashStart(fid||mp.myId);return;}
 if(k==='tristan'){trollOverlay('trBlue','<div class="bs"><div class="sm">:(</div><div class="bt">Fang an zu lernen, du faule Sau.</div><div class="bi">Dein Gerät ist auf ein Problem gestoßen: zu viel Zocken, zu wenig Lernen.<br>Stoppcode: FAULE_SAU_EXCEPTION</div></div>',15000);return;}
 if(k==='drunk'){mp.drunk=NOW()+8;mp.drSm={p:input.pitch,r:input.roll};document.body.classList.add('trdrunk');flash('🍺 Hicks!');sBeep(220,0.12,0.15);setTimeout(()=>sBeep(180,0.14,0.15),180);return;}
 if(k==='crack'){trollOverlay('trCrack',crackSVG(),10000);sBurst('highpass',2600,0.9,0.7,0.35);for(let i=0;i<5;i++)setTimeout(()=>sBeep(3000+Math.random()*2500,0.05,0.06),120+i*70);rumble(300,1,0.5);return;}
 if(k==='fwarn'){if(A.crashed)return;mp.fakeW=NOW()+5;speak('Missile! Missile!',1.3);return;}
 if(k==='teach'){trollOverlay('trTeach','<img class="fmi" src="data:image/webp;base64,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">',4000);return;}
 if(k==='amsl'){spawnAdmMs(fid||mp.myId,from);return;}
 if(k==='js')return jumpscare();
 if(k==='black'){trollOverlay('trBlack','',1000);return;}
 if(k==='disc'){trollOverlay('trDisc','<div class="dbox"><div class="spin"></div><b>⚠ Verbindung zum Server verloren</b><span>Fehlercode 0x80072EFD · Netzwerk wird neu verbunden …</span></div>',3000);return;}
 if(k==='flip'){document.body.classList.add('trflip');clearTimeout(mp.flipT);mp.flipT=setTimeout(()=>document.body.classList.remove('trflip'),5000);return;}
 if(k==='eng'){mp.engOut=NOW()+3;flash('⚠ MOTORAUSFALL!');sBurst('lowpass',90,1,0.8,0.6);return;}
 if(k==='emoji'){const E=['🎉','💩','🤡','🐔','🍌','😂','🦆','🎊','🥚','🐸'];let h='';for(let i=0;i<46;i++)h+=`<i style="left:${Math.random()*98}%;animation-duration:${1.4+Math.random()*1.6}s;animation-delay:${Math.random()*1.2}s;font-size:${26+Math.random()*34}px">${E[Math.random()*E.length|0]}</i>`;
  trollOverlay('trEmoji',h,3200);sBeep(1600,0.08,0.12);setTimeout(()=>sBeep(2100,0.1,0.12),120);return;}
 if(k==='fake'){if(A.crashed)return;mp.center={t:3.5,big:'ABGESCHOSSEN',small:'von '+(from||'Admin'),bad:true};mp.dmgFlash=1;mpBoom(A.pos,0.8);rumble(500,1,0.6);
  mpFeed(`<b>${esc(from||'Admin')}</b><span class="wpn">︻デ═ Kanone</span><b>${esc(mp.name)}</b>`,'dead');return;}}
/* Betrunkener Pilot: träge + schwankende Steuerung (aufgerufen in gatherInput) */
function trDrunkIn(dt){if(mp.apCrash){input.pitch=input.roll=input.yaw=0;ac.thr=1;ac.brakes=false;return;}if(!mp.drunk)return;const t=NOW();if(t>mp.drunk){mp.drunk=0;document.body.classList.remove('trdrunk');return;}
 const s=mp.drSm,k=1-Math.exp(-2.2*dt);s.p+=(input.pitch-s.p)*k;s.r+=(input.roll-s.r)*k;
 input.pitch=clamp(s.p+0.35*Math.sin(t*1.9)+0.15*Math.sin(t*4.3),-1,1);input.roll=clamp(s.r+0.55*Math.sin(t*1.3+1),-1,1);input.yaw=clamp(input.yaw+0.3*Math.sin(t*0.9),-1,1);}
/* Display kaputt: zufälliges Spinnennetz aus Rissen */
function crackSVG(){const W=innerWidth,H=innerHeight,cx=W*(0.25+Math.random()*0.5),cy=H*(0.25+Math.random()*0.5),R=Math.hypot(W,H),n=14+(Math.random()*6|0),rays=[];let d='';
 for(let i=0;i<n;i++){const a=i/n*6.283+Math.random()*0.35,pts=[];let r=0;d+=`M${cx|0},${cy|0}`;while(r<R){r+=25+Math.random()*90;const aa=a+(Math.random()-.5)*0.22,x=cx+Math.cos(aa)*r,y=cy+Math.sin(aa)*r;d+=`L${x|0},${y|0}`;pts.push([x,y,r]);}rays.push(pts);}
 for(const rr of [35,80,150,240,360])for(let i=0;i<n;i++){if(Math.random()<0.3)continue;const pa=rays[i].find(p=>p[2]>rr),pb=rays[(i+1)%n].find(p=>p[2]>rr);if(pa&&pb)d+=`M${pa[0]|0},${pa[1]|0}L${pb[0]|0},${pb[1]|0}`;}
 return `<svg width="100%" height="100%" viewBox="0 0 ${W} ${H}"><defs><radialGradient id="cg"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="70" fill="url(#cg)"/><path d="${d}" stroke="#000a" stroke-width="3.2" fill="none" transform="translate(1.5,1.5)"/><path d="${d}" stroke="#fffe" stroke-width="1.4" fill="none"/></svg>`;}
/* Fake-Raketenwarnung (Entfernung schrumpft, keine echte Rakete) */
function trollWarn(){if(!mp.fakeW)return;const r=mp.fakeW-NOW();if(r<=0||ac.crashed){mp.fakeW=0;return;}const d=600+3400*(r/5);if(mp.warn===null||d<mp.warn)mp.warn=d;}
/* Admin-Rakete: echte Lenkrakete aus dem Nichts, wird beim Opfer simuliert, Flares helfen (50 %) */
let admMs=null;
function spawnAdmMs(fid,from){const A=ac;if(A.crashed||mp.dead)return;if(admMs)msFree(admMs.mesh);
 const f=_me.set(0,0,-1).applyQuaternion(A.q),dir=new THREE.Vector3(-f.x,0,-f.z);if(dir.lengthSq()<0.01)dir.set(1,0,0);dir.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),(Math.random()-.5)*1.4);
 const p=A.pos.clone().addScaledVector(dir,2600);p.y=Math.max(A.pos.y+250,groundH(p.x,p.z)+300);
 admMs={id:900000+(Math.random()*99999|0),p,v:A.pos.clone().sub(p).normalize().multiplyScalar(350),t:0,fid,fl:mp.flareN,lost:false,mesh:msMesh()};
 speak('Missile! Missile!',1.3);flash('🚀 '+(from||'Admin')+' hat eine Rakete auf dich abgefeuert!');}
function updAdmMs(dt){const m=admMs;if(!m)return;const A=ac;m.t+=dt;
 if(mp.flareN!==m.fl){m.fl=mp.flareN;if(Math.random()<0.5)m.lost=true;}
 let sp=Math.min(m.v.length()+(m.t<6?180:-25)*dt,1000);const d=_ga.copy(m.v).normalize();
 if(!m.lost&&!A.crashed){const los=_gb.copy(A.pos).sub(m.p),dist=los.length(),cl=Math.max(150,-_gc.copy(A.vel).sub(m.v).dot(los)/Math.max(dist,1)),tgo=Math.min(dist/cl,6);
  const aim=_gd.copy(A.pos).addScaledVector(A.vel,tgo).sub(m.p).normalize(),ang=d.angleTo(aim),mx=35*9.81/Math.max(sp,50)*dt;if(ang>1e-4)d.lerp(aim,Math.min(1,mx/ang)).normalize();}
 m.v.copy(d).multiplyScalar(sp);const p0=_gp.copy(m.p);m.p.addScaledVector(m.v,dt);let boom=false;
 if(!m.lost&&!A.crashed&&segDist(p0,m.p,A.pos)<15){boom=true;mpOnHit({from:m.fid,dmg:130,w:'ir',adm:1});}
 if(m.t>18||m.p.y<groundH(m.p.x,m.p.z))boom=true;
 if(boom){mpBoom(m.p,0.8);megaBoom(m.p,1);msFree(m.mesh);admMs=null;return;}
 msPose(m.mesh,m.p,m.v,m.t<8);msTrail(p0,m.p,m.t<8);
 if(!m.lost&&!A.crashed){const dd=m.p.distanceTo(A.pos);if(mp.warn===null||dd<mp.warn)mp.warn=dd;}}
/* Rage-Sprüche beim Tod */
const RAGE={shot:['Flieg nächstes Mal besser 🙃','Ausweichen ist auch eine Option.','Flares gibt\'s übrigens umsonst – benutz sie!','Skill Issue ✈️💥','Die Rakete hat gepiept. Laut.','Tipp: Nicht geradeaus fliegen, wenn jemand hinter dir ist.','Das war kein Dogfight, das war Tontaubenschießen.','Dein Gegner bedankt sich für den Kill 🙏','Vielleicht lieber Papierflieger?','Mehr ausweichen, weniger beten.','Warst du AFK?','Nicht ragen. Respawnen.','Wer bremst, verliert. Wer geradeaus fliegt, auch.'],
 crash:['Der Boden war schon immer da.','„Pull up“ hieß nicht „weiter so“.','Schwerkraft: 1 – Du: 0','Terrain Warning ignoriert? Mutig.','Landen geht auch langsamer.','Der Berg hat gewonnen ⛰️','Bodenkontakt: erfolgreich hergestellt.'],
 flak:['Von einem Panzer erwischt, der sich nicht mal bewegt…','Der Panzer steht seit Spielbeginn da. Nur so.','Flak 1 – Pilot 0'],
 ground:['In den Boden getrieben. Autsch.','Er hat dich nicht mal abgeschossen – du bist einfach reingeflogen.']};
function rageMsg(w,lh){const L=w==='crash'||w==='coll'?RAGE.crash:w==='ground'?RAGE.ground:lh&&lh.w==='flak'?RAGE.flak:RAGE.shot;return L[Math.random()*L.length|0];}
/* Autopilot in den Berg: sucht den höchsten Berg in der Nähe und steuert stur hinein */
const _apT=new THREE.Vector3(),_apD=new THREE.Vector3(),_apM=new THREE.Matrix4(),_apQ=new THREE.Quaternion(),_apU=new THREE.Vector3(0,1,0);
function apCrashStart(fid){const A=ac;if(A.crashed||mp.dead)return;let best=null,bs=-1e9;
 for(let i=-15;i<=15;i++)for(let j=-15;j<=15;j++){const x=A.pos.x+i*600,z=A.pos.z+j*600,h=groundH(x,z),d=Math.hypot(i,j)*600;if(d<1500)continue;const sc=h-d*0.04;if(sc>bs){bs=sc;best=[x,h,z];}}
 if(!best)return;mp.apCrash={x:best[0],y:Math.max(best[1]*0.55,best[1]-150),z:best[2],el:0,fid};AP.on=false;AP.mode='';
 flash('🤖 AUTOPILOT AKTIV – Ziel: Berg ⛰️');speak('Autopilot engaged',1.1);}
function apCrashTick(dt){const t=mp.apCrash;if(!t)return;const A=ac;
 t.el+=dt;if(A.crashed||mp.dead||t.el>60){if(A.crashed&&!mp.shot)mp.lastHit={by:t.fid,w:'ground',t:NOW()};mp.apCrash=null;return;}
 mp.lastHit={by:t.fid,w:'ground',t:NOW()};A.thr=1;A.brakes=false;
 _apT.set(t.x,t.y,t.z);_apD.copy(_apT).sub(A.pos).normalize();_apQ.setFromRotationMatrix(_apM.lookAt(A.pos,_apT,_apU));
 A.q.slerp(_apQ,Math.min(1,dt*1.3));A.omega.set(0,0,0);
 const sp=Math.min(Math.max(A.vel.length()+40*dt,130),230);A.vel.lerp(_apD.multiplyScalar(sp),Math.min(1,dt*3));}
function trollTick(dt){apCrashTick(dt||0.016);if(mp.engOut){if(NOW()<mp.engOut){ac.thr=Math.min(ac.thr,0);ac.n1*=0.5;if(Math.random()<0.08)sBurst('lowpass',70+Math.random()*60,1,0.5,0.15);}else mp.engOut=0;}}

/* ---------- Start-Cinematic: F-15 donnert im Tiefflug vorbei (max. ~10 s, überspringbar) ---------- */
const CINE_LEN=9.5,_cU=new THREE.Vector3(0,1,0),_cM=new THREE.Matrix4(),_cA=new THREE.Vector3(),_cB=new THREE.Vector3();
let cine=null;
function cineStart(){const A=ac;let m;try{m=TYPES[ORDER.includes('f15')?'f15':ORDER[0]].build();}catch(e){return;}
 m.group.traverse(o=>{if(o.isMesh){o.castShadow=false;}});
 for(const l of m.legs||[])l.piv.visible=false;if(m.gearMesh)m.gearMesh.visible=false;if(m.gearOn){m.gearOn.forEach(o=>o.visible=false);m.gearOff.forEach(o=>o.visible=true);}
 scene.add(m.group);
 const fw=_cA.set(0,0,-1).applyQuaternion(A.q);fw.y=0;if(fw.lengthSq()<1e-3)fw.set(0,0,-1);fw.normalize();
 const R=new THREE.Vector3().crossVectors(fw,_cU).normalize(),B=A.pos.clone();B.y=groundH(B.x,B.z);
 const dir=fw.clone().negate(),R2=new THREE.Vector3().crossVectors(dir,_cU).normalize();
 cine={t:0,m,B,fw:fw.clone(),R,R2,dir,pos:B.clone().addScaledVector(fw,1500).addScaledVector(R,14).add(_cU.clone().multiplyScalar(32)),
  roll:0,camPos:B.clone().addScaledVector(fw,280).addScaledVector(R,-34).add(new THREE.Vector3(0,2.2,0)),look:null,fov:camera.fov,boom:false,au:null,end:false};
 cine.look=cine.pos.clone();
 menuOpen=true;document.body.classList.add('cine');
 let ov=$('cineOv');if(!ov){ov=document.createElement('div');ov.id='cineOv';document.body.appendChild(ov);}
 ov.innerHTML='<i class="cb cbt"></i><i class="cb cbb"></i><div class="ct"><b>SKYLINE FLIGHT</b><span>DOGFIGHT</span></div><div class="cf"></div>';
 ov.style.display='block';ov.onpointerdown=e=>{e.preventDefault();e.stopPropagation();cineEnd();};
 requestAnimationFrame(()=>ov.classList.add('on'));cine.ct=ov.querySelector('.ct');cine.cf=ov.querySelector('.cf');cineAudio();}
function cineAudio(){const C=SND.ctx;if(!C||!SND.nb||!cfg.sound)return;try{if(C.state==='suspended')C.resume();
 const out=C.createGain();out.gain.value=0;out.connect(C.destination);const mk=(type,f,q,g)=>{const s=C.createBufferSource();s.buffer=SND.nb;s.loop=true;s.playbackRate.value=0.7+Math.random()*0.2;
  const fl=C.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const gg=C.createGain();gg.gain.value=g;s.connect(fl);fl.connect(gg);gg.connect(out);s.start();return{s,fl,gg};};
 cine.au={out,roar:mk('lowpass',900,0.7,1.0),rum:mk('lowpass',90,1,1.4),whine:mk('bandpass',2400,4,0.35)};}catch(e){cine.au=null;}}
function cineBoom(){const C=SND.ctx;if(!C||!cine.au)return;const t=C.currentTime,s=C.createBufferSource();s.buffer=SND.nb;const fl=C.createBiquadFilter();fl.type='lowpass';fl.frequency.setValueAtTime(1800,t);fl.frequency.exponentialRampToValueAtTime(60,t+1.6);
 const g=C.createGain(),v=0.9*(cfg.vol??0.7);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.001,t+1.8);s.connect(fl);fl.connect(g);g.connect(C.destination);s.start(t);s.stop(t+1.9);}
function cineTick(dt){const c=cine;if(!c)return;c.t+=dt;const t=c.t,m=c.m;
 // Flugbahn: Tiefflug entlang der Piste, ab 3,9 s steil hochziehen, dann Fassrolle
 if(t>3.9&&t<6.2){const pr=1.05*dt;c.dir.applyAxisAngle(c.R2,pr);if(c.dir.y>0.93){c.dir.y=0.93;c.dir.normalize();}}
 if(t>5.7&&t<7.2)c.roll+=dt*4.2;
 const sp=t<3.9?330:330+(t-3.9)*25;c.pos.addScaledVector(c.dir,sp*dt);
 const up=_cB.crossVectors(c.R2,c.dir).normalize().applyAxisAngle(c.dir,c.roll);
 _cA.copy(c.pos).add(c.dir);_cM.lookAt(c.pos,_cA,up);m.group.position.copy(c.pos);m.group.quaternion.setFromRotationMatrix(_cM);
 for(const a of m.ab||[]){a.visible=true;const s=1.0+Math.random()*0.25;a.scale.set(1.15,1.15,s*1.3);a.material.color.setRGB(4,1.8,0.6);}
 // Spur aus Hitze-Schlieren und Dampf
 const bk=_cB.copy(c.dir).multiplyScalar(-9).add(c.pos);for(let i=0;i<2;i++)emit(bk.x,bk.y,bk.z,(Math.random()-.5)*4,(Math.random()-.5)*4,(Math.random()-.5)*4,0.9,2.5,7,0.18,0.85,0.85,0.88);
 if(menuOpen)updParticles(dt);
 // Kamera
 let fov=c.fov;
 if(t<4.4){camera.position.copy(c.camPos);c.look.lerp(c.pos,Math.min(1,dt*(t<3.3?20:7)));const d=c.pos.distanceTo(c.camPos);
  fov=t<3.3?clamp(18+d*0.012,18,32):lerp(32,62,clamp((t-3.3)/1.2,0,1));
  if(d<180){const k=(1-d/180)*1.6;camera.position.x+=(Math.random()-.5)*k;camera.position.y+=(Math.random()-.5)*k;}
  if(!c.boom&&t>3.0&&d<120){c.boom=true;cineBoom();rumble(700,1,0.8);}
  camera.up.set(0,1,0);camera.lookAt(c.look);}
 else{const ta=(t-4.4)*0.35,back=_cA.copy(c.dir).multiplyScalar(-30+(t-4.4)*2.5).addScaledVector(c.R2,12*Math.cos(ta)).add(c.pos);back.y-=5+6*Math.sin(ta);
  c.camPos.copy(back);camera.position.copy(c.camPos);camera.up.set(0,1,0);camera.lookAt(c.pos);fov=58;}
 camera.fov=fov;camera.updateProjectionMatrix();
 // Ton (Doppler + Entfernung)
 if(c.au){const C=SND.ctx,tt=C.currentTime,d=Math.max(8,c.pos.distanceTo(camera.position));
  const vr=_cA.copy(camera.position).sub(c.pos).normalize().dot(_cB.copy(c.dir).multiplyScalar(sp));const dop=clamp(340/(340-clamp(vr,-300,300)),0.55,2.2);
  const g=Math.pow(clamp(140/d,0,1),1.1)*(cfg.vol??0.7)*1.4*clamp(t/0.4,0,1)*(t>CINE_LEN-0.8?clamp((CINE_LEN-t)/0.8,0,1):1);
  c.au.out.gain.setTargetAtTime(g,tt,0.04);c.au.roar.fl.frequency.setTargetAtTime(clamp(500*dop*clamp(260/d,0.6,4),200,9000),tt,0.05);
  c.au.whine.fl.frequency.setTargetAtTime(2200*dop,tt,0.05);c.au.whine.gg.gain.setTargetAtTime(t<4?0.4:0.15,tt,0.1);}
 if(c.ct){const k=clamp((t-5.6)/0.9,0,1),o=t<5.6?0:t<8.4?k:clamp((9.1-t)/0.7,0,1);c.ct.style.opacity=o;c.ct.style.transform=`translateY(-50%) scale(${(1.25-0.25*eo3(k)).toFixed(3)})`;c.cf.style.opacity=clamp((t-8.9)/0.6,0,1);}
 if(t>=CINE_LEN)cineEnd();}
const eo3=x=>1-Math.pow(1-x,3);
function cineEnd(){const c=cine;if(!c||c.end)return;c.end=true;cine=null;scene.remove(c.m.group);
 if(c.au){try{const C=SND.ctx;c.au.out.gain.setTargetAtTime(0,C.currentTime,0.08);setTimeout(()=>{for(const k of ['roar','rum','whine'])try{c.au[k].s.stop();}catch(e){}c.au.out.disconnect();},400);}catch(e){}}
 camera.fov=c.fov;camera.updateProjectionMatrix();menuOpen=false;kbDown.clear();document.body.classList.remove('cine');
 const ov=$('cineOv');if(ov){ov.classList.remove('on');ov.style.display='none';ov.innerHTML='';}}
addEventListener('keydown',e=>{if(!cine)return;e.preventDefault();e.stopImmediatePropagation();if(e.code==='Escape'||e.code==='Space'||e.code==='Enter')cineEnd();},true);
/* =====================================================================
   SKY HORNET P-7: Propeller-Jäger im Stil der 40er (eigene Konstruktion)
   Fahrwerk aus = Räder, Fahrwerk ein = Schwimmer (Wasserskier) für Wasserlandungen
   ===================================================================== */
function seaHull(){const Z=[],R=[];const N=46;
 for(let i=0;i<=N;i++){const t=i/N,z=-7.7+t*16.2;Z.push(z);}
 const ring=z=>{const bow=smooth(-7.7,-3.6,z),aft=1-smooth(1.8,8.5,z);
  const w=0.1+1.18*bow*(0.25+0.75*aft)+0.12*aft*bow;                   // halbe Breite
  const top=1.22+0.28*smooth(-5.2,-3.8,z)*(1-smooth(-2.0,-0.6,z))+0.25*smooth(4,8.5,z);   // Dach (Cockpit-Buckel, Heck steigt)
  let keel=z<0.9?-1.38+0.95*(1-smooth(-7.7,-4.6,z)):-1.06+1.62*smooth(0.9,8.5,z);           // Kiel mit Stufe bei z=0.9, Heck hochgezogen
  const dead=Math.tan(24*DEG),half=[[0,keel],[w*0.5,keel+w*0.5*dead],[w,keel+w*dead],[w*1.04,keel+w*dead+0.06],[w,keel+w*dead+0.3],[w*0.97,(keel+top)*0.5],[w*0.88,top*0.72],[w*0.6,top*0.95],[0,top]];
  return half;};
 const pts=[];let RN=0;for(const z of Z){const h=ring(z),full=[...h,...h.slice(1,-1).reverse().map(([x,y])=>[-x,y])];RN=full.length;for(const[x,y] of full)pts.push(x,y,z);}
 const I=[];for(let i=0;i<Z.length-1;i++)for(let j=0;j<RN;j++){const a=i*RN+j,b=i*RN+(j+1)%RN,c=(i+1)*RN+j,d=(i+1)*RN+(j+1)%RN;I.push(a,c,b,b,c,d);}
 // Bug- und Heckkappe
 const bowC=pts.length/3;pts.push(0,(ring(Z[0])[0][1]+ring(Z[0])[8][1])/2,Z[0]-0.05);const tailC=pts.length/3;const zl=Z[Z.length-1];pts.push(0,(ring(zl)[0][1]+ring(zl)[8][1])/2,zl+0.05);
 for(let j=0;j<RN;j++){I.push(bowC,j,(j+1)%RN);const o=(Z.length-1)*RN;I.push(tailC,o+(j+1)%RN,o+j);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.setIndex(I);g.computeVertexNormals();
 // Farben: unten Blau, rote Wasserlinie, oben Weiß
 const p=g.attributes.position,col=new Float32Array(p.count*3),cB=new THREE.Color(0x173f74),cR=new THREE.Color(0xc4202c),cW=new THREE.Color(0xf2f4f6);
 for(let i=0;i<p.count;i++){const y=p.getY(i),z=p.getZ(i),wl=-0.62+0.55*smooth(1,8.5,z),c=y<wl?cB:y<wl+0.16?cR:cW;col.set([c.r,c.g,c.b],i*3);}
 g.setAttribute('color',new THREE.BufferAttribute(col,3));return g;}
function seaPanel(a,b,ca,cb,ta,tb){   // Flügel-/Leitwerksplatte: a,b = Vorderkante innen/außen
 const P=[[a.x,a.y+ta*0.6,a.z],[a.x,a.y+ta*0.25,a.z+ca],[a.x,a.y-ta*0.4,a.z+ca*0.1],[a.x,a.y-ta*0.15,a.z+ca],
          [b.x,b.y+tb*0.6,b.z],[b.x,b.y+tb*0.25,b.z+cb],[b.x,b.y-tb*0.4,b.z+cb*0.1],[b.x,b.y-tb*0.15,b.z+cb]];
 const F=[[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3],[0,1,3,2],[4,6,7,5]],V=[];
 for(const f of F){const q=f.map(k=>P[k]);V.push(...q[0],...q[1],...q[2],...q[0],...q[2],...q[3]);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(V,3));g.computeVertexNormals();
 // Ausrichtung prüfen: Normalen sollen nach außen zeigen -> notfalls Dreiecke umdrehen
 const n=g.attributes.normal;if(n.getY(0)<0&&a.x>=0||n.getY(0)<0&&a.x<0){const pa=g.attributes.position.array;for(let i=0;i<pa.length;i+=9)for(let k=0;k<3;k++){const t=pa[i+3+k];pa[i+3+k]=pa[i+6+k];pa[i+6+k]=t;}g.computeVertexNormals();}
 return g;}
function buildSeaplane(){const m=base(),g=m.group;
 // Lackierung: Navy-Blaugrau oben, hellgrau unten, gelbe Nase
 const B=new THREE.MeshStandardMaterial({color:0x2c4a6e,roughness:0.42,metalness:0.35}),L=M(0xc9ced4,0.45,0.3),Y=M(0xf2c018,0.4,0.2),D=M(0x1d1f22,0.6,0.4),St=M(0x8d939a,0.35,0.7),Rd=M(0xc4202c,0.4,0.15),Wt=M(0xf2f4f6,0.4,0.1);
 const glass=new THREE.MeshStandardMaterial({color:0x9fc3d6,roughness:0.05,metalness:0.2,transparent:true,opacity:0.35,depthWrite:false,side:THREE.DoubleSide});
 // Rumpf als Drehkörper (rund wie bei alten Jägern): Profil Radius über Länge
 const prof=[[0.0,-4.25],[0.36,-4.2],[0.56,-3.95],[0.64,-3.4],[0.66,-2.2],[0.64,-1.0],[0.6,0.2],[0.5,1.6],[0.36,3.0],[0.22,4.2],[0.1,4.75],[0,4.8]];
 const lg=new THREE.LatheGeometry(prof.map(([r,z])=>new THREE.Vector2(r,z)),28);lg.rotateX(Math.PI/2);lg.scale(1,1.08,1);
 mk(g,lg,B).receiveShadow=true;
 const belly=new THREE.LatheGeometry(prof.map(([r,z])=>new THREE.Vector2(r*1.004,z)),28,Math.PI*0.5,Math.PI);belly.rotateX(Math.PI/2);belly.scale(1,1.08,1);mk(g,belly,L);   // helle Unterseite
 mk(g,cylZ(0.665,0.665,0.35,28),Y,0,0,-3.75);   // gelber Motorring
 for(const s of [-1,1])for(let k=0;k<5;k++)mk(g,new THREE.BoxGeometry(0.12,0.1,0.22),D,s*0.62,0.22,-3.2+k*0.32,0,0,s*0.3);   // Auspuffstutzen
 // Kühler-Hutze unter dem Rumpf (P-51-Stil)
 mk(g,cylZ(0.28,0.36,2.2,16),L,0,-0.62,0.6).scale.set(1.2,0.75,1);mk(g,cylZ(0.25,0.25,0.05,16),D,0,-0.62,-0.52).scale.set(1.2,0.75,1);
 // Blasenhaube + Rahmen
 const can=mk(g,new THREE.SphereGeometry(1,26,14,0,Math.PI*2,0,Math.PI/2),glass,0,0.6,-0.55);can.scale.set(0.46,0.5,1.25);can.castShadow=false;
 mk(g,new THREE.TorusGeometry(0.46,0.03,6,24,Math.PI),D,0,0.6,-0.95,0,0,0).scale.set(1,1.08,1);mk(g,new THREE.BoxGeometry(0.05,0.05,2.3),D,0,1.1,-0.55);
 mk(g,new THREE.BoxGeometry(0.5,0.4,0.05),D,0,0.75,0.2);   // Kopfstütze/Panzerplatte
 // Elliptische Flügel (Spitfire-artig), leichte V-Stellung
 const ell=(a,b,n=40)=>{const sh=new THREE.Shape();for(let k=0;k<=n;k++){const t=Math.PI*k/n,x=Math.cos(t)*a,z=Math.sin(t)*b*(Math.cos(t)>0?1:1);k?sh.lineTo(x,z):sh.moveTo(x,z);}
  for(let k=n;k>=0;k--){const t=Math.PI*k/n;sh.lineTo(Math.cos(t)*a,-Math.sin(t)*b*0.62);}return sh;};
 for(const s of [-1,1]){const sh=new THREE.Shape();const a=5.7,b=1.3,n=36;for(let k=0;k<=n;k++){const t=k/n*Math.PI/2,x=Math.sin(t)*a,z=-Math.cos(t)*b;k?sh.lineTo(x,z):sh.moveTo(x,z);}
  for(let k=n;k>=0;k--){const t=k/n*Math.PI/2,x=Math.sin(t)*a,z=Math.cos(t)*b*0.75;sh.lineTo(x,z);}
  const wg=new THREE.ExtrudeGeometry(sh,{depth:0.16,bevelEnabled:true,bevelThickness:0.05,bevelSize:0.05,bevelSegments:2,curveSegments:8});wg.rotateX(Math.PI/2);wg.translate(0,0.08,0);if(s<0)wg.scale(-1,1,1);
  const w=mk(g,wg,B,0,-0.38,-0.35,0,0,s*0.07);w.receiveShadow=true;
  // Unterseite hell: dünne Kopie leicht darunter
  const wu=mk(g,wg,L,0,-0.4,-0.35,0,0,s*0.07);wu.scale.set(0.995,0.4,0.995);
  for(const gx of [2.0,2.4])mk(g,cylZ(0.035,0.035,0.7,8),D,s*gx,-0.3+gx*0.07,-1.85);   // Flügelkanonen
  const rr=new THREE.Group();rr.position.set(s*3.6,-0.13+0.25,-0.4);g.add(rr);mk(rr,new THREE.CylinderGeometry(0.42,0.42,0.02,24),Wt,0,0,0);mk(rr,new THREE.CylinderGeometry(0.22,0.22,0.03,20),Rd,0,0,0);rr.rotation.z=s*0.07;   // Kokarde
 }
 // Leitwerk: elliptisches Höhenleitwerk + Seitenflosse
 for(const s of [-1,1]){const sh=new THREE.Shape();const a=2.0,b=0.62,n=24;for(let k=0;k<=n;k++){const t=k/n*Math.PI/2;k?sh.lineTo(Math.sin(t)*a,-Math.cos(t)*b):sh.moveTo(0,-b);}for(let k=n;k>=0;k--){const t=k/n*Math.PI/2;sh.lineTo(Math.sin(t)*a,Math.cos(t)*b*0.8);}
  const hg=new THREE.ExtrudeGeometry(sh,{depth:0.08,bevelEnabled:true,bevelThickness:0.03,bevelSize:0.03,bevelSegments:1});hg.rotateX(Math.PI/2);if(s<0)hg.scale(-1,1,1);mk(g,hg,B,0,0.12,4.0);}
 mk(g,fin([[3.4,0.3],[4.85,0.3],[4.7,1.65],[4.25,1.75],[3.85,1.3]],0.12),B);mk(g,fin([[4.35,1.2],[4.78,1.2],[4.7,1.65],[4.28,1.74]],0.13),Y);
 // Propeller (4 Blätter) + Spinner – dreht umso schneller, je schneller man fliegt
 mk(g,coneZ(0.36,0.8,20),Y,0,0,-4.6);
 const pr=new THREE.Group();pr.position.set(0,0,-4.25);g.add(pr);m.props=[pr];
 for(let k=0;k<4;k++){const bl=mk(pr,new THREE.BoxGeometry(0.24,1.65,0.07),D,0,0,0,0,0,k*Math.PI/2);bl.translateY(0.95);bl.rotation.y=0.32;mk(bl,new THREE.BoxGeometry(0.25,0.18,0.075),Y,0,0.78,0);}
 const disc=new THREE.Mesh(new THREE.CircleGeometry(1.85,36),new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:0.15,side:THREE.DoubleSide,depthWrite:false}));disc.position.set(0,0,-4.22);disc.castShadow=false;g.add(disc);m.discs=[disc];
 // Bugradfahrwerk (Räder), wird beim Einfahren gegen Schwimmer getauscht
 gearLeg(m,0,-0.5,-2.6,1.16,0.26,0.07,'x',1);
 // Hauptfahrwerk: Federbein sitzt IM Flügel (innerhalb der Profiltiefe) und läuft schräg nach hinten zum Rad
 const seaLeg=(x,yT,zT,yW,zW,wr,th,sign)=>{const piv=new THREE.Group();piv.position.set(x,yT,zT);g.add(piv);const d=V3(0,yW-yT,zW-zT),len=d.length();
  const st=mk(piv,new THREE.CylinderGeometry(th,th*1.15,len,10),St,0,d.y/2,d.z/2);st.quaternion.setFromUnitVectors(V3(0,-1,0),d.clone().normalize());
  mk(piv,new THREE.CylinderGeometry(th*1.8,th*1.8,0.16,10),D,0,0,0);                                   // Lagerbock im Flügel
  const ax=new THREE.CylinderGeometry(th*0.8,th*0.8,wr*0.9,8);ax.rotateZ(Math.PI/2);mk(piv,ax,St,-sign*wr*0.3,d.y,d.z);   // Achse
  const w=new THREE.CylinderGeometry(wr,wr,wr*0.7,18);w.rotateZ(Math.PI/2);mk(piv,w,M(0x141414,0.9,0),0,d.y,d.z);
  const hub=new THREE.CylinderGeometry(wr*0.45,wr*0.45,wr*0.72,12);hub.rotateZ(Math.PI/2);mk(piv,hub,St,0,d.y,d.z);
  m.legs.push({piv,axis:'z',sign});m.gearPts.push(V3(x,yW-wr,zW));};
 seaLeg(-1.7,-0.3,0.22,-1.6,0.6,0.34,0.08,-1);seaLeg(1.7,-0.3,0.22,-1.6,0.6,0.34,0.08,1);
 // Schwimmer ("Wasserskier"): stromlinienförmig, mit Kiel, Stufe und hochgezogenem Bug; werden an Streben vom Flügel herabgelassen
 const fl=new THREE.Group();g.add(fl);m.floats=fl;fl.visible=false;const PX=1.85,PY=-1.5;
 const fb=new THREE.Group();fl.add(fb);m.floatBody=fb;const fs=new THREE.Group();fs.position.y=-0.3;fl.add(fs);m.floatStruts=fs;m.fdiag=[];
 const fprof=[[0,-2.55],[0.12,-2.5],[0.24,-2.32],[0.33,-2.0],[0.38,-1.4],[0.39,-0.4],[0.37,0.5],[0.31,1.3],[0.22,1.85],[0.1,2.2],[0,2.3]];
 const fg=new THREE.LatheGeometry(fprof.map(([r,z])=>new THREE.Vector2(r,z)),24);fg.rotateX(Math.PI/2);
 {const pa=fg.attributes.position,col=new Float32Array(pa.count*3),cW=new THREE.Color(0xf2f4f6),cB=new THREE.Color(0x2c4a6e),cR=new THREE.Color(0xc4202c);
  for(let k=0;k<pa.count;k++){let x=pa.getX(k),y=pa.getY(k)*0.78,z=pa.getZ(k);if(y<0)x*=1-0.25*Math.min(1,-y/0.3);   // leicht V-förmiger Boden
   if(z<-1.4)y+=Math.pow(-z-1.4,2)*0.16;                                                                                // hochgezogener Bug
   pa.setXYZ(k,x,y,z);const c=y<-0.04?cB:y<0.04?cR:cW;col.set([c.r,c.g,c.b],k*3);}
  fg.setAttribute('color',new THREE.BufferAttribute(col,3));fg.computeVertexNormals();}
 const fM=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.35,metalness:0.2});
 for(const s of [-1,1]){mk(fb,fg,fM,s*PX,PY,-0.4).receiveShadow=true;
  mk(fb,new THREE.BoxGeometry(0.05,0.12,3.6),M(0x1d1f22,0.6,0.4),s*PX,PY-0.33,-0.5);                 // Kiel
  mk(fb,new THREE.BoxGeometry(0.62,0.06,0.06),M(0x1d1f22,0.6,0.4),s*PX,PY-0.22,0.35);                // Stufe
  mk(fb,new THREE.BoxGeometry(0.04,0.18,0.5),St,s*PX,PY-0.08,2.0);                                    // Wasserruder
  for(const z of [-1.05,0.3]){const st=new THREE.BoxGeometry(0.09,0.9,0.22);st.translate(0,-0.45,0);mk(fs,st,St,s*PX,0,z);   // Streben vom Flügel (wachsen nach unten)
   const dg=mk(fl,new THREE.CylinderGeometry(0.035,0.035,1,8),St,0,0,0);m.fdiag.push({o:dg,t:V3(s*0.42,-0.52,z),b:V3(s*(PX-0.28),PY+0.2,z)});}}   // Schrägstreben zum Rumpf
 mk(fb,new THREE.BoxGeometry(PX*2,0.07,0.16),St,0,PY+0.32,-0.3);mk(fb,new THREE.BoxGeometry(PX*2,0.07,0.16),St,0,PY+0.32,0.55);   // Querverbinder
 m.floatK=0;
 m.tips=[V3(-5.65,-0.05,-0.2),V3(5.65,-0.05,-0.2)];
 m.crashPts=[V3(0,0,-4.7),V3(-5.6,-0.1,-0.3),V3(5.6,-0.1,-0.3),V3(0,0.2,4.8),V3(-PX,-1.5,-3.6),V3(PX,-1.5,-3.6)];
 m.belly=V3(0,-0.7,0);m.hard=[V3(-2.8,-0.55,-0.4),V3(2.8,-0.55,-0.4)];
 const panel=V3(0,0.42,-1.45),r=finish(m,{eye:V3(0,0.85,-0.45),panel,pw:0.62,ph:0.2,camD:14,camH:3.4,shadowR:10,nav:0.07,tail:V3(0,0.25,4.85)});
 r.bellyPts=[];for(const s of [-1,1])r.bellyPts.push(V3(s*PX,-1.82,-2.3),V3(s*PX,-1.84,-0.05),V3(s*PX,-1.65,1.6));   // Kiele der Schwimmer
 return r;}
TYPES.seaplane={...TYPES.f15,name:'Sky Hornet P-7 (Propeller-Jäger, Räder ⇄ Schwimmer)',build:buildSeaplane,sea:true,
 m:4300,S:22,prop:true,T:24000,vT:90,pw:3.3e6,ab:0,ram:0,cl0:0.15,cla:5.0,clf:0.6,aStall:0.28,cd0:0.019,k:0.06,cdf:0.05,cdg:0.025,cdsb:0.04,mcrit:0.74,wave:4,waveCap:0.3,mmax:0.82,
 I:[2.6e4,3.6e4,1.3e4],gLim:8,maxSink:3.8,gearFixed:false,torque:0,mu:0.45,vApp:62,thrApp:0.35,flApp:2,spool:1.3,
 c:2.0,b:11.3,Cma:-0.5,Cmq:-12,Cmde:1.1,Clda:0.15,Clp:-0.4,Clb:-0.06,Cndr:0.08,Cnr:-0.2,Cnb:0.09,Cnda:0,cyb:0.6,deMax:0.4,daMax:0.35,drMax:0.35,steer:0.5,fbw:true,qMax:0.6,pMax:2.6,atrim:0.03,ptq:0,pfac:0};
TYPES.seaplane.cm0=-TYPES.seaplane.Cma*TYPES.seaplane.atrim;
ORDER.push('seaplane');
function seaFloatPose(m,k){if(!m.floats)return;m.floatK=k;m.floats.visible=k>0.02;if(!m.floats.visible)return;const off=(1-k)*0.9;m.floatBody.position.y=off;m.floatStruts.scale.y=Math.max(k,0.001);
 for(const f of m.fdiag||[]){_fb.copy(f.b);_fb.y+=off;_fc.subVectors(_fb,f.t);const L=_fc.length();f.o.position.copy(f.t).addScaledVector(_fc,0.5);f.o.quaternion.setFromUnitVectors(_fu.set(0,1,0),_fc.divideScalar(L));f.o.scale.set(1,L,1);}}
function seaTick(dt){const A=ac,m=A.model;if(!m.props)return;const sp=A.crashed?0:6+Math.min(A.vel.length(),260)*0.55+A.thr*18;for(const p of m.props){p.rotation.z+=sp*dt;p.visible=sp<=24||camMode!==0;}for(const d of m.discs)d.visible=sp>24;seaFloatPose(m,1-A.gearAnim);}

/* =====================================================================
   B-2 SPIRIT: Nurflügel-Tarnkappenbomber, 4 × B61-Atombomben, keine Kanone
   Maße wie das Original: 52,4 m Spannweite, 21 m Länge, Vorderkante 33° gepfeilt,
   doppelt W-förmige Hinterkante, spitz zulaufende Flügelenden
   ===================================================================== */
const B2_LE0=-10.5,B2_SW=Math.tan(33*DEG),B2_HS=26.2;
const B2_TE=[[0,10.5],[7.6,5.6],[12.4,8.7],[19.0,4.4],[B2_HS,8.7]];   // Hinterkante (halbe Spannweite), Doppel-W
function b2TE(x){for(let i=1;i<B2_TE.length;i++){const[a,za]=B2_TE[i-1],[b,zb]=B2_TE[i];if(x<=b)return za+(zb-za)*(x-a)/(b-a);}return B2_TE[B2_TE.length-1][1];}
const b2LE=x=>B2_LE0+B2_SW*x;
const B2_EX=[3.9,8.0,0.8];   // Abgasrinne: x von–bis, Stufe bei Profiltiefe c
const B2_WIN=[[0.05,0.78,0.066,0.132],[0.86,1.6,0.08,0.148]];   // Cockpitscheiben (Spannweite x, Profiltiefe c)
const b2Bump=(v,a,b)=>v<=a||v>=b?0:Math.sin((v-a)/(b-a)*Math.PI)**2;
function b2Thick(x){return x<4?3.0-0.12*x:Math.max(0.22,2.52*Math.pow(Math.max(0,1-(x-4)/22.2),1.15)+0.22);}
function b2Foil(c){return c<0.32?Math.sin(c/0.32*Math.PI/2):Math.cos((c-0.32)/0.68*Math.PI/2);}
function b2Surf(x,c,top){const t=b2Thick(x),f=Math.max(0,b2Foil(c));let y=top?t*0.7*Math.pow(f,0.75):-t*0.3*Math.pow(f,0.9);
 if(top){y+=1.05*b2Bump(x,-2.6,2.6)*b2Bump(c,0.03,0.62);   // Cockpit-Buckel
  y+=0.62*b2Bump(x,3.2,8.6)*b2Bump(c,0.16,0.9);}           // Triebwerksbuckel
 else y-=0.35*b2Bump(x,-5.5,5.5)*b2Bump(c,0.15,0.85);       // Bombenschacht-Bauch
 if(top&&x>=B2_EX[0]&&x<=B2_EX[1]&&c>=B2_EX[2]){const bot=b2Surf(x,c,false);y=Math.max(y-0.42,bot+0.05);}   // Abgas-Stufe
 return y;}
function b2Grid(xs,cs,fn,flip){const P=[],I=[],nx=xs.length,nc=cs.length;
 for(const x of xs)for(const c of cs){const v=fn(x,c);P.push(v[0],v[1],v[2]);}
 for(let i=0;i<nx-1;i++)for(let j=0;j<nc-1;j++){const a=i*nc+j,b=a+1,d=a+nc,e=d+1;if(flip)I.push(a,d,b,b,d,e);else I.push(a,b,d,b,e,d);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setIndex(I);g.computeVertexNormals();return g;}
function buildB2(){const m=base(),g=m.group;
 const skin=new THREE.MeshStandardMaterial({color:0x3f444b,roughness:0.62,metalness:0.28}),dark=M(0x1b1d21,0.5,0.4),glass=new THREE.MeshStandardMaterial({color:0x0d1a24,roughness:0.05,metalness:0.95,emissive:0x061722,emissiveIntensity:0.5});
 // Spannweiten-Stationen inkl. aller Knickpunkte der Hinterkante (scharfe Zacken)
 const xs=new Set();for(let i=0;i<=56;i++)xs.add(+(B2_HS*(1-Math.cos(i/56*Math.PI/2))).toFixed(3));for(const[p] of B2_TE)xs.add(p);
 for(const p of [-2.6,2.6,3.2,8.6,B2_EX[0]-0.002,B2_EX[0],B2_EX[1],B2_EX[1]+0.002])if(p>0)xs.add(p);const XS=[...xs].sort((a,b)=>a-b);
 const CS=[];for(let j=0;j<=44;j++)CS.push(0.5-0.5*Math.cos(j/44*Math.PI));CS.push(B2_EX[2]-0.0015,B2_EX[2]);CS.sort((a,b)=>a-b);
 const pt=(x,c,top,side,lift=0)=>{const zl=b2LE(x),zt=b2TE(x),z=zl+(zt-zl)*c;return[side*x,b2Surf(x,c,top)+lift,z];};
 for(const side of [1,-1])for(const top of [true,false]){const flip=(side>0)!==top;mk(g,b2Grid(XS,CS,(x,c)=>pt(x,c,top,side),flip),skin).receiveShadow=true;}
 // Flügelspitze schließen (schmale Kante)
 // Cockpitscheiben (4 Scheiben, schräg), Lufteinläufe mit Zackenlippe, Abgasschächte oben
 const patch=(x0,x1,c0,c1,lift,mat,side)=>{const xs2=[],cs2=[];for(let i=0;i<=6;i++)xs2.push(x0+(x1-x0)*i/6);for(let j=0;j<=6;j++)cs2.push(c0+(c1-c0)*j/6);
  return mk(g,b2Grid(xs2,cs2,(x,c)=>pt(x,c,true,side,lift),side<0),mat);};
 for(const side of [1,-1]){
  for(const w of B2_WIN)patch(w[0],w[1],w[2],w[3],0.025,glass,side);
  patch(4.3,7.6,0.255,0.33,0.03,dark,side);                          // Lufteinlauf
  for(let k=0;k<4;k++)patch(4.3+k*0.82,4.3+k*0.82+0.41,0.235,0.258,0.03,dark,side);   // Sägezahn-Lippe
  patch(B2_EX[0],B2_EX[1],B2_EX[2]+0.002,0.97,0.015,dark,side);                     // Rinnenboden
  {const xs2=[B2_EX[0],B2_EX[1]],cs2=[B2_EX[2]-0.0015,B2_EX[2]];mk(g,b2Grid(xs2,cs2,(x,c)=>pt(x,c,true,side,0.004),side<0),dark);}   // senkrechte Stufe
  // eckige Düsenflamme am Ende der Rinne (wird bei Schub/Nachbrenner sichtbar)
  {const xm=(B2_EX[0]+B2_EX[1])/2,P=pt(xm,0.985,true,side,0.12),fl=new THREE.Group();fl.position.set(P[0],P[1],P[2]);g.add(fl);
   // 3D-Flamme: mehrere ineinanderliegende Volumen (flach-oval wie die Düse) + Schockringe
   const mkF=(r0,r1,L,sx,sy,z0,op,k)=>{const fg=new THREE.CylinderGeometry(r1,r0,L,18,4,false);fg.rotateX(Math.PI/2);fg.translate(0,0,z0+L/2);fg.scale(sx,sy,1);
    const f=new THREE.Mesh(fg,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthWrite:false}));f.castShadow=false;f.renderOrder=3;f.userData.k=k;fl.add(f);m.ab.push(f);};
   mkF(1,0.25,6.2,1.75,0.62,0,0.32,0);mkF(0.8,0.2,4.4,1.6,0.55,0,0.45,0);mkF(0.55,0.1,2.8,1.45,0.5,0,0.9,1);
   for(let k=0;k<3;k++)mkF(0.32-k*0.06,0.22-k*0.05,0.5,1.5,0.6,1.1+k*1.25,0.85,2);}
  // Bombenschacht-Klappen-Linien unten
 }
 // Fahrwerk (einziehbar): Bugfahrwerk + 2 Hauptfahrwerke
 gearLeg(m,0,-1.0,-5.2,2.3,0.45,0.13,'x',1);gearLeg(m,-4.7,-1.0,1.6,2.2,0.62,0.18,'z',1);gearLeg(m,4.7,-1.0,1.6,2.2,0.62,0.18,'z',-1);
 m.tips=[V3(-B2_HS+0.3,0.15,8.3),V3(B2_HS-0.3,0.15,8.3)];
 m.crashPts=[V3(0,0.3,-10.4),V3(-B2_HS+0.4,0.1,8.0),V3(B2_HS-0.4,0.1,8.0),V3(0,-1.1,2)];
 m.belly=V3(0,-1.2,0);m.hard=[V3(0,-1.4,-1)];m.extraBelly=[V3(-6,-0.6,3),V3(6,-0.6,3)];
 // ---- Cockpit von innen: Rahmen mit den 4 echten Scheiben-Ausschnitten, Glareshield, 8 Displays, Stick, Mittelkonsole ----
 const EYE=V3(-0.7,1.42,-6.25),D=0.85,cock=new THREE.Group();g.add(cock);cock.visible=false;m.cock=cock;
 const outer=new THREE.Shape([[-6,-3],[6,-3],[6,3],[-6,3]].map(q=>new THREE.Vector2(q[0],q[1])));
 for(const side of [1,-1])for(const w of B2_WIN){const pts=[[w[0],w[2]],[w[1],w[2]],[w[1],w[3]],[w[0],w[3]]].map(([x,c])=>{const P=pt(x,c,true,side),dx=P[0]-EYE.x,dy=P[1]-EYE.y,dz=P[2]-EYE.z,k=D/Math.max(-dz,0.05);return new THREE.Vector2(dx*k,dy*k);});outer.holes.push(new THREE.Path(pts));}
 const frameM=new THREE.MeshStandardMaterial({color:0x2a2d32,roughness:0.85,metalness:0.2,side:THREE.DoubleSide});
 const fr=mk(cock,new THREE.ShapeGeometry(outer),frameM,EYE.x,EYE.y,EYE.z-D);fr.castShadow=false;
 const coam=mk(cock,new THREE.BoxGeometry(2.6,0.07,0.32),M(0x18191c,0.9,0.1),0,EYE.y-0.17,EYE.z-0.68);coam.castShadow=false;
 const scrM=(t)=>new THREE.MeshBasicMaterial({map:t,color:new THREE.Color(1.6,1.6,1.6)});
 for(const sx of [-0.7,0.7]){const pnl=mk(cock,new THREE.BoxGeometry(1.0,0.34,0.05),M(0x1c1e22,0.8,0.2),sx,EYE.y-0.34,EYE.z-0.6,-0.3,0,0);pnl.castShadow=false;
  for(let k=0;k<4;k++){const sc=new THREE.Mesh(new THREE.PlaneGeometry(0.2,0.15),scrM(k%2?ndTex:pfdTex));sc.position.set(-0.36+k*0.24,0,0.03);pnl.add(sc);}}
 {const cv=document.createElement('canvas');cv.width=256;cv.height=96;const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;
  const lamp=new THREE.Mesh(new THREE.PlaneGeometry(0.27,0.1),new THREE.MeshBasicMaterial({map:tx}));lamp.position.set(EYE.x-0.24,EYE.y-0.085,EYE.z-0.575);lamp.scale.setScalar(0.85);lamp.rotation.x=-0.45;cock.add(lamp);lamp.userData={ctx:cv.getContext('2d'),st:''};m.safeLamp=lamp;}
 {const cv=document.createElement('canvas');cv.width=768;cv.height=128;const x=cv.getContext('2d');   // Messingschild (Schrift passt sich der Breite an)
  const gr=x.createLinearGradient(0,0,768,128);gr.addColorStop(0,'#b8913a');gr.addColorStop(0.5,'#efd585');gr.addColorStop(1,'#a07a2c');x.fillStyle=gr;x.fillRect(0,0,768,128);
  x.strokeStyle='#5a4214';x.lineWidth=7;x.strokeRect(9,9,750,110);for(const [px,py] of [[26,26],[742,26],[26,102],[742,102]]){x.fillStyle='#6b5018';x.beginPath();x.arc(px,py,7,0,7);x.fill();}
  const T='Aus Williams Garage geklaut';let fs=60;x.font=`italic 800 ${fs}px Georgia,'Times New Roman',serif`;const mw=x.measureText(T).width;if(mw>640){fs=Math.floor(fs*640/mw);x.font=`italic 800 ${fs}px Georgia,'Times New Roman',serif`;}
  x.fillStyle='#3a2a08';x.textAlign='center';x.textBaseline='middle';x.fillText(T,384,66);
  const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=8;
  const pl=new THREE.Mesh(new THREE.PlaneGeometry(0.44,0.074),new THREE.MeshBasicMaterial({map:tx,toneMapped:false}));   // unbeleuchtet -> auf jeder Grafikstufe gleich hell
  pl.position.set(EYE.x+0.15,EYE.y-0.085,EYE.z-0.575);pl.rotation.x=-0.45;pl.renderOrder=2;cock.add(pl);}
 const con=mk(cock,new THREE.BoxGeometry(0.34,0.28,0.75),M(0x222428,0.8,0.2),0,EYE.y-0.62,EYE.z-0.25);con.castShadow=false;
 for(let k=0;k<4;k++)mk(cock,new THREE.BoxGeometry(0.035,0.14,0.035),M(0x9aa0a6,0.4,0.6),-0.09+k*0.06,EYE.y-0.44,EYE.z-0.3,-0.3,0,0).castShadow=false;
 for(const sx of [-0.7,0.7]){const st=mk(cock,new THREE.CylinderGeometry(0.018,0.025,0.42,10),M(0x151515,0.7,0.3),sx,EYE.y-0.7,EYE.z-0.33,-0.25,0,0);st.castShadow=false;mk(st,new THREE.BoxGeometry(0.05,0.1,0.05),M(0x151515,0.7,0.3),0,0.22,0).castShadow=false;}
 const panel=V3(0,EYE.y-0.9,EYE.z+0.5),r=finish(m,{eye:EYE,panel,pw:0.2,ph:0.06,camD:78,camH:15,shadowR:42,nav:0.18,tail:V3(0,0.4,10.3)});
 r.group.children.forEach(c=>{if(c.isGroup&&c.position.equals(panel))c.visible=false;});
 return r;}
TYPES.b2={...TYPES.b747,name:'B-2 Spirit (Tarnkappenbomber, 4× B61)',build:buildB2,b2:true,
 m:125000,S:478,T:470000,ab:1.25,ram:0,cl0:0.05,cla:4.2,clf:0.15,aStall:0.3,cd0:0.0072,k:0.062,cdf:0.02,cdg:0.02,cdsb:0.05,mcrit:0.88,wave:1.2,waveCap:0.3,mmax:1.0,
 c:12,b:52.4,spool:0.65,I:[7e6,2.4e7,1.7e7],gLim:2.6,maxSink:3.5,mu:0.45,vApp:74,thrApp:0.45,flApp:0,gearFixed:false,prop:false,
 Cma:-0.35,Cmq:-14,Cmde:0.9,Clda:0.1,Clp:-0.45,Clb:-0.04,Cndr:0.035,Cnr:-0.2,Cnb:0.04,Cnda:0,cyb:0.35,deMax:0.4,daMax:0.35,drMax:0.3,steer:0.45,fbw:true,qMax:0.18,pMax:0.75,atrim:0.03};
TYPES.b2.cm0=-TYPES.b2.Cma*TYPES.b2.atrim;
ORDER.push('b2');

/* ---------- B61-Atombomben ---------- */
const NUKE_KILL=650,NUKE_DMG=1300,NUKE_N=4;mp.nk=NUKE_N;
const bombs=[],NK=[];
function bombMesh(){const g=new THREE.Group();const b=new THREE.Mesh(cylZ(0.17,0.17,3.4,14),M(0x5b5f63,0.5,0.5));g.add(b);
 const n=new THREE.Mesh(coneZ(0.17,0.5,14),M(0x5b5f63,0.5,0.5));n.position.z=-1.95;g.add(n);const y=new THREE.Mesh(cylZ(0.175,0.175,0.18,14),M(0xd8a514,0.5,0.2));y.position.z=-0.9;g.add(y);
 for(let k=0;k<4;k++){const f=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.45,0.5),M(0x3d4044,0.5,0.5));f.position.set(0,0,1.45);f.rotation.z=k*Math.PI/2;f.translateY(0.2);g.add(f);}
 scene.add(g);return g;}
function dropBomb(){const A=ac;if(A.crashed||mp.dead)return;if(mp.nk<1){flash('Keine Atombomben mehr');return;}if(A.onGround){flash('Erst abheben!');return;}
 mp.nk--;const p=_mb.set(0,-2.2,0).applyQuaternion(A.q).add(A.pos).clone();bombs.push({p,v:A.vel.clone(),t:0,mesh:bombMesh()});
 flash('☢ B61 ausgeklinkt – noch '+mp.nk);sBurst('lowpass',300,0.7,0.5,0.4);rumble(200,0.6,0.4);}
function updBombs(dt){for(let i=bombs.length-1;i>=0;i--){const b=bombs[i];b.t+=dt;b.v.y-=9.81*dt;b.v.multiplyScalar(1-0.012*dt);const p0=_ga.copy(b.p);b.p.addScaledVector(b.v,dt);
 b.mesh.position.copy(b.p);_gb.copy(b.p).add(b.v);b.mesh.lookAt(_gb);
 if(b.p.y<=Math.max(groundH(b.p.x,b.p.z),0)||cityHit(b.p)||b.t>90){scene.remove(b.mesh);bombs.splice(i,1);const P=b.p.clone();P.y=Math.max(groundH(P.x,P.z),0);
  mpSend({t:'nk',p:[r1(P.x),r1(P.y),r1(P.z)],from:mp.myId});nukeHit(P);nukeFx(P);}}}
function nukeHit(P){const A=ac;
 for(const r of mp.players.values()){if(r.dead||!r.model)continue;const d=r.pos.distanceTo(P);if(d<NUKE_DMG)addHit(r.id,Math.round(d<NUKE_KILL?220:220*(1-(d-NUKE_KILL)/(NUKE_DMG-NUKE_KILL))),'nuke',r.pos);}
 flushHits();for(let k=0;k<TANKS.length;k++){const t=TANKS[k];if(!t.dead&&t.c.distanceTo(P)<NUKE_DMG)tankHit(k,TANK_HP*3,t.c);}
 if(!A.crashed&&!mp.dead&&A.pos.distanceTo(P)<NUKE_KILL*0.85){mp.lastHit=null;mp.hp=0;mp.shot=false;A.crashed='☢ Von der eigenen Atombombe erwischt';crashFx();}}
function nukeFx(P){const d=camera.position.distanceTo(P);
 if(d<30000){const el=trollOverlay('nkFlash','',1800);el.style.background='#fff8e8';el.style.transition='none';el.style.opacity=String(clamp(1.25-d/22000,0.2,1));
  requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.transition='opacity 1.6s ease-out';el.style.opacity='0';}));}
 const mat=(c,e,o)=>new THREE.MeshStandardMaterial({color:c,emissive:e,emissiveIntensity:2,transparent:true,opacity:o,depthWrite:false,roughness:1});
 const ball=new THREE.Mesh(new THREE.IcosahedronGeometry(1,3),new THREE.MeshBasicMaterial({color:new THREE.Color(6,3.2,1.2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));ball.position.copy(P);
 const stem=new THREE.Mesh(new THREE.CylinderGeometry(0.55,1,1,24,6,true),mat(0x8d7058,0x5a1e00,0.92));
 const cap=new THREE.Group(),capM=mat(0x9a7a60,0x7a2a00,0.95);const tor=new THREE.Mesh(new THREE.TorusGeometry(1,0.6,16,40),capM);tor.rotation.x=Math.PI/2;cap.add(tor);
 const dome=new THREE.Mesh(new THREE.SphereGeometry(1.05,28,14,0,Math.PI*2,0,Math.PI/2),capM);dome.position.y=0.15;dome.scale.y=0.75;cap.add(dome);
 const ring=new THREE.Mesh(new THREE.RingGeometry(0.92,1,120).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xfff4e0,transparent:true,depthWrite:false,side:THREE.DoubleSide}));ring.position.set(P.x,P.y+3,P.z);
 for(const o of [ball,stem,cap,ring]){o.frustumCulled=false;scene.add(o);}cap.position.copy(P);stem.position.copy(P);
 NK.push({t:0,P,ball,stem,cap,ring,capM,stemM:stem.material,dust:0});
 for(let i=0;i<320;i++){const a=Math.random()*6.283,v=70+Math.random()*120;emit(P.x,P.y+4,P.z,Math.cos(a)*v,4+Math.random()*10,Math.sin(a)*v,4+Math.random()*4,30,45,0.55,0.42,0.36,0.3);}
 megaBoom(P,3);
 setTimeout(()=>{const v=cfg.vol??0.7;sBurst('lowpass',55,0.7,clamp(7000/Math.max(d,1),0.15,1)*v*1.4,7);sBurst('lowpass',180,0.7,clamp(3500/Math.max(d,1),0.05,0.9)*v,3.5);
  sBurst('bandpass',700,0.6,clamp(1500/Math.max(d,1),0.02,0.5)*v,1.2);rumble(1600,1,1);if(d<9000)ac.shake=Math.max(ac.shake||0,3*(1-d/9000));},Math.min(d/340,9)*1000);}
function nukeTick(dt){for(let i=NK.length-1;i>=0;i--){const e=NK[i];e.t+=dt;const t=e.t,P=e.P,eo=x=>1-Math.pow(1-Math.min(1,x),3);
 const h=900*eo((t-0.6)/9);   // Pilzstiel wächst
 e.ball.scale.setScalar(25+260*eo(t/1.4));e.ball.position.y=P.y+120*Math.min(t,3);e.ball.material.opacity=t<1.3?1:Math.max(0,1-(t-1.3)/3);e.ball.visible=e.ball.material.opacity>0.01;
 const sr=55+25*Math.min(t/10,1);e.stem.scale.set(sr,Math.max(h,1),sr);e.stem.position.y=P.y+h/2;
 const cr=110+230*eo(t/10);e.cap.position.y=P.y+h+cr*0.15;e.cap.scale.set(cr,cr*0.62,cr);
 const glow=Math.max(0,2.2-t*0.3);e.capM.emissiveIntensity=glow;e.stemM.emissiveIntensity=glow*0.7;
 const fade=t<20?1:Math.max(0,1-(t-20)/12);e.capM.opacity=0.95*fade;e.stemM.opacity=0.9*fade;
 e.ring.scale.setScalar(40+2600*Math.min(t/6,1));e.ring.material.opacity=Math.max(0,0.7*(1-t/6));e.ring.visible=t<6;
 if(t<9&&(e.dust+=dt)>0.12){e.dust=0;for(let k=0;k<6;k++){const a=Math.random()*6.283,r=sr*(1+Math.random());emit(P.x+Math.cos(a)*r,P.y+5,P.z+Math.sin(a)*r,Math.cos(a)*14,6+Math.random()*8,Math.sin(a)*14,6,40,50,0.45,0.4,0.34,0.28);}}
 if(t>32){for(const o of [e.ball,e.stem,e.cap,e.ring]){scene.remove(o);o.traverse(q=>{if(q.geometry)q.geometry.dispose();if(q.material)q.material.dispose();});}NK.splice(i,1);}}}
/* Aufschlagpunkt-Anzeige (CCIP) für den Bomber */
function b2Ccip(c){const A=ac;if(!A.P.b2||A.crashed||mp.dead||A.onGround||mp.nk<1)return;const p=_ga.copy(A.pos),v=_gb.copy(A.vel);
 for(let i=0;i<500;i++){v.y-=9.81*0.2;v.multiplyScalar(1-0.012*0.2);p.addScaledVector(v,0.2);if(p.y<=Math.max(groundH(p.x,p.z),0))break;}
 const s=scr(p);if(!s)return;const pul=0.6+0.4*Math.sin(performance.now()/180);c.save();c.strokeStyle=`rgba(255,80,40,${pul})`;c.lineWidth=2.5;
 c.beginPath();c.arc(s[0],s[1],16,0,7);c.stroke();c.beginPath();c.moveTo(s[0]-26,s[1]);c.lineTo(s[0]-8,s[1]);c.moveTo(s[0]+8,s[1]);c.lineTo(s[0]+26,s[1]);c.moveTo(s[0],s[1]-26);c.lineTo(s[0],s[1]-8);c.moveTo(s[0],s[1]+8);c.lineTo(s[0],s[1]+26);c.stroke();
 c.font='800 12px system-ui';c.fillStyle='#ff6a4a';c.strokeStyle='#000c';c.lineWidth=3;c.textAlign='center';txtO(c,'☢ EINSCHLAG',s[0],s[1]+38);c.restore();}


/* B-2: Anzeige „sicherer Abwurf“ – fällt die Bombe jetzt, ist man beim Einschlag weit genug weg? */
function b2SafeCalc(){const A=ac,p=_ga.copy(A.pos),v=_gb.copy(A.vel);let t=0;
 for(let i=0;i<600;i++){v.y-=9.81*0.2;v.multiplyScalar(1-0.012*0.2);p.addScaledVector(v,0.2);t+=0.2;if(p.y<=Math.max(groundH(p.x,p.z),0))break;}
 const own=_ac.copy(A.pos).addScaledVector(A.vel,t),d=own.distanceTo(p);return{ok:d>NUKE_KILL*0.85+180,d,t};}
let SAFE={ok:false,d:0,t:0,tt:0};
function b2SafeTick(dt){const A=ac;if(!A.P.b2)return;if((SAFE.tt-=dt)<=0){SAFE.tt=0.1;const r=A.onGround||A.crashed?{ok:false,d:0,t:0}:b2SafeCalc();SAFE.ok=r.ok;SAFE.d=r.d;SAFE.t=r.t;}
 const m=A.model;if(m.safeLamp&&m.safeLamp.userData.st!==SAFE.ok+'|'+(mp.nk>0)){const ok=SAFE.ok&&mp.nk>0;m.safeLamp.userData.st=SAFE.ok+'|'+(mp.nk>0);
  const x=m.safeLamp.userData.ctx;x.fillStyle=ok?'#062a10':'#2a0606';x.fillRect(0,0,256,96);x.fillStyle=ok?'#3dff7a':'#ff3b30';x.textAlign='center';x.textBaseline='middle';
  const T=ok?'SAFE':"DON'T DROP";let fs=58;x.font=`900 ${fs}px system-ui`;const mw=x.measureText(T).width;if(mw>230){fs=Math.floor(fs*230/mw);x.font=`900 ${fs}px system-ui`;}x.fillText(T,128,50);
  m.safeLamp.material.map.needsUpdate=true;m.safeLamp.material.color.setScalar(ok?1.8:1.3);}}
function b2SafeHUD(c,W,py){const A=ac;if(!A.P.b2||A.crashed||mp.dead||mp.nk<1||camMode!==0)return;const ok=SAFE.ok&&!A.onGround,pul=ok?1:0.6+0.4*Math.sin(performance.now()/150);
 c.save();c.font='900 13px system-ui';c.textAlign='center';c.textBaseline='middle';const t=ok?`☢ SICHERER ABWURF · ${(SAFE.d/1000).toFixed(1)} km Abstand`:A.onGround?'☢ AM BODEN':`☢ ZU NAH – NICHT ABWERFEN (${Math.round(SAFE.d)} m)`;
 const w=c.measureText(t).width+24,y=py>innerHeight/2?py-40:py+48;c.globalAlpha=pul;c.fillStyle=ok?'rgba(20,160,70,.85)':'rgba(190,30,25,.85)';c.beginPath();if(c.roundRect)c.roundRect(W/2-w/2,y-12,w,24,12);else c.rect(W/2-w/2,y-12,w,24);c.fill();
 if(ok){c.shadowColor='#3dff7a';c.shadowBlur=14;}c.fillStyle='#fff';c.fillText(t,W/2,y+1);c.restore();}
/* ---------- Große Karte (Taste M): Gelände, Pisten, Stadt, Panzer, alle Spieler ---------- */
let BM=null;
function toggleBigMap(force){const open=force!==undefined?force:!BM;
 if(open&&!BM){const el=document.createElement('div');el.id='bigMap';
  el.innerHTML='<canvas></canvas><div class="bmTop"><b>🗺 Karte</b><span>M / Esc schließen · ziehen = verschieben · Mausrad/Knöpfe = Zoom</span></div>'+
   '<div class="bmBtns"><button class="b" data-bm="in">＋</button><button class="b" data-bm="out">−</button><button class="b" data-bm="me">⌖ Ich</button><button class="b" data-bm="all">Ganze Karte</button><button class="b" data-bm="x">✕</button></div>'+
   '<div class="bmLeg"><span><i style="background:#ffd400"></i>Du</span><span><i style="background:#ff4b3e"></i>Spieler</span><span><i class="sq" style="background:#ff8a3d"></i>Flak-Panzer</span><span><i class="sq" style="background:#9aa3ad"></i>Stadt</span><span>☢ Atomschlag</span></div>';
  document.body.appendChild(el);BM={el,cv:el.querySelector('canvas'),span:14000,cx:ac.pos.x,cz:ac.pos.z,follow:true,drag:null};
  el.addEventListener('click',e=>{const b=e.target.closest('[data-bm]');if(!b)return;const a=b.dataset.bm;
   if(a==='in')BM.span=Math.max(1500,BM.span/1.6);else if(a==='out')BM.span=Math.min(WORLD*1.05,BM.span*1.6);else if(a==='me'){BM.follow=true;}else if(a==='all'){BM.span=WORLD*1.02;BM.follow=false;BM.cx=0;BM.cz=0;}else if(a==='x')toggleBigMap(false);});
  BM.cv.addEventListener('pointerdown',e=>{BM.drag={x:e.clientX,y:e.clientY};BM.cv.setPointerCapture(e.pointerId);});
  BM.cv.addEventListener('pointermove',e=>{if(!BM||!BM.drag)return;const k=BM.span/Math.min(innerWidth,innerHeight);BM.cx-=(e.clientX-BM.drag.x)*k;BM.cz-=(e.clientY-BM.drag.y)*k;BM.drag={x:e.clientX,y:e.clientY};BM.follow=false;});
  BM.cv.addEventListener('pointerup',()=>{if(BM)BM.drag=null;});
  BM.cv.addEventListener('wheel',e=>{e.preventDefault();BM.span=clamp(BM.span*(e.deltaY>0?1.15:1/1.15),1500,WORLD*1.05);},{passive:false});
  const loop=()=>{if(!BM)return;drawBigMap();requestAnimationFrame(loop);};loop();}
 else if(!open&&BM){BM.el.remove();BM=null;}}
addEventListener('keydown',e=>{if(!e.repeat&&(e.key||'').toLowerCase()==='z'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')&&isAdmin()){e.preventDefault();if(mp.adminOpen)closeAdmin();else openAdmin();}},true);
addEventListener('keydown',e=>{if(BM&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();toggleBigMap(false);}},true);
function drawBigMap(){const cv=BM.cv,dpr=Math.min(devicePixelRatio,2),W=innerWidth,H=innerHeight;if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);}
 const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);const A=ac;if(BM.follow){BM.cx=A.pos.x;BM.cz=A.pos.z;}
 const s=Math.min(W,H)/BM.span,X=x=>W/2+(x-BM.cx)*s,Y=z=>H/2+(z-BM.cz)*s;
 c.fillStyle='#0b2236';c.fillRect(0,0,W,H);c.imageSmoothingEnabled=true;c.drawImage(mapC,X(-WORLD/2),Y(-WORLD/2),WORLD*s,WORLD*s);
 // Raster alle 5 km
 c.strokeStyle='rgba(255,255,255,.08)';c.lineWidth=1;for(let g=-30000;g<=30000;g+=5000){c.beginPath();c.moveTo(X(g),Y(-WORLD/2));c.lineTo(X(g),Y(WORLD/2));c.moveTo(X(-WORLD/2),Y(g));c.lineTo(X(WORLD/2),Y(g));c.stroke();}
 c.textAlign='center';c.textBaseline='middle';const lab=(t,x,y,col,f)=>{c.font=f||'700 12px system-ui';c.lineWidth=3;c.strokeStyle='rgba(0,0,0,.8)';c.strokeText(t,x,y);c.fillStyle=col;c.fillText(t,x,y);};
 // Stadt
 {const x0=X(CITY.cx-CITY.hs),y0=Y(CITY.cz-CITY.hs),w=2*CITY.hs*s;c.fillStyle='rgba(150,160,175,.55)';c.fillRect(x0,y0,w,w);if(w>40){c.strokeStyle='rgba(40,44,50,.8)';c.lineWidth=Math.max(1,22*s);c.beginPath();for(let k=0;k<=CN;k++){c.moveTo(X(CX0+k*CPITCH),y0);c.lineTo(X(CX0+k*CPITCH),y0+w);c.moveTo(x0,Y(CZ0+k*CPITCH));c.lineTo(x0+w,Y(CZ0+k*CPITCH));}c.stroke();}
  lab('🏙 Stadt',X(CITY.cx),y0-12,'#dfe6ee');}
 // Pisten
 for(const r of RUNWAYS){c.save();c.translate(X(r.cx),Y(r.cz));c.rotate(r.hdg);c.fillStyle='#f2f2f2';c.fillRect(-Math.max(r.w*s,2),-r.hl*s,Math.max(2*r.w*s,4),r.len*s);c.restore();lab('✈ '+r.name,X(r.cx),Y(r.cz)-r.hl*s-12,'#fff');}
 // Flak-Panzer
 for(const t of TANKS){const x=X(t.x),y=Y(t.z);if(x<-10||y<-10||x>W+10||y>H+10)continue;if(t.dead){c.strokeStyle='#777';c.lineWidth=2;c.beginPath();c.moveTo(x-4,y-4);c.lineTo(x+4,y+4);c.moveTo(x+4,y-4);c.lineTo(x-4,y+4);c.stroke();}
  else{c.fillStyle='#ff8a3d';c.fillRect(x-4,y-4,8,8);c.strokeStyle='#000';c.lineWidth=1;c.strokeRect(x-4,y-4,8,8);}}
 // Atomschläge
 for(const e of NK){const x=X(e.P.x),y=Y(e.P.z);c.strokeStyle='rgba(255,80,40,.7)';c.lineWidth=2;c.beginPath();c.arc(x,y,NUKE_DMG*s,0,7);c.stroke();lab('☢',x,y,'#ffd400','900 20px system-ui');}
 for(const b of bombs)lab('☢',X(b.p.x),Y(b.p.z),'#ff6a4a','900 14px system-ui');
 // Spieler
 const icon=(x,y,hd,col,ty)=>{c.save();c.translate(x,y);c.rotate(hd);c.fillStyle=col;c.strokeStyle='#000';c.lineWidth=1.5;c.beginPath();
  if(TYPES[ty]?.tank){c.rect(-6,-8,12,16);c.fill();c.stroke();c.fillRect(-1.5,-15,3,9);}else{c.moveTo(0,-11);c.lineTo(8,8);c.lineTo(0,4);c.lineTo(-8,8);c.closePath();c.fill();c.stroke();}c.restore();};
 const hdg=q=>{_aa.set(0,0,-1).applyQuaternion(q);return Math.atan2(_aa.x,-_aa.z);};
 for(const r of mp.players.values()){if(r.dead||!r.model)continue;const x=X(r.pos.x),y=Y(r.pos.z);icon(x,y,r.model.isTank&&r.tkp?-r.tkp[0]:hdg(r.q),'#ff4b3e',r.ty);
  lab(`${tagS(r.id)}${r.n} · ${(TYPES[r.ty]?.name||'').split(' (')[0]}${r.model.isTank?'':' · '+Math.round(r.pos.y*3.28084/100)*100+' ft'}`,x,y-20,'#ffd0cc','700 11px system-ui');}
 if(!A.crashed){const x=X(A.pos.x),y=Y(A.pos.z),pul=1+0.25*Math.sin(performance.now()/200);c.strokeStyle='rgba(255,212,0,.6)';c.lineWidth=2;c.beginPath();c.arc(x,y,16*pul,0,7);c.stroke();
  icon(x,y,A.P.tank&&A.tank?-A.tank.yaw:hdg(A.q),'#ffd400',acType);lab('DU',x,y+24,'#ffd400','900 12px system-ui');}
 // Maßstab + Nordpfeil
 const m=BM.span>20000?10000:BM.span>6000?2000:500,px=m*s;c.fillStyle='#fff';c.fillRect(20,H-34,px,3);lab(m>=1000?m/1000+' km':m+' m',20+px/2,H-46,'#fff');
 lab('N ▲',W-40,70,'#fff','900 16px system-ui');}

/* =====================================================================
   BODENTRUPPE: Kampfpanzer „Leopard“ mit BASILISK-Wärmesuchraketen + Stadt
   ===================================================================== */
const TANK_OY=1.45;   // Rumpfmitte über dem Boden
const _tkE=new THREE.Euler(0,0,0,'YXZ'),_tkV=new THREE.Vector3(),_tkW=new THREE.Vector3();
function tkTex(w,h,fn,rep){const t=canvasTex(w,h,fn);t.wrapS=t.wrapT=THREE.RepeatWrapping;if(rep)t.repeat.set(rep[0],rep[1]);return t;}
/* NATO-Tarnmuster (3 Farben) */
function camoDraw(x,w,h){x.fillStyle='#4a5226';x.fillRect(0,0,w,h);let s=77;const r=()=>{s=(s*16807)%2147483647;return s/2147483647;};
 for(const col of ['#2f3a1d','#5d4a2e','#1d1f17'])for(let i=0;i<9;i++){x.fillStyle=col;x.beginPath();const cx=r()*w,cy=r()*h,R=w*(0.06+r()*0.1);
  for(let k=0;k<9;k++){const a=k/9*6.283,rr=R*(0.6+r()*0.8);x.lineTo(cx+Math.cos(a)*rr*1.4,cy+Math.sin(a)*rr);}x.closePath();x.fill();
  // nahtlos: Kopien an den Rändern
  for(const [ox,oy] of [[w,0],[-w,0],[0,h],[0,-h]]){x.save();x.translate(ox,oy);x.fill();x.restore();}}
 const d=x.getImageData(0,0,w,h);for(let i=0;i<d.data.length;i+=4){const n=(Math.random()-.5)*14;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n;}x.putImageData(d,0,0);}
let TKMAT=null;
function tankMats(){if(TKMAT)return TKMAT;
 const cE=tkTex(256,256,camoDraw,[0.17,0.17]),cB=tkTex(256,256,camoDraw,[1,1]);
 const tread=tkTex(32,128,(x,w,h)=>{x.fillStyle='#1c1c1a';x.fillRect(0,0,w,h);for(let y=0;y<h;y+=16){x.fillStyle='#3a3a36';x.fillRect(0,y,w,6);x.fillStyle='#55554e';x.fillRect(3,y+1,w-6,2);}},[1,14]);
 TKMAT={ext:new THREE.MeshStandardMaterial({map:cE,roughness:0.78,metalness:0.18}),box:new THREE.MeshStandardMaterial({map:cB,roughness:0.78,metalness:0.18}),
  dark:M(0x24261f,0.7,0.45),steel:M(0x3b3d38,0.5,0.6),rub:M(0x161616,0.92,0.02),tread:new THREE.MeshStandardMaterial({map:tread,roughness:0.9,metalness:0.3}),
  glass:new THREE.MeshStandardMaterial({color:0x1d3a48,roughness:0.05,metalness:0.9,emissive:0x0a2a3a,emissiveIntensity:0.6}),
  red:M(0x8a1414,0.5,0.2),yel:M(0xd8a514,0.5,0.2),tarp:M(0x5b5638,0.95,0),lamp:new THREE.MeshStandardMaterial({color:0xfff2cc,emissive:0xfff2cc,emissiveIntensity:0.4}),
  tail:new THREE.MeshStandardMaterial({color:0x550000,emissive:0xff1a00,emissiveIntensity:0.6})};
 return TKMAT;}
function buildTank(){const m=base(),g=m.group,K=tankMats(),Y0=-TANK_OY;m.isTank=true;m.wheels=[];
 const hull=new THREE.Group();g.add(hull);m.hull=hull;
 // Wanne (Seitenprofil extrudiert): flache obere Frontplatte, steile untere Platte
 mk(hull,fin([[3.7,-0.95],[3.95,-0.25],[3.85,0.15],[-2.3,0.15],[-3.9,-0.3],[-3.55,-0.95]],3.3),K.ext);
 mk(hull,new THREE.BoxGeometry(3.3,0.1,2.9),K.box,0,0.2,2.3);   // Motordeck
 for(let i=0;i<6;i++)mk(hull,new THREE.BoxGeometry(1.2,0.04,0.08),K.dark,(i<3?-0.75:0.75),0.27,1.4+(i%3)*0.55+0.1);   // Lüftungsgitter
 mk(hull,new THREE.BoxGeometry(2.6,0.32,0.18),K.dark,0,-0.15,3.92);   // Heckauspuff
 for(const s of [-1,1]){
  mk(hull,new THREE.BoxGeometry(0.34,0.08,7.9),K.box,s*1.82,0.16,0);   // Kettenabdeckung
  for(let i=0;i<6;i++){const z=-3.45+i*1.17;mk(hull,new THREE.BoxGeometry(0.07,0.78,1.12),i<2?K.ext:K.box,s*1.97,-0.24,z+0.56,0,0,s*0.04);}   // Seitenschürzen (Segmente)
  // Kette: untere/obere Bahn + Umlenkungen
  m.trk=m.trk||[];const tb=mk(hull,new THREE.BoxGeometry(0.64,0.12,6.7),K.tread,s*1.66,Y0+0.06,0);m.trk.push(tb);
  mk(hull,new THREE.BoxGeometry(0.64,0.1,6.2),K.tread,s*1.66,-0.12,0);
  const wh=(r,w,z,y,mat)=>{const gg=new THREE.CylinderGeometry(r,r,w,20);gg.rotateZ(Math.PI/2);const o=mk(hull,gg,mat,s*1.66,y,z);m.wheels.push({o,r});
   const hub=new THREE.CylinderGeometry(r*0.45,r*0.45,w+0.04,12);hub.rotateZ(Math.PI/2);mk(o,hub,K.steel);for(let k=0;k<5;k++){const b=mk(o,new THREE.BoxGeometry(w+0.06,0.05,r*0.12),K.dark,0,0,0,k*1.2566,0,0);b.position.set(0,Math.sin(k*1.2566)*r*0.65,Math.cos(k*1.2566)*r*0.65);}return o;};
  for(let i=0;i<7;i++)wh(0.42,0.5,-2.62+i*0.88,Y0+0.45,K.rub);
  wh(0.46,0.56,3.38,-0.72,K.steel);wh(0.4,0.52,-3.42,-0.78,K.steel);   // Antriebsrad hinten, Leitrad vorn
  for(const z of [-1.6,0,1.6]){const gg=new THREE.CylinderGeometry(0.13,0.13,0.4,10);gg.rotateZ(Math.PI/2);mk(hull,gg,K.steel,s*1.66,-0.03,z);}
  mk(hull,new THREE.BoxGeometry(0.28,0.14,0.08),K.lamp,s*1.2,0.12,-3.6);   // Scheinwerfer
  mk(hull,new THREE.BoxGeometry(0.22,0.1,0.06),K.tail,s*1.3,0.0,3.96);
  mk(hull,new THREE.BoxGeometry(0.18,0.12,0.3),K.dark,s*0.9,-0.55,-3.75);}   // Abschlepphaken
 mk(hull,new THREE.CylinderGeometry(0.34,0.34,0.08,16),K.box,-0.75,0.03,-2.2,-0.25,0,0);   // Fahrerluke
 for(let i=0;i<3;i++)mk(hull,new THREE.BoxGeometry(0.16,0.08,0.1),K.glass,-1.0+i*0.25,0.06,-2.55,-0.25,0,0);
 // ---- Turm ----
 const tur=new THREE.Group();tur.position.set(0,0.17,0.35);hull.add(tur);m.turret=tur;
 const ts=new THREE.Shape([[-1.55,-2.3],[1.55,-2.3],[1.78,-0.4],[1.78,1.2],[0.58,2.45],[-0.58,2.45],[-1.78,1.2],[-1.78,-0.4]].map(p=>new THREE.Vector2(p[0],p[1])));
 const tg=new THREE.ExtrudeGeometry(ts,{depth:0.86,bevelEnabled:true,bevelSize:0.07,bevelThickness:0.07,bevelSegments:2});tg.rotateX(-Math.PI/2);tg.translate(0,0.07,0);
 mk(tur,tg,K.ext);
 mk(tur,new THREE.BoxGeometry(2.6,0.06,0.9),K.box,0,0.98,1.5);
 mk(tur,new THREE.BoxGeometry(2.9,0.55,0.75),K.tarp,0,0.5,2.65);   // Staukorb mit Plane
 for(const s of [-1,1]){mk(tur,new THREE.BoxGeometry(0.04,0.6,0.85),K.dark,s*1.47,0.52,2.65);
  const ant=mk(tur,new THREE.CylinderGeometry(0.012,0.02,2.4,6),K.dark,s*1.35,2.1,2.1);ant.castShadow=false;
  for(let i=0;i<4;i++){const gg=new THREE.CylinderGeometry(0.06,0.06,0.32,10);gg.rotateX(Math.PI/2);mk(tur,gg,K.dark,s*(1.45+i*0.07),0.82,-0.75-i*0.02,0.3,s*0.5,0);}}   // Nebelwerfer
 mk(tur,new THREE.BoxGeometry(0.95,0.66,0.5),K.box,0,0.46,-2.45);   // Blende
 // Kommandanten-Kuppel + Rundblick-Periskop (PERI)
 mk(tur,new THREE.CylinderGeometry(0.4,0.43,0.24,20),K.box,0.62,1.05,0.55);mk(tur,new THREE.CylinderGeometry(0.36,0.36,0.06,20),K.steel,0.62,1.2,0.55);
 for(let i=0;i<6;i++){const a=i/6*6.283;mk(tur,new THREE.BoxGeometry(0.14,0.08,0.06),K.glass,0.62+Math.sin(a)*0.41,1.07,0.55+Math.cos(a)*0.41,0,a,0);}
 mk(tur,new THREE.CylinderGeometry(0.17,0.2,0.3,14),K.box,0.95,1.1,-0.35);mk(tur,new THREE.BoxGeometry(0.34,0.26,0.32),K.box,0.95,1.36,-0.35);mk(tur,new THREE.BoxGeometry(0.28,0.18,0.03),K.glass,0.95,1.38,-0.52);
 // Richtschützen-Visier
 mk(tur,new THREE.BoxGeometry(0.5,0.36,0.7),K.box,0.78,1.04,-1.55);mk(tur,new THREE.BoxGeometry(0.38,0.24,0.03),K.glass,0.78,1.05,-1.91);
 // Ladeschützen-Luke + MG
 mk(tur,new THREE.CylinderGeometry(0.36,0.36,0.07,18),K.box,-0.68,0.98,0.45);
 mk(tur,new THREE.BoxGeometry(0.12,0.16,0.75),K.dark,-0.68,1.2,0.05);{const gg=cylZ(0.025,0.025,0.85,8);mk(tur,gg,K.dark,-0.68,1.22,-0.65);}
 // BASILISK-Startbehälter (Wärmesuch-Raketen) an der rechten Turmseite
 const pod=new THREE.Group();pod.position.set(2.1,0.62,-0.2);tur.add(pod);m.pod=pod;
 mk(pod,new THREE.BoxGeometry(0.62,0.62,1.9),K.box);mk(pod,new THREE.BoxGeometry(0.64,0.08,1.92),K.red,0,0.18,0);mk(pod,new THREE.BoxGeometry(0.64,0.05,0.3),K.yel,0,-0.2,0.7);
 for(const y of [-0.14,0.14])for(const x of [-0.14,0.14]){const gg=cylZ(0.11,0.11,0.06,14);mk(pod,gg,K.rub,x,y,-0.97);const gg2=cylZ(0.08,0.08,0.04,12);mk(pod,gg2,K.red,x,y,-1.0);}
 mk(pod,new THREE.BoxGeometry(0.16,0.3,0.5),K.dark,-0.38,0,0.1);   // Halterung
 // ---- Kanone (schwenkt um Rohrwiege) ----
 const gp=new THREE.Group();gp.position.set(0,0.47,-2.3);tur.add(gp);m.gunPiv=gp;
 mk(gp,cylZ(0.115,0.135,1.3,20),K.box,0,0,-0.7);
 mk(gp,cylZ(0.095,0.11,4.6,20),K.steel,0,0,-3.2);
 for(const z of [-1.6,-2.7,-3.8])mk(gp,cylZ(0.128,0.128,0.55,20),K.box,0,0,z);   // Wärmeschutzhülle
 mk(gp,cylZ(0.16,0.16,0.6,20),K.box,0,0,-2.2);   // Rauchabsauger
 mk(gp,cylZ(0.12,0.105,0.25,20),K.dark,0,0,-5.55);mk(gp,new THREE.BoxGeometry(0.08,0.08,0.12),K.dark,0,0.15,-5.4);
 m.muzzle=new THREE.Object3D();m.muzzle.position.set(0,0,-5.75);gp.add(m.muzzle);
 hull.traverse(o=>{if(o.isMesh)o.receiveShadow=true;});
 m.gearPts=[V3(0,Y0,0)];m.tips=[V3(-1.3,0.0,3.97),V3(1.3,0.0,3.97)];m.crashPts=[];m.belly=V3(0,Y0+0.5,0);m.hard=[];
 const panel=V3(0,-0.6,0),r=finish(m,{eye:V3(0,1.6,-1.55),panel,pw:0.3,ph:0.1,camD:15,camH:4.2,shadowR:14,nav:0.02,tail:V3(0,-0.3,0)});
 r.group.children.forEach(c=>{if(c.isGroup&&c.position.equals(panel))c.visible=false;});return r;}
TYPES.tank={...TYPES.f15,name:'Kampfpanzer „Leopard“ (Bodentruppe)',build:buildTank,tank:true,fbw:false,ab:0,prop:false,gearFixed:true,mmax:0,ram:0};
ORDER.push('tank');
const WPN_NAME=()=>ac.P.tank?'BASILISK':'FOX-2';

/* ---------- Stadt (deterministisch, bei allen Spielern gleich) ---------- */
const CITYB=[],CITYCARS=[],CPITCH=112,CSTREET=22,CN=13,CX0=CITY.cx-CN*CPITCH/2,CZ0=CITY.cz-CN*CPITCH/2;
const cityCell=(x,z)=>[Math.floor((x-CX0)/CPITCH),Math.floor((z-CZ0)/CPITCH)];
const CGRID=new Map();
function cityHit(p,r=0){if(Math.abs(p.x-CITY.cx)>CITY.hs+10||Math.abs(p.z-CITY.cz)>CITY.hs+10||p.y>260)return null;const[i,j]=cityCell(p.x,p.z);const L=CGRID.get(i+','+j);if(!L)return null;
 for(const b of L)if(p.x>b.x0-r&&p.x<b.x1+r&&p.z>b.z0-r&&p.z<b.z1+r&&p.y<b.h)return b;return null;}
let CITYMATS=null;
(function buildCity(){let s=4242;const R=()=>{s=(s*16807)%2147483647;return s/2147483647;},Y=RWY;
 const facade=(kind)=>{const T=(fn)=>{const t=canvasTex(256,256,fn);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;};
  const draw=(lit)=>(x,w,h)=>{const C={glass:['#5f7f93','#9fc2d4'],office:['#b9b3a6','#2c3a46'],apt:['#ece6da','#3a4652'],house:['#efe3cf','#3d4a55']}[kind];
   x.fillStyle=lit?'#000':C[0];x.fillRect(0,0,w,h);const nx=4,ny=4,cw=w/nx,ch=h/ny;
   for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const on=Math.random()<0.38;
    if(kind==='glass'){x.fillStyle=lit?(on?'#ffe7a8':'#000'):(j%2?'#6d93a8':'#5b8296');x.fillRect(i*cw+2,j*ch+2,cw-4,ch-4);if(!lit){x.fillStyle='rgba(255,255,255,.18)';x.fillRect(i*cw+2,j*ch+2,cw*0.4,ch-4);}}
    else if(kind==='office'){x.fillStyle=lit?(on?'#ffe2a0':'#000'):C[1];x.fillRect(i*cw,j*ch+ch*0.35,cw,ch*0.42);}
    else{x.fillStyle=lit?(on?'#ffd88a':'#000'):C[1];x.fillRect(i*cw+cw*0.25,j*ch+ch*0.25,cw*0.5,ch*0.5);if(!lit){x.fillStyle='#d9d2c4';x.fillRect(i*cw+cw*0.2,j*ch+ch*0.75,cw*0.6,ch*0.06);}}}
   if(!lit){const d=x.getImageData(0,0,w,h);for(let i=0;i<d.data.length;i+=4){const n=(Math.random()-.5)*10;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n;}x.putImageData(d,0,0);}};
  return new THREE.MeshStandardMaterial({map:T(draw(false)),emissiveMap:T(draw(true)),emissive:0xffffff,emissiveIntensity:0,vertexColors:true,
   roughness:kind==='glass'?0.15:0.85,metalness:kind==='glass'?0.6:0.05});};
 const MATS={glass:facade('glass'),office:facade('office'),apt:facade('apt'),house:facade('house'),roof:M(0x55565a,0.9,0.1),tile:M(0x8c3b2a,0.8,0.05)};
 MATS.roof.vertexColors=true;MATS.tile.vertexColors=true;CITYMATS=MATS;
 const TILE={glass:[14,15],office:[14,14],apt:[12,12],house:[10,9]};
 const B={};for(const k in MATS)B[k]={p:[],n:[],u:[],c:[],i:[]};
 const quad=(k,a,b,c2,d,nrm,uv,col)=>{const o=B[k],base=o.p.length/3;for(const v of [a,b,c2,d]){o.p.push(...v);o.n.push(...nrm);o.c.push(...col);}o.u.push(...uv);o.i.push(base,base+1,base+2,base,base+2,base+3);};
 const box=(k,x0,x1,z0,z1,y0,y1,col,roofK='roof')=>{const[tu,tv]=TILE[k]||[10,10],h=y1-y0,wx=x1-x0,wz=z1-z0,v0=0,v1=h/tv;
  quad(k,[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],[0,v0,wx/tu,v0,wx/tu,v1,0,v1],col);
  quad(k,[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1],[0,v0,wx/tu,v0,wx/tu,v1,0,v1],col);
  quad(k,[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0],[0,v0,wz/tu,v0,wz/tu,v1,0,v1],col);
  quad(k,[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0],[0,v0,wz/tu,v0,wz/tu,v1,0,v1],col);
  if(roofK)quad(roofK,[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0],[0,0,1,0,1,1,0,1],[0.9,0.9,0.92]);};
 const gable=(x0,x1,z0,z1,y,rh,col)=>{const xm=(x0+x1)/2,o=[0.55,0.25,0.18].map(v=>v*col);   // Satteldach
  const nl=new THREE.Vector3(-rh,(x1-x0)/2,0).normalize(),nr=new THREE.Vector3(rh,(x1-x0)/2,0).normalize();
  quad('tile',[x0,y,z1],[xm,y+rh,z1],[xm,y+rh,z0],[x0,y,z0],[nl.x,nl.y,0],[0,0,1,0,1,1,0,1],[1,1,1]);
  quad('tile',[xm,y+rh,z1],[x1,y,z1],[x1,y,z0],[xm,y+rh,z0],[nr.x,nr.y,0],[0,0,1,0,1,1,0,1],[1,1,1]);
  quad('house',[x0,y,z1],[x1,y,z1],[xm,y+rh,z1],[xm,y+rh,z1],[0,0,1],[0,0,1,0,.5,.3,.5,.3],[0.95,0.92,0.85]);
  quad('house',[x1,y,z0],[x0,y,z0],[xm,y+rh,z0],[xm,y+rh,z0],[0,0,-1],[0,0,1,0,.5,.3,.5,.3],[0.95,0.92,0.85]);};
 const addB=(x0,x1,z0,z1,h,i,j)=>{const b={x0,x1,z0,z1,h:Y+h};CITYB.push(b);const key=i+','+j;if(!CGRID.has(key))CGRID.set(key,[]);CGRID.get(key).push(b);};
 const PL=['#ece6da','#e8d9b5','#d9a88c','#c9d4cf','#f1efe8','#d8c7a8','#b8c4d6'].map(h=>new THREE.Color(h));
 const lamps=[],trees=[],parks=new Set(['6,6','2,9','10,3']);
 for(let i=0;i<CN;i++)for(let j=0;j<CN;j++){const bx0=CX0+i*CPITCH+CSTREET/2,bz0=CZ0+j*CPITCH+CSTREET/2,BS=CPITCH-CSTREET,dn=Math.max(Math.abs(i-6),Math.abs(j-6))/6;
  if(parks.has(i+','+j)){for(let k=0;k<14;k++)trees.push([bx0+8+R()*(BS-16),bz0+8+R()*(BS-16),0.9+R()*0.6]);continue;}
  const ins=4.5;
  if(dn<0.34){   // Innenstadt: Hochhäuser
   const two=R()<0.5,w=(BS-2*ins);for(let k=0;k<(two?2:1);k++){const x0=bx0+ins+(two?k*(w/2+1.5):0),x1=two?x0+w/2-1.5:bx0+BS-ins,h=70+R()*90*(1-dn);
    const kind=R()<0.7?'glass':'office';box(kind,x0,x1,bz0+ins,bz0+BS-ins,Y,Y+h,[1,1,1]);addB(x0,x1,bz0+ins,bz0+BS-ins,h,i,j);
    if(R()<0.6){const cx=(x0+x1)/2,cz=bz0+BS/2;box('office',cx-6,cx+6,cz-6,cz+6,Y+h,Y+h+5,[0.7,0.7,0.72]);}
    if(R()<0.4){const cx=(x0+x1)/2+3,cz=bz0+BS/2-2;box('office',cx-0.4,cx+0.4,cz-0.4,cz+0.4,Y+h,Y+h+18+R()*14,[0.6,0.6,0.6]);}}}
  else if(dn<0.75){   // Wohn-/Bürohäuser
   const sub=2,cs=(BS-2*ins)/sub;for(let a=0;a<sub;a++)for(let b2=0;b2<sub;b2++){if(R()<0.12)continue;const x0=bx0+ins+a*cs+1,z0=bz0+ins+b2*cs+1,x1=x0+cs-2,z1=z0+cs-2,
    h=14+R()*34*(1.2-dn),kind=R()<0.35?'office':'apt',col=kind==='apt'?PL[R()*PL.length|0]:new THREE.Color(1,1,1);
    box(kind,x0,x1,z0,z1,Y,Y+h,[col.r,col.g,col.b]);addB(x0,x1,z0,z1,h,i,j);if(R()<0.5)box('office',x0+3,x0+7,z0+3,z0+6,Y+h,Y+h+2.5,[0.6,0.6,0.62]);}}
  else{   // Stadtrand: Einfamilienhäuser mit Satteldach
   const sub=3,cs=(BS-2*ins)/sub;for(let a=0;a<sub;a++)for(let b2=0;b2<sub;b2++){if(R()<0.2){trees.push([bx0+ins+a*cs+cs/2,bz0+ins+b2*cs+cs/2,1+R()*0.5]);continue;}
    const w=cs*0.62,d=cs*0.58,x0=bx0+ins+a*cs+(cs-w)/2,z0=bz0+ins+b2*cs+(cs-d)/2,h=6+R()*3,col=PL[R()*PL.length|0];
    box('house',x0,x0+w,z0,z0+d,Y,Y+h,[col.r,col.g,col.b],null);gable(x0-0.6,x0+w+0.6,z0-0.6,z0+d+0.6,Y+h,3.5,1);addB(x0,x0+w,z0,z0+d,h+3,i,j);
    if(R()<0.6)trees.push([x0+w+2.5,z0+d/2,0.8+R()*0.4]);}}}
 for(const k in B){const o=B[k];if(!o.i.length)continue;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(o.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(o.n,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(o.u,2));g.setAttribute('color',new THREE.Float32BufferAttribute(o.c,3));g.setIndex(o.i);
  const me=new THREE.Mesh(g,MATS[k]);me.castShadow=ULTRA;me.receiveShadow=true;scene.add(me);}
 // Boden, Gehwege, Straßen mit Markierungen
 const L=CN*CPITCH;const ground=new THREE.Mesh(new THREE.PlaneGeometry(L+60,L+60).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x2e2f32,roughness:0.95,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 ground.position.set(CITY.cx,Y+0.04,CITY.cz);ground.receiveShadow=true;scene.add(ground);
 const walk=new THREE.InstancedMesh(new THREE.BoxGeometry(1,0.22,1),new THREE.MeshStandardMaterial({color:0x9b9890,roughness:0.9}),CN*CN),grass=new THREE.InstancedMesh(new THREE.BoxGeometry(1,0.25,1),new THREE.MeshStandardMaterial({color:0x3f6b2c,roughness:1}),parks.size);
 let wi=0,gi=0;for(let i=0;i<CN;i++)for(let j=0;j<CN;j++){const cx=CX0+i*CPITCH+CPITCH/2,cz=CZ0+j*CPITCH+CPITCH/2,BS=CPITCH-CSTREET;dm.position.set(cx,Y+0.11,cz);dm.rotation.set(0,0,0);dm.scale.set(BS,1,BS);dm.updateMatrix();walk.setMatrixAt(wi++,dm.matrix);
  if(parks.has(i+','+j)){dm.position.y=Y+0.13;dm.scale.set(BS-8,1,BS-8);dm.updateMatrix();grass.setMatrixAt(gi++,dm.matrix);}}
 for(const im of [walk,grass]){im.receiveShadow=true;im.frustumCulled=false;scene.add(im);}
 const rt=canvasTex(64,256,(x,w,h)=>{x.fillStyle='#2b2c2f';x.fillRect(0,0,w,h);for(let k=0;k<900;k++){const v=34+Math.random()*22|0;x.fillStyle=`rgb(${v},${v},${v+2})`;x.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);}
  x.fillStyle='#d8d4c4';x.fillRect(2,0,2,h);x.fillRect(w-4,0,2,h);x.fillStyle='#e8c440';x.fillRect(w/2-1.5,0,3,h*0.55);});rt.wrapS=rt.wrapT=THREE.RepeatWrapping;rt.repeat.set(1,L/40);
 const rmat=new THREE.MeshStandardMaterial({map:rt,roughness:0.9,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
 for(let k=0;k<=CN;k++)for(const dir of [0,1]){const r=new THREE.Mesh(new THREE.PlaneGeometry(CSTREET-3,L).rotateX(-Math.PI/2),rmat);if(dir){r.rotation.y=Math.PI/2;r.position.set(CITY.cx,Y+0.07,CZ0+k*CPITCH);}else r.position.set(CX0+k*CPITCH,Y+0.06,CITY.cz);r.receiveShadow=true;scene.add(r);}
 // Straßenlaternen, Bäume, geparkte Autos
 for(let k=0;k<=CN;k++)for(let t=CPITCH/2;t<L;t+=CPITCH/2){for(const sd of [-1,1]){lamps.push([CX0+k*CPITCH+sd*(CSTREET/2+1),CZ0+t,sd>0?Math.PI:0]);lamps.push([CX0+t,CZ0+k*CPITCH+sd*(CSTREET/2+1),sd>0?-Math.PI/2:Math.PI/2]);}}
 const lg=new THREE.CylinderGeometry(0.09,0.13,8,6);lg.translate(0,4,0);const lm=new THREE.InstancedMesh(lg,M(0x3a3d40,0.5,0.6),lamps.length);
 const ag=new THREE.BoxGeometry(2.2,0.14,0.3);ag.translate(1.1,8,0);const la=new THREE.InstancedMesh(ag,M(0x3a3d40,0.5,0.6),lamps.length);
 const hg=new THREE.BoxGeometry(0.9,0.2,0.5);hg.translate(2.1,7.85,0);const lampMat=new THREE.MeshStandardMaterial({color:0xfff1c8,emissive:0xffd890,emissiveIntensity:0.2});const lh=new THREE.InstancedMesh(hg,lampMat,lamps.length);
 lamps.forEach(([x,z,ry],n)=>{dm.position.set(x,Y,z);dm.rotation.set(0,ry,0);dm.scale.set(1,1,1);dm.updateMatrix();lm.setMatrixAt(n,dm.matrix);la.setMatrixAt(n,dm.matrix);lh.setMatrixAt(n,dm.matrix);});
 for(const im of [lm,la,lh]){im.frustumCulled=false;im.castShadow=ULTRA;scene.add(im);}CITYMATS.lamp=lampMat;
 for(let k=0;k<=CN;k++)for(let t=20;t<L;t+=26)if(R()<0.35)trees.push([CX0+k*CPITCH+(R()<.5?-1:1)*(CSTREET/2+2.6),CZ0+t,0.8+R()*0.3]);
 const tg=new THREE.CylinderGeometry(0.16,0.24,3,7);tg.translate(0,1.5,0);const cg=new THREE.IcosahedronGeometry(2.3,1);cg.translate(0,4.6,0);
 const tt=new THREE.InstancedMesh(tg,M(0x4a3524,0.9,0),trees.length),tc=new THREE.InstancedMesh(cg,M(0x2f5a22,0.95,0),trees.length);
 trees.forEach(([x,z,sc],n)=>{dm.position.set(x,Y+0.2,z);dm.rotation.set(0,R()*6,0);dm.scale.setScalar(sc);dm.updateMatrix();tt.setMatrixAt(n,dm.matrix);tc.setMatrixAt(n,dm.matrix);});
 for(const im of [tt,tc]){im.frustumCulled=false;im.castShadow=true;im.receiveShadow=true;scene.add(im);}
 // Autos: Karosserie + Kabine + Räder als ein Modell, Farben pro Auto
 const parts=[new THREE.BoxGeometry(1.8,0.7,4.3).translate(0,0.65,0),new THREE.BoxGeometry(1.6,0.6,2.2).translate(0,1.25,0.2)];
 for(const sx of [-0.85,0.85])for(const sz of [-1.35,1.35]){const w=new THREE.CylinderGeometry(0.34,0.34,0.25,10);w.rotateZ(Math.PI/2);w.translate(sx,0.34,sz);parts.push(w);}
 let nv=0;for(const p of parts)nv+=p.toNonIndexed().attributes.position.count;const P=new Float32Array(nv*3),N=new Float32Array(nv*3),C=new Float32Array(nv*3);let o=0;
 parts.forEach((p,pi)=>{const q=p.toNonIndexed();P.set(q.attributes.position.array,o*3);N.set(q.attributes.normal.array,o*3);const c=pi===0?[1,1,1]:pi===1?[0.25,0.32,0.38]:[0.08,0.08,0.08];for(let v=0;v<q.attributes.position.count;v++)C.set(c,(o+v)*3);o+=q.attributes.position.count;});
 const carG=new THREE.BufferGeometry();carG.setAttribute('position',new THREE.BufferAttribute(P,3));carG.setAttribute('normal',new THREE.BufferAttribute(N,3));carG.setAttribute('color',new THREE.BufferAttribute(C,3));
 const CARC=['#b3122a','#1d4f91','#e8e8e6','#222326','#9a9fa6','#2f6b3a','#e0a21c','#5a2e82'].map(h=>new THREE.Color(h));
 const cars=[];for(let k=0;k<=CN;k++)for(let t=12;t<L-12;t+=9){if(R()<0.72)continue;const sd=R()<.5?-1:1,along=R()<.5;
  const x=along?CX0+k*CPITCH+sd*(CSTREET/2-2.6):CX0+t,z=along?CZ0+t:CZ0+k*CPITCH+sd*(CSTREET/2-2.6);{const mm=(((along?z:x)-(along?CZ0:CX0))%CPITCH+CPITCH)%CPITCH;if(mm<CSTREET/2+4||mm>CPITCH-CSTREET/2-4)continue;}cars.push([x,z,along?0:Math.PI/2]);}
 const ci=new THREE.InstancedMesh(carG,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.35,metalness:0.55}),cars.length);
 cars.forEach(([x,z,ry],n)=>{dm.position.set(x,Y+0.05,z);dm.rotation.set(0,ry+(R()-.5)*0.06,0);dm.scale.setScalar(1);dm.updateMatrix();ci.setMatrixAt(n,dm.matrix);ci.setColorAt(n,CARC[R()*CARC.length|0]);CITYCARS.push({x,z,ry,n,crushed:false});});
 ci.frustumCulled=false;ci.castShadow=true;ci.receiveShadow=true;scene.add(ci);CITYMATS.cars=ci;})();
/* Autos plattfahren */
function crushCars(x,z){for(const c of CITYCARS){if(c.crushed||Math.abs(c.x-x)>3.6||Math.abs(c.z-z)>3.6)continue;c.crushed=true;dm.position.set(c.x,RWY+0.05,c.z);dm.rotation.set(0,c.ry,0.03);dm.scale.set(1.15,0.28,1.05);dm.updateMatrix();
 CITYMATS.cars.setMatrixAt(c.n,dm.matrix);CITYMATS.cars.instanceMatrix.needsUpdate=true;sBurst('bandpass',600,0.9,0.5,0.35);sBurst('lowpass',150,0.8,0.5,0.4);rumble(250,0.8,0.5);ac.shake=Math.max(ac.shake||0,0.5);}}

/* ---------- Panzer-Steuerung & Physik ---------- */
function tankSpawn(){const A=ac;let s=(Math.random()*1e9)|0;const R=()=>{s=(s*16807)%2147483647;return s/2147483647;};
 let x,z,yaw;for(let k=0;k<40;k++){const a=R()<.5,i=1+(R()*(CN-1)|0),t=CPITCH*(0.5+(R()*(CN-1)|0));x=a?CX0+i*CPITCH:CX0+t;z=a?CZ0+t:CZ0+i*CPITCH;yaw=a?(R()<.5?0:Math.PI):(R()<.5?Math.PI/2:-Math.PI/2);
  let near=false;for(const p of mp.players.values())if(!p.dead&&Math.hypot(p.pos.x-x,p.pos.z-z)<120)near=true;if(!near)break;}
 A.tank={yaw,tur:0,el:0.02,spd:0,pitch:0,roll:0,trk:0};A.pos.set(x,groundH(x,z)+TANK_OY,z);A.vel.set(0,0,0);A.onGround=true;A.gearDown=true;A.gearAnim=1;A.thr=0;A.n1=0;
 _tkE.set(A.tank.el,yaw,0,'YXZ');A.q.setFromEuler(_tkE);flash('Spawn: Stadt – Panzer bereit');}
function stepTank(dt){const A=ac,T=A.tank||(tankSpawn(),A.tank);
 const dz=v=>Math.abs(v)<0.08?0:v,fw=dz(-input.pitch),tn=dz(input.roll);
 const target=A.brakes?0:fw>0?fw*19:fw*8,acc=(target===0||Math.sign(target)!==Math.sign(T.spd))?11:5.5;
 T.spd+=clamp(target-T.spd,-acc*dt,acc*dt);
 T.yaw-=tn*(0.85-0.3*Math.min(Math.abs(T.spd)/19,1))*dt;
 if(tn)T.align=false;else if(T.align){T.tur=Math.atan2(Math.sin(T.tur),Math.cos(T.tur));const st=Math.sign(T.tur)*Math.min(Math.abs(T.tur),0.75*dt);T.yaw+=st;T.tur-=st;if(Math.abs(T.tur)<0.002){T.tur=0;T.align=false;}}
 T.tur-=dz(input.yaw)*1.2*dt;
 let pe=0;if(!menuOpen){pe=(held('trimUp')-held('trimDown'));const gp=navigator.getGamepads?navigator.getGamepads()[0]:null;if(gp&&gp.axes.length>3&&Math.abs(gp.axes[3])>0.15)pe-=gp.axes[3];}
 T.el=clamp(T.el+pe*0.5*dt,-8*DEG,45*DEG);
 const sy=Math.sin(T.yaw),cy=Math.cos(T.yaw),dx=-sy*T.spd*dt,dzz=-cy*T.spd*dt;let nx=A.pos.x+dx,nz=A.pos.z+dzz;
 if(groundH(nx,nz)<1.2||Math.abs(nx)>WORLD/2-600||Math.abs(nz)>WORLD/2-600){nx=A.pos.x;nz=A.pos.z;T.spd*=-0.2;}
 // Häuser: Kreis gegen Rechtecke, herausschieben
 if(Math.abs(nx-CITY.cx)<CITY.hs+20&&Math.abs(nz-CITY.cz)<CITY.hs+20){const RAD=3.6;
  for(let pass=0;pass<2;pass++){_tkV.set(nx,RWY+1,nz);const b=cityHit(_tkV,RAD);if(!b)break;
   const px=Math.min(nx-(b.x0-RAD),(b.x1+RAD)-nx),pz=Math.min(nz-(b.z0-RAD),(b.z1+RAD)-nz);
   if(px<pz)nx=nx-(b.x0-RAD)<(b.x1+RAD)-nx?b.x0-RAD:b.x1+RAD;else nz=nz-(b.z0-RAD)<(b.z1+RAD)-nz?b.z0-RAD:b.z1+RAD;
   if(Math.abs(T.spd)>6){sBurst('lowpass',90,0.8,0.5,0.4);rumble(200,0.9,0.4);A.shake=Math.max(A.shake||0,0.8);}T.spd*=0.35;}
  crushCars(nx,nz);}
 // zu steil? -> nicht hochfahren
 const h0=groundH(A.pos.x,A.pos.z),h1=groundH(nx,nz),dd=Math.hypot(nx-A.pos.x,nz-A.pos.z);if(dd>1e-4&&(h1-h0)/dd>0.75){nx=A.pos.x;nz=A.pos.z;T.spd*=0.3;}
 const hF=groundH(nx-sy*3.3,nz-cy*3.3),hB=groundH(nx+sy*3.3,nz+cy*3.3),hL=groundH(nx-cy*1.7,nz+sy*1.7),hR=groundH(nx+cy*1.7,nz-sy*1.7);
 const h=Math.max((hF+hB+hL+hR)/4,groundH(nx,nz));
 T.pitch=lerp(T.pitch,Math.atan2(hF-hB,6.6),Math.min(1,dt*8));T.roll=lerp(T.roll,Math.atan2(hL-hR,3.4),Math.min(1,dt*8));
 A.pos.set(nx,h+TANK_OY,nz);A.vel.set(-sy*T.spd,0,-cy*T.spd);A.omega.set(0,0,0);T.trk+=T.spd*dt;
 _tkE.set(T.el+T.pitch,T.yaw+T.tur,0,'YXZ');A.q.setFromEuler(_tkE);
 A.onGround=true;A.ias=Math.abs(T.spd);A.g=1;A.alpha=0;A.stall=0;A.mach=0;A.ab=false;A.abN=0;A.thr=0;A.n1=0;A.gearDown=true;A.gearAnim=1;A.landed=true;}
/* Modell-Pose (eigener + fremde Panzer) */
function tankPose(m,yaw,tur,el,pitch,roll,trk){m.group.quaternion.setFromEuler(_tkE.set(pitch,yaw,roll,'YXZ'));m.turret.rotation.y=tur;m.gunPiv.rotation.x=el;
 for(const w of m.wheels)w.o.rotation.x=-trk/w.r;for(const t of m.trk||[])t.material.map.offset.y=-trk*0.3;}
let dsl=null;
function tankTick(dt){const A=ac,m=A.model;
 if(m.cock)m.cock.visible=camMode===0&&!mp.dead;b2SafeTick(dt);
 if(A.P.b2&&!A.crashed)m.ab.forEach(f=>{const k=f.userData.k||0;f.material.color.setRGB(A.ab?[2.2,3.2,3.6][k]:[0.9,1.6,1.8][k],A.ab?[0.85,2.0,2.6][k]:[0.45,1.0,1.3][k],A.ab?[0.25,0.8,1.4][k]:[0.9,1.4,1.8][k]);});document.body.classList.toggle('tankmode',!!A.P.tank);
 if(CITYMATS){const ni=typeof nightF==='number'?nightF:0;for(const k of ['glass','office','apt','house'])CITYMATS[k].emissiveIntensity=ni*1.3;CITYMATS.lamp.emissiveIntensity=0.2+ni*3;}
 if(dsl){const on=A.P.tank&&!A.crashed&&!menuOpen&&!paused,sp=on?Math.abs(A.tank?.spd||0)/19:0,t=SND.ctx.currentTime;dsl.o.frequency.setTargetAtTime(28+sp*34,t,0.15);dsl.g.gain.setTargetAtTime(on?0.06+0.16*sp:0,t,0.2);}
 else if(A.P.tank&&SND.ctx&&SND.master){const C=SND.ctx,o=C.createOscillator(),f=C.createBiquadFilter(),g=C.createGain();o.type='sawtooth';o.frequency.value=30;f.type='lowpass';f.frequency.value=220;f.Q.value=3;g.gain.value=0;o.connect(f);f.connect(g);g.connect(SND.master);o.start();dsl={o,g};}
 if(!A.P.tank||!A.tank)return;const T=A.tank;head.p=0;head.y=0;
 if(!A.crashed)tankPose(m,T.yaw,T.tur,T.el,T.pitch,T.roll,T.trk);
 if(!m.fpHide){m.fpHide=[];m.group.traverse(o=>{if(!o.isMesh)return;let p=o,g=false;while(p){if(p===m.gunPiv)g=true;p=p.parent;}if(!g)m.fpHide.push(o);});}
 {const fp=camMode===0&&!mp.dead;if(m.fpOn!==fp){m.fpOn=fp;for(const o of m.fpHide)o.visible=!fp;}}
 if(Math.abs(T.spd)>4&&!A.crashed&&(mp.tkDust=(mp.tkDust||0)+dt)>0.06){mp.tkDust=0;const inC=Math.abs(A.pos.x-CITY.cx)<CITY.hs&&Math.abs(A.pos.z-CITY.cz)<CITY.hs,c=inC?0.35:0.42;
  for(const s of [-1,1]){const bx=A.pos.x+Math.sin(T.yaw)*3.6+Math.cos(T.yaw)*s*1.7,bz=A.pos.z+Math.cos(T.yaw)*3.6-Math.sin(T.yaw)*s*1.7;emit(bx,A.pos.y-TANK_OY+0.4,bz,(Math.random()-.5)*2,1+Math.random()*1.5,(Math.random()-.5)*2,1.6+Math.random(),1.6,3.5,inC?0.18:0.35,c,c*0.88,c*0.72);}}}
/* Ziel per Wischen: auf dem Bildschirm ziehen = Turm drehen / Rohr heben */
{let aim=null;const cv=renderer.domElement;
 cv.addEventListener('pointerdown',e=>{if(!ac.P.tank||menuOpen)return;e.preventDefault();if(ac.tank)ac.tank.align=false;aim={id:e.pointerId,x:e.clientX,y:e.clientY};});
 addEventListener('pointermove',e=>{if(!aim||e.pointerId!==aim.id||!ac.tank)return;const T=ac.tank,k=e.pointerType==='touch'?1:0.8;
  T.tur-=(e.clientX-aim.x)*0.0042*k;T.el=clamp(T.el-(e.clientY-aim.y)*0.0032*k,-8*DEG,45*DEG);aim.x=e.clientX;aim.y=e.clientY;});
 const up=e=>{if(aim&&e.pointerId===aim.id){aim=null;if(ac.tank)ac.tank.align=true;}};addEventListener('pointerup',up);addEventListener('pointercancel',up);}
/* Panzer-HUD (statt Flug-HUD): Richtschützen-Visier, Turm-/Wannen-Anzeige, Tempo, Rohrerhöhung */
function tankHUD(c,W,H){const A=ac,T=A.tank;if(!T)return;const s=clamp(Math.min(W,H)/820,0.55,1.2),cx=W/2,cy=H/2,AM='rgba(255,196,80,.95)';
 c.save();c.textBaseline='middle';c.textAlign='center';
 const vg=c.createRadialGradient(cx,cy,Math.min(W,H)*0.42,cx,cy,Math.max(W,H)*0.72);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.55)');c.fillStyle=vg;c.fillRect(0,0,W,H);
 if(camMode===0){c.strokeStyle=AM;c.fillStyle=AM;c.lineWidth=1.6*s;c.shadowColor='rgba(0,0,0,.8)';c.shadowBlur=3;
  c.beginPath();c.moveTo(cx-14*s,cy+12*s);c.lineTo(cx,cy);c.lineTo(cx+14*s,cy+12*s);c.stroke();
  c.beginPath();c.moveTo(cx-170*s,cy);c.lineTo(cx-28*s,cy);c.moveTo(cx+28*s,cy);c.lineTo(cx+170*s,cy);c.stroke();
  for(let i=1;i<=4;i++){const yy=cy+i*16*s,w=(10-i)*3*s;c.beginPath();c.moveTo(cx-w,yy);c.lineTo(cx+w,yy);c.stroke();c.font=`600 ${Math.round(9*s)}px ui-monospace,monospace`;c.fillText(i*4+'',cx+w+12*s,yy);}
  c.beginPath();c.moveTo(cx,cy+4*s);c.lineTo(cx,cy+75*s);c.stroke();}
 // Turm/Wanne von oben (Turm zeigt immer nach oben)
 const ix=70*s+12,iy=$('touch').style.display==='block'?60*s+30:H-200*s;
 c.save();c.translate(ix,iy);c.shadowBlur=0;c.fillStyle='rgba(0,0,0,.45)';c.beginPath();c.arc(0,0,48*s,0,7);c.fill();
 c.save();c.rotate(T.tur);c.strokeStyle='rgba(180,255,190,.9)';c.lineWidth=2*s;c.strokeRect(-14*s,-26*s,28*s,52*s);c.beginPath();c.moveTo(-8*s,-26*s);c.lineTo(0,-34*s);c.lineTo(8*s,-26*s);c.stroke();c.restore();
 c.fillStyle='rgba(255,196,80,.95)';c.beginPath();c.arc(0,0,10*s,0,7);c.fill();c.fillRect(-2*s,-40*s,4*s,32*s);c.restore();
 c.font=`800 ${Math.round(22*s)}px ui-monospace,monospace`;c.fillStyle='#fff';c.strokeStyle='#000b';c.lineWidth=4;c.textAlign='left';
 const kmh=Math.round(Math.abs(T.spd)*3.6);txtO(c,`${kmh} km/h${T.spd<-0.3?'  R':''}`,ix+56*s,iy);
 c.font=`700 ${Math.round(14*s)}px ui-monospace,monospace`;c.fillStyle=AM;txtO(c,`ROHR ${(T.el/DEG>=0?'+':'')+(T.el/DEG).toFixed(1)}°   TURM ${Math.round(((-T.tur/DEG)%360+540)%360-180)}°`,ix-46*s,iy+64*s);
 c.textAlign='center';if(toast.t>0){c.globalAlpha=clamp(toast.t,0,1);c.fillStyle='#fff';c.font=`600 ${Math.round(16*s)}px system-ui`;txtO(c,toast.msg,cx,cy+120*s);c.globalAlpha=1;}
 c.restore();c.textBaseline='middle';c.textAlign='center';}

window.SKYMP={collTick,V3:THREE.Vector3,setTod:v=>{tod=v;},wreck,get fxt(){return FXT;},applyTheme,autoTheme,setSeason,BOTS,botTick,get season(){return mp.season;},get orbit(){return orbit;},setCam,sim:(n,pi)=>{if(pi!=null)input.pitch=pi;for(let i=0;i<n;i++){if(pi!=null)input.pitch=pi;if(!ac.crashed)step(HSTEP);}return [ac.pos.y.toFixed(1),(ac.vel.length()*3.6).toFixed(0),ac.onGround,ac.crashed||"ok"].join(" ");},toggleBigMap,get SAFE(){return SAFE;},b2dbg:()=>({bombs:bombs.length,nk:NK.length,ammo:mp.nk,dead:TANKS.filter(t=>t.dead).length}),gunAssist,scene,camera,tankInfo:()=>({tank:ac.tank,pos:ac.pos,type:acType,cam:camera.position.toArray().map(v=>+v.toFixed(2)),near:camera.near,gh:groundH(ac.pos.x,ac.pos.z),cm:camMode}),megaBoom,get cine(){return cine;},gh:groundH,TANKS,mp,mpHandle,mpOnState,mpSend,ac,get acType(){return acType;}};

/* ---------- Karten-Button (Touch) neben dem Menü-Button ---------- */
(()=>{const b=document.createElement('button');b.id='mapBtn';b.title='Karte (M)';b.textContent='🗺';
 b.style.cssText='position:fixed;top:calc(10px + var(--sat,0px));right:calc(62px + var(--sar,0px));z-index:15;width:44px;height:44px;border-radius:10px;border:1px solid #fff4;background:#0007;color:#fff;font-size:20px;cursor:pointer';
 b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleBigMap();});document.body.appendChild(b);const st=document.createElement('style');st.textContent='body #touch #tbtns{right:calc(114px + var(--sar))}';document.head.appendChild(st);})();

let scrF=0;
try{F15=await loadF15();}catch(e){console.error('F-15 konnte nicht geladen werden',e);}
if(!F15)ORDER.splice(ORDER.indexOf('f15'),1);
try{B747=await loadB747();}catch(e){console.error('747 konnte nicht geladen werden',e);}
if(!B747)ORDER.splice(ORDER.indexOf('b747'),1);
try{SR71=await loadSR71();}catch(e){console.error('SR-71 konnte nicht geladen werden',e);}
if(!SR71)ORDER.splice(ORDER.indexOf('sr71'),1);
try{F117=await loadF117();}catch(e){console.error('F-117 konnte nicht geladen werden',e);}
if(!F117)ORDER.splice(ORDER.indexOf('f117'),1);
setAircraft(ORDER[0]);applyGfx();renderTouch();
setTimeout(()=>{$('hint').style.opacity=0;},14000);
frame();
openLobby();window.__skyReady=1;dispatchEvent(new Event('skyready'));
