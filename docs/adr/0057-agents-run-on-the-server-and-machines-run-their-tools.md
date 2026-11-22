---
status: accepted
summary: An Agent's loop runs on the Server in a sandboxed runner, on the Claude Agent SDK for Claude plans and Pi Durable for every other model, with sessions on the runner's persistent volume. Each Agent is pinned to one harness, and the first harness ships before the second. The Agent has one home Computer, where its workspace lives and its tools run by default; amended 2026-11-22, every machine tool call may target any Computer that allows that Agent, through one per-Computer Agent access list that generalizes the computer use Captains list, and the Agent finds its Computers with `haus computer list`. Moving the home ships later. Its tools are bash and edit, the haus CLI run by the runner, and the one execute tool. Every invocation has an id, is recorded as accepted before it runs, and never reruns after an unknown outcome; an offline machine answers at once. Model logins are configured in the App and held encrypted by the Server, several per provider. Inbox items go to the runner. Workers keep native harnesses on machines. User-configured local MCP is descoped, and computer use ships later. Accepted 2026-11-19, not yet implemented.
read_when:
  - changing where an Agent's loop runs, its harnesses, or where its session is stored
  - changing the Agent's machine, moving an Agent, or what an Agent can do while its machine is offline
  - changing which Computers an Agent's tool calls may target, a Computer's Agent access list, or `haus computer list`
  - changing the Agent's tools, the invocation contract, timeouts, offline answers, or the Computer result ledger
  - changing which harness an Agent runs on, or resetting an Agent's session
  - changing who holds model logins for Agents or Workers
  - changing agent-desktop, agent-browser, computer use, or local MCP support
  - changing the Computer protocol, prompt composition, or the runtime drivers
---

# ADR 0057: Agents Run on the Server, and Machines Run Their Tools

## Status

Accepted 2026-11-19. Not yet implemented. Amended 2026-11-19 by the runtime contract
([specs/runtime-drivers.md](../../specs/runtime-drivers.md), [specs/mcp.md](../../specs/mcp.md))
in decisions 2, 5 and 12: a reset builds no briefing, the `haus` CLI runs on the runner instead
of behind `execute`, the tool shapes are named, and the cutover waits for both harnesses, resets
every session, and ends sub-agents and background shells. Amended again 2026-11-19 by R6 in
decisions 2 and 8: model logins are configured in the App and held encrypted by the Server, with
several connections per provider ([specs/model-connections.md](../../specs/model-connections.md)),
not runner settings with no sign-in screens. Amended 2026-11-22 in decisions 4, 5, 6 and 10 to
adopt Capy's device model: an Agent keeps one home Computer, and each machine tool call may
target any Computer that allows that Agent. Part of the direction in
[the Capy and Amp proposal](../proposals/capy-product-model.md), with
[ADR 0054](0054-drive-holds-what-agents-know-and-follow.md) (Drive),
[ADR 0055](0055-projects-own-agents-and-tasks.md) (Projects) and
[ADR 0056](0056-agents-run-quiet-workers-anywhere.md) (Workers). Amends
[ADR 0011](0011-agents-own-one-global-session.md),
[ADR 0019](0019-servers-own-collaboration-computers-own-execution.md), ADR 0054 and ADR 0056.

## Context

Each Agent's session runs on one Computer today. A Haus driver spawns a vendor CLI there (Claude
Code, Codex app-server or Grok Build), and the conversation lives in that CLI's own store on that
disk ([specs/runtime-drivers.md](../../specs/runtime-drivers.md)). If the machine sleeps, crashes
or runs out of memory, the Agent stops. Moving an Agent means losing its session.

Capy and Amp both run the agent loop on their servers and use machines only to run tools. Amp
moved there in its May 2026 rebuild. Both run the Claude Agent SDK on their servers for Claude
plans, with their own tools bridged in. Haus wants the same durability without owning a general
agent harness: it owns the home (Drive, Projects, Workers, the conversation) and rides maintained
loops.

