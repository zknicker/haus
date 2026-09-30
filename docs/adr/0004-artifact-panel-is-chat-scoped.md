---
summary: Decision to keep the Artifact Panel scoped to the active chat.
read_when:
  - changing Artifact Panel scope, linked output opening, or chat-side inspection surfaces
---

# Artifact Panel Is Chat-Scoped

The Artifact Panel opens beside Haus chat and shows panes for the active
chat's Artifact Panel targets. Targets include chat Artifacts and linked
inspectable outputs such as Wiki pages or workspace files. The panel can also
open chat-scoped source browsers for Memory and the agent workspace without
navigating away from the chat.

We chose a chat-scoped panel instead of a global artifact workspace because the
open action is grounded in the conversation that produced or referenced the
target. A global artifact library can be added later as a separate browsing
surface without changing the panel's primary scope.

Desktop workspace tabs are that separate surface on desktop: there an artifact opens as its own
workspace tab, scoped to the Server rather than the chat, and the panel does not appear. The website
keeps the chat-scoped panel. See `docs/features/browser-tabs.md`.
