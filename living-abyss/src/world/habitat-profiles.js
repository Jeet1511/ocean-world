// Art-directed, bounded water and school characteristics for the existing seven
// places. The positions remain owned by geography.js. This is an artistic
// approximation, not a measured oceanographic or species-specific model.
import { LOCATIONS } from './geography.js?rev=37';

export const HABITATS = Object.freeze({
  glasshorizon: { tint: [1.02, 1.04, 1.00], density: .92, school: { radius: 18, maxSpeed: 2.45, cohesion: .09, alignment: .48 } },
  roseglass:    { tint: [1.12, 1.04, .96], density: 1.06, school: { radius: 12, maxSpeed: 2.20, cohesion: .13, alignment: .48 } },
  verdant:      { tint: [.86, 1.12, .91], density: 1.13, school: { radius: 11, maxSpeed: 1.85, cohesion: .11, alignment: .42 } },
  aurel:        { tint: [.94, .98, 1.10], density: .93, school: { radius: 17, maxSpeed: 2.20, cohesion: .08, alignment: .52 } },
  azurespan:    { tint: [.87, .97, 1.15], density: .86, school: { radius: 19, maxSpeed: 2.50, cohesion: .08, alignment: .55 } },
  floodednave:  { tint: [.87, 1.08, 1.06], density: 1.14, school: { radius: 10, maxSpeed: 1.75, cohesion: .12, alignment: .38 } },
  abyssalbowl:  { tint: [.78, .91, 1.16], density: 1.07, school: { radius: 19, maxSpeed: 1.55, cohesion: .07, alignment: .35 } },
});

// Compact support avoids an abrupt biome switch. Smooth, overlapping weights
// blend across geographic thresholds; neutral water remains outside the map.
export function sampleHabitat(x, z) {
  let sum = 0, r = 0, g = 0, b = 0, density = 0;
  const weights = {};
  for (const loc of LOCATIONS) {
    const profile = HABITATS[loc.id];
    const distance = Math.hypot(x - loc.x, z - loc.z);
    const t = Math.max(0, Math.min(1, (500 - distance) / 340));
    const weight = t * t * (3 - 2 * t);
    weights[loc.id] = weight;
    sum += weight;
    r += profile.tint[0] * weight; g += profile.tint[1] * weight; b += profile.tint[2] * weight;
    density += profile.density * weight;
  }
  // The neutral component goes to zero smoothly where a habitat is established.
  const neutral = Math.max(0, 1 - sum);
  const divisor = sum + neutral;
  return { tint: [(r + neutral) / divisor, (g + neutral) / divisor, (b + neutral) / divisor],
    density: (density + neutral) / divisor, weights };
}
