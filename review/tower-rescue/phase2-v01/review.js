const prefix='../../../assets/candidates/tower-rescue/v01/';
const params=new URLSearchParams(location.search);
let orientation=params.get('orientation')||'landscape',state=params.get('state')||'powered';
const screen=document.querySelector('#screen');
const img=(name,cls)=>'<img class="'+cls+'" src="'+prefix+name+'.png" alt="'+name+'">';
function render(){
 const portrait=orientation==='portrait',needed=portrait?20:15,cell=portrait?10:7;
 screen.className='screen '+orientation+' '+state;
 let room='<div class="room">'+img('machine-room-back','backdrop')+'<div class="roof"><div class="monitor">'+[5,9,7,14,12,9,6].map(h=>'<i style="height:'+h+'px"></i>').join('')+'</div><div class="relays"><i></i><i></i><i></i></div></div>';
 const names=['PASSENGER LIFT','FREIGHT LIFT','AIR FANS'];
 for(let n=0;n<3;n++){
  const off=n===1&&state==='install',left=portrait?[25,201.7,378.3][n]:[25,166.4,307.7][n];
  const status=off?'NO POWER':n===1?'FULL POWER':'RUNNING';
  room+='<div class="system '+(off?'off':'')+'" style="left:'+left+'px" data-system="'+n+'"><div class="name">'+names[n]+'</div><div class="status '+(off?'off':'')+'">'+status+'</div>';
  if(n<2){
   room+=img(portrait?'shaft-frame-compact':'shaft-frame','housing')+img('motor-gear','gear')+'<div class="car-wrap">'+img('lift-car','car')+img('robot-delivery','car-robot')+'<div class="doors">'+img('lift-door-left','door door-left')+img('lift-door-right','door door-right')+'</div></div>';
  }else room+=img(portrait?'fan-bay-compact':'fan-bay','housing fan-housing')+img('fan','rotor');
  room+='</div>';
 }
 room+='<div class="powerline"></div></div>';
 let consoleArt='<div class="console"><div class="headrow"><div class="heading">TOWER RESCUE<div class="subtitle">QUAKE CONTROL</div></div><div class="back">◀ BACK TO ELEVATOR</div></div><div class="steps"><span>✓ DIAGNOSE</span><span>'+ (state==='install'?'REPAIR':'✓ REPAIR')+'</span><span>TEST</span></div><div class="guide"><div class="guide-head">'+img(state==='delivery'?'robot-success':state==='install'?'robot-neutral':'robot-ready','')+'</div>'+ (state==='delivery'?'It works! The FREIGHT LIFT is back in service.':state==='install'?'Found it! The FREIGHT LIFT lost power.':'Full power! Press RUN TEST.')+'</div><div class="bench"><div class="meter"><div class="meter-labels"><span>HAS '+(state==='install'?(portrait?10:8):needed)+'</span><span>NEEDS '+needed+'</span></div><div class="bar"><div class="fill"></div></div></div><div class="bay">'+img('power-bay','bay-base')+img('power-cell-idle','bay-cell')+'<div class="cell-label">+'+cell+'</div>'+img('power-bay-clamp-left','clamp clamp-left')+img('power-bay-clamp-right','clamp clamp-right')+img('power-bay-breaker','breaker')+'</div></div><div class="choices">'+[cell+1,cell-1,cell,needed].map(v=>'<div class="choice">'+img('power-cell-idle','')+'<span>+'+v+'</span></div>').join('')+'</div><div class="run">'+(state==='delivery'?'✓ SYSTEM RESTORED':'RUN TEST')+'</div></div>';
 screen.innerHTML=room+consoleArt;
 for(const b of document.querySelectorAll('[data-orientation]'))b.classList.toggle('active',b.dataset.orientation===orientation);
 for(const b of document.querySelectorAll('[data-state]'))b.classList.toggle('active',b.dataset.state===state);
}
for(const b of document.querySelectorAll('[data-orientation]'))b.onclick=()=>{orientation=b.dataset.orientation;render()};
for(const b of document.querySelectorAll('[data-state]'))b.onclick=()=>{state=b.dataset.state;render()};
render();
fetch(prefix+'manifest.json').then(r=>r.json()).then(m=>{
 document.querySelector('#sheet').innerHTML=m.assets.map(a=>'<article class="tile"><div class="thumb">'+img(a.id,'')+'</div><h3>'+a.file+'</h3><p>'+a.width+' × '+a.height+' · '+(a.transparentPixels?'ALPHA':'OPAQUE')+'</p><p>'+a.use+'</p><div class="badge">PENDING OWNER APPROVAL</div></article>').join('');
 document.documentElement.dataset.ready='true';
});
if(params.get('view')==='contact')document.body.classList.add('sheetmode');
