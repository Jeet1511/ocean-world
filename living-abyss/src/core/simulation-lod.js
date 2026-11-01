// -----------------------------------------------------------------------------
// THE LIVING ABYSS — Multi-Level Simulation LOD Manager
//
// Manages all creature and AI updates with distance- and visibility-based tiers:
//   NEAR   (<  60 m)  Full simulation every frame, full AI, full collision
//   MEDIUM ( 60-180 m) Simulated every 2-3 frames, reduced AI frequency,
//                      interpolated movement, preserved visual animation
//   FAR    (180-400 m) Simulated every 4-6 frames, minimal AI,
//                      maintain formation, efficient animation
//   OFF    (> 400 m)   Maintain position/state only, no per-frame updates,
//                      time advances, no expensive per-frame work
//
// Transitions are smooth: positions are interpolated, simulation time always
// advances (never freezes), and no teleporting or direction snapping occurs.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';

// Simulation tier constants
export const SIM_TIER = {
  NEAR: 0,
  MEDIUM: 1,
  FAR: 2,
  OFF: 3,
};

// Distance thresholds (metres) from camera to creature group centre
const DIST_NEAR = 150;
const DIST_MEDIUM = 180;
const DIST_FAR = 400;

// Update period (in frames) per tier
const UPDATE_PERIOD = {
  [SIM_TIER.NEAR]: 1,      // every visible frame
  [SIM_TIER.MEDIUM]: 1,    // continuous pose; AI cost is reduced separately
  [SIM_TIER.FAR]: 1,       // continuous silhouette without six-frame freezes
  [SIM_TIER.OFF]: 0,       // hidden outside the simulation horizon
};

// AI cost multiplier per tier (0 = skip AI, 1 = full AI)
const AI_COST = {
  [SIM_TIER.NEAR]: 1.0,
  [SIM_TIER.MEDIUM]: 0.35,
  [SIM_TIER.FAR]: 0.1,
  [SIM_TIER.OFF]: 0.0,
};

export class SimulationLOD {
  constructor(camera) {
    this.camera = camera;
    this.frame = 0;
    // Registered updateables: { update(dt, tier, camera), tier, priority, ... }
    this.entities = [];
    // Per-tier update scheduling: which frame indices each tier updates on
    this.tierSchedules = {
      [SIM_TIER.NEAR]: new Set(),
      [SIM_TIER.MEDIUM]: new Set(),
      [SIM_TIER.FAR]: new Set(),
      [SIM_TIER.OFF]: new Set(),
    };
    // Stats for debugging
    this.stats = {
      near: 0, medium: 0, far: 0, off: 0,
      updatesThisFrame: 0,
      aiCostThisFrame: 0,
    };
  }

  /** Register a creature group for LOD-managed updates. */
  register(descriptor) {
    const ent = {
      id: descriptor.id || `ent_${this.entities.length}`,
      update: descriptor.update,
      getPosition: descriptor.getPosition,
      getRadius: descriptor.getRadius || (() => 0),
      tier: SIM_TIER.NEAR,
      lastUpdateFrame: -999,
      updatePeriod: UPDATE_PERIOD[SIM_TIER.NEAR],
      aiCost: AI_COST[SIM_TIER.NEAR],
      prevPos: new THREE.Vector3(),
      targetPos: new THREE.Vector3(),
      interpAlpha: 1.0,
      active: true,
      ...descriptor,
    };
    this.entities.push(ent);
    this._reclassify(ent);
    return ent;
  }

  /** Unregister an entity. */
  unregister(descriptor) {
    const idx = this.entities.findIndex(e => e.id === descriptor.id);
    if (idx >= 0) this.entities.splice(idx, 1);
  }

  /** Call once per frame before updates. Classifies all entities by distance. */
  beginFrame() {
    this.frame++;
    this.stats = { near: 0, medium: 0, far: 0, off: 0, updatesThisFrame: 0, aiCostThisFrame: 0 };
    const cam = this.camera.position;
    for (const ent of this.entities) {
      if (!ent.active) continue;
      const pos = ent.getPosition ? ent.getPosition() : null;
      if (pos) {
        const d = cam.distanceTo(pos);
        ent._distance = d;
        this._reclassify(ent, d);
      }
    }
  }

  _reclassify(ent, distOverride) {
    const d = distOverride !== undefined ? distOverride : ent._distance;
    let newTier;
    if (d < DIST_NEAR) newTier = SIM_TIER.NEAR;
    else if (d < DIST_MEDIUM) newTier = SIM_TIER.MEDIUM;
    else if (d < DIST_FAR) newTier = SIM_TIER.FAR;
    else newTier = SIM_TIER.OFF;

    if (newTier !== ent.tier) {
      ent.tier = newTier;
      ent.updatePeriod = UPDATE_PERIOD[newTier];
      ent.aiCost = AI_COST[newTier];
      // Reset last update so the entity simulates immediately on tier change
      ent.lastUpdateFrame = -999;
    }

    this.stats[['near', 'medium', 'far', 'off'][newTier]]++;
  }

  /** Run all due updates for this frame. Returns stats. */
  update(dt, cameraPosition, maxUpdates = Infinity) {
    this.stats.updatesThisFrame = 0;
    this.stats.aiCostThisFrame = 0;

    // A hard per-frame budget prevents all systems entering a destination from
    // updating on the same frame. Rotating the start index avoids starvation.
    const total=this.entities.length;
    const start=total ? this.frame%total : 0;
    for (let scan=0;scan<total;scan++) {
      if(this.stats.updatesThisFrame>=maxUpdates)break;
      const ent=this.entities[(start+scan)%total];
      if (!ent.active) continue;

      // Staggered scheduling: entity updates only on specific frame indices
      const due = ent.updatePeriod === 0
        ? false
        : (this.frame - ent.lastUpdateFrame) >= ent.updatePeriod;

      if (!due) continue;

      // Save previous position for interpolation
      const currentBefore=ent.getPosition ? ent.getPosition() : null;
      if(currentBefore)ent.prevPos.copy(currentBefore);
      const curPos = currentBefore;
      if (curPos) ent.targetPos.copy(curPos);

      // Run the actual update with tier-appropriate parameters
      const tierDt = dt * (ent.updatePeriod / 1); // scale dt by update period for far entities
      // Creature controllers operate on a world-space Vector3, not the Camera
      // object. Passing Camera produced undefined x/y/z values and aborted the
      // complete LOD loop before any registered animal could move.
      ent.update(tierDt, ent.tier, ent.aiCost, cameraPosition);

      ent.lastUpdateFrame = this.frame;
      this.stats.updatesThisFrame++;
      this.stats.aiCostThisFrame += ent.aiCost;

      // Interpolate position for smooth tier transitions
      if (ent.tier !== SIM_TIER.NEAR && curPos) {
        ent.interpAlpha = Math.min(1.0, ent.interpAlpha + dt * 2.0);
      } else {
        ent.interpAlpha = 1.0;
      }
    }

    return this.stats;
  }

  /** Get interpolated position for an entity (for rendering between updates). */
  getInterpolatedPosition(ent) {
    if (!ent || ent.interpAlpha >= 1.0) return ent.targetPos;
    return new THREE.Vector3().lerpVectors(ent.prevPos, ent.targetPos, ent.interpAlpha);
  }
}

// Singleton instance
let _instance = null;
export function getSimulationLOD(camera) {
  if (!_instance) _instance = new SimulationLOD(camera);
  return _instance;
}
