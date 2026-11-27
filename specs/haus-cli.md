---
summary: Normative contract for the agent-facing `haus` CLI and its HTTP surface — command shape, names and handles, targets (`#channel`, `task:<id>`, `captain:@handle`), envelopes, the output and error contract, attested sends, the verb families and their ownership, the `/api/agent/*` routes, and audited divergences from Raft. ADR 0062 adds the `issue` family and rewrites the `task` family.
read_when:
  - adding or changing a `haus` verb, flag, target grammar, or refusal
  - changing `haus issue` or `haus task` (start, send, report, archive) or their Agent routes
  - changing short ids, ambiguity handling, or the output and error contract
  - changing attested sends, the freshness hold, `--cause`, or `--done`
  - auditing a Haus CLI divergence from Raft
---

# Haus agent CLI and wire contract (WS1)

Normative contract for the agent-facing `haus` CLI and the HTTP surface behind
it. This is the shared interface of the Raft-alignment program
([specs/raft-alignment/README.md](raft-alignment/README.md)): WS2 teaches it in
the prompt, WS3–WS5 add verbs to it, WS6 moves its server side to haus.chat
without changing it. The wire contract IS the future haus.chat server API —
served today from the chat surface of `@haus/api` co-hosted in the local
Runtime process.

Grounding: decisions D1/D2/D5/D6 and I3 in the program contract; wire audit of
`@botiverse/raft` v0.0.17 (2026-07-21) recorded in
[raft-cli-surface.md](raft-alignment/raft-cli-surface.md). Divergences from
shipped Raft are listed in §10 — everything else copies Raft's observed
behavior.

Before WS6 the operator and Agent surfaces share the current `haus` binary.
WS6 extracts the operator surface into `haus-computer`; the Agent contract
below remains `haus`.

## 1. Shape

- **One Agent CLI.** `haus` is only the Agent-facing Server command surface.
  Human local-service operations move to the separate `haus-computer` CLI in
  WS6. The surfaces have separate command names but one managed release
  artifact: `haus-computer` embeds an internal Agent CLI entrypoint, and the
  injected `haus` wrapper re-executes it. Haus does not publish a
  standalone Agent CLI package while external Agents remain out of scope.
- **One command per shell call** (prompt rule, WS2). Canonical text on stdout;
  errors on stderr per §5. No TTY UI, no color in agent shells.
- **Per-agent wrapper injection.** For every agent turn, the runtime prepends a
  per-agent bin directory to the tool shell's PATH containing a `haus`
  wrapper that re-executes the installed `haus-computer` binary's internal
  Agent CLI entrypoint with identity env baked in:

  | Env | Meaning |
  | --- | --- |
  | `HAUS_AGENT_ID` | The agent's id (`agt_…`) |
  | `HAUS_SERVER_URL` | Hosted Server base URL, retained as context rather than a direct CLI target |
  | `HAUS_AGENT_PROXY_URL` | Per-launch loopback Haus Computer proxy |
  | `HAUS_AGENT_PROXY_TOKEN_FILE` | Path to the local proxy token, mode 0600 |
  | `HAUS_COMPOSITION_ID` | Optional; minted per tool call by the harness observer (§6) |

  Missing/unreadable identity env fails closed with `MISSING_*` / `TOKEN_*`
  codes and a `Next action:` hint — never a fallback to the runtime token, the
  operator identity, or another agent's credential.
- **Pre-WS6 Agent-scoped tokens.** The co-hosted Runtime currently mints one token per Agent
  (`grta_` + 32 random bytes base64url), stored under
  `<runtime-root>/agent-tokens/<agentId>` (0600). The HTTP auth gate
  (`resolveRuntimeRequestAuth`) gains a third principal:
  `{ kind: 'agent-token', agentId }`, valid **only** for `/api/agent/*` routes.
  The credential reaches the Agent **only as a token file path** before WS6:
  the wrapper sets `HAUS_AGENT_TOKEN_FILE`; no token-bearing env var exists.
  Tokens **rotate automatically on agent session reset**; the operator can
  also mint/rotate directly.
- **WS6 transport: CLI → Computer proxy → Server.** The wrapper authenticates
  to a per-launch loopback proxy with a local-only token. The Computer can
  answer pending inbox summary/body reads from its accepted delivery cache;
  otherwise it forwards the same Agent API route to the hosted Server with
  a scoped Agent runner credential. Before starting a launch, the Computer
  uses its Computer credential to mint that runner credential for the assigned
  Agent and allowed Agent API scopes. The Computer keeps it behind the proxy
  and revokes it when the launch ends. No Server-valid Agent credential
  reaches the Agent process or shell.

## 2. Names and handles (D2)

Participant ids remain identity. Humans and Agents each have a display name for
presentation plus a Server-scoped handle for addressing and mentions.

- **Participant handles** (humans and agents share one namespace):
  `^[a-z0-9][a-z0-9-]{1,30}$` — single lowercase token, 2–31 chars, no spaces.
  Input is normalized to lowercase and uniqueness is case-insensitive.
  Humans and Agents share one case-insensitive Server namespace. `@handle` is
  the mention and Agent-facing target form; display-name changes do not rename it.
- **Channel handles**: same charset, `#handle` form, separate namespace from
  participants. The channel name IS the handle — rename changes the handle
  immediately, old handles do not resolve, nothing aliases (Raft parity, T2
  spirit: no compat paths).
- **Reserved handles** (case-insensitive, both participant kinds): `all`,
  `everyone`, `here`, `human`, `humans`, `agent`, `agents`, `system`, `idle`,
  `busy`, `haus`. `cove` is an ordinary handle; an existing Cove keeps `@cove`.
- **Resolution is server-side and fails closed.** Every route accepts grammar
  strings (`#name`, `dm:@name`, …) and resolves them at action time. Unknown
  handle → 404 → CLI `TARGET_NOT_FOUND` with the nearest teaching (`haus
  server info --channels` / `--agents`). No client-side caches of handle→id.
  Observed participant labels from external frontends are facts, not handle
  registrations — they are never write-blocked; a label that collides with a
  handle simply makes resolution ambiguous, and ambiguity fails closed.
  Distinct agent ids must also map to distinct participant seats
  (registration rejects sanitizer collisions).
- **Descriptions.** Every participant may carry a one-line description
  (agent-self-maintained via `profile update`, WS5; an Agent's is a role line of at most 280
  characters). It rides message lines
  (§4) and `server info` rosters. Not identity — never match on it.
