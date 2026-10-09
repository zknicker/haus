# Results: October 2026 interaction pass

Prod bundle, installed Chrome, seeded stack (~400 messages per chat), 5 reps before / 6 after.
Median / p90 ms from pointerdown. Channel rows pool `#all`, `#product`, `#automations` and the
Tiny and Blippy DMs. Use these as a sanity range for a new baseline on similar hardware, not as
targets.

## Channel / DM switch

| metric | cold before | cold after | warm before | warm after |
| --- | --- | --- | --- | --- |
| paint, CPU×1 | 184 / 218 | 111 / 140 | 180 / 200 | 59 / 76 |
| stable, CPU×1 | 271 / 385 | 171 / 274 | 211 / 237 | 92 / 120 |
| TBT, CPU×1 | 55 / 65 | 48 / 69 | 45 / 53 | 0 / 7 |
| paint, CPU×4 | 893 / 1053 | 538 / 586 | 848 / 973 | 282 / 317 |
| stable, CPU×4 | 1134 / 1766 | 803 / 1098 | 965 / 1105 | 435 / 484 |
| TBT, CPU×4 | 429 / 790 | 469 / 694 | 364 / 408 | 223 / 250 |
| DOM mutations | 2535 | 235 | 2535 | 205 |

Frames-to-visible after the pass: warm switches land in frame 1; cold in frame 2.

## Transcript windowing (follow-up pass)

Same stack and seed (51 rows per first page), prod, channels only, 5 reps. Before is the tree at
31d2ca892 (kept views effect-alive). Median / p90 ms.

| metric | cold before | cold after | warm before | warm after |
| --- | --- | --- | --- | --- |
| paint, CPU×1 | 112 / 154 | 48 / 61 | 50 / 53 | 31 / 34 |
| stable, CPU×1 | 154 / 271 | 81 / 174 | – | – |
| TBT, CPU×1 | 55 / 75 | 0 / 11 | 0 / 0 | 0 / 0 |
| paint, CPU×4 | 725 / 860 | 259 / 344 | 283 / 313 | 155 / 180 |
| TBT, CPU×4 | 658 / 785 | 190 / 481 | 203 / 234 | 89 / 110 |
| DOM mutations | 134 | 45 | 0 | 0 |

Real Electron (`switch.mjs`, prod, 4 reps CPU×1, 3 reps CPU×4), visible / presented medians:
cold 102 / 130 → 40 / 72, warm 42 / 64 → 24 / 48; CPU×4 cold 610 / 694 → 280 / 352, warm
219 / 259 → 168 / 205. Rendered rows per opened chat 51 → 15 at a 900 px window.

## Agent profile open

| metric | first before | first after | cold before | cold after | warm before | warm after |
| --- | --- | --- | --- | --- | --- | --- |
| identity, CPU×1 | 64 / 70 | 64 / 97 | 64 / 80 | 39 / 43 | 67 / 84 | 38 / 41 |
| lists, CPU×1 | 382 / 386 | 96 / 154 | 79 / 94 | 63 / 77 | 67 / 84 | 50 / 61 |
| identity, CPU×4 | 293 / 312 | 289 / 398 | 286 / 317 | 158 / 169 | 289 / 328 | 152 / 163 |
| lists, CPU×4 | 645 / 663 | 386 / 551 | 323 / 361 | 214 / 226 | 290 / 328 | 193 / 200 |
| TBT, CPU×4 | 142 / 154 | 125 / 217 | 149 / 180 | 38 / 39 | 157 / 173 | 31 / 39 |

The "first" lists win (382 → 96 ms) is the nested-lazy Suspense throttle removed.

## Render storms (component renders, real Electron)

`scripts/perf/render-audit.mjs`, prod render-count bundle, five kept chat views (~400 messages
each), #all shown. Before is 0d69cb6a3. Interactions are medians of 5 reps (window 2.5 s after
the action); idle and the Agent turn (Tiny DM, one short reply) are 60 s, two runs each.
Targets were idle ≤ 50/min, a message in another chat ≤ 500, in the open chat ≤ 1,000.

| scenario | before | after |
| --- | --- | --- |
| idle 60 s on a channel | 4,230 / 3,164 | 130 / 272 |
| message in the open chat | 10,174 | 2,820 |
| message in another chat | 9,136 | 2,881 |
| Agent turn 60 s | 22,458 / 24,351 | 4,406 / 4,420 |
| warm switch (there + back) | 4,088 | 2,225 |
| desktop tab switch (there + back) | 3,843 | 2,195 |
| open Agent profile | 2,037 | 1,549 |

Single-run outliers before reached 22–30k per message when an Agent woke mid-window. What
remains is in learnings.md ("Render storms").

Second pass (sidebar rows, presence dots, tab reveal), same harness on a fresh seeded stack,
before (902ef1b6e) and after measured back to back. Medians of 5; idle and the Agent turn are
two 60 s runs.

| scenario | before | after | target |
| --- | --- | --- | --- |
| idle 60 s on a channel | 24 / 13,055 | 12 / 6 | ≤ 50 |
| message in the open chat | 1,353 | 590 | ≤ 1,000 |
| message in another chat | 1,446 | 540 | ≤ 500 |
| Agent turn 60 s | 3,123 / 6,375 | 1,508 / 1,517 | – |
| warm switch (there + back) | 1,855 | 1,397 | – |
| desktop tab switch (there + back) | 2,940 | 2,267 | – |
| open Agent profile | 1,652 | 1,384 | – |

A message in another chat is 308–321 when no Agent answers it; the median rep caught an Agent
waking (its presence dots, typing strip, and activity), which is work the user sees. The idle
13,055 was a seeded Cloud Agent thread updating mid-run. Switches still pay for React Aria's
sidebar Trees on selection change and the kept-view topbar and presence swap.

## Known remaining opportunities

- **Cold-switch TBT is flat at CPU×4** (429 → 469 ms): first render of a chat's transcript is
  still main-thread heavy. Start with a CPU profile of a cold switch (`switch-trace.mjs --cold
  --mode cpu`).
- **Settled-message markdown parse is uncached** (`features/mentions/reference-markdown.tsx`):
  every mount reparses message bodies that never change.
- ~~45 ms reveal render of a kept view~~: done; kept views are effect-alive and CSS-hidden (see
  learnings, "`<Activity>` vs effect-alive CSS hiding").
- **No disk-persisted query cache**: a cold start renders empty until the first fetch.
- **Packaged Electron loads the renderer remotely from haus.chat**, so desktop cold start pays
  network for the shell bundle.
- **Vibrancy and `backdrop-filter` bands over the transcript are unmeasured in real Electron**;
  the harness runs in Chrome, where compositing cost differs.
- ~~Per-chat subscriptions multiply with kept views~~: engagement and thought streams pause while a
  kept view is hidden.
