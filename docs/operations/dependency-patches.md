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

The root `package.json` `overrides` pin `@ai-sdk/harness`, `@ai-sdk/provider`, and
`@ai-sdk/provider-utils` to the versions the other harness adapters require.
`@ai-sdk/harness-claude-code@1.0.143` asks for newer exact versions, and a nested copy breaks
`HarnessV1` type identity; its imports exist unchanged in the pinned versions. Drop those three
overrides when every harness adapter moves to one `@ai-sdk/harness` version together.

`scripts/dependency-patches.test.ts` (the `test:fast` lane) fails when a
`patchedDependencies` entry has no row here, a row has no entry, or a row lacks
a removal condition. A version bump therefore renames the key and forces a
re-check of this table.

| Patch | Changes | Proof | Remove when |
| --- | --- | --- | --- |
| `@ai-sdk/harness@1.0.133` | Display text renders a bare workspace mention as `<workspace>` instead of `.`. `writeSkills` writes nothing when given no skills and no manifest exists; every harness otherwise writes `.ai-sdk-harness-skills.json` into its native skill directory, which links to the Agent's skill library. | `codex-acp-tools.test.ts`; `pi-context-isolation.test.ts`, `claude-context-isolation.test.ts` | Upstream display text stops collapsing a bare workspace path to `.`, and `writeSkills` stops writing a manifest for an empty skill set (no upstream issues). |
| `@ai-sdk/harness-claude-code@1.0.143` | Accepts `settingSources` on `createClaudeCode` and forwards it to `query()`; runs every bridge `query()` with `strictMcpConfig: true`, so only Haus-passed MCP servers load; names `Glob` and `Grep` in `allowedTools`, because Claude Code's native build otherwise drops both tools from the agent and every sub-agent; strips live credentials from persisted bridge start configs; reads plan usage after a turn when `HAUS_CLAUDE_USAGE_REFRESH=1`; bounds a stored-bridge reattach to 10s; a `task_updated` failure for a task announced by `task_started` (a sub-agent) stays a raw part instead of ending the parent turn, and a sub-agent message's `error` never becomes the parent's terminal error. | `claude-context-isolation.test.ts`, `runtime-mcp-ownership.test.ts`, `claude-search-tools.test.ts`, `claude-credential-persistence.test.ts`, `claude-bridge-attach.test.ts`, `claude-subagent-failure.test.ts` | Drop each hunk as upstream ships it: `settingSources` with [vercel/ai#21714](https://github.com/vercel/ai/pull/21714) (issue #21708). The other hunks have no upstream issue; the patch goes when all eight are upstream. |
| `@ai-sdk/harness-pi@1.0.135` | Passes `noContextFiles: true` to Pi's `DefaultResourceLoader`, which otherwise loads `AGENTS.md`/`CLAUDE.md` from every cwd ancestor to `/`; passes `noSkills` plus the sandbox HOME skill directory as the only skill path, so Pi reads the Agent's linked library instead of the operator's HOME. | `pi-context-isolation.test.ts` | The adapter disables ancestor context discovery and reads skills from sandbox HOME, or exposes options for both (no upstream issue). |
| `@ai-sdk/harness-acp@1.0.71` | Adds a `local` ACP source for a host-installed executable; embeds bridge assets so the compiled Computer carries them; installs the bridge with `--ignore-workspace` and a pinned pnpm; wires live steering (`submitUserMessage`) for Grok Build and Codex; Codex token usage and host-tool correlation in the bridge. | `bridge-bootstrap.test.ts`, `codex-acp*.test.ts`, `codex-token-usage.test.ts`, `grok-token-usage.test.ts` | Upstream ships local sources, embedded bridge assets, ACP steering, and per-request Codex usage (no upstream issues). |
| `@ai-sdk/harness-grok-build@1.0.70` | Uses the `local` ACP source, so Grok Build runs the operator's installed `grok` rather than an npm-locked copy. | `bridge-bootstrap.test.ts`, opt-in `grok-build-live.test.ts` | Remove with the `harness-acp` local source, or when the adapter can target a host-installed CLI. |
| `@cursor/sdk@1.0.30` | Gives finite SDK fetches a 30s timeout while keeping caller-owned stream signals. | `apps/computer/src/cloud-agents/cursor/sdk-timeout.test.ts` | The SDK bounds its own requests (no upstream issue). |
| `@shadcn/react@0.1.0` | The message-scroller reconciler leaves reader anchors (`anchored-to-message`, `settling-jump`) alone instead of promoting them to following-bottom. The visibility snapshot reads geometry in a task after the frame paints instead of in a `requestAnimationFrame` callback, where a just-committed chat switch forced a synchronous style and layout. Any content change that is not following the bottom restores the reader's anchor row, not only one that moved the first child: an older page from the same day lands below a day divider that keeps its place, and at scroll offset 0 native anchoring does not step in, so the page pushed the reader's row down by its own height. A jump records its anchor after it scrolls, so a content change before the scroll event cannot restore the pre-jump position. | App e2e `chat-scroll.spec.ts` (including View in chat on the oldest loaded message); read tracking in `messaging.spec.ts`, `inbox-unread.spec.ts`; `scripts/perf/scroll-anchor-check.mjs` | Upstream preserves reader anchors on at-end commits, restores the anchor on every non-following content change, records a jump's anchor after scrolling, and reads visibility geometry outside the frame's rAF callbacks (no upstream issues). |
| `react-router@7.13.1` | `useNavigate` under a declarative `<Router>` returns one function for the component's life and resolves relative paths against the latest committed location, as the data router's `useNavigate` already does. Stock, it changes on every location change; every desktop tab runs under one (`IsolatedTabRouter`), so `navigate`, `setSearchParams`, and every callback built on them changed on each switch and re-rendered every transcript row in every kept chat view. | `features/shell/tab-router-stability.test.tsx` | Upstream makes declarative-mode `useNavigate` stable (still unstable in 7.18.4 and 8.4.0), or desktop tabs move to a data router. |
| `@radix-ui/react-avatar@1.2.6` | The image loader no longer resets the Avatar root's status to `idle` in its effect cleanup. Desktop tabs hide under `<Activity>`, which runs that cleanup on hide and the effect again on reveal, so every loaded avatar (HeroUI `Avatar` wraps this one) re-rendered its root, image, and fallback on each tab hide and reveal. `EntityAvatar` keys its root by `src`, so a new or removed image still starts from `idle`. | `components/ui/entity-avatar-reveal.test.tsx` | Upstream keeps a loaded status across effect teardown, or HeroUI's `Avatar` stops using Radix's loader (no upstream issue). |
| `react-aria-components@1.21.1` | Separates preview cards from tooltips in the open-overlay registry, so a nested tooltip does not dismiss its HoverCard. Paired with `react-stately`. | `bun run --filter @haus/website test:app runtime-issue-hover.spec.ts` | Upstream supports tooltips inside PreviewTrigger: [adobe/react-spectrum#10460](https://github.com/adobe/react-spectrum/issues/10460) (related #10443), still open and unfixed on upstream `main` in September 2026. |
| `react-stately@3.50.0` | The `react-stately` half of the preview-card and tooltip separation. | Same as `react-aria-components` | Same as `react-aria-components`. |
