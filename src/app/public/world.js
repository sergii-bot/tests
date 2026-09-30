import * as T from './vendor/three.module.js';
import {STATIONS,CHECKPOINTS} from './strings.js';
import {installExhibits} from './exhibits-world.js';
// STYLE FORMULA: Cinematic scientific visualization with soft filmic surfaces and fine analog grain; slender articulated mechanical silhouettes, restrained geometry, and hairline calibration marks. Environments use muted teal and sage, robots use near-black graphite against pale fog, interactive targets use white, and the shared Brain alone carries a cool blue accent. Diffused overhead light, dense atmospheric haze, and quiet archival mood. Clear silhouettes and proximity labels preserve readability in a free first-person 3D perspective, with three-quarter views for model studies.
class Lit extends T.MeshLambertMaterial{constructor({color=0xffffff}={}){super({color});}}
export function createWorld(canvas){
 const renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x799a8b);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 const scene=new T.Scene();scene.fog=new T.FogExp2(0x789d8d,.036);scene.background=new T.Color(0x789d8d);
 const camera=new T.PerspectiveCamera(66,innerWidth/innerHeight,.07,115);camera.rotation.order='YXZ';
 scene.add(new T.HemisphereLight(0xd6eee2,0x1c3529,2.7));const sun=new T.DirectionalLight(0xd7e4cc,2.1);sun.position.set(-15,30,12);scene.add(sun);
 const gray=new Lit({color:0x688574,roughness:.85,metalness:.1});
 const graphite=new Lit({color:0x182c29,roughness:.47,metalness:.7});
 const steel=new Lit({color:0x688c80,roughness:.4,metalness:.8});
 const ivory=new Lit({color:0xc7d7c3,roughness:.9});
 const dark=new Lit({color:0x153831,roughness:.8});
 const glow=new T.MeshBasicMaterial({color:0xdcf9e7});const blue=new T.MeshBasicMaterial({color:0x71d9ff});
 const boxG=new T.BoxGeometry(1,1,1),sphereG=new T.SphereGeometry(1,8,6),cylG=new T.CylinderGeometry(1,1,1,10);
 let seed=928;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 const zones=[new T.Group(),new T.Group(),new T.Group()];zones.forEach(g=>scene.add(g));
 const dummy=new T.Object3D(),matrix=new T.Matrix4(),tmp=new T.Vector3();
 function batch(parent,geometry,material,items){const mesh=new T.InstancedMesh(geometry,material,items.length);for(let i=0;i<items.length;i++){const q=items[i];dummy.position.set(q[0],q[1],q[2]);dummy.scale.set(q[3],q[4],q[5]);dummy.rotation.set(q[6]||0,q[7]||0,q[8]||0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;parent.add(mesh);return mesh;}
 const white=[],concrete=[],metal=[],black=[],lights=[];
 function block(arr,x,y,z,w,h,d,rot=0){arr.push([x,y,z,w,h,d,0,rot,0]);}
 // Research lab: permeable architecture with broad safe passages.
 block(concrete,0,-.3,-5,39,.5,42);block(concrete,0,6,-25,40,12,.5);block(concrete,-20,5,-6,.5,10,38);block(concrete,20,5,-11,.5,10,29);
 block(concrete,0,10,-5,40,.4,40);
 for(let x=-14;x<=14;x+=14)for(let z=-18;z<=10;z+=14){block(lights,x,9.72,z,6,.08,2);block(metal,x,9.62,z,6.1,.07,2.1);}
 for(const x of [-12,-4,4,12])block(metal,x,2,-24.5,.08,4,.1);
 for(const x of [-8,8]){block(white,x,1.43,-4,5,.12,2.3);block(metal,x,1.55,-4,5.1,.1,2.4);for(const sx of [-2.2,2.2])for(const sz of [-.9,.9])block(metal,x+sx,.72,-4+sz,.07,1.44,.07);block(black,x,.32,-4,4.8,.09,1.8);}
 // Kitchen fixtures, pot, coffee and assembly station surfaces.
 block(metal,-10,2,-4,.9,.06,.9);block(black,-10,2.05,-4,.6,.04,.6);block(metal,-9.6,2.04,-3.9,.8,.06,.12);
 block(white,-6.4,1.85,-4,.55,.55,.55);block(black,8.1,1.7,-3.2,.7,.12,.42);block(white,8.1,1.76,-3.2,.57,.04,.32);
 block(metal,0,.18,-17,7,.35,6);block(lights,0,.37,-17,5,.025,4.5);
 for(const x of [-6,6]){block(black,x,2.2,-21,2,4.4,2);for(let y=.4;y<4.4;y+=.35){block(metal,x,y,-19.98,1.8,.06,.05);block(lights,x+.65,y+.1,-19.94,.1,.04,.03);}}
 for(const x of [-3.5,3.5]){block(metal,x,3,-17,.06,6,.06);block(metal,x,3,-20,.06,6,.06);}
 block(metal,0,6,-17,7,.06,.06);
 batch(zones[0],boxG,gray,concrete);batch(zones[0],boxG,steel,metal);batch(zones[0],boxG,ivory,white);batch(zones[0],boxG,graphite,black);batch(zones[0],boxG,glow,lights);
 const glass=new T.Mesh(new T.BoxGeometry(7,5.6,.015),new T.MeshPhysicalMaterial({color:0xb0e5d0,transparent:true,opacity:.09,roughness:.1,depthWrite:false}));glass.position.set(0,3,-20);zones[0].add(glass);
 const grid=new T.GridHelper(40,20,0xc6e4d2,0xc6e4d2);grid.position.set(0,.02,-5);grid.material.transparent=true;grid.material.opacity=.17;zones[0].add(grid);
 // Rolling proving ground; accessible central corridor, gentle hills outside it.
 function height(x,z){if(x<24||x>92)return 0;const edge=Math.min(1,(x-24)/8,(92-x)/8);return edge*(.28*Math.sin(x*.19)*Math.cos(z*.18)+Math.max(0,Math.abs(z)-12)*.11*(1+Math.sin(x*.08)));}
 const terrainG=new T.PlaneGeometry(82,96,100,100);terrainG.rotateX(-Math.PI/2);const pos=terrainG.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i)+59,z=pos.getZ(i);pos.setXYZ(i,x,height(x,z)-.08,z);}terrainG.computeVertexNormals();zones[1].add(new T.Mesh(terrainG,new Lit({color:0x526c4c,roughness:1})));
 const grasses=[];for(let i=0;i<3300;i++){const x=25+rand()*67,z=(rand()-.5)*83;if(Math.abs(z)<8&&x>47&&x<74)continue;const h=.17+rand()*.5;grasses.push([x,height(x,z)+h*.5,z,.12,h,1,0,rand()*Math.PI,rand()*.25]);}const grassMesh=batch(zones[1],new T.PlaneGeometry(1,1),new Lit({color:0x476346}),grasses);grassMesh.material.side=T.DoubleSide;
 const stones=[];for(let i=0;i<150;i++){const x=29+rand()*60,z=(rand()-.5)*75;if(Math.abs(z)<14)continue;const r=.2+rand()*.7;stones.push([x,height(x,z),z,r,.25+r*.4,r]);}batch(zones[1],sphereG,gray,stones);
 const platforms=[];for(let i=0;i<5;i++){block(platforms,57+i*1.55,.15+i*.13,-15,1.25,.3+i*.26,2);}
 block(platforms,52,height(52,0)-.2,0,4,.4,4);block(platforms,68,height(68,4)-.15,4,4,.3,4);
 for(let i=0;i<5;i++)block(platforms,55+i*.5,.08+i*.1,-9,1,.16+i*.2,2);
 batch(zones[1],boxG,gray,platforms);
 const pillars=[];for(let x=28;x<90;x+=10){block(pillars,x,1.1,14,.28,2.2,.28);block(pillars,x,1.1,-26,.28,2.2,.28);}batch(zones[1],boxG,ivory,pillars);
 const hillGrid=new T.GridHelper(78,26,0xc8e5d7,0xc8e5d7);hillGrid.position.set(60,-.02,0);hillGrid.material.transparent=true;hillGrid.material.opacity=.07;zones[1].add(hillGrid);
 const rings=[];CHECKPOINTS.forEach(([x,z])=>{const ring=new T.Mesh(new T.TorusGeometry(1.2,.025,4,40),glow);ring.rotation.x=Math.PI/2;ring.position.set(x,height(x,z)+.08,z);zones[1].add(ring);rings.push(ring);});
 // Warehouse, instanced shelving, cargo, and conveyor strips.
 const wh=[],racks=[],cargo=[],whLights=[];block(wh,110,-.3,-4,48,.5,56);block(wh,110,5,-31,48,10,.5);block(wh,134,5,-4,.5,10,55);block(wh,110,10,-4,48,.3,56);
 for(const x of [96,104,118,126])for(let z=-22;z<16;z+=9){for(const sx of [-1.8,1.8])for(const sz of [-1.5,1.5])block(racks,x+sx,2.7,z+sz,.07,5.4,.07);for(let y=.5;y<5;y+=1.4){block(racks,x,y,z,3.7,.09,3.2);for(let j=0;j<3;j++)block(cargo,x-1+j,y+.42,z,.8,.8,1.4);}}
 for(const x of [98,110,124])for(const z of [-23,-8,8])block(whLights,x,9.7,z,5,.05,1.4);
 block(racks,110,.9,-7,2,.3,17);for(let z=-15;z<2;z+=.36)block(cargo,110,1.08,z,1.8,.045,.08);
 block(racks,110,.8,0,4,1.6,1.8);block(whLights,110,1.64,0,2,.03,1);
 batch(zones[2],boxG,gray,wh);batch(zones[2],boxG,graphite,racks);batch(zones[2],boxG,steel,cargo);batch(zones[2],boxG,glow,whLights);
 const wg=new T.GridHelper(48,24,0xc6e4d2,0xc6e4d2);wg.position.set(110,.015,-4);wg.material.transparent=true;wg.material.opacity=.15;zones[2].add(wg);
 // Reference displays are diegetic research monitors, not replacement geometry.
 const loader=new T.TextureLoader();function monitor(group,file,x,y,z,w,h){const tex=loader.load('./assets/'+file);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,color:0x8ca899}));m.position.set(x,y,z);group.add(m);}
 monitor(zones[0],'lab.jpg',-10,4.5,-24.6,5,2.1);monitor(zones[0],'kitchen.png',-15,3,-24.6,2.8,1.5);monitor(zones[0],'hero.jpg',10,4.5,-24.6,5,2.1);monitor(zones[2],'hills.jpg',110,5.3,-30.6,8,3.4);
 // All articulated robot components share instanced GPU batches.
 const robotRoot=new T.Group();scene.add(robotRoot);const robots=[],parts={box:[],sphere:[],cylinder:[],blue:[],white:[],rod:[],joint:[],shell:[],shellHalf:[],food:[],coffee:[],leaf:[],funnel:[],worktop:[]};
 function node(parent,x,y,z){const n=new T.Object3D();n.position.set(x,y,z);parent.add(n);return n;}
 function part(root,type,x,y,z,sx,sy,sz,rx=0,rz=0){const n=node(root,x,y,z);n.scale.set(sx,sy,sz);n.rotation.set(rx,0,rz);parts[type].push(n);return n;}
 function robot(type,x,z,zone,id){const root=node(robotRoot,x,height(x,z),z);const r={root,type,zone,id,joints:[],parts:[],x,z};robots.push(r);const start=Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,v.length]));
 if(type==='humanoid'){
  part(root,'box',0,1.54,0,.54,.65,.3);part(root,'box',0,1.9,0,.42,.12,.3);part(root,'cylinder',0,2.02,0,.065,.17,.065);part(root,'box',0,2.17,0,.43,.22,.23);part(root,'cylinder',.11,2.16,.125,.065,.04,.065,Math.PI/2);part(root,'blue',.1,2.16,.15,.025,.025,.015);
  part(root,'cylinder',0,1.1,0,.1,.28,.1);part(root,'box',0,1.04,0,.43,.15,.26);part(root,'blue',0,1.63,.162,.09,.14,.014,0,.5);
  for(const s of [-1,1]){const arm=node(root,s*.36,1.78,0);r.joints.push(arm);part(arm,'sphere',0,0,0,.115,.115,.115);part(arm,'cylinder',0,-.24,0,.061,.43,.061);part(arm,'sphere',0,-.47,0,.085,.085,.085);part(arm,'box',0,-.66,0,.105,.34,.1);part(arm,'box',0,-.9,.025,.115,.16,.06);for(let f=0;f<3;f++)part(arm,'box',-.036+f*.036,-1.02,.025,.016,.11,.02);
  const leg=node(root,s*.19,1,0);r.joints.push(leg);part(leg,'sphere',0,0,0,.13,.13,.13);part(leg,'box',0,-.22,0,.13,.4,.16);part(leg,'cylinder',.06,-.21,-.08,.027,.4,.027);part(leg,'sphere',0,-.46,0,.09,.09,.09);part(leg,'box',0,-.68,0,.095,.37,.12);part(leg,'box',0,-.92,.08,.16,.09,.34);}
 }else if(type==='dog'){
  part(root,'box',0,.82,0,.45,.3,.88);part(root,'box',0,.94,.4,.31,.17,.26);part(root,'blue',0,.94,.536,.08,.035,.018);
  for(const x0 of [-.28,.28])for(const z0 of [-.32,.32]){const leg=node(root,x0,.82,z0);r.joints.push(leg);part(leg,'sphere',0,0,0,.09,.09,.09);part(leg,'cylinder',0,-.2,0,.045,.4,.045,0,x0>0?-.12:.12);part(leg,'sphere',0,-.39,0,.07,.07,.07);part(leg,'cylinder',0,-.57,.04,.032,.35,.032,.2);part(leg,'sphere',0,-.74,.09,.065,.04,.09);}
 }else{
  const base=type==='mobile'?.38:1.55;if(type==='mobile'){part(root,'box',0,.28,0,.9,.4,.75);for(const x0 of [-.47,.47])for(const z0 of [-.25,.25])part(root,'cylinder',x0,.22,z0,.19,.12,.19,0,Math.PI/2);part(root,'blue',0,.4,.39,.3,.035,.015);}else part(root,'cylinder',0,base,0,.23,.15,.23);
  const shoulder=node(root,0,base+.15,0);r.joints.push(shoulder);part(shoulder,'sphere',0,0,0,.16,.16,.16);part(shoulder,'box',0,.34,0,.14,.6,.16);
  const elbow=node(shoulder,0,.65,0);r.joints.push(elbow);elbow.rotation.z=-.9;part(elbow,'sphere',0,0,0,.13,.13,.13);part(elbow,'cylinder',0,.3,0,.067,.56,.067);
  const wrist=node(elbow,0,.62,0);r.joints.push(wrist);part(wrist,'sphere',0,0,0,.085,.085,.085);part(wrist,'box',0,.1,0,.2,.1,.12);for(const s of [-1,1])part(wrist,'box',s*.08,.23,0,.04,.2,.04);part(wrist,'blue',0,.07,.07,.06,.035,.015);
 }
 for(const [k,arr]of Object.entries(parts))for(let i=start[k];i<arr.length;i++)r.parts.push(arr[i]);return r;
 }
 const kitchen=robot('arm',-8,-4,0,'kitchen'),dex=robot('arm',8,-4,0,'dexterity');const hero=robot('humanoid',0,-17,0,'simulation');robot('humanoid',-4,3,0,'welcome');
 const dog=robot('dog',52,0,1,'locomotion'),park=robot('dog',58,-15,1,'parkour'),adapt=robot('dog',68,4,1,'adaptation');robot('humanoid',78,-10,1,'outro');
 for(let i=0;i<4;i++)robot(i%2?'mobile':'arm',i<2?106:114,-5-i*4,2,'fleet'+i);
 robot('humanoid',113,2,2,'handover');robot('dog',111,14,2,'patrol');
 const remote=[];for(let i=0;i<4;i++){const r=robot('humanoid',0,0,-1,'remote'+i);remote.push(r);r.root.visible=false;}
 for(const r of [kitchen,dex]){r.pose={x:0,z:0};r.payloads=[];for(let i=0;i<(r===dex?2:1);i++){r.payloads.push(part(r.root,'white',-.65,1.82,(i?1:-1)*.25,r===dex?.075:.22,r===dex?.09:.18,r===dex?.12:.18));const z=r===dex?(i?1:-1)*.35*.6:.4*.6;for(const side of [-1,1]){part(r.root,'white',.6+side*.16,1.65,z,.02,.025,.28);part(r.root,'white',.6,1.65,z+side*.14,.34,.025,.02);}}r.effector=part(r.root,'white',0,2.08,0,.065,.09,.065);}
 hero.core=part(hero.joints[2],'white',0,-1.03,.06,.13,.16,.12);
 const handoverRing=new T.Mesh(new T.TorusGeometry(1.35,.035,4,36),glow);handoverRing.rotation.x=Math.PI/2;handoverRing.position.set(6,.06,-11);zones[0].add(handoverRing);
 const receivedCore=new T.Mesh(new T.BoxGeometry(.16,.18,.13),glow);receivedCore.position.set(6,1.25,-11.7);receivedCore.visible=false;zones[0].add(receivedCore);
 const exhibits=installExhibits({T,zones,scene,robotRoot,node,part,robot});
 const partGeometry={box:boxG,blue:boxG,white:boxG,worktop:boxG,sphere:sphereG,cylinder:cylG,rod:cylG,joint:sphereG,shell:new T.SphereGeometry(1,20,10),shellHalf:new T.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2),food:new T.SphereGeometry(1,16,8),coffee:cylG,leaf:sphereG,funnel:new T.CylinderGeometry(1,.2,1,12)};
 const partMaterial={blue,white:glow,rod:steel,joint:steel,worktop:new Lit({color:0x939d83}),shell:new Lit({color:0xe5e3d5}),shellHalf:new Lit({color:0xe5e3d5}),food:new Lit({color:0xf0bc48}),coffee:new Lit({color:0x42372a}),leaf:new Lit({color:0x456e48}),funnel:ivory};
 const batches={};for(const [k,arr] of Object.entries(parts)){const mesh=new T.InstancedMesh(partGeometry[k],partMaterial[k]||graphite,arr.length);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;scene.add(mesh);batches[k]=mesh;}
 // Data cloud: tiny points repeatedly coalesce around the physical humanoid.
 const particleCount=3500,cloudPos=new Float32Array(particleCount*3);for(let i=0;i<particleCount;i++){cloudPos[i*3]=(rand()-.5)*1.4;cloudPos[i*3+1]=rand()*2.4;cloudPos[i*3+2]=(rand()-.5)*.65;}
 const cloudG=new T.BufferGeometry();cloudG.setAttribute('position',new T.BufferAttribute(cloudPos,3));cloudG.attributes.position.setUsage(T.DynamicDrawUsage);const cloudSeeds=cloudPos.slice();const cloud=new T.Points(cloudG,new T.PointsMaterial({color:0xabe6d7,size:.024,transparent:true,opacity:.45,depthWrite:false}));scene.add(cloud);
 // Literal 100000 point visualization, not a physics simulation of 100000 bodies.
 const simPos=new Float32Array(300000);for(let i=0;i<100000;i++){const c=i%1000,row=Math.floor(i/1000),col=c%40;simPos[i*3]=col*.2-4+(rand()-.5)*.12;simPos[i*3+1]=Math.floor(c/40)*.115+2+(rand()-.5)*.04;simPos[i*3+2]=-23+row*.013;}
 const simG=new T.BufferGeometry();simG.setAttribute('position',new T.BufferAttribute(simPos,3));const simPoints=new T.Points(simG,new T.PointsMaterial({size:.015,color:0x93ceb9,transparent:true,opacity:.55}));zones[0].add(simPoints);
 const dustPos=new Float32Array(4500);for(let i=0;i<1500;i++){dustPos[i*3]=(rand()-.5)*90;dustPos[i*3+1]=rand()*15;dustPos[i*3+2]=(rand()-.5)*85;}const dustG=new T.BufferGeometry();dustG.setAttribute('position',new T.BufferAttribute(dustPos,3));const dust=new T.Points(dustG,new T.PointsMaterial({color:0xb9e3d0,size:.024,transparent:true,opacity:.3,depthWrite:false}));scene.add(dust);
 const shadowMat=new T.MeshBasicMaterial({color:0x061e17,transparent:true,opacity:.15,depthWrite:false});for(const r of robots.filter(r=>r.zone>=0)){const sh=new T.Mesh(new T.CircleGeometry(r.type==='dog'?.8:.65,24),shadowMat);sh.rotation.x=-Math.PI/2;sh.position.set(r.x,height(r.x,r.z)+.02,r.z);zones[r.zone].add(sh);}
 const projection=new T.Vector3();let gpuMs=null;const gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');let query=null,queryPending=null;
 function draw(p,state,t,dt){
  const zone=p.x<25?0:p.x<90?1:2;zones.forEach((z,i)=>z.visible=i===zone);const elapsed=t*.001;
  const cameraExperiment=state?.experiments?.[state?.players?.[state?.you]?.active],robotEye=p.inspect&&cameraExperiment?.follower;
  const eye=robotEye||p;camera.position.set(eye.x,height(eye.x,eye.z)+(robotEye&&state.players[state.you].active==='locomotion'?.96:1.72),eye.z);camera.rotation.set(p.pitch||0,p.yaw,0);
  scene.fog.density=zone===1?.032:.032;scene.fog.color.setHex(zone===1?0x789887:0x688d7f);scene.background.copy(scene.fog.color);
  const ps=Object.entries(state?.players||{}).filter(([id])=>id!==state?.you);remote.forEach((r,i)=>{const q=ps[i]?.[1];r.root.visible=!!q&&Math.abs(q.x-p.x)<45;if(q){r.root.position.lerp(tmp.set(q.x,height(q.x,q.z),q.z),Math.min(1,dt*10));r.root.rotation.y=q.yaw+Math.PI;r.zone=zone;}});
  for(const r of robots){if(r.id.startsWith('remote')){if(!r.root.visible)continue;}else r.root.visible=r.zone===zone;
   if(!r.root.visible)continue;const ex=state?.experiments?.[r.id],learned=state?.skills?.includes(r.id),active=!!ex&&ex.stage!=='complete';let pace=elapsed*(learned||state?.deployed?2.4:active?2:.45);
   if(r.type==='humanoid'){for(let i=0;i<r.joints.length;i++)r.joints[i].rotation.x=Math.sin(pace+i*2.1)*(r.id.startsWith('remote')?.13:.06);r.root.rotation.y=r.id.startsWith('remote')?r.root.rotation.y:Math.sin(elapsed*.17)*.18;}
   if(r.type==='dog'){for(let i=0;i<r.joints.length;i++)r.joints[i].rotation.x=Math.sin(pace*3+i*Math.PI*.7)*.3;}
   if(r.type==='arm'||r.type==='mobile'){r.joints[0].rotation.z=Math.sin(pace)*.32;r.joints[1].rotation.z=-.85+Math.sin(pace+.8)*.35;r.joints[2].rotation.z=.3+Math.sin(pace)*.5;}
   if(r.id.startsWith('fleet')&&r.type==='mobile'&&state?.deployed)r.root.position.z=r.z+Math.sin(elapsed*.35)*4;
   if(r.id==='patrol'&&state?.deployed){r.root.position.z=10+Math.sin(elapsed*.25)*8;r.root.position.x=111+Math.cos(elapsed*.25)*3;r.root.rotation.y=elapsed*.25;}
  }
  const locomotion=state?.experiments?.locomotion;if(locomotion?.stage==='course'){const q=locomotion.follower,leader=state.players[locomotion.owner];if(q){dog.root.position.lerp(tmp.set(q.x,height(q.x,q.z),q.z),Math.min(1,dt*7));dog.root.rotation.y=Math.atan2(leader.x-q.x,leader.z-q.z);dog.root.visible=zone===1&&!robotEye;}}else if(state?.skills?.includes('locomotion')){const phase=elapsed*.23;dog.root.position.set(57+Math.sin(phase)*5,height(57+Math.sin(phase)*5,-4),-4+Math.cos(phase)*3);dog.root.rotation.y=phase+Math.PI/2;}else dog.root.position.set(52,height(52,0),0);
  const sx=state?.experiments?.simulation;if(sx?.follower&&['lead','handover'].includes(sx.stage)){const q=sx.follower,leader=state.players[sx.owner];hero.root.position.lerp(tmp.set(q.x,0,q.z),Math.min(1,dt*6));hero.root.rotation.y=Math.atan2(leader.x-q.x,leader.z-q.z);hero.root.visible=zone===0&&!robotEye;if(sx.stage==='lead'){hero.joints[1].rotation.x=Math.sin(elapsed*5)*.2;hero.joints[3].rotation.x=-Math.sin(elapsed*5)*.2;}else{hero.joints[2].rotation.x=-1.15*Math.min(1,(state._serverNow-sx.started)/1300);}}else if(sx?.stage==='complete')hero.root.position.lerp(tmp.set(0,0,-17),Math.min(1,dt));else hero.root.position.set(0,0,-17);const transferred=sx?.stage==='complete'||sx?.stage==='handover'&&state._serverNow-sx.started>1450;receivedCore.visible=!!transferred;hero.core.visible=!!sx&&['lead','handover'].includes(sx.stage)&&!transferred;handoverRing.visible=sx?.stage==='lead'||sx?.stage==='handover';
  const ax=state?.experiments?.adaptation;if(ax&&ax.stage!=='ready'){adapt.joints[0].rotation.x=-1.4;adapt.root.rotation.z=ax.stage==='damaged'?.14:.035;}else adapt.root.rotation.z=0;
  const px=state?.experiments?.parkour;if(px?.stage==='trial'){const ph=Math.min(1,Math.max(0,(state._serverNow-px.started)/2200)),distance=px.success?1.55:.8;park.root.position.set(57+px.step*1.55+ph*distance,Math.sin(ph*Math.PI)*(px.success?.85:.35)+px.step*.13,-15);park.root.rotation.z=px.success?0:Math.max(0,ph-.7)*2.1;park.root.visible=zone===1&&(px.success||ph<.97);}else{park.root.position.set(57+(px?.step||0)*1.55,(px?.step||0)*.13,-15);park.root.rotation.z=0;}
  for(const r of [kitchen,dex]){const e=state?.experiments?.[r.id];let gx=e?.gripper?.x||0,gz=e?.gripper?.z||0,holding=!!e?.gripper?.held,step=e?.step||0;
   if(e&&['replay','complete'].includes(e.stage)&&e.trail?.length){const phase=e.stage==='replay'?Math.min(.999,(state._serverNow-e.started)/3000):(elapsed*.2)%1;const sample=e.trail[Math.min(e.trail.length-1,Math.floor(Math.max(0,phase)*e.trail.length))];gx=sample[0];gz=sample[1];holding=!!sample[2];}
   r.pose.x+=(gx*.95-r.pose.x)*Math.min(1,dt*12);r.pose.z+=(gz*.6-r.pose.z)*Math.min(1,dt*12);const dx=r.pose.x,dz=r.pose.z,dy=.8,l1=.65,l2=.62,rad=Math.hypot(dx,dz),a2=Math.acos(Math.max(-1,Math.min(1,(rad*rad+dy*dy-l1*l1-l2*l2)/(2*l1*l2)))),a1=Math.atan2(rad,dy)-Math.atan2(l2*Math.sin(a2),l1+l2*Math.cos(a2));
   r.joints[0].rotation.set(0,Math.atan2(-dz,dx),-a1);r.joints[1].rotation.z=-a2;r.joints[2].rotation.z=a1+a2;r.effector.position.set(dx,2.04+(holding?.12:0),dz);
   r.payloads.forEach((item,i)=>{const carrying=holding&&(r===kitchen||i===Math.min(step,1)),placed=step>i;item.position.set(carrying?dx:placed?.57:-.65,carrying?2.04:1.8,carrying?dz:r===kitchen?(placed?.24:-.15):(i?1:-1)*(placed?.21:.27));});
  }
  exhibits.update(state,p,t,dt);
  rings.forEach((r,i)=>{r.visible=zone===1&&locomotion?.stage==='course'&&locomotion.step===i;r.material=glow;});
  robotRoot.updateMatrixWorld(true);for(const [k,arr]of Object.entries(parts)){const b=batches[k];let count=0;for(const n of arr){let visible=true,o=n;while(o&&o!==robotRoot){if(!o.visible){visible=false;break;}o=o.parent;}if(visible)b.setMatrixAt(count++,n.matrixWorld);}b.count=count;b.visible=count>0;if(count)b.instanceMatrix.needsUpdate=true;}
  let cloudRobot=hero;const replay=state?.experiments?.kitchen?.stage==='replay';if(replay)cloudRobot=kitchen;else if(zone===1&&px)cloudRobot=park;
  cloud.visible=zone===0||zone===1&&!!px;cloud.material.opacity=replay?.7:.3+Math.sin(elapsed*1.4)*.15;
  const spread=replay?.12:Math.max(0,Math.sin(elapsed*.55))*.65;
  if(cloud.visible){for(let i=0;i<particleCount;i++){const node=cloudRobot.parts[i%cloudRobot.parts.length];tmp.set(cloudSeeds[i*3]/1.4,cloudSeeds[i*3+1]/2.4-.5,cloudSeeds[i*3+2]/.65);tmp.applyMatrix4(node.matrixWorld);cloudPos[i*3]=tmp.x+cloudSeeds[i*3]*spread;cloudPos[i*3+1]=tmp.y+cloudSeeds[i*3+1]*spread;cloudPos[i*3+2]=tmp.z+cloudSeeds[i*3+2]*spread;}cloudG.attributes.position.needsUpdate=true;cloud.frustumCulled=false;}
  simPoints.visible=zone===0&&p.z<0;dust.position.x=p.x;dust.rotation.y=elapsed*.004;
  if(ext&&queryPending&&gl.getQueryParameter(queryPending,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpuMs=gl.getQueryParameter(queryPending,gl.QUERY_RESULT)/1e6;gl.deleteQuery(queryPending);queryPending=null;}
  if(ext&&!queryPending){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}
  renderer.render(scene,camera);
  if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);queryPending=query;query=null;}
  return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,gpuMs,zone};
 }
 function project(x,y,z){projection.set(x,height(x,z)+y,z).project(camera);return {x:(projection.x*.5+.5)*innerWidth,y:(-.5*projection.y+.5)*innerHeight,visible:projection.z<1&&projection.z>0&&Math.abs(projection.x)<1.2&&Math.abs(projection.y)<1.2};}
 function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
 function quality(level){renderer.setPixelRatio([.45,1,Math.min(devicePixelRatio,1.25)][level]||1);grassMesh.count=Math.min(grasses.length,[900,2200,3300][level]);simG.setDrawRange(0,[12000,30000,100000][level]);cloudG.setDrawRange(0,[700,1400,3500][level]);resize();}
 addEventListener('resize',resize);quality(1);return {draw,project,renderer,camera,scene,height,quality};
}
