# Performance report

Target: user-specified i5-12400, RTX 3050 6 GB, 16 GB RAM. **No target machine benchmark was available.** No target FPS or VRAM claim is made. Headless Chromium uses SwiftShader; screenshots and smoke tests are not representative of target hardware.

Fish: 17 instanced draws, 1,420 agents, fixed 8 Hz simulation with per-school all-pairs neighbor loops, O(sum(n²)). Arrays are reused for per-step output; no large texture imports in this pass. All fish schools continue simulating regardless of distance. Need instrument frame-time percentiles, CPU/GPU and GPU memory on actual hardware and evaluate spatial partitioning, culling and quality scaling.
