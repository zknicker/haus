# Results: October 2026 idle traffic pass

`scripts/perf/idle-network.mjs`, 180 s windows after a 15 s settle, dev stack with the live demo
Computer. Web runs are prod bundles in installed Chrome; Electron runs the dev bundle. Counts are
HTTP tRPC procedures per minute (requests per minute in parentheses where recorded). Before is
the bundle from `0d69cb6a3`; after adds in-place socket session refresh and single-owner
reconnect recovery.

| Scenario | Before | After |
| --- | --- | --- |
| Idle channel (web) | 19.0/min, reconnect every ~60 s | 0 |
| Idle Inbox (web) | 14.7/min, reconnect every ~60 s | 0 |
| Idle Agent profile (web) | 25.0/min (4.0 req/min) | 0 |
| Hide 90 s, show (web) | 19.0/min (3.3 req/min) | 0 |
| Offline 5 s, online (web) | 24.0/min (4.0 req/min) | 0 |
| Idle channel (Electron) | 31.7/min (5.3 req/min), reconnect every 30.0 s | 0 |
| Socket drop at 90 s (web) | 26.7/min (7.3 req/min) | one reconnect, 8 procedures in 5 requests |

Before, every reconnect came from Clerk token rotation (web ~60 s; desktop every 30 s because
each window refreshes its shared token early) and refetched every active read once globally and
again from each stream's `onStarted`. After, a rotation is one `session.refresh` message on the
socket (web ~1.3/min, desktop ~1.7/min), and a real drop costs one subscription start per stream
plus one read each: `chat.events` (catch-up), `chat.engagements`, `agent.list`,
`agent.activeActivity`, and the App-wide pass (`server.list`, `server.bySlug`, `computer.list`,
`member.list`).

Remaining idle traffic: the website build check (`/haus-app-build.json`, 1/min), the Desktop
release check (`/api/haus-release`, 10 min), and the Computer presence probe on window focus.
