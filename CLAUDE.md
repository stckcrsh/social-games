<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Git Worktrees

**Always use a git worktree before starting feature work.** Never develop directly on `main`.

- Use `superpowers:using-git-worktrees` skill to set up the workspace
- Worktrees live in `.worktrees/` (already gitignored)
- One worktree per feature/game — keeps dungeon and wrastlin work isolated

## Test-Driven Development

**Iron law: no production code without a failing test first.**

### The cycle
1. Write one failing test describing the desired behavior
2. Run it — confirm it **fails** for the right reason (missing feature, not a typo)
3. Write the minimal code to make it pass — nothing more
4. Run it — confirm it **passes** and no other tests broke
5. Refactor if needed, keeping tests green
6. Commit, repeat

### Rules
- If you didn't watch the test fail, you don't know if it tests the right thing
- Write minimal code — no extra features, no premature abstractions
- Tests use real code; mocks only when crossing a process/network/filesystem boundary
- Every bug fix starts with a failing test that reproduces the bug

### Test commands for this workspace
```bash
pnpm nx test wrastlin-service     # Fastify unit + integration tests (vitest)
pnpm nx test dungeon-service      # dungeon service tests
pnpm nx run-many -t test          # all projects
```

### What to test per layer
| Layer | Tool | Pattern |
|-------|------|---------|
| Pure logic (resolvers, engines) | vitest | Unit tests, real inputs/outputs |
| Fastify routes | vitest + `app.inject()` | Register route plugin, mock gameState, assert status + body |
| React components | vitest + React Testing Library | Render, interact, assert DOM |
| CLI scripts | vitest | Mock fs/gameState, assert console output + side effects |

### Red flags — stop and start over
- Writing code before the test
- Test passes immediately (you're testing existing behavior — fix the test)
- "I'll add tests after" — tests after prove nothing; you never saw them fail
- "Too simple to test" — simple code breaks too
