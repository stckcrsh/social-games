# Docs Sync/Lint Log

Append-only record of `/docs-sync` and `/docs-lint` runs. One line per run:

`YYYY-MM-DD  <docs-sync|docs-lint>  <project|all>  <one-line summary>`

---

2026-06-30  docs-sync   dungeon    initial baseline: split SYSTEM_OVERVIEW.md into dungeon-service/CLAUDE.md and meta-service/CLAUDE.md, verified against current source
2026-06-30  docs-sync   wrastlin   fixed stale game UI port (5173→4300) and NX project name (@org/wrastlin-game→wrastlin-game)
2026-07-01  docs-sync   wrastlin   validation dry-run against trivial no-op export in promptfoo-helpers.ts — no changes needed (purely internal, no externally-documented behavior touched)
2026-07-01  docs-lint   all        6 broken refs, 0 contradictions, 2 orphaned docs, 0 stale docs — fixed 6 broken NX-target refs in apps/wrastlin/CLAUDE.md and apps/wrastlin/meta-service/CLAUDE.md (run-beats/run-promo/run-announcer/print-prompt not wired to NX; close-submissions/advance-week are curl routes, not NX targets); 2 orphaned docs (docs/map-authoring.md, docs/diagrams/wrastlin-flows.md) predate this project and are left as-is
