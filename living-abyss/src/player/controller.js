// -----------------------------------------------------------------------------
// THE LIVING ABYSS — swim controller
// One kinematic body used by both exploration modes. Depth-aware damping,
// terrain collision that slides along rock instead of sticking, ceiling
// collision inside chambers, and analytic push-out from hero rock colliders.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { WORLD } from '../world/geography.js?rev=37';

export class SwimController {
  constructor(field) {
    this.field = field;
    this.pos = new THREE.Vector3(-560, -9, 1420);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = -0.05;
    this.keys = new Set();
    this.surfaceSolids = [];     // triangle-accurate geology near phase
    this._surfaceGuardCache = [];
    this.colliders = [];        // {type:'cyl'|'ell', ...}
    this.ceilings = [];         // retained for compatibility with authored ceiling bands
    this.roofs = [];            // actual cavern meshes for upward collision
    this.roofRay = new THREE.Raycaster();
    this.radius = 1.15;         // body clearance (metres)
    this.speedCap = 13.0;
    this.sprintCap = 30.0;
    this.accel = 26.0;
    this.mode = 'free';         // 'free' | 'dolphin'
    this.breach = 0;            // 0..1 how much we're above water
    this.lastSafe = this.pos.clone();
    // Off unless explicitly enabled by a developer. Bounded, no physics effect.
    this.traceCollisions = false;
    this.collisionTrace = [];
  }

  setPose(x, y, z, yaw, pitch) {
    // Guard: never set NaN/invalid coordinates — teleporting to NaN freezes
    // the renderer because every subsequent frame tries to draw at NaN.
    if(!isFinite(x)||!isFinite(y)||!isFinite(z)){
      x=this.lastSafe ? this.lastSafe.x : 0;
      y=this.lastSafe ? this.lastSafe.y : -6;
      z=this.lastSafe ? this.lastSafe.z : 720;
    }
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
  }

  addKey(code, down) {
    if (down) this.keys.add(code); else this.keys.delete(code);
  }

  /** Height of the walkable surface at a location (seabed, or chamber floor). */
  floorAt(x, z) {
    const f = this.field.surfaceHeightAt
      ? this.field.surfaceHeightAt(x, z)
      : this.field.heightAt(x, z);
    // Guard against NaN from out-of-bounds or uninitialized terrain queries.
    // A NaN floor here would poison every subsequent collision calculation and
    // freeze the renderer — never let that happen.
    return isFinite(f) ? f : (this.pos ? this.pos.y : -6);
  }

