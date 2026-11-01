"use strict";
/* =====================================================================
   AUTOMODELLE — Karosserie aus einem abgerundeten Gitterkörper, der auf
   Seitenprofil (Dach-/Bodenlinie), Grundriss und Tumblehome gezogen wird.
   Glas, Lichter, Grill und Anbauteile entstehen über Flächenzonen.
   ===================================================================== */
let M=null; const paintCache=new Map(), carTemplates=new Map(), wheelCache=new Map();
function stdMat(c,o){ return new THREE.MeshStandardMaterial(Object.assign({color:C(c), roughness:.5, metalness:.1}, o||{})); }
function carMats(){ if(M) return M; const hq=HQ();
  M={ glass: hq ? new THREE.MeshPhysicalMaterial({color:C('#0b0f15'), roughness:.05, metalness:.1, clearcoat:1, clearcoatRoughness:.03, envMapIntensity:2}) : stdMat('#1a2230',{roughness:.15,metalness:.6}),
    trim: stdMat('#121316',{roughness:.6, metalness:0}), grille: stdMat('#0a0b0d',{roughness:.45, metalness:.4}), chrome: stdMat('#f1f3f6',{metalness:1, roughness:.08}),
    carbon: stdMat('#1a1c20',{roughness:.28, metalness:.55}), tire: stdMat('#151515',{roughness:.92, metalness:0, side:THREE.DoubleSide}),
    rim: stdMat('#d2d6dc',{metalness:1, roughness:.2}), rimDark: stdMat('#2a2d32',{metalness:.8, roughness:.32}),
    caliper: stdMat('#d21f2b',{roughness:.35, metalness:.25}), interior: stdMat('#18191c',{roughness:.9, metalness:0}),
    head: new THREE.MeshStandardMaterial({color:C('#dfe6ee'), emissive:C('#fff4dc'), emissiveIntensity:1, roughness:.06, metalness:.5}),
    plate: new THREE.MeshStandardMaterial({map:TEX.plate, roughness:.45, metalness:.1}),
    helmet: stdMat('#f4f4f4',{roughness:.25}), visor: stdMat('#ffb21a',{roughness:.05, metalness:.85}),
    shadow: new THREE.MeshBasicMaterial({map:TEX.blob, transparent:true, depthWrite:false, opacity: hq?.6:.7, toneMapped:false, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4}) };
  return M; }
function paintMat(hex){ let m=paintCache.get(hex); if(m) return m;
  m = HQ() ? new THREE.MeshPhysicalMaterial({color:C(hex), metalness:.05, roughness:.4, clearcoat:.55, clearcoatRoughness:.12, envMapIntensity:.45}) : new THREE.MeshStandardMaterial({color:C(hex), metalness:.35, roughness:.35});
  paintCache.set(hex,m); return m; }
function tailMat(){ return new THREE.MeshStandardMaterial({color:C('#4d0005'), emissive:C('#ff1a2a'), emissiveIntensity:.7, roughness:.12, metalness:.3}); }

