---
description: Whole-repo documentation health check — broken refs, contradictions, orphaned docs, staleness. Usage: /docs-lint
---

The user wants a whole-repo doc health check. This is the "lint" step: unlike `/docs-sync` (which only looks at recent diffs), this scans the full living-docs set for problems that accumulate over time.

## Scope

Living docs to check: root `README.md`, root `CLAUDE.md`, every `apps/**/CLAUDE.md`, `docs/map-authoring.md`, `docs/diagrams/*.md`. Do NOT include `docs/plans/`, `docs/superpowers/` (point-in-time design records, not living docs, and `docs/superpowers/` is gitignored) or `apps/wrastlin/GAME_STATUS.md` (explicitly a snapshot doc, not meant to always be current).

## Checks

1. **Broken references.** For each doc, extract file/dir paths written in backticks that look like repo paths (start with `apps/`, `libs/`, `docs/`, or `.claude/`). Check each exists:
   ```bash
   test -e "<path>" && echo OK || echo "MISSING: <path> (referenced in <doc>)"
   ```
   Also extract NX project names mentioned (compare against `pnpm nx show projects` output) and NX targets mentioned as `pnpm nx run <project>:<target>` or `pnpm nx serve/test <project>` (verify via `pnpm nx show project <project> --json` that the target exists).

2. **Contradictions.** Collect every port number, service/project name, and env var name asserted across the doc set and compare. Flag any fact stated differently in two places (e.g. one doc says port 3002, another says 3200 for the same service).

3. **Orphaned docs.** List every file in scope (per the Scope section above). A doc is orphaned if no other in-scope doc links to it (check via `grep -rl "<filename>"` across the doc set) AND it isn't one of the two entry points (root `README.md`, root `CLAUDE.md`).

4. **Staleness signal.** For each `apps/<game>/**/CLAUDE.md`, compare its last-commit date against the last-commit date of the source directory it documents:
   ```bash
   git log -1 --format=%ai -- <doc-path>
   git log -1 --format=%ai -- <source-dir-it-documents>
   ```
   Flag if the source directory has commits significantly newer (e.g. weeks) than the doc with no corresponding doc commit in between — this means code changed without a doc update.

## Output

Produce a findings report grouped by check type (broken refs / contradictions / orphans / staleness), each with the doc file and specific detail. This is diagnosis only — do not edit files. If the user wants fixes applied, suggest running `/docs-sync` for the affected project, or offer to make the specific edit if it's trivial and the user confirms.

Append one line to `docs/log.md` regardless of outcome:
`YYYY-MM-DD  docs-lint   all   <N> broken refs, <M> contradictions, <K> orphaned docs, <J> stale docs`
(use `0` for any category with no findings; if all four are `0`, summary is `no issues found`)
