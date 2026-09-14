---
summary: Haus App ownership, hosted data flow, cache boundaries, and Electron shell responsibilities.
read_when:
  - changing App data flow, routing, caching, settings, or Electron behavior
  - deciding whether behavior belongs in App or Server
---

# Haus App

Haus App is the React client in `apps/website`. It talks to Haus Server through the hosted tRPC
client and renders Server-owned collaboration state. The same App runs in a browser or in Electron;
Electron owns desktop installation, window behavior (the menu bar and its shortcuts, window-state
persistence, focus dimming, history swipes, and the Dock unread badge), and desktop updates, not a
local backend.

The persistent sidebar footer projects Electron's update state into the App: an available release
is clickable to begin its download, active downloads show determinate progress, and a downloaded
release becomes a restart action. Electron remains the state owner and replays its latest actionable
or in-flight status to every window; the App subscribes through the desktop bridge.

The App owns presentation state, local preferences, React Query cache state, optimistic compose
rows, routing, and transient UI. Server owns durable Chats, Messages, Tasks, members, Agents,
attachments, and Computer reports. Optimistic rows remain App-local until Server acknowledges the
mutation.

The App shell suppresses the browser or WebView's native context menu on non-actionable product
surfaces so browser commands such as Reload and Inspect do not leak into Haus. Product context
menus take precedence. Editable controls and selected text retain native browser edit commands;
the Electron shell replaces those commands with Haus's desktop edit menu.

Computer availability is displayed from Server-reported state. The App does not probe local
processes, construct execution routing ids, connect to Computer, or keep a second canonical
timeline. A Computer being offline degrades execution controls without hiding already-synced Server
data.

## Desktop Bridge Is A Cross-Version Contract

A packaged shell never bundles a renderer: it loads the App the hosted Server is
serving. The two therefore ship on independent channels — the shell through the
S3 release feed, the App through a Server deploy — and any installed shell may be
paired with an older or newer App. The `window` global the preload injects is a
production wire contract between them, not an internal name.

The supported desktop shell exposes `window.hausDesktop`, and the hosted App
reads that single contract. Publish and install the matching desktop release
before promoting a Server that changes this bridge. Older shells must be
replaced; they are not supported against the renamed contract.

Both ends are covered by `apps/website/electron/preload.test.cjs` and
`apps/website/src/lib/desktop-bridge.test.ts`.

Each website build embeds a unique build id and emits the same id in `haus-app-build.json`.
The App polls this same-origin file independently of the published release feed, so it detects
the website actually deployed, including rollbacks. Haus Server serves the marker and every
`index.html` response with `Cache-Control: no-store`. Reload keeps the current URL and loads the
deployed renderer; an existing window continues running its loaded code until the user reloads.

## Session Refresh And Reconnect

The App keeps one tRPC client and React provider mounted for the signed-in human. Clerk token
rotation reconnects only that client's websocket; the reconnect reads fresh connection parameters
and resumes pending subscriptions. Credential rotation must not replace the tRPC provider, remount
the Server shell, clear composer drafts, or discard other local presentation state.

A genuine human identity change renders through a newly keyed hosted QueryClient and provider so
the next identity cannot observe the previous identity's cache or local presentation state. After a
websocket reconnect, active durable queries reconcile from Server state while their cached snapshot
continues rendering.

React ownership and event rules live in [React Conventions](react.md).
