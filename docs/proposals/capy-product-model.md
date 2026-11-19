---
summary: Proposal, grilled with Zach on 2026-11-18 and settled, to adopt Capy's connected product model in a Haus shape. Agents keep one global session and coordinate Workers, scoped parallel runs attached to a Task that can run on any granted Computer or in the cloud. Humans create Projects, each with one channel. A full Drive migration copies Capy's Drive and holds memory, AGENTS.md and WORKER.md rules, and reports. Builds on ADR 0053 (Tasks are places, Threads deleted), landed 2026-11-19. Covers Capy's model, the settled decisions, deletions, alternatives, ship order and housekeeping.
read_when:
  - deciding Haus's product direction for projects, workers or parallel agent work, Drive, or layered instructions
  - changing Files, Agent workspaces, cloud agents, the sidebar, the Agent page, or Computers in a way that moves toward or away from this model
  - writing the ADRs that split this proposal (Drive, Projects, Workers)
  - comparing Haus with Capy, Captains, crew threads, or Capy Drive
---

# Proposal: a Capy-shaped Haus

Status: **settled direction, 2026-11-18**. It was grilled with Zach and is ready to be split into
ADRs, one each for Drive, Projects and Workers. It builds on
[ADR 0053](../adr/0053-channels-and-tasks-are-the-only-places.md) and [specs/tasks.md](../../specs/tasks.md),
which landed on main on 2026-11-19. Threads are deleted. A Task is a channel for one piece of work,
started by an Agent from a Message in a channel. Cloud agents and pull requests attach to a Task
and report to it. That rework was the first step of the order below.

Research inputs are in the shared session notes folder, outside the repo:
- `capy-bundle-findings.md`, from the Capy 0.9.2 client bundle
- `capy-docs-findings.md`, from the public docs and the full changelog
- screenshots of the installed app, showing Captains Cap and Forge and the project Engineering

## The direction in five lines

1. **An Agent is already a Captain.** It has a persona, memory, and one long-lived session (ADR
   0011). What it was missing is a crew, so it gets **Workers**: scoped parallel runs, each attached
   to a Task, each starting from a brief and ending with a typed report.
2. **Workers run where the work is.** The Agent lives on its home Computer, and its Workers run on
   any Computer that allows them (the mini, the MacBook) or on Cursor or Claude in the cloud. Cloud
   agents become Workers.
3. **Humans create Projects, and each Project is its channel.** There are no freestanding
   channels. A Project carries a key, repos, rules and a default place for its Workers.
4. **One Drive, copied from Capy.** Files and every Agent workspace migrate into a mounted,
   versioned, attributed Drive. Memory, rules and reports live there, and everyone can read them.
5. **Channels stay the agents' common room.** Agents coordinate in the open: in Projects, Tasks
   and @mentions. There is no hidden agent-to-agent messaging. This is the part of Haus that Capy
   lacks, and we keep it.

---

## 1. How Capy fits together

Verified against the bundle, the docs, and the running app. Uncertain points are marked **(?)**.

### One primitive underneath

Internally, every agent context in Capy is one object, a *jam*. The kinds differ only by a flag or
a relation:

| Capy noun | What it is | Relation |
| --- | --- | --- |
| Thread | One agent working on one piece of work, on its own machine (cloud VM or a paired device) | top-level jam |
| Captain | A long-lived thread with `isCaptain`, a persona (name, avatar, alias, 140-char description), and its own Drive | top-level jam |
| Crew thread | A full thread with its own code, machine, PRs and members, linked to one Captain | `relationType: crew` |
| Subagent | A child that starts from its prompt alone and reports to its parent; it is capped and nests up to 3 deep | `relationType: task` |
| Side chat / fork | A copy of the conversation that never reports back | `side_thread` |

Each thread wakes on events: a human message, CI, a review, a merge, a timer (up to 7 days), a
GitHub, Slack or webhook subscription, issue activity, or a report from another agent. Status is
`working | waiting | idle | failed | archived`. "Needs you" is a separate flag.

### Captains and crew

- You create a Captain directly, by promoting a thread, or by promoting a folder, whose threads
  become its crew. Demoting a Captain releases its crew.
- A Captain is scoped to one project, and its crew must be in the same project. It always acts as
  its owner.
