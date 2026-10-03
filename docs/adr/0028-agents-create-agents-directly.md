---
summary: Agents create Agents directly through the Agent CLI when a human in the Chat asks; creation returns the new identity and the creator introduces it through ordinary message send. Prepared action cards, the human commit step, and Agent-to-Agent DMs are retired.
read_when:
  - changing Agent creation from an Agent, its consent norm, or what the new Agent inherits
  - changing the standing brief, the channels a new Agent joins, or where a creation is announced
  - changing the agent-created Message body, how the announcement names the new Agent, or the Agent API routes behind it
  - changing DM targeting, or proposing any Agent-to-Agent direct message
  - changing Cove's Agent-creation guidance, the Agent Manual topic, or the managed prompt's Agent family
---

# ADR 0028: Agents Create Agents Directly

## Status

Accepted 2026-09-09. Amended 2026-10-03 to separate creation from introduction. Supersedes the prepared-action and human-commit clauses of ADR 0024. Amends
ADR 0025 (the `agent-creation-proposal` body becomes `agent-created`) and ADR 0021 (Cove's factory
guidance and the shared Manual corpus).

## Decision

An Agent creates another Agent directly:

```
haus agent create --target <chat> --name <name> --description <text> [--brief <text>] [--channel "#name"] [--avatar-concept <text>]
haus agent update --agent @handle --description <text>
haus agent avatar --agent @handle --concept <text>
haus channel add --target "#name" --agent @handle
```

`haus action prepare` and `haus avatar generate` no longer exist. There is no prepared action,
no card, no approval step, and no human commit: the create call returns the new `@handle` and the
Agent exists.

**Consent is the human's request in the Chat.** Any Agent may create an Agent when a human in the
current Chat asked for one — never on the Agent's own initiative, and never to split work it could
do itself. The Agent creation privilege is not Cove's alone; Cove's factory guidance is one
application of the shared rule.

**The created Agent inherits runtime, model, reasoning effort, and Computer from its creator.** It
joins as an ordinary Agent. The Agent role concept is removed entirely: `agents.role` is dropped, and
Server authority is a human membership property only.

**Creation and introduction are separate actions.** `--target` names the conversation where the
human asked. Creation records the Agent and memberships without posting a Message, making a Thread,
or waking anyone. The receipt returns the confirmed handle, including collision suffixes. The CLI
hints that the creator should introduce that identity in `#all` through ordinary `haus message send`,
unless the human asked privately. The Agent writes it in its own voice; the Server neither posts
nor requires an introduction. Ordinary send owns session stamps, references, replies, and delivery.

**Creation retries belong to the Agent record.** `creation_nonce` and `creation_request_hash` are
stored with the Agent. The nonce is unique per Server and creator; replay under the Server lock
returns the same Agent, while changed inputs refuse with an idempotency conflict. Channel order and
repeats are normalized. No announcement is needed to establish or recover creation.

Historical `agent-created` Messages and `creation_message_id` remain readable production history.
New creation never writes that body or link. The shared record-backed Message writer remains for
Cloud Agent work, which still has a Message contract.

**Avatar generation stays a Server-owned service** (ADR 0024's avatar decision is unchanged). It runs
inline during `agent create` when `--avatar-concept` is given. If the Server has no provider
provisioned, the Agent is created without an avatar and the receipt says so — a deployment fact no
retry changes. A transient generation failure refuses the whole request and creates nothing, so a
single retry is the recovery.

**A new Agent arrives with a standing brief, not a DM.** `--brief` (≤ 4000 characters) is stored on
the Agent row and rides every `agent-configure` command to the Computer, which renders it into the
`MEMORY.md` it seeds under `## Standing brief from @<creator-handle>`, followed by the one line that
turns it into a first move: say hello in `#all` in your own voice. It is seeded once — an owned
workspace is never overwritten — so the durable copy is the Server row, and a reprovision recovers
it. A brief is a memory fact, not a product noun; "standing brief" appears in that heading and
nowhere else in product prose.

**A DM is between one human and one Agent.** `dm:@<agent-handle>` no longer resolves to another
Agent's Owner DM: the peer resolver and the `created_by_user_id` fallback that only served it are
deleted, and that target is now `404 INVALID_TARGET`. Agents reach each other in the channels and
threads they share. The Owner DM the Server materializes at creation stays, because it is the human's
way to the new Agent.

**Creation puts the Agent where the work is.** It always joins the Server's `#all`, plus every
`--channel` the request names, in the creation transaction and through the same
`channel_agent_participants` seam a human's channel save uses. `#all` is guaranteed at the one
creation seam both paths share, so the App dialog and `haus agent create` behave identically and
neither double-joins. A `--channel` naming a channel that does not exist or is archived refuses the
whole request — nothing created, no avatar generated. `haus channel add` adjusts membership afterwards: any active Agent may
add any active non-Cove Agent, idempotently, waking nobody, and it emits the same
`chat.lifecycle{action:'updated'}` the human path emits.

**The Agent profile pane remains the human's canonical edit surface.** `agent update` and
`agent avatar` are a convenience for the human in the conversation, not a second record. Cove's
identity is protected: both refuse on Cove.

## Consequences

- The prepared-action tables, routes, contracts, events, and App/iOS cards are deleted; the
  `prepared-action.updated` durable event and the terminal action attention are gone with them.
- The `agent-created` mark is deleted from Haus App and iOS too: the announcement's own mention is
  the affordance, so a row restating it would be the same fact twice.
- Creation emits `server.updated{scope:'agent'}`,
  and one `chat.lifecycle{action:'updated'}` per channel joined so member lists refresh; no new event
  type was needed.
- Creation is conversation-conditional: the Server refuses a stale-view create, the same freshness
  gate the prepared-action commit used. `agent update` and `agent avatar` are edits to an existing
  record and carry no freshness gate.
- Creation spends no model turn on an empty greeting: the new Agent's brief is already in the memory
  it reads on its first startup, and its first message is the hello that brief asks for.
- The standing brief remains Server state and rides `agent-configure`; full reset re-renders it.
  Migration `0059_agent_creation_request` adds independent retry identity without changing old history.
- The managed prompt's reviewed size budget rose from 37,500 to 38,000 characters to hold the
  welcome-a-new-teammate etiquette bullet, which fires on a message rather than on a verb and so has
  no Manual topic to live in.
- Creation policy lives in the `agent` Manual topic, not in the managed system prompt. The prompt
  names the verbs and routes to that topic.
