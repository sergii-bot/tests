export const meta={game:'OMNI BRAIN — Return of Motion',minPlayers:1,maxPlayers:4};
const ST={kitchen:[-8,-4],dexterity:[8,-4],locomotion:[52,0],parkour:[60,-14],adaptation:[68,4],simulation:[0,-17],warehouse:[110,0]};
const CPS=[[52,-5],[56,-9],[61,-7],[65,-2]],HANDOVER=[6,-11],GAITS=['balance','reach','soft'];
const BINS={frame:[103,18],leg:[103,22],arm:[117,18],sensor:[117,22],brain:[117,26]},ASSEMBLY=[110,18],RECIPES={dog:['frame','leg','leg','leg','leg','sensor','brain'],humanoid:['frame','leg','leg','arm','arm','sensor','brain']};
const player=(i=0)=>({x:i*1.5,z:7,yaw:0,body:'engineer',active:null,carry:null,lastMove:0,lastAction:0});
export function setup(ids){return {version:3,players:Object.fromEntries(ids.map((id,i)=>[id,player(i)])),skills:[],experiments:{},level:1,xp:0,event:{text:'welcome',seq:0},deployed:false,clock:0,workshop:{recipe:null,installed:[],builders:[],built:{}},kitchenShow:{started:0}};}
const no=error=>({ok:false,error}),near=(p,c,r=5)=>Math.hypot(p.x-c[0],p.z-c[1])<=r;
function unlocked(s,k){if(['kitchen','dexterity'].includes(k))return true;if(k==='simulation')return ['kitchen','dexterity','locomotion','parkour','adaptation'].every(v=>s.skills.includes(v));if(k==='warehouse')return s.skills.length>=6;return s.skills.includes('kitchen')&&s.skills.includes('dexterity');}
function source(k,e){return k==='kitchen'?[-.65,-.25]:[-.7,e.step===0?-.45:.45];}
function target(k,e){return k==='kitchen'?[.6,.4]:[.5,e.step===0?-.35:.35];}
export function validateAction(s,id,a){
 if(!a||typeof a!=='object')return no('invalid');
 if(a.kind==='migrate')return s.version!==3?{ok:true}:no('registered');
 if(a.kind==='register')return !s.players[id]?{ok:true}:no('registered');
 const p=s.players[id];if(!p)return no('join');if(!Number.isFinite(a._now))return no('clock');
 if(a.kind==='move'){
  if(!Number.isFinite(a.dx)||!Number.isFinite(a.dz)||!Number.isFinite(a.yaw)||Math.hypot(a.dx,a.dz)>.91||Math.abs(a.yaw)>1000)return no('movement');
  if(a._now-p.lastMove<70)return no('rate');if(p.x+a.dx< -22||p.x+a.dx>135||Math.abs(p.z+a.dz)>40)return no('boundary');return {ok:true};
 }
 if(a._now-p.lastAction<(a.kind==='rig'?55:180))return no('slow');
 if(a.kind==='travel')return ['lab','hills','warehouse','workshop','kitchen'].includes(a.zone)&&(['lab','workshop','kitchen'].includes(a.zone)||a.zone==='hills'&&unlocked(s,'locomotion')||a.zone==='warehouse'&&unlocked(s,'warehouse'))?{ok:true}:no('locked');
 if(a.kind==='selectBody'){if(!near(p,ASSEMBLY,3.8))return no('closer');if(!RECIPES[a.body])return no('body');return !s.workshop.recipe||s.workshop.installed.length===7?{ok:true}:no('assemblyBusy');}
 if(a.kind==='takePart'){if(p.carry)return no('handsFull');return BINS[a.part]&&near(p,BINS[a.part],2.7)?{ok:true}:no('closer');}
 if(a.kind==='returnPart')return p.carry?{ok:true}:no('emptyHands');
 if(a.kind==='installPart'){if(!near(p,ASSEMBLY,3.4))return no('closer');if(!p.carry)return no('emptyHands');const w=s.workshop;if(!w.recipe||w.installed.length>=7)return no('chooseBody');return RECIPES[w.recipe][w.installed.length]===p.carry?{ok:true}:no('wrongPart');}
 if(a.kind==='cookRestart')return near(p,[-11,10],4.5)?{ok:true}:no('closer');
 if(a.kind==='cancel')return {ok:true};const loc=ST[a.station];if(!loc)return no('station');if(!unlocked(s,a.station))return no('locked');if(s.skills.includes(a.station))return no('learned');
 const e=s.experiments[a.station],own=e&&e.owner===id&&p.active===a.station;
 if(!(own&&['locomotion','simulation'].includes(a.station))&&!near(p,loc))return no('closer');
 if(a.kind==='begin'){if(a.station==='warehouse')return no('action');if(e&&e.owner!==id&&a._now-e.updated<120000)return no('occupied');return {ok:true};}
 if(a.kind==='deploy')return a.station==='warehouse'&&!s.deployed?{ok:true}:no('deployed');
 if(!own)return no('begin');
 if(a.kind==='record')return a.station==='kitchen'&&e.stage==='ready'?{ok:true}:no('record');
 if(a.kind==='rig')return ['kitchen','dexterity'].includes(a.station)&&['recording','aligning'].includes(e.stage)&&Number.isFinite(a.x)&&Number.isFinite(a.z)&&Math.abs(a.x)<=1&&Math.abs(a.z)<=1?{ok:true}:no('rig');
 if(a.kind==='grip'){
  if(!['recording','aligning'].includes(e.stage)||!e.gripper)return no('record');const tolerance=a.station==='kitchen'?.18:.11;
  return near(e.gripper,e.gripper.held?target(a.station,e):source(a.station,e),tolerance)?{ok:true}:no(e.gripper.held?'placement':'pickup');
 }
 if(a.kind==='policy')return (a.station==='parkour'&&e.stage==='policy'&&GAITS.includes(a.policy))||(a.station==='adaptation'&&e.stage==='damaged'&&['redistribute','speed','ignore'].includes(a.policy))?{ok:true}:no('policy');
 if(a.kind==='damage')return a.station==='adaptation'&&e.stage==='ready'?{ok:true}:no('damage');
 if(a.kind==='step'){
  if(a.station==='locomotion')return near(p,CPS[e.step],2.6)&&near(e.follower,CPS[e.step],3.5)?{ok:true}:no('checkpoint');
  if(a.station==='parkour')return e.stage==='policy'?{ok:true}:no('observe');
  if(a.station==='adaptation')return e.stage==='damaged'?{ok:true}:no('damage');
  if(a.station==='simulation'){if(e.stage==='boot')return a._now-e.started>=2200?{ok:true}:no('observe');if(e.stage==='lead')return near(p,HANDOVER,2.7)&&near(e.follower,HANDOVER,3.5)?{ok:true}:no('handover');}
  return no('action');
 }
 if(a.kind==='reward'){
  if(!['replay','trial','adapted','handover'].includes(e.stage))return no('observe');
  const minimum=e.stage==='replay'?3000:e.stage==='trial'?2200:1600;
  return a._now-e.started>=minimum?{ok:true}:no('observe');
 }
 return no('invalid');
}
export function applyAction(s,id,a){
 if(a.kind==='migrate'){if(s.version===2)return {...s,version:3,players:Object.fromEntries(Object.entries(s.players).map(([id,p])=>[id,{...p,carry:null}])),workshop:{recipe:null,installed:[],builders:[],built:{}},kitchenShow:{started:0}};const n=setup(Object.keys(s.players||{}));n.skills=(s.skills||[]).filter(k=>ST[k]&&k!=='warehouse');n.xp=n.skills.length*100;n.level=n.skills.length>=6?3:n.skills.length>=2?2:1;n.deployed=!!s.deployed;n.event={text:'migrated',seq:(s.event?.seq||0)+1};return n;}
 if(a.kind==='register')return {...s,players:{...s.players,[id]:player(Object.keys(s.players).length)}};
 const p={...s.players[id]},n={...s,players:{...s.players,[id]:p},clock:a._now};
 const emit=text=>{n.event={text,seq:s.event.seq+1,actor:id,station:a.station};};
 if(a.kind==='move'){
  p.x+=a.dx;p.z+=a.dz;p.yaw=a.yaw;p.lastMove=a._now;const e=s.experiments[p.active];
  if(e?.owner===id&&e.follower&&['course','lead'].includes(e.stage)){const d=Math.hypot(p.x-e.follower.x,p.z-e.follower.z),f=d>1.5?1.5/d:1;n.experiments={...s.experiments,[p.active]:{...e,updated:a._now,follower:{x:p.x+(e.follower.x-p.x)*f,z:p.z+(e.follower.z-p.z)*f}}};}return n;
 }
 p.lastAction=a._now;
 if(a.kind==='selectBody'){n.workshop={...s.workshop,recipe:a.body,installed:[],builders:[]};emit('bodySelected');return n;}
 if(a.kind==='takePart'){p.carry=a.part;emit('partTaken');return n;}
 if(a.kind==='returnPart'){p.carry=null;emit('partReturned');return n;}
 if(a.kind==='installPart'){const w={...s.workshop,installed:[...s.workshop.installed,p.carry],builders:[...new Set([...s.workshop.builders,id])]};n.workshop=w;p.carry=null;if(w.installed.length===7){w.built={...w.built,[w.recipe]:{at:a._now,builder:id}};emit('bodyActivated');}else emit('partInstalled');return n;}
 if(a.kind==='cookRestart'){n.kitchenShow={started:a._now};emit('cookStarted');return n;}
 if(a.kind==='cancel'||a.kind==='travel'){
  n.experiments={...s.experiments};if(s.experiments[p.active]?.owner===id)delete n.experiments[p.active];p.active=null;p.body='engineer';
  if(a.kind==='travel'){const c={lab:[0,7],hills:[52,6],warehouse:[110,9],workshop:[110,27],kitchen:[-11,11]}[a.zone];p.x=c[0];p.z=c[1];p.yaw=0;emit('travel');}return n;
 }
 if(a.kind==='deploy'){n.deployed=true;emit('deployed');return n;}
 const e={...(s.experiments[a.station]||{})};n.experiments={...s.experiments,[a.station]:e};e.updated=a._now;
 const finish=()=>{n.skills=[...s.skills,a.station];n.xp=n.skills.length*100;n.level=n.skills.length>=6?3:n.skills.length>=2?2:1;e.stage='complete';e.confidence=100;e.completedAt=a._now;p.active=null;p.body='engineer';emit('learned');};
 if(a.kind==='begin'){
  Object.assign(e,{owner:id,stage:({kitchen:'ready',dexterity:'aligning',locomotion:'course',parkour:'policy',adaptation:'ready',simulation:'boot'})[a.station],step:0,started:a._now,attempts:0,confidence:15,policy:a.station==='parkour'?'balance':'redistribute',gripper:{x:0,z:0,held:false},trail:[]});
  if(['locomotion','simulation'].includes(a.station))e.follower={x:ST[a.station][0],z:ST[a.station][1]};p.active=a.station;emit('begin');return n;
 }
 if(a.kind==='record'){e.stage='recording';e.trail=[[0,0,0]];emit('recording');}
 if(a.kind==='rig'){e.gripper={...e.gripper,x:a.x,z:a.z};if(e.stage==='recording')e.trail=[...e.trail.slice(-95),[a.x,a.z,e.gripper.held?1:0]];return n;}
 if(a.kind==='grip'){
  e.gripper={...e.gripper,held:!e.gripper.held};e.trail=[...e.trail.slice(-95),[e.gripper.x,e.gripper.z,e.gripper.held?1:0]];
  if(e.gripper.held){e.confidence=35+e.step*25;emit('gripped');}else{e.step++;e.confidence=a.station==='kitchen'?80:45+e.step*20;emit('placed');if(a.station==='kitchen'||e.step>=2){e.stage='replay';e.started=a._now;emit('recorded');}}
 }
 if(a.kind==='policy'){e.policy=a.policy;emit('policy');}
 if(a.kind==='damage'){e.stage='damaged';e.confidence=22;emit('damaged');}
 if(a.kind==='step'){
  if(a.station==='locomotion'){e.step++;e.confidence=15+e.step*20;emit('checkpoint');if(e.step===4)finish();}
  if(a.station==='parkour'){e.stage='trial';e.started=a._now;e.success=e.policy===GAITS[e.step];emit('trial');}
  if(a.station==='adaptation'){if(e.policy==='redistribute'){e.stage='adapted';e.started=a._now;e.confidence=82;emit('adapted');}else{e.attempts++;emit('wrongCompensation');}}
  if(a.station==='simulation'){if(e.stage==='boot'){e.stage='lead';e.confidence=72;emit('follow');}else{e.stage='handover';e.started=a._now;e.confidence=92;emit('handover');}}
 }
 if(a.kind==='reward'){
  if(e.stage==='trial'){if(!e.success){e.attempts++;e.stage='policy';e.confidence=Math.max(10,e.confidence-3);emit('miss');}else{e.step++;e.confidence=20+e.step*25;if(e.step===3)finish();else{e.stage='policy';e.policy='balance';emit('reinforced');}}}
  else finish();
 }
 return n;
}
export function isGameOver(){return {over:false};}
export function viewFor(s,id){return {...s,you:id};}
