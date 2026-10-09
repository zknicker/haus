---
name: perf-haus-app
description: Measure and fix Haus App interaction performance on web and desktop. Use when a chat switch, profile, or other App surface feels slow, laggy, janky, pops in, or not native, or for any App perf pass, regression check, or render optimization.
---

# Perf Haus App

The App's interaction latency is a render problem until a measurement says otherwise. In the
October 2026 pass the Server answered every batch in 5–17 ms and hover prefetch already had the
data warm; every win came from rendering less, rendering it once, and painting the new view in
the first frame. Start from a **baseline**, change one owner at a time, and finish with a sweep
against that baseline. A claim without a before/after number from `scripts/perf` is a guess.

Tools live in `scripts/perf/`; each script's header documents its flags. `bun run perf:web` is
the interaction harness.

## Process

1. **Stack.** Run `scripts/perf/ensure-dev-stack.sh` unsandboxed (it detaches a dedicated
   `HAUS_DEV_STACK_ID=perf` stack on port base 39540), then seed realistic history with
   `scripts/perf/seed-perf.sql`. Export `HAUS_PERF_BASE=http://localhost:39540`.
   Done when the website answers 200 and `#all`, `#product`, `#automations` each hold ~400
   messages including code blocks.
2. **Baseline.** Build the prod bundle from the unchanged tree
   (`scripts/perf/build-prod-bundle.sh .perf/dist-before`) and run
   `scripts/perf/sweep.sh before .perf/dist-before` (prod CPU×1 and CPU×4, 5 reps; `DEV=1` adds
   dev). Done when `.perf/before/summary.md` exists with zero timed-out or missing samples.
   Prod numbers are the ones that matter: dev is 2–3× inflated and distorts where time goes.
   CPU×4 amplifies main-thread cost the way a busy laptop or a cold Electron renderer does.
3. **Diagnose in parallel.** Three independent audits, each its own agent with a written brief:
   - **Data layer** — tRPC calls per interaction (harness `trpc`), Server durations, prefetch
     coverage, cache hits on revisit.
   - **Render and shell** — React commits per switch, DOM mutations, Suspense/transition
     behavior, per-row component weight, layout cost. Use `switch-trace.mjs` (trace or CPU
     profile of one switch) and `frames-to-visible.mjs`.
   - **Measurement** — verify the probes still match the DOM (selectors, kept-alive views)
     before anyone trusts a number.
   Done when each audit names its top costs with numbers and file paths.
4. **Slices.** Turn findings into slices with strict file ownership: each slice lists the files
   it owns and the files it must not touch, so parallel agents never collide. Each slice proves
   its own win with a harness run against the baseline dist.
5. **Integration gate.** `bun run lint`, `bun run typecheck`, `bun run test:app-unit`,
   `bun run test:server`, and the full App e2e lane (`bun run test:app`). Done when all pass on
   the integrated tree.
