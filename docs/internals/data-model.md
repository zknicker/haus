---
summary: Current persistence ownership across Server PostgreSQL, Computer state, and App cache.
read_when:
  - changing database schema, persistence ownership, or durable product records
  - deciding whether state belongs in Server, Computer, or App
  - changing the Task tables, the key ledger, Task follows, or the 0124–0128 Task and Thread migrations
---

# Data model

Haus Server's PostgreSQL database is the canonical store for collaboration and authorization.
The Drizzle schema lives in `apps/server/src/postgres/schema.ts`; checked-in migrations live in
`apps/server/drizzle/postgres/`. Fresh databases are created by
`apps/server/src/postgres/bootstrap.ts`, while existing production databases advance only through
the migration command.

| Store | Owner | Contents |
| --- | --- | --- |
| Server PostgreSQL | Haus Server | Users, Servers, membership, Chats, Messages, message reactions, Tasks and their key ledger, follows, and attached pull requests, Claims, task labels, Reminders, Agents, desired execution configuration, Computer attachments and reports, MCP connections, image generations (`image_generations`), their Message links (`image_generation_links`) and per-provider keys (`image_generation_keys`), GitHub installations, Triggers and their fire history, automation provenance on Agent messages, and authorization. |
| Computer data root | Haus Computer | Attachment credentials, delivery queues, logs, Agent homes, skills, workspaces, runtime state, cached provider-usage snapshots, and effective execution evidence. |
| Browser/App storage | Haus App | Cache, local preferences, desktop presentation state, and optimistic rows. |

Every stored instant is UTC; each viewer formats it in their own zone. `users.timezone` is the
human's IANA zone preference: the App's `member.syncIdentity` fills it from the device when it is
null, and `member.setTimezone` changes it. Agents read it through people lookup to resolve calendar
reminders, whose own `reminders.timezone` is fixed at scheduling
([ADR 0040](../adr/0040-agents-resolve-human-timezones-explicitly.md)).

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

Semantic Agent activity is durable Server metadata. Detailed execution journals are synced by the
Computer into `agent_execution_journals` (one row per run, with its outline) and
`agent_execution_journal_records` (one redacted record per sequence), kept 30 days after the run
started ([ADR 0048](../adr/0048-execution-journals-sync-to-the-server.md)).

`chat_messages.body_kind` is the Message body discriminator (ADR 0025). It is `text` (the default),
`agent-created` (kept for historical reads), `worker-report`, or `worker-follow-up`; optional feature columns never define a
Message's type. One Server Message reader projects the stored kind and its record together, and fails the
mapping rather than downgrading a typed Message to text.

`message_reactions` is the durable relation behind a Message's grouped emoji reactions. Each row
names one Server, Message, emoji, and exactly one actor: an Agent or a Server membership row.
The Message reader groups rows by emoji and returns stable actor ids plus their observed handles.
Adding or removing a row publishes the `message.reaction.updated` realtime topic after commit
(id-only; see [Realtime events](../../specs/realtime-events.md)), while Chat access and archive
checks remain the write boundary. Deleting a Message's Chat
aggregate cascades its reactions.

`chat_messages.mentioned_user_ids` is the set of human user ids a Message's content mentions
through `user://` references, written on every send path from the same parse that follows
mentioned humans into Tasks as followers and GIN-indexed. With the inline parent's author and DM
membership, it is what decides a message notification
([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)). `chat_reads.sequence` is the viewer's
read marker, the only Inbox state: a Chat is unread while it holds someone else's message above it.
There is no Ask table and no Done marker.

`agent_chat_reads` is an Agent's durable read position per Chat (Raft's receiver read cursor):
`sequence` is the Chat sequence it has read through, keyed by (Server, Agent, Chat) and not by
session generation, so it outlives rotation. `agent_inbox_cursors` stays the per-session seen
ledger. Unread for an Agent is someone else's message above the position. The position only moves
forward (`greatest`):

- Membership opens it at the Chat's last message — channel join, DM creation, a new or restored
  Task follow — except that a message which caused the membership (a mention following the Agent
  into a Task) stays unread. Migration `0062_agent_chat_reads` backfilled current memberships the
  same way. A missing row reads as 0.
- `message read --unread` moves it through the returned page; a plain history page moves it only
  when no message sits between the position and the page start.
- The Agent's own send or claim create moves it like exact visibility below: its own messages count
  as read, and it stops below the first message from someone else the Agent was never shown.
- Exact visibility (`recordExactMessagesServed`) moves it to the highest S where every message in
  (position, S] by someone else is exactly visible to the Agent in its current session.

Raft only advances through messages older than 3s because a lower sequence may still be
committing. Haus omits that settle window: a Chat sequence is allocated by `update chats set
last_message_sequence = last_message_sequence + 1` inside the sending transaction, so the Chat row
lock serializes allocation through commit and no reader can see N+1 before N.