const CAR_SPECS = {
  sport: { L:4.45, W:1.94, zc:0, wr:.335, tw:.255, twR:.275, wf:1.40, wb:-1.36, arch:.045, flare:.03,
    top:[[-2.24,.78],[-2.12,.92],[-1.9,.95],[-1.5,1.0],[-1.0,1.13],[-.5,1.21],[-.1,1.22],[.25,1.17],[.55,1.02],[.85,.87],[1.2,.82],[1.6,.80],[1.95,.74],[2.15,.64],[2.24,.52]],
    bot:[[-2.24,.42],[-2.1,.24],[-1.8,.17],[1.8,.17],[2.1,.2],[2.24,.27]],
    belt:.88, shoulder:.06, tumble:.17, pf:.85, pfk:.14, pr:.5, prk:.07, rock:.06, R:[.13,.24,.06],
    glass:{f:.86, rf:.3, rr:-.62, r:-1.42, sf:.74, sr:-1.1, b:-.18},
    cls:(f,p)=>{ const ax=Math.abs(p[0]);
      if(f==='top' && p[2]>.9 && ax>.5 && ax<.86) return 'head';
      if(f==='front'){ if(p[1]>.3 && ax>.5 && ax<.86) return 'head'; if(p[1]<.25 && p[1]>-.55 && ax<.6) return 'grille'; if(p[1]<-.55) return 'trim'; }
      if(f==='back'){ if(p[1]>.05 && p[1]<.7 && ax<.93) return 'tail'; if(p[1]<-.35) return 'trim'; }
      return null; },
    rim:{spokes:10, mat:'rim', k:.7}, caliper:true },
  muscle: { L:4.85, W:2.0, zc:0, wr:.355, tw:.28, twR:.31, wf:1.52, wb:-1.42, arch:.05, flare:.035,
    top:[[-2.43,.82],[-2.32,.97],[-2.0,1.0],[-1.6,1.03],[-1.15,1.19],[-.6,1.30],[-.15,1.31],[.2,1.25],[.55,1.01],[.76,.93],[1.4,.91],[2.1,.89],[2.36,.85],[2.43,.76]],
    bot:[[-2.43,.32],[-2.3,.22],[-2.0,.18],[2.0,.18],[2.35,.22],[2.43,.3]],
    belt:.94, shoulder:.07, tumble:.18, pf:.5, pfk:.05, pr:.4, prk:.05, rock:.05, R:[.1,.2,.05],
    glass:{f:.74, rf:.2, rr:-.72, r:-1.38, sf:.58, sr:-1.22, b:-.25},
    cls:(f,p)=>{ const ax=Math.abs(p[0]);
      if(f==='front'){ if(p[1]>-.25 && p[1]<.85 && ax<.94) return 'grille'; if(p[1]<-.5) return 'trim'; }
      if(f==='back'){ if(p[1]>.15 && p[1]<.75 && ax<.92) return 'tail'; if(p[1]<-.4) return 'trim'; }
      return null; },
    rim:{spokes:5, mat:'chrome', k:.68}, caliper:true },
  truck: { L:4.75, W:2.0, zc:0, wr:.47, tw:.34, twR:.34, wf:1.55, wb:-1.48, arch:.07, flare:.05,
    top:[[-2.38,1.08],[-2.3,1.19],[-1.5,1.2],[-.8,1.21],[-.68,1.3],[-.62,1.55],[-.56,1.78],[-.3,1.83],[.3,1.84],[.6,1.7],[.95,1.3],[1.4,1.23],[2.1,1.18],[2.3,1.1],[2.38,.92]],
    bot:[[-2.38,.62],[-2.2,.48],[-1.8,.44],[1.8,.44],[2.2,.5],[2.38,.58]],
    belt:1.27, shoulder:.05, tumble:.12, pf:.45, pfk:.06, pr:.25, prk:.03, rock:.04, R:[.08,.16,.04],
    glass:{f:.93, rf:.55, rr:-.48, r:-.6, sf:.82, sr:-.52, b:.08},
    cls:(f,p,c,n,S)=>{ const ax=Math.abs(p[0]);
      if(f==='top' && c.z<-.8 && c.z>-2.3 && ax<.84) return 'trim';
      if(f==='front'){ if(p[1]>-.1 && ax>.55 && ax<.9) return 'head'; if(p[1]>-.5 && ax<.5) return 'grille'; return 'trim'; }
      if(f==='back'){ if(ax>.74 && ax<.95 && p[1]>-.2 && p[1]<.75) return 'tail'; if(p[1]<-.45) return 'trim'; }
      if(f==='side'){ const a=archTop(S,c.z,.12); if(a && c.y<a+.1) return 'trim'; if(c.y<.62) return 'trim'; }
      return null; },
    rim:{spokes:6, mat:'rimDark', k:.62}, caliper:false },
  mini: { L:3.45, W:1.58, zc:0, wr:.29, tw:.21, twR:.21, wf:1.1, wb:-1.12, arch:.04, flare:0,
    top:[[-1.73,1.0],[-1.71,1.25],[-1.63,1.46],[-1.3,1.53],[-.3,1.55],[.4,1.51],[.75,1.31],[1.05,.93],[1.35,.87],[1.62,.79],[1.73,.62]],
    bot:[[-1.73,.3],[-1.6,.2],[-1.3,.16],[1.3,.16],[1.6,.2],[1.73,.28]],
    belt:.92, shoulder:.04, tumble:.09, pf:.4, pfk:.06, pr:.3, prk:.04, rock:.04, R:[.16,.22,.08],
    glass:{f:1.06, rf:.62, rr:-1.52, r:-1.66, sf:.98, sr:-1.5, b:-.15, back:true}, roofKey:'roof2',
    cls:(f,p)=>{ const ax=Math.abs(p[0]);
      if(f==='front'){ if(p[1]<-.15) return 'trim'; if(ax<.36 && p[1]<.5) return 'grille'; }
      if(f==='back'){ if(p[1]<-.25) return 'trim'; if(ax>.66 && ax<.92 && p[1]>-.2 && p[1]<.45) return 'tail'; }
      return null; },
    rim:{spokes:0, mat:'rim', k:.66}, caliper:false },
  formula: { formula:true, L:5.2, W:1.95, wheels:[[.80,.33,.30,1.75,true],[.78,.355,.38,-1.55,false]], rim:{spokes:8, mat:'rimDark', k:.7}, caliper:true,
    parts:[
      { L:4.66, W:.62, zc:.15, wr:0, top:[[-2.18,.5],[-1.6,.6],[-.95,.77],[-.62,1.0],[-.32,1.05],[-.08,.86],[.25,.72],[.8,.66],[1.6,.55],[2.2,.42],[2.48,.34]], bot:[[-2.18,.2],[-1.5,.12],[2.0,.14],[2.48,.2]],
        belt:9, rockY:.3, shoulder:0, tumble:0, pf:1.7, pfk:.55, pr:.35, prk:.25, rock:.1, R:[.3,.3,.08] },
      { L:2.1, W:1.42, zc:-.35, wr:0, top:[[-1.4,.3],[-.9,.46],[0,.6],[.55,.62],[.7,.52]], bot:[[-1.4,.14],[.7,.14]],
        belt:9, rockY:.3, shoulder:0, tumble:0, pf:.2, pfk:.08, pr:1.3, prk:.62, rock:.08, R:[.25,.3,.1], cls:(f,p)=> f==='front' && p[1]>-.3 ? 'grille' : null } ] },
};
function lut(pts){ const S=new THREE.SplineCurve(pts.map(p=>new THREE.Vector2(p[0],p[1]))).getPoints(pts.length*24);
  for(let i=1;i<S.length;i++) if(S[i].x<=S[i-1].x) S[i].x=S[i-1].x+1e-5;
  return z=>{ if(z<=S[0].x) return S[0].y; const L=S.length-1; if(z>=S[L].x) return S[L].y; let lo=0, hi=L; while(hi-lo>1){ const m=(lo+hi)>>1; if(S[m].x<z) lo=m; else hi=m; } const a=S[lo], b=S[hi]; return a.y+(b.y-a.y)*(z-a.x)/Math.max(1e-6,b.x-a.x); }; }