  /** Ceiling clamp: inside a flooded chamber the roof limits how high you go. */
  ceilingAt(x, z, y) {
    // Concentric roof bands: the innermost band that contains the point wins,
    // and the open gate sector is exempt so halls are always enterable.
    let best = Infinity, bestR = Infinity;
    for (let i = 0; i < this.ceilings.length; i++) {
      const c = this.ceilings[i];
      const d = Math.hypot(x - c.x, z - c.z);
      if (d >= c.r) continue;
      if (y > c.y + 2.0) continue;            // above the roof: outside the hall
      if (c.gate !== undefined) {
        let da = Math.atan2(z - c.z, x - c.x) - c.gate;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < c.gateHalf) continue;
      }
      if (c.r < bestR) { bestR = c.r; best = c.y; }
    }
    return best;
  }

  recordContact(kind, details) {
    if (!this.traceCollisions) return;
    this.collisionTrace.push({ time: Date.now(), kind, position: this.pos.toArray(),
      yaw: this.yaw, pitch: this.pitch, keys: [...this.keys], ...details });
    if (this.collisionTrace.length > 200) this.collisionTrace.shift();
  }

  /** Resolve penetration against hero rock colliders (pillars, arches, plates). */
  resolveColliders(p) {
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (c.type === 'cyl') {
        if (p.y > c.yTop + this.radius || p.y < c.yBase - this.radius) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const rr = c.r + this.radius;
        if (d < rr && d > 1e-4) {
          if (c.meshGuard) {
            const attempted = this.traceCollisions ? p.toArray() : null;
            if (c.meshGuard.resolve(p, this.radius) && this.traceCollisions)
              this.recordContact('solid', { source: c.source || c.name || `collider-${i}`, collider: {...c}, attempted, narrowPhase: 'visible triangles' });
            continue;
          }
          if (this.traceCollisions) this.recordContact('solid', { source: c.source || c.name || `collider-${i}`, collider: {...c}, attempted: p.toArray() });
          const push = (rr - d);
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
        }
      } else if (c.type === 'ell') {
        // ellipsoid (towers, boulders, arch feet)
        const dx = (p.x - c.x) / (c.rx + this.radius);
        const dy = (p.y - c.y) / (c.ry + this.radius);
        const dz = (p.z - c.z) / (c.rz + this.radius);
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1 && d2 > 1e-6) {
          if (this.traceCollisions) this.recordContact('solid', { source: c.source || c.name || `collider-${i}`, collider: {...c}, attempted: p.toArray() });
          const d = Math.sqrt(d2);
          const s = (1 - d) / d;
          p.x += dx * s * (c.rx + this.radius) * 0.55;
          p.y += dy * s * (c.ry + this.radius) * 0.35;
          p.z += dz * s * (c.rz + this.radius) * 0.55;
        }
      } else if (c.type === 'cap') {
        // capsule segment (arch spans, bridges)
        const ax = c.x1, ay = c.y1, az = c.z1;
        const bx = c.x2, by = c.y2, bz = c.z2;
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const apx = p.x - ax, apy = p.y - ay, apz = p.z - az;
        const len2 = abx * abx + aby * aby + abz * abz;
        let t = len2 > 0 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        const d = Math.hypot(dx, dy, dz);
        const rr = c.r + this.radius;
        if (d < rr && d > 1e-4) {
          if (c.meshGuard) {
            const attempted = this.traceCollisions ? p.toArray() : null;
            if (c.meshGuard.resolve(p, this.radius) && this.traceCollisions)
              this.recordContact('solid', { source: c.source || c.name || `collider-${i}`, collider: {...c}, attempted, narrowPhase: 'visible triangles' });
            continue;
          }
          if (this.traceCollisions) this.recordContact('solid', { source: c.source || c.name || `collider-${i}`, collider: {...c}, attempted: p.toArray() });
          const push = rr - d;
          p.x += (dx / d) * push;
          p.y += (dy / d) * push;
          p.z += (dz / d) * push;
        }
      }
    }
  }

  /** Resolve nearby rendered rock surfaces; geometry guards are built lazily. */
  resolveSurfaceSolids(p) {
    const r=this.radius;
    for (const solid of this.surfaceSolids) {
      const b=solid.bounds;
      if(p.x+r<b.min.x || p.x-r>b.max.x || p.y+r<b.min.y || p.y-r>b.max.y || p.z+r<b.min.z || p.z-r>b.max.z)continue;
      if(!solid.guard) {
        solid.guard=solid.createGuard();
        this._surfaceGuardCache.push(solid);
        if(this._surfaceGuardCache.length>24) this._surfaceGuardCache.shift().guard=null;
      }
      const attempted=this.traceCollisions ? p.toArray() : null;
      if(solid.guard.resolve(p,r) && this.traceCollisions)
        this.recordContact('visible-rock', {source:solid.source,attempted,narrowPhase:'visible triangles'});
    }
  }

  /** Sweep against registered visible geology as well as endpoint contact.
   * Radius-spaced samples prevent ordinary sprint steps crossing a thin rock
   * face; corrections accumulate so tangential motion can continue to slide.
   * Cave spires and roof shells keep their specialized swept checks below. */
  resolveSweptSurfaceSolids(next) {
    const movement=next.clone().sub(this.pos),length=movement.length();
    if(length<1e-8)return;
    const r=this.radius,lo=new THREE.Vector3().copy(this.pos).min(next).addScalar(-r*2),
      hi=new THREE.Vector3().copy(this.pos).max(next).addScalar(r*2),candidates=[];
    for(const solid of this.surfaceSolids){
      if(solid.sweptPieces||!solid.bounds)continue;
      const b=solid.bounds;
      if(lo.x>b.max.x||hi.x<b.min.x||lo.y>b.max.y||hi.y<b.min.y||lo.z>b.max.z||hi.z<b.min.z)continue;
      candidates.push(solid);
    }
    if(!candidates.length)return;
    const steps=Math.max(1,Math.ceil(length/(r*.5))),sample=new THREE.Vector3(),ideal=new THREE.Vector3(),offset=new THREE.Vector3();
    for(let i=1;i<=steps;i++){
      ideal.copy(this.pos).addScaledVector(movement,i/steps);sample.copy(ideal).add(offset);
      for(const solid of candidates){
        const b=solid.bounds;
        if(sample.x+r<b.min.x||sample.x-r>b.max.x||sample.y+r<b.min.y||sample.y-r>b.max.y||sample.z+r<b.min.z||sample.z-r>b.max.z)continue;
        if(!solid.guard){solid.guard=solid.createGuard();this._surfaceGuardCache.push(solid);
          if(this._surfaceGuardCache.length>24)this._surfaceGuardCache.shift().guard=null;}
        const attempted=this.traceCollisions?sample.toArray():null;
        if(solid.guard.resolve(sample,r)&&this.traceCollisions)
          this.recordContact('visible-rock-sweep',{source:solid.source,attempted,narrowPhase:'swept visible triangles'});
      }
      offset.copy(sample).sub(ideal);
    }
    next.copy(sample);
  }

  /** Sweep the player's sphere through cave spires, using each spire's
   * individual visual bounds. Sampling spacing is at most half the radius.
   * This does not certify all geology; non-spire surfaces retain endpoint checks. */
  resolveSweptCaveSpikes(next) {
    const movement=next.clone().sub(this.pos),length=movement.length();
    if(length<1e-8)return;
    const r=this.radius, lo=new THREE.Vector3().copy(this.pos).min(next).addScalar(-r),
      hi=new THREE.Vector3().copy(this.pos).max(next).addScalar(r), candidates=[];
    for(const solid of this.surfaceSolids){
      if(!solid.sweptPieces)continue;
      for(const piece of solid.sweptPieces){const b=piece.bounds;
        if(lo.x>b.max.x||hi.x<b.min.x||lo.y>b.max.y||hi.y<b.min.y||lo.z>b.max.z||hi.z<b.min.z)continue;
        if(!piece.guard){piece.guard=piece.createGuard();this._surfaceGuardCache.push(piece);
          if(this._surfaceGuardCache.length>24)this._surfaceGuardCache.shift().guard=null;}
        candidates.push(piece);
      }
    }
    if(!candidates.length)return;
    const steps=Math.max(1,Math.ceil(length/(r*.5))), sample=new THREE.Vector3();
    for(let i=1;i<=steps;i++){
      sample.copy(this.pos).addScaledVector(movement,i/steps);
      for(const piece of candidates){const b=piece.bounds;
        if(sample.x+r<b.min.x||sample.x-r>b.max.x||sample.y+r<b.min.y||sample.y-r>b.max.y||sample.z+r<b.min.z||sample.z-r>b.max.z)continue;
        const attempted=this.traceCollisions?sample.toArray():null;
        // A guard can have been evicted during candidate creation when many
        // bounds overlap. Recreate lazily, preserving the bounded cache.
        if(!piece.guard){piece.guard=piece.createGuard();this._surfaceGuardCache.push(piece);
          if(this._surfaceGuardCache.length>24)this._surfaceGuardCache.shift().guard=null;}
        if(piece.guard.resolve(sample,r)){
          if(this.traceCollisions)this.recordContact('cave-spike-surface',{source:piece.source,attempted,narrowPhase:'swept visible triangles'});
          next.copy(sample);return;
        }
      }
    }
  }

  /** Swept sphere sampling against the visible open vault shell. The <= half
   * radius step prevents ordinary sprint motion crossing thin cave walls.
   * Roofs without a baked guard retain the previous upward-ray behavior. */
  resolveRoofMovement(next) {
    const movement=next.clone().sub(this.pos),length=movement.length();
    if(length<1e-8)return;
    const steps=Math.max(1,Math.ceil(length/(this.radius*.5)));
    const sample=new THREE.Vector3();
    for(let i=1;i<=steps;i++){
      sample.copy(this.pos).addScaledVector(movement,i/steps);
      for(const roof of this.roofs){
        const guard=roof.userData.contactGuard,b=roof.userData.contactBounds,r=this.radius;
        if(!guard||!b||sample.x+r<b.min.x||sample.x-r>b.max.x||sample.y+r<b.min.y||sample.y-r>b.max.y||sample.z+r<b.min.z||sample.z-r>b.max.z)continue;
        const attempted=this.traceCollisions?sample.toArray():null;
        if(guard.resolve(sample,r)){
          if(this.traceCollisions)this.recordContact('roof-surface',{source:roof.name,attempted,narrowPhase:'swept visible triangles'});
          next.copy(sample);return;
        }
      }
    }
  }

  update(dt, camera) {
    const k = this.keys;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const fwd = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const thrust = new THREE.Vector3();
    if (k.has('KeyW')) thrust.add(fwd);
    if (k.has('KeyS')) thrust.sub(fwd);
    if (k.has('KeyQ')) thrust.y -= 1;
    if (k.has('KeyE')) thrust.y += 1;
    // A/D: turn (per the design spec), with a small strafe component for feel
    let turn = 0;
    if (k.has('KeyA')) turn += 1;
    if (k.has('KeyD')) turn -= 1;
    this.yaw += turn * dt * (1.5 + (this.mode === 'dolphin' ? 0.7 : 0));
    if (k.has('KeyZ')) thrust.addScaledVector(right, -0.6);
    if (k.has('KeyC')) thrust.addScaledVector(right, 0.6);

    const cap = sprint ? this.sprintCap : this.speedCap;
    if (thrust.lengthSq() > 0) {
      thrust.normalize();
      this.vel.addScaledVector(thrust, this.accel * dt * (sprint ? 1.8 : 1));
    }

    // water drag — heavy, gliding, never instant
    const drag = Math.pow(0.06, dt);
    this.vel.multiplyScalar(drag * (thrust.lengthSq() > 0 ? 1.0 : 0.92));
    if (this.vel.length() > cap) this.vel.setLength(cap);

    // buoyancy near the surface keeps you from drifting to the sky
    const surf = WORLD.seaLevel;
    if (this.pos.y > surf - 1.2 && this.vel.y > 0) this.vel.y *= 0.55;

    const next = this.pos.clone().addScaledVector(this.vel, dt);

    // --- world bounds (never a teleport). Keep the swimmer's body within
    // the authored map, rather than erecting an invisible wall 60 m inside it.
    const m = this.radius;
    if (this.traceCollisions && (next.x < WORLD.minX + m || next.x > WORLD.maxX - m || next.z < WORLD.minZ + m || next.z > WORLD.maxZ - m || next.y > 220))
      this.recordContact('world-boundary', { attempted: next.toArray(), bounds: {minX: WORLD.minX, maxX: WORLD.maxX, minZ: WORLD.minZ, maxZ: WORLD.maxZ, maxY: 220} });
    next.x = Math.max(WORLD.minX + m, Math.min(WORLD.maxX - m, next.x));
    next.z = Math.max(WORLD.minZ + m, Math.min(WORLD.maxZ - m, next.z));
    next.y = Math.min(next.y, 220);   // a dolphin may jump, not fly to space

    // --- terrain collision with sliding
    const clearance = this.radius;
    const floor = this.floorAt(next.x, next.z);
    if (next.y < floor + clearance) {
      if (this.traceCollisions) this.recordContact('terrain', { attempted: next.toArray(), floorHeight: floor, radius: clearance });
      // Project movement onto the actual surface rather than damping *all*
      // velocity every frame. Looking slightly down while swimming over the
      // seabed used to repeatedly hit this branch and feel like a wall.
      // A candidate may follow a gentle rise, but not step through a cliff.
      const dx = next.x - this.pos.x, dz = next.z - this.pos.z;
      const currentFloor = this.floorAt(this.pos.x, this.pos.z);
      const allowed = (height, distance) =>
        height + clearance <= this.pos.y + Math.max(0, distance) * 0.8 + 1e-5;
      let resolvedFloor = floor;
      if (!allowed(floor, Math.hypot(dx, dz))) {
        const fx = this.floorAt(next.x, this.pos.z);
        const fz = this.floorAt(this.pos.x, next.z);
        if (Math.abs(dx) > 1e-8 && allowed(fx, Math.abs(dx))) {
          next.z = this.pos.z; resolvedFloor = fx;
        } else if (Math.abs(dz) > 1e-8 && allowed(fz, Math.abs(dz))) {
          next.x = this.pos.x; resolvedFloor = fz;
        } else {
          next.x = this.pos.x; next.z = this.pos.z; resolvedFloor = currentFloor;
        }
      }
      next.y = Math.max(next.y, resolvedFloor + clearance);
    }

    // Test against the visible cavern shell instead of broad, flat imaginary
    // ceiling discs. Cast only the vertical movement swept by the swimmer:
    // an overhead roof metres away must never pull the player down to it.
    if (next.y > this.pos.y && this.roofs.length) {
      this.roofRay.set(new THREE.Vector3(next.x, this.pos.y, next.z), new THREE.Vector3(0, 1, 0));
      this.roofRay.near = 0;
      this.roofRay.far = next.y - this.pos.y + clearance;
      const hits = this.roofRay.intersectObjects(this.roofs, false);
      if (hits.length) {
        if (this.traceCollisions) this.recordContact('roof', { attempted: next.toArray(), source: hits[0].object.name || 'unnamed roof', hit: hits[0].point.toArray() });
        next.y = Math.max(this.pos.y, Math.min(next.y, hits[0].point.y - clearance));
        this.vel.y = Math.min(this.vel.y, 0);
      }
    }
    // Honor any explicitly registered legacy ceiling constraints as well.
    const ceil = this.ceilingAt(next.x, next.z, this.pos.y);
    if (next.y + clearance > ceil) {
      if (this.traceCollisions) this.recordContact('legacy-ceiling', { attempted: next.toArray(), ceilingHeight: ceil });
      next.y = ceil - clearance;
      this.vel.y *= 0.3;
    }

    // Analytic cores are retained for existing systems. Actual visible geology
    // surfaces are also checked, including shelves and boulder outer ledges.
    this.resolveRoofMovement(next);
    this.resolveSweptCaveSpikes(next);
    this.resolveSweptSurfaceSolids(next);
    this.resolveColliders(next);
    this.resolveSurfaceSolids(next);
    const floorAfter = this.floorAt(next.x, next.z);
    if (next.y < floorAfter + clearance) next.y = floorAfter + clearance;

    this.vel.copy(next).sub(this.pos).multiplyScalar(1 / Math.max(dt, 1e-4));
    if (this.vel.length() > cap * 1.5) this.vel.setLength(cap * 1.5);
    // Never let NaN/Inf coordinates poison the player position — that freezes
    // the renderer on the very next frame. Fall back to the last known-safe
    // pose if the collision solver produced invalid output.
    if (!isFinite(next.x) || !isFinite(next.y) || !isFinite(next.z)) {
      this.pos.copy(this.lastSafe);
      this.vel.set(0, 0, 0);
    } else {
      this.pos.copy(next);
      this.lastSafe.copy(this.pos);
    }

    this.breach = THREE.MathUtils.clamp(this.pos.y / 1.5, 0, 1);

    // --- camera
    if (camera) {
      const dir = fwd;
      if (this.mode === 'free') {
        camera.position.copy(this.pos);
        camera.lookAt(this.pos.clone().add(dir));
      }
    }
    return this;
  }
}
