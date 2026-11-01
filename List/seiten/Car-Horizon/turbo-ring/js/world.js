"use strict";
/* =====================================================================
   WELT
   ===================================================================== */
// Höhenkarte aus der Japan-Karte (MAPDATA), plus Festival-Plateau, flache Stadt und befahrbarer Fuji
const HM=(()=>{ const b=atob(MAP_HM_B64), n=b.length>>1, a=new Float32Array(n); for(let i=0;i<n;i++){ let v=b.charCodeAt(2*i)|(b.charCodeAt(2*i+1)<<8); if(v>32767) v-=65536; a[i]=v/10; } return a; })();
function hmAt(x,z){ const M=MAPDATA.hm; const fx=clamp((x-M.x0)/M.dx,0,M.nx-1.001), fz=clamp((z-M.z0)/M.dz,0,M.nz-1.001), i=fx|0, k=fz|0, u=fx-i, v=fz-k, o=k*M.nx+i;
  return lerp(lerp(HM[o],HM[o+1],u), lerp(HM[o+M.nx],HM[o+M.nx+1],u), v); }
const CITY=MAPDATA.city, HUB_H=hmAt(0,0), CITY_H=hmAt(CITY.x,CITY.z);
function baseH(x,z){
  let h=hmAt(x,z); if(MAPDATA.baked) return h;   // Plateau, Stadt, Fuji und Straßenbetten sind schon eingebacken
  const hub=1-sstep(MAPDATA.hub.r0,MAPDATA.hub.r1,Math.hypot(x,z)); if(hub>0) h=lerp(h,HUB_H,hub*.95);
  const cx=Math.max(0,Math.abs(x-CITY.x)-CITY.hw), cz=Math.max(0,Math.abs(z-CITY.z)-CITY.hd), city=1-sstep(0,60,Math.hypot(cx,cz)); if(city>0) h=lerp(h,CITY_H,city*.92);
  const fr=Math.hypot(x-FUJI.x,z-FUJI.z)/FUJI.r; if(fr<1){ const fh=FUJI.h*Math.pow(1-fr,1.55)+5*Math.sin(Math.atan2(x-FUJI.x,z-FUJI.z)*7)*fr*(1-fr); h=Math.max(h, lerp(h,h*.4+fh,sstep(1,.8,fr))); }
  return h;
}
const WATER_Y = 0;
const FUJI=MAPDATA.fuji;
let W = null;
const G = { onRoad:false, d:1e9, r:null, i:0 };
const QR = { d:0, r:null, i:0, y:0 };
const hkey = (cx,cz) => (cx+600)*2000+(cz+600);

function roadQuery(x,z){
  const C=32, cx=Math.floor(x/C), cz=Math.floor(z/C); let best=1e12, br=null, bi=0;
  for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++){ const L=W.hash.get(hkey(cx+a,cz+b)); if(!L) continue;
    for(let k=0;k<L.length;k++){ const e=L[k], r=W.roads[e>>16], p=r.pts[e&65535]; const dx=p.x-x, dz=p.z-z, d=dx*dx+dz*dz; if(d<best){ best=d; br=r; bi=e&65535; } } }
  if(!br) return null;
  // auf benachbartes Segment projizieren
  const P=br.pts, N=br.N; let bd=Math.sqrt(best), by=P[bi].y;
  for(const nb of [bi-1, bi+1]){ let j=nb; if(br.loop) j=(j+N)%N; else if(j<0||j>=N) continue;
    const a=P[bi], c=P[j], sx=c.x-a.x, sz=c.z-a.z, L2=sx*sx+sz*sz; if(L2<1e-6) continue;
    const t=clamp(((x-a.x)*sx+(z-a.z)*sz)/L2,0,1); const qx=a.x+sx*t, qz=a.z+sz*t; const d=Math.hypot(x-qx,z-qz);
    if(d<bd){ bd=d; by=a.y+(c.y-a.y)*t; } }
  QR.d=bd; QR.r=br; QR.i=bi; QR.y=by; return QR;
}
function surfaceAt(x,z, ramps=true){
  let h=baseH(x,z); const q=roadQuery(x,z); G.onRoad=false; G.d=1e9; G.r=null; G.i=0;
  if(q){ G.d=q.d; G.r=q.r; G.i=q.i; const br=q.r.bridge && q.r.bridge[q.i];
    if(br){ if(q.d<=ROAD_W/2+2.2){ h=q.y; G.onRoad=q.d<=ROAD_W/2+.6; } }
    else { const t=sstep(W.flat, W.flat+10, q.d); h=q.y+(h-q.y)*t;
    if(q.d<=ROAD_W/2+.6) G.onRoad=true; else h-=W.sink*sstep(ROAD_W/2+.6, ROAD_W/2+2.5, q.d); } }
  else h-=W.sink;
  if(ramps) for(const R of W.ramps){ const dx=x-R.x, dz=z-R.z; const u=dx*R.tx+dz*R.tz, v=dx*R.nx+dz*R.nz;
    if(u>=0 && u<=R.L && Math.abs(v-R.off)<=R.w/2){ const rh=R.y+R.H*u/R.L; if(rh>h){ h=rh; G.onRoad=true; } } }
  return h;
}
function smoothArr(a, w, loop){ const n=a.length, o=new Array(n); for(let i=0;i<n;i++){ let s=0,c=0; for(let k=-w;k<=w;k++){ let j=i+k; if(loop) j=(j+n)%n; else if(j<0||j>=n) continue; s+=a[j]; c++; } o[i]=s/c; } return o; }

function buildRoadData(def){
  const curve=new THREE.CatmullRomCurve3(def.pts.map(p=>new THREE.Vector3(p[0],0,p[1])), def.loop, 'centripetal');
  const len=curve.getLength(), n=Math.max(16,Math.round(len/2.5));
  const pts=curve.getSpacedPoints(n); if(def.loop) pts.pop();
  const N=pts.length; let ys=pts.map(p=>baseH(p.x,p.z));
  for(let k=0;k<3;k++) ys=smoothArr(ys,14,def.loop);
  { const g=(def.grade||.09)*len/n; for(let it=0;it<6;it++){ for(let i=1;i<N;i++) ys[i]=clamp(ys[i],ys[i-1]-g,ys[i-1]+g); for(let i=N-2;i>=0;i--) ys[i]=clamp(ys[i],ys[i+1]-g,ys[i+1]+g); if(def.loop) ys[0]=clamp(ys[0],ys[N-1]-g,ys[N-1]+g); } ys=smoothArr(ys,5,def.loop); }  // max. ~9 % Steigung
  let bridge=null;
  if(def.id==='hwy'){ const wet=pts.map(p=>baseH(p.x,p.z)<WATER_Y+.8); let best=null, st=-1; for(let i=0;i<=N;i++){ if(i<N&&wet[i]){ if(st<0) st=i; } else if(st>=0){ if(!best||i-st>best[1]-best[0]) best=[st,i-1]; st=-1; } }
    if(best && best[0]>14 && best[1]<N-15){ const ia=best[0]-24, ib=best[1]+24; bridge=pts.map((p,i)=>i>=ia&&i<=ib); const ya=ys[ia-1], yb=ys[ib+1]; for(let i=ia;i<=ib;i++){ const e=Math.min(i-ia,ib-i)/24; ys[i]=Math.max(lerp(ya,yb,(i-ia)/(ib-ia)), lerp(lerp(ya,yb,(i-ia)/(ib-ia)),8,sstep(0,1,e))); } ys=smoothArr(ys,10,true); } }
  if(!def.loop){ // Zufahrten: wo sie andere Straßen überlappen, exakt deren Höhe übernehmen, dann weich überblenden
    const snap=pts.map(p=>{ const q=roadQuery(p.x,p.z); return q && q.d<ROAD_W*1.25 ? q.y : null; }), K=30, base=ys.slice();
    for(let i=0;i<N;i++){ let bk=1e9, by=0; for(let j=Math.max(0,i-K);j<=Math.min(N-1,i+K);j++) if(snap[j]!=null && Math.abs(j-i)<bk){ bk=Math.abs(j-i); by=snap[j]; } if(bk<=K) ys[i]=lerp(base[i], by, sstep(K,0,bk)); }
    // danach nochmal Steigung begrenzen (Einrastpunkte bleiben fest) – sonst Sprungschanzen an Kreuzungen
    const g=(def.grade||.09)*len/n, fx=snap.map(v=>v!=null); for(let it=0;it<6;it++){ for(let i=1;i<N;i++) if(!fx[i]) ys[i]=clamp(ys[i],ys[i-1]-g,ys[i-1]+g); for(let i=N-2;i>=0;i--) if(!fx[i]) ys[i]=clamp(ys[i],ys[i+1]-g,ys[i+1]+g); } }
  pts.forEach((p,i)=>p.y=Math.max(ys[i], WATER_Y+1.2));
  const tan=[], nor=[];
  for(let i=0;i<N;i++){ const a=def.loop?pts[(i-1+N)%N]:pts[Math.max(0,i-1)], b=def.loop?pts[(i+1)%N]:pts[Math.min(N-1,i+1)];
    const t=new THREE.Vector3(b.x-a.x,0,b.z-a.z).normalize(); tan.push(t); nor.push(new THREE.Vector3(-t.z,0,t.x)); }
  return { def, id:def.id, name:def.name||'', loop:def.loop, laps:def.laps||1, pts, tan, nor, N, len, bridge };
}
function ribbon(road, inner, outer, vScale, yoff, m, scene, drop=0, edge=false){
  const pos=[], uv=[], idx=[]; let d=0; const P=road.pts, Nn=road.nor, N=road.N, M=road.loop?N:N-1, keep=edge&&road.edgeKeep?road.edgeKeep:road.keep;
  for(let i=0;i<=M;i++){ const k=road.loop?i%N:i; if(i>0) d+=Math.hypot(P[k].x-P[i-1].x, P[k].z-P[i-1].z);
    const p=P[k], n=Nn[k]; pos.push(p.x+n.x*inner, p.y+yoff, p.z+n.z*inner, p.x+n.x*outer, p.y+yoff-drop, p.z+n.z*outer); uv.push(0,d/vScale,1,d/vScale);
    if(i<M && (!keep || (keep[k] && keep[(k+1)%N]))){ const a=2*i; idx.push(a,a+1,a+2, a+1,a+3,a+2); } }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); geo.setIndex(idx); geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,m); scene.add(mesh); return mesh;
}
function addObs(o){ const C=16; const x0=Math.floor((o.r!=null?o.x-o.r:o.x0)/C), x1=Math.floor((o.r!=null?o.x+o.r:o.x1)/C), z0=Math.floor((o.r!=null?o.z-o.r:o.z0)/C), z1=Math.floor((o.r!=null?o.z+o.r:o.z1)/C);
  for(let a=x0;a<=x1;a++) for(let b=z0;b<=z1;b++){ const k=hkey(a,b); let L=W.obs.get(k); if(!L) W.obs.set(k,L=[]); L.push(o); } }