function prepSpec(S){ if(!S._ok){ S.topF=lut(S.top); S.botF=lut(S.bot); S._ok=true; } return S; }
function archTop(S,z,ext=0){ let a=0; for(const wz of [S.wf,S.wb]){ const ar=S.wr+S.arch+ext, dz=z-wz; if(Math.abs(dz)<ar) a=Math.max(a, S.wr+Math.sqrt(ar*ar-dz*dz)-ext); } return a; }
function widthK(S,z,y,T){ let k=1; const hl=S.L/2, zr=z-S.zc;
  if(zr>hl-S.pf){ const t=(zr-(hl-S.pf))/S.pf; k-=S.pfk*t*t; }
  if(zr<-hl+S.pr){ const t=((-hl+S.pr)-zr)/S.pr; k-=S.prk*t*t; }
  if(y>S.belt){ const cab=sstep(S.belt+.04, S.belt+.2, T), t=y-S.belt; k*=1-cab*(S.shoulder*sstep(0,.05,t)+S.tumble*clamp((t-.05)/Math.max(.1,T-S.belt-.05),0,1)); }
  const rk=S.rockY!=null?S.rockY:S.belt*.5; if(S.rock && y<rk){ const t=(rk-y)/rk; k*=1-S.rock*t*t; }
  if(S.flare && S.wr){ let fl=0; for(const wz of [S.wf,S.wb]) fl=Math.max(fl, Math.exp(-(((z-wz)/.62)**2))); k*=1+S.flare*fl*sstep(S.belt+.02, S.belt-.2, y); }
  return k; }
function mapPt(S, nx, ny, nz){ const z=S.zc+nz*S.L/2, T=S.topF(z), B0=S.botF(z); let B=B0;
  if(S.wr){ const a=archTop(S,z); if(a>B0){ const ax=Math.abs(nx)*S.W/2, tw=Math.max(S.tw,S.twR||0); B=lerp(B0, Math.min(a, T-.07), sstep(S.W/2-tw-.24, S.W/2-tw-.07, ax)); } }
  const y=B+(ny+1)*.5*(T-B); return [nx*S.W/2*widthK(S,z,y,T), y, z]; }
function classify(S, face, p, c, n){
  if(S.cls){ const k=S.cls(face,p,c,n,S); if(k) return k; }
  if(face==='bottom' || n.y<-.5) return 'trim';
  const G=S.glass; if(!G || c.y<S.belt+.03) return 'paint';
  const z=c.z;
  if(face==='top'){ if(z<=G.f && z>=G.r){ if(z<=G.rf && z>=G.rr) return S.roofKey||'paint'; return Math.abs(p[0])>1-S.R[0]*1.15 ? 'paint' : 'glass'; } return 'paint'; }
  if(face==='side'){ if(z<G.sf && z>G.sr){ if(p[1]>1-S.R[1]*1.1) return (S.roofKey && z<=G.rf && z>=G.rr) ? S.roofKey : 'paint'; if(Math.abs(z-G.b)<.05) return 'trim'; return 'glass'; } return 'paint'; }
  if(face==='back' && G.back && c.y>S.belt+.06 && Math.abs(p[0])<.86 && p[1]<.88) return 'glass';
  return 'paint';
}
function smoothNormals(g){ g.computeVertexNormals(); const pos=g.attributes.position, nor=g.attributes.normal, n=pos.count, map=new Map();
  for(let i=0;i<n;i++){ const k=Math.round(pos.getX(i)*2000)+'_'+Math.round(pos.getY(i)*2000)+'_'+Math.round(pos.getZ(i)*2000); let e=map.get(k); if(!e) map.set(k,e=[0,0,0,[]]); e[0]+=nor.getX(i); e[1]+=nor.getY(i); e[2]+=nor.getZ(i); e[3].push(i); }
  for(const e of map.values()){ const l=Math.hypot(e[0],e[1],e[2])||1; for(const i of e[3]) nor.setXYZ(i,e[0]/l,e[1]/l,e[2]/l); } nor.needsUpdate=true; }