`message_claims.assignee_agent_id` is the only claim assignee; claims are Agent work and carry no
human assignee. A claim is only the lock on its message, so it has no priority or labels: those
live on `tasks`. `task_labels` is the Server's label catalog and `task_label_assignments` links it
to Tasks. Members create catalog entries; Owners and Admins rename, recolor, or delete them.

A Task ([specs/tasks.md](../../specs/tasks.md)) is a `tasks` row plus its own `chats` row of kind
`task`; `tasks.chat_id` links them, one Chat per Task, and is null only for legacy history Tasks.
`tasks.project_id` is the Task's Project, and the Task Chat's `parent_chat_id` always equals it
(`tasks_chat_project_fk`); deleting the Project deletes its Tasks. `tasks.origin_chat_id` and
`origin_message_id` name the Message the Task started from, in any Channel or a DM, both or
neither: null for a filed Task, and set null when that Message goes. `agents.home_project_id` is
each Agent's home Project, the Haus project for a generalist.
`tasks.state` is `todo`, `open`, `done`, or `canceled`. `task_keys` is the key ledger, each entry
with its own `next_number`; `tasks.key_id` names a Task's entry and `projects.task_key_id` a
Project's (one per channel, unique). Migration 0130 made every live or archived channel a Project,
renamed `#all` to `haus`, and gave channels that shared a key new entries by the key rule
([specs/projects.md](../../specs/projects.md#migration-from-channels)). `task_pull_requests` attaches pull requests by repository and number, and
`workers.task_id` attaches Workers. Followers ride `thread_follows` (people) and
`agent_thread_follows` (Agents) with `thread_chat_kind = 'task'`. Migrations 0124–0128 made Tasks
places: 0124 added the ledger, states, and Task Chats (every board became a ledger entry); 0125
let reminders anchor on a Task; 0126 turned every Thread into inline replies on its anchor and
marked each affected Channel read for everyone who can read it, keeping audit tables
(`thread_migration_map`, `thread_migration_rows`) for `apps/server/scripts/verify-thread-migration.ts`;
0127 converted unfinished legacy Tasks with an Agent assignee into places, canceled the rest, kept
done and canceled ones as read-only history, and dropped boards, columns, and the Task Inbox;
0128 removes the Thread schema. 0130 moved the origin from the Task Chat onto the Task, gave every
Task its Project (its Task Chat's channel, else the Project holding its key, else Haus), and homed
every Agent in the Haus project.

`workers` is the Worker record ([Workers](../../specs/workers.md#record)), renamed from
`cloud_agent_work` by migration 0135. It carries the delegating Agent, its Task (`task_id`, null
only on read-only history, which `closed_at` must then mark: Workers from before Tasks, and Workers
whose Task a Project purge deleted, whose unsettled turns settle `stopped`), its `place`, its
`carrier_computer_id`, the title, repository, and starting ref, the provider agent id and URL, the
newest turn's provider lifecycle with its timestamps, the bounded one-line `activity`,
`start_nonce` (unique per Server and Agent, for start idempotency), and `closing_at` and
`closed_at`. `origin_chat_id` and `launch_message_id` are history pointers with no foreign key;
new Workers write null. `worker_history_links` keeps one row per Message link to history only,
`(server_id, message_id, worker_id)` with its `ordinal`; a Message never links a Worker with a
Task. `worker_turns` holds one row per turn: its `input` (`WorkerTurnInput[]`, null only on a
migrated turn whose follow-up still sits on its Computer until the drain fills it),
`follow_up_nonces` (the Agent send nonces it holds, from migration 0136), `dispatched_at` and
`acknowledged_at`, `outcome` (`WorkerOutcome`, set exactly when Haus settles the turn), the
provider status and raw status, the stop request with exactly one requester, the model it
requested (`model_id`, `default` for Auto or `null` when none was sent, with `model_params`,
`model_dropped_params`, and `model_fallback_from`), the bounded summary and the 64 KiB
`provider_result` it was cut from, error code, reported branches with the Computer's optional
pull request snapshot, usage, and the newest applied observation time that makes a stale report a
no-op. A turn holds a slot on its place from dispatch until its outcome is set;
`worker_place_limits` sets the per-Server limit (no row is 10). `pull_request_readings` holds the
pull request readings. A report's Message (`body_kind = 'worker-report'`) and a person's follow-up
(`worker-follow-up`) project their bodies from the turn's `outcome` and `input`. Changes publish
`worker.updated` scoped to the Task's Chat after commit. Provider prompts, credentials,
transcripts, and workspace files never reach the Server. Settling a turn queues at most one
`agent_inbox` row (`worker_report`, `worker-report:<turnId>`) for the delegating Agent in the same
transaction; stalls queue `worker_stall` and pull request changes `pull_request`.
Migration 0142 adds Workers on Computers. `computers` gains `workers_enabled` (off by default),
`worker_limit` (1 to 50, default 4), and `disconnected_at`, which the `machine-offline` sweep reads.
`project_repos` (`prp_`, unique per Project and repository) and `project_repo_links` (per Computer,
an optional `checkout_path`, the linking member) carry repos; the migration backfills repos from
the Workers that have a Task. `projects.default_worker_place` and `default_worker_computer_id` hold
the default, tied by a check, so removing a Computer or switching it off clears both first.
`workers` gains `runtime` (set exactly for a Computer place), `model`, `branch`,
`native_session_id` (set once), and `worker_md_revision_id` (the delivered `WORKER.md`).
`worker_turns` gains `dispatch_attempt`, `accepted_attempt` (the attempt the Computer said it runs
when it acknowledged the turn, which is then the current one), `worker_md_revision_id` (what the
current attempt inlines), `report_draft`, and `ended_at`. `worker_turn_credentials` keeps only token hashes of the
turn and push credentials, at most one live per turn, kind, and attempt, revoked at settle.
`drive_pushes.worker_id` keys a Worker push's source, and `artifact_revisions.author_worker_id`
names the Worker beside its Agent in `author_agent_id`.
`cloud_agent_model_settings`
holds one row per Server and provider (`server_id`, `provider`, `model_id`, `model_params`) with
the human-chosen Cloud Agent model and its effort and fast choices; no row is Auto. Migration
`0089_cloud-agent-claude` moved the former `servers.cloud_agent_model_id` and
`servers.cloud_agent_model_params` columns into the Cursor row and dropped them. The catalog a
model is checked against lives in each Computer's `reported_inventory`.

An Agent created by another Agent (ADR 0028) records `created_by_agent_id`,
`creation_nonce`, and `creation_request_hash` on `agents`. The nonce is unique per
(Server, creating Agent); the hash covers the request with channel order and repeats normalized.
Retries find that Agent under the Server lock, independently of later conversation.
Creation writes no Message. The nullable `creation_message_id` and its foreign key remain
only for existing production announcements and rollback; new creations leave it null.
Deleting a historical announcement clears that link without deleting the Agent.
`agents` carries no `role`; Server authority is a human membership property.

`triggers` is the Agent-owned inbound wake: owner Agent, `kind` (`webhook` or `github`),
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

`github_installations` binds one GitHub App installation to one Server through one GitHub
connection ([GitHub App connection](../../specs/github-app-connection.md#installations)): GitHub's
`installation_id` (unique among rows not `removed`), the account id, login, and type, repository
selection, permissions and events from the App-JWT read, `active`/`suspended`/`removed` status,
the accessible repository cache (`accessible_repository_ids`, `access_synced_at`) for the
connection user, and `bound_by_user_id`. A removed row is a tombstone with no connection that keeps
dependent `github` Triggers explainable; it is never revived. Its connection foreign key has no
delete action: deleting a GitHub connection tombstones its installations first, in the same
transaction. A `github` Trigger's problem (`github_trigger_configs.problem`) reaches its owner as
one `agent_inbox` row with source `trigger_problem`, keyed
`problem:<triggerId>:<problem>:<problem_since>`. Install state for `/github/setup` is Server
memory, not a table.

A `github` Trigger has no secret (`secret_hash` is present exactly for `webhook`) and keeps its
configuration in `github_trigger_configs`: the installation row, `installation` or `repositories`
scope with GitHub's repository ids and names, the validated event entries, the problem and since
when, and the rate-limit `suppressed_count` with `last_suppressed_at`. An installation holds at
most 25 undeleted `github` Triggers, enforced at authoring under the Server lock. Its fires are
ordinary `trigger_fires` rows whose payload is the per-event projection and whose `dedupe_key` is
`gh:<delivery guid>`. `github_webhook_deliveries` records every GitHub delivery this Server has
claimed, before routing and so without `server_id`: the guid (primary key), event, action, GitHub
installation id, `webhook` or `recovery` source, `processing` or `done` state, the routed count,
and why it was ignored. It holds no payload, dedupes redelivery and recovery, and expires after
seven days in the hourly Trigger retention sweep. `github_delivery_cursor` is one row per App id:
the recovery watermark, the last sweep time, and the most recent gap past GitHub's three-day
delivery retention ([GitHub Triggers](../../specs/github-triggers.md)).

`agent_delivery.agent_chain_turns` counts consecutive automation-only drains (Agent messages,
Trigger fires, Trigger problem notices) toward the 16-turn ceiling, and `agent_chain_advanced_at`
records when it last advanced, so a chain idle for 30 minutes below the ceiling restarts.

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
non-message identity — a fire id, a claim assignment identity — not a message with a
filter over it; `agent_inbox` is the renamed `agent_pending_work` and `agent_delivery` keeps its own
name for per-Agent run state.

An Agent message carries `session_generation`, the generation of the run that sent it (null for a
human message), and `agent_session_rotations` records each rotation with its generation, timestamp,
and reason. Together they replace the session receipt message: the App derives the per-Chat session
mark from the stamps and reads the rotation record only for the hover card (`specs/sessions.md`).

The Server application PostgreSQL role receives normal table/sequence privileges; migration and
backup roles remain separate operational credentials.
