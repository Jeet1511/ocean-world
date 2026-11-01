# Backups retained after workspace cleanup

On the user's request, redundant intermediate backups and older audit screenshots were removed to reduce workspace size. In particular, `historical-snapshots-deduplicated.zip` and its restore script were deleted; older documents that refer to them or other deleted snapshots are historical and those versions can no longer be restored from this workspace.

Three archives remain:

- `archived-earlier-version.zip` — earlier incompatible world retained as a reference, per the user's previous decision.
- `pre-enhancement-20261030.zip` — initial current-world source baseline.
- `pre-reference-reef-pass.tar.gz` — most recent rollback of source, tests, documentation, index and asset manifest from immediately before the reference-led reef pass. **It is not a complete backup of the game assets.**

The current game and its editable/source assets remain in `../living-abyss/`. User-uploaded references are unchanged in `../uploads/`. Selected before/after evidence and the latest visual review remain under `visual-audit/`; old report files may still reference screenshots removed during cleanup.