function mappedBody(S, segs){
  prepSpec(S); const g=new THREE.BoxGeometry(2,2,2,segs[0],segs[1],segs[2]); g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const pos=g.attributes.position, n=pos.count, orig=new Float32Array(n*3), R=S.R;
  const dens=t=>Math.sign(t)*(1-Math.pow(1-Math.min(1,Math.abs(t)),1.6));
  for(let i=0;i<n;i++){ let x=dens(pos.getX(i)), y=dens(pos.getY(i)), z=dens(pos.getZ(i)); orig[i*3]=x; orig[i*3+1]=y; orig[i*3+2]=z;
    const cx=clamp(x,R[0]-1,1-R[0]), cy=clamp(y,R[1]-1,1-R[1]), cz=clamp(z,R[2]-1,1-R[2]);
    const dx=(x-cx)/R[0], dy=(y-cy)/R[1], dz=(z-cz)/R[2], dl=Math.hypot(dx,dy,dz);
    if(dl>1e-6){ x=cx+dx/dl*R[0]; y=cy+dy/dl*R[1]; z=cz+dz/dl*R[2]; }
    const P=mapPt(S,x,y,z); pos.setXYZ(i,P[0],P[1],P[2]); }
  const FACES=['side','side','top','bottom','front','back'], idx=g.index.array, buckets=new Map();
  const a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3(), e1=new THREE.Vector3(), nrm=new THREE.Vector3(), cen=new THREE.Vector3(), p=[0,0,0];
  for(const gr of g.groups){ const face=FACES[gr.materialIndex];
    // immer ein ganzes Viereck (2 Dreiecke) gemeinsam einordnen → saubere Kanten
    for(let t=gr.start;t<gr.start+gr.count;t+=6){ const q=[idx[t],idx[t+1],idx[t+2],idx[t+4]];
      for(let k=0;k<3;k++) p[k]=(orig[q[0]*3+k]+orig[q[1]*3+k]+orig[q[2]*3+k]+orig[q[3]*3+k])/4;
      a.fromBufferAttribute(pos,q[0]); b.fromBufferAttribute(pos,q[1]); c.fromBufferAttribute(pos,q[2]); e1.fromBufferAttribute(pos,q[3]); cen.copy(a).add(b).add(c).add(e1).multiplyScalar(.25);
      nrm.subVectors(c,b).cross(e1.subVectors(a,b)).normalize();
      const key=classify(S, face, p, cen, nrm); let L=buckets.get(key); if(!L) buckets.set(key,L=[]); for(let j=0;j<6;j++) L.push(idx[t+j]); } }
  const keys=[...buckets.keys()], all=[]; g.clearGroups(); let off=0;
  keys.forEach((k,i)=>{ const L=buckets.get(k); for(let j=0;j<L.length;j++) all.push(L[j]); g.addGroup(off,L.length,i); off+=L.length; });
  g.setIndex(all); smoothNormals(g); g.computeBoundingSphere();
  return { geo:g, keys };
}
function subGeo(geo, start, count){ const idx=geo.index.array, pos=geo.attributes.position, nor=geo.attributes.normal, map=new Map(), P=[], N=[], I=[];
  for(let i=start;i<start+count;i++){ const v=idx[i]; let n=map.get(v); if(n===undefined){ n=P.length/3; map.set(v,n); P.push(pos.getX(v),pos.getY(v),pos.getZ(v)); N.push(nor.getX(v),nor.getY(v),nor.getZ(v)); } I.push(n); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3)); g.setIndex(I); return g; }
function mirrorX(g){ g=g.clone(); g.scale(-1,1,1); const ix=g.index.array; for(let i=0;i<ix.length;i+=3){ const t=ix[i+1]; ix[i+1]=ix[i+2]; ix[i+2]=t; } g.index.needsUpdate=true; return g; }
const cloneAll=g=>Array.isArray(g)?g.map(x=>x.clone()):g.clone();
const sideX=(S,z,y)=>S.W/2*widthK(S,z,y,S.topF(z));
function wheelGeos(r, w, rim){ const key=[r,w,rim.spokes,rim.mat,rim.k].join('|'); if(wheelCache.has(key)) return wheelCache.get(key);
  const seg=[14,24,32][GP().carSeg], hw=w/2, rr=r*rim.k, fx=hw*.72;
  const prof=[[rr*.97,-hw*.86],[r*.9,-hw],[r*.975,-hw*.9],[r,-hw*.55],[r,hw*.55],[r*.975,hw*.9],[r*.9,hw],[rr*.97,hw*.86]].map(q=>new THREE.Vector2(q[0],q[1]));
  const tire=prep(new THREE.LatheGeometry(prof, seg).rotateZ(-Math.PI/2));
  const rimParts=[ new THREE.CylinderGeometry(rr,rr,.05,seg,1,true).rotateZ(-Math.PI/2).translate(hw*.78,0,0), new THREE.RingGeometry(rr*.84, rr, seg).rotateY(Math.PI/2).translate(hw*.8,0,0) ];
  if(rim.spokes){ for(let s=0;s<rim.spokes;s++){ const sp=new THREE.BoxGeometry(.03, rr*.86, rim.spokes>6?.045:.075); sp.translate(0, rr*.5, 0); sp.rotateX(s/rim.spokes*Math.PI*2); sp.translate(fx,0,0); rimParts.push(sp); } }
  else rimParts.push(new THREE.CylinderGeometry(rr*.86,rr*.86,.02,seg).rotateZ(-Math.PI/2).translate(fx-.01,0,0));
  rimParts.push(new THREE.CylinderGeometry(.06,.07,.05,12).rotateZ(-Math.PI/2).translate(fx+.015,0,0));
  const darkParts=[ new THREE.CylinderGeometry(rr*.96,rr*.96,w*.8,seg,1,true).rotateZ(-Math.PI/2), new THREE.CircleGeometry(rr*.95,seg).rotateY(Math.PI/2).translate(fx-.12,0,0), new THREE.CylinderGeometry(rr*.78,rr*.78,.028,seg).rotateZ(-Math.PI/2).translate(fx-.09,0,0) ];
  const out={ tire, rim:mergeList(rimParts.map(g=>prep(g))), dark:mergeList(darkParts.map(g=>prep(g))), cal:prep(new THREE.BoxGeometry(.07, rr*.42, rr*.34).translate(fx-.075, rr*.5, -rr*.22)) };
  wheelCache.set(key,out); return out; }
function plates(add,S,yf,yb){ const zf=S.zc+S.L/2, zb=S.zc-S.L/2;
  add('plate', G_(new THREE.PlaneGeometry(.34,.17), 0,yf,zf+.012)); add('plate', G_(new THREE.PlaneGeometry(.34,.17), 0,yb,zb-.012, 0,Math.PI,0)); }