function roadPoint(road, frac){ const i=Math.floor(clamp(frac,0,.999)*road.N); return i; }

/* ---------- Partikel, Bremsspuren, Gras ---------- */
function pointsMat(map, additive, fog=true){
  const m=new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map:{value:null}, uScale:{value:600}, uTint:{value:new THREE.Color(1,1,1)} }]),
    vertexShader:`attribute float aSize; attribute float aAlpha; attribute vec3 aCol; uniform float uScale; varying float vA; varying vec3 vC;
#include <fog_pars_vertex>
void main(){ vA=aAlpha; vC=aCol; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(-mvPosition.z,.5); gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader:`uniform sampler2D map; uniform vec3 uTint; varying float vA; varying vec3 vC;
#include <fog_pars_fragment>
void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC*uTint,t.a*vA); if(gl_FragColor.a<.003) discard;
#include <tonemapping_fragment>
#include <encodings_fragment>
#include <fog_fragment>
}`,
    transparent:true, depthWrite:false, fog, blending: additive?THREE.AdditiveBlending:THREE.NormalBlending });
  m.uniforms.map.value=map; return m; }
function pointsGeo(n){ const g=new THREE.BufferGeometry(); const A=(k,s)=>{ const a=new THREE.BufferAttribute(new Float32Array(n*s),s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k,a); return a.array; };
  return { g, pos:A('position',3), size:A('aSize',1), alpha:A('aAlpha',1), col:A('aCol',3) }; }
function makeFX(scene, n, map, additive){ const P=pointsGeo(n), m=pointsMat(map, additive); const pts=new THREE.Points(P.g, m); pts.frustumCulled=false; scene.add(pts);
  return Object.assign(P, { n, i:0, mat:m, live:0, Q:Array.from({length:n},()=>({age:1,life:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,s:0,gr:0,a:0,r:1,g:1,b:1,rise:0})) }); }
function fxSpawn(F, x,y,z, vx,vy,vz, s, gr, life, a, r,g,b, rise=.5){ const p=F.Q[F.i]; F.i=(F.i+1)%F.n; Object.assign(p,{age:0,life,x,y,z,vx,vy,vz,s,gr,a,r,g,b,rise}); F.live=F.n; }
function fxUpdate(F, dt){ if(!F || !F.live) return; let alive=0;
  for(let i=0;i<F.n;i++){ const p=F.Q[i]; if(p.age>=p.life){ F.alpha[i]=0; continue; } alive++; p.age+=dt; const t=Math.min(1,p.age/p.life);
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; const d=Math.exp(-dt*1.6); p.vx*=d; p.vz*=d; p.vy=p.vy*d+p.rise*dt; p.s+=p.gr*dt;
    F.pos[i*3]=p.x; F.pos[i*3+1]=p.y; F.pos[i*3+2]=p.z; F.size[i]=p.s; F.alpha[i]=p.a*(1-t)*Math.min(1,t*8); F.col[i*3]=p.r; F.col[i*3+1]=p.g; F.col[i*3+2]=p.b; }
  const at=F.g.attributes; at.position.needsUpdate=at.aSize.needsUpdate=at.aAlpha.needsUpdate=at.aCol.needsUpdate=true; F.live=alive; }
function makeSkids(scene, n){ const pos=new Float32Array(n*12), g=new THREE.BufferGeometry(); const a=new THREE.BufferAttribute(pos,3); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position',a);
  const idx=[]; for(let i=0;i<n;i++){ const o=i*4; idx.push(o,o+1,o+2, o+1,o+3,o+2); } g.setIndex(idx);
  const m=new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:0x0a0a0a, transparent:true, opacity:.42, depthWrite:false, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3})); m.frustumCulled=false; scene.add(m);
  return { g, pos, n, i:0, last:[null,null] }; }
function skidAdd(S, wi, x,y,z, dx,dz){ const L=S.last[wi], nx=-dz*.12, nz=dx*.12;
  if(L){ if((x-L.x)**2+(z-L.z)**2<.12) return; S.pos.set([L.x+L.nx,L.y,L.z+L.nz, L.x-L.nx,L.y,L.z-L.nz, x+nx,y,z+nz, x-nx,y,z-nz], S.i*12); S.i=(S.i+1)%S.n; S.g.attributes.position.needsUpdate=true; }
  S.last[wi]={x,y,z,nx,nz}; }
function makeGrass(scene, hdata, seg, count, S){
  if(!renderer.capabilities.vertexTextures || !(renderer.capabilities.isWebGL2 || renderer.extensions.has('OES_texture_float'))) return null;
  const N=seg+1, tex=new THREE.DataTexture(hdata, N, N, THREE.RGBAFormat, THREE.FloatType); tex.magFilter=tex.minFilter=THREE.NearestFilter; tex.needsUpdate=true;
  const pos=[], idx=[];
  for(let b=0;b<5;b++){ const a=b/5*Math.PI+(b%2)*.4, ca=Math.cos(a), sa=Math.sin(a), ox=(Math.random()-.5)*.25, oz=(Math.random()-.5)*.25, w=.06, h=.45+Math.random()*.25, o=pos.length/3;
    pos.push(ox-w*ca,0,oz-w*sa, ox+w*ca,0,oz+w*sa, ox+.12*sa,h,oz-.12*ca); idx.push(o,o+1,o+2); }
  const g=new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx);
  const off=new Float32Array(count*3); for(let i=0;i<count;i++){ off[i*3]=Math.random()*S; off[i*3+1]=Math.random()*S; off[i*3+2]=Math.random(); }
  g.setAttribute('offset', new THREE.InstancedBufferAttribute(off,3)); g.instanceCount=count;
  const m=new THREE.ShaderMaterial({ side:THREE.DoubleSide, fog:true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uH:{value:null}, uN:{value:N}, uCam:{value:new THREE.Vector3()}, uS:{value:S}, uTime:{value:0}, uLight:{value:new THREE.Color(1,1,1)}, uBase:{value:new THREE.Color(.035,.075,.018)}, uTip:{value:new THREE.Color(.2,.32,.06)} }]),
    vertexShader:`attribute vec3 offset; uniform sampler2D uH; uniform float uN; uniform vec3 uCam; uniform float uS; uniform float uTime; uniform vec3 uBase; uniform vec3 uTip; varying vec3 vCol; varying float vY;
