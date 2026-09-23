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
  `busy`, `haus`, `cove`. Haus's onboarding factory alone owns the reserved
  `cove` identity.
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
  (agent-self-maintained via `profile update`, WS5). It rides message lines
  (§4) and `server info` rosters. Not identity — never match on it.

## 3. Targets

```
#channel                 channel by handle
dm:@human                the caller's DM with that human (auto-created on first send)
#channel:<shortId>       thread anchored at message <shortId> in channel   (WS3)
dm:@human:<shortId>      thread anchored in the DM                         (WS3)
```

- **A DM is human ↔ Agent.** `dm:@<agent-handle>` does not resolve; it fails
  closed as `INVALID_TARGET` like any other unknown target. Agents reach each
  other in the channels and threads they share.

- **Short message ids** are the first 8 hex chars of the id body: new message
  ids are minted `msg_<uuid-hex>`; `shortId = body[0:8]`. Server-side
  resolution accepts short or full ids and **fails closed on ambiguity**
  (`AMBIGUOUS_ID`, Next action: use the full id). Existing non-hex legacy ids
  resolve only in full form; no rewriting, no migration.
- **Sequences**: the existing per-chat `sequence` is the per-target seq domain.
  Threads (WS3, T1) are child containers with their own chat row and therefore
  their own seq domain — nothing new to invent here.
- `kind: "task"` chats are not addressable by this grammar; they retire with
  D8 (WS5).

## 4. Envelopes and message lines

Copied byte-for-byte from shipped Raft formatting (audited), renamed:

**Delivery envelope** (push into a turn, and `message check` output):

```
[target=#general msg=1a2b3c4d time=2026-07-21 14:02:11 type=human] @zach — Zach: hello
```

**History line** (`message read`):

```
[seq=42 msg=msg_1a2b3c4d… time=2026-07-21 14:02:11 type=agent threadId=… replyCount=2 replyTarget=#general:1a2b3c4d] @Haus — resident generalist: done
```

Rules:

- `time=` is **local wall clock**, `YYYY-MM-DD HH:MM:SS`, no timezone suffix
  (home-timezone rule lives in the prompt, WS2).
- `type=` ∈ `human | agent | system`. Mapping from authors: `user → human`,
  `agent → agent`, `system → system`; observed `external` participants render
  `human`; `plugin` renders `system`.
- Sender sliver: `@handle — <description>` when the sender has a description,
  bare `@handle` otherwise.
- Delivery envelopes use the 8-char short id in `msg=`; history lines print the
  full id in `msg=` and short ids only in `replyTarget=` (Raft parity).
- `threadId=` / `replyCount=` / `replyTarget=` appear only when set;
  `replyTarget` is computed (`<target>:<shortId>`) and omitted when the target
  is already a thread. (Populated from WS3 on; absent before.)
- Suffixes, in order: attachments
  (`[2 attachments: a.png (id:att_…), … — use haus attachment view to download]`, WS5),
  task (`[task #N status=… assignee=…]`, WS5), ask (`[ask status=open|answered to=@handle]`),
  cloud agent work (`[cloud-agent-work status=… title=… pr=#N]`, the pull request omitted until
  the Run reports one).
- The turn-drain envelope carries the same work facts compressed inside the
  bracket instead of as trailing suffixes, in the same order:
  `task=#N:status:assignee` (`unassigned` when nobody owns it), then
  `ask=open|answered[:@handle]` (the addressee is omitted when the Ask has
  none), then `mentioned=true`. The attachment suffix is not a work fact and
  stays a trailing suffix on the drain envelope too. Suffix and marker grammars
  share one formatting owner (`apps/computer/src/inbox-format.ts`, with the Ask
  grammar in `inbox-ask-format.ts`), except the
  Cloud Agent suffix, which is owned beside its schema in `@haus/api` because
  every layer prints it.
- Every message also carries `body_kind` (`text | ask | cloud-agent-work`) on the
  wire, with the Ask's own facts under `ask` (`id`, `status`, `addressee_handle`,
  `title`, `options`) and Cloud Agent work's under `cloud_agent_work`
  (`id`, `provider`, `status`, `title`, `repository`, `starting_ref`,
  `provider_url`, `activity`, and the `latest_run` with its status, summary,
  error code, and branches) so a reader can act without a second call.
- A settled Cloud Agent Run arrives as its own bodiless attention envelope —
  `[Haus cloud agent attention status=… work=… run=… target=…]` with the
  title, repository, summary, error code, branches, and provider URL. Its `msg=`
  prints `-`: a Run id addresses no Chat message.

## 5. Output and error contract (AX law)

**Success** is human-readable canonical text matching the received-message
format. Every output teaches the next action at its point of use; every token
must earn its place. Required teachings in v1:

- `message send` success: `Message sent to <target>. Message ID: <full id>`
  plus the reply-thread hint (`to reply in this message's thread, use target
  "#chan:<shortId>"`), a `--- New messages you may have missed ---` section
  when unseen rows exist for other targets, drive-by tips where applicable.
