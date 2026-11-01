// Developer-only collision diagnostics. Nothing here participates in physics or
// picking; it visualizes the controller's real constraints without changing them.
import * as THREE from '../../vendor/three.module.js';
import { WORLD } from '../world/geography.js?rev=37';

export function createCollisionDebug(scene, controller, portals) {
  const root = new THREE.Group();
  root.name = 'developer_collision_overlay';
  root.visible = false;
  scene.add(root);
  const materials = {
    solid: new THREE.LineBasicMaterial({color:0xff4254, depthTest:false, transparent:true, opacity:0.8}),
    bounds: new THREE.LineBasicMaterial({color:0xffad42, depthTest:false, transparent:true, opacity:0.8}),
    trigger: new THREE.LineBasicMaterial({color:0x42afff, depthTest:false, transparent:true, opacity:0.85}),
    terrain: new THREE.LineBasicMaterial({color:0x66f7a2, depthTest:false, transparent:true, opacity:0.65}),
  };
  const lines = { solid: [], bounds: [], trigger: [] };
  const segment = (a,b,out) => out.push(...a,...b);
  const circle = (cx,cy,cz,rx,ry,rz,plane,out,n=20) => {
    const pt = a => plane === 'xz' ? [cx+rx*Math.cos(a),cy,cz+rz*Math.sin(a)]
      : plane === 'xy' ? [cx+rx*Math.cos(a),cy+ry*Math.sin(a),cz]
      : [cx,cy+ry*Math.sin(a),cz+rz*Math.cos(a)];
    for(let i=0;i<n;i++) segment(pt(i*2*Math.PI/n),pt((i+1)*2*Math.PI/n),out);
  };
  const box = (min,max,out) => {
    const p=[]; for(let i=0;i<8;i++)p.push([i&1?max[0]:min[0],i&2?max[1]:min[1],i&4?max[2]:min[2]]);
    for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))segment(p[i],p[i|bit],out);
  };
  for (const c of controller.colliders) {
    const out=lines.solid;
    if(c.type==='cyl') {
      circle(c.x,c.yBase,c.z,c.r,0,c.r,'xz',out); circle(c.x,c.yTop,c.z,c.r,0,c.r,'xz',out);
      for(let i=0;i<8;i++){let a=i*Math.PI/4; segment([c.x+c.r*Math.cos(a),c.yBase,c.z+c.r*Math.sin(a)],[c.x+c.r*Math.cos(a),c.yTop,c.z+c.r*Math.sin(a)],out);}
      box([c.x-c.r,c.yBase,c.z-c.r],[c.x+c.r,c.yTop,c.z+c.r],lines.bounds);
    } else if(c.type==='ell') {
      for(const plane of ['xz','xy','yz'])circle(c.x,c.y,c.z,c.rx,c.ry,c.rz,plane,out);
      box([c.x-c.rx,c.y-c.ry,c.z-c.rz],[c.x+c.rx,c.y+c.ry,c.z+c.rz],lines.bounds);
    } else if(c.type==='cap') {
      const a=new THREE.Vector3(c.x1,c.y1,c.z1), b=new THREE.Vector3(c.x2,c.y2,c.z2);
      const axis=b.clone().sub(a).normalize(); const side=new THREE.Vector3().crossVectors(axis,new THREE.Vector3(0,1,0));
      if(side.lengthSq()<1e-8)side.set(1,0,0); side.normalize(); const up=new THREE.Vector3().crossVectors(axis,side).normalize();
      const point=(p,t)=>p.clone().addScaledVector(side,c.r*Math.cos(t)).addScaledVector(up,c.r*Math.sin(t)).toArray();
      for(let i=0;i<16;i++){const t=i*Math.PI/8,u=(i+1)*Math.PI/8;segment(point(a,t),point(a,u),out);segment(point(b,t),point(b,u),out);if(i%4===0)segment(point(a,t),point(b,t),out);}
      box([Math.min(c.x1,c.x2)-c.r,Math.min(c.y1,c.y2)-c.r,Math.min(c.z1,c.z2)-c.r], [Math.max(c.x1,c.x2)+c.r,Math.max(c.y1,c.y2)+c.r,Math.max(c.z1,c.z2)+c.r],lines.bounds);
    }
  }
  // Exact analytical interaction thresholds from portals.js (horizontal and
  // vertical radius are different, so the trigger is shown as a cylinder).
  for(const p of portals) {
    const r=p.radius*1.55, h=p.radius*1.5;
    circle(p.x,p.centreY-h,p.z,r,0,r,'xz',lines.trigger);
    circle(p.x,p.centreY+h,p.z,r,0,r,'xz',lines.trigger);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;segment([p.x+r*Math.cos(a),p.centreY-h,p.z+r*Math.sin(a)],[p.x+r*Math.cos(a),p.centreY+h,p.z+r*Math.sin(a)],lines.trigger);}
  }
  const m=controller.radius;
  box([WORLD.minX+m,-WORLD.maxDepth,WORLD.minZ+m],[WORLD.maxX-m,220,WORLD.maxZ-m],lines.bounds);
  function addLineGeometry(name, values, material) {
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(values,3));
    const line=new THREE.LineSegments(g,material);line.name=name;line.frustumCulled=false;line.raycast=()=>{};line.renderOrder=1000;root.add(line);return line;
  }
  for(const name of ['solid','bounds','trigger'])addLineGeometry(name,lines[name],materials[name]);
  for(const roof of controller.roofs) {
    const mesh=new THREE.LineSegments(new THREE.WireframeGeometry(roof.geometry),materials.solid);
    mesh.name='roof_'+roof.name;mesh.raycast=()=>{};mesh.frustumCulled=false;mesh.renderOrder=1000;root.add(mesh);
  }
  const floor=addLineGeometry('terrain_collision_local',[],materials.terrain);
  const body=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(controller.radius,12,8)),materials.terrain);
  body.name='swimmer_collision_radius';body.raycast=()=>{};body.frustumCulled=false;body.renderOrder=1000;root.add(body);
  const label=document.createElement('div');
  label.style.cssText='display:none;position:fixed;left:12px;top:105px;z-index:100;background:rgba(0,10,18,.9);color:#fff;padding:9px 12px;font:12px/1.6 monospace;pointer-events:none';
  label.innerHTML='<b>COLLISION DEBUG · ` TO HIDE</b><br><span style="color:#ff4254">RED</span> solid approximations / roofs<br><span style="color:#ffad42">ORANGE</span> collider bounds / world boundary<br><span style="color:#42afff">BLUE</span> portal triggers<br><span style="color:#66f7a2">GREEN</span> local terrain / swimmer radius';
  document.body.appendChild(label);
  let lastX=Infinity,lastZ=Infinity;
  function update() {
    if(!root.visible)return;
    body.position.copy(controller.pos);
    const step=controller.field.cell || 4;
    const gx=Math.floor((controller.pos.x-WORLD.minX)/step),gz=Math.floor((controller.pos.z-WORLD.minZ)/step);
    if(gx===lastX&&gz===lastZ)return;lastX=gx;lastZ=gz;
    const pts=[]; const sample=(i,j)=>{const x=Math.max(WORLD.minX,Math.min(WORLD.maxX,WORLD.minX+(gx+i)*step));const z=Math.max(WORLD.minZ,Math.min(WORLD.maxZ,WORLD.minZ+(gz+j)*step));return [x,controller.floorAt(x,z)+0.08,z];};
    for(let j=-10;j<=10;j++)for(let i=-10;i<=10;i++){
      if(i<10)segment(sample(i,j),sample(i+1,j),pts);
      if(j<10)segment(sample(i,j),sample(i,j+1),pts);
      if(i<10&&j<10)segment(sample(i+1,j),sample(i,j+1),pts);
    }
    floor.geometry.dispose();floor.geometry=new THREE.BufferGeometry();floor.geometry.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  }
  return { setVisible(on){root.visible=!!on;label.style.display=on?'block':'none';if(on){lastX=Infinity;update();}return root.visible;}, toggle(){return this.setVisible(!root.visible);}, update, get visible(){return root.visible;} };
}