#include <fog_pars_vertex>
vec4 H(vec2 w){ vec2 g=(w+${HALF}.0)/${HALF*2}.0*(uN-1.0); vec2 i=floor(g); vec2 f=g-i;
  vec4 a=texture2D(uH,(i+vec2(.5,.5))/uN), b=texture2D(uH,(i+vec2(1.5,.5))/uN), c=texture2D(uH,(i+vec2(.5,1.5))/uN), d=texture2D(uH,(i+vec2(1.5,1.5))/uN);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
void main(){ vec2 base=uCam.xz-uS*.5; vec2 p=base+mod(offset.xy-base,uS); vec4 h=H(p); float rnd=offset.z;
  float fade=1.0-smoothstep(uS*.3,uS*.5,length(p-uCam.xz)); float sc=step(rnd,h.g)*fade*(.65+.7*fract(rnd*37.3));
  float an=rnd*81.0; float ca=cos(an), sa=sin(an); vec3 q=position*sc; q.xz=vec2(ca*q.x-sa*q.z, sa*q.x+ca*q.z);
  float wind=sin(uTime*1.6+p.x*.11+p.y*.07)*.5+sin(uTime*2.9+p.x*.31)*.2; q.x+=wind*.2*position.y*sc; q.z+=wind*.09*position.y*sc;
  vec4 mvPosition=modelViewMatrix*vec4(p.x+q.x, h.r+q.y-.05, p.y+q.z, 1.0); gl_Position=projectionMatrix*mvPosition;
  vY=clamp(position.y/.6,0.,1.); vCol=mix(uBase,uTip,vY)*(.75+.5*h.b);
#include <fog_vertex>
}`,
    fragmentShader:`uniform vec3 uLight; varying vec3 vCol; varying float vY;
#include <fog_pars_fragment>
void main(){ gl_FragColor=vec4(vCol*uLight*(.55+.45*vY),1.0);
#include <tonemapping_fragment>
#include <encodings_fragment>
#include <fog_fragment>
}` });
  m.uniforms.uH.value=tex; const mesh=new THREE.Mesh(g,m); mesh.frustumCulled=false; scene.add(mesh); return mesh; }
function globalInstances(scene, geo, material, list, shadow){ if(!list.length) return null; const geos=Array.isArray(geo)?geo:[geo]; let first=null;
  for(const g of geos){ const im=new THREE.InstancedMesh(g, material, list.length); list.forEach((it,i)=>{ im.setMatrixAt(i,it.m); if(it.c) im.setColorAt(i,it.c); }); if(im.instanceColor) im.instanceColor.needsUpdate=true;
    im.frustumCulled=false; im.castShadow=!!shadow; im.receiveShadow=HQ(); scene.add(im); first=first||im; } return first; }
// Wald mit Detailstufen: fern = ein einziges einfaches Mesh, nah = detaillierte Kacheln
function lodForest(scene, list, hi, lo){
  const far=lo ? globalInstances(scene, lo[0], lo[1], list, false) : null, CH=200, groups=new Map(), zero=new THREE.Matrix4().makeScale(0,0,0);
  list.forEach((it,i)=>{ it.gi=i; const k=Math.floor((it.x+HALF)/CH)+'_'+Math.floor((it.z+HALF)/CH); let L=groups.get(k); if(!L) groups.set(k,L=[]); L.push(it); });
  for(const L of groups.values()){ let cx=0,cy=0,cz=0; L.forEach(it=>{ cx+=it.x; cy+=it.y; cz+=it.z; }); cx/=L.length; cy/=L.length; cz/=L.length; let r=0; L.forEach(it=>{ r=Math.max(r, Math.hypot(it.x-cx,it.z-cz)); });
    const sph=new THREE.Sphere(new THREE.Vector3(cx,cy+8,cz), r+25), meshes=[];
    for(const [geo,m,useC,sh] of hi){ const g=new THREE.BufferGeometry(); for(const n in geo.attributes) g.setAttribute(n, geo.attributes[n]); g.setIndex(geo.index); g.boundingSphere=sph;
      const im=new THREE.InstancedMesh(g, m, L.length); L.forEach((it,i)=>{ im.setMatrixAt(i,it.m); if(useC && it.c) im.setColorAt(i,it.c); }); if(im.instanceColor) im.instanceColor.needsUpdate=true;
      im.castShadow=!!sh; im.receiveShadow=HQ(); im.visible=!far; scene.add(im); meshes.push(im); }
    if(far) W.lods.push({c:sph.center, r, hi:meshes, far, items:L, zero}); } }
function updateLods(){ if(!W||!W.lods) return; const cp=camera.position, dirty=new Set();
  for(const e of W.lods){ const near=Math.hypot(e.c.x-cp.x, e.c.z-cp.z)-e.r<150; if(e.near===near) continue; e.near=near; e.hi.forEach(m=>m.visible=near);
    for(const it of e.items) e.far.setMatrixAt(it.gi, near?e.zero:it.m); dirty.add(e.far); }
  dirty.forEach(m=>m.instanceMatrix.needsUpdate=true); }
function patchSky(sky){ const m=sky.material; m.uniforms.skyGain={value:.6}; m.fragmentShader='uniform float skyGain;\n'+m.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );','gl_FragColor = vec4( min( retColor * skyGain, vec3( 24.0 ) ), 1.0 );'); }

function mergeStatics(scene){ if(!BGU) return; scene.updateMatrixWorld(true); const buckets=new Map(), rm=[];
  scene.traverse(o=>{ if(!o.isMesh || o.isInstancedMesh || !o.userData.merge) return; for(let p=o.parent;p;p=p.parent) if(p.userData.noMerge) return;
    let L=buckets.get(o.material); if(!L) buckets.set(o.material,L=[]); L.push(prep(o.geometry.clone().applyMatrix4(o.matrixWorld))); rm.push(o); });
  rm.forEach(o=>o.parent.remove(o));
  for(const [m,L] of buckets){ const g=mergeList(L), put=gg=>{ const me=new THREE.Mesh(gg,m); me.castShadow=me.receiveShadow=HQ(); scene.add(me); }; Array.isArray(g)?g.forEach(put):put(g); } }
function buildWorld(){
  if(W && W.gfx===gfxKey()) return W;
  if(W){ W.scene.traverse(c=>{ if(c.geometry) c.geometry.dispose(); }); if(W.envRT) W.envRT.dispose(); if(W.pmrem) W.pmrem.dispose(); }
  const P=GP(), hq=P.hq, scene=new THREE.Scene();
  W = { lods:[], scene, roads:[], byId:{}, hash:new Map(), obs:new Map(), ramps:[], stunts:[], events:[], gfx:gfxKey(), flat:P.flat, sink:P.sink, mats:{}, anim:[], pointMats:[], sunDir:new THREE.Vector3(0,1,0), lightDir:new THREE.Vector3(0,1,0), night:0, envP:-1 };
  scene.background=new THREE.Color('#8fc3ee'); scene.fog=new THREE.Fog(new THREE.Color('#8fc3ee'), P.fog[0], P.fog[1]);
  const hemi=new THREE.HemisphereLight(C('#dce9ff'), C('#4a5a3a'), hq?.45:.95); scene.add(hemi);
  const sun=new THREE.DirectionalLight(C('#fff4dd'), hq?2.4:.9); sun.position.set(300,500,200); scene.add(sun, sun.target);
  if(P.shadows){ sun.castShadow=true; sun.shadow.mapSize.set(P.shadows,P.shadows); const sc=sun.shadow.camera; sc.left=-P.shadowR; sc.right=P.shadowR; sc.top=P.shadowR; sc.bottom=-P.shadowR; sc.near=50; sc.far=900; sc.updateProjectionMatrix(); sun.shadow.bias=-.00035; sun.shadow.normalBias=.035; }
  W.hemi=hemi; W.sun=sun;
  if(hq){ W.head=new THREE.SpotLight(C('#fff1d6'),0,110,.5,.6,1.1); scene.add(W.head, W.head.target); } else { W.head=new THREE.PointLight('#fff1c8',0,45,1.6); scene.add(W.head); }
  // Himmel, Spiegelungen, Wolken, Sterne
  if(hq && THREE.Sky){ const sky=new THREE.Sky(); patchSky(sky); sky.scale.setScalar(2800); scene.add(sky); W.sky=sky; const U=sky.material.uniforms; U.turbidity.value=4.2; U.rayleigh.value=2.4; U.mieCoefficient.value=.0035; U.mieDirectionalG.value=.86;
    const es=new THREE.Scene(), s2=new THREE.Sky(); s2.material=sky.material; s2.scale.setScalar(60); es.add(s2); W.envScene=es; W.pmrem=new THREE.PMREMGenerator(renderer); scene.background=null; }
  if(P.clouds){ const n=P.clouds, Pg=pointsGeo(n); for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, r=250+Math.random()*2400; Pg.pos[i*3]=Math.cos(a)*r; Pg.pos[i*3+1]=330+Math.random()*260; Pg.pos[i*3+2]=Math.sin(a)*r; Pg.size[i]=260+Math.random()*420; Pg.alpha[i]=.55+Math.random()*.35; Pg.col[i*3]=Pg.col[i*3+1]=Pg.col[i*3+2]=1; }
    const m=pointsMat(TEX.cloud,false,false), pts=new THREE.Points(Pg.g,m); pts.frustumCulled=false; scene.add(pts); W.clouds=pts; W.pointMats.push(m); }
  if(hq){ const n=900, Pg=pointsGeo(n); for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, el=Math.asin(.06+Math.random()*.94); Pg.pos[i*3]=Math.cos(a)*Math.cos(el)*1300; Pg.pos[i*3+1]=Math.sin(el)*1300; Pg.pos[i*3+2]=Math.sin(a)*Math.cos(el)*1300; Pg.size[i]=3+Math.random()*6; Pg.alpha[i]=.4+Math.random()*.6; Pg.col[i*3]=Pg.col[i*3+1]=Pg.col[i*3+2]=1; }
    const m=pointsMat(TEX.smoke,true,false), pts=new THREE.Points(Pg.g,m); pts.frustumCulled=false; scene.add(pts); W.stars=pts; W.pointMats.push(m); }

  // Straßen: zuerst Rundkurse, dann Verbindungen
  const addRoad = road => { const ri=W.roads.length; W.roads.push(road); W.byId[road.id]=road;
    road.pts.forEach((p,i)=>{ const k=hkey(Math.floor(p.x/32),Math.floor(p.z/32)); let L=W.hash.get(k); if(!L) W.hash.set(k,L=[]); L.push((ri<<16)|i); }); };
  ROADS.filter(r=>r.loop).forEach(d=>addRoad(buildRoadData(d)));
  ROADS.filter(r=>!r.loop).forEach(d=>addRoad(buildRoadData(d)));
  const H=ROAD_W/2, junctions=[];
  W.roads.filter(r=>!r.loop).forEach(r=>{ r.keep=r.pts.map(p=>{ for(const L of W.roads){ if(!L.loop) continue; for(let j=0;j<L.N;j+=2){ const q=L.pts[j]; if(Math.abs(q.x-p.x)<H && Math.abs(q.z-p.z)<H && Math.hypot(q.x-p.x,q.z-p.z)<H-1.5) return false; } } return true; });
    junctions.push(r.pts[0], r.pts[r.N-1]); });
  const nearJunction=(x,z)=>junctions.some(j=>Math.hypot(j.x-x,j.z-z)<H+14);
  W.roads.filter(r=>r.loop).forEach(r=>{ r.edgeKeep=r.pts.map((p,i)=>!(r.bridge&&r.bridge[i]) && !junctions.some(j=>Math.hypot(j.x-p.x,j.z-p.z)<H+12)); });
  const roadMat=po=>new THREE.MeshStandardMaterial(Object.assign({map:TEX.asphalt, roughness:hq?.84:.9, metalness:0, side:THREE.DoubleSide, polygonOffset:po, polygonOffsetFactor:po?-1:0, polygonOffsetUnits:po?-1:0}, hq?{normalMap:TEX.asphaltN, normalScale:new THREE.Vector2(.6,.6), envMapIntensity:.5}:{}));
  const asphalt=roadMat(false), asphalt2=roadMat(true), curbM=smat({map:TEX.curb, roughness:.7, side:THREE.DoubleSide}), shoulderM=mat('#a89a72',{roughness:1, side:THREE.DoubleSide}), bankM=mat('#6f7a48',{roughness:1, side:THREE.DoubleSide});
  W.roads.forEach(r=>{ ribbon(r,-H,H,16,.05, r.loop?asphalt:asphalt2, scene).receiveShadow=hq;
    if(r.id==='city'||r.id==='fest'){ ribbon(r,H,H+1.4,3,.07,curbM,scene,0,true).receiveShadow=hq; ribbon(r,-H-1.4,-H,3,.07,curbM,scene,0,true).receiveShadow=hq; }
    else { ribbon(r,H,H+2.6,30,.02,shoulderM,scene,0,true).receiveShadow=hq; ribbon(r,-H-2.6,-H,30,.02,shoulderM,scene,0,true).receiveShadow=hq; }
    // Böschung: verhindert schwebende Straßen über tieferem Gelände
    const e=(r.id==='city'||r.id==='fest')?H+1.4:H+2.6; ribbon(r,e,e+11,30,.02,bankM,scene,9,true).receiveShadow=hq; ribbon(r,-e,-e-11,30,.02,bankM,scene,9,true).receiveShadow=hq;
    if(r.loop){ const g=new THREE.Group(); const p=r.pts[0]; g.position.set(p.x,p.y+.09,p.z); g.rotation.y=Math.atan2(r.tan[0].x,r.tan[0].z); const l=new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W,2.2),basic('#ffffff',{map:TEX.check})); l.rotation.x=-Math.PI/2; g.add(l); scene.add(g); } });

  // Kreuzungsflächen: eine durchgehende Asphaltfläche ohne doppelte Markierungen
  const jMat=new THREE.MeshStandardMaterial(Object.assign({map:TEX.asphaltPlain, roughness:hq?.84:.9, metalness:0, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4}, hq?{normalMap:TEX.asphaltN, normalScale:new THREE.Vector2(.6,.6), envMapIntensity:.5}:{}));
  junctions.forEach(j=>{ const Rr=H+5, g=new THREE.CircleGeometry(Rr,40); g.rotateX(-Math.PI/2); const pa=g.attributes.position, uv=g.attributes.uv;
    for(let i=0;i<pa.count;i++){ const x=j.x+pa.getX(i), z=j.z+pa.getZ(i), q=roadQuery(x,z); pa.setXYZ(i, x, (q?q.y:j.y)+.09, z); uv.setXY(i, uv.getX(i)*Rr/8, uv.getY(i)*Rr/8); }
    g.computeVertexNormals(); const m=new THREE.Mesh(g,jMat); m.receiveShadow=hq; scene.add(m); });

  // Rampen (Gefahrenschilder) — vor dem Gelände, damit surfaceAt sie kennt
  STUNTS.filter(s=>s.type==='jump').forEach(s=>{ const road=W.byId[s.road]; const i=roadPoint(road,s.at); const p=road.pts[i], t=road.tan[i], n=road.nor[i];
    const R={ x:p.x-t.x*7, z:p.z-t.z*7, y:p.y+.05, tx:t.x, tz:t.z, nx:n.x, nz:n.z, L:14, H:4, w:7, off:-3.6, stunt:s.id };
    W.ramps.push(R);
    const v=(u,o,y)=>[R.x+R.tx*u+R.nx*(R.off+o), R.y+y, R.z+R.tz*u+R.nz*(R.off+o)];
    const A=v(0,-3.5,0),B=v(0,3.5,0),C2=v(14,-3.5,0),D=v(14,3.5,0),E=v(14,-3.5,4),F=v(14,3.5,4);
    const pos=[...A,...B,...E, ...B,...F,...E, ...C2,...E,...F, ...C2,...F,...D, ...A,...E,...C2, ...B,...D,...F];
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.computeVertexNormals();
    const rm=new THREE.Mesh(geo, mat('#f2c230',{side:THREE.DoubleSide,roughness:.6})); rm.castShadow=rm.receiveShadow=hq; scene.add(rm);
    const end=v(14,0,4); R.endX=end[0]; R.endZ=end[2];
    const sign=new THREE.Group(); const sp=v(-10,7,0); sign.position.set(sp[0],sp[1],sp[2]); sign.rotation.y=Math.atan2(t.x,t.z);
    sign.add(box(.3,4,.3,mat('#777777'),0,2,0)); const tri=new THREE.Mesh(new THREE.ConeGeometry(1.6,2.2,3),basic('#ffcf2e',{toneMapped:false})); tri.position.y=5; tri.rotation.y=Math.PI/6; sign.add(tri); scene.add(sign);
  });

  // Gelände (Vertexfarben + Detailtextur) und Höhendaten fürs Gras
  const seg=P.seg, SZ=HALF*2, N1=seg+1; const tg=new THREE.PlaneGeometry(SZ,SZ,seg,seg); tg.rotateX(-Math.PI/2);
  const pa=tg.attributes.position, col=new Float32Array(pa.count*3), c=new THREE.Color(), hdata=P.grass?new Float32Array(N1*N1*4):null;
  const cGrass=new THREE.Color('#5f8f3e'), cGrass2=new THREE.Color('#7da34a'), cRock=new THREE.Color('#77736c'), cSnow=new THREE.Color('#f1f4f7'), cSand=new THREE.Color('#d6c48f'), cDirt=new THREE.Color('#8b7a58'), cCity=new THREE.Color('#5b6068');
  const cell=SZ/seg;
  for(let i=0;i<pa.count;i++){ const x=pa.getX(i), z=pa.getZ(i); let h=surfaceAt(x,z,false); const rq=roadQuery(x,z); if(rq && rq.r.bridge && rq.r.bridge[rq.i]) h=baseH(x,z); else if(rq && rq.d<ROAD_W/2+cell*.9) h=Math.min(h, rq.y-.3-Math.max(0,ROAD_W/2+cell*.9-rq.d)*.04); G.d=rq?rq.d:1e9; pa.setY(i,h);
    c.copy(cGrass).lerp(cGrass2, .5+.5*Math.sin(x*.02+z*.013)*Math.cos(z*.017));
    if(h>42) c.lerp(cRock, sstep(42,62,h)); if(h>150) c.lerp(cSnow, sstep(150+9*Math.sin(x*.05+z*.03),172,h));
    if(h<1.3) c.lerp(cSand, sstep(1.3,.4,h));
    const nearRoad=G.d<ROAD_W/2+6; if(nearRoad) c.lerp(cDirt,.6);
    const city=Math.abs(x-CITY.x)<CITY.hw+10 && Math.abs(z-CITY.z)<CITY.hd+10; if(city) c.lerp(cCity,.85);
    if(hdata){ const ix=Math.round((x+HALF)/SZ*seg), iz=Math.round((z+HALF)/SZ*seg), o=(iz*N1+ix)*4; let dens=0;
      if(h>.8 && h<56 && G.d>ROAD_W/2+cell+2 && !city && Math.hypot(x,z+10)>92) dens=clamp(.62+.55*Math.sin(x*.045+z*.031)*Math.cos(z*.052-x*.023),0,1)*(1-sstep(40,56,h));
      hdata[o]=h; hdata[o+1]=dens; hdata[o+2]=.5+.5*Math.sin(x*.013-z*.017); hdata[o+3]=1; }
    if(hq){ c.convertSRGBToLinear(); c.multiplyScalar(1.05); }
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; }
  tg.setAttribute('color', new THREE.BufferAttribute(col,3)); tg.computeVertexNormals();
  let terrainMat;
  if(hq){ const gm=TEX.ground.clone(); gm.needsUpdate=true; gm.repeat.set(380,380); const gn=TEX.groundN.clone(); gn.needsUpdate=true; gn.repeat.set(380,380);
    terrainMat=new THREE.MeshStandardMaterial({vertexColors:true, map:gm, normalMap:gn, normalScale:new THREE.Vector2(.9,.9), roughness:.95, metalness:0, envMapIntensity:.35}); }
  else terrainMat=new THREE.MeshLambertMaterial({vertexColors:true});
  const terrain=new THREE.Mesh(tg, terrainMat); terrain.receiveShadow=hq; scene.add(terrain);
  if(hdata) W.grass=makeGrass(scene, hdata, seg, P.grass, P.grassS);
  // Wasser
  if(hq){ const wt=TEX.waterN.clone(); wt.needsUpdate=true; wt.repeat.set(900,900); const wt2=wt;
    const water=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000), new THREE.MeshStandardMaterial({color:C('#0e4a66'), roughness:.07, metalness:.1, normalMap:wt2, normalScale:new THREE.Vector2(.35,.35), transparent:true, opacity:.9, envMapIntensity:1.3}));
    water.rotation.x=-Math.PI/2; water.position.y=WATER_Y; scene.add(water); W.anim.push(dt=>{ wt.offset.x+=dt*.004; wt.offset.y+=dt*.0025; }); }
  else { const water=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000), new THREE.MeshLambertMaterial({color:'#2f7fae', transparent:true, opacity:.88})); water.rotation.x=-Math.PI/2; water.position.y=WATER_Y; scene.add(water); }
  // Bergkette am Horizont (immer sichtbar, Farbe folgt der Tageszeit)
  { const geos=[], q=new THREE.Color(), mid=new THREE.Color('#7a89a3'), R0=rng(77);
    for(let k=0;k<26;k++){ const a=k/26*Math.PI*2+R0()*.15, d=3200+R0()*700, hh=220+R0()*300, rr=hh*(1.5+R0()*.8);
      const g=new THREE.ConeGeometry(rr,hh,hq?28:12,hq?6:1,true), p=g.attributes.position, cc=new Float32Array(p.count*3);
      for(let i=0;i<p.count;i++){ const y=(p.getY(i)+hh/2)/hh, an=Math.atan2(p.getZ(i),p.getX(i)); const snow=y>.62+.06*Math.sin(an*9+k)+.03*Math.sin(an*23); q.set(snow?'#eef3fa':'#4b5a73'); if(!snow) q.lerp(mid,y*.6); if(hq) q.convertSRGBToLinear(); cc[i*3]=q.r; cc[i*3+1]=q.g; cc[i*3+2]=q.b; }
      g.setAttribute('color',new THREE.BufferAttribute(cc,3)); g.translate(Math.sin(a)*d, hh/2-30, Math.cos(a)*d); g.deleteAttribute('uv'); geos.push(g.toNonIndexed()); }
    const fm=new THREE.MeshBasicMaterial({vertexColors:true, fog:false}); W.fujiMat=fm; scene.add(new THREE.Mesh(mergeList(geos), fm)); }
  // Fernsehturm in Neon-City (Wahrzeichen, rot-weiß)
  { const T=MAPDATA.tower, ty=surfaceAt(T[0],T[1],false), red=mat('#c8321e',{roughness:.6}), wht=mat('#f2f2f2',{roughness:.6}), tw=new THREE.Group(); tw.position.set(T[0],ty,T[1]);
    for(let k=0;k<9;k++){ const r0=9-k*.95, r1=9-(k+1)*.95, m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r0,13,hq?10:6,1,true), k%2?wht:red); m.position.y=k*13+6.5; tw.add(m); }
    for(const yy of [52,90]){ const d=new THREE.Mesh(new THREE.CylinderGeometry(6.5,6.5,4,hq?16:8), wht); d.position.y=yy; tw.add(d); }
    const sp=new THREE.Mesh(new THREE.CylinderGeometry(.3,1,26,6), red); sp.position.y=130; tw.add(sp); tw.traverse(o=>{ if(o.isMesh) o.castShadow=hq; }); scene.add(tw); addObs({x:T[0],z:T[1],r:9,top:ty+140}); W.tower={x:T[0],y:ty,z:T[1]}; }

  // Bäume: Kiefern (Berge), Laubbäume (Hügel), Kirschbäume (Tal) — in Kacheln, damit nur Sichtbares gezeichnet wird
  let pineG, broadG, trunkG, pineTrunkG;
  if(hq){ pineG=mergeList([G_(new THREE.ConeGeometry(3.6,5.5,9,2),0,4.6,0), G_(new THREE.ConeGeometry(2.9,4.8,9,2),0,7.4,0), G_(new THREE.ConeGeometry(2.1,4.2,8,2),0,9.9,0), G_(new THREE.ConeGeometry(1.2,3.2,7,1),0,12,0)].map(g=>jitter(smoothify(g),.16,1)));
    broadG=mergeList([G_(new THREE.IcosahedronGeometry(3.1,1),0,6.6,0), G_(new THREE.IcosahedronGeometry(2.5,1),1.9,5.6,.8), G_(new THREE.IcosahedronGeometry(2.4,1),-1.7,5.9,-.9), G_(new THREE.IcosahedronGeometry(2.2,1),.3,8.4,-.4)].map(g=>jitter(smoothify(g),.24,2)));
    trunkG=mergeList([prep(G_(new THREE.CylinderGeometry(.32,.5,5.2,7),0,2.6,0)), prep(rod([0,3.6,0],[1.6,5.2,.6],.16,5)), prep(rod([0,3.9,0],[-1.4,5.4,-.7],.15,5))]);
    pineTrunkG=prep(G_(new THREE.CylinderGeometry(.28,.42,4,6),0,2,0)); }
  else { pineG=prep(G_(new THREE.ConeGeometry(3.2,9,7),0,6.5,0)); broadG=prep(G_(new THREE.IcosahedronGeometry(4.2,0),0,6.2,0)); trunkG=pineTrunkG=prep(G_(new THREE.CylinderGeometry(.4,.55,3,6),0,1.5,0)); }
  const leafM=new THREE.MeshStandardMaterial({color:0xffffff, roughness:.85, metalness:0, envMapIntensity:.3}), barkM=mat('#5a3e28',{roughness:.95, metalness:0});
  const pines=[], broads=[], dm=new THREE.Object3D(); let tries=0; const nT=P.trees;
  while(pines.length+broads.length<nT && tries<nT*12){ tries++;
    let x=rnd(-HALF+50,HALF-50), z=rnd(-HALF+50,HALF-50); if(tries%4===0){ const FO=MAPDATA.forest, a=rnd(0,6.283), rr=Math.sqrt(Math.random())*FO[2]; x=FO[0]+Math.cos(a)*rr; z=FO[1]+Math.sin(a)*rr; }
    if(Math.hypot(x,z)<260) continue; if(VILLAGES.some(v=>Math.hypot(v[0]-x,v[1]-z)<120)) continue; if(Math.abs(x-CITY.x)<CITY.hw+25 && Math.abs(z-CITY.z)<CITY.hd+25) continue;
    const h=surfaceAt(x,z,false); if(h<.9||h>110) continue; if(G.d<ROAD_W/2+7) continue;
    const s=rnd(.7,1.35); dm.position.set(x,h-.3,z); dm.scale.set(s,s*rnd(.9,1.15),s); dm.rotation.set(0,rnd(0,6),0); dm.updateMatrix();
    const FO=MAPDATA.forest, valley = Math.hypot(x,z)<420, tc=new THREE.Color();
    if((h>30 || Math.hypot(x-FO[0],z-FO[1])<FO[2]) && !valley && Math.random()<.85){ tc.setHSL(.3+rnd(-.03,.03),.42,rnd(.2,.27)); if(hq) tc.convertSRGBToLinear(); pines.push({x,y:h,z,m:dm.matrix.clone(),c:tc}); }
    else { if(valley||Math.random()<.035){ tc.setHSL(.93+rnd(-.02,.02),.7,rnd(.72,.84)); (W.cherries||(W.cherries=[])).push([x,h,z,s]); } else tc.setHSL(.27+rnd(-.04,.04),.45,rnd(.28,.38)); if(hq) tc.convertSRGBToLinear(); broads.push({x,y:h,z,m:dm.matrix.clone(),c:tc}); }
    addObs({x,z,r:.9*s,top:h+8}); }
  if(hq){ const loPine=prep(G_(new THREE.ConeGeometry(3.3,10,7),0,6.8,0)), loBroad=prep(jitter(smoothify(G_(new THREE.IcosahedronGeometry(3.6,0),0,6.6,0,0,0,0,1.15,1,1.15)),.18,3));
    lodForest(scene, pines, [[pineG,leafM,true,true],[pineTrunkG,barkM,false,true]], [loPine,leafM]);
    lodForest(scene, broads, [[broadG,leafM,true,true],[trunkG,barkM,false,true]], [loBroad,leafM]); }
  else { globalInstances(scene, pineG, leafM, pines, false); globalInstances(scene, pineTrunkG, barkM, pines.map(t=>({...t,c:null})), false);
    globalInstances(scene, broadG, leafM, broads, false); globalInstances(scene, trunkG, barkM, broads.map(t=>({...t,c:null})), false); }
  // Felsen
  if(P.rocks){ const rockG=prep(jitter(smoothify(new THREE.DodecahedronGeometry(1,1)),.3,5)), rocks=[]; let k=0;
    while(rocks.length<P.rocks && k<P.rocks*20){ k++; const x=rnd(-HALF+50,HALF-50), z=rnd(-HALF+50,HALF-50), h=surfaceAt(x,z,false); if(G.d<ROAD_W/2+5) continue; if(!(h>28 || (h>.3 && h<1.6))) continue;
      const s=rnd(1.2,h>28?6:3.2); dm.position.set(x,h-s*.3,z); dm.scale.set(s,s*rnd(.5,.9),s*rnd(.8,1.2)); dm.rotation.set(rnd(0,3),rnd(0,6),0); dm.updateMatrix();
      const tc=new THREE.Color().setHSL(.08,.06,rnd(.32,.5)); if(hq) tc.convertSRGBToLinear(); rocks.push({x,y:h,z,m:dm.matrix.clone(),c:tc}); if(s>1.8) addObs({x,z,r:s*.8,top:h+s*.6}); }
    globalInstances(scene, rockG, new THREE.MeshStandardMaterial({color:0xffffff, roughness:.92, metalness:0, flatShading:true}), rocks, true); }

  // Neon-City
  const bG=new THREE.BoxGeometry(1,1,1); bG.translate(0,.5,0); bG.boundingSphere=new THREE.Sphere(new THREE.Vector3(CITY.x,60,CITY.z),Math.hypot(CITY.hw,CITY.hd)+60);
  { const uv=bG.attributes.uv; for(let i=8;i<16;i++) uv.setXY(i,.01,.004); }   // Dach/Boden: keine Fenster
  const winM = new THREE.MeshStandardMaterial(Object.assign({map:TEX.win, emissive:'#ffffff', emissiveMap:TEX.winL, emissiveIntensity:0}, hq?{roughness:.32, metalness:.55, envMapIntensity:1.1}:{roughness:.6, metalness:.2}));
  // Fenster in echter Größe: UV nach Gebäudemaß skalieren (Raster ≈ 2,5 m × 3,2 m), statt Textur zu strecken
  winM.onBeforeCompile=sh=>{ sh.vertexShader=sh.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_INSTANCING\n vUv = uv*vec2((abs(normal.x)>.5?length(instanceMatrix[2].xyz):length(instanceMatrix[0].xyz))/30.0, length(instanceMatrix[1].xyz)/72.0);\n#endif'); };
  winM.customProgramCacheKey=()=>'winScaled';
  W.mats.win=winM;
  const nB=P.buildings, nG=new THREE.BoxGeometry(1,1,1); nG.boundingSphere=bG.boundingSphere.clone();
  const bld=new THREE.InstancedMesh(bG, winM, nB*2), neonM=basic('#ffffff',{toneMapped:false}), neon=new THREE.InstancedMesh(nG, neonM, nB); W.neonMat=neonM;
  const shopM=new THREE.MeshStandardMaterial({color:0xffffff, emissive:C('#ffcf8a'), emissiveIntensity:0, roughness:.4, metalness:.3}); W.mats.shop=shopM;
  const shops=new THREE.InstancedMesh(bG, shopM, nB);
  const roofG=new THREE.BoxGeometry(1,1,1); roofG.translate(0,.5,0); roofG.boundingSphere=bG.boundingSphere.clone(); const roofs=new THREE.InstancedMesh(roofG, mat('#8a9098',{roughness:.7}), nB*4); let nr=0;
  let bi=0, ni=0, nb=0, si=0; const NEON=['#ff2e88','#29d9ff','#ffd23a','#7cff6b','#b06bff','#ff7a2e'], SHOP=['#8d7b62','#6f7b85','#9a6f5a','#7d8a70','#5f6270'], tc=new THREE.Color();
  const setB=(x,y,z,w,h,d,col)=>{ dm.position.set(x,y,z); dm.scale.set(w,h,d); dm.rotation.set(0,0,0); dm.updateMatrix(); bld.setMatrixAt(bi,dm.matrix); bld.setColorAt(bi,col); bi++; };
  const roof=(x,y,z,w,h,d)=>{ if(nr>=nB*4) return; dm.position.set(x,y,z); dm.scale.set(w,h,d); dm.rotation.set(0,0,0); dm.updateMatrix(); roofs.setMatrixAt(nr++,dm.matrix); };
  for(let gx=CITY.x-CITY.hw+12; gx<=CITY.x+CITY.hw-12 && nb<nB; gx+=30) for(let gz=CITY.z-CITY.hd+12; gz<=CITY.z+CITY.hd-12 && nb<nB; gz+=30){
    if(Math.random()<.15) continue;
    const x=gx+rnd(-5,5), z=gz+rnd(-5,5), w=rnd(14,22), d=rnd(14,22); const q=roadQuery(x,z); if(q && q.d < Math.max(w,d)*.72+ROAD_W/2+3) continue;
    const cen=1-clamp(Math.hypot(x-CITY.x,z-CITY.z)/Math.max(CITY.hw,CITY.hd),0,1); const ht=rnd(14,30)+cen*rnd(30,85); const y=surfaceAt(x,z,false)-.5; nb++;
    tc.setHSL(rnd(.55,.7),rnd(.05,.2),rnd(.45,.8)); if(hq) tc.convertSRGBToLinear();
    const tall=ht>42, h1=tall?ht*rnd(.55,.7):ht, base=4.6;
    setB(x,y+base,z,w,h1-base,d,tc);
    let tw=w, td=d; if(tall){ tw=w*rnd(.6,.8); td=d*rnd(.6,.8); const ox=rnd(-1,1)*(w-tw)*.4, oz=rnd(-1,1)*(d-td)*.4; roof(x,y+h1,z,w+.5,.7,d+.5); setB(x+ox,y+h1,z+oz,tw,ht-h1,td,tc.clone().multiplyScalar(rnd(.85,1.1))); }
    // Erdgeschoss mit Läden + Vordach, Dachkante, Technik auf dem Dach
    dm.position.set(x,y,z); dm.scale.set(w+.4,base,d+.4); dm.updateMatrix(); shops.setMatrixAt(si,dm.matrix); tc.set(pick(SHOP)); if(hq) tc.convertSRGBToLinear(); shops.setColorAt(si++,tc);
    roof(x,y+base,z,w+2.4,.35,d+2.4); roof(x,y+ht,z,tw+.5,.9,td+.5);
    addObs({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,top:y+ht});
    if(hq) for(let r=0;r<2;r++) roof(x+rnd(-tw*.3,tw*.3), y+ht+.9, z+rnd(-td*.3,td*.3), rnd(2,5),rnd(1,3),rnd(2,5));
    if(Math.random()<.55 && ni<nB){ const side=Math.random()<.5; dm.position.set(x+(side?w/2+.3:0), y+h1*rnd(.3,.75), z+(side?0:d/2+.3)); dm.scale.set(side?.4:rnd(5,10), rnd(3,9), side?rnd(5,10):.4); dm.updateMatrix(); neon.setMatrixAt(ni,dm.matrix); tc.set(pick(NEON)); if(hq) tc.convertSRGBToLinear(); neon.setColorAt(ni,tc); ni++; } }
  bld.count=bi; neon.count=ni; roofs.count=nr; shops.count=si; for(const m of [bld,neon,shops]) if(m.instanceColor) m.instanceColor.needsUpdate=true;
  bld.castShadow=bld.receiveShadow=hq; roofs.castShadow=hq; shops.receiveShadow=hq; scene.add(bld,neon,shops); if(nr) scene.add(roofs);
  buildVillages(scene, hq, dm);

  // Leitplanken & Straßenlaternen
  if(P.rails){ const railM=mat('#c3c8ce',{metalness:.75, roughness:.35, side:THREE.DoubleSide}), pos=[], idx=[], posts=[];
    for(const id of ['hwy','pass','fuji']){ const r=W.byId[id];
      for(const sd of [1,-1]){ const off=sd*(H+2.3); let run=[];
        const flush=()=>{ if(run.length>2){ const base=pos.length/3; run.forEach((q,j)=>{ pos.push(q.x,q.y+.5,q.z, q.x,q.y+.86,q.z); if(j<run.length-1){ const a=base+j*2; idx.push(a,a+1,a+2, a+1,a+3,a+2); } }); } run=[]; };
        for(let i=0;i<r.N;i+=2){ const p=r.pts[i], n=r.nor[i], x=p.x+n.x*off, z=p.z+n.z*off, q=roadQuery(x,z);
          if(q && q.r===r && Math.abs(q.d-Math.abs(off))<1 && !nearJunction(x,z)){ run.push({x,y:p.y,z}); if(i%4===0) posts.push([x,p.y,z]); } else flush(); }
        flush(); } }
    const rg=new THREE.BufferGeometry(); rg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); rg.setIndex(idx); rg.computeVertexNormals(); const rm=new THREE.Mesh(rg,railM); rm.castShadow=rm.receiveShadow=true; scene.add(rm);
    globalInstances(scene, prep(G_(new THREE.BoxGeometry(.14,.85,.14),0,.42,0)), mat('#9aa0a8',{metalness:.6, roughness:.45}), posts.map(([x,y,z])=>{ dm.position.set(x,y,z); dm.scale.set(1,1,1); dm.rotation.set(0,0,0); dm.updateMatrix(); return {x,y,z,m:dm.matrix.clone()}; }), true); }
  if(P.lamps){ const list=[];
    for(const [id,step,sides] of [['city',12,[1,-1]],['fest',10,[1,-1]],['hwy',26,[1]],['c2',10,[1]]]){ const r=W.byId[id];
      for(let i=0;i<r.N;i+=step) for(const sd of sides){ const p=r.pts[i], n=r.nor[i], off=sd*(H+1.7), x=p.x+n.x*off, z=p.z+n.z*off, q=roadQuery(x,z); if(!q||q.r!==r||q.d<H+1) continue;
        dm.position.set(x,p.y,z); dm.rotation.set(0,Math.atan2(-n.x*sd,-n.z*sd),0); dm.scale.set(1,1,1); dm.updateMatrix(); list.push({x,y:p.y,z,m:dm.matrix.clone()}); addObs({x,z,r:.3,top:p.y+8}); } }
    const poleG=mergeList([prep(G_(new THREE.CylinderGeometry(.09,.13,8,8),0,4,0)), prep(G_(new THREE.BoxGeometry(.1,.1,2.3),0,7.95,1.1))]);
    W.lampMat=basic('#ffd59a',{toneMapped:false});
    globalInstances(scene, poleG, mat('#3a3f46',{metalness:.5, roughness:.5}), list, true); globalInstances(scene, prep(G_(new THREE.BoxGeometry(.45,.12,.9),0,7.85,2.05)), W.lampMat, list, false); }

  // Festivalgelände
  const hubY=surfaceAt(0,0,false);
  const plaza=new THREE.Mesh(new THREE.CircleGeometry(85,48), mat('#4a4f58',{roughness:.95})); plaza.rotation.x=-Math.PI/2; plaza.position.set(0,hubY+.04,-10); plaza.receiveShadow=hq; scene.add(plaza);
  const stage=new THREE.Group(); stage.position.set(0,hubY,-62); scene.add(stage);
  stage.add(box(46,3,18,mat('#22262e'),0,1.5,0)); stage.add(box(2,22,2,mat('#30353e'),-22,11,-6)); stage.add(box(2,22,2,mat('#30353e'),22,11,-6)); stage.add(box(48,2,4,mat('#30353e'),0,22,-6));
  const scr=canvasTex(512,256,(g,w,h)=>{ const gr=g.createLinearGradient(0,0,w,h); gr.addColorStop(0,'#ff2e88'); gr.addColorStop(1,'#6b2bff'); g.fillStyle=gr; g.fillRect(0,0,w,h); g.fillStyle='#fff'; g.textAlign='center'; g.font='italic bold 76px "Chakra Petch",Arial'; g.fillText('TURBO RING',w/2,h/2); g.font='bold 34px "Chakra Petch",Arial'; g.fillText('FESTIVAL · JAPAN',w/2,h/2+60); });
  scr.wrapS=scr.wrapT=THREE.ClampToEdgeWrapping; const scrM=new THREE.Mesh(new THREE.PlaneGeometry(36,17),new THREE.MeshBasicMaterial({map:scr, toneMapped:false})); scrM.position.set(0,12.5,-5.6); stage.add(scrM);
  const tentCols=['#ff2e88','#29d9ff','#ffd23a','#ffffff','#7c5cff','#ff7a2e'];
  for(let k=0;k<12;k++){ const a=Math.PI*.15+k/12*Math.PI*1.7, x=Math.cos(a)*68, z=Math.sin(a)*68-10; const t=new THREE.Mesh(new THREE.ConeGeometry(6,7,12), mat(tentCols[k%tentCols.length],{roughness:.8})); t.position.set(x,hubY+3.5,z); t.castShadow=t.receiveShadow=hq; t.userData.merge=true; scene.add(t); addObs({x,z,r:5.2,top:hubY+7}); }
  for(let k=0;k<4;k++){ const x=(k<2?-1:1)*40, z=(k%2?-1:1)*30-10; scene.add(box(1.4,26,1.4,mat('#3a3f48'),x,hubY+13,z)); const lh=new THREE.Mesh(new THREE.BoxGeometry(4,2,1.5), W.lampMat||basic('#fff7d6',{toneMapped:false})); lh.position.set(x,hubY+26,z); scene.add(lh); addObs({x,z,r:1.2,top:hubY+26}); }
  const fw=new THREE.Group(); fw.position.set(-78,hubY+30,-40); const wheelG=new THREE.Group(); fw.add(wheelG); wheelG.userData.noMerge=true;
  wheelG.add(new THREE.Mesh(new THREE.TorusGeometry(25,.6,8,48),mat('#e9edf2',{metalness:.5})));
  for(let k=0;k<12;k++){ const a=k/12*Math.PI*2; const sp=box(.4,25,.4,mat('#cfd5dc'),Math.cos(a)*12.5,Math.sin(a)*12.5,0); sp.rotation.z=a-Math.PI/2; wheelG.add(sp); wheelG.add(box(2.6,2.6,2.6,mat(tentCols[k%tentCols.length]),Math.cos(a)*25,Math.sin(a)*25,0)); }
  const leg1=box(1.2,34,1.2,mat('#9aa3ad'),-8,-15,2), leg2=box(1.2,34,1.2,mat('#9aa3ad'),8,-15,2); leg1.rotation.z=-.25; leg2.rotation.z=.25; fw.add(leg1,leg2);
  fw.rotation.y=.6; scene.add(fw); W.anim.push(dt=>wheelG.rotation.z+=dt*.08); addObs({x:-78,z:-40,r:6,top:hubY+60});
  // Torii am Pass
  const pass=W.byId.pass, toriiM=mat('#d4381e'), blackM=mat('#1b1b1b');
  for(let k=0;k<8;k++){ const i=Math.floor((k+.5)/8*pass.N), p=pass.pts[i], t=pass.tan[i], n=pass.nor[i]; const g=new THREE.Group(); g.position.set(p.x,p.y,p.z); g.rotation.y=Math.atan2(t.x,t.z);
    const off=H+2.2; g.add(box(1.2,10,1.2,toriiM,off,5,0)); g.add(box(1.2,10,1.2,toriiM,-off,5,0)); g.add(box(off*2+6,1.1,1.6,blackM,0,10.4,0)); g.add(box(off*2+3,.8,1.2,toriiM,0,8.4,0)); scene.add(g);
    [off,-off].forEach(o=>addObs({x:p.x+n.x*o*-1, z:p.z+n.z*o*-1, r:.9, top:p.y+10})); }
  // Festival-Fahnen
  const fest=W.byId.fest;
  for(let k=0;k<16;k++){ const i=Math.floor(k/16*fest.N), p=fest.pts[i], n=fest.nor[i]; const s=(k%2?1:-1)*(H+4); const x=p.x+n.x*s, z=p.z+n.z*s;
    scene.add(box(.2,8,.2,mat('#cccccc'),x,p.y+4,z)); const f=new THREE.Mesh(new THREE.PlaneGeometry(2,5),mat(tentCols[k%tentCols.length],{side:THREE.DoubleSide, roughness:.8})); f.position.set(x+1,p.y+5.5,z); f.rotation.y=Math.atan2(fest.tan[i].x,fest.tan[i].z)+Math.PI/2; f.userData.merge=true; scene.add(f); }

  // Events (Rundkurse)
  W.roads.filter(r=>r.loop && !r.def.noEvent).forEach(r=>{ const i=4, p=r.pts[i], n=r.nor[i]; const pos=new THREE.Vector3(p.x+n.x*(H+7), p.y, p.z+n.z*(H+7));
    const pil=new THREE.Mesh(new THREE.CylinderGeometry(3,3,70,24,1,true), basic('#ff2e88',{transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false})); pil.position.set(pos.x,pos.y+35,pos.z); scene.add(pil);
    const lbl=makeLabel('⚑ '+r.name,'#ff2e88'); lbl.scale.set(18,4.4,1); lbl.position.set(pos.x,pos.y+12,pos.z); scene.add(lbl);
    W.events.push({ id:r.id, road:r, pos, name:r.name, laps:r.laps, mode:'race' }); });
  for(const X of [{id:'drift_pass',road:'pass',mode:'drift',name:'Drift-Challenge Minami',laps:1,at:70,col:'#ff7a2e'},{id:'time_fest',road:'fest',mode:'time',name:'Zeitfahren Festival',laps:2,at:150,col:'#29d9ff'}]){
    const r=W.byId[X.road], i=X.at%r.N, p=r.pts[i], n=r.nor[i], pos=new THREE.Vector3(p.x-n.x*(H+7), p.y, p.z-n.z*(H+7));
    const pil=new THREE.Mesh(new THREE.CylinderGeometry(3,3,70,24,1,true), basic(X.col,{transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false})); pil.position.set(pos.x,pos.y+35,pos.z); scene.add(pil);
    const lbl=makeLabel(X.name,X.col); lbl.scale.set(18,4.4,1); lbl.position.set(pos.x,pos.y+12,pos.z); scene.add(lbl);
    W.events.push({ id:X.id, road:r, pos, name:X.name, laps:X.laps, mode:X.mode, col:X.col }); }
  // Stunts
  STUNTS.forEach(s=>{ const road=W.byId[s.road]; const o={ ...s, roadObj:road };
    if(s.type==='trap'){ const i=roadPoint(road,s.at), p=road.pts[i], t=road.tan[i], n=road.nor[i]; Object.assign(o,{i, p, t, n});
      const g=new THREE.Group(); g.position.set(p.x,p.y,p.z); g.rotation.y=Math.atan2(t.x,t.z); g.add(box(.5,7,.5,mat('#dddddd'),H+1.5,3.5,0)); g.add(box(.5,7,.5,mat('#dddddd'),-H-1.5,3.5,0)); const bar=new THREE.Mesh(new THREE.BoxGeometry(ROAD_W+4,.8,.6),basic('#29d9ff',{toneMapped:false})); bar.position.set(0,7,0); g.add(bar); g.add(box(1.2,.9,1.2,mat('#222222'),H+1.5,7.6,0)); scene.add(g); }
    if(s.type==='drift'){ o.i0=roadPoint(road,s.from); o.i1=roadPoint(road,s.to);
      [o.i0,o.i1].forEach(i=>{ const p=road.pts[i], t=road.tan[i]; const g=new THREE.Group(); g.position.set(p.x,p.y,p.z); g.rotation.y=Math.atan2(t.x,t.z); g.add(box(.6,8,.6,mat('#dddddd'),H+1.5,4,0)); g.add(box(.6,8,.6,mat('#dddddd'),-H-1.5,4,0)); const bar=new THREE.Mesh(new THREE.BoxGeometry(ROAD_W+4,1.4,.5),basic('#ff7a2e',{toneMapped:false})); bar.position.set(0,8,0); g.add(bar); scene.add(g); }); o.p=road.pts[o.i0]; }
    if(s.type==='jump'){ const R=W.ramps.find(r=>r.stunt===s.id); o.ramp=R; o.p=new THREE.Vector3(R.x,R.y,R.z); }
    W.stunts.push(o); });

  mergeStatics(scene);
  // Schrägseilbrücke über den Fluss
  { const r=W.byId.hwy; if(r.bridge){ const ia=r.bridge.indexOf(true), ib=r.bridge.lastIndexOf(true), con=mat('#b9bdc2',{roughness:.8}), steel=mat('#e9edf1',{metalness:.6, roughness:.35}), pos=[], idx=[];
    for(let i=ia;i<=ib;i++){ const p=r.pts[i], n=r.nor[i]; for(const sd of [1,-1]){ const x=p.x+n.x*sd*(H+.8), z=p.z+n.z*sd*(H+.8); pos.push(x,p.y+.1,z, x,p.y-1.8,z); } }
    const NN=ib-ia+1; for(let j=0;j<NN-1;j++) for(let s2=0;s2<2;s2++){ const a=(j*2+s2)*2, c2=((j+1)*2+s2)*2; idx.push(a,a+1,c2, a+1,c2+1,c2); }
    for(let j=0;j<NN-1;j++){ const a=j*4, c2=(j+1)*4; idx.push(a+1,a+3,c2+1, a+3,c2+3,c2+1); }
    const bg=new THREE.BufferGeometry(); bg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); bg.setIndex(idx); bg.computeVertexNormals(); const bm=new THREE.Mesh(bg,mat('#a9adb2',{roughness:.85,side:THREE.DoubleSide})); bm.castShadow=bm.receiveShadow=hq; scene.add(bm);
    for(let i=ia+6;i<ib-3;i+=12){ const p=r.pts[i], n=r.nor[i]; for(const sd of [1,-1]) scene.add(Object.assign(box(1.6,p.y+9,1.6,con,p.x+n.x*sd*(H-2),(p.y-1.8-9)/2,p.z+n.z*sd*(H-2)),{})); }
    const mi=(ia+ib)>>1, pm2=r.pts[mi], nm=r.nor[mi], tm=r.tan[mi], top=pm2.y+34;
    for(const sd of [1,-1]){ const tx=pm2.x+nm.x*sd*(H+2.2), tz=pm2.z+nm.z*sd*(H+2.2); scene.add(box(1.8,top+8,1.8,con,tx,(top-8)/2,tz));
      for(let k=-6;k<=6;k++){ if(!k) continue; const j=clamp(mi+k*5,ia,ib), q=r.pts[j], nq=r.nor[j]; const cm=new THREE.Mesh(rod([tx,top-2-Math.abs(k)*.6,tz],[q.x+nq.x*sd*(H+.6),q.y+.6,q.z+nq.z*sd*(H+.6)],.07,5),steel); cm.userData.merge=true; scene.add(cm); } }
    const cb=box(2*(H+2.2)+1.8,1.6,1.6,con,pm2.x,top-1,pm2.z); cb.rotation.y=Math.atan2(nm.x,nm.z)+Math.PI/2; scene.add(cb);
    W.bridgeMid={ i:mi, p:pm2.clone(), n:nm.clone(), t:tm.clone() }; } }
  // Checkpoint-Ring, Effekte
  W.ring=new THREE.Mesh(new THREE.TorusGeometry(10,.45,8,48), basic('#29d9ff',{transparent:true,opacity:.75,toneMapped:false})); W.ring.visible=false; scene.add(W.ring);
  if(P.leaves) W.leaves=makeLeaves(scene, P.leaves);
  W.fx={ smoke:makeFX(scene, P.fx, TEX.smoke, false), glow:makeFX(scene, Math.max(90,P.fx>>1), TEX.smoke, true) }; W.pointMats.push(W.fx.smoke.mat, W.fx.glow.mat);
  W.skid = P.skid ? makeSkids(scene, 700) : null;
  drawWorldMap();
  return W;
}

/* ---------- Kartenbild (für Minimap & große Karte) ---------- */
const MAPS=1024, MAPW=HALF*2;
let mapImg=null;
const m2p = (x,z) => [(x+MAPW/2)/MAPW*MAPS, (z+MAPW/2)/MAPW*MAPS];
function drawWorldMap(){
  mapImg=document.createElement('canvas'); mapImg.width=mapImg.height=MAPS; const g=mapImg.getContext('2d');
  const cell=8; for(let py=0;py<MAPS;py+=cell) for(let px=0;px<MAPS;px+=cell){ const x=px/MAPS*MAPW-MAPW/2, z=py/MAPS*MAPW-MAPW/2, h=baseH(x,z);
    g.fillStyle = h<WATER_Y+.5 ? '#1d4a6b' : h>60 ? '#5e6a72' : h>35 ? '#3f5a45' : '#2e4a34'; g.fillRect(px,py,cell,cell); }
  const [cx0,cz0]=m2p(CITY.x-CITY.hw,CITY.z-CITY.hd), [cx1,cz1]=m2p(CITY.x+CITY.hw,CITY.z+CITY.hd); g.fillStyle='#3a3f4a'; g.fillRect(cx0,cz0,cx1-cx0,cz1-cz0);
  g.lineJoin=g.lineCap='round';
  for(const pass of [0,1]) W.roads.forEach(r=>{ g.beginPath(); r.pts.forEach((p,i)=>{ const [x,y]=m2p(p.x,p.z); i?g.lineTo(x,y):g.moveTo(x,y); }); if(r.loop) g.closePath();
    g.strokeStyle = pass? (r.loop?'#f2f4f7':'#c9ced6') : 'rgba(0,0,0,.6)'; g.lineWidth = pass?4:8; g.stroke(); });
}

/* ---------- Dörfer: japanische Wohnhäuser mit Satteldach ---------- */
const VILLAGES=MAPDATA.villages;
function buildVillages(scene, hq, dm){
  const hm=new THREE.MeshStandardMaterial({color:0xffffff, map:TEX.house, roughness:.85, metalness:0});
  const g1=new THREE.BoxGeometry(1,1,1); g1.translate(0,.5,0); const g2=g1.clone(); { const u=g2.attributes.uv; for(let i=0;i<u.count;i++) u.setY(i,u.getY(i)*2); }
  // Satteldach als Prisma mit Überstand
  const sh=new THREE.Shape([new THREE.Vector2(-.62,0),new THREE.Vector2(.62,0),new THREE.Vector2(0,.42)]); const rg=new THREE.ExtrudeGeometry(sh,{depth:1.16,bevelEnabled:false}); rg.translate(0,0,-.58);
  const rm=mat('#ffffff',{roughness:.6, metalness:.15});
  const L1=[], L2=[], LR=[], c=new THREE.Color(), WALL=['#ffffff','#f1e6d2','#e6e2da','#c9b49a','#8a6a4f'], ROOF=['#3d4652','#2f3b47','#59606b','#7a3f2e','#45505c'];
  for(const [vx,vz] of VILLAGES){ let n=0;
    for(let t=0;t<120 && n<(hq?20:14);t++){ const x=vx+rnd(-110,110), z=vz+rnd(-110,110), h=surfaceAt(x,z,false); if(h<1.6) continue;
      const q=roadQuery(x,z); if(q && q.d<ROAD_W/2+11) continue; if(Math.abs(surfaceAt(x+6,z,false)-surfaceAt(x-6,z,false))>2.6) continue;
      if(L1.concat(L2).some(o=>Math.hypot(o.x-x,o.z-z)<17)) continue;
      const w=rnd(8,12), d=rnd(7,10), two=Math.random()<.45, ht=two?6.2:3.4, rot=q?Math.atan2(q.r.tan[q.i].x,q.r.tan[q.i].z):rnd(0,6);
      dm.position.set(x,h-2.2,z); dm.rotation.set(0,rot,0); dm.scale.set(w,ht+2.2,d); dm.updateMatrix(); c.set(pick(WALL)); if(hq) c.convertSRGBToLinear();
      (two?L2:L1).push({x,y:h,z,m:dm.matrix.clone(),c:c.clone()});
      dm.position.set(x,h+ht,z); dm.scale.set(d*1.1,d*.9,w*1.12); dm.rotation.set(0,rot+Math.PI/2,0); dm.updateMatrix(); c.set(pick(ROOF)); if(hq) c.convertSRGBToLinear(); LR.push({x,y:h,z,m:dm.matrix.clone(),c:c.clone()});
      addObs({x,z,r:Math.min(w,d)*.5,top:h+ht}); n++; } }
  globalInstances(scene, g1, hm, L1, hq); globalInstances(scene, g2, hm, L2, hq); globalInstances(scene, rg, rm, LR, hq);
}

/* ---------- Ultra: fallende Blätter & Kirschblüten rund um die Kamera ---------- */
function makeLeaves(scene, n){
  const tex=canvasTex(32,32,(c,w,h)=>{ c.clearRect(0,0,w,h); c.fillStyle='#fff'; c.beginPath(); c.ellipse(16,16,14,7,.6,0,7); c.fill(); c.strokeStyle='rgba(0,0,0,.25)'; c.lineWidth=1.5; c.beginPath(); c.moveTo(5,24); c.lineTo(27,8); c.stroke(); });
  const m=new THREE.MeshLambertMaterial({map:tex, alphaTest:.5, side:THREE.DoubleSide, emissive:new THREE.Color(.16,.14,.13)});
  const im=new THREE.InstancedMesh(new THREE.PlaneGeometry(.34,.24), m, n); im.frustumCulled=false; im.receiveShadow=true; scene.add(im);
  const PAL=['#ffb7d0','#ffd2e1','#f7a8c4','#ffc4d8','#fbe0ea'], c=new THREE.Color(), L=[];
  const CH=new Map(); for(const c of (W.cherries||[])){ const k=Math.floor(c[0]/40)+'_'+Math.floor(c[2]/40); (CH.get(k)||CH.set(k,[]).get(k)).push(c); }
  const near=(x,z)=>{ const gx=Math.floor(x/40), gz=Math.floor(z/40), L=[]; for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++){ const C=CH.get((gx+a)+'_'+(gz+b)); if(C) for(const c of C) if((c[0]-x)**2+(c[2]-z)**2<55*55) L.push(c); } return L; };
  let nearList=[], nearAt=null;
  // Blüten fallen nur dort, wo Kirschbäume in der Nähe stehen – direkt aus deren Krone
  const spawn=(l,top)=>{ const cx=camera.position.x, cz=camera.position.z; if(!nearAt || Math.hypot(nearAt[0]-cx,nearAt[1]-cz)>8){ nearList=near(cx,cz); nearAt=[cx,cz]; }
    if(!nearList.length){ l.off=true; l.y=-999; return; } const t=nearList[(Math.random()*nearList.length)|0], a=Math.random()*6.283, rr=Math.sqrt(Math.random())*3.6*t[3];
    l.off=false; l.x=t[0]+Math.cos(a)*rr; l.z=t[2]+Math.sin(a)*rr; l.g=surfaceAt(l.x,l.z,false); l.y=t[1]+(top?rnd(1,8):rnd(5,8))*t[3]; l.v=rnd(.6,1.3); l.p=rnd(0,6.283); l.f=rnd(1.5,3.2); l.rest=0; };
  for(let i=0;i<n;i++){ const l={}; spawn(l,true); L.push(l); c.set(PAL[i%5]); if(HQ()) c.convertSRGBToLinear(); im.setColorAt(i,c); }
  im.instanceColor.needsUpdate=true;
  const o=new THREE.Object3D(); let t=0;
  W.anim.push(dt=>{ t+=dt; const wx=Math.sin(t*.13)*.9+.6, wz=Math.cos(t*.09)*.6+.3, cx=camera.position.x, cz=camera.position.z;
    for(let i=0;i<n;i++){ const l=L[i];
      if(l.off){ if(Math.random()<dt*.5) spawn(l,true); if(l.off){ o.position.set(0,-999,0); o.updateMatrix(); im.setMatrixAt(i,o.matrix); continue; } }
      if(l.rest>0){ l.rest-=dt; if(l.rest<=0) spawn(l,false); }
      else { l.y-=l.v*dt; l.x+=(wx+Math.sin(t*l.f+l.p)*.9)*dt; l.z+=(wz+Math.cos(t*l.f*.8+l.p)*.7)*dt; if(l.y<=l.g+.03){ l.y=l.g+.03; l.rest=rnd(1.5,4); } }
      if((l.x-cx)**2+(l.z-cz)**2>3600) spawn(l,true);
      o.position.set(l.x,l.y,l.z); if(l.rest>0) o.rotation.set(-Math.PI/2,0,l.p); else o.rotation.set(Math.sin(t*l.f+l.p)*1.2, t*l.f*.7+l.p, Math.cos(t*l.f*1.3+l.p)*.9); o.updateMatrix(); im.setMatrixAt(i,o.matrix); }
    im.instanceMatrix.needsUpdate=true; });
  return im; }