**Added 2026-11-22.** Every Agent tool call routes to the Agent's own Computer
(`agents.computer_id`). A person asked an Agent for a screenshot of their MacBook, and the call
went to the Mac mini, where all nine Agents live. The MacBook was attached with computer use on, and no
Agent could reach it. Capy keeps a home machine per thread and lets one tool call go to another
device: "Every connected computer is a machine that any of your threads can use"
([Capy Desktop](https://capy.ai/blog/capy-desktop)).

## Decision

1. **An Agent's loop runs on the Server**, in a sandboxed runner process. The runner has its own
   container, no database credentials and no Server secrets, and reaches Haus only through a
   scoped API.

2. **Two harnesses.** The Claude Agent SDK runs Claude plans, with a setup-token, its native tools
   off, and Haus tools bridged in. Pi Durable runs every other model, including ChatGPT plans and
   other providers. Each keeps its sessions in its own native storage on the runner's persistent
   volume, which is backed up with the Server's data. Rebuilding from Drive is the fallback only
   when a restore is impossible. The session never moves: only the Agent's machine does, so it
   only has to survive the runner restarting. Each Agent is
   pinned to one harness. Switching harness is an explicit reset: a fresh session from Drive's
   current rules and memory, with no constructed briefing (ADR 0011). The Agent reads recent
   history itself. Model logins are configured in the App and held by the Server (decision 8).

3. **One endless session per Agent.** ADR 0011 stands. The session now lives on the Server, not on
   a Computer. The Server delivers inbox items to the runner.

4. **An Agent has a home Computer, and its tool calls reach any Computer that allows it.**
   (Amended 2026-11-22. It said: one machine where its tools run, a setting changed while idle,
   with nothing carried over.) A machine is a Computer or a Haus-hosted cloud machine, and v1
   supports Computers only.
   - **Home.** Each Agent has one home Computer (`agents.computer_id`). Its workspace and `drive/`
     folder live there, and it is the default target of every machine tool call. The home is the
     Computer the Agent was created on.
   - **Moving the home ships later.** Move to device, Capy's "Continue on", changes the home while
     the Agent is idle. What it carries over is decided when it ships; Capy carries the branch and
     uncommitted work. It is not part of this amendment's first release.
   - **Target.** Every machine tool call takes an optional target Computer: `bash`, the edit
     tool, and the machine operations behind `execute` (agent-browser and `desktop`). Without one,
     the call runs on the home. Each invocation records its target in
     `agent_invocations.computer_id`, which already holds the Computer it was routed to. The
     target changes nothing else: the session, the turn and the conversation stay on the runner.
   - **Off the home.** On another Computer, `bash` and edit start in the machine user's home
     directory unless the call names a working directory. That Computer holds no workspace and no
     `drive/` folder for the Agent.
   - **Who may target what.** A Computer's stewards decide which Agents may run tools on it: its
     attacher, Owners and Admins, the same people who change computer use today. The list is
     All Agents (including ones added later) or named Agents, and the Computer's home Agents are
     always allowed. It is the computer use Captains list (`computer_use_scope`) generalized: it
     leaves the computer use switch and gates every invocation kind. A new Computer allows its home
     Agents only. Computer use stays a separate switch on top, so a `desktop` call needs both.
   - **The trust this grants.** An allowed Agent runs commands as that Computer's machine user,
     with that user's logins, like a Worker there
     ([ADR 0056](0056-agents-run-quiet-workers-anywhere.md) decision 7). Anyone who can message
     the Agent can reach the Computer through it.
   - **Refusals stay immediate and cause-specific.** The Server answers them without sending
     anything: no such Computer (`not-found`), offline (`offline`), and not allowed
     (`not-listed`, now for every invocation kind). A `desktop` call can also be refused as `off`,
     `not-mac` or `not-ready`, and the Computer's screen preflight still reports `locked`,
     `no-session` and `switched-out`. The refusal names the Computer's attacher, as computer use
     refusals do.
   - **Discovery is the CLI.** `haus computer list` shows each Computer on the Server: its id,
     name, whether it is online, its OS, whether this Agent is allowed, whether computer use is on
     for this Agent, and which one is home. A Manual topic teaches targeting. The system prompt
     lists no Computers.
   - **Naming.** Contracts and Agent-facing text say Computer, and the UI says Device
     ([ADR 0058](0058-the-ui-uses-capy-names.md)). In replies an Agent names a machine by its name
     ("the MacBook"), and keeps internal words such as session, invocation and runner out of what
     it says.

5. **The Agent's tools.** `bash` and an edit tool run on the home Computer, or the call's target
   (decision 4), through the invocation contract, in the shapes the models are trained on: `bash`
   and `str_replace_based_edit_tool` for Claude and every other non-GPT model, `shell`,
   `apply_patch` and `view_image` for GPT models. Each shape gains one optional target field
   (amended 2026-11-22). They are built from Pi's MIT tool code, and the patch grammar from OpenAI
   Codex's Apache-2.0 parser, each marked with its source. Haus actions are the `haus` CLI, which
   the runner runs itself when a shell command is one `haus` invocation, so they never need a
   machine and take no target. Everything else sits behind the one `execute` tool: Server-held
   remote MCP, which needs no machine, and agent-browser and agent-desktop relayed from the home
   or the target Computer. Skills load from Drive.

6. **A machine offline is not an Agent offline.** A tool call to an offline Computer answers
   "offline" at once, so the turn never stalls. The Agent still talks, plans, uses Drive through
   the Server, dispatches Workers, and (amended 2026-11-22) runs tools on any other online
   Computer that allows it.

7. **Every tool invocation has an id.** The Computer records a call as accepted before running it,
   and keeps its result in a ledger, so a call whose acknowledgement was lost never runs twice. A
   crash mid-command leaves the outcome "unknown", and Haus never reruns it on its own. Commands
   have timeouts, cancellation and output limits.

8. **The Server holds the Agent's model logins, configured in the App.** A person connects them in
   Settings → Models: a Claude plan by pasting a setup-token, ChatGPT and SuperGrok plans by
   device-code sign-in, and API keys for xAI, Gemini and OpenRouter. Each provider can hold several
   named connections, and each Agent uses one, defaulting to the first, so Agents can be spread
   across accounts as they are across Computers today. The Server stores them encrypted at rest and
   sends them to the runner, which keeps them in memory only and never reads its environment or
   disk for a login.

9. **Workers keep the harness on the machine.** A Worker runs native Claude Code or Codex on a
   Computer with that machine's logins, or runs on a cloud service
   ([ADR 0056](0056-agents-run-quiet-workers-anywhere.md)). A dead machine is a failed Worker.

10. **The runner composes each turn from Drive.** It reads rules and memory from the Server's
    current revisions. Each Agent keeps a plain `drive/` folder on its home Computer, pulled at turn
    start and pushed after the reply ([ADR 0054](0054-drive-holds-what-agents-know-and-follow.md)). Prompt
    composition moves from the Computer to the runner.

11. **Built-in machine tools only.** agent-browser is built in and managed by Haus. agent-desktop
    and a per-Computer "Computer use allowed" switch, which decides whether Agents may operate its
    apps, ship in a later phase.
    User-configured local MCP servers are descoped. If they return, they follow Capy: a launch
    recipe in Project settings, run on the working machine, with availability shown per Computer.

12. **Ship order.** Tasks (landed), then minimal Drive, then Agents move to the runner, then
    Projects, then Workers, then computer use (agent-desktop). The runner
    ships with one harness, and the second follows once tool dispatch works. Both are in place
    before Agents move in one cutover that resets every session, and no Agent stays on a
    Computer after it. Sub-agents and background shells end with the cutover, and Workers take
    over parallel and long work.

## Considered and rejected

- **Sessions in Postgres** (Pi through a Haus storage backend, the SDK through its session storage
  adapter). It only pays off with several runners sharing storage. The SDK adapter mirrors on a
  best-effort basis, and both need adapter code. Revisit if Haus runs more than one runner.

- **The harness on the Agent's machine.** A machine that sleeps, crashes or runs out of memory
  takes the Agent with it. Amp moved away from this in its rebuild, and Capy's team describes an
  agent bricked when its VM ran out of memory.
- **Codex app-server for non-Claude models.** It is built to run its own tools locally. Turning off
  its built-in tools is unverified, `dynamicTools` is experimental, and it serves only OpenAI
  models.
- **Writing a Haus agent loop.** Haus owns the home, not the loop. Pi Durable is a maintained,
  widely used loop.
- **A per-Agent sandbox with the harness inside.** It is not Capy's split, and the loop shares a
  machine with heavy work.
- **Some Agents on Computers and some on the Server.** Two runtime paths to keep working, and no
  final state.
- **Both harnesses in the first release.** Twice the debugging surface before remote tool dispatch
  is proven.
- **Rerunning a command after an unknown outcome.** Shell commands are not idempotent, so a blind
  replay can repeat a side effect.
- **Carrying a session across harnesses.** Their native stores are incompatible, so a switch starts
  fresh from Drive.
- **Moving an Agent's checkouts and processes with it.** Moving machine-local state is its own
  feature. Workers reach other machines today.

Added 2026-11-22, for tool calls that target another Computer:

- **Any Computer on the Server, with no list.** Channels are open, so anyone could reach anyone's
  laptop as its machine user through any Agent. The attacher has to say yes.
- **Desktop only.** It fixes the screenshot, but "run this on my MacBook" still fails. Capy sends
  every tool through the same path to every machine.
- **Moving the home to reach another Computer.** It is not built, it moves the workspace for one
  call, and the Agent can only be on one Device at a time.
- **A Worker on the other Computer.** Workers carry long work. A screenshot is one tool call.
- **A separate list for computer use, beside the access list.** Capy's Device carries both
  `agentAccess` and `computerUseAccess`. Two lists per Device are two things for a person to keep
  straight; the switch plus one list covers the reported need. See open questions.
- **Computers in the system prompt.** Online state changes the prompt between turns and breaks its
  cache. The list is a CLI answer, taught by the Manual.

## Prior art

- **Amp** runs the loop and model inference on its servers. Machines only execute tools.
  - Its CEO: the "main agent loop can" be durable, while tool executors cannot.
  - Its May 2026 rebuild put agent loops "in durable execution".
- **Capy**: "the machine is only where the tools execute."
  - A thread moving to a device keeps its "agent loop" running "in the same place".
  - The Claude Agent SDK runs server-side only "for claude code subs".
  - Its tools are bridged in.
  - Each thread or Captain has a home machine, a cloud VM or a paired device, and a tool call can
    go to another device: "the agent sends the call to your device instead of its own VM"
    ([Capy Desktop](https://capy.ai/blog/capy-desktop)).
  - Its Device record carries `agentAccess` and `computerUseAccess`, each with grant, deny and
    revoke endpoints. Its model tools include `machine_list`.
  - "Continue on" is a separate handoff
    (`POST /jams/:jamId/handoff {destination: "cloud" | {device, into?}}`) that moves the branch
    and uncommitted work and ends the turn.
  - How a tool call names its target device is not in the research. The wire to a device
    (`POST /v1/invocations {invocationId, handler, params, cwd?}`) has no machine field, because
    the server already chose the device's tunnel.
- **The council** (Codex and Gemini) raised three points this ADR adopts:
  - the privilege boundary around a Server-side harness
  - the invocation ledger
  - owning the home rather than the loop

## Consequences

Amended:

- [ADR 0011](0011-agents-own-one-global-session.md): one global session stands, stored on the
  Server and run by the runner.
- [ADR 0019](0019-servers-own-collaboration-computers-own-execution.md): Computers own tool
  execution and Workers. They no longer run Agent sessions.
- [ADR 0054](0054-drive-holds-what-agents-know-and-follow.md): the runner composes the prompt and
  reads Drive from the Server. Each Agent keeps a `drive/` folder on its machine, pulled at turn
  start and pushed after the reply.
- `specs/inbox.md`: the Server delivers inbox items to the runner, not a Computer.
- [ADR 0056](0056-agents-run-quiet-workers-anywhere.md): Workers keep machine logins and native
  harnesses. The Agent's runtime and tools live here.
- [specs/computer-use.md](../../specs/computer-use.md) (2026-11-22): the Captains list becomes
  the Device's Agent access list and gates every invocation kind. A named entry may be any Agent
  on the Server, not only one whose home is this Device. The trigger on `agents.computer_id` that
  drops a named entry goes, since a home Agent is allowed without one.
- [specs/runtime-drivers.md](../../specs/runtime-drivers.md) (2026-11-22): the Route step
  resolves the call's target, or the home, then checks the access list. The tool shapes gain the
  target field.

Changed capability (2026-11-22): computer use can no longer be limited to some of a Device's home
Agents. With the switch on, every Agent allowed on the Device may use it. Moving each existing
Captains list to an empty named list keeps every Device's reach as it is (home Agents only), and
widens only a named computer use list to all home Agents.

Deleted:

- Agent sessions on Computers, and the per-Computer Agent session store.
- Grok Build as an Agent runtime. Grok models stay reachable through Pi's xAI provider. Grok Build
  as a Worker runtime is deferred; v1 Workers run Claude Code or Codex
  ([specs/workers.md](../../specs/workers.md), amended by the Workers contract 2026-11-19).
- Agent sub-agents, background shells, the sub-agent wake, and the `subagent` inbox kind.
- Codex native image generation for Agents. Agents generate images with `haus image`.

Follow-up:

- Done: [specs/runtime-drivers.md](../../specs/runtime-drivers.md) carries the runner, both
  harnesses, the invocation contract and the frames, and [specs/mcp.md](../../specs/mcp.md)
  carries `execute` on the runner, agent-browser behind it, and the descoped local MCP.
- Bump the Computer protocol in R2 for the invocation frames, and again in R4 when the Agent
  session frames are deleted.
- `specs/inbox.md`: `accepted` means the runner acknowledged the run, and the `subagent` kind is
  deleted in R4.
- Move the prompt contract (size cap, divergence register, `test:prompt-contract`) to the runner.
- For any-Computer tool calls (2026-11-22): the target field in the invocation frame and tool
  shapes, the access list and its migration, the `not-found` and `not-listed` refusals for every
  invocation kind, `haus computer list`, the Manual topic, the Device page's Access section, and
  the specs above. [docs/features/agents.md](../features/agents.md),
  [docs/features/computer-use.md](../features/computer-use.md),
  [docs/api/computer-use.md](../api/computer-use.md) and [CONTEXT.md](../../CONTEXT.md) note the
  change.

## Open questions (2026-11-22)

- **The target field.** Its name, and whether it takes the Computer id from `haus computer list`,
  a unique name, or both. Whether an added field on the trained tool shapes changes how models
  call them.
- **Working directory off the home.** The machine user's home directory, or a per-Agent scratch
  directory that Haus Computer creates.
- **One list or two.** Whether losing a computer use list narrower than the home Agents is
  acceptable, or computer use keeps its own named list beside the access list, as Capy does.
- **Who grants.** Whether Owners and Admins may allow Agents on a Device someone else attached,
  as they may change computer use today, or only the attacher. Capy grants per device; the
  research does not say who.
- **Ordering.** An Agent's invocations run one at a time on a Computer. Whether calls to two
  Computers in one turn may run at once.
- **A prompt pointer.** Whether the Agent finds the Manual topic unprompted, or the prompt needs
  one line pointing at it, which goes through the prompt contract.