function mirrors(add,S,z,col='paint'){ for(const sd of [1,-1]){ const y=S.belt+.08, x=(sideX(S,z,y)+.08)*sd; add(col, G_(sph(12), x,y,z, 0,0,0, .07,.055,.11)); add('trim', G_(bx(.1,.03,.05), x-.06*sd, y-.02, z+.02)); } }
const carExtras = {
  sport(T,S,add){ const zf=S.L/2, zb=-S.L/2; mirrors(add,S,.64);
    const wy=S.topF(-1.98)+.2; add('carbon', G_(bx(1.66,.035,.3), 0,wy,-2.0, -.06,0,0));
    for(const sd of [1,-1]){ add('carbon', G_(bx(.02,.16,.36), .83*sd, wy-.03, -2.0)); add('trim', G_(bx(.035,.2,.07), .5*sd, wy-.11, -1.97)); }
    add('carbon', G_(bx(S.W*.84,.025,.22), 0,.165, zf-.12));
    for(const sd of [1,-1]) add('carbon', G_(bx(.05,.06,1.95), (sideX(S,0,.22)-.01)*sd, .2, .02));
    add('carbon', G_(bx(S.W*.62,.05,.25), 0,.22, zb+.1));
    for(const sd of [1,-1]){ add('chrome', G_(cyl(.048,.052,.18,14), .38*sd,.3,zb+.03, Math.PI/2,0,0)); add('grille', G_(cyl(.034,.034,.19,12), .38*sd,.3,zb+.02, Math.PI/2,0,0)); T.exhaust.push([.38*sd,.3,zb-.08]); }
    plates(add,S,.36,.56); },
  muscle(T,S,add){ const zf=S.L/2, zb=-S.L/2; mirrors(add,S,.55);
    const sy=S.topF(1.25); add('paint', G_(sph(16), 0,sy-.01,1.25, 0,0,0, .3,.085,.55)); add('grille', G_(bx(.32,.06,.03), 0,sy+.035,1.78));
    for(const sd of [1,-1]) for(const xx of [.6,.8]){ add('head', G_(cyl(.075,.075,.04,16), xx*sd,.6,zf+.005, Math.PI/2,0,0)); add('chrome', G_(new THREE.TorusGeometry(.08,.012,6,18), xx*sd,.6,zf+.02)); }
    add('chrome', G_(bx(S.W*.9,.05,.06), 0,.36,zf+.01)); add('chrome', G_(bx(S.W*.9,.05,.06), 0,.38,zb-.01));
    add('paint', G_(bx(S.W*.76,.04,.14), 0,S.topF(-2.3)+.03,-2.32, .2,0,0));
    for(const sd of [1,-1]) for(const xx of [.42,.55]){ add('chrome', G_(cyl(.04,.044,.16,12), xx*sd,.28,zb+.03, Math.PI/2,0,0)); T.exhaust.push([xx*sd,.28,zb-.08]); }
    plates(add,S,.45,.6); },
  truck(T,S,add){ const zf=S.L/2, zb=-S.L/2; mirrors(add,S,.86,'trim');
    const ly=S.topF(.35)+.06; add('trim', G_(bx(1.3,.07,.12), 0,ly,.4)); for(const x of [-.45,-.15,.15,.45]) add('head', G_(bx(.22,.05,.02), x,ly,.465));
    for(const sd of [1,-1]){ add('trim', rod([.45*sd,.55,zf+.1],[.45*sd,1.02,zf+.06],.03)); add('trim', rod([.8*sd,1.2,-.85],[.74*sd,1.62,-.85],.04)); add('trim', G_(bx(.12,.04,1.6), (sideX(S,0,.55)+.06)*sd,.5,.05)); add('trim', G_(bx(.3,.28,.02), (sideX(S,-2,.6)-.25)*sd,.6,S.wb-.6)); }
    add('trim', rod([-.5,1.02,zf+.06],[.5,1.02,zf+.06],.03)); add('trim', rod([-.62,.78,zf+.12],[.62,.78,zf+.12],.03)); add('trim', rod([-.74,1.62,-.85],[.74,1.62,-.85],.04));
    const sx=-(sideX(S,.86,1.4)+.05); add('trim', rod([sx,1.0,.88],[sx,1.78,.8],.045)); add('trim', G_(bx(.12,.1,.14), sx,1.8,.84));
    add('rimDark', G_(bx(1.1,.03,.5), 0,.46,zf-.15, .25,0,0));
    add('tire', G_(wheelGeos(.42,.26,S.rim).tire.clone(), 0,1.34,-1.6, 0,0,Math.PI/2));
    T.exhaust.push([.6,.48,zb-.05]); plates(add,S,.64,.78); },
  mini(T,S,add){ const zf=S.L/2; mirrors(add,S,.95);
    for(const sd of [1,-1]){ add('head', G_(cyl(.1,.1,.05,18), .5*sd,.52,zf+.012, Math.PI/2,0,0)); add('chrome', G_(new THREE.TorusGeometry(.105,.014,6,20), .5*sd,.52,zf+.03)); }
    T.exhaust.push([.4,.24,-S.L/2-.05]); plates(add,S,.36,.5); },
  formula(T,S,add){ const top=prepSpec(S.parts[0]);
    add('interior', G_(sph(16), 0,top.topF(.2)-.02,.2, 0,0,0, .27,.07,.48));
    add('helmet', G_(sph(16), 0,.84,-.02, 0,0,0, .15,.15,.17)); add('visor', G_(bx(.2,.06,.08), 0,.86,.11));
    add('carbon', G_(new THREE.TorusGeometry(.32,.028,8,20,Math.PI), 0,.98,-.12, Math.PI/2,0,0)); add('carbon', rod([0,.98,.2],[0,.72,.42],.03));
    add('carbon', G_(bx(1.92,.025,.36), 0,.14,2.58)); add('paint', G_(bx(1.74,.02,.18), 0,.2,2.46, -.35,0,0));
    add('carbon', G_(bx(1.02,.03,.32), 0,.94,-2.36)); add('paint', G_(bx(1.02,.025,.2), 0,1.04,-2.48, .3,0,0)); add('carbon', G_(bx(.04,.42,.1), 0,.66,-2.22));
    add('tail', G_(bx(.12,.06,.03), 0,.4,-2.36));
    for(const sd of [1,-1]){ add('paint', G_(bx(.02,.2,.46), .96*sd,.2,2.56)); add('paint', G_(bx(.02,.42,.58), .51*sd,.86,-2.38)); add('carbon', rod([.1*sd,.16,2.5],[.08*sd,.3,2.32],.02));
      add('carbon', rod([.22*sd,.42,1.95],[.66*sd,.35,1.75],.016)); add('carbon', rod([.22*sd,.3,1.55],[.66*sd,.3,1.75],.016)); add('carbon', rod([.2*sd,.3,2.0],[.66*sd,.28,1.78],.016));
      add('carbon', rod([.3*sd,.42,-1.3],[.62*sd,.38,-1.55],.018)); add('carbon', rod([.3*sd,.26,-1.75],[.62*sd,.3,-1.55],.018));
      add('paint', G_(sph(10), .52*sd,.74,.5, 0,0,0, .07,.04,.1)); add('carbon', rod([.32*sd,.62,.5],[.48*sd,.73,.5],.012)); }
    T.exhaust.push([0,.5,-2.34]); },
};
function carTemplate(type){ if(carTemplates.has(type)) return carTemplates.get(type);
  const S=CAR_SPECS[type], seg=[[8,10,26],[12,16,44],[16,22,64]][GP().carSeg], segLo=[8,10,22], lod=GP().lod>0;
  const T={ bodies:[], lo:[], parts:{}, wheels:[], rear:[], exhaust:[], S };
  const add=(k,g)=>{ prep(g,k==='plate'); (T.parts[k]||(T.parts[k]=[])).push(g); };
  const bodies = S.formula ? S.parts : [S];
  for(const B of bodies){ T.bodies.push(mappedBody(B,seg)); if(lod) T.lo.push(mappedBody(B,segLo)); }
  carExtras[type](T,S,add);
  if(S.formula){ for(const [x,r,w,z,front] of S.wheels) for(const sd of [1,-1]) T.wheels.push({x:x*sd, r, w, z, front, sd}); }
  else for(const [z,w,front] of [[S.wf,S.tw,true],[S.wb,S.twR||S.tw,false]]){ const x=sideX(S,z,S.wr)-w/2-.025; for(const sd of [1,-1]) T.wheels.push({x:x*sd, r:S.wr, w, z, front, sd}); }
  T.rear=T.wheels.filter(w=>!w.front).map(w=>[w.x, w.z]);
  if(BGU){ for(const b of T.bodies) b.geo.groups.forEach(gr=>add(b.keys[gr.materialIndex], subGeo(b.geo, gr.start, gr.count))); T.bodies=[];
    const rw=T.wheels.filter(w=>!w.front), WG=wheelGeos(rw[0].r, rw[0].w, S.rim), side=(g,w)=>(w.sd>0?g.clone():mirrorX(g)).translate(w.x,0,0);
    const one=g=>Array.isArray(g)?mergeList(g.map(x=>x.clone())):g;
    T.rearAxle={ r:rw[0].r, z:rw[0].z, tire:mergeList(rw.map(w=>side(one(WG.tire),w))), rim:mergeList(rw.map(w=>side(one(WG.rim),w))), dark:mergeList(rw.map(w=>side(one(WG.dark),w))) };
    if(S.caliper) rw.forEach(w=>add('caliper', side(WG.cal,w).translate(0,w.r,w.z))); }
  for(const k in T.parts) T.parts[k]=mergeList(T.parts[k]);
  if(lod) T.loWheels=mergeList(T.wheels.map(w=>prep(new THREE.CylinderGeometry(w.r,w.r,w.w,12).rotateZ(Math.PI/2).translate(w.x,w.r,w.z))));
  carTemplates.set(type,T); return T; }
