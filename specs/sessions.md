# Sessions

One agent owns one persistent harness session spanning every chat it
participates in. Chats and threads are routing and presentation surfaces —
never session boundaries. Different agents are fully isolated. Normative per
[ADR 0011](../docs/adr/0011-agents-own-one-global-session.md) as amended by
[ADR 0014](../docs/adr/0014-cli-is-the-agents-only-output-channel.md);
delivery, cursors, and notices in [inbox.md](inbox.md).

## Product boundary

- `Chat` is the durable conversation container.
- `Agent seat` is one agent's stable participation in one chat: membership,
  addressing, authorship. Seats do not own sessions.
- `AgentSession` is the agent's current global execution context: one active
  session per agent, backed by opaque engine resume state.
- `AgentTurn` is one execution inside the session, anchored to the session
  itself (floating, I1) — never to a chat. A turn's output is whatever the
  agent sends through the `haus` CLI; there is no reply delivery.

## Attention

- One turn at a time per agent, across all chats. A seat is busy exactly
  when its agent is busy.
- An idle wake starts one notice-only turn; a busy Agent receives the same
  content-free notice in its live turn. Bodies remain Computer-local until an
  explicit pull. Chain budgets follow model-visible Agent traffic
  ([inbox.md](inbox.md)).
- A settled Cloud Agent Run is the typed concrete exception: the Agent that delegated
  it gets a distinct continuation carrying the Run's status, summary, and branches. A
  busy Agent receives only the notice at the safe boundary and gets the concrete item on
  the next turn. The item has no Chat cursor or visible Chat receipt.
- A fresh session with no pending delivery starts with bare `Start.`. After a
  reset, the recovery line precedes either `Start.` or the pending notice/typed
  attention that becomes the first prompt. Creating an Agent configures its
  executor but never schedules an empty bootstrap turn. Startup never races a
  second mid-turn delivery.
- Stop interrupts the live turn and persists the Agent's stopped lifecycle state. New messages and
  reminders continue to accumulate in its inbox but cannot wake it. A human Start resumes the
  current session and offers pending work again.

## Cursors

The exact-visibility ledger plus a verified contiguous seen boundary per (session, target) is
specified in [inbox.md](inbox.md). `seen` is the sole model-seen authority;
the freshness gate lives on the CLI send path exactly once
([haus-cli.md](haus-cli.md) §6).

## Rotation and reset

Sessions never rotate because of age or idleness. A new session starts only on:

1. **Execution runtime or model switch** — the Agent's execution configuration is Agent-scoped; a change takes
   effect on the next turn with a fresh session. Workspace, memory, and
   identity persist.
2. **Resume recovery** — if the executor reports that its stored runtime session is missing or
   replay is rejected, Computer automatically starts a fresh Agent session generation. The recovery
   is visible in activity and injected into the fresh context, directing the Agent to recover from
   Haus history and local `MEMORY.md`/notes. If the cold start also fails, the Agent becomes
   offline with an error.
3. **Manual lifecycle action** — human-initiated, agent-scoped, in the agent profile:
   - *Restart:* restart the executor and resume the current session unchanged.
   - *Session reset:* fresh context; workspace, `MEMORY.md`, and skills persist.
   - *Full reset:* fresh context plus a wiped workspace, including `MEMORY.md`;
     Agent-authored skills and runtime-local state are also wiped. Computer then
     restores the persisted Agent kind's factory workspace and current
     factory-managed skills: minimal memory for an ordinary Agent, Cove's exact
     onboarding seed for Cove, and only `visuals` today.
   Session reset and Full reset rotate the agent token. Restart does not.

Reasoning-effort changes apply on the next turn without rotating the session, except Grok Build:
its ACP adapter includes effort in resume compatibility and requires a fresh session. The active turn
keeps its frozen effort. Computer restarts the parked native process with the saved resume state
and the latest effort, preserving conversation context while refreshing constructor-only settings.

Managed instruction, Cove factory-guidance, or Harness bootstrap drift does not rotate the session.
The AI SDK Harness supplies current composed instructions on every accepted turn. Bootstrap drift or
an explicit Restart additionally parks the adapter, installs the current bootstrap, and resumes the
same native conversation. A recognized prior Cove playbook or FAQ revision is replaced before the
turn and the current session receives a one-turn re-read notice; edited or missing guidance is
preserved as a conflict. Applied fingerprints persist only after the refreshed turn successfully
successfully detaches. Activity History records refresh outcomes without instruction text or local implementation
details. An interrupted turn, bootstrap failure, or turn failure keeps the previous fingerprints
and generation for retry. Only
rejection of stored native resume state uses Server-authorized recovery.

Haus Agent SemVer is the public release receipt layered over those exact fingerprints and managed
factory inputs. A version change uses the same in-place, next-turn refresh path. It becomes current
only after successful detach; failure preserves the prior applied version and is visible in the
Agent profile and Activity History.

Long-horizon continuity across resets comes from engine-native compaction
and the agent's workspace MEMORY.md ([ADR 0014](../docs/adr/0014-cli-is-the-agents-only-output-channel.md)).

## Generation in the transcript

Every rotation is durable. `agents.session_generation` is the current generation,
and one `agent_session_rotations` row records each rotation: the Agent, the
generation it started, when it started, and why — a runtime or model switch,
resume recovery, a session reset, or a full reset. Consecutive rows bound the
generation between them, which is how long the previous session lasted.

The Server stamps the sending run's generation on every Agent message
(`ChatMessage.sessionGeneration`, null for a human). A rotation writes nothing to
any Chat (ADR 0026); the transcript learns about it from the stamp it already
carries.

The App derives the **session mark** from that stamp alone: in one Chat's
transcript, an Agent message carries the mark when its `sessionGeneration`
differs from that Agent's previous message in the same Chat. So the mark lands on
the first thing an Agent says in a Chat after a reset, once per Chat per
generation, and never on a rotation the Agent never spoke after. It renders in the
message header in the session color, after a fire mark when a message carries both
([automation-provenance.md](automation-provenance.md)). Hovering it reads the
rotation record — "New session", when, why, and how long the previous session ran
— through `agent.sessionInfo({ serverId, agentId, generation })`, and links to the
Agent's Activity tab, which holds the full history behind the mark.

## Knowledge and discretion

The agent's knowledge is its own: anything learned in any chat may inform
any other. There are no trust domains. The prompt teaches discretion — what
was shared in a DM was shared with the agent, not with every room; don't
volunteer private specifics elsewhere. Hard isolation is a separate agent.
Multi-human norm: don't tell an agent what you wouldn't tell everyone who
can talk to it.

## Non-goals

- No per-chat model overrides.
- No context forking for threads; harness subagents remain an engine
  execution detail, not a session contract.
- No migration shims: cutover starts every agent on a fresh global session.