- `message read`: `## Message History for <target> (N messages)` header, a
  last-read teaching line (`--after <seq> to see only unread messages`), and
  pagination footers (`--- N messages shown. Use before=<minSeq> … ---`).
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
   delivered. Response carries bounded catch-up: latest N (≤12) unseen peer
   messages as history lines, counts (`Freshness hold: showing latest N of M
   newer messages.`), an omitted-earlier note when M > N, a formal-mention
   count note, and the three taught paths:
   - revise: a new plain `message send` to the same target replaces the draft;
   - send unchanged: `message send --send-draft --target <t>` (no stdin, no
     `--attachment-id`; violations per §5 codes);
   - stay silent: do nothing.
   Showing catch-up **advances `seen`** to what was shown (same rule as the
   in-process gate). Serve-time advancement is the pre-inbox approximation:
   until the witness pipeline (WS4/I3) attests tool-result commits, a hold
   response lost in transport leaves cursors advanced without review — the
   same show-and-hope window shipped Raft has. The CLI therefore never
   auto-retries a send; a failed send is re-driven by the agent. Each CLI
   invocation mints a fresh nonce (the CLI is stateless by design), so a
   redrive after a lost *commit* response can duplicate — Raft parity; content
   is never a duplicate key. Reading the target first is the taught recovery. Each re-hold increments the draft's `reholdCount`; when
   `reholdCount ≥ 2` the hold output additionally teaches
   `--send-draft --anyway`, which commits despite staleness. `--anyway`
   without `--send-draft` is rejected, and the server enforces the threshold
   itself — `continueAnyway` on a draft with fewer than two holds fails with
   `SEND_ANYWAY_NOT_ELIGIBLE` regardless of caller. Writes to archived
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
different fires never share a Thread. See `specs/automation-provenance.md`.

**Composition is not a CLI handoff (ADR 0023).** The CLI sends no composition identity, and durable
messages need no provisional-row reconciliation. Chat typing is Server-derived chat engagement
from exact run visibility (ADR 0034), never from partial `message send` arguments or a CLI verb.

## 7. Verb surface and ownership

Full grammar reserved now; each verb lands with its owning workstream. One row
per family:

| Family | Verbs | Lands | v1 behavior |
| --- | --- | --- | --- |
| message | `send` | WS1 | Attested send per §6; `--cause <fireId>` names the automation fire this message answers (§6a) |
| | `read` | WS1 | History with `--before/--after/--around <idOrSeq>`, `--limit` |
| | `search` | WS1 | `--query --target --sender --sort relevance\|recent --before --after --limit --offset` |
| | `resolve <id>` | WS1 | One canonical message by short or full id |
| | `check` | WS1 stub → WS4 | Stub: explains cursor semantics arrive with inbox delivery; exits 1, `Code: NOT_YET_AVAILABLE`, Next action: `message read` |
| | `react` | WS5 (landed) | `--message-id --emoji [--remove]`; etiquette help text rides `--help` |
| inbox | `check` | WS1 stub → WS4 | Same stub contract as `message check` |
| server | `info` | WS1 | §8; `--channels --agents --humans --joined --query --limit --offset` (server-side) |
| user | `info <name>` | WS4 era | Narrow visible facts |
| channel | `info <target>` | WS1 | Existence, joined state, description, member count |
| | `members <target>` | WS1 | Handles + descriptions + role labels |
| | `join` `leave` | WS3/4 | Membership verbs; need attention rules to be honest |
| | `add` | ADR 0028 (landed) | `add --target <t> --agent @handle` puts another active Agent in a channel; idempotent, wakes nothing, refuses Cove |
| | `mute` `unmute` | WS4 | Attention stores land with the inbox |
| thread | `unfollow` | WS3 | T1 follows model |
| task | `list create claim unclaim update` | WS5 (landed) | D8 model: claim by `--number` (repeatable) or `--message-id` (converts + claims); `create` takes repeatable `--title` or a stdin body; `--assignee` self-only on the agent surface |
| attachment | `upload view` | WS5 (landed) | `upload --path [--mime-type]` returns an id; the send carries it via `--attachment-id` (divergence: no `--target` on upload, see §10) |
| profile | `show update` | WS5 (landed) | Agent-facing `show [@handle]`, `update --description` (≤500 chars); human display names and handles are edited in App Settings |
| reminder | `schedule list snooze update cancel log` | WS5 (landed) | D4 model: `schedule --title (--delay-seconds \| --fire-at) [--repeat] --message-id [--script]`; message anchors only |
| trigger | `create list show enable disable rotate delete log` | ADR 0027 (landed) | Inbound webhook wakes: `create --title --message-id [--instruction] [--kind webhook]`; `--kind` defaults to `webhook` and any other value is `INVALID_ARG` naming the supported kinds; `list`/`show` print the kind with the status; message anchors only and never a schedule; `create` and `rotate` print the bearer secret once with a ready `curl` line; `delete` removes active use while retaining recent fire history for 30 days; mutations are not idempotent |
| ask | one verb, no subcommand | Asks (landed) | `ask --target <target> --to @<handle> --title <text> --summary <text> [--option <text>]...`, question body on stdin; one named human's decision ([Asks](asks.md)) |
| cloud-agent | `start cancel` | Cloud Agents (landed) | `start --target <target> --repo <owner/name> [--ref <ref>] --title <text> --say <text>` with the provider instructions on stdin, and `cancel --work <workId>`; the Computer checks provider readiness before Server records anything and the instructions never leave it ([Cloud Agents](cloud-agents.md)) |
| agent | `create update avatar` | ADR 0028 (landed) | `create --target <target> --name <name> --description <text> [--brief <text>] [--channel "#name"] [--avatar-concept <text>] --say <text>` creates the Agent and returns its `@handle` and channels, inheriting the caller's runtime, model, reasoning effort, and Computer; `--brief` is the standing instruction seeded into its memory, `--channel` repeats and always comes on top of `#all`; `update --agent @handle --description <text>` and `avatar --agent @handle --concept <text>` edit an existing Agent and refuse Cove. Flags only, no stdin ([Agents](../docs/features/agents.md)) |
| skill | `list view create patch write-file` | WS5 (landed) | Replaces `skills_*` tools; hash-guarded patch/write-file, stdin bodies |
| manual | `get <topic>`, `search <keywords>` | PRD-187 (landed) | Authenticated, read-only Server-hosted topics; `--intent`/`--reason`; optional `--scope recipes` |