const BLOBG=new THREE.PlaneGeometry(1,1);
function instCar(type, paint){
  const T=carTemplate(type), S=T.S, Mt=carMats(), pm=paintMat(paint), tail=tailMat(), hq=HQ();
  const matFor=k=>k==='paint'?pm : k==='tail'?tail : k==='roof2'?paintMat('#f3f4f6') : (Mt[k]||pm);
  const mk=(geo,m)=>{ if(Array.isArray(geo)){ const g=new THREE.Group(); geo.forEach(x=>g.add(mk(x,m))); return g; } const o=new THREE.Mesh(geo,m); o.castShadow=hq; o.receiveShadow=hq; return o; };
  const root=new THREE.Group(), hi=new THREE.Group(), body=new THREE.Group(); hi.add(body);
  for(const b of T.bodies) body.add(mk(b.geo, b.keys.map(matFor)));
  for(const k in T.parts){ const o=mk(T.parts[k], matFor(k)); if(k==='glass'||k==='plate'||k==='head'||k==='tail') o.castShadow=false; if(k==='tail') o.userData.ownMat=true; body.add(o); }
  const wheels=[], front=[];
  if(T.rearAxle){ const A=T.rearAxle, spin=new THREE.Group(); spin.position.set(0,A.r,A.z); spin.add(mk(A.tire,Mt.tire)); spin.add(mk(A.rim,Mt[S.rim.mat])); spin.add(mk(A.dark,Mt.rimDark)); hi.add(spin); wheels.push(spin); }
  for(const w of T.wheels){ if(T.rearAxle && !w.front) continue; const WG=wheelGeos(w.r,w.w,S.rim), hub=new THREE.Group(); hub.position.set(w.x,w.r,w.z); if(w.sd<0) hub.scale.x=-1;
    const spin=new THREE.Group(); spin.add(mk(WG.tire,Mt.tire)); spin.add(mk(WG.rim,Mt[S.rim.mat])); spin.add(mk(WG.dark,Mt.rimDark)); hub.add(spin);
    if(S.caliper) hub.add(mk(WG.cal,Mt.caliper)); hi.add(hub); wheels.push(spin); if(w.front) front.push(hub); }
  if(GP().lod && T.lo.length){ const lo=new THREE.Group(); for(const b of T.lo) lo.add(mk(b.geo, b.keys.map(matFor))); if(T.loWheels) lo.add(mk(T.loWheels, Mt.tire)); const L=new THREE.LOD(); L.addLevel(hi,0); L.addLevel(lo,GP().lod); root.add(L); }
  else root.add(hi);
  const blob=new THREE.Mesh(BLOBG, Mt.shadow); blob.rotation.x=-Math.PI/2; blob.scale.set(S.W+.7, S.L+.9, 1); blob.position.y=.03; root.add(blob);
  root.userData={ wheels, front, wr:T.wheels[0].r, body, tail, rear:T.rear, exhaust:T.exhaust };
  return root; }
