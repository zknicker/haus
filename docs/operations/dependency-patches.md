---
summary: Every bun patch Haus applies to a dependency, why it exists, what proves it, and when to remove it.
read_when:
  - upgrading any patched dependency
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
| `@cursor/sdk@1.0.30` | Gives finite SDK fetches a 30s timeout while keeping caller-owned stream signals. | `apps/computer/src/cloud-agents/cursor/sdk-timeout.test.ts` | The SDK bounds its own requests (no upstream issue). |
| `@shadcn/react@0.1.0` | The message-scroller reconciler leaves reader anchors (`anchored-to-message`, `settling-jump`) alone instead of promoting them to following-bottom. The visibility snapshot reads geometry in a task after the frame paints instead of in a `requestAnimationFrame` callback, where a just-committed chat switch forced a synchronous style and layout. Any content change that is not following the bottom restores the reader's anchor row, not only one that moved the first child: an older page from the same day lands below a day divider that keeps its place, and at scroll offset 0 native anchoring does not step in, so the page pushed the reader's row down by its own height. A jump records its anchor after it scrolls, so a content change before the scroll event cannot restore the pre-jump position. | App e2e `chat-scroll.spec.ts` (including View in chat on the oldest loaded message); read tracking in `messaging.spec.ts`, `inbox-unread.spec.ts`; `scripts/perf/scroll-anchor-check.mjs` | Upstream preserves reader anchors on at-end commits, restores the anchor on every non-following content change, records a jump's anchor after scrolling, and reads visibility geometry outside the frame's rAF callbacks (no upstream issues). |
| `react-router@7.13.1` | `useNavigate` under a declarative `<Router>` returns one function for the component's life and resolves relative paths against the latest committed location, as the data router's `useNavigate` already does. Stock, it changes on every location change; every desktop tab runs under one (`IsolatedTabRouter`), so `navigate`, `setSearchParams`, and every callback built on them changed on each switch and re-rendered every transcript row in every kept chat view. | `features/shell/tab-router-stability.test.tsx` | Upstream makes declarative-mode `useNavigate` stable (still unstable in 7.18.4 and 8.4.0), or desktop tabs move to a data router. |
| `@radix-ui/react-avatar@1.2.6` | The image loader no longer resets the Avatar root's status to `idle` in its effect cleanup. Desktop tabs hide under `<Activity>`, which runs that cleanup on hide and the effect again on reveal, so every loaded avatar (HeroUI `Avatar` wraps this one) re-rendered its root, image, and fallback on each tab hide and reveal. `EntityAvatar` keys its root by `src`, so a new or removed image still starts from `idle`. | `components/ui/entity-avatar-reveal.test.tsx` | Upstream keeps a loaded status across effect teardown, or HeroUI's `Avatar` stops using Radix's loader (no upstream issue). |
| `react-aria@3.52.1` | `useLongPress` continues propagation on press up and press end, as it already does on press start. Stock, it stops every click inside a `PreviewTrigger` (HeroUI `HoverCard.Trigger`), so a reference chip's `target=_blank` link never reached the desktop App's document-level web-link handler and stopped opening as a browser tab. | `bun run --filter @haus/website test:app browser-tabs.spec.ts` | Upstream `useLongPress` stops swallowing plain clicks (still stopping them in 3.53.1; no upstream issue found). |
| `react-aria-components@1.21.1` | Separates preview cards from tooltips in the open-overlay registry, so a nested tooltip does not dismiss its HoverCard. Paired with `react-stately`. | `bun run --filter @haus/website test:app runtime-issue-hover.spec.ts` | Upstream supports tooltips inside PreviewTrigger: [adobe/react-spectrum#10460](https://github.com/adobe/react-spectrum/issues/10460) (related #10443), still open and unfixed on upstream `main` in September 2026. |
| `react-stately@3.50.0` | The `react-stately` half of the preview-card and tooltip separation. | Same as `react-aria-components` | Same as `react-aria-components`. |
