---
summary: Artifact Pane UI notes for chat-scoped inspectable outputs, tabs, renderers, and linked Wiki/workspace targets.
read_when:
  - changing Artifact Pane UI, inspectable output links, chat artifact tabs, or linked Wiki/workspace renderers
---

# Artifact Pane UI Notes

## Current Direction

The artifact pane should feel like a compact assistant workspace attached to the chat, not a full browser. It opens when the user clicks a linked output such as a Wiki page, Markdown file, HTML preview, image, or generated asset.

On desktop, linked outputs open as workspace tabs instead of this pane; see
`docs/features/browser-tabs.md`. These notes cover the website pane.

## Chrome

- Tabs sit in the top row.
- The selected tab uses a soft rounded pill.
- Inactive tabs stay low-contrast.
- One button hides the pane; hiding never clears tabs. Individual tab close
  buttons remove tabs.
- A plus icon can suggest that more artifacts arrive from chat links, but it should not look like a primary action.
- The chat toolbar carries a sidebar-style toggle that shows or hides the
  pane; showing it with no tabs renders an empty state with the + menu as the
  entry point.

## Behaviors

- Clicking the same link focuses the existing tab.
- Clicking a new link opens a new tab and selects it.
- The workspace is one tab, not a browser tab plus per-file tabs: it renders
  the open file with the workspace tree on the right (Codex-style). Opening a
  workspace file — from a link, the tree, or `pane_open` — morphs that tab in
  place, and the tab title is the open file's name ("Workspace" only when no
  file is selected).
- Tabs are scoped to the active chat.
- The tab set is a Runtime-owned per-chat record (revision-guarded), so tabs
  survive app reloads and reappear when a chat is reopened. Switching chats
  switches records; nothing carries across chats.
- Agent UI intents (the `pane_open` agent tool) can open or focus a tab
  through the same record (see `specs/agent-app-control.md`); the app applies
  changes live via the `pane.updated` event. Like link clicks, a repeated
  target focuses the existing tab.
- The pane opens manually or by agent intent. No auto-open heuristics beyond
  that.

## Renderers

| Input | Renderer |
| --- | --- |
| `.md` / `text/markdown` | Markdown preview |
| `.html` / `text/html` | Sandboxed preview |
| `.png`, `.jpg`, `.webp`, `.gif` | Image preview |
| Unknown type | Unsupported state |

## Visual Targets

The pane should borrow the useful parts of Codex, Claude, and OpenCode:

- tabbed artifact switching
- quiet top chrome
- clear file title and source path
- enough width for reading Markdown comfortably
- no browser controls until we actually support browser behavior

## Open Questions

- Should every tab eventually get its own close affordance?
- Should images use zoom/pan controls in the first version?
- Should HTML previews support an address/source bar, or just a title row?
- Should workspace files and Wiki pages share one link scheme, or stay visibly distinct?

## Sample Agent Reply

I wrote the output here:

- [Panel Brief](haus://wiki/Demos/Panel%20Brief.md)
- [Preview HTML](haus://workspace/out/preview.html)
- [Generated Chart](haus://workspace/out/chart.png)

The user should be able to click the thing itself and inspect it in the artifact pane.