const gltfCache = {};
const loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
// PACK_FLIP: Modelle, die im Paket rückwärts stehen
const PACK_URL='models/cars.glb', PACK_FRONT=1, PACK_FLIP=new Set(['Sport_body','Offroad_Body','SUV_Body','Wagon_Body']); let PACK=null, PACKSTATE='idle'; const packWaiters=[], packTpl=new Map();
function loadPack(){ if(PACKSTATE!=='idle'||!loader) return; PACKSTATE='loading';
  loader.load(PACK_URL, g=>{ PACK=g.scene; PACK.updateMatrixWorld(true); PACKSTATE='ok'; packWaiters.splice(0).forEach(f=>{ try{ f(); }catch(e){ console.warn(e); } }); }, undefined, e=>{ PACKSTATE='fail'; console.warn('Autopaket nicht ladbar', e); }); }
function packTemplate(name){ const key=name+activeGfx; if(packTpl.has(key)) return packTpl.get(key);
  const body=PACK.getObjectByName(name); if(!body) return null; const root=body.parent, box=new THREE.Box3().setFromObject(body), ex=box.clone().expandByScalar(box.getSize(new THREE.Vector3()).length()*.02);
  const tpl=new THREE.Group(), add=o=>{ const c=o.clone(true); o.matrixWorld.decompose(c.position,c.quaternion,c.scale); tpl.add(c); return c; };
  const b=add(body); b.userData.body=true;
  const cand=[];
  for(const o of root.children){ if(!/^Wheel/i.test(o.name)) continue; const wb=new THREE.Box3().setFromObject(o); if(wb.isEmpty()) continue; const wc=wb.getCenter(new THREE.Vector3()), bc=box.getCenter(new THREE.Vector3()); if(!ex.containsPoint(wc) || wc.y>bc.y) continue; cand.push([o,Math.hypot(wc.x-bc.x,wc.z-bc.z)]); }
  cand.sort((p,q)=>p[1]-q[1]).slice(0,4).forEach(([o])=>{ add(o).userData.wheel=true; });
  // Normieren: Längsachse → z, Mitte auf 0, Boden auf 0, Sportwagen = 4,4 m
  // Ausrichten an den vier Rädern: die Achse des Radstands (längste Hauptachse) wird zur Fahrtrichtung z
  const ws=tpl.children.filter(c=>c.userData.wheel).map(c=>new THREE.Box3().setFromObject(c).getCenter(new THREE.Vector3()));
  if(ws.length>=3){ let mx=0,mz=0; ws.forEach(p=>{ mx+=p.x; mz+=p.z; }); mx/=ws.length; mz/=ws.length; let sxx=0,szz=0,sxz=0; ws.forEach(p=>{ const dx=p.x-mx, dz=p.z-mz; sxx+=dx*dx; szz+=dz*dz; sxz+=dx*dz; });
    tpl.rotation.y=.5*Math.atan2(2*sxz, sxx-szz)-Math.PI/2; tpl.updateMatrixWorld(true); }
  let bb=new THREE.Box3().setFromObject(tpl), sz=bb.getSize(new THREE.Vector3());
  if(!packTpl.scale){ const sp=PACK.getObjectByName('Sport_body'); const sb=sp?new THREE.Box3().setFromObject(sp).getSize(new THREE.Vector3()):sz; packTpl.scale=4.4/Math.max(sb.x,sb.z); }
  const k=packTpl.scale, wrap=new THREE.Group(); wrap.add(tpl); tpl.position.set(-(bb.min.x+bb.max.x)/2,-bb.min.y,-(bb.min.z+bb.max.z)/2); wrap.scale.setScalar(k); if((PACK_FRONT<0) !== PACK_FLIP.has(name)) wrap.rotation.y=Math.PI;
  const out=new THREE.Group(); out.add(wrap); out.updateMatrixWorld(true);
  const T={ group:out, L:sz.z*k, W:sz.x*k, wheels:[] };
  tpl.children.forEach(c=>{ if(c.userData.wheel){ const wb=new THREE.Box3().setFromObject(c); const ctr=wb.getCenter(new THREE.Vector3()); c.userData.c=ctr; c.userData.r=wb.getSize(new THREE.Vector3()).y/2; } });
  out.traverse(o=>{ if(o.isMesh){ o.castShadow=o.receiveShadow=HQ(); } });
  packTpl.set(key,T); return T; }
