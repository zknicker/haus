---
summary: Every bun patch Haus applies to a dependency, why it exists, what proves it, and when to remove it.
read_when:
  - upgrading AI SDK harness packages or any other patched dependency
  - adding, regenerating, or removing a bun patch
---

# Dependency Patches

Haus applies bun patches from `patches/`, keyed by exact version in the root
`package.json` `patchedDependencies`. An upgrade must regenerate each patch
with `bun patch <name>@<version>` and `bun patch --commit`, then strip any
`.bun-tag-*` file hunk bun adds to the generated patch. Before regenerating,
check the removal condition below: if upstream now ships the behavior, drop the
patch instead. Run `bun install` once with `frozenLockfile = false` so
`bun.lock` records the new key, then restore the flag.

`scripts/dependency-patches.test.ts` (the `test:fast` lane) fails when a
`patchedDependencies` entry has no row here, a row has no entry, or a row lacks
a removal condition. A version bump therefore renames the key and forces a
re-check of this table.

| Patch | Changes | Proof | Remove when |
| --- | --- | --- | --- |
| `@ai-sdk/harness@1.0.133` | Display text renders a bare workspace mention as `<workspace>` instead of `.`. | `codex-acp-tools.test.ts` | Upstream display text stops collapsing a bare workspace path to `.` (no upstream issue). |
| `@ai-sdk/harness-claude-code@1.0.137` | Accepts `settingSources` on `createClaudeCode` and forwards it to `query()`; strips live credentials from persisted bridge start configs; reads plan usage after a turn when `HAUS_CLAUDE_USAGE_REFRESH=1`; bounds a stored-bridge reattach to 10s. | `claude-context-isolation.test.ts`, `claude-credential-persistence.test.ts`, `claude-bridge-attach.test.ts` | Drop each hunk as upstream ships it: `settingSources` with [vercel/ai#21714](https://github.com/vercel/ai/pull/21714) (issue #21708). The other hunks have no upstream issue; the patch goes when all four are upstream. |
| `@ai-sdk/harness-pi@1.0.135` | Passes `noContextFiles: true` to Pi's `DefaultResourceLoader`, which otherwise loads `AGENTS.md`/`CLAUDE.md` from every cwd ancestor to `/`. | `pi-context-isolation.test.ts` | The adapter disables ancestor context discovery or exposes an option for it (no upstream issue). |
| `@ai-sdk/harness-acp@1.0.71` | Adds a `local` ACP source for a host-installed executable; embeds bridge assets so the compiled Computer carries them; installs the bridge with `--ignore-workspace` and a pinned pnpm; wires live steering (`submitUserMessage`) for Grok Build and Codex; Codex token usage and host-tool correlation in the bridge. | `bridge-bootstrap.test.ts`, `codex-acp*.test.ts`, `codex-token-usage.test.ts`, `grok-token-usage.test.ts` | Upstream ships local sources, embedded bridge assets, ACP steering, and per-request Codex usage (no upstream issues). |
| `@ai-sdk/harness-grok-build@1.0.70` | Uses the `local` ACP source, so Grok Build runs the operator's installed `grok` rather than an npm-locked copy. | `bridge-bootstrap.test.ts`, opt-in `grok-build-live.test.ts` | Remove with the `harness-acp` local source, or when the adapter can target a host-installed CLI. |
| `@cursor/sdk@1.0.30` | Gives finite SDK fetches a 30s timeout while keeping caller-owned stream signals. | `apps/computer/src/cloud-agents/cursor/sdk-timeout.test.ts` | The SDK bounds its own requests (no upstream issue). |
| `@shadcn/react@0.1.0` | The message-scroller reconciler leaves reader anchors (`anchored-to-message`, `settling-jump`) alone instead of promoting them to following-bottom. | App e2e `chat-scroll.spec.ts` | Upstream preserves reader anchors on at-end commits (no upstream issue). |
| `react-aria-components@1.21.1` | Separates preview cards from tooltips in the open-overlay registry, so a nested tooltip does not dismiss its HoverCard. Paired with `react-stately`. | `bun run --filter @haus/website test:app runtime-issue-hover.spec.ts` | Upstream supports tooltips inside PreviewTrigger: [adobe/react-spectrum#10460](https://github.com/adobe/react-spectrum/issues/10460) (related #10443), still open and unfixed on upstream `main` in September 2026. |
| `react-stately@3.50.0` | The `react-stately` half of the preview-card and tooltip separation. | Same as `react-aria-components` | Same as `react-aria-components`. |
