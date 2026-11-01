// Narrow-phase sphere/triangle resolution for visible geology. A local BVH
// avoids scanning every triangle on every movement substep. Geometry is baked
// in world coordinates; collision still uses the exact same visual triangles.
import * as THREE from '../../vendor/three.module.js';

export function createMeshContactGuard(geometry, {surfaceOnly = false} = {}) {
  const pos=geometry.attributes.position,index=geometry.index,count=index?index.count:pos.count,triangles=[];
  for(let i=0;i+2<count;i+=3){
    const get=k=>index?index.getX(i+k):i+k;
    const a=new THREE.Vector3().fromBufferAttribute(pos,get(0));
    const b=new THREE.Vector3().fromBufferAttribute(pos,get(1));
    const c=new THREE.Vector3().fromBufferAttribute(pos,get(2));
    const tri=new THREE.Triangle(a,b,c);if(tri.getArea()<1e-10)continue;
    const minX=Math.min(a.x,b.x,c.x),minY=Math.min(a.y,b.y,c.y),minZ=Math.min(a.z,b.z,c.z),
      maxX=Math.max(a.x,b.x,c.x),maxY=Math.max(a.y,b.y,c.y),maxZ=Math.max(a.z,b.z,c.z);
    triangles.push({tri,minX,minY,minZ,maxX,maxY,maxZ,cx:(minX+maxX)*.5,cy:(minY+maxY)*.5,cz:(minZ+maxZ)*.5});
  }
  function build(items){
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const t of items){minX=Math.min(minX,t.minX);minY=Math.min(minY,t.minY);minZ=Math.min(minZ,t.minZ);
      maxX=Math.max(maxX,t.maxX);maxY=Math.max(maxY,t.maxY);maxZ=Math.max(maxZ,t.maxZ);}
    const box=new THREE.Box3(new THREE.Vector3(minX,minY,minZ),new THREE.Vector3(maxX,maxY,maxZ));
    if(items.length<=12)return {box,items};
    const size=box.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'cx':size.y>=size.z?'cy':'cz';
    items.sort((a,b)=>a[axis]-b[axis]);const mid=Math.floor(items.length/2);
    return {box,left:build(items.slice(0,mid)),right:build(items.slice(mid))};
  }
  const root=triangles.length?build(triangles.slice()):null;
  const temp=new THREE.Vector3(),nearest=new THREE.Vector3(),hit=new THREE.Vector3(),direction=new THREE.Vector3();
  const ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(.837,.337,.431).normalize()),stack=[];
  const nearBox=(b,p,r)=>!(p.x+r<b.min.x||p.x-r>b.max.x||p.y+r<b.min.y||p.y-r>b.max.y||p.z+r<b.min.z||p.z-r>b.max.z);
  const boxDistanceSq=(b,p)=>{const dx=Math.max(b.min.x-p.x,0,p.x-b.max.x),dy=Math.max(b.min.y-p.y,0,p.y-b.max.y),dz=Math.max(b.min.z-p.z,0,p.z-b.max.z);return dx*dx+dy*dy+dz*dz;};
  function inside(point){
    if(!root)return false;ray.origin.copy(point);const distances=[];stack.length=0;stack.push(root);
    while(stack.length){const node=stack.pop();if(!ray.intersectsBox(node.box))continue;
      if(node.items){for(const t of node.items)if(ray.intersectTriangle(t.tri.a,t.tri.b,t.tri.c,false,hit))distances.push(hit.distanceToSquared(point));}
      else{stack.push(node.left,node.right);}
    }
    distances.sort((a,b)=>a-b);let unique=0,last=-Infinity;
    for(const d of distances){if(Math.abs(d-last)>1e-5*Math.max(1,d)){unique++;last=d;}}
    return unique%2===1;
  }
  return {
    triangleCount:triangles.length,
    resolve(point,radius){
      if(!root)return false;
      const r=radius+1e-5;let nearestSq=Infinity,nearestTri=null;
      stack.length=0;stack.push(root);
      while(stack.length){const node=stack.pop();if(!nearBox(node.box,point,r))continue;
        if(node.items){for(const t of node.items){
          if(point.x+r<t.minX||point.x-r>t.maxX||point.y+r<t.minY||point.y-r>t.maxY||point.z+r<t.minZ||point.z-r>t.maxZ)continue;
          t.tri.closestPointToPoint(point,temp);const d=temp.distanceToSquared(point);
          if(d<nearestSq){nearestSq=d;nearest.copy(temp);nearestTri=t.tri;}
        }}else stack.push(node.left,node.right);
      }
      const isInside=!surfaceOnly&&inside(point);
      if(!isInside&&nearestSq>=radius*radius)return false;
      if(isInside&&nearestSq===Infinity){
        // Recovery if an initial/teleported position is already inside.
        stack.length=0;stack.push(root);
        while(stack.length){const node=stack.pop();if(boxDistanceSq(node.box,point)>nearestSq)continue;
          if(node.items){for(const t of node.items){t.tri.closestPointToPoint(point,temp);const d=temp.distanceToSquared(point);
            if(d<nearestSq){nearestSq=d;nearest.copy(temp);nearestTri=t.tri;}}}
          else{
            const leftD=boxDistanceSq(node.left.box,point),rightD=boxDistanceSq(node.right.box,point);
            if(leftD<rightD)stack.push(node.right,node.left);else stack.push(node.left,node.right);
          }
        }
      }
      if(!nearestTri)return false;
      const distance=Math.sqrt(nearestSq);
      if(distance>1e-7)direction.copy(point).sub(nearest).multiplyScalar((isInside?-1:1)/distance);
      else{nearestTri.getNormal(direction);if(isInside)direction.negate();}
      const push=isInside?distance+radius:radius-distance;if(push<=1e-7)return false;
      point.addScaledVector(direction,push+1e-5);return true;
    },
  };
}
