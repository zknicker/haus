---
status: accepted
summary: An Agent's loop runs on the Server in a sandboxed runner, on the Claude Agent SDK for Claude plans and Pi Durable for every other model, with sessions on the runner's persistent volume. Each Agent is pinned to one harness, and the first harness ships before the second. Amended 2026-11-23, each Agent has a changeable Machine instead of a home Computer, where its drive/ folder syncs and its tools run by default; it is set at creation and changed in the Agent's settings or DM, never a chat composer, between turns, with the destination attacher's consent, a Drive flush and a durable placement generation, and worktrees stay on the old Mac. Every machine tool takes an optional per-call `computer` target (2026-11-22). Each Computer's Agent access is Selected Captains or All Captains on this Server; only the attacher widens it, stewards narrow it, the Machine always has it, and Workers honor it. Computer use is one switch over every Agent with access, turned on only by the attacher and migrated so nobody's desktop access widens. There are no in-chat permission Asks. The Server resolves the target and its gate fails closed for every invocation kind, revoke and retire are fenced against queued calls, off-Machine calls run in the Agent's own folder on that Computer, `haus` file paths follow the call's target, and the Agent finds its Computers with `haus computer list`. Its tools are bash and edit, the haus CLI run by the runner, and the one execute tool. Every invocation has an id, is recorded as accepted before it runs, and never reruns after an unknown outcome; an offline machine answers at once. Model logins are configured in the App and held encrypted by the Server, several per provider. Inbox items go to the runner. Workers keep native harnesses on machines. User-configured local MCP is descoped. Accepted 2026-11-19, not yet implemented.
read_when:
  - changing where an Agent's loop runs, its harnesses, or where its session is stored
  - changing the Agent's machine, moving an Agent, or what an Agent can do while its machine is offline
  - changing which Computers an Agent's tool calls may target, a Computer's Agent access list, or `haus computer list`
  - changing who may set or change an Agent's Machine, what a Machine change carries, or turn on Workers can run here
  - changing a Computer's Agent access setting (Selected or All Captains) or the computer use switch
  - changing the Agent's tools, the invocation contract, timeouts, offline answers, refusals, or the Computer result ledger
  - changing which harness an Agent runs on, or resetting or retiring an Agent
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
not runner settings with no sign-in screens. Amended 2026-11-22 in decisions 4, 5, 6, 10 and 11
to adopt Capy's device model after a council review: an Agent keeps one home Computer, each
machine tool call may target another Computer that allows it, and computer use has shipped.
Amended 2026-11-23 in decisions 4, 5, 6, 10 and 11, accepted by Zach after a second council
review: the home Computer becomes the Agent's changeable Machine, Agent access gains an All
Captains setting that Workers honor, and computer use becomes one switch
([the amendment](#amendment-2026-11-23-the-machine-replaces-the-home-computer)). Where the
amendment and the earlier text disagree, the amendment wins.
[ADR 0060](0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md) decides which repos
those calls reach and where Workers and Agents work on disk. Part of the direction in
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

**Added 2026-11-22.** Every Agent tool call routes to the Agent's own Computer: the router's one
routing line is `const computerId = agent.computerId`
(`apps/server/src/agent-invocations/invocation-router.ts:111`). A person asked an Agent for a
screenshot of their MacBook, and the call went to the Mac mini, where all nine Agents live. The
MacBook was attached with computer use on, and no Agent could reach it. Capy keeps a home machine
per thread and lets one tool call go to another device: "Every connected computer is a machine
that any of your threads can use" ([Capy Desktop](https://capy.ai/blog/capy-desktop)).

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

4. **An Agent has a home Computer, and each tool call may target another Computer that allows
   it.** (Amended 2026-11-22. It said: one machine where its tools run, a setting changed while
   idle, with nothing carried over.) A machine is a Computer or a Haus-hosted cloud machine, and
   v1 supports Computers only. **2026-11-23:** the home is now the Agent's Machine, and the Home,
   Placing a home, Two lists, Who grants and Moving the home bullets below read as
   [the amendment](#amendment-2026-11-23-the-machine-replaces-the-home-computer) changes them.
   - **Home.** Each Agent has one home Computer (`agents.computer_id`), the Computer it was
     created on. Its `drive/` folder lives there (decision 10), and a machine tool call that names
     no target runs there.
   - **Placing a home is a grant.** A home Agent runs commands on that Computer with no further
     consent, so only the Computer's attacher may place a home there. A person creating an Agent
     (an Owner or Admin, as today) may pick only a Computer they attached. An Agent that creates an
     Agent places it on its own home, which reaches nothing its creator cannot already reach.
     Existing homes stay. Today any Owner or Admin may create an Agent on any attached Computer
     (`apps/server/src/server-agents/create-agent.ts:84-87,184-196`).
   - **Per-call target.** Every machine tool takes an optional `computer` field, a Computer id or
     a unique name: `bash`, `str_replace_based_edit_tool`, `shell`, `apply_patch`, `view_image`,
     and `execute`'s `browser` and `desktop` built-ins, whose input becomes `{ args, computer? }`.
     The runner sends the string as it came, as a frame-level `computer` on `invocation-request`,
     never inside the operation. Only the Server resolves it, within the Agent's Server, the way
     it resolves a Worker's `--on` ([specs/workers.md](../../specs/workers.md#places)): a name
     that matches no Computer refuses `not-found`, and one that matches several refuses with their
     ids listed. The runner holds no Computer list (`runnerStartFrameSchema` carries none,
     `packages/haus-api/src/runner-protocol.ts`), and names and grants can change mid-turn.
     `agent_invocations.computer_id` records the resolved id, and a resend keeps it. The default
     is the home, and an explicit target never falls back to it. There is no sticky switch: the
     session spans every chat ([specs/sessions.md](../../specs/sessions.md)), so a "current
     Computer" set in one channel would run the next channel's command on someone's laptop. A
     result from a Computer other than the home names that Computer, and so does every refusal.
     Home results stay as they are. The session, the turn and the conversation stay on the
     runner.
   - **Two lists per Computer.** Capy's Device carries `agentAccess` and `computerUseAccess`, and
     Haus keeps the same two:
     - **Agent access** says which Agents may run any tool there. Home Agents always may. Others
       are named one by one, in a new table of Computer, Agent and granting person. There is no
       "All Agents" grant in v1. A new Computer, and every existing one at migration, allows its
       home Agents only. The new table gets no trigger on `agents.computer_id`, unlike
       `computer_use_agents` (`apps/server/drizzle/postgres/0150_computer-use-captains.sql:18-24`).
     - **Computer use** keeps its switch, its scope and its rows. `all` still means the
       Computer's home Agents. A named list may also name an Agent that Agent access allows, not
       only a home Agent (`apps/server/src/computers/set-computer-use-agents.ts:18-33`), so a
       borrowed Agent reaches the desktop only when a person names it there. An empty named list
       still allows nobody.
     - The migration copies no rows, and nobody's access widens: `all` keeps its meaning, and an
       access grant never grants the desktop as a side effect. A `desktop` call needs both lists.
       Revoking an Agent's access also deletes that Computer's computer use row for it.
   - **Who grants.** Only the attacher grants Agent access. The attacher, Owners and Admins can
     revoke it. Computer use keeps today's stewards (the attacher, Owners and Admins,
     `apps/server/src/computers/computer-steward.ts:35-45`), who name only Agents that access
     allows. An Admin cannot consent for someone else's laptop, because an allowed Agent runs
     shell commands there and anyone who can message it can ask it to, since channels are open.
     For the same reason **Workers can run here** becomes attacher-only to turn on, and the
     attacher, Owners and Admins can turn it off. Today any steward sets it
     (`apps/server/src/computers/set-computer-workers.ts:23`), and it lets Agents run unsandboxed
     Claude Code there with the machine's logins (ADR 0056 decision 7). When the attacher leaves
     the Server nobody takes over: an Owner can detach the Computer, and whoever attaches it again
     becomes its attacher, so consent stays with the person at the machine.
   - **The gate fails closed, for every invocation kind.** The Server resolves the target and
     checks, in order: `not-found` (no such Computer), `no-access` (not on Agent access), then for
     `desktop` the computer use causes (`off`, `not-listed`, `not-mac`, `offline`, `not-ready`),
     then `offline`. `no-access` is its own cause because `not-listed` already means the computer
     use list (`apps/server/src/postgres/schema/agent-invocations.ts:85`), and a replay must say
     which list refused. All of this runs before the router records the row. Today it records
     `offline` first (`invocation-router.ts:113-121`), and `recordDesktopRefusal` then keeps that
     `offline` outcome (`apps/server/src/agent-invocations/invocation-store.ts:102`). Today the
     desktop gate also returns no refusal when it finds no Device
     (`apps/server/src/computer-use/computer-use-gate.ts:34-37`), and with a caller-chosen target
     that would send the call. The access check runs before the desktop gate, because
     `readDesktopDevice` has no home check (`apps/server/src/computer-use/desktop-device.ts:42`). A
     reconnect resend runs the same checks for every kind; today it re-gates `desktop` only
     (`invocation-router.ts:227-246`). The screen preflight still reports `locked`, `no-session`
     and `switched-out`. A refusal names the Computer and its attacher, as computer use refusals
     do.
   - **Revoke and retire are fenced.** The Computer accepts a call before it reaches the head of
     the Agent's queue (`apps/computer/src/invocations/handler.ts:55-59`), so the resend check
     alone cannot stop accepted calls. Revoking access, and retiring the Agent, sends that
     Computer a fence for the Agent. The fence stops the Agent's running call there at once, the
     way Stop Agent Input stops a `desktop` command, and settles each accepted, queued one as
     refused with no run. A Computer that is offline gets it on reconnect, before any queued call
     starts.
   - **Refusals keep their text.** The `agent_invocations_refusal` CHECK gains `not-found` and
     `no-access`, and `agent_invocations_sent_shape` allows a null `computer_id` for `not-found`
     (`apps/server/src/postgres/schema/agent-invocations.ts:83-90`). A replayed answer re-renders
     the refusal from its stored cause instead of the generic notice. That makes `settledAnswer`
     (`apps/server/src/agent-invocations/invocation-answers.ts:54`), which is synchronous today,
     an async lookup of the Computer and its attacher, with text from the cause alone once the
     Computer is gone. The runner keeps the Server's text on an `offline` answer instead of
     replacing it with `invocationOutcomeNotices.offline`
     (`apps/runner/src/invocations/invocation-client.ts:226-228`).
   - **The working folder off the home** is the one the Agent has on every Computer:
     `<dataRoot>/servers/<serverId>/agents/<agentId>/workspace`, with `HOME` at the sibling
     `home`. Haus Computer already creates both for any Agent id
     (`apps/computer/src/invocations/environment.ts:11-20`), so this needs no new code. `bash`
     starts there. `shell` may name a `workdir`, and Claude's `bash` has no working-directory
     field (`apps/runner/src/claude/haus-tools.ts:51-59`), so its commands `cd`. The folder has no
     `drive/`: Drive stays on the home. User files are reached by absolute path, because `~`
     expands to the Agent's own `HOME` (`apps/computer/src/invocations/paths.ts:13-16`).
     [ADR 0060](0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md) adds repo
     worktrees beside it.
   - **The trust this grants.** An allowed Agent runs commands as that Computer's machine user.
     Logins the tools find through `$HOME` are not seen, because `HOME` is the Agent's folder
     (`apps/computer/src/reminder-script.ts:162`): no ssh keys, no `gh` login, no user git
     config. It is not a boundary either: the Agent can read anything that user can by absolute
     path. Anyone who can message the Agent can reach the Computer through it. Nothing an Agent
     runs uses the machine's GitHub login on its behalf: `haus repo checkout` reaches only repos
     already on that Computer, and an Agent pushes and opens pull requests as the Server's Haus
     GitHub App, never as the person on the Mac (ADR 0060 decision 5). Work that needs the
     machine's own logins goes to a Worker there
     ([ADR 0056](0056-agents-run-quiet-workers-anywhere.md) decision 7).
   - **Retirement reaches every Computer.** Retiring an Agent fences and then purges its folders
     on every Computer that holds any. The Server sends `agent-retire` to each online Computer on
     the Server. On every connect a Computer reports the Agent ids it holds folders or worktrees
     for (`agent-held`, like `worker-held`), and the Server answers `agent-retire` for each retired
     one. The invocation ledger cannot drive this, because its rows are deleted after 30 days
     (`apps/server/src/agent-invocations/invocation-retention.ts:13`,
     `EXECUTION_JOURNAL_RETENTION_DAYS`). Today `agent-retire` goes to the home only
     (`apps/server/src/agent-delivery/delivery.ts:418-423,462-465`). Full Reset recreates the
     home's folders only (`delivery.ts:261-265`). Folders on other Computers are scratch, and the
     Manual says so.
   - **Discovery.** `haus computer list` shows each Computer on the Server: its id, name, whether
     it is online, its OS, which one is home, whether this Agent is allowed there, and whether
     computer use is on for it. A Manual topic teaches targeting. The command needs a row in
     `apps/runner/src/haus/command-access.ts`, or the runner refuses it as `UNKNOWN_HAUS_COMMAND`.
     The system prompt lists no Computers, but its command families
     (`packages/agent-prompt/src/managed-instructions.ts:120-137`, introduced at line 146 by "Use
     ONLY these command families") gain a `computer` entry, through the prompt contract and the
     register row "Communication — CLI ONLY, command families".
   - **Moving the home ships later.** Move to device, Capy's "Continue on", changes the home while
     the Agent is idle. Who may move a home follows "Placing a home is a grant". What it carries
     over is decided when it ships; Capy carries the branch and uncommitted work.
   - **Naming.** Contracts and Agent-facing text say Computer, and the UI says Device
     ([ADR 0058](0058-the-ui-uses-capy-names.md)). In replies an Agent names a machine by its name
     ("the MacBook"), and keeps internal words such as session, invocation and runner out of what
     it says.

5. **The Agent's tools.** `bash` and an edit tool run on the home Computer, or on the call's
   target (decision 4), through the invocation contract, in the shapes the models are trained on:
   `bash` and `str_replace_based_edit_tool` for Claude and every other non-GPT model, `shell`,
   `apply_patch` and `view_image` for GPT models. Each shape gains the optional `computer` field
   (amended 2026-11-22). The shapes are hand-declared in `apps/runner/src/claude/haus-tools.ts`
   and `apps/runner/src/pi/pi-tools.ts`, so that is one field in each. They are built from Pi's
   MIT tool code, and the patch grammar from OpenAI Codex's Apache-2.0 parser, each marked with
   its source. Haus actions are the `haus` CLI, which the runner runs itself when a shell command
   is one `haus` invocation. Most `haus` commands never need a machine. The few whose flags name
   a machine path (`attachment upload --path`, `attachment view --output`, and the others in
   [specs/runtime-drivers.md](../../specs/runtime-drivers.md#haus-runs-on-the-runner)) read or
   write it on the Computer the enclosing `bash` or `shell` call targeted (amended 2026-11-22;
   today `readMachineFile` and `writeMachineFiles` send no target,
   `apps/runner/src/haus/haus-cli.ts:117-156`). So a `bash` call that runs
   `haus attachment upload --path /tmp/shot.png` with `computer: "macbook"` posts a MacBook
   screenshot. Copying between Computers goes through an attachment: upload on one, then
   `haus attachment view --output` on the other. Everything else sits behind the one `execute`
   tool: Server-held remote MCP, which needs no machine, and agent-browser and agent-desktop
   relayed from the home or the target. Skills load from Drive.

6. **A machine offline is not an Agent offline.** A tool call to an offline Computer answers
   "offline" at once, so the turn never stalls. The Agent still talks, plans, uses Drive through
   the Server, dispatches Workers, and (amended 2026-11-22) runs tools on any other online
   Computer that allows it. An Agent's invocations run one at a time on each Computer
   (`apps/computer/src/invocations/handler.ts:55-68`), so calls to two Computers can run at once.

7. **Every tool invocation has an id.** The Computer records a call as accepted before running it,
   and keeps its result in a ledger, so a call whose acknowledgement was lost never runs twice. A
   crash mid-command leaves the outcome "unknown", and Haus never reruns it on its own. A call
   that has not started by the time Haus may answer "unknown" never starts: each call carries a
   start deadline, and the expiry cancels a call still waiting. Commands have timeouts,
   cancellation and output limits.

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
    current revisions. Each Agent keeps a plain `drive/` folder on its home Computer only, pulled
    at turn start and pushed after the reply
    ([ADR 0054](0054-drive-holds-what-agents-know-and-follow.md)). Other Computers get no
    `drive/` folder (amended 2026-11-22). Prompt composition moves from the Computer to the
    runner. (Amended 2026-11-23: the folder lives on the Agent's Machine, and a Machine change
    hands it over as [ADR 0054](0054-drive-holds-what-agents-know-and-follow.md) describes.)

11. **Built-in machine tools only.** agent-browser is built in and managed by Haus. agent-desktop
    and the per-Computer "Computer use allowed" switch shipped as computer use
    ([specs/computer-use.md](../../specs/computer-use.md); amended 2026-11-22, it said they ship
    in a later phase). (Amended 2026-11-23: computer use is one switch over every Agent that
    Agent access allows on that Computer.)
    User-configured local MCP servers are descoped. If they return, they follow Capy: a launch
    recipe in Project settings, run on the working machine, with availability shown per Computer.

12. **Ship order.** Tasks (landed), then minimal Drive, then Agents move to the runner, then
    Projects, then Workers, then computer use (agent-desktop). The runner
    ships with one harness, and the second follows once tool dispatch works. Both are in place
    before Agents move in one cutover that resets every session, and no Agent stays on a
    Computer after it. Sub-agents and background shells end with the cutover, and Workers take
    over parallel and long work.

## Amendment 2026-11-23: the Machine replaces the home Computer

Accepted by Zach on 2026-11-23 after a council review (Opus, GPT Sol and Gemini Neon). It
amends decisions 4, 5, 6, 10 and 11. Decisions 5 and 6 read "the Agent's Machine" wherever
they say "the home Computer", and "Agent access allows" wherever they say a Computer "allows
it".

### Context

- **The Computer never changes.** `configureAgent` says "The Computer assignment is immutable"
  (`apps/server/src/server-agents/configure-agent.ts:46-47`), and nothing else writes
  `agents.computer_id` after creation. `agent.setHome` moves the home *Project*
  (`apps/server/src/projects/agent-home.ts:51-60`), so "home" names two different things in code.
- **A dead Mac strands its Agents.** Removing a Computer refuses while a live Agent is assigned to
  it: "Delete every assigned Agent before removing this Computer"
  (`apps/server/src/computers/remove-computer.ts:48-63`).
- **Reaching a second Mac took two grants.** On Haus 29.2.0 a person gave Cove access to their
  MacBook, and `desktop` still refused. The computer use select read "All Captains"
  (`apps/website/src/features/computers/computer-use-captains-row.tsx:71-72`), but `all` admits
  only the Computer's home Agents
  (`apps/server/src/computer-use/desktop-device.ts:28`), and the MacBook had none.
- **Workers skip Agent access.** `isAgentAllowedOn` is called only by the invocation gate
  (`apps/server/src/agent-invocations/invocation-gate.ts:56`), the send fence
  (`apps/server/src/agent-invocations/fence-epochs.ts:19`) and the git credential
  (`apps/server/src/github/computer-git-credential.ts:40`). A Worker start checks the switch,
  that the Computer is online and a ready runtime
  (`apps/server/src/workers/resolve-worker-start.ts:51-64`). So any Agent may start an
  unsandboxed Worker on any Computer whose **Workers can run here** is on, a larger grant than the
  shell access the list guards.

### Decision

1. **An Agent has a Machine.** It is the Computer the Agent's machine tools run on when a call
   names no target, and where its `drive/` folder syncs. It is a working setting, like the
   model, not where the Agent lives: an Agent belongs only to its Project
   ([ADR 0055](0055-projects-own-agents-and-tasks.md)).
   - It is set at creation, and changed in the Agent's settings or its DM. Never from a channel
     or chat composer: an Agent has one global session
     ([ADR 0011](0011-agents-own-one-global-session.md)), so a change moves its default in every
     chat at once, and the confirmation says so. This keeps decision 4's rejection of a sticky
     switch.
   - The UI never says "home" for a Computer. Docs say Machine. Contracts and storage keep
     `agents.computer_id` and `computerId` until the implementation renames them, so a doc that
     names the field says it holds the Machine.

2. **The per-call `computer` target stays**, gated by Agent access as before. Cove keeps the Mac
   mini as its Machine and reaches the MacBook for one screenshot. Changing the Machine is not
   how an Agent reaches another Computer for a call.

3. **Agent access is Selected Captains or All Captains on this Server.** The UI calls it
   Captain access.
   - **Selected Captains** is the default: today's named list.
   - **All Captains on this Server** allows every live Agent on the Server.
   - An Agent whose Machine is this Computer always has access, as a home Agent does today
     (`apps/server/src/computer-access/agent-access.ts:19-21`).
   - Only the attacher widens it, by granting an Agent or choosing All Captains. The attacher,
     Owners and Admins narrow it, by revoking an Agent or choosing Selected Captains, and each
     narrowing fences the Agents it bars, as a revoke does today. Choosing Selected Captains keeps
     the named rows.
   - At migration every Computer is Selected Captains with its rows unchanged, so nobody's access
     changes. This is the "All Agents" grant decision 4 deferred.

4. **Workers honor Agent access.** An Agent may start a Worker on a `computer:` place only when
   Agent access allows it there, beside the **Workers can run here** switch. Cloud places are
   unchanged. [ADR 0056](0056-agents-run-quiet-workers-anywhere.md) carries the rule.

5. **Computer use is one switch.** On, every Agent that Agent access allows on the Computer may
   use `desktop` there. Off refuses every `desktop` call.
   - The `all` scope, which meant home Agents only, and the named list retire, with
     `computers.computer_use_scope`, `computer_use_agents`, and the `agents_computer_use_moved`
     trigger (`apps/server/drizzle/postgres/0150_computer-use-captains.sql:18-24`, replaced at
     `0153_computer-agent-access.sql:17-22`). The gate no longer produces `not-listed`, and the
     refusal CHECK keeps it for old ledger rows.
   - Turning the switch on widens desktop access, so only the attacher turns it on, as with
     **Workers can run here**. The attacher, Owners and Admins turn it off. Today any steward
     turns it on (`apps/server/src/computers/set-computer-use.ts:14`).
   - **Changed capability.** A person can no longer let an Agent run shell on a Computer while
     keeping it off the desktop there when the switch is on. Access is the grant, and the switch
     says whether access includes the desktop.
   - **Migration.** It must not widen anyone's desktop access. For each Computer it compares
     today's desktop set D (nobody when the switch is off; the home Agents for `all`; the rows for
     `named`) with its access set A (live home Agents plus `computer_agent_access` rows):

     | Today | After |
     | --- | --- |
     | Switch off | Off |
     | Switch on, and D equals A | On |
     | Switch on, and D is smaller than A: `all` with any access grant, a `named` list missing an Agent that has access, or an empty `named` list | Off, with `computer_use_changed_at` set to the migration |

     D is never larger than A: a named entry needs access
     (`apps/server/src/computers/set-computer-use-agents.ts:23-33`), and a revoke deletes it
     (`apps/server/src/computers/computer-agent-access.ts:72-80`). The third row narrows: the
     Agents in D lose the desktop there until the attacher turns the switch on, which then covers
     all of A. The migration logs each Computer it turns off. It never translates `all` into
     "every Agent with access". Access rows are untouched, so no shell access changes either.
   - **Possible later, not decided:** Off, Screen only and Full control, split by
     `desktopCommandClass`'s look and act classes
     (`packages/haus-api/src/computer-use.ts:170-185`). Today the gate treats looking and acting
     alike (`apps/server/src/agent-invocations/invocation-gate.ts:59-64`).

6. **No in-chat permission Asks.** [ADR 0037](0037-humans-are-addressed-by-mention.md) as
   amended 2026-11-21 stands: settings grant, conversations ask. A `no-access`, computer use or
   Worker start refusal names the setting and links to the Computer's Device page, as desktop
   refusals do today (`apps/server/src/computer-use/desktop-device.ts:123-145`). The Agent asks a
   person in plain text.

7. **Changing an Agent's Machine** replaces "Moving the home ships later".
   - **Who.** A person who may configure the Agent, an Owner or Admin
     (`apps/server/src/server-agents/configure-agent.ts:66-70`), with the destination attacher's
     consent: the Agent already has access there, or the destination's attacher makes the change,
     and the change is their grant. Creation follows the same rule. Today it is attacher-only
     (`apps/server/src/server-agents/create-agent.ts:201-222`), and All Captains on this Server
     adds the second path. Leaving a Computer needs no consent from it, and the Agent keeps access
     there only through a grant row.
   - **Between turns.** A change requested during a turn applies after the turn settles, as a
     model change does (`apps/server/src/agent-delivery/deferred-configuration.ts:27`). The
     session stays on the runner and is not reset.
   - **Drive.** Haus flushes the old Machine's push before the switch, or, when that Mac is
     offline, offers to move from the last synced revision. [ADR
     0054](0054-drive-holds-what-agents-know-and-follow.md) carries the handoff.
   - **Fencing.** Each change bumps a durable placement generation on the Agent. Work started
     under an older generation (a Drive push, an invocation routed to the default, a reminder
     script) is refused, the way a Drive push from an earlier reset generation is
     (`apps/server/src/postgres/schema/agents.ts:90`). Today's send fence keeps its epochs in a
     per-process map (`apps/server/src/agent-invocations/fence-epochs.ts:10-12`) that a Server
     restart loses. When the change leaves the Agent with no access on the old Machine, the old
     Machine is fenced as on a revoke. Calls with an explicit target keep their resolved Computer.
   - **Worktrees and uncommitted work stay on the old Mac.**
     [ADR 0060](0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md) carries the
     rule, and the confirmation says so.
   - **The action is "Change machine".** Capy's "Continue on", which carries the branch and
     uncommitted work across, is deferred.
   - **Removing a Computer** offers to change the Machine of each live Agent on it, instead of
     refusing until they are deleted.

8. **What a Machine change must carry.** Each of these routes by `agents.computer_id` today and
   is a follow-up for the change:
   - reminder scripts, dispatched to the Agent's Computer
     (`apps/server/src/reminders/scheduler.ts:219-229`) and settled only from it
     (`apps/server/src/reminders/reminder-script-delivery.ts:92`);
   - workspace and skill reads (`apps/server/src/server-agents/agent-workspace.ts:63-70`,
     `apps/server/src/server-agents/agent-skill-file.ts:85-92`);
   - `activeRunComputerId` (`apps/server/src/postgres/schema/agent-delivery.ts:21`): the turn-end
     Drive push reads the Agent's current Computer, not the run's
     (`apps/server/src/runner/ingest.ts:145-162`);
   - the Drive sync credential, minted only for the Agent's own Computer
     (`apps/server/src/computers/runner-credentials.ts:54-56`), and the reconnect Drive
     reconcile, which covers only Agents assigned there
     (`apps/server/src/agent-delivery/drive-reconcile.ts:8-29`);
   - the fence epochs, which today live in memory.

### Considered and rejected

- **A Machine picker in the chat composer**, as Capy has. A Capy Captain is one thread. A Haus
  Agent's session spans every chat, so the picker is the sticky switch decision 4 rejects.
- **Dropping the per-call target** now that the Machine can change. One screenshot of the MacBook
  would move Cove's Drive and default, then move them back.
- **A Personal Device policy for "your own Captains"**, as Capy has. An Agent has no owner: its
  creator is provenance, and an Agent made by an Agent has no human creator
  (`apps/server/src/server-agents/create-agent.ts:82-83`). Channels are open, so a teammate could
  reach the laptop through any such Agent.
- **In-chat "Allow once" and "Always allow"**. It reverses ADR 0037, stalls the one session while
  it waits, and needs rules for who may press it in a shared channel.
- **Two lists with better labels.** One capability would still need two grants.
- **Migrating `all` to every Agent with access.** It grants the desktop to every borrowed Agent.

### Consequences

Amended:

- [ADR 0054](0054-drive-holds-what-agents-know-and-follow.md): the Drive handoff on a Machine
  change.
- [ADR 0056](0056-agents-run-quiet-workers-anywhere.md) and
  [specs/workers.md](../../specs/workers.md): Workers honor Agent access.
- [ADR 0058](0058-the-ui-uses-capy-names.md): Machine, and the Device page labels.
- [ADR 0060](0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md): worktrees stay
  on the old Mac.
- [specs/computer-use.md](../../specs/computer-use.md): a dated note until the rewrite.
- [CONTEXT.md](../../CONTEXT.md): Machine, with home Computer as a word to avoid.

Changed capability: shell without the desktop on a Computer whose switch is on; desktop access on
a Computer the migration turns off; Worker starts on a Computer the Agent has no access to; and
Owners and Admins turning computer use on for a Computer they did not attach.

Deferred: Cloud as a Machine; no Machine at all, which needs the `agents_configuration` CHECK
(`apps/server/src/postgres/schema/agents.ts:186-191`), `toAgent`
(`apps/server/src/server-agents/agent-shape.ts:88-90`) and the active roster's join on Computers
(`apps/server/src/server-agents/query-agents.ts:66-79`) to change; "Continue on"; and per-Agent
people Access.

Follow-up:

- Done 2026-11-23 (migration 0154): the Agent access setting and its migration, the attacher-only widening, and the Worker start
  check.
- Done 2026-11-23 (migration 0154): the computer use migration in decision 5, the retired scope, table and trigger, and the
  attacher-only check for turning the switch on.
- Done 2026-11-23 (migration 0155, Computer protocol 49): `agent.setMachine` (not
  `agent.setHome`, which moves the Project), the placement generation, the Drive handoff, the
  decision 8 list, and the removal flow. A pending change holds new turns only while it can move;
  a default-routed call from a run of an older generation is refused `moved`; moving back to a Mac
  that still holds a folder sets that folder aside and pulls fresh
  ([specs/drive-folder.md](../../specs/drive-folder.md#when-the-machine-changes)).
- The App: Machine in the create form and the Agent's settings and DM, the Device page labels
  ([ADR 0058](0058-the-ui-uses-capy-names.md)), and refusal links. Done 2026-11-23: the create
  form's label, the Machine row in the Agent's Runs on section, and the move offer when removing
  a Device. The DM's Machine control is not built.
- Rewrite [specs/computer-use.md](../../specs/computer-use.md) "The Device settings", "The
  gate" and "App", and note the change in [docs/features/computer-use.md](../features/computer-use.md)
  and [docs/features/agents.md](../features/agents.md). The Manual's targeting topic calls the
  default the Machine.

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
- **A sticky "current Computer" switch.** The session spans every chat, so the switch would carry
  a target from one conversation into the next, and the model would have to remember hidden
  state.
- **The target inside `execute` only.** It keeps the trained tool shapes, but a screenshot lands
  as a file on the target, and viewing or uploading it needs the target too, so "screenshot my
  MacBook" could not finish.
- **One list that generalizes the computer use list.** It widens a named computer use list to
  every home Agent, and turns an empty named list from "nobody" into "home Agents".
- **Owners and Admins granting access.** An Admin could give themselves shell on a teammate's
  laptop through an Agent, without that person's consent.
- **An Owner taking over a departed attacher's Computer.** The machine still belongs to the person
  who attached it. Re-attaching at the machine makes a new attacher.
- **`all` covering borrowed Agents.** Every access grant would then grant the desktop too, so a
  borrowed Agent is named on the computer use list or not at all.
- **Resolving names on the runner.** The runner has no Computer list, and a list sent at turn
  start goes stale when a Computer is renamed or a grant changes mid-turn. The Server already
  resolves Worker places by name.
- **Naming the Computer on every result.** Home results would change for every Agent on every
  call. An explicit target never falls back to the home, so off-home results and refusals are
  the ones that need the name.
- **The machine user's real home as the working folder.** The user's ssh, `gh` and git logins
  would work, but every Agent's shell history and tool caches would land in the user's home, and
  `~` would mean the user's dotfiles. The per-Agent folder already exists, and work that needs
  the logins belongs to a Worker.
- **Moving the home to reach another Computer.** It is not built, it moves the workspace for one
  call, and the Agent can only be on one Device at a time.
- **A Worker on the other Computer.** Workers carry long work. A screenshot is one tool call.
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
  - The target is a per-call `machine` field, not a thread switch. Capy 0.9.2's renderer declares
    a machine ref (`"primary"`, a `machine_id`, or a subagent or task), and its fixtures pass it
    on `bash` beside `command` and `cwd`, on `computer`, and on `phone`.
  - Its Device record carries `agentAccess` and `computerUseAccess`, each with grant, deny and
    revoke endpoints. Its model tools include `machine_list`, and `transfer_files`, which copies
    files between machines.
  - "Continue on" is a separate handoff
    (`POST /jams/:jamId/handoff {destination: "cloud" | {device, into?}}`) that moves the branch
    and uncommitted work and ends the turn.
  - The wire to a device (`POST /v1/invocations {invocationId, handler, params, cwd?}`) has no
    machine field, because the server already chose the device's tunnel.
- **The council** (Codex and Gemini) raised three points this ADR adopts:
  - the privilege boundary around a Server-side harness
  - the invocation ledger
  - owning the home rather than the loop
- **The 2026-11-22 council** (Opus, GPT Sol and Gemini Neon) reviewed the first draft of decision
  4. This amendment takes its recommendation: the per-call field, two lists, attacher-only
  grants, the existing per-Agent folder, file paths that follow the target, and its must-fix
  list. A second review of this amendment settled its open questions and added the `no-access`
  cause, Server-only name resolution, the revoke and retire fence, `agent-held`, and the
  attacher-only Workers switch.

## Consequences

Amended:

- [ADR 0011](0011-agents-own-one-global-session.md): one global session stands, stored on the
  Server and run by the runner.
- [ADR 0019](0019-servers-own-collaboration-computers-own-execution.md): Computers own tool
  execution and Workers. They no longer run Agent sessions.
- [ADR 0054](0054-drive-holds-what-agents-know-and-follow.md): the runner composes the prompt and
  reads Drive from the Server. Each Agent keeps a `drive/` folder on its home Computer only,
  pulled at turn start and pushed after the reply.
- `specs/inbox.md`: the Server delivers inbox items to the runner, not a Computer.
- [ADR 0056](0056-agents-run-quiet-workers-anywhere.md): Workers keep machine logins and native
  harnesses. The Agent's runtime and tools live here. Decision 6 (2026-11-22): only the attacher
  turns **Workers can run here** on, and the attacher, Owners and Admins turn it off.
- [specs/computer-use.md](../../specs/computer-use.md) (2026-11-22): the Captains list keeps its
  switch, rows and the meaning of `all`, a named entry may be any Agent the Device's access list
  allows, and the gate runs after the target and access checks. Its sections carry a dated note
  until the rewrite.
- [specs/workers.md](../../specs/workers.md) "Places" (2026-11-22): the switch is attacher-only to
  turn on. The section carries a dated note.
- [specs/runtime-drivers.md](../../specs/runtime-drivers.md) (2026-11-22): the Route step resolves
  the call's target, or the home, then runs the gate in decision 4. The tool shapes gain the
  `computer` field, and `haus` machine paths follow it. Its sections carry a dated note until the
  rewrite.

Changed capability (2026-11-22): an Owner or Admin can no longer create an Agent on a Computer
someone else attached, or turn on **Workers can run here** there. Existing Agents keep their
homes, and a switch already on stays on.

Deleted:

- Agent sessions on Computers, and the per-Computer Agent session store.
- Grok Build as an Agent runtime. Grok models stay reachable through Pi's xAI provider. Grok Build
  as a Worker runtime is deferred; v1 Workers run Claude Code or Codex
  ([specs/workers.md](../../specs/workers.md), amended by the Workers contract 2026-11-19).
- Agent sub-agents, background shells, the sub-agent wake, and the `subagent` inbox kind.
- Codex native image generation for Agents. Agents generate images with `haus image`.

Deferred (2026-11-22): Move to device ("Continue on"), `transfer_files`, an "All Agents" access
grant, and Drive on Computers other than the home. The 2026-11-23 amendment decides the "All
Agents" grant and a Machine change without carrying work; "Continue on" stays deferred.

Follow-up:

- Done: [specs/runtime-drivers.md](../../specs/runtime-drivers.md) carries the runner, both
  harnesses, the invocation contract and the frames, and [specs/mcp.md](../../specs/mcp.md)
  carries `execute` on the runner, agent-browser behind it, and the descoped local MCP.
- Bump the Computer protocol in R2 for the invocation frames, and again in R4 when the Agent
  session frames are deleted.
- `specs/inbox.md`: `accepted` means the runner acknowledged the run, and the `subagent` kind is
  deleted in R4.
- Move the prompt contract (size cap, divergence register, `test:prompt-contract`) to the runner.
- For any-Computer tool calls (2026-11-22):
  - the `computer` field in both tool adapters and the `execute` built-ins, and the frame-level
    `computer` string;
  - Server-side name resolution, the Agent access table, attacher-only grants, home placement
    and Workers switch, and named computer use entries for allowed Agents, deleted on revoke;
  - the gate order for every kind, before the row is recorded, on request and on resend;
  - the revoke and retire fence for accepted, queued calls;
  - the `not-found` and `no-access` CHECK and sent-shape change, an async `settledAnswer`, and
    refusal text kept on replay and offline;
  - `haus` machine paths that follow the target;
  - retirement on every Computer, through `agent-retire` fan-out and the `agent-held` report;
  - `haus computer list`, its `command-access` row, its Manual topic, the families entry through
    the prompt contract, and the Device page's Access section;
  - a small baseline eval through `.agents/skills/tune-agent-behavior/SKILL.md`, on both harness
    families: calls with no target are unchanged, and "screenshot my MacBook" routes there;
  - rewrite [specs/computer-use.md](../../specs/computer-use.md) "The Device settings" and "The
    gate", and [specs/runtime-drivers.md](../../specs/runtime-drivers.md) "Lifecycle" and
    "`haus` runs on the runner";
  - [docs/features/agents.md](../features/agents.md),
    [docs/features/computer-use.md](../features/computer-use.md),
    [docs/api/computer-use.md](../api/computer-use.md) and [CONTEXT.md](../../CONTEXT.md) note the
    change.

## Open questions (2026-11-22)

None. The second council settled the draft's questions: no Owner takeover; off-home results and
refusals name the Computer; Agents may place Agents on their own home; `all` means home Agents,
so an access grant never grants the desktop; and the optional field gets a baseline eval. Zach
then decided that a revoke stops a running call at once and cancels the queued ones.
