---
status: accepted
summary: An Agent's loop runs on the Server in a sandboxed runner, on the Claude Agent SDK for Claude plans and Pi Durable for every other model, with sessions on the runner's persistent volume. Each Agent is pinned to one harness, and the first harness ships before the second. The Agent has one machine where its tools run, changed while idle; v1 machines are Computers. Its tools are bash and edit on that machine plus the one execute tool. Every invocation has an id, is recorded as accepted before it runs, and never reruns after an unknown outcome; an offline machine answers at once. Logins live in runner settings. Inbox items go to the runner. Workers keep native harnesses on machines. User-configured local MCP is descoped, and computer use ships later. Accepted 2026-11-19, not yet implemented.
read_when:
  - changing where an Agent's loop runs, its harnesses, or where its session is stored
  - changing the Agent's machine, moving an Agent, or what an Agent can do while its machine is offline
  - changing the Agent's tools, the invocation contract, timeouts, offline answers, or the Computer result ledger
  - changing which harness an Agent runs on, or resetting an Agent's session
  - changing who holds model logins for Agents or Workers
  - changing agent-desktop, agent-browser, computer use, or local MCP support
  - changing the Computer protocol, prompt composition, or the runtime drivers
---

# ADR 0057: Agents Run on the Server, and Machines Run Their Tools

## Status

Accepted 2026-11-19. Not yet implemented. Part of the direction in
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

## Decision

1. **An Agent's loop runs on the Server**, in a sandboxed runner process. The runner has its own
   container, no database credentials and no Server secrets, and reaches Haus only through a
   scoped API.

2. **Two harnesses.** The Claude Agent SDK runs Claude plans, with a setup-token, its native tools
   off, and Haus tools bridged in. Pi Durable runs every other model, including ChatGPT plans and
   other providers. Each keeps its sessions in its own native storage on the runner's persistent
   volume, which is backed up with the Server's data. The session never moves: only the Agent's
   machine does, so it only has to survive the runner restarting. Each Agent is pinned to one
   harness. Switching harness is an explicit reset that rebuilds the session from Drive and recent
   history. Model logins live in runner settings in v1, with no sign-in screens.

3. **One endless session per Agent.** ADR 0011 stands. The session now lives on the Server, not on
   a Computer. The Server delivers inbox items to the runner.

4. **An Agent has one machine where its tools run.** A machine is a Computer or a Haus-hosted cloud
   machine, and v1 supports Computers only. The machine is a setting changed while the Agent is
   idle. Nothing on the old machine is carried over.

5. **The Agent's tools.** `bash` and an edit tool run on its machine through the invocation
   contract. They are built from Pi's MIT tool code, in the shapes the models are trained on:
   `bash` and the `str_replace` editor for Claude, `shell` and `apply_patch` for GPT models.
   Everything else sits behind the one `execute` tool: Haus actions, Server-held remote MCP, and
   agent-browser (and later agent-desktop) relayed from the machine. Skills load from Drive.

6. **A machine offline is not an Agent offline.** A tool call to an offline machine answers
   "offline" at once, so the turn never stalls. The Agent still talks, plans, uses Drive through
   the Server, and dispatches Workers.

7. **Every tool invocation has an id.** The Computer records a call as accepted before running it,
   and keeps its result in a ledger, so a call whose acknowledgement was lost never runs twice. A
   crash mid-command leaves the outcome "unknown", and Haus never reruns it on its own. Commands
   have timeouts, cancellation and output limits.

8. **The Server holds the Agent's model logins:** a Claude setup-token and a ChatGPT sign-in, in
   the runner's settings.

9. **Workers keep the harness on the machine.** A Worker runs native Claude Code or Codex on a
   Computer with that machine's logins, or runs on a cloud service
   ([ADR 0056](0056-agents-run-quiet-workers-anywhere.md)). A dead machine is a failed Worker.

10. **The runner composes each turn from Drive.** It reads rules and memory from the Server's
    current revisions. Each machine keeps a plain `drive/` folder, pulled at turn start and pushed
    after the reply ([ADR 0054](0054-drive-holds-what-agents-know-and-follow.md)). Prompt
    composition moves from the Computer to the runner.

11. **Built-in machine tools only.** agent-browser is built in and managed by Haus. agent-desktop
    and a per-Computer "Computer use allowed" switch, which decides whether Agents may operate its
    apps, ship in a later phase.
    User-configured local MCP servers are descoped. If they return, they follow Capy: a launch
    recipe in Project settings, run on the working machine, with availability shown per Computer.

12. **Ship order.** Tasks (landed), then minimal Drive, then Agents move to the runner, then
    Projects, then Workers, then computer use (agent-desktop). The runner
    ships with one harness, and the second follows once tool dispatch works. Agents move in one
    cutover, and no Agent stays on a Computer after it.

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
  fresh from Drive and recent history.
- **Moving an Agent's checkouts and processes with it.** Moving machine-local state is its own
  feature. Workers reach other machines today.

## Prior art

- **Amp** runs the loop and model inference on its servers. Machines only execute tools.
  - Its CEO: the "main agent loop can" be durable, while tool executors cannot.
  - Its May 2026 rebuild put agent loops "in durable execution".
- **Capy**: "the machine is only where the tools execute."
  - A thread moving to a device keeps its "agent loop" running "in the same place".
  - The Claude Agent SDK runs server-side only "for claude code subs".
  - Its tools are bridged in.
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
  reads Drive from the Server. Machines keep a `drive/` folder pulled at turn start and pushed after
  the reply.
- `specs/inbox.md`: the Server delivers inbox items to the runner, not a Computer.
- [ADR 0056](0056-agents-run-quiet-workers-anywhere.md): Workers keep machine logins and native
  harnesses. The Agent's runtime and tools live here.

Deleted:

- Agent sessions on Computers, and the per-Computer Agent session store.
- Grok Build as an Agent runtime. Grok models stay reachable through Pi's xAI provider, and Grok
  Build stays a Worker runtime on Computers that have it.

Follow-up:

- Rewrite [specs/runtime-drivers.md](../../specs/runtime-drivers.md) for the runner and its two
  harnesses, and [specs/mcp.md](../../specs/mcp.md) for agent-desktop and agent-browser.
- Bump the Computer protocol for the invocation contract and the result ledger.
- Move the prompt contract (size cap, divergence register, `test:prompt-contract`) to the runner.
