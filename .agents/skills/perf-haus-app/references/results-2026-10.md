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

## Agent profile open

| metric | first before | first after | cold before | cold after | warm before | warm after |
| --- | --- | --- | --- | --- | --- | --- |
| identity, CPU×1 | 64 / 70 | 64 / 97 | 64 / 80 | 39 / 43 | 67 / 84 | 38 / 41 |
| lists, CPU×1 | 382 / 386 | 96 / 154 | 79 / 94 | 63 / 77 | 67 / 84 | 50 / 61 |
| identity, CPU×4 | 293 / 312 | 289 / 398 | 286 / 317 | 158 / 169 | 289 / 328 | 152 / 163 |
| lists, CPU×4 | 645 / 663 | 386 / 551 | 323 / 361 | 214 / 226 | 290 / 328 | 193 / 200 |
| TBT, CPU×4 | 142 / 154 | 125 / 217 | 149 / 180 | 38 / 39 | 157 / 173 | 31 / 39 |

The "first" lists win (382 → 96 ms) is the nested-lazy Suspense throttle removed.

## Known remaining opportunities

- **Cold-switch TBT is flat at CPU×4** (429 → 469 ms): first render of a chat's transcript is
  still main-thread heavy. Start with a CPU profile of a cold switch (`switch-trace.mjs --cold
  --mode cpu`).
- **Settled-message markdown parse is uncached** (`features/mentions/reference-markdown.tsx`):
  every mount reparses message bodies that never change.
- **~45 ms reveal render of a kept view**: revealing an `<Activity>` subtree still re-renders it.
- **No disk-persisted query cache**: a cold start renders empty until the first fetch.
- **Packaged Electron loads the renderer remotely from haus.chat**, so desktop cold start pays
  network for the shell bundle.
- **Vibrancy and `backdrop-filter` bands over the transcript are unmeasured in real Electron**;
  the harness runs in Chrome, where compositing cost differs.
- **Per-chat subscriptions** (engagement, composition, thought) multiply with kept views.
