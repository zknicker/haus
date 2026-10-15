---
name: haus-widgets
description: Use when changing Haus visual or page fences, their render contracts, Agent authoring guidance, sandboxing, or legacy Widget replay. Covers the current seams across @haus/api, Computer, Server, App, docs, and tests.
---

# Haus Widgets

Haus currently renders two Agent-authored fence types: inline `visual` HTML and durable
`page` workspace files (the old `artifact` fence is not recognized). The old closed Widget catalog is retired. Treat historical Widget rows
as replay compatibility, not an extension point.

## Start

1. Read repo `AGENTS.md` and run `bun run docs:list`.
2. Read `docs/internals/widgets.md`, `docs/internals/pages.md`, and
   `docs/adr/0010-widgets-use-tagged-fences.md`.
3. Follow the current source paths from those docs before editing; preserve unrelated dirty work.

## Current ownership

- `packages/haus-api/src/widgets/visual/`: visual-fence splitting and validation.
- `packages/haus-api/src/widgets/artifact/`: page-card payload validation (widget name `artifact`).
- `packages/haus-api/src/widgets/workspace-path.ts`: confined workspace paths.
- `packages/agent-workspace/src/visuals-skill/`: Agent authoring guidance and design references.
- `apps/website/src/features/chats/`: transcript splitting, visual cards, page cards, and pane
  rendering.
- `apps/website/src/agent-html/`: iframe sandbox and injected theme-token contract.
- `apps/server/src/widgets/`: dormant historical row projection only.

## Change checklist

1. Change the narrow API contract first. Keep schemas strict and reject traversal, unknown props,
   oversized bodies, and unsupported fence kinds at the boundary.
2. Update the App renderer without expanding the iframe's authority. Agent-authored HTML stays in an
   opaque-origin sandbox; never add `allow-same-origin`, app DOM access, cookies, storage, or an
   unrestricted network channel.
3. Keep visuals and pages distinct:
   - `visual` content is the durable message body and renders inline.
   - `page` points at one confined `.html` or `.htm` workspace file and opens in the Workspace pane.
4. When authoring guidance changes, update the seeded visuals skill under
   `packages/agent-workspace/src/visuals-skill/` and its focused tests. Keep the managed Computer
   prompt as a small pointer to that skill.
5. Preserve historical Widget fallback rendering. Do not restore catalog schemas or renderers to
   support new output.
6. Update `docs/internals/widgets.md` or `docs/internals/pages.md` whenever the durable fence,
   sandbox, rendering, or ownership contract changes.

## Verify

Run the smallest lanes covering the changed seams, then repository lint:

```bash
bun test packages/haus-api/src/widgets
bun run --filter @haus/api typecheck
bun run --filter @haus/website typecheck
bun run --filter @haus/computer typecheck
bun run lint
git diff --check
```
