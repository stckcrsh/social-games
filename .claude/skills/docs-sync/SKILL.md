---
description: Sync project docs with recent code changes. Usage: /docs-sync [project]
---

The user wants to sync docs with recent work. Optional argument: $ARGUMENTS (a project name — `wrastlin`, `dungeon`, or blank to auto-detect).

## What this does

This is the "ingest" step: fold a just-finished chunk of code changes into the relevant `CLAUDE.md` docs, so the docs stay accurate without a separate manual pass. It only looks at recent work — for a whole-repo consistency sweep, use `/docs-lint` instead.

## Steps

1. **Get the diff.** Run `git diff HEAD` (unstaged + staged changes) and `git diff --stat HEAD`. If that's empty, use `git diff main...HEAD` (or the current branch's merge-base) to capture the whole branch's work instead — ask the user which they mean if ambiguous.

2. **Classify by project.** Bucket changed paths:
   - `apps/wrastlin/**`, `libs/wrastlin/**` → Wrastlin
   - `apps/dungeon/**`, `libs/dungeon/**` → Dungeon
   - `libs/shared/**` → note as "shared — may affect both games", ask the user which game's docs to check if unclear
   - If `$ARGUMENTS` names a project explicitly, scope to that project only regardless of what the diff touches.

3. **Read the current docs for each touched project.** For Wrastlin: `apps/wrastlin/CLAUDE.md` (and `apps/wrastlin/meta-service/CLAUDE.md` if `apps/wrastlin/meta-service/**` changed). For Dungeon: `apps/dungeon/CLAUDE.md`, `apps/dungeon/dungeon-service/CLAUDE.md`, `apps/dungeon/meta-service/CLAUDE.md` (whichever are relevant to the changed paths).

4. **Compare code to doc claims.** For each changed file, check whether the diff adds/removes/renames anything the docs assert: HTTP routes, NX targets, CLI flags, env vars, file/dir paths mentioned by name, ports, type shapes shown in doc code blocks. Ignore purely internal refactors that don't change any externally-documented behavior.

5. **Propose edits.** Show the user a concise list of proposed doc changes (file + what would change) before writing anything. Do not silently rewrite — judging what's doc-worthy requires confirmation.

6. **On confirmation, apply and log.** Make the edits, then append one line to `docs/log.md`:
   `YYYY-MM-DD  docs-sync   <project>   <one-line summary>`
   Use today's date. If nothing needed updating, still append a line with summary `no changes needed` — this keeps the audit trail continuous.

7. **Report.** Tell the user which files were updated (or that none needed updating) and confirm the log entry was appended.