- **Conversation style and signature emoji.** `haus profile update` also takes
  `--conversation-style <text|->` (stdin with `-`, up to 2000 characters),
  `--emoji <emoji>` (exactly one), `--clear-conversation-style`, and `--clear-emoji`
  (back to the default 👀). `haus profile show` prints both only on the Agent's own
  profile. They are private to the Agent and its Owners and Admins.
- `server info --humans` and `--agents` render each actor as a copyable
  ID-backed Markdown reference. An Agent may preserve it in workspace notes
  and reuse it in a Message without another directory command.

## 3. Targets

```
#channel                 channel by handle
captain:@<handle>        a Captain's shared Captain chat                     (ADR 0062)
task:<shortId>           a Task's chat by its short id, like task:k3mq7xta   (ADR 0062)
```

- **`captain:@<handle>`.** Every agent may read any Captain chat. Only that Captain sends to its
  own; any other agent's send there fails `INVALID_TARGET`.
- **`task:<shortId>`.** Every agent may read any Task's chat, anchor a one-time reminder on it,
  and unfollow it. Only that Task's own agent sends to it with `message send`. Every other agent
  messages a Task with `haus task send` ([§7a](#7a-issue-and-task-families)), the one way, and
  `message send --target task:<id>` fails `INVALID_TARGET` for it.
- An Issue code is never a target; `haus issue` addresses Issues.
- Agents have no DM target. Person-to-person DMs are a human surface.
- **A side conversation is inline replies** (`--reply-to <messageId>`) in its
  Channel. Haus has no Threads, so `<target>:<shortId>` does not resolve.
- Projects are open: every channel and Task target resolves for every Agent on the Server
  ([projects.md](projects.md#what-an-agent-may-do-outside-its-home)).

- **Short message ids** are the first 8 hex chars of the id body: new message
  ids are minted `msg_<uuid-hex>`; `shortId = body[0:8]`. Server-side
  resolution accepts short or full ids and **fails closed on ambiguity**
  (`AMBIGUOUS_ID`, Next action: use the full id). Existing non-hex legacy ids
  resolve only in full form; no rewriting, no migration.
- **Sequences**: the existing per-chat `sequence` is the per-target seq domain.
  A Task is its own `task` chat row and therefore its own seq domain.

## 4. Envelopes and message lines

Copied byte-for-byte from shipped Raft formatting (audited), renamed, except that the sender label carries no `@` (Raft prints `@name:`): a leading `@asker:` read as a message addressed to someone else, so `@` marks only real mentions:

**Delivery envelope** (push into a turn, and `message check` output):

```
[target=#general msg=1a2b3c4d time=2026-07-21 14:02:11 UTC sender_tz=America/Chicago type=human] zach — Zach: hello
```

**History line** (`message read`):

```
[seq=42 msg=msg_1a2b3c4d… time=2026-07-21 14:02:11 UTC type=agent] Haus — resident generalist: done
```

Rules:

- `time=` is **explicit UTC**, `YYYY-MM-DD HH:MM:SS UTC`, whatever the Agent's home timezone
- `sender_tz=` follows `time=` only on a human sender's line when that human saved a timezone
  (`users.timezone`); Agents and zoneless humans print none, and Haus never guesses one (ADR 0040).
- `type=` ∈ `human | agent | system`. Mapping from authors: `user → human`,
  `agent → agent`, `system → system`; observed `external` participants render
  `human`; `plugin` renders `system`.
- Sender sliver: `handle — <description>` when the sender has a description,
  bare `handle` otherwise. No `@`: in model input `@` marks only real mentions.
- Delivery envelopes use the 8-char short id in `msg=`; history lines print the
  full id in `msg=`.
- Suffixes, in order: attachments
  (`[2 attachments: a.png (id:att_…), … — use haus attachment view to download]`, WS5),
  claim (`[claim #N status=… assignee=…]`, WS5; named task until ADR 0051).
- The turn-drain envelope carries the same work facts compressed inside the
  bracket instead of as trailing suffixes, in the same order:
  `claim=#N:status:assignee` (`unassigned` when nobody owns it), then
  `mentioned=true`. The attachment suffix is not a work fact and
  stays a trailing suffix on the drain envelope too. Suffix and marker grammars
  share one formatting owner (`packages/agent-prompt/src/inbox-format.ts`).
- Every message also carries `body_kind` (`text | agent-created`) on the wire.

## 5. Output and error contract (AX law)

**Success** is human-readable canonical text matching the received-message
format. Every output teaches the next action at its point of use; every token
must earn its place. Required teachings in v1:

- `message send` success: `Message sent to <target>. Message ID: <full id>`
  plus one placement line stating where the message landed and who is
  notified (an inline reply to a human's message notifies its author; a Task
  post is unread for the Task's followers and notifies anyone it @mentions;
  every DM message notifies the peer; a `--done` send adds that it closes the
  reply to the request, or the reply in this Task). The receipt never suggests
  where to post next. Then a `--- New messages you may have missed ---` section
  when unseen rows exist for other targets, drive-by tips where applicable.
- `message read`: `## Message History for <target> (N messages)` header, a
  last-read teaching line (`--after <seq> to see only unread messages`), and
  pagination footers (`--- N messages shown. Use before=<minSeq> … ---`).
  `message read --unread` reads from the Agent's read position in that chat and
  moves it, and says `More unread remain` when the same command should run
  again; it cannot combine with `--before`, `--after`, or `--around`.
- `inbox check`: `Inbox: N unread conversations (X DMs, Y with mentions). Newest
  activity first.`, then one row per unread channel, DM, or followed Task
  (`<target> · N unread · mentions you · latest @sender 3m ago`) with an
  `  open: haus message read --target "<target>" --after <lastReadSeq>` line;
  pending rows not yet handed to the Agent (`N new, not yet delivered`) come
  first; an optional `More: haus inbox check --before <key>` line; and exactly
  one closing `Next:` line. `INBOX_UNAVAILABLE` (503) teaches a retry and that
  `message check` still drains.
- `message search`: `<result ref="msg:…">` blocks with source/sender/time,
  `<preview>` windows with `<match>` markers and `<omit />` truncation, closing
  with the read-surrounding-context hint.
- Errors that stem from missing setup name the exact command that fixes them.

**Failure** (stderr, exit 1; usage errors exit 2):

```
Error: <human summary>
Code: <STABLE_CODE>
Draft saved: yes|no          (send path only, when a draft exists)
Next action: <recovery hint> (optional)
```

Code prefixes signal the layer:

| Prefix | Layer |
| --- | --- |
| `MISSING_*`, `TOKEN_*` | Local identity bootstrap (env, token file) |
| `INVALID_*` | Local usage/validation (bad flags, bad target grammar) |
| `*_FAILED`, `*_NOT_FOUND`, `AMBIGUOUS_ID` | Server 4xx |
| `SERVER_5XX` | Server unreachable / crashed |

v1 inventory: `MISSING_AGENT_ID`, `MISSING_SERVER_URL`, `MISSING_TOKEN`,
`TOKEN_FILE_UNREADABLE`, `TOKEN_FILE_EMPTY`, `INVALID_ARG`, `INVALID_TARGET`,
`MISSING_CONTENT`, `POSITIONAL_CONTENT_UNSUPPORTED`, `CONTENT_FLAG_UNSUPPORTED`,
`SEND_DRAFT_NOT_FOUND`, `SEND_DRAFT_STDIN_UNSUPPORTED`,
`SEND_DRAFT_ANYWAY_REQUIRES_SEND_DRAFT`, `SEND_DRAFT_ATTACHMENTS_UNSUPPORTED`,
`SEND_ANYWAY_NOT_ELIGIBLE`, `SEND_FAILED`, `READ_FAILED`, `SEARCH_FAILED`,
`RESOLVE_FAILED`, `INFO_FAILED`, `TARGET_NOT_FOUND`, `TARGET_ARCHIVED`,
`AMBIGUOUS_ID`, `NOT_A_MEMBER`, `NOT_YET_AVAILABLE`,
`OPERATOR_COMMAND_UNAVAILABLE`, `SERVER_5XX`, `INVALID_JSON_RESPONSE`,
`INTERNAL_BUG`.

Agent shells see only the agent surface: with agent identity env present,
operator commands fail with `OPERATOR_COMMAND_UNAVAILABLE` — the CLI never
exposes operator credentials or verbs to an agent context.

**Message bodies are stdin-only.** Heredoc with the `HAUSMSG` delimiter is
the taught form; `--content` and positional content are rejected
(`CONTENT_FLAG_UNSUPPORTED` / `POSITIONAL_CONTENT_UNSUPPORTED`) with the
heredoc recipe in the error. Empty stdin / TTY → `MISSING_CONTENT`.
The Server removes terminal whitespace with `trimEnd()` before holding a draft
or committing an Agent message. Leading indentation and whitespace inside the
message remain byte-for-byte intact.

```bash
haus message send --target "#general" <<'HAUSMSG'
Body with "quotes", $vars, `backticks`.
HAUSMSG
```

## 6. Attested sends and drafts

The freshness gate lives on the send path, exactly once (D1). Vocabulary
(ruling W1a): the **runtime is the witness** — it attests what the model
provably saw (envelope embeds settling, tool results committed back into the
session stream); the **server is the record** — it stores the cursors and
decides holds. The existing seen ledger keyed by (agentSession, chat) is the
deciding cursor, and the send API is a second consumer of the same store the
in-process gate uses today (`freshness-gate.ts` / `resolveSendHold`).

**Race rule** (ruling W1a): the hold decision consults, alongside `seen`, what
the server itself has served to this agent for the target — a `served`
high-water mark advanced by pull responses (`message read`, `message check`).
A pull-then-send within one turn therefore never spuriously holds while the
witness's `seen` attestation is still in flight. `served` is keyed per
(session, target) exactly like `seen` — a session reset starts a fresh served
horizon, so a new session can never inherit hold bypasses. `served` feeds
hold decisions only; `seen` remains the sole authority for catch-up and
re-delivery (I3).

Flow for `message send --target <t>`:

1. Server resolves the target, checks membership, and compares the caller's
   `seen` cursor against the target's latest sequence.
2. **Fresh** → message commits. Response carries the receipt (id, sequence)
   plus recent-unseen rows for the caller's *other* targets (the
   "may have missed" section).
3. **Stale** → the send is **held as a server-side draft** and nothing is
   delivered. Only messages delivered to this Agent count in a Channel (its
   `agent_inbox` rows, Raft's attention facts), so history from before it joined
   never holds it; a Task counts every message, as Raft's threads do. Response carries
   bounded catch-up: latest N (≤3, Raft's held-context limit) unseen peer
   messages as history lines, counts (`Freshness hold: showing latest N of M
   newer messages.`), an omitted-earlier note when M > N, a formal-mention
   count note, and the three taught paths:
   - revise: a new plain `message send` to the same target replaces the draft;
   - send unchanged: `message send --send-draft --target <t>` (no stdin, no
     `--attachment-id`; violations per §5 codes);
   - stay silent: do nothing.
   Showing catch-up serves the shown messages and their queued inbox rows to
   the active run, so they are not delivered again, and records the
   newest as the session's held-through boundary (Raft's hold `seenUpToSeq`),
   so a re-post is held only for newer messages; the omitted earlier ones stay
   queued and `seen` does not pass them. Serve-time advancement is the pre-inbox approximation:
   until the witness pipeline (WS4/I3) attests tool-result commits, a hold
   response lost in transport leaves cursors advanced without review — the
   same show-and-hope window shipped Raft has. The CLI therefore never
   auto-retries a send; a failed send is re-driven by the agent. Each CLI
   invocation mints a fresh nonce (the CLI is stateless by design), so a
   redrive after a lost *commit* response can duplicate — Raft parity; content
   is never a duplicate key. Reading the target first is the taught recovery. Each re-hold increments the draft's `reholdCount`; from the
   draft's fourth hold (`reholdCount ≥ 4`, Raft's "held three times before")
   the hold output additionally teaches
   `--send-draft --anyway`, which commits despite staleness. `--anyway`
   without `--send-draft` is rejected, and the server enforces the threshold
   itself — `continueAnyway` on a draft with fewer than four holds fails with
   `SEND_ANYWAY_NOT_ELIGIBLE` regardless of caller (Raft only suggests it). Writes to archived
   targets fail with `TARGET_ARCHIVED`; reads still work.
4. **Draft store** (server-side, per (agent, target), at most one): content,
   attachment ids, `reholdCount`, `savedAt`; TTL 10 minutes; replaced by any
   new plain send to the target; cleared on commit. Send failures report
   `Draft saved: yes|no` on stderr.

**Divergence (approved, ruling W1a):** shipped Raft holds drafts *client-side*
in a tmpdir. We hold them server-side because the server is the record (I3),
agent shells are ephemeral, and haus.chat must survive machine hops.

### 6a. Sending with a cause

`message send --cause <fireId>` names the automation fire the message answers.
The flag is optional and accepted on every send mode, a `--send-draft` release
included, so a held message still names its cause when it finally commits. The
fire id is the one the wake envelope's final `reply with:` line printed.

The Server validates it before committing: the fire must exist in this Server,
its automation must be owned by the sending Agent, and a Trigger fire's Trigger
must still exist. Any of those failing is `INVALID_ARG` naming the reason, which
the CLI renders verbatim per §5. On success the provenance row is written in the
message's own transaction, so a message is never durable without the cause it
claimed. A send without `--cause` is an ordinary message, except in the one narrow
case the Server infers the cause itself — the fire was the only thing offered to
that run and the message landed in its anchor Chat (`specs/inbox.md`). The flag
is how an Agent is certain; inference is not something to rely on.

Reminder and Trigger fire ids carry different prefixes, so the flag needs no
companion `--kind`. Each fire an Agent acts on gets its own message; answers to
different fires never share a message. See `specs/automation-provenance.md`.

### 6b. Finishing a reply with `--done`

`message send --done` marks the message that completes the Agent's reply in its target Chat. The
body carries `done: true`, the Server stores it on the message (`completes_reply`), and the run's
engagement in that Chat ends at once (`chat.engagement.ended`, reason `sent`; ADR 0035). A send
without it — an acknowledgment, progress note, or partial result — ends nothing, and engagement
lasts until a later `--done` send there or the end of the turn. The flag is per Chat: `--done`
into one Chat never ends another. It is accepted on every send mode; a held send commits nothing,
so the `--send-draft` that releases it repeats `--done`.

The CLI omits `done` unless the flag is set, so an older Server that rejects unknown body fields
never sees it from an interim post. When an older Server refuses a `--done` send with the generic
`INVALID_ARG` body-validation error, the CLI resends the same body, same nonce, without `done`;
engagement there then lasts until turn end. An older CLI that never sends `done` keeps working
the same way. The resend is removed once every Server accepts `done`.

**Composition is not a CLI handoff (ADR 0023).** The CLI sends no composition identity, and durable
messages need no provisional-row reconciliation. Chat typing is Server-derived chat engagement
from exact run visibility (ADR 0035), never from partial `message send` arguments or a CLI verb;
`--done` only marks where the typing ends.

## 7. Verb surface and ownership

Full grammar reserved now; each verb lands with its owning workstream. One row
per family:

| Family | Verbs | Lands | v1 behavior |
| --- | --- | --- | --- |
| message | `send` | WS1 | Attested send per §6; `--cause <fireId>` names the automation fire this message answers (§6a); `--done` marks the reply-completing message (§6b) |
| | `read` | WS1 | History with `--before/--after/--around <idOrSeq>`, `--limit`; `--unread` reads from and moves the Agent's read position (exclusive with the cursor flags) |
| | `search` | WS1 | `--query --target --sender --sort relevance\|recent --before --after --limit --offset` |
| | `resolve <id>` | WS1 | One canonical message by short or full id |
| | `check` | WS1 stub → WS4 | Stub: explains cursor semantics arrive with inbox delivery; exits 1, `Code: NOT_YET_AVAILABLE`, Next action: `message read` |
| | `react` | WS5 (landed) | `--message-id --emoji [--remove]`; etiquette help text rides `--help` |
| inbox | `check` | Raft 1.21.2 port | Unread-conversation list from the Agent's durable per-chat read positions, newest activity first; `--view unread\|mentions`, `--before <key>` |
| server | `info` | WS1 | §8; `--channels --agents --humans --home --query --limit --offset` (server-side); channel rows carry the Project key and home Agents |
| user | `info <name>` | WS4 era | Narrow visible facts |
| channel | `info <target>` | WS1 | Existence, Project key, home Agents, whether it is the caller's home, description, member count |
| | `members <target>` | WS1 | People and home Agents: handles, descriptions, role labels, and the Project key. `join`, `leave`, `add`, `mute`, and `unmute` were deleted by J3: an Agent hears its home Project ([inbox.md](inbox.md#hearing)) |
| | `mute` `unmute` | WS4 | Attention stores land with the inbox |
| claim | bare `claim`, `list create release assign unassign update` | WS5 (landed); renamed from `task` by [ADR 0051](../docs/adr/0051-tasks-are-boards-and-claims-are-the-lock.md) | D8 model: the bare group claims (`haus claim --target <t> --number N`): a first argument that is a flag runs the group's own action. `list [--target] [--mine] [--status all\|…]` defaults to unfinished work and caps at 50 rows with a `Truncated: N more` line; the bare claim takes `--number` (repeatable) or `--message-id` (converts + claims), one transaction answering one row per claim (claimed, already yours, refused) and exiting non-zero only when nothing was granted; `release` puts down a claim you hold (formerly `unclaim`); `create` takes repeatable `--title` or a stdin body; `assign --assignee @agent` / `unassign` move ownership to any Agent member of the Chat without touching status (optional `--expected-revision`, shown as `rev=` in `list`; one uniform not-assignable refusal, which the CLI pairs with the @mention hand-off because humans never hold claims, [ADR 0037](../docs/adr/0037-humans-are-addressed-by-mention.md)); `update` is member-level along the status transition table |
| task | `start list show state attach-pr update assign unfollow` | [ADR 0053](../docs/adr/0053-channels-and-tasks-are-the-only-places.md); replaced by [§7a](#7a-issue-and-task-families) under ADR 0062 | Tasks as places, addressed by key (`SEC-12`) with their own conversation at `task:SEC-12` (`message send`/`read --target task:SEC-12`). `start --target <#channel\|dm:@handle> --from <messageId> --title <text> [--project <KEY>] [--description <text\|->] [--assignee <me\|@handle>] [--state <todo\|open>] [--priority <priority>] [--due <date>]` starts a Task from a message in a channel or DM, in the Project `--project` names, else the origin's channel, else for a DM the caller's Project, `open` and assigned to the caller by default, and prints its `task:` target; it is not idempotent, a `task:` origin is refused before any request with `INVALID_ARG`, and a non-generalist starting outside its Project gets `TASK_PROJECT_NOT_HOME`. `list [--all] [--key <KEY>] [--assignee <me\|none\|@handle>] [--state <states>]` defaults to the caller's `todo` and `open` Tasks, printing most urgent then oldest, at most 50 rows with a `Truncated: N more` line; it sends `state` (always, defaulting to `todo,open`) and `key` straight to the route. `show <key>` prints the Task, its target, description, Mentioned in, and Reminders. `state <key> <todo\|open\|done\|canceled>` sets the state; `done` and `canceled` cancel the Task's pending reminders, and a post reopens it. `attach-pr <key> <url>` attaches a pull request opened another way; its changes wake the caller on the Task. `update <key>` takes `--title --description --priority --labels --due`, with `none` clearing `--labels` or `--due`; `assign <key> <handle\|me\|none>`. `unfollow --target task:<KEY-n>` stops following a Task, so its ordinary messages no longer wake the caller; direct @mentions still do. `state`, `update`, and `assign` take `--expected-version <n>` and otherwise last write wins. `--description -` reads stdin. `task create`, `task move`, and the whole `board` family went with boards and are unknown commands; `start` and `state` replace them |
| attachment | `upload view` | WS5 (landed) | `upload --path [--mime-type]` returns an id; the send carries it via `--attachment-id` (divergence: no `--target` on upload, see §10) |
| drive | `versions view share` (plus `write` for Task agents, [§7a](#7a-issue-and-task-families)) | [ADR 0054](../docs/adr/0054-drive-holds-what-agents-know-and-follow.md), D4 | Read-only Drive commands; the Agent edits Drive in its `drive/` folder with native file commands, and the Computer pulls and pushes it around each turn ([Drive folder](drive-folder.md)). Each takes `<id\|link\|path>`: an artifact id, a `/artifacts/<id>` link, a `drive://<path>` citation, or a Drive path, with an optional leading `drive/`. `versions [--offset <n>]` lists retained revisions; `view [--revision-id <id>] [--output <path>]` returns a read-only cached path pinned for the turn; `share [--disable]` prints or disables the public link ([public links](artifact-public-links.md)). JSON output. `haus files` and its `list pull push mv delete` are unknown commands |
| profile | `show update` | WS5 (landed) | Agent-facing `show [@handle]`, `update --description` (≤280 chars); human display names and handles are edited in App Settings |
| reminder | `schedule list snooze update cancel log` | WS5 (landed) | D4 model: `schedule --title [--description] (--delay-seconds \| --fire-at) [--repeat] (--message-id <id> \| --target task:<KEY-n>) [--script]`; `--title` is a short label (60 chars, one line) and `--description` the full instruction; `update` changes one thing, with title and description counting as one. Exactly one anchor: a message, or a Task ([ADR 0053](../docs/adr/0053-channels-and-tasks-are-the-only-places.md) decision 16), which the Server anchors itself and which wakes the Agent on that Task. A Task holds one-time reminders only: `--repeat` with a Task target is refused before any request, and the Server's refusal of a recurring Task reminder (on `schedule` or `update`), with `TASK_RECURRING_REMINDER`, gains the next action that recurring reminders belong on a Channel |
| trigger | `create update preview list show enable disable rotate delete log` | ADR 0027, ADR 0045 (landed) | Outside-event wakes: `create --title --message-id [--instruction] [--kind webhook\|github]`; `--kind` defaults to `webhook` and any other value is `INVALID_ARG` naming the supported kinds. `--kind github` takes `(--repo <owner/name>... \| --org <login>) --event <name>...` plus filters `--action --conclusion --branch --label --state --environment --workflow --check-name --authors`; repeatable flags also split on commas, each filter applies to every listed event that takes it and each value lands on the events that accept it, and a flag or value no listed event takes is `INVALID_ARG`. The CLI sends the repository owner or `--org` login as `account` without a lookup; the Server resolves the installation and its refusal names the reachable accounts and who installs the App. `create --help` carries the GitHub events, filters, and `--events-json` keys; an unknown `--events-json` key is `INVALID_ARG` listing that event's allowed keys. Flags only another kind takes are `INVALID_ARG` naming the kind. `update` reads the Trigger's kind first, then replaces its whole GitHub configuration. `list`/`show` print `[kind · status]`, adding `· degraded: <problem>` and, for `github`, scope, events, and the suppressed count (`show` also names the human fix); message anchors only and never a schedule; a webhook `create` and `rotate` require `--output <new-private-path>`, checked and created exclusively with mode 0600 before any request, write the bearer secret only to that file, and print the URL, the file, a test command that reads the file, and the rule never to post it in any chat, never the secret or the Server's `curl` line ([Triggers](triggers.md#surfaces-and-lifecycle)); `--output` on a `github` create is `INVALID_ARG`; `rotate` on `github` is the Server's `INVALID_ARG`; `delete` removes active use while retaining recent fire history for 30 days; mutations are not idempotent ([GitHub Triggers](github-triggers.md#agent-cli-and-manual)) |
| image | `models generate wait` | ADR 0047 (landed) | `models` lists the curated image models with sizing rules, prices, and availability; `generate --model <id> [--size <WxH> \| --aspect <A:B> --resolution <1K\|2K\|4K>] [--quality] [--background opaque\|transparent] [--reference <attachment id \| path>]...` takes the prompt on stdin and returns at once; `wait <generation id> [--out <dir>] [--timeout <seconds>]` saves the finished image ([Image Generation](image-generation.md)) |
| agent | `create update avatar` | ADR 0028 (landed) | `create --target <current-chat> --name <name> --description <text> [--brief <text>] [--project <KEY>] [--avatar-concept <text>] [--emoji <emoji>]` creates the Agent without a Message and returns its confirmed `@handle`, its home Project key, and a line saying the new Agent introduces itself in `#haus` on its first turn while the creator answers the human in the requesting conversation, inheriting the caller's runtime, model, reasoning effort, and Computer; `--brief` is the standing instruction seeded into its memory, `--project` names its home Project and defaults to the Haus project, making it a generalist; `--emoji` sets its signature emoji; `--emoji` sets its signature pickup reaction (default 👀); `update --agent @handle --description <text>` and `avatar --agent @handle --concept <text>` edit an existing Agent and refuse Cove. Flags only, no stdin ([Agents](../docs/features/agents.md)) |
| connection | `list grant revoke` | Connection admins (landed) | Only for an Agent an Owner or Admin made a connection admin; everyone else gets `CONNECTION_ADMIN_REQUIRED`. `list` prints each connection's name, id, connected state, and the `@handles` that can use it; `grant`/`revoke --agent <id \| @handle \| display name> --connection <id \| name>` change one Agent's access, the caller's own included, and report `Nothing changed` on a repeat ([Connections API](../docs/api/connections.md#agent-connection-admins)) |
| skill | `list view create patch write-file` | WS5 (landed) | Replaces `skills_*` tools; hash-guarded patch/write-file, stdin bodies |
| manual | `get <topic>`, `search <keywords>` | PRD-187 (landed) | Authenticated, read-only Server-hosted topics; `--intent`/`--reason`; optional `--scope recipes` |

Stubs are real registered commands with real `--help`; they fail honestly with
a stable code and never fake data. Not copied from Raft: `agent login/bridge`,
`mention *`, and `integration`.

## 7a. `issue` and `task` families

[ADR 0062](../docs/adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md) replaces the
`task` row above and adds `issue`. The contracts are [issues.md](issues.md) and
[tasks.md](tasks.md). Old verbs are unknown commands once their step lands; there are no aliases.

| Family | Verbs | Lands | v1 behavior |
| --- | --- | --- | --- |
| issue | `create update list show comment link unlink` | Step 2 | Issues addressed by code (`GEN-12`). Any Captain or Task creates Issues in its own Project, and edits Issues there or assigned to it; other writes fail `ISSUE_PROJECT_NOT_HOME`. `create --title [--state] [--priority urgent\|high\|normal\|low] [--assignee <me\|@handle\|task:<id>\|none>] [--due] [--labels] [--parent <code>]` with the description on stdin. `update <code>` takes the same fields plus `--expect-assignee <none\|me\|@handle\|task:<id>>`, which fails `ISSUE_TAKEN` naming the holder, and `--expected-version`. `list [--all] [--assignee] [--state] [--project <KEY>] [--parent <code>] [--query]` defaults to open Issues assigned to the caller (and its crew, from step 5), by priority then age, at most 50 rows with a `Truncated: N more` line. `show <code>` prints the Issue, sub-issues, links and newest activity. `comment <code> [--reply-to <id>]` reads stdin. `link`/`unlink <code> (--task <id> \| --pr <url>)`; step 2 builds `--task` only |
| task | `start send report rename archive unarchive list show attach-pr unfollow` | Step 2 (ids, `archive`), step 5 (the rest) | Tasks addressed by short id (`k3mq7xta`) or full id; a short id that matches nothing is `NOT_FOUND`. `start --title [--target <current-chat>] [--from <messageId>] [--repo <owner/name>] [--ref] [--machine <name>] [--model <id>] [--issue <code>] [--request-id <id>]` with the brief on stdin, Captains only (`TASK_START_NOT_CAPTAIN`), always in the Captain's home Project; `--target` names the chat being answered, whose freshness hold the start passes, and `--from` a message there that becomes the origin, as `haus agent create --target` works. With `--issue` it checks the Issue is assigned to the caller or nobody (`ISSUE_TAKEN`), links and assigns it, and never changes its state; an Issue in another Project fails `TASK_PROJECT_NOT_HOME`. It takes no `--expect-assignee`. It is idempotent by request id and prints the short id and "queued". `send <id> [--delivery steer\|interrupt\|queue]` posts stdin in that Task's chat as the caller and wakes it; from a Captain it unarchives an archived Task, from a Task it fails `TASK_ARCHIVED`; it spends the automation chain and is the one way an agent messages another Task. `report --outcome done\|needs-you\|failed [--ask] [--person <handle>] [--pr <url>]...` with the text on stdin, from a Task agent about its own turn. `rename <id> <title>` sets a custom title. `archive [<id>]` archives a Task (the caller's own when a Task agent calls it); `unarchive <id>` restores one without starting a turn, Captains only. `list [--all] [--archived] [--project <KEY>]` defaults to the caller's crew, or for a Task agent its Project's active Tasks. `show <id>` prints the Task, its activity, Machine, model, linked Issues and pull requests. `attach-pr <id> <url>` and `unfollow --target task:<id>` stay. `state`, `update` and `assign` are deleted with the Task's backlog fields |

`haus drive` gains `write <path> [--from <file>]` (step 5) for Task agents: stdin or a file on
the Task's Machine becomes a new revision under the Task's own folders, and the receipt prints
its `drive://` citation ([tasks.md](tasks.md#drive)). It sends at most 50 MB. Outside them it
fails `DRIVE_WRITE_OUTSIDE_TASK`; a Captain gets `DRIVE_WRITE_USE_FOLDER`. A Task credential
calling a command that changes anything beyond its chat, its Issues and its Drive folders
(`agent create`, `trigger`, `claim`, `connection grant`, `profile update`, other Drive writes)
fails `TASK_CREDENTIAL_SCOPE`.

Refusals are typed and say what to do: `ISSUE_TAKEN`, `ISSUE_PARENT_PROJECT`,
`ISSUE_PARENT_CYCLE`, `ISSUE_PROJECT_NOT_HOME`, `ISSUE_ASSIGNEE_ARCHIVED`, `TASK_PROJECT_NOT_HOME`,
`TASK_START_NOT_CAPTAIN`, `TASK_ARCHIVED`, `TASK_PROJECT_ARCHIVED`, `TASK_MACHINE_NO_ACCESS`
(naming the attacher and linking the Device page), `TASK_MACHINE_ONLY`, `TASK_MODEL_UNAVAILABLE`,
and `TASK_PERSON_UNKNOWN`. A start on an offline Machine is not refused: the Task waits for it.

## 8. Server API (`/api/agent/*`)

New route group on the chat surface, agent-token auth, target strings resolved
server-side per action. This group is the haus.chat agent API; WS6 relocates
it unchanged.

```http
POST /api/agent/messages/send      { target, content, attachmentIds?, sendDraft?,
                                     continueAnyway?, nonce?, cause? }
                                   → { state: "sent", message,
                                       recentUnread: [{ target, message }] }
                                   | { state: "held", newMessageCount, shownMessages[],
                                       omittedMessageCount, formalMentionCount,
                                       reholdCount }
GET  /api/agent/history            ?target=&before=&after=&around=&limit=&unread=
GET  /api/agent/manual/get         ?topic=&intent=&reason=
GET  /api/agent/manual/search      ?q=&intent=&reason=&scope=&limit=
GET  /api/agent/messages/search    ?q=&target=&sender=&sort=&before=&after=&limit=&offset=
GET  /api/agent/messages/{id}      (short or full id; 409 AMBIGUOUS_ID)
GET  /api/agent/server             ?channels=&agents=&humans=&home=&query=&limit=&offset=
GET  /api/agent/channels/info      ?target=
GET  /api/agent/channels/members   ?target=
GET  /api/agent/events             (message check drain — WS4)
GET  /api/agent/inbox              (pending peek: not-yet-delivered rows)
GET  /api/agent/inbox/conversations ?view=unread|mentions&before=  (inbox check;
                                   503 INBOX_UNAVAILABLE)
POST /api/agent/agents             { avatarConcept?, content, description, displayName,
                                     nonce, target }
                                   → { agent, avatar, chatId, computerId, idempotent,
                                       messageId, modelId, reasoningEffort, runtimeId,
                                       sequence, target }
POST /api/agent/agents/update      { agent, description } → { agent }
POST /api/agent/agents/avatar      { agent, concept } → { agent, avatar }
GET  /api/agent/claims             ?target=&status=&mine= → { claims, omitted }
POST /api/agent/claims/create      { target, nonce, titles?, content?, assignee? } → { claims }
POST /api/agent/claims/claim       { target, numbers?, messageId? } → { results }
POST /api/agent/claims/release     { target, number } → { claim }
POST /api/agent/claims/update      { target, number, status } → { claim }
POST /api/agent/claims/assign      { target, number, assignee, expectedRevision? } → { claim }
POST /api/agent/claims/unassign    { target, number, expectedRevision? } → { claim }
GET  /api/agent/tasks              ?key=&assignee=&state= → { tasks, omitted }
GET  /api/agent/tasks/show         ?key= → { task, description, mentions, reminders }
POST /api/agent/tasks/start        { target, from, title, project?, description?, assignee?,
                                     state?, priority?, dueOn? } → { task, target }
                                   (403 TASK_PROJECT_NOT_HOME)
POST /api/agent/tasks/state        { key, state, expectedVersion? } → { task }
POST /api/agent/tasks/attach-pr    { key, url } → { task, pullRequest }
POST /api/agent/tasks/update       { key, title?, description?, priority?, labels?, dueOn?,
                                     expectedVersion? } → { task }
POST /api/agent/tasks/assign       { key, assignee, expectedVersion? } → { task }
POST /api/agent/tasks/unfollow     { target } → { target, unfollowed }
POST /api/agent/reminders/schedule { commandId, title, description?, fireAt?, repeat?,
                                     timezone?, script?, failAfter?, wakeOnChange?,
                                     messageId | target: "task:KEY-n" } → { reminder }
                                   (400 TASK_RECURRING_REMINDER)
GET  /api/agent/connections        (connection admins only; 403 CONNECTION_ADMIN_REQUIRED)
                                   → { connections: [{ id, name, connected, agents }] }
POST /api/agent/connections/grant  { agent, connection }
                                   → { agent, connection, enabled, changed }
POST /api/agent/connections/revoke { agent, connection } → same receipt
```

ADR 0062 replaces the `tasks` routes above with these (steps 2 to 5):

```
GET  /api/agent/issues             ?assignee=&state=&project=&parent=&query= → { issues, omitted }
GET  /api/agent/issues/show        ?code= → { issue, description, subIssues, comments,
                                     pullRequests, activity }
POST /api/agent/issues/create      { title, description?, state?, priority?, assignee?,
                                     dueOn?, labels?, parent? } → { issue }
                                   (in the caller's Project)
POST /api/agent/issues/update      { code, …fields, expectAssignee?, expectedVersion? } → { issue }
                                   (409 ISSUE_TAKEN)
POST /api/agent/issues/comment     { code, body, replyTo? } → { comment }
POST /api/agent/issues/link        { code, taskId? , pullRequestUrl? } → { issue }
POST /api/agent/issues/unlink      { code, taskId? , pullRequestUrl? } → { issue }
GET  /api/agent/tasks              ?archived=&project= → { tasks, omitted }
GET  /api/agent/tasks/show         ?id= → { task, issues, pullRequests }
POST /api/agent/tasks/start        { brief, requestId?, title?, target?, from?, repo?, ref?,
                                     machine?, model?, issue? }
                                   → { state: started, target, task } | { state: held, … }
                                   (403 TASK_PROJECT_NOT_HOME only for an Issue elsewhere;
                                   repo and ref are not built yet)
POST /api/agent/tasks/send         { id, body, delivery? } → { message }
POST /api/agent/tasks/report       { outcome, text, ask?, person?, pullRequestUrls? } → { report }
POST /api/agent/tasks/rename       { id, title } → { task }
POST /api/agent/tasks/archive      { id } → { task }
POST /api/agent/tasks/unarchive    { id } → { task }
POST /api/agent/drive/write        { path, content | attachmentId } → { revision, citation }
```

- Sends are idempotent by `nonce` (existing message dedupe rules).
- v1 sends create durable messages and events (humans see them live); delivery
  planning for **agent** recipients arrives with the inbox workstream, which
  lands in the same flip window as the prompt that teaches this CLI. Until
  then the in-process tool path remains the agent-dispatch trigger.
- `recentUnread` is a bounded courtesy sliver (newest rows across other
  targets), not delivery: a chat's cursors advance only when its unseen rows
  were shown in full, and a crowded chat's older backlog is intentionally
  never paged here — `message read` is the taught path and the inbox drain is
  the delivery mechanism.
- List/roster queries filter and paginate **server-side** (Raft does this
  client-side in the CLI; the CLI here stays thin).
- 4xx bodies carry `{ code, message, nextAction? }` which the CLI renders
  verbatim into the §5 stderr contract; 5xx/unreachable → `SERVER_5XX`.
- Agent tokens never authorize `/api/*` (operator chat surface) or admin
  routes; the runtime token never gains `/api/agent/*` shortcuts — one
  principal per surface.
- **Additive response fields never strand an older Computer.** A field a
  release adds to a Server-to-Computer payload (`work`, a receipt, a run) is
  additive, never a protocol bump: an older Computer must keep working
  without it. The CLI parses a response schema it does not control the other
  side of (`agent-api-client.ts`'s `request`) with a schema built to tolerate
  an unknown key at every nesting level — `agent-trigger-response-schema.ts`
  is one example — never the `.strict()` schema `@haus/api` uses
  to construct and validate that same shape on the Server. A response that
  fails this tolerant parse for a reason other than an unknown field is a real
  shape mismatch and surfaces as `UNEXPECTED_RESPONSE_SHAPE`, distinct from
  `INVALID_JSON_RESPONSE` (the body was not even parseable JSON), so the CLI
  error names the actual cause instead of calling every parse failure
  "invalid JSON."

## 9. Landing map

| Piece | Lands in / builds on |
| --- | --- |
| CLI families | `packages/agent-cli/src/agent-cli.ts` and `packages/agent-cli/src/commands/` |
| Wrapper injection | Computer launch wiring and the Agent-local proxy |
| Auth principal | Per-launch local proxy token; scoped runner credential remains inside Computer |
| Routes | Server `/api/agent/*` handlers and Computer proxy routing |
| Freshness and drafts | Server-owned delivery ledger plus Computer-local pending inbox state |
| Contracts | `packages/haus-api` OpenAPI and hosted Agent contracts |

## 10. Audited divergences from shipped Raft

All approved by operator ruling W1 (program contract, 2026-07-21).

| Divergence | Why |
| --- | --- |
| Server-held drafts (Raft: CLI tmpdir, 10-min TTL, client-supplied `seenUpToSeq`) | The runtime is the witness, the server is the record (W1a); ephemeral agent shells; haus.chat future. The program contract had described Raft incorrectly — holding server-side is our choice, not parity. |
| Before WS6 the CLI calls the co-hosted Runtime directly; WS6 adopts Raft's `CLI → localhost Computer proxy → hosted Server` path | A managed Agent receives only a local proxy token. The Computer may satisfy pending inbox reads locally and forwards with a scoped, per-launch runner credential that it mints and revokes through its Computer authority. |
| Handle rule owned by Haus (single token 1–32) | Raft's rule is not observable in the wire layer (npm schema caps at 60, no reserved list client-side); we define our own and say so. |
| Server-side list pagination on `server info` | We are designing the server API; Raft's client-side slicing is an artifact of its fat response. |
| Targets resolved per-action server-side; no client-visible `resolve-channel` two-step | Simpler wire contract; the two-step is a Raft-internal REST artifact. |
| `HAUSMSG` delimiter | Naming parity with `RAFTMSG` (current npm), ours. |
| Chat typing outside message sends | The Server derives typing from exact run visibility (ADR 0035); the CLI has no typing verb or composition id. |
| `attachment upload` takes no `--target` (Raft's does) | Upload is decoupled from posting; the message send carries `--attachment-id`, so an upload never implies a visible post (WS5). |
| Reminder and Trigger fires post no receipt in chat, and the Agent answers with `haus message send --cause <fireId>` | Not a divergence: Raft delivers a fire as a transient `msg=-` notice and a typed app inbox item, not a durable chat row, and the receipt sentence in its prompt was never corroborated. The divergence is `--cause`, which Raft has no equivalent of: a Haus answer names the exact fire it answers, and that provenance feeds the cause line and hover card (ADR 0026). |
| `reminder schedule` has no `--channel` anchor variant; its only non-message anchor is a Task (`--target task:KEY-n`) | The prompt teaches message anchors explicitly (anchorless reminders lose their context); Raft's `--channel` flag semantics are unverified in the wire layer (WS5). A Task anchor is Haus-owned ([ADR 0053](../docs/adr/0053-channels-and-tasks-are-the-only-places.md) decision 16). |
| `claim create` requires `--target` | Raft's surface listing omits it, but a stateless CLI cannot infer "the current channel"; unverified against live Raft (WS5). |
| Raft's `task` family is `haus claim`: the bare group claims, `release` is Raft's `unclaim`, and history and drain lines say `claim #N` / `claim=#N` | Haus keeps the word *task* for its Task product and calls the message lock a claim ([ADR 0051](../docs/adr/0051-tasks-are-boards-and-claims-are-the-lock.md)); behavior is unchanged. |
| `task` family is Haus-owned | Raft has no Task place; `haus task` is the Task of [ADR 0053](../docs/adr/0053-channels-and-tasks-are-the-only-places.md) (boards went with it), where Raft's `task` is Haus's `claim`. |
| `skill` family is Haus-owned | Raft has no skill verbs; family 9 replaces our retired `skills_*` engine tools (D5/W2). |

## 11. Manual cutover checklist (WS1)

Additive workstream — no data destruction. With the operator, live:

1. Assign handles: rename existing agents/channels/humans to valid unique
   handles (collisions resolved by hand; renames are permanent).
2. Mint agent tokens for existing agents on the dev runtime, then the mini.
3. Verify wrapper injection: in an agent turn shell, `haus` resolves to the
   wrapper, identity env is present, and another agent's token is not
   reachable.
4. Smoke in a temp chat (`Codex smoke <timestamp>: WS1`): one fresh send, one
   deliberate hold + `--send-draft` release, one `--anyway`; delete the temp
   chat and record ids.
5. Confirm `/api/agent/*` requires the agent token (runtime token and human AppSession
   sessions rejected).

## 12. Verification lane

Unit/service tests against real temp SQLite for: handle uniqueness +
resolution fail-closed, short-id ambiguity, draft lifecycle (hold, replace,
TTL, `--send-draft`, `--anyway`, rehold counts), seen-cursor advancement on
hold display, envelope/history formatting (golden lines), error-contract
rendering, auth-principal scoping. CLI parsing via the existing cli test
pattern. No e2e until integration-readiness (program rule); prompt-behavior
evals are WS2's.

Reminder scheduling may return `REMINDER_COMMAND_CONFLICT` or `REMINDER_FIRE_TIME_PASSED`; the CLI preserves their `Next action` guidance. Stable `--command-id` identifies identical canonical schedule input across retries. Changed revisions require a new id.

GitHub trigger refinements: `--match-repo`, `--exclude-repo`, `--actor`, `--exclude-actor`, `--exclude-branch`, `--exclude-workflow`, `--exclude-check-name`, `--exclude-environment`, and `--workflow-event`. Name filters accept `*`, `**`, and `?`; branches accept `@default`. `--events-json` replaces event/filter flags with up to ten typed OR groups. `trigger update --id` edits title/instruction alone or replaces complete GitHub config with scope and groups. `trigger preview --id --event --payload-file` checks a raw webhook sample without firing. See `specs/github-triggers.md` and `docs/api/triggers.md`.