6. **Adversarial review** focused on realtime correctness: optimizations that keep views alive,
   patch caches, or skip refetches are where messages, unread counts, and live runs go stale.
   Review against the realtime pitfalls in [references/learnings.md](references/learnings.md)
   and run the [guard tests](#guard-tests). Every fix lands with a regression test proven to
   fail without the fix (temporarily revert the fix on a backup copy, watch it go red, restore).
7. **Final sweep.** Rebuild the prod bundle from the final tree, `sweep.sh after`, then
   `compare.mjs` before/after for CPU×1 and CPU×4. Run `scroll-anchor-check.mjs` if transcript
   row sizing or mounting changed. Done when every headline metric is reported with its
   before/after median and p90, regressions included.

## Metrics

All times are ms from the real `pointerdown`, read on the rAF after the region matched.

| Metric | Definition |
| --- | --- |
| url | `pushState`/`replaceState` to the target route. |
| paint | Target chat's `[data-slot=chat-surface]` is the only displayed surface (`checkVisibility`) with on-screen rows, AND exactly one displayed header `h1` names the target. |
| stable | Last childList/characterData mutation in `[data-slot=app-layout-main]`, once the pane has been quiet for 300 ms. |
| TBT / long tasks | Sum of `longtask` time over 50 ms between pointerdown and stable; LoAF blocking alongside. |
| DOM mutations | Main-pane mutation records per switch. A warm switch should be a few hundred, not thousands. |
| tRPC / chunks | Batches (with procedure names) and JS/CSS chunk loads after pointerdown. |
| regions | Per-region first-seen time and every later signature change: the pop-in order of a profile. |
| frames-to-visible | rAFs from pointerdown until paint holds. 1 = the new view landed in the first frame. |

## Idle traffic

An App nobody touches should send nothing but its justified polls. Measure with
`scripts/perf/idle-network.mjs` (scenarios `channel`, `inbox`, `profile`, `hide-show`, `ws-drop`,
`offline-online`; `--serve-dist` for the prod bundle, `--electron` for the desktop App on the dev
bundle, run under `varlock run` so Electron gets its Clerk env). It logs every HTTP tRPC procedure,
socket opens and closes, subscription starts, and in-place `session.refresh` calls, then prints
counts per minute over a 180 s window.

The allowlist on an idle channel, Inbox, or profile: the website build check (60 s), the Desktop
release check (10 min), onboarding and sign-in bounded polls, the Computer presence probe, and one
`session.refresh` per Clerk rotation over the socket (not HTTP). Anything else is a regression;
the usual causes are a reconnect (token rotation used to force one every 30–60 s) and a recovery
pass that refetches a read some event stream already recovers. A real socket drop should show one
reconnect, one subscription start per stream, and one catch-up per stream — never a second pass
of the same read ([realtime.md](../../../docs/api/realtime.md#reconnect-recovery)).

Kept-alive chat views stay in the DOM while hidden, so "a fresh node appeared" detection is wrong
for warm switches; every probe scopes to the displayed target surface. Passes: **cold** = first
visit this session, **warm** = revisit; profiles add **first** (first profile this session).

## Guard tests

Run these after any change to navigation, kept views, prefetch, or cache patching:

- App e2e (`apps/website/e2e/tests/`): `chat-navigation`, `route-performance`,
  `agent-profile-performance`, `agent-live-turn`, `chat-typing`, `messaging`, `inbox-unread`.
- Unit (`apps/website/src/`): `hooks/servers/chat-events/*`, `chat-navigation-cache`,
  `query-policy-contract`, `query-reconnect-recovery`, `agent-history-cache`,
  `desktop-tabs-store`, `kept-chat-views`, `kept-chat-view-invariants`, `use-press-navigation`.

Hidden kept views leave duplicate DOM; e2e locators scope to the visible surface
(`[data-slot="chat-surface"]:visible`), or they match a hidden chat's rows.

## Environment

- The sandbox reaps background processes after ~6–7 minutes. Launch stacks and run Chrome
  unsandboxed; give each stack its own `HAUS_DEV_STACK_ID` (also keeps the Postgres socket path
  under the Unix limit). Kill the perf stack when done.
- Installed Google Chrome (`channel: 'chrome'`). Playwright's bundled headless shell is
  SIGKILLed here.
- Prod bundles are served on the dev origin by route interception: the Server rejects Clerk
  tokens from another origin and dev auto sign-in is compiled out of prod
  (`scripts/perf/browser-session.mjs`). Chrome launches with
  `--disable-features=LocalNetworkAccessChecks`; without it the route-fulfilled page's websocket
  is blocked (`net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`) and prod runs have no realtime.
- Another agent's perf stack may already own port base 39540 (`ensure-dev-stack.sh` then reports
  "already up" for the wrong checkout). Check the listener's command line, and pick a free base
  plus your own `HAUS_DEV_STACK_ID` when it is not yours.
- Seeded messages must bump `chats.last_message_sequence` (the seed does) or the next real send
  fails with "Message not sent".
- Fan-out reads wedge the dev Server's Bun SQL pool: every request hangs with all connections
  idle. Keep App prefetch to ≤2 concurrent requests; recovery is a stack restart.
- The Computer is live: Agents may answer seeded messages mid-run and add mutations. Rerun a
  sweep that shows outliers before trusting it.

## References

- [references/learnings.md](references/learnings.md) — what worked, where it lives in code, and
  the realtime pitfalls review caught. Read before designing slices or reviewing a perf diff.
- [references/results-2026-10.md](references/results-2026-10.md) — the October 2026 before/after
  numbers and the known remaining opportunities. Read when choosing what to attack next or
  sanity-checking a new baseline.
- [references/results-2026-10-idle.md](references/results-2026-10-idle.md) — idle traffic
  before/after the in-place socket session refresh, and what idle traffic remains. Read before
  changing reconnect recovery, polling, or socket auth.
