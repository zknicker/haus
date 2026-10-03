---
summary: Current persistence ownership across Server PostgreSQL, Computer state, and App cache.
read_when:
  - changing database schema, persistence ownership, or durable product records
  - deciding whether state belongs in Server, Computer, or App
---

# Data model

Haus Server's PostgreSQL database is the canonical store for collaboration and authorization.
The Drizzle schema lives in `apps/server/src/postgres/schema.ts`; checked-in migrations live in
`apps/server/drizzle/postgres/`. Fresh databases are created by
`apps/server/src/postgres/bootstrap.ts`, while existing production databases advance only through
the migration command.

| Store | Owner | Contents |
| --- | --- | --- |
| Server PostgreSQL | Haus Server | Users, Servers, membership, Chats, Messages, message reactions, threads, Tasks, Reminders, Agents, desired execution configuration, Computer attachments and reports, MCP connections, Triggers and their fire history, automation provenance on Agent messages, and authorization. |
| Computer data root | Haus Computer | Attachment credentials, delivery queues, logs, Agent homes, skills, workspaces, runtime state, cached provider-usage snapshots, and effective execution evidence. |
| Browser/App storage | Haus App | Cache, local preferences, desktop presentation state, and optimistic rows. |

An active Agent's unmaterialized pairwise DM is App-local selection state, not a
Chat record. PostgreSQL creates the canonical human membership-stint↔Agent Chat
only in the same transaction as the first durable write. Materialized history
stays id-bound after retirement while the implicit roster entry disappears.

Server stores bounded turn summaries and Computer-reported effective runtime, model, and reasoning
effort needed for truthful product presentation.
`computer_system_events` is the durable operational log for each Computer. Server records observed
connections and disconnections; Computer reports a bounded, idempotent outbox of state-changing
management commands. Server does not ingest provider credentials, full prompts, execution
transcripts, arbitrary tool traces, or Agent workspace contents. Computer state is not a substitute
for canonical Chat history, and App cache is never authoritative.

The Agent row stores Computer's last applied Haus Agent version, application timestamp, and
pending/current/failed status. These fields are a product-facing release receipt, not the underlying
instruction or bootstrap fingerprints. Server compares the receipt with its release-owned current
version when projecting an Agent. Computer remains authoritative for whether a successful turn has
actually applied that version.

Semantic Agent activity is durable Server metadata. Detailed execution journals remain
Computer-local and are read only through an authorized live relay.

`chat_messages.body_kind` is the Message body discriminator (ADR 0025). It defaults to `text`, and
`cloud-agent-work` is the current typed kind and `agent-created` remains for historical reads; optional feature columns never define a Message's
type. One Server Message reader projects the stored kind and its record together, and fails the
mapping rather than downgrading a typed Message to text.

`message_reactions` is the durable relation behind a Message's grouped emoji reactions. Each row
names one Server, Message, emoji, and exactly one actor: an Agent or a Server membership row.
The Message reader groups rows by emoji and returns stable actor ids plus their observed handles.
Adding or removing a row appends `message.reaction.updated` to the same per-Server `chat_events`
cursor, while Chat access and archive checks remain the write boundary. Deleting a Message's Chat
aggregate cascades its reactions.

`chat_messages.mentioned_user_ids` is the set of human user ids a Message's content mentions
through `user://` references, written on every send path from the same parse that follows
mentioned humans into Threads and GIN-indexed. With the inline parent's and Thread anchor's
authors and DM membership, it is what decides a message notification
([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)). `chat_reads.sequence` is the viewer's
read marker, the only Inbox state: a Chat is unread while it holds someone else's message above it.
There is no Ask table and no Done marker.

`message_tasks.assignee_agent_id` is the only task assignee; tasks are Agent work and carry no
human assignee.