function instPack(def, paint){ const T=packTemplate(def.pack); if(!T) return null;
  const root=T.group.clone(true); root.updateMatrixWorld(true);
  const body=new THREE.Group(), wheels=[], front=[], rear=[]; let wr=.35; root.add(body); const pm=paintMat(paint);
  const parts=[]; root.traverse(o=>{ if(o.userData.wheel||o.userData.body) parts.push(o); });
  for(const o of parts){ if(o.userData.body){ body.attach(o); o.traverse(m=>{ if(m.isMesh && m.material && /^Body/i.test(m.material.name||'')) m.material=pm; }); continue; }
    const c=root.worldToLocal(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())); wr=new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y/2;
    const hub=new THREE.Group(); hub.position.copy(c); root.add(hub); const spin=new THREE.Group(); hub.add(spin); root.updateMatrixWorld(true); spin.attach(o);
    wheels.push(spin); if(c.z>0) front.push(hub); else rear.push([c.x,c.z]); }
  const Mt=carMats(), blob=new THREE.Mesh(BLOBG, Mt.shadow); blob.rotation.x=-Math.PI/2; blob.scale.set(T.W+.6, T.L+.8, 1); blob.position.y=.03; root.add(blob);
  root.userData={ wheels, front, wr, body, rear, exhaust:[[.4,.32,-T.L/2-.05],[-.4,.32,-T.L/2-.05]] };
  return root; }
function createCarMesh(def, paint){
  const outer=new THREE.Group(); outer.rotation.order='YXZ';
  let inner = def.pack && PACKSTATE==='ok' ? instPack(def,paint) : null;
  if(!inner) inner=instCar(def.type, paint);
  outer.add(inner); outer.userData.inner=inner;
  if(def.pack && PACKSTATE!=='ok' && PACKSTATE!=='fail'){ loadPack(); packWaiters.push(()=>{ const n=instPack(def,paint); if(!n) return; outer.remove(outer.userData.inner); outer.add(n); outer.userData.inner=n; }); }
  return outer;
}
// Geometrien der Autos werden geteilt – nur eigene Materialien/Texturen freigeben
function disposeTree(o){ o.traverse(c=>{ if(c.isSprite && c.material){ if(c.material.map) c.material.map.dispose(); c.material.dispose(); } else if(c.userData && c.userData.ownMat && c.material && c.material.dispose) c.material.dispose(); }); }
function makeLabel(text, color){ const c=document.createElement('canvas'); c.width=256; c.height=64; const g=c.getContext('2d');
  let fs=32; g.font=`italic bold ${fs}px "Chakra Petch",Arial`; while(g.measureText(text).width>222 && fs>14){ fs-=2; g.font=`italic bold ${fs}px "Chakra Petch",Arial`; } const w=Math.min(250,g.measureText(text).width+28); g.fillStyle='rgba(14,17,24,.78)'; g.fillRect(128-w/2,8,w,48); g.fillStyle=color; g.fillRect(128-w/2,8,6,48);
  g.fillStyle='#fff'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,131,33);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,transparent:true,toneMapped:false})); s.scale.set(3.6,.9,1); s.position.y=2.9; s.renderOrder=5; return s; }

/* ---------- Showroom (Menühintergrund) ---------- */
const show = { scene:null, cam:new THREE.PerspectiveCamera(36,1,.1,200), car:null, t:0, env:null };
function buildShowroom(){
  const sc=new THREE.Scene(), hq=HQ(); show.scene=sc; sc.background=C('#0c0f14');
  if(hq){ const st=new THREE.Scene(); st.add(new THREE.Mesh(new THREE.SphereGeometry(30,32,16), new THREE.MeshBasicMaterial({color:new THREE.Color(.025,.03,.04), side:THREE.BackSide})));
    const panel=(w,h,x,y,z,rx,ry,col)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({color:col, side:THREE.DoubleSide})); m.position.set(x,y,z); m.rotation.set(rx,ry,0); st.add(m); };
    panel(26,8,0,22,0,Math.PI/2,0,new THREE.Color(4,4,4.2)); panel(12,10,-22,6,4,0,Math.PI/2,new THREE.Color(2.2,2.2,2.4)); panel(12,10,22,6,-6,0,-Math.PI/2,new THREE.Color(1.6,1.7,2)); panel(30,2.5,0,4,-24,0,0,new THREE.Color(3,.5,1.5));
    const pm=new THREE.PMREMGenerator(renderer); if(show.env) show.env.dispose(); show.env=pm.fromScene(st,.02).texture; pm.dispose(); sc.environment=show.env; }
  sc.add(new THREE.HemisphereLight(C('#9fb0c8'), C('#101318'), hq?.35:.9));
  const key=new THREE.SpotLight(0xffffff, hq?2.4:1.1, 40, .6, .6, 1); key.position.set(4,9,6); sc.add(key, key.target);
  if(hq){ key.castShadow=true; key.shadow.mapSize.set(1024,1024); key.shadow.bias=-.0004; }
  const rim=new THREE.DirectionalLight(C('#ff2e88'), hq?1.6:.8); rim.position.set(-6,3,-5); sc.add(rim);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(30,64), mat('#15191f',{roughness:.35, metalness:.3})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; sc.add(floor);
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(3.6,3.6,.08,64), mat('#1e242c',{roughness:.22, metalness:.6})); disk.position.y=.04; disk.receiveShadow=true; sc.add(disk);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(3.6,.035,8,96), basic('#ff2e88',{toneMapped:false})); ring.rotation.x=Math.PI/2; ring.position.y=.08; sc.add(ring);
  show.car=null; refreshShowCar(); }
function refreshShowCar(){ if(!show.scene) return; if(show.car){ show.scene.remove(show.car); disposeTree(show.car); } show.car=createCarMesh(carById(gView), owned(gView)?cfg.paint:carById(gView).paint); show.car.position.y=.08; show.scene.add(show.car); }
applyGfx();