- **Crew report with a typed tool call**, not free text: `message_agent` with no `to` and `state`
  set to `final` or `needs_you`. This becomes a `thread_completion` event with `{outcome, summary,
  ask, needs: captain|person, pullRequests[], attachments, references}`. A `working` report stays
  in the crew thread.
- The Captain's Drive holds `AGENTS.md` (its own rules; crew does not read it), `CREW.md` (read by
  every crew thread on every turn), `NOTES.md` (its plan), `DIGEST.md`, and the folders
  `reports/`, `renders/` and `handoffs/`. Crew leave deliverables there, and reports cite them **by
  version**.
- **"Crew runs on"** on the Captain picks the cloud or one paired device. Each device has an owner
  who grants `access`, `agentAccess` and `computerUseAccess` separately. Device work uses that
  device's own credentials, including git.
- **People can reply inside a crew thread directly.** The message arrives there as a steer, and
  the Captain hears about it.
- The daily loop Capy teaches: one Captain per area, feed it work, read only "Needs you", answer
  in one line, teach with "from now on" rules, and a human merges every PR.

### Projects, Issues, Drive, Instructions

- **Project**: repos, setup, env and secrets, MCP servers, members, and the code that prefixes
  thread numbers. It is mostly settings: Capy has no project page beyond its threads list. Humans
  create projects.
- **Issues**: Capy's own tracker. An assignee can be a person or an agent. Issues and threads stay
  **separate and linked** (`IssueThreadLink`). **(?)** Whether assigning an issue spawns a thread
  on its own is unclear.
- **Drive**: volumes scoped to org, project, user, project+user, automation, or Captain.
  - Content is stored by hash and versioned (`autosave | checkpoint`), and every version records
    the thread and the author.
  - It has History, Compare, Restore, concurrent-write merge, and protection against mass deletes.
  - It is mounted on machines as a lazy folder, so agents use ordinary file tools, and files open
    beside the chat.
  - Message attachments stay as copies. An agent delivers a Drive file by reference (path plus
    version) along with an attachment copy.
- **Instructions**: an `AGENTS.md` at each scope, plus repo files. The **"Loaded before the first
  message"** panel shows a token breakdown; this org loads about 2.8k tokens.
- **Automations**: a stored prompt with triggers and a plain-language `run_when` gate.
- **Memory**: a paused experiment that stores topic files in Drive.

### Attention and communication

- There is no inbox page. Typed **asks** stay open until answered or dismissed, and they roll up
  onto the Captain's sidebar row. Capy needs this because it has no inbox and no channels.
- **There are no channels.** Agents talk by wake events. A message to another thread arrives as a
  steer, and Captains can message each other in the background, which humans don't see.

### What makes it feel good, and what doesn't

What works:
- **Parallel work you can watch.** Each crew thread has a PR, a status, and a report.
- **State in files, not in chat.** The plan, rules and reports live in a Drive people can read.
- **Work runs on the right machine.** The cloud, the mini or the MacBook, chosen per Captain.

What doesn't:
- Agent-to-agent traffic is invisible to people.
- There is no room where several agents and several people think together.
- An agent's identity is spread across hundreds of disposable threads.

---

## 2. Today's Haus, and where it fights itself

| Capy | Haus today, after the Tasks rework | Gap |
| --- | --- | --- |
| Captain | **Agent**: persona, `MEMORY.md`, one global session | No parallel work of its own. Rules and memory are hidden on its Computer. |
| Crew thread | **Task** (the place) plus an attached **cloud agent** | Workers run only in the cloud, never on your own Computers. |
| Subagent | Claude Code background sub-agents | Fine as is: invisible helpers for bulk reading. |
| Project | A channel plus its key from the ledger | No repos, no rules, no default place for work. |
| Drive | **Files**, Agent **workspaces**, **Pages**, attachments | Several stores, and the important files are hidden. No attribution, no Compare. |
| Instructions | Managed prompt, Server-held conversation style, `MEMORY.md` | Nothing people can edit or see. |
| Devices | Computers, each Agent pinned to one | An Agent can't do work on any machine but its own. |

