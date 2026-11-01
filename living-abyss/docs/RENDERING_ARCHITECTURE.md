# Rendering architecture and limits

`src/shaders/common.js` implements RGB exponential attenuation, depth-dependent sunlight/ambient, heuristic inscattering and caustics. Terrain, rock, vegetation and wildlife use shared custom GLSL; ocean and sky remain. This is an artistic RGB approximation, **not** the spectral, measured-water-type multiple-scattering algorithm of Monzon et al. 2024.

The 2024 paper separates froxel single scattering from a constant-time-per-wavelength multiple scattering approximation tied to measured Kd; implementation and profiling would require additional resources and design. We have not silently claimed it as implemented. References and relevant findings in `RESEARCH_LEDGER.md`. KTX2, real streaming and target GPU performance remain unimplemented/unmeasured.