`cloud_agent_work` is the Server record behind a `cloud-agent-work` body: one row per Message
(`(server_id, message_id)` is unique) carrying the delegating Agent, the Computer that holds the
provider access, the provider and its agent id and URL, the title, repository, and starting ref,
the lifecycle status with its started and terminal timestamps, the bounded one-line `activity`, and
the cancel request with exactly one of the requesting human or Agent. `cloud_agent_runs` holds one
row per provider Run — normalized and raw status, timestamps, the model it requested (`model_id`,
`default` for Auto or `null` when none was sent, with the `model_params` sent and any
`model_dropped_params`; `model_fallback_from` when the Server's saved model was unlisted and the
Run fell back to Auto, never beside a catalog model), bounded
summary, error code, reported
branches with their optional pull-request URLs and the Computer's optional dated GitHub snapshot of
each (number, state, changed files, additions, deletions), optional token and cost usage, and the
newest applied observation timestamp that makes a stale report a no-op. A branch report merges by
that snapshot's own timestamp, so a read that failed never erases a snapshot the Run already had.
CHECKs keep each terminal status in agreement with its terminal timestamp, and composite foreign
keys keep the work, its Message, its Chat, its Agent, its Computer, and its canceller in one Server
tenant. Lifecycle changes append `cloud-agent-work.updated` to the `chat_events` cursor log through
the nullable `cloud_agent_work_id` column. Provider prompts, credentials, transcripts, and
workspace files never reach Server. A settled Run creates one `agent_inbox` row keyed by that Run id for the delegating
Agent, in the same transaction that settles it. `servers.cloud_agent_model_id` is the Server's
human-chosen Cloud Agent model (`null` is Auto) and `servers.cloud_agent_model_params` its
effort and fast choices; the Cursor catalog it is checked against lives in
each Computer's `reported_inventory`.

An Agent created by another Agent (ADR 0028) records `created_by_agent_id`,
`creation_nonce`, and `creation_request_hash` on `agents`. The nonce is unique per
(Server, creating Agent); the hash covers the request with channel order and repeats normalized.
Retries find that Agent under the Server lock, independently of later conversation.
Creation writes no Message or Thread. The nullable `creation_message_id` and its foreign key remain
only for existing production announcements and rollback; new creations leave it null.
Deleting a historical announcement clears that link without deleting the Agent.
`agents` carries no `role`; Server authority is a human membership property.

`triggers` is the Agent-owned inbound wake: owner Agent, `kind` (checked against `webhook`),
anchor Chat and nullable anchor message, `created_by_user_id` for a Trigger a human created from
the App and null for one an Agent created (it clears if that human is removed), a nullable
`deleted_at` removal tombstone, title, optional instruction, the SHA-256 hash of its bearer secret,
armed or disabled status, and fire counters. A tombstoned row is disabled and remains only long
enough to keep recent fire history reachable.
`anchor_message_id` is the message someone asked on and is null for a human-created Trigger,
which anchors on that human's DM with the owning Agent and writes no Chat message; the Chat is
then the whole access check. Haus never stores a Trigger secret in plaintext.
`trigger_fires` stores one row per accepted inbound request with the verbatim payload bounded at
65,536 bytes, its byte count, and its optional content type and idempotency key. A Trigger delete
first tombstones the parent so the rows remain available to Agent-wide history; the hourly
retention sweep expires fires on `received_at` and later removes the tombstone. Physical parent
deletion cascades to any remaining fires. Server bounds and relays those payloads and never
interprets them.
A fire wakes the owning Agent through the ordinary `agent_inbox` ledger; no
Trigger-specific attention table exists.

A fire writes no Chat message (ADR 0026). `message_causes` is the provenance record instead: one
row per message an Agent sent because a fire woke it, naming the kind (`trigger_fire` or
`reminder_fire`), the automation and fire that caused it, and an `attribution` checked against
`explicit` (the Agent sent `--cause`) or `inferred` (the Server derived it from a sole-fire run,
per `specs/inbox.md`). Alongside those it snapshots what the mark says — title, summary, fire time,
owning Agent, and anchor Chat — so the mark outlives the automation: the automation and fire ids
carry no foreign key, and deleting a Trigger or reminder archives the mark instead of removing it.
A message carries at most one cause, and only deleting the message deletes it. The Server writes the row in the same transaction as the message and
only after validating that the fire belongs to an automation the sending Agent owns.

Every `chat_messages` row is authored by a human or an Agent and readable by every human who can
read its Chat (ADR 0026). `system_author` is gone — column, CHECK clause, and wire enum — after the
migrations deleted the `reminder`, `trigger`, `task`, and `session` rows written with it, dropped
the `schedule_receipt_message_id` column on `reminders` and the `receipt_message_id` columns on
`reminder_fires`, `trigger_fires`, and `reminder_agent_attention`, and nulled the Trigger anchors
that pointed at deleted creation receipts. An agent-only delivery is an `agent_inbox` row keyed by a
non-message identity — a fire id, a task assignment identity — not a message with a
filter over it; `agent_inbox` is the renamed `agent_pending_work` and `agent_delivery` keeps its own
name for per-Agent run state.

An Agent message carries `session_generation`, the generation of the run that sent it (null for a
human message), and `agent_session_rotations` records each rotation with its generation, timestamp,
and reason. Together they replace the session receipt message: the App derives the per-Chat session
mark from the stamps and reads the rotation record only for the hover card (`specs/sessions.md`).

The Server application PostgreSQL role receives normal table/sequence privileges; migration and
backup roles remain separate operational credentials.