The conflicts:
- **The files that steer behavior are where nobody looks.** `MEMORY.md`, notes and pages live in
  Computer-local workspaces. ADR 0052 (memory) already concedes that "the planned Drive work moves
  MEMORY.md somewhere members can read and edit."
- **Agents are serialized.** One turn at a time (ADR 0011) is right for a teammate's voice and
  wrong for a backlog. The only parallelism is cloud agents.
- **Machines are a cage.** Work that needs the MacBook's checkout or login needs a different Agent.
- **A channel is half a project.** It has a key but no repos, rules or place for its work to run.

---

## 3. Settled model

### Nouns

```
Haus (Server)
├── Agents      one home Computer, one global session, inbox-driven
├── Projects    created by humans; each one is its channel; key, repos, rules, Workers' default place
│   └── Tasks   places for one piece of work, started by Agents
│       └── Workers   scoped parallel runs attached to the Task, on a Computer or in the cloud
├── DMs         person ↔ Agent
└── Drive       Haus/ · projects/<key>/ · agents/<handle>/
```

### Agents (decided)

- **The noun stays Agent.** There is no Captain rename and no promote step: every Agent can run
  Workers.
- **One global session and the inbox stay as they are** (ADR 0011, the inbox spec). The Agent is
  the coordinator voice. It starts Tasks, briefs Workers, reads their reports, and talks to people.

### Workers (decided)

- **A Worker is a scoped run attached to one Task.** It starts blank from the Agent's written
  brief. It reads:
  - the Haus `AGENTS.md`
  - the project's `AGENTS.md`
  - the repo's own `AGENTS.md`
  - the Agent's **`WORKER.md`**, on every turn

  `WORKER.md` is the Agent's standing rules for its Workers: draft PRs, before/after renders, a
  report format. The Agent edits it when told "from now on" about its Workers.
- **It ends with a typed report**: `done | needs-you | failed`, with a summary, an ask, its PRs,
  and Drive files cited by version. The report posts in the Task and reaches the Agent through its
  inbox. A Task can hold several Workers.
- **Cloud agents become Workers.** Places are `computer:<name>`, `cursor` and `claude`, under one
  noun and one status set. `haus cloud-agent start --task` becomes `haus worker start --task ENG-41
  [--on macbook]`, and `CLOUD_AGENT_TASK_REQUIRED` becomes the Worker refusal. As of ADR 0053:
  - A cloud agent work record is a Worker.
  - Its Runs are the Worker's turns, including follow-ups.
  - Its card in the Task page's attached-work panel is the Worker card.
  - The Run notices that wake the Agent on the Task carry the typed report.
  - Pull request cards and the ready-after-settle wake stay as they are.
