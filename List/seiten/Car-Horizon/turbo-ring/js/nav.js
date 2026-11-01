/* ---------- Navi wie in Forza: Ideallinie mit Bremsfarben + Wegpunkte auf der Karte ----------
   Blau = alles gut, Gelb = Gas weg, Rot = bremsen, du bist zu schnell für die Kurve.
   Wegpunkt: auf der großen Karte auf eine freie Stelle tippen (nochmal antippen = löschen). */
const NAV={ w:null, nodes:null, adj:null, target:null, route:null, acc:9, mesh:null, beacon:null, pos:null, col:null };
const NAV_S=3, NAV_AHEAD=240;

function navBuild(){ const nodes=[], adj=[], link=(a,b)=>{ const d=Math.hypot(nodes[a].x-nodes[b].x, nodes[a].z-nodes[b].z); adj[a].push([b,d]); adj[b].push([a,d]); };
  for(const r of W.roads){ r.navBase=nodes.length; let prev=-1; for(let i=0;i<r.N;i+=NAV_S){ const p=r.pts[i]; nodes.push({x:p.x,z:p.z,r,i}); adj.push([]); if(prev>=0) link(prev,nodes.length-1); prev=nodes.length-1; } if(r.loop) link(prev, r.navBase); }
  // Kreuzungen: Punkte verschiedener Straßen, die nah beieinander liegen, verbinden
  const G=new Map(), key=(x,z)=>Math.floor(x/20)+'_'+Math.floor(z/20);
  nodes.forEach((n,k)=>{ const kk=key(n.x,n.z); (G.get(kk)||G.set(kk,[]).get(kk)).push(k); });
  nodes.forEach((n,k)=>{ const gx=Math.floor(n.x/20), gz=Math.floor(n.z/20); for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) for(const j of G.get((gx+a)+'_'+(gz+b))||[]){ const m=nodes[j];
    if(j>k && m.r!==n.r && Math.hypot(m.x-n.x,m.z-n.z)<9 && Math.abs(m.r.pts[m.i].y-n.r.pts[n.i].y)<3) link(k,j); } });
  NAV.nodes=nodes; NAV.adj=adj; }
function navNode(x,z){ const q=roadQuery(x,z); if(q && q.d<ROAD_W) { const r=q.r, k=Math.round(q.i/NAV_S); return r.navBase+Math.min(k, Math.ceil(r.N/NAV_S)-1); }
  let best=0, bd=1e18; NAV.nodes.forEach((n,k)=>{ const d=(n.x-x)**2+(n.z-z)**2; if(d<bd){ bd=d; best=k; } }); return best; }
function navPath(from, to){ const N=NAV.nodes.length, dist=new Float64Array(N).fill(Infinity), prev=new Int32Array(N).fill(-1), H=[[0,from]]; dist[from]=0;
  const push=e=>{ H.push(e); let i=H.length-1; while(i>0){ const p=(i-1)>>1; if(H[p][0]<=H[i][0]) break; [H[p],H[i]]=[H[i],H[p]]; i=p; } };
  const pop=()=>{ const top=H[0], last=H.pop(); if(H.length){ H[0]=last; let i=0; for(;;){ const l=2*i+1, r=l+1; let m=i; if(l<H.length&&H[l][0]<H[m][0]) m=l; if(r<H.length&&H[r][0]<H[m][0]) m=r; if(m===i) break; [H[m],H[i]]=[H[i],H[m]]; i=m; } } return top; };
  while(H.length){ const [d,u]=pop(); if(u===to) break; if(d>dist[u]) continue; for(const [v,w] of NAV.adj[u]){ const nd=d+w; if(nd<dist[v]){ dist[v]=nd; prev[v]=u; push([nd,v]); } } }
  if(prev[to]<0 && from!==to) return null; const ids=[]; for(let u=to;u>=0;u=prev[u]) ids.push(u); ids.reverse();
  // Knoten in die feinen Straßenpunkte auflösen (für eine glatte Linie)
  const out=[]; for(let k=0;k<ids.length;k++){ const a=NAV.nodes[ids[k]], b=k+1<ids.length?NAV.nodes[ids[k+1]]:null; out.push(a.r.pts[a.i]);
    if(b && b.r===a.r){ const r=a.r; let di=b.i-a.i; if(r.loop){ if(di>r.N/2) di-=r.N; if(di<-r.N/2) di+=r.N; } if(Math.abs(di)<=NAV_S*2) for(let s=1;s<Math.abs(di);s++){ let i=a.i+Math.sign(di)*s; if(r.loop) i=(i+r.N)%r.N; out.push(r.pts[i]); } } }
  return out; }

