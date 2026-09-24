---
summary: Agent presence — one busy/idle fact per agent, projected from the turn queue and rendered wherever the agent appears.
read_when:
  - changing agent busy indicators, presence dots, or the busy-elsewhere composer hint
  - changing how turn state surfaces in the app outside the active chat
---

# Agent Presence

One agent owns one session and runs one turn at a time across all chats
([sessions](sessions.md)), so busyness is an agent-scoped fact: an agent
grinding in one chat is genuinely busy everywhere. Presence surfaces that
fact wherever the agent appears, so a send into any of its chats visibly
queues instead of silently waiting.

## Contract

Runtime projects presence from the turn queue — never stored, never
invented:

- `state: busy` when the agent has any unsettled turn (running or queued;
  queued counts so mid-drain gaps never flicker idle). Otherwise `idle`.
- `pendingTurns`: total unsettled turns — the queue-depth hint.
- `since`: when the current turn started (or was created, if queued).

Turns float on the session (ADR 0014), so presence carries no chat anchor:
there is no "which chat is it working in" fact anymore.

Served at Runtime `GET /agents/presence` for every stored agent; the server
proxies it as `agent.presence`. Without a reachable Runtime every agent
reads idle — presence is volatile runtime state and degrades to absence,
never a stale cache. Turn start/settle events invalidate the query; there
is no per-token churn.

## Surfaces

- **DM topbar**: presence dot next to the agent's name — green idle (dot
  only, no text), amber busy with a "Working…" label.
- **Sidebar rows**: each row's right edge carries its indicators; rows show
  no relative-time or "no activity yet" text.
  - Every chat kind shows an unread pill when the operator's read receipt
    (runtime `chat_reads`, reader `usr_haus`) trails the newest message
    the operator did not author. Viewing a chat marks it read only while the
    App is foregrounded and the relevant message rows are visible. The App
    sends the highest visible message sequence through `chat.markRead`; the
    runtime clamps that target to the current latest sequence at write time.
  - Agent DM rows anchor a presence dot to the agent face: green while the
    agent is idle, easing to amber while it is busy anywhere. No spinner — motion
    at rest in the sidebar reads as distraction — and the dot stays off
    the right edge so it never crowds the unread pill.
  - Channel rows never show a presence indicator: agent-global busy
    lighting every channel the agent sits in reads as noise, and the DM
    list already is the busy roster.

## Non-goals

- Encoding semantic activity inside presence. Presence remains coarse busy/idle; the focused
  [Agent activity](agent-activity.md) stream owns `Checking messages…`, `Browsing…`, and other
  current-work categories.
- A standing Agent presence rail or ticker: Agents and built-in DMs are
  one-to-one, so the DM list already is the presence roster. Live work
  appears on the Inbox, and Chat-scoped typing is chat engagement
  ([ADR 0035](../docs/adr/0035-chat-engagement-shows-as-typing.md)), not presence.
- Presence for external/observed participants.