- **Where it runs:**
  - Any Computer whose **"Workers can run here"** switch is on. The person who attached the
    Computer, or an Owner or Admin, sets it (Capy's per-device `agentAccess`).
  - The **default place lives on the Project** ("Engineering: Workers run on mini"), because repos
    are linked per Project per Computer. The Agent can override it per Worker. This replaces
    today's per-Computer **Make default** provider setting.
  - A Worker uses **that machine's own logins** for its model runtime and git, which Computer model
    access already allows. Its model is any model that machine can run.
  - The Agent's session, memory and skills never leave its home Computer. Only the Worker travels:
    a fresh Claude Code or Codex session in a worktree of the project repo linked on that machine,
    with a credential scoped to that Worker.
  - Not in v1: moving a running Worker between machines.
- **People talk to a Worker directly.** Each Worker card on the Task page has its own composer.
  What you type goes straight into that Worker as a steer, or as a follow-up if it's idle. There
  is no inbox, because a Worker is scoped to one Task and anything sent to it is for it. The
  message also posts in the Task, marked "→ Worker on mini", so the conversation stays complete and
  the Agent sees it through its own inbox. A plain post in the Task goes to the Agent, as it does
  today. Workers have no inbox.
- **Deliverables go in the Agent's folder**, as in Capy: `agents/<handle>/reports/`, `renders/`
  and `handoffs/`. The Task page shows the files a report cites, at the cited version.

### Projects (decided)

- **Only humans create Projects.** "New project" creates the channel; there is no "New channel".
  Every existing channel becomes a Project, and `#all` becomes the Haus project.
- **A Project is its channel.** Its settings, behind the header menu, hold:
  - its key, an entry from the Server's key ledger as it is today. Projects can share an entry,
    and a Project without one takes `GEN`.
  - its repos, with which Computers have each one linked
  - its `AGENTS.md`
  - its default place for Workers

  As in Capy, there is no separate Overview pane. Open Tasks live in the sidebar.
- **Every Task already belongs to a Project.** ADR 0053 starts every Task from a Message in a
  channel and never in a DM, so a Task's origin channel is its Project. That is where a Worker
  finds its repos, rules and default place, and no new link is needed.

### Drive (decided)

- **A full migration, copied closely from Capy.** Files and every Agent workspace's durable files
  (`MEMORY.md`, `notes/`, pages) move into Drive. The existing file-browsing UI becomes the Drive
  browser:
  - a Drive page listing scopes (Haus, each project, each Agent)
  - files open beside the chat
  - History, Compare and Restore
  - every version attributed to the Task, Worker, Agent or person that wrote it

  The human Workspace pane goes. An Agent's machine-local workspace remains as execution scratch
  and checkouts, with no human surface.
- **Mounted, not pushed.** Computers mount the Drive folders an Agent or Worker can see. Edits save
  as attributed versions, concurrent writes merge or keep both, and mass deletes are held. Agents
  edit `MEMORY.md` as an ordinary file. ADR 0052's (memory) receipt still decides when it reaches
  the session.
- **Everyone can read everything.** There is no privacy layer and no personal folder.
- **Attachments stay as they are.** An Agent or Worker shares a Drive file by reference, a path at
  a version, which opens beside the chat.
- **Layout:**

```
AGENTS.md                        Haus rules
projects/<key>/AGENTS.md         project rules, plus project docs
agents/<handle>/AGENTS.md        the Agent's own rules (replaces the Server "conversation style")
agents/<handle>/WORKER.md        rules every Worker of this Agent reads
agents/<handle>/MEMORY.md        capped memory (ADR 0052, memory), now visible
agents/<handle>/notes/ …         the rest of its durable workspace
agents/<handle>/reports/ renders/ handoffs/   Worker deliverables
```

- **Rule delivery:**
  - The main session receives the Haus and Agent `AGENTS.md` and `MEMORY.md` when they changed,
    by receipt.
  - It receives a project's `AGENTS.md` the first time a turn acts in that Project in a session,
    and again after a change.
  - A Worker gets its full stack at launch, and `WORKER.md` on every turn.
  - The Agent page shows "Loaded before the first message".
- **No personal rules layer.** Preferences about a person live in the Agent's `MEMORY.md`.

### Attention (decided)

**No Asks.** [ADR 0038](../adr/0038-inbox-is-unread-not-attention.md) stands. A question is an
@mention, and a Task waiting on someone shows that in its sidebar row and on the Agent page. ADR
0053's followers carry the rest: a `needs-you` report that mentions the person makes the Task
unread for them, and it reaches their Inbox. Revisit only if real use shows questions getting lost.

### Human surfaces (decided)

**Sidebar**, Captains-first as in Capy:

```
 🔍 Search
 📥 Inbox                         3
 ───────────────────────────────────
 Agents
  [🐧 Cap] [🦊 Forge •] [👻 Cove]     ← tiles; the dot means working; click = your DM + its Overview
 ───────────────────────────────────
 Projects                          +   ← humans only
  ▣ Engineering   ENG
  ▣ Security      SEC
  ▣ Haus                               ← was #all
 ───────────────────────────────────
 Open tasks                            ← per the Tasks ADR
  ENG-41 Composer fonts   Forge · 2 workers · mini, cursor
  SEC-12 Token rotation   Cap · open
 ───────────────────────────────────
 ☰ Tasks   ◫ Drive   ∿ Activity   ⚙       ← footer icons
```

The Direct messages section goes: Agent DMs are the tiles, and person-to-person DMs are reached
from the Inbox and Search.

**Agent page**: your DM on the left, and an **Overview** pane on the right:
- **Working**: its open Tasks, each with its Workers, place and PR state.
- **Drive**: its folder as thumbnails (`MEMORY.md`, `AGENTS.md`, `WORKER.md`, reports).
- **Rules**: the "Loaded before the first message" token breakdown.

A **Tasks** tab lists every Task assigned to it.

**Task page** (from the Tasks ADR): the conversation, plus Worker cards, each with its place,
status, newest report, cited files, PR, and its own composer.

**Project page**: the channel, with settings behind the header menu.

### Cross-agent communication

Agents coordinate where people can see them. One Agent reaches another with an @mention in a
Project or Task, or by assigning a Task. An Agent reaches its Workers through the brief,
`haus worker send`, and `WORKER.md`. Workers report through typed reports in the Task. Workers
never talk to each other, and there are no agent-to-agent DMs or background steers.

### What is deleted

| Goes | Replaced by |
| --- | --- |
| "Cloud agent" as a noun and CLI family | Workers (`haus worker`) |
| Freestanding channels, "New channel" | Projects, created by humans |
| The Files section, the human Workspace pane, Pages in the workspace | Drive |
| Computer-local `MEMORY.md` and `notes/` as the source of truth | `agents/<handle>/` in Drive |
| Server-held conversation style | `agents/<handle>/AGENTS.md` |
| The Direct messages sidebar section | Agent tiles |
| An Agent's lock to one machine for its work | A home Computer for the session, and Workers anywhere they're allowed |

Kept: Agents with one global session and the inbox, Tasks as places, claims, Reminders, Triggers,
the Inbox (unread only), Activity, harness sub-agents, MCP connections, and Cove.

---

## 4. Alternatives rejected

- **Port Capy literally** (every conversation is a session, Captains are promoted threads, agents
  steer each other in the background). This discards ADR 0011's teammate who remembers your DM,
  and the visible multi-agent conversation that makes Haus different. The parts worth having
  (Workers, typed reports, Drive, rules, device placement) don't need it.
- **Take only Drive and rules.** This misses the biggest felt gap: parallel work you can watch, on
  the machine that has the checkout.
- **Merge the Worker into the Task** (Tasks "run" themselves). Capy keeps issues and threads
  separate, and a Task can need several Workers or none. The Task is the place; Workers attach to
  it.
- **Asks that stay until answered.** Capy needs them because it has no inbox. Haus's @mentions and
  open Tasks cover the case.
- **A CREW.md-less design.** Rejected in favor of `WORKER.md`: an Agent's standing habits for its
  Workers span projects and shouldn't be pasted into every brief.

---

## 5. Ship order

1. **The Tasks rework** (landed, ADR 0053). Threads are deleted, Tasks become places, and cloud
   agents attach to Tasks.
2. **Drive.**
   - Migrate Files and Agent workspaces, and mount Drive on Computers.
   - Add attribution, History and Compare, and the Drive browser.
   - Add `AGENTS.md` layers and "Loaded before the first message".
   - *What you notice:* you can read and fix what an Agent knows and follows, and see who changed
     it.
3. **Projects.**
   - "New project" creates the channel, and channels become Projects.
   - Project settings: key, repos with per-Computer links, rules, Workers' default place.
   - The new sidebar (tiles, Projects, open Tasks, footer) and the Agent page Overview.
   - *What you notice:* the sidebar is about half as long, and every effort has one home.
4. **Workers.**
   - Cloud agents become Workers, with typed reports and `WORKER.md`.
   - The per-Computer "Workers can run here" switch, worktree runs on any granted Computer using
     its logins, and the direct-steer composer on Worker cards.
   - *What you notice:* "fix these six bugs" becomes six Workers spread across the mini, the
     MacBook and the cloud, each reporting back to the Task.

Each phase that changes prompt text (Drive rules, Projects, Workers) follows the guarded prompt
contract in AGENTS.md: a divergence-register row, a cap raise, and a `tune-agent-behavior`
baseline.

## 6. Housekeeping

- **ADR numbers are settled.** 0052 is memory, and the Tasks rework landed as 0053. ADR 0053's
  Status still reads "Not yet implemented" and should say it landed.
- **The internal "jobs" name** in `specs/jobs.md` no longer collides, because the noun chosen is
  Worker. `specs/workers.md` already uses "worker" for background agent work in an older
  sense; reconcile or rewrite it when Workers land.
- **This proposal splits into three ADRs**: Drive, Projects and Workers. Each cites this proposal
  and the decisions above.
