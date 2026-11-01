// Conservative per-instance frustum compaction for static instanced matrices.
// It removes only instances whose complete animated bounding sphere lies
// outside the camera frustum. Geometry, materials, quality-selected instances,
// matrices and their relative draw order are preserved. No distance LOD is
// introduced here. Do not use on a mesh with independent per-instance
// attributes (e.g. colours) unless those attributes are compacted in lockstep.
import * as THREE from '../../vendor/three.module.js';

const IDENTITY=new THREE.Matrix4();
const tempMatrix=new THREE.Matrix4(),tempSphere=new THREE.Sphere(),combined=new THREE.Sphere();

export class InstanceFrustumCompactor {
  constructor(mesh, options={}){
    this.mesh=mesh;
    const attribute=mesh.instanceMatrix;
    this.source=new Float32Array(attribute.array);
    this.total=this.source.length/16;
    this.selected=this.total;
    this.spheres=new Float32Array(this.total*4);
    this.currentIndices=new Uint32Array(this.total);
    this.scratchIndices=new Uint32Array(this.total);
    this.currentCount=this.total;
    this.full=true;
    const variants=options.variants?.length?options.variants:[{geometry:mesh.geometry,margin:0}];
    for(const v of variants)if(!v.geometry.boundingSphere)v.geometry.computeBoundingSphere();
    for(let i=0;i<this.total;i++){
      tempMatrix.fromArray(this.source,i*16);const scale=tempMatrix.getMaxScaleOnAxis();
      let first=true;
      for(const v of variants){
        tempSphere.copy(v.geometry.boundingSphere).applyMatrix4(tempMatrix);
        tempSphere.radius+=(v.margin||0)*scale+.05; // rounding guard at large world coordinates
        if(first){combined.copy(tempSphere);first=false;}else combined.union(tempSphere);
      }
      const j=i*4;this.spheres[j]=combined.center.x;this.spheres[j+1]=combined.center.y;
      this.spheres[j+2]=combined.center.z;this.spheres[j+3]=combined.radius+.05;
      this.currentIndices[i]=i;
    }
    // The original bounds can omit shader sway. Expanding the draw bound can
    // only recover edges that would have incorrectly popped, not hide detail.
    if(mesh.boundingSphere){
      for(let i=0;i<this.total;i++){
        const j=i*4,dx=this.spheres[j]-mesh.boundingSphere.center.x,
          dy=this.spheres[j+1]-mesh.boundingSphere.center.y,dz=this.spheres[j+2]-mesh.boundingSphere.center.z;
        mesh.boundingSphere.radius=Math.max(mesh.boundingSphere.radius,Math.hypot(dx,dy,dz)+this.spheres[j+3]);
      }
    }
    attribute.setUsage(THREE.DynamicDrawUsage);
  }
  select(count){
    count=Math.max(0,Math.min(this.total,count|0));
    if(count===this.selected)return false;
    this.selected=count;
    this.restore();
    return true;
  }
  restore(){
    const attr=this.mesh.instanceMatrix;
    if(!this.full){
      attr.array.set(this.source);
      // Restore the whole source buffer, even when the new selection is zero:
      // a later selection can otherwise expose stale GPU matrices that were
      // compacted under the previous view/quality.
      attr.clearUpdateRanges();attr.addUpdateRange(0,this.source.length);
      attr.needsUpdate=true;
    }
    this.mesh.count=this.selected;this.currentCount=this.selected;this.full=true;
    for(let i=0;i<this.selected;i++)this.currentIndices[i]=i;
  }
  compact(frustum){
    // The game's instanced geology/flora are in world coordinates under an
    // identity group. If another caller transforms the object, preserve the
    // original rendering instead of using bounds in the wrong space.
    if(!this.mesh.matrixWorld.equals(IDENTITY)){this.restore();return;}
    const planes=frustum.planes,b=this.spheres,indices=this.scratchIndices;
    let count=0;
    for(let i=0;i<this.selected;i++){
      const j=i*4,x=b[j],y=b[j+1],z=b[j+2],r=b[j+3];let inside=true;
      for(let p=0;p<6;p++){
        const plane=planes[p],normal=plane.normal;
        if(normal.x*x+normal.y*y+normal.z*z+plane.constant < -r){inside=false;break;}
      }
      if(inside)indices[count++]=i;
    }
    let changed=count!==this.currentCount;
    if(!changed)for(let i=0;i<count;i++)if(indices[i]!==this.currentIndices[i]){changed=true;break;}
    if(changed){
      const attr=this.mesh.instanceMatrix,dest=attr.array,src=this.source;
      for(let i=0;i<count;i++){
        const from=indices[i]*16,to=i*16;
        for(let k=0;k<16;k++)dest[to+k]=src[from+k];
        this.currentIndices[i]=indices[i];
      }
      if(count){attr.clearUpdateRanges();attr.addUpdateRange(0,count*16);attr.needsUpdate=true;}
    }
    this.currentCount=count;this.mesh.count=count;
    this.full=count===this.selected && (!count || indices[count-1]===count-1);
  }
}

// Caches a camera's complete view-projection state. Call update each frame;
// re-test static instance bounds only if the view/projection actually changes.
export class InstanceFrustumView {
  constructor(){this.frustum=new THREE.Frustum();this.matrix=new THREE.Matrix4();this.last=new Float64Array(32);this.dirty=true;}
  invalidate(){this.dirty=true;}
  update(camera){
    if(!camera?.isCamera)return false;
    camera.updateMatrixWorld();
    const a=camera.matrixWorldInverse.elements,b=camera.projectionMatrix.elements;let changed=this.dirty;
    for(let i=0;i<16;i++)if(this.last[i]!==a[i]||this.last[i+16]!==b[i])changed=true;
    if(changed){
      for(let i=0;i<16;i++){this.last[i]=a[i];this.last[i+16]=b[i];}
      this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.matrix);this.dirty=false;
    }
    return changed;
  }
}
