# Workspace Inventory

Running log of uploaded parts. Updated as each part arrives.

## Part 1 — `workspace-01a18d07-4cc4-796a-bbe2-dd153c29fafc.zip`
- Source: https://maskbee.vercel.app/file/jxe5nO (Mask Bee code `jxe5nO`)
- Downloaded: 2026-10-30 · 28,274,080 bytes (28.3 MB) — byte count matched the server's `content-length`
- Archive: 1,176 entries, no absolute paths / no `..` traversal, extracted to `/home/user`
- Removed: stray empty `.sudo_as_admin_successful` (sandbox artifact, not project content)

### Extracted layout
```
living-abyss/                  30 MB   ← main project
├── index.html                 8.7 KB  (self-contained page + HUD/loader markup)
├── package.json               { "name": "the-living-abyss", type: module }
├── probe.mjs
├── src/                       216 KB
│   ├── main.js
│   ├── core/noise.js
│   ├── player/{controller,dolphin}.js
│   ├── shaders/{common,sky}.js
│   ├── ui/hud.js
│   └── world/{atmosphere,caverns,flora,geography,geology,ocean,rockmat,terrain}.js
├── vendor/                    2.0 MB  (three.module.js + jsm/)
├── package/                   21 MB   (unpacked three r169 npm package: examples, fonts, etc.)
├── three-0.169.0.tgz          6.8 MB  (three.js source tarball)
├── tools/                     diag.mjs, frame.mjs, inspect.mjs, tour.mjs, ui.mjs, shots.json
├── tools_qc_map.mjs / .py, tools_qc_shot.mjs
└── (vendor/jsm: OrbitControls, GLTFExporter, DRACO, mmd, etc.)

tools/                         8.5 KB  ← separate helper project
├── package.json               (dep: playwright ^1.47.2)
├── package-lock.json
└── t.mjs
```

### Project identified
**THE LIVING ABYSS** — a continuous, explorable 3D ocean world built with three.js r169.
Vendored three.js means it runs offline; `tools/` is a Playwright harness for QC screenshots.

### Notes
- `node_modules/`, `dist/`, `build/` are excluded from workspace snapshots — any of these need re-creating after a restore.
- `living-abyss/package/` (21 MB) is just the unpacked three.js npm package; safe to delete if space is tight, since `vendor/` already holds what `index.html`/`src` import.

## Workspace cleanup — 2026-10-31
Redundant intermediate backups and older diagnostic images were removed at the user's request, along with the disposable npm download cache. Earlier size figures above describe the original upload and are no longer current. The current game, its source assets, and all user uploads were retained. The earlier incompatible world reference, the initial current-world source baseline, and the latest pre-reef-pass source rollback remain; see `preservation/HISTORICAL_BACKUP_RESTORE.md`. Older audit documents and reports can reference images or backups that were deliberately removed. Playwright and its Chromium browser remain for game testing; their dependency and cache directories are excluded from saved workspace snapshots.