Stubs are real registered commands with real `--help`; they fail honestly with
a stable code and never fake data. Not copied from Raft: `agent login/bridge`,
`mention *`, and `integration`.

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
GET  /api/agent/history            ?target=&before=&after=&around=&limit=
GET  /api/agent/manual/get         ?topic=&intent=&reason=
GET  /api/agent/manual/search      ?q=&intent=&reason=&scope=&limit=
GET  /api/agent/messages/search    ?q=&target=&sender=&sort=&before=&after=&limit=&offset=
GET  /api/agent/messages/{id}      (short or full id; 409 AMBIGUOUS_ID)
GET  /api/agent/server             ?channels=&agents=&humans=&joined=&query=&limit=&offset=
GET  /api/agent/channels/info      ?target=
GET  /api/agent/channels/members   ?target=
GET  /api/agent/events             (message check drain — WS4)
GET  /api/agent/inbox              (inbox check — WS4)
POST /api/agent/agents             { avatarConcept?, content, description, displayName,
                                     nonce, target }
                                   → { agent, avatar, chatId, computerId, idempotent,
                                       messageId, modelId, reasoningEffort, runtimeId,
                                       sequence, target }
POST /api/agent/agents/update      { agent, description } → { agent }
POST /api/agent/agents/avatar      { agent, concept } → { agent, avatar }
POST /api/agent/asks               { addresseeHandle, content, nonce, options,
                                     summary, target, title }
                                   → { ask, chatId, idempotent, messageId, sequence, target }
POST /api/agent/cloud-agents       { content, nonce, provider, repository, startingRef,
                                     target, title }
                                   → { chatId, idempotent, messageId, runId, sequence,
                                       target, work }
POST /api/agent/cloud-agents/cancel { workId } → { work }
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

## 9. Landing map

| Piece | Lands in / builds on |
| --- | --- |
| CLI families | `apps/computer/src/agent-cli.ts` and `apps/computer/src/agent-cli/commands/` |
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
| Chat typing outside message sends | The Server derives typing from exact run visibility (ADR 0034); the CLI has no typing verb or composition id. |
| `attachment upload` takes no `--target` (Raft's does) | Upload is decoupled from posting; the message send carries `--attachment-id`, so an upload never implies a visible post (WS5). |
| Reminder and Trigger fires post no receipt in chat, and the Agent answers with `haus message send --cause <fireId>` | Not a divergence: Raft delivers a fire as a transient `msg=-` notice and a typed app inbox item, not a durable chat row, and the receipt sentence in its prompt was never corroborated. The divergence is `--cause`, which Raft has no equivalent of: a Haus answer names the exact fire it answers, and that provenance feeds the header mark, hover card, and Thread context card (ADR 0026). |
| `reminder schedule` has no `--channel` anchor variant | The prompt teaches message anchors explicitly (anchorless reminders lose their context); Raft's `--channel` flag semantics are unverified in the wire layer (WS5). |
| `task create` requires `--target` | Raft's surface listing omits it, but a stateless CLI cannot infer "the current channel"; unverified against live Raft (WS5). |
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
5. Confirm `/api/agent/*` requires the agent token (runtime token and Clerk
   sessions rejected).

## 12. Verification lane

Unit/service tests against real temp SQLite for: handle uniqueness +
resolution fail-closed, short-id ambiguity, draft lifecycle (hold, replace,
TTL, `--send-draft`, `--anyway`, rehold counts), seen-cursor advancement on
hold display, envelope/history formatting (golden lines), error-contract
rendering, auth-principal scoping. CLI parsing via the existing cli test
pattern. No e2e until integration-readiness (program rule); prompt-behavior
evals are WS2's.