function navSetTarget(x,z){ if(NAV.w!==W) navReset(); if(!NAV.nodes) navBuild(); const k=navNode(x,z), n=NAV.nodes[k]; NAV.target={x:n.x, z:n.z, node:k}; NAV.acc=9; toast('📍 Wegpunkt gesetzt'); }
function navClear(){ NAV.target=null; NAV.route=null; }
function navReset(){ NAV.w=W; NAV.nodes=null; NAV.target=null; NAV.route=null; NAV.mesh=null; NAV.beacon=null; }

function navMesh(){ const MAX=Math.ceil(NAV_AHEAD/2.4)+4, g=new THREE.BufferGeometry(); NAV.pos=new Float32Array(MAX*6); NAV.col=new Float32Array(MAX*6); const uv=new Float32Array(MAX*4), idx=[];
  for(let i=0;i<MAX-1;i++){ const a=i*2; idx.push(a,a+1,a+2, a+1,a+3,a+2); }
  g.setAttribute('position',new THREE.BufferAttribute(NAV.pos,3)); g.setAttribute('color',new THREE.BufferAttribute(NAV.col,3)); g.setAttribute('uv',new THREE.BufferAttribute(uv,2)); g.setIndex(idx);
  const tex=canvasTex(64,64,(c,w,h)=>{ c.clearRect(0,0,w,h); c.fillStyle='#fff'; c.beginPath(); c.moveTo(6,h-6); c.lineTo(w/2,18); c.lineTo(w-6,h-6); c.lineTo(w-24,h-6); c.lineTo(w/2,42); c.lineTo(24,h-6); c.closePath(); c.fill(); }, false);
  const m=new THREE.MeshBasicMaterial({map:tex, vertexColors:true, transparent:true, opacity:1, depthWrite:false, toneMapped:false, polygonOffset:true, polygonOffsetFactor:-4, side:THREE.DoubleSide});
  NAV.mesh=new THREE.Mesh(g,m); NAV.mesh.frustumCulled=false; NAV.mesh.renderOrder=3; NAV.max=MAX; W.scene.add(NAV.mesh);
  const bm=basic('#29d9ff',{transparent:true,opacity:.4,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide});
  NAV.beacon=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,160,20,1,true), bm); NAV.beacon.visible=false; W.scene.add(NAV.beacon); }

