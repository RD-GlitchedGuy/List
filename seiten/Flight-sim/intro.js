(function(){let d='';for(let k=0;k<16;k++){const a=k*Math.PI/8,m=k%2===0,r1=m?54:56,r2=m?76:68;d+=`M${(Math.cos(a)*r1).toFixed(1)},${(Math.sin(a)*r1).toFixed(1)}L${(Math.cos(a)*r2).toFixed(1)},${(Math.sin(a)*r2).toFixed(1)}`;}
document.getElementById('siRays').setAttribute('d',d);
const ov=document.getElementById('skyIntro');let done=false,gone=false;
function finish(){if(gone)return;gone=true;ov.classList.add('out');setTimeout(()=>ov.remove(),700);}
function tryEnd(){if(done&&window.__skyReady)finish();}
setTimeout(()=>{done=true;tryEnd();},6200);addEventListener('skyready',tryEnd);setTimeout(finish,45000);})();
