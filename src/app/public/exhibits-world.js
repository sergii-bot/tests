import {BINS,cookingPose} from './exhibit-data.js';
// Uses the approved OMNI STYLE FORMULA from world.js: graphite mechanisms, sage/teal environment, calibrated white markers, blue Brain indicator. Muted yolk/coffee colours describe food, not decorative accents.
export function installExhibits({T,zones,scene,robotRoot,node,part,robot}){
 const P=part,N=node;const workshop=N(robotRoot,0,0,0),lab=N(robotRoot,0,0,0);
 const pieces=[];P(workshop,'box',110,-.08,22,22,.12,14);
 function component(parent,kind,x=0,y=0,z=0){const root=N(parent,x,y,z);
  if(kind==='frame'){P(root,'box',0,0,0,.55,.32,.42);for(const s of [-1,1]){P(root,'rod',s*.28,0,0,.035,.4,.035);P(root,'white',s*.2,.18,0,.06,.018,.25);}}
  if(kind==='leg'||kind==='arm'){P(root,'joint',0,.26,0,.095,.095,.095);P(root,'box',0,.08,0,.12,.35,.12);P(root,'joint',0,-.14,0,.085,.085,.085);P(root,'rod',0,-.32,.02,.04,.31,.04,.16);P(root,'box',0,-.52,.08,kind==='leg'?.16:.09,.06,.19);}
  if(kind==='sensor'){P(root,'box',0,0,0,.4,.18,.2);for(const x0 of [-.11,.11]){P(root,'joint',x0,0,.112,.058,.058,.018);P(root,'blue',x0,0,.134,.026,.025,.012);}}
  if(kind==='brain'){P(root,'box',0,0,0,.25,.22,.13);P(root,'blue',0,.01,.072,.08,.1,.01);for(let i=0;i<4;i++)P(root,'rod',-.09+i*.06,-.13,0,.009,.06,.009);}
  return root;
 }
 // Open racks with identifiable modules instead of anonymous crates.
 for(const [kind,[x,z]]of Object.entries(BINS)){
  for(const sx of [-.9,.9])for(const sz of [-.43,.43])P(workshop,'rod',x+sx,1.05,z+sz,.026,2.1,.026);
  for(const y of [.38,1.12,1.86])P(workshop,'box',x,y,z,1.9,.065,1.05);
  P(workshop,'white',x,1.86,z+.54,1.25,.11,.015);
  for(let i=0;i<3;i++){const c=component(workshop,kind,x-.57+i*.57,kind==='leg'||kind==='arm'?1.58:1.34,z);c.scale.setScalar(.63);pieces.push(c);}
 }
 P(workshop,'box',110,.07,18,4,.14,3.5);for(const x of [108.3,111.7]){P(workshop,'rod',x,1.15,17.6,.055,2.3,.055);P(workshop,'white',x,2.3,17.6,.2,.04,.2);}P(workshop,'rod',110,2.3,17.6,.035,3.4,.035,0,Math.PI/2);
 for(const z of [16.4,19.6])P(workshop,'white',110,.16,z,3.4,.015,.035);
 function body(type){const root=N(robotRoot,110,.05,18),groups=[];for(let i=0;i<7;i++)groups.push(N(root,0,0,0));const frame=groups[0],head=groups[5],brain=groups[6],joints=[];
  if(type==='dog'){
   P(frame,'box',0,.88,0,.5,.3,.9);P(frame,'sphere',0,.89,.3,.25,.15,.19);P(frame,'sphere',0,.89,-.3,.25,.15,.19);for(const s of [-1,1])P(frame,'rod',s*.2,.8,0,.025,.7,.025,Math.PI/2);
   [[-.3,.31],[.3,.31],[-.3,-.31],[.3,-.31]].forEach(([x,z],i)=>{const g=groups[i+1];g.position.set(x,.88,z);joints.push(g);P(g,'joint',0,0,0,.105,.105,.105);P(g,'box',0,-.2,.02,.08,.34,.11);P(g,'joint',0,-.39,.04,.075,.075,.075);P(g,'rod',0,-.57,.08,.035,.35,.035,.22);P(g,'box',0,-.75,.12,.13,.07,.15);});
   P(head,'box',0,.98,.5,.29,.17,.2);P(head,'blue',0,.99,.605,.09,.03,.01);P(brain,'blue',0,1.043,0,.14,.01,.15);
  }else{
   P(frame,'box',0,1.48,0,.49,.6,.27);P(frame,'box',0,1.09,0,.38,.14,.25);P(frame,'rod',0,1.13,0,.08,.3,.08);for(const s of [-1,1])P(frame,'rod',s*.2,1.42,-.13,.025,.48,.025);
   for(let i=0;i<2;i++){const g=groups[i+1],s=i?1:-1;g.position.set(s*.17,1.05,0);joints.push(g);P(g,'joint',0,0,0,.125,.125,.125);P(g,'box',0,-.22,0,.13,.4,.14);P(g,'joint',0,-.46,0,.092,.092,.092);P(g,'rod',0,-.68,0,.044,.38,.044);P(g,'box',0,-.93,.08,.17,.08,.32);}
   for(let i=0;i<2;i++){const g=groups[i+3],s=i?1:-1;g.position.set(s*.33,1.75,0);joints.push(g);P(g,'joint',0,0,0,.1,.1,.1);P(g,'box',0,-.22,0,.09,.38,.11);P(g,'joint',0,-.42,0,.08,.08,.08);P(g,'rod',0,-.61,0,.039,.31,.039);for(const f of [-1,0,1])P(g,'box',f*.035,-.83,.035,.022,.14,.04);}
   P(head,'rod',0,1.87,0,.06,.14,.06);P(head,'box',0,2.04,0,.42,.2,.2);for(const s of [-1,1])P(head,'blue',s*.1,2.04,.106,.034,.026,.01);P(brain,'blue',0,1.56,.14,.075,.13,.012,0,.5);
  }
  return {root,groups,joints,type};
 }
 const builds={dog:body('dog'),humanoid:body('humanoid')},parked={dog:body('dog'),humanoid:body('humanoid')};
 const carried=Array.from({length:4},()=>{const root=N(robotRoot,0,0,0),models={};for(const kind of Object.keys(BINS))models[kind]=component(root,kind);root.scale.setScalar(.7);return {root,models};});
 // A real kitchen bench: cookware, loose ingredients, two independent arms.
 function bench(parent,x,z,width=4.3){P(parent,'worktop',x,1.05,z,width,.12,1.8);for(const sx of [-width/2+.18,width/2-.18])for(const sz of [-.64,.64])P(parent,'rod',x+sx,.51,z+sz,.032,1.02,.032);P(parent,'rod',x,.18,z-.62,.025,width-.36,.025,0,Math.PI/2);}
 bench(lab,-11,8.4,4.7);P(lab,'box',-11,1.145,8.45,1.12,.065,.9);P(lab,'cylinder',-11,1.195,8.45,.47,.06,.47);P(lab,'box',-11.72,1.205,8.45,.73,.07,.105);P(lab,'white',-11.1,1.18,8.88,.22,.025,.035);
 const rim=new T.Mesh(new T.TorusGeometry(.46,.021,5,32),new T.MeshLambertMaterial({color:0x4b625b}));rim.rotation.x=Math.PI/2;rim.position.set(-11,1.23,8.45);zones[0].add(rim);
 P(lab,'shell',-9.65,1.135,8.55,.47,.025,.39);P(lab,'shell',-12.58,1.135,8.4,.4,.024,.28);P(lab,'shell',-12.78,1.21,7.92,.2,.12,.2);P(lab,'box',-9.5,1.13,7.92,.8,.035,.47);
 const left=robot('arm',-12,7.95,0,'chefLeft'),right=robot('arm',-10,7.95,0,'chefRight');left.root.position.y=right.root.position.y=-.35;
 const egg=P(lab,'shell',-12.58,1.27,8.4,.095,.13,.095),halfA=P(lab,'shellHalf',-11,1.6,8.45,.095,.13,.095),halfB=P(lab,'shellHalf',-11,1.6,8.45,.095,.13,.095,Math.PI);
 const eggWhite=P(lab,'shell',-11,1.245,8.45,.34,.023,.28),yolk=P(lab,'food',-11,1.285,8.45,.105,.045,.103),pour=P(lab,'shell',-11,1.46,8.45,.022,.21,.022);
 const spatula=N(lab,-9.65,1.3,7.9);P(spatula,'rod',.24,.025,0,.018,.34,.018,0,Math.PI/2);P(spatula,'white',0,0,0,.18,.025,.23);P(spatula,'box',.45,.025,0,.19,.055,.055);
 const steamPos=new Float32Array(120),steamG=new T.BufferGeometry();steamG.setAttribute('position',new T.BufferAttribute(steamPos,3));const steam=new T.Points(steamG,new T.PointsMaterial({color:0xe1e9d8,size:.042,transparent:true,opacity:.16,depthWrite:false}));steam.frustumCulled=false;zones[0].add(steam);
 // Two additional S1-inspired observation corners, not static screens.
 bench(lab,-16,3.2,2.5);const coffeeArm=robot('arm',-16.7,3.2,0,'coffeeDemo');coffeeArm.root.position.y=-.35;P(lab,'shell',-15.7,1.26,3.6,.16,.16,.16);P(lab,'funnel',-15.7,1.53,3.6,.21,.25,.21);P(lab,'coffee',-15.7,1.65,3.6,.14,.014,.14);const kettle=N(lab,-16.5,1.3,3.5);P(kettle,'shell',0,0,0,.14,.2,.14);P(kettle,'rod',.2,.03,0,.025,.22,.025,0,-1.05);P(kettle,'box',-.17,.02,0,.035,.16,.12);const coffeeStream=P(lab,'coffee',-15.7,1.72,3.6,.011,.3,.011);
 bench(lab,-16,-11,2.5);const gardener=robot('arm',-16.7,-11.45,0,'plantDemo');gardener.root.position.y=-.35;P(lab,'cylinder',-15.8,1.3,-10.6,.23,.34,.23);P(lab,'coffee',-15.8,1.47,-10.6,.215,.025,.215);const plant=N(lab,-16.5,1.25,-10.8);P(plant,'rod',0,.24,0,.016,.43,.016);for(let i=0;i<5;i++){const leaf=P(plant,'leaf',Math.sin(i*2)*.12,.2+i*.055,Math.cos(i*2)*.11,.09,.18,.025,0,Math.sin(i*2)*.7);leaf.rotation.y=i*2;}const watering=N(lab,-16.4,1.3,-11.25);P(watering,'shell',0,0,0,.16,.18,.13);P(watering,'rod',.23,.04,0,.021,.3,.021,0,-1.05);const water=P(lab,'shell',-15.8,1.68,-10.6,.01,.2,.01);
 function aim(r,target){const dx=target[0]-r.root.position.x,dz=target[2]-r.root.position.z,dy=target[1]+.2-(r.root.position.y+1.7),rad=Math.hypot(dx,dz),a2=Math.acos(Math.max(-1,Math.min(1,(rad*rad+dy*dy-.65*.65-.62*.62)/(2*.65*.62)))),a1=Math.atan2(rad,dy)-Math.atan2(.62*Math.sin(a2),.65+.62*Math.cos(a2));r.joints[0].rotation.set(0,Math.atan2(-dz,dx),-a1);r.joints[1].rotation.z=-a2;r.joints[2].rotation.z=a1+a2+Math.PI;}
 const lerp=(a,b,f)=>a+(b-a)*Math.max(0,Math.min(1,f));
 return {update(state,p,t,dt){
  const zone=p.x<25?0:p.x<90?1:2,now=state?._serverNow||t,seconds=now/1000,w=state?.workshop||{installed:[],built:{}};workshop.visible=zone===2;lab.visible=zone===0;
  for(const kind of ['dog','humanoid']){const b=builds[kind],full=parked[kind],built=w.built?.[kind],complete=w.installed?.length===7;b.root.visible=zone===2&&w.recipe===kind&&!complete;b.groups.forEach((g,i)=>g.visible=i<(w.installed?.length||0));full.root.visible=zone===2&&!!built;if(built){const f=Math.min(1,(now-built.at)/6000);full.root.position.set(lerp(110,kind==='dog'?106:114,f),lerp(.05,-.08,f),lerp(18,10,f));full.root.rotation.y=f<1?Math.PI+(kind==='dog'?.4:-.4):Math.sin(seconds*.2)*.2;full.joints.forEach((g,i)=>g.rotation.x=Math.sin(seconds*(f<1?6:1.5)+i*Math.PI)*(f<1?.25:.025));}}
  const players=Object.entries(state?.players||{});carried.forEach((c,i)=>{const entry=players[i],q=entry?.[1];c.root.visible=!!q?.carry&&(q.x<25?0:q.x<90?1:2)===zone;if(!q)return;const self=entry[0]===state?.you,who=self?p:q,front=self?.75:.35;c.root.position.set(who.x-Math.sin(who.yaw)*front+Math.cos(who.yaw)*.28,1.08,who.z-Math.cos(who.yaw)*front-Math.sin(who.yaw)*.28);c.root.rotation.y=who.yaw;for(const [kind,m]of Object.entries(c.models))m.visible=q.carry===kind;});
  const pose=cookingPose(now,state?.kitchenShow?.started);aim(left,pose.left);aim(right,[pose.right[0]+.4,pose.right[1]+.04,pose.right[2]]);egg.visible=pose.whole;egg.position.set(...pose.left);halfA.visible=halfB.visible=pose.halves;halfA.position.set(pose.left[0]-pose.split,pose.left[1],pose.left[2]);halfB.position.set(pose.left[0]+pose.split,pose.left[1],pose.left[2]);halfA.rotation.z=-pose.split*4;halfB.rotation.z=pose.split*4;eggWhite.visible=yolk.visible=pose.foodVisible;eggWhite.position.set(...pose.food);yolk.position.set(pose.food[0],pose.food[1]+.038,pose.food[2]);eggWhite.scale.set(.34*pose.spread,.023,.28*pose.spread);yolk.scale.set(.105*pose.spread,.045,.103*pose.spread);pour.visible=pose.stream;spatula.position.set(...pose.right);spatula.rotation.z=0;steam.visible=zone===0&&pose.steam;if(steam.visible){for(let i=0;i<40;i++){const h=(seconds*.24+i*.037)%1;steamPos[i*3]=-11+Math.sin(i*7+seconds)*.14;steamPos[i*3+1]=1.28+h*.62;steamPos[i*3+2]=8.45+Math.cos(i*5+seconds)*.12;}steamG.attributes.position.needsUpdate=true;}
  const coffeePhase=(seconds%34)/34;const pouring=coffeePhase>.2&&coffeePhase<.78;kettle.position.set(pouring?-15.96:-16.5,pouring?1.97:1.3,pouring?3.6:3.5);kettle.rotation.z=pouring?-.65:0;aim(coffeeArm,[kettle.position.x,kettle.position.y+.1,kettle.position.z]);coffeeStream.visible=pouring;
  const pp=(seconds%38)/38,inPot=pp>.35;plant.position.set(lerp(-16.5,-15.8,pp/.35),lerp(1.73,1.48,pp/.35),lerp(-10.8,-10.6,pp/.35));const wateringNow=pp>.55&&pp<.86;watering.position.set(wateringNow?-16.13:-16.4,wateringNow?1.98:1.3,wateringNow?-10.6:-11.25);watering.rotation.z=wateringNow?-.55:0;aim(gardener,wateringNow?[watering.position.x,watering.position.y+.1,watering.position.z]:inPot?[-16.4,1.45,-11.25]:[plant.position.x,plant.position.y+.4,plant.position.z]);water.visible=wateringNow;
 },getCookingPose:now=>cookingPose(now,0)};
}