const _nc=new THREE.Color();
function navUpdate(dt){ const me=game.me; if(!W||!me||game.mode!=='roam') return; if(NAV.w!==W) navReset(); if(!NAV.mesh) navMesh();
  const race=game.race && me.inRace ? game.race : null; let pts=null, start=0;
  if(race){ const r=race.road; pts=r.pts; start=me.ridx||0; }
  else if(NAV.target){ const T=NAV.target; if(Math.hypot(me.x-T.x, me.z-T.z)<30){ navClear(); toast('🏁 Ziel erreicht'); blip(880,.15,'sine',.12); blip(1320,.2,'sine',.1,.12); }
    else { NAV.acc+=dt; if(!NAV.route || NAV.acc>2){ NAV.acc=0; if(!NAV.nodes) navBuild(); NAV.route=navPath(navNode(me.x,me.z), T.node); if(NAV.route){ const r0=NAV.route[0], gap=Math.hypot(r0.x-me.x,r0.z-me.z), lead=[]; for(let s=0;s<gap;s+=2.5){ const f=s/gap, x=lerp(me.x,r0.x,f), z=lerp(me.z,r0.z,f); lead.push({x,z,y:surfaceAt(x,z,false)}); } NAV.route=lead.concat(NAV.route); } } pts=NAV.route; } }
  NAV.beacon.visible=!race && !!NAV.target; if(NAV.beacon.visible){ NAV.beacon.position.set(NAV.target.x, surfaceAt(NAV.target.x,NAV.target.z)+80, NAV.target.z); }
  const nd=$('#navDist'); if(nd){ const on=!race && NAV.target && NAV.route; nd.hidden=!on; if(on){ let d=0; const R=NAV.route; for(let i=1;i<R.length;i++) d+=Math.hypot(R[i].x-R[i-1].x,R[i].z-R[i-1].z); nd.textContent='📍 '+(d>=1000?(d/1000).toFixed(1)+' km':Math.round(d)+' m'); } }
  if(!pts || !cfg.navline || pts.length<3){ NAV.mesh.visible=false; return; }
  // Nächsten Punkt vor dem Auto suchen
  const loop=!!race && race.road.loop, L=pts.length, at=i=>pts[loop?((i%L)+L)%L:Math.min(L-1,Math.max(0,i))];
  if(!race){ let bd=1e18; for(let i=0;i<L;i++){ const p=pts[i], d=(p.x-me.x)**2+(p.z-me.z)**2; if(d<bd){ bd=d; start=i; } } }
  const v=Math.abs(me.fwd||0), aLat=(me.def.grip||7)*1.05, BRAKE=13, H=2.2, P=NAV.pos, Cc=NAV.col; let n=0, dist=0, prev=null;
  for(let k=0;n<NAV.max && dist<NAV_AHEAD;k++){ const i=start+k; if(!loop && i>=L) break; const p=at(i); if(prev) dist+=Math.hypot(p.x-prev.x,p.z-prev.z); prev=p; if(dist<3.5) continue;
    const a=at(i-2), b=at(i+2), tx=b.x-a.x, tz=b.z-a.z, tl=Math.hypot(tx,tz)||1, nx=-tz/tl, nz=tx/tl;
    // Kurvenradius aus drei Punkten → sichere Geschwindigkeit → nötige Bremsverzögerung
    const c=at(i+6), d0=at(i-6), ax=p.x-d0.x, az=p.z-d0.z, bx=c.x-p.x, bz=c.z-p.z, cr=Math.abs(ax*bz-az*bx), la=Math.hypot(ax,az), lb=Math.hypot(bx,bz), lc=Math.hypot(c.x-d0.x,c.z-d0.z);
    const R=cr>1e-3 ? la*lb*lc/(2*cr) : 1e4, vs=Math.min(me.def.maxSpeed, Math.sqrt(aLat*R)), need=(v*v-vs*vs)/(2*Math.max(dist,2))/BRAKE;
    if(need>.55) _nc.set('#ff2a3a'); else if(need>.2) _nc.set('#ffc42e'); else _nc.set('#29b6ff'); if(HQ()) _nc.convertSRGBToLinear();
    const y=Math.max(p.y, surfaceAt(p.x,p.z))+.18, f=Math.min(1,(dist-3.5)/5);
    P.set([p.x+nx*H, y, p.z+nz*H, p.x-nx*H, y, p.z-nz*H], n*6); for(let s=0;s<2;s++){ Cc[n*6+s*3]=_nc.r*f; Cc[n*6+s*3+1]=_nc.g*f; Cc[n*6+s*3+2]=_nc.b*f; }
    NAV.mesh.geometry.attributes.uv.array.set([0,dist/2.6, 1,dist/2.6], n*4); n++; }
  const g=NAV.mesh.geometry; g.setDrawRange(0, Math.max(0,(n-1)*6)); g.attributes.position.needsUpdate=g.attributes.color.needsUpdate=g.attributes.uv.needsUpdate=true; NAV.mesh.visible=n>1; }

/* Route auf Minimap / großer Karte zeichnen (Kontext ist bereits in Kartenpixeln transformiert) */
function navDrawMap(c, lw, limit){ if(!NAV.target || !NAV.route || (game.race&&game.me&&game.me.inRace)) return; const R=NAV.route; c.beginPath();
  for(let i=0;i<Math.min(R.length,limit||1e9);i++){ const [a,b]=m2p(R[i].x,R[i].z); i?c.lineTo(a,b):c.moveTo(a,b); }
  c.lineWidth=lw; c.strokeStyle='#29b6ff'; c.lineJoin=c.lineCap='round'; c.stroke();
  const [tx,ty]=m2p(NAV.target.x,NAV.target.z); c.beginPath(); c.arc(tx,ty,lw*2.2,0,7); c.fillStyle='#29d9ff'; c.fill(); c.lineWidth=lw*.6; c.strokeStyle='#fff'; c.stroke(); }
