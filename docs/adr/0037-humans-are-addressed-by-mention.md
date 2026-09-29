---
summary: An Agent asks a human by @mentioning them, inline-replying to or answering in a Thread on their message, or writing in their DM where the work lives; the Inbox's Needs you lists those unanswered exchanges with Done, desktop and web notify for them, Asks are deleted, and tasks are Agent-only.
read_when:
  - changing how an Agent asks a human for a decision, approval, or input
  - changing Inbox Needs you, its Done marker, or desktop/web notifications
  - changing human `user://` mention semantics or `chat_messages.mentioned_user_ids`
  - changing task assignees, claiming, or who can hold a task
  - considering a question record, action card, or option buttons for humans
---

# ADR 0037: Humans Are Addressed by Mention

## Status

Accepted 2026-09-29. Supersedes the retired Asks spec (`specs/asks.md`, deleted) and the `ask`
Message body. Amends [ADR 0015](0015-tasks-are-promoted-messages.md) (tasks are Agent-only),
[ADR 0025](0025-messages-carry-typed-product-bodies.md) (the `ask` body kind is retired), and
[ADR 0021](0021-cove-onboards-and-agents-share-a-manual.md) (the `asks` Manual topic is retired).
[ADR 0026](0026-automation-provenance-rides-the-agents-message.md) is unchanged: the agent inbox
stays the only agent-only lane and gains no human-facing kind.

## Context

Haus had two ways for an Agent to need a person. An **Ask** was a typed Message with a title,
summary, up to four options, an addressee, and an open/answered state; it was the only record that
put anything in the human Inbox's **Needs you**. Separately, tasks accepted human assignees and
human claims, and a claim an Agent stopped short of finishing showed up in Needs you too.

In practice Agents rarely reached for `haus ask`; they @mentioned the person, as every chat user
does. A human `user://` mention was visual-only, so those real questions never reached Needs you,
while the formal Ask carried a second vocabulary (options, settlement, answer cards, the
`ask.updated` event, an Agent-inbox Ask projection) across Server, Computer, App, iPhone, Manual,
and prompt.

Raft, which Haus tracks, has no question record. Its evidence:

- **Asking is a mention.** Raft's decision recipe (`recipes/decision/when-to-ask-human`) says to
  ask one question, offer a default only when the action is reversible, attach the staged
  artifact, and treat an irreversible act as a hard stop waiting for an explicit yes. The medium
  is an ordinary message that @mentions the owner where the work lives.
- **The Inbox is addressed activity.** Raft's Inbox (`packages/web/src/store/inboxStore.ts`)
  lists DMs and mentions addressed to the viewer, clears a row when they reply, and has a
  **Done** that records the activity sequence it covered (`throughActivitySeq`); newer activity
  in the same conversation brings the row back. A Done never hides activity it did not cover.
- **Tasks are Agent work.** Raft tasks are claimed by Agents; a human hands work to an Agent and
  is pulled back in by a mention, not by holding the task.

## Decision

**A human is addressed by mention.** An @mention of a human (`user://<userId>`), an inline reply
to a message the human wrote, a message in a Thread anchored on one, or a message in a DM the human
belongs to is how anyone — usually an Agent — asks that human. A reply to your message is
addressed to you: an inline reply or a Thread answer reaches the person it answers exactly as an
@mention does. There is no question
record, option list, action card, or answered state. The Manual and prompt teach Raft's recipe:
@mention the human with one clear question where the work lives, offer a default only if it is
reversible, attach what you prepared, and expect their reply to wake you. Cloud Agent launch
approval, when a Server wants it, is the same @mention plus an explicit yes.

**Needs you lists unanswered addressing.** A Needs you row is one Chat — a DM, Channel, or
Thread — with at least one addressing message for the viewer: every message from someone else in
their DMs, every Channel or Thread message whose content mentions them (`reason: 'mention'`), and
every Channel message that inline-replies to a message they wrote or sits in a Thread anchored on
one (`reason: 'reply'`, read through `chat_messages.reply_to_message_id` and the Thread's
`anchor_message_id`; the viewer's own messages never count). The Server records mentioned human ids on the Message
(`chat_messages.mentioned_user_ids`, written on every send path from the same parse that follows
mentioned humans into Threads), and `message.created` carries `mentionedUserIds`,
`replyToAuthorUserId`, and `threadAnchorAuthorUserId` so clients refetch Needs you only when it can change. A row clears when the viewer
replies where the addresser will see it — the same Thread, the same DM, an inline reply in the
same exchange, or a later message in the same Channel that @mentions the author (a reply that
reaches the author) — or marks it **Done**. Done stores the sequence it covered
(`chat_reads.done_sequence`) and advances the viewer's read marker in the same transaction; newer
addressing activity brings the row back. A Chat with a Needs you row is left out of
Conversations. The contract is `inbox.needsYou` / `inbox.markDone`
(`packages/haus-api/src/needs-you.ts`). Opening a Thread on an Agent's message follows its anchor
author, so the human's reply there wakes the Agent; a send into an existing Thread adds no such
follow. The migration marks every visible Chat's history Done at the cutover, so Needs you starts
empty rather than replaying old mentions and DMs.

**Push is desktop and web first.** The Electron and web App raise a platform `Notification` for a
new or newer Needs you row while the window is hidden or unfocused, after permission is granted
from a Settings toggle; clicking focuses the window and opens the conversation. On macOS closing
the last window hides it rather than quitting. APNs and Web Push (VAPID, service worker) wait for
operator-provided credentials.

**Tasks are Agent-only.** Only an Agent holds a task. `message_tasks.assignee_user_id` is dropped;
humans never claim, unclaim, or receive an assignment. Any Chat member may assign a task to an
Agent of that Chat from the App, and Agents keep `haus task assign/unassign` among themselves. An
Agent hands work to a person by @mentioning them in the task Thread. A claim an Agent stopped short
of finishing moves out of the Inbox to the Tasks page's **Stopped before finishing** group, after
**Needs your review**.

**Asks are deleted everywhere.** The `haus ask` command, `POST /api/agent/asks`, the `asks` table,
the `ask` body kind, the `ask.updated` durable event, the Agent-inbox Ask projection, `ask.listOpen`,
the answer card and marker on web and iPhone, the Manual topic, and the prompt teaching all go.
The strict task and inbox wire shapes change, so the Computer protocol moves from 24 to 25.

## Consequences

- One vocabulary: people and Agents ask each other the same way, and every real question reaches
  Needs you without the Agent choosing a special command.
- Option buttons and the answered state are gone; an answer is the reply itself, and the Agent
  judges what it means. Open Asks at cutover drop out of Needs you; their questions remain ordinary
  text Messages.
- Migration rewrites stored `ask` bodies to `text` (content already holds the question), deletes
  `ask.updated` events, drops `chat_events.ask_id` and the `asks` table, narrows the `body_kind`
  CHECK, backfills `mentioned_user_ids`, and moves human-held tasks to unassigned (`claimed_at`
  cleared, `in_progress` back to `todo`).
- Needs you adds no event: clients refetch on `message.created` and the reader-scoped `chat.read`
  that Done emits.
- Every DM message from an Agent counts until answered or Done, as in Raft; a chatty DM Agent
  keeps its row present, and Done is the release valve.
- Closed-app delivery (iPhone push, browser push while Haus is closed) remains a gap until the
  credentials exist.
