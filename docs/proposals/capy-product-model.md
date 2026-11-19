---
summary: Proposal for a Capy- and Amp-informed Haus. v1 was grilled with Zach and settled on 2026-11-18. v2 (2026-11-19) adds Amp and asks why each product made its choices. Agents own an area, belong to one Project, and coordinate Workers. Workers are quiet, scoped parallel runs attached to a Task, and they run on any granted Computer or in the cloud. Humans create Projects, and each Project is its channel. One versioned Drive holds memory, AGENTS.md and WORKER.md rules, and reports. Agents coordinate in the open. Covers Capy, Amp, why they converge, the model, the v2 decisions Zach accepted, alternatives, ship order and housekeeping.
read_when:
  - deciding Haus's product direction for projects, workers or parallel agent work, Drive, or layered instructions
  - changing Files, Agent workspaces, cloud agents, the sidebar, the Agent page, or Computers in a way that moves toward or away from this model
  - deciding whether an Agent belongs to a Project, or what an Agent hears in a channel
  - writing the ADRs that split this proposal (Drive, Projects, Workers)
  - comparing Haus with Capy (Captains, crew threads, Capy Drive) or Amp (threads, orbs, runners, Puck, Spaces)
---

# Proposal: Haus, after Capy and Amp

Status:
- **v1 was settled on 2026-11-18.** It was grilled with Zach.
- **v2 was accepted by Zach on 2026-11-19.** It adds Amp as a second reference and asks, for each choice,
  why Capy or Amp made it and whether Haus has the same problem.
- Most of v1 holds. v2 changes are marked **(v2)**, and §7 lists them.

[ADR 0053](../adr/0053-channels-and-tasks-are-the-only-places.md) landed on main on 2026-11-19.
It deleted Threads, made Tasks places, and attached cloud agents to Tasks. This proposal treats it
as a step on the way, not a constraint: where the two disagree, this proposal says so.

Research inputs are in the shared session notes folder, outside the repo:
- `capy-bundle-findings.md`, from the Capy 0.9.2 client bundle
- `capy-docs-findings.md`, from Capy's public docs and full changelog
- `amp-findings.md`, from Amp's current docs and all 187 news posts through 2026-11-17
- screenshots of the installed Capy app

## The thesis

Capy and Amp were built independently and arrived at the same shape:
- **A persistent coordinator you talk to.** Capy calls it a Captain. Amp has Puck and the Space
  agent.
- **Disposable, scoped runs that do the work where the work is.** Capy has crew threads. Amp has
  threads running on orbs or runners.
- **One place per unit of work.** It shows status, the PR, and whether it needs you.

Both lack the thing Haus has: a room where several agents and several people work in the open.
Capy's agents steer each other where no one can see. Amp's Space has one agent, which ignores
people until they @mention it.

**Haus is their shape, with our room.** In five lines:

1. **An Agent owns an area.** It belongs to one Project (v2), works there, and hears everything
   said there. Anywhere else it answers when @mentioned. It has a persona, memory, and one
   long-lived session (ADR 0011).
2. **Agents run Workers where the work is.** A Worker is a scoped run attached to a Task. It runs on
   any Computer that allows it, or on Cursor or Claude in the cloud, and ends with a typed report.
3. **Humans create Projects, and each Project is its channel.** A Project carries a key, repos,
   rules, its Agents, and the default place for Workers.
4. **One Drive.** Memory, rules and reports live in a versioned, attributed Drive that everyone can
   read.
5. **Quiet by default (v2).** Workers report outcomes, not progress. You are pulled in only when
   work is done, blocked, or needs you, and agents coordinate where you can see them.

---

## 1. Capy

Verified against the bundle, the docs and the running app. **(?)** marks uncertain points.

- **One primitive.** Every agent context is a *jam*:
  - a thread is a top-level jam
  - a Captain is a long-lived jam with a persona and its own Drive
  - a crew thread is a full thread linked to a Captain
  - a subagent is a child that starts from its prompt and reports to its parent
  - a side chat is a fork that never reports back
- **Waking and status.** Threads wake on events: messages, CI, reviews, merges, timers,
  subscriptions, issue activity, and reports from other agents. Status is
  `working | waiting | idle | failed | archived`, and "Needs you" is a separate flag.
- **Captains and crew.**
  - A Captain is scoped to **one project**, and its crew must be in the same project.
  - Crew report by typed tool call: `final` or `needs_you`, with an outcome, a summary, an ask,
    `needs: captain|person`, PRs, and Drive references by version.
  - The Captain's Drive holds `AGENTS.md` (its own rules), `CREW.md` (read by every crew thread on
    every turn), `NOTES.md`, `DIGEST.md`, and the folders `reports/`, `renders/` and `handoffs/`.
  - "Crew runs on" picks the cloud or one paired device. Each device owner grants agent access
    separately, and device work uses that device's own credentials.
  - People can reply in a crew thread directly. That arrives as a steer, and the Captain hears
    about it.
- **Projects** are mostly settings: repos, setup, secrets, MCP, members, and the code that
  prefixes thread numbers. Humans create them.
- **Issues** are a separate tracker. They link to threads and can be assigned to a person or an
  agent. **(?)** Whether assigning one spawns a thread is unclear.
- **Drive** is made of scoped volumes:
  - content-addressed and versioned, with every version attributed to the thread and author that
    wrote it
  - History, Compare and Restore
  - mounted lazily on machines
- **Instructions** are an `AGENTS.md` per scope, shown in a "Loaded before the first message"
  token breakdown.
- **Attention** comes from typed asks that roll up onto the Captain's row. Capy needs them because
  it has no inbox and no channels.
- **The daily loop Capy teaches:** one Captain per area, feed it work, read only "Needs you",
  answer in one line, teach with "from now on", and a human merges every PR.

## 2. Amp

Read from Amp's current docs and news feed, through 2026-11-17.

- **The thread is the unit of work.** It has a `T-…` URL and opens on every client. Each thread
  belongs to at most one project.
- **Where a thread runs is chosen per thread.** That is separate from where you watch it. The
  places are:
  - a fresh cloud VM per thread (an *orb*)
  - one of your machines (a *runner*), with a worktree per thread
  - the local CLI

  A project's **Default Orb** setting decides where new threads run, and agents can pick a place
  when they spawn work. Shared runners let teammates start threads on your machine, which run
  with your credentials.
- **Coordinators.**
  - **Puck** is a per-user coordinator, reachable on the web, in Slack, by voice and over MCP. It
    starts, monitors and steers agents.
  - **Spaces** (2026-11-06) are a team chat with one agent that spawns threads and shows each as a
    live card with status and whether it needs someone. A Space is bound to at most one project
    but can start threads in others.
  - Neither coordinator is bound to a project the way a Captain is.
- **Agent to agent.** Threads start threads, send explicit messages and file transfers, and get
  reports back. Subagents get only what the parent gives them and return a summary.
- **Attention is designed for silence:**
  - "Snooze Until I'm Needed" resurfaces a thread only when there is real news.
  - Scheduled runs with nothing new stay hidden.
  - Slack gets one link, then nothing until the work finishes or is blocked.
  - In a Space, the agent ignores people talking among themselves until someone @mentions it.
- **The thread owns its PR.** The thread that opens a PR subscribes to its comments, reviews and CI.
  Commits carry an `Amp-Thread-ID` trailer, and Spaces count work as shipped from it.
- **There is no memory feature.** Durable knowledge lives in:
  - searchable threads, read by a subagent
  - `AGENTS.md`
  - skills and prompts stored in hosted git repos
  - editable, revisioned artifacts
- **Amp deletes things.** Fork, handoff, public threads and the model dial are all gone. "If you
  have the patience to watch your agents work, you're giving them too short a leash."

---

## 3. Why they do what they do, and what Haus takes

| Choice | Capy | Amp | Why they do it | Haus |
| --- | --- | --- | --- | --- |
| A persistent coordinator and disposable runs | Captain and crew | Puck or a Space, plus threads | One context can't hold parallel work, and a person wants one voice to talk to. | **Agent and Workers** (v1) |
| Where work runs | "Crew runs on", per Captain | Default Orb per project, overridable per thread | Repos, checkouts and logins live on machines. | **Default place on the Project, overridable per Worker** (v1). Amp shows the Project is the right level, not Capy's per-Captain setting. |
| Coordinator scope | One project | A Space has at most one project and reaches others; Puck has none | Capy: one owner per area, and credentials are scoped. Amp: single-player first, so the coordinator follows the person. | **An Agent belongs to one Project** (v2). Haus is a team, so it takes Capy's ownership, and the Haus project holds generalists. |
| What a coordinator hears | Wake events only | A Space ignores people until @mentioned | People talking among themselves is not a request. | **Everything in its home Project, @mentions anywhere else** (v2) |
| The unit of work owns its PR | Crew thread | The thread subscribes to comments, reviews and CI | The outcome is the PR. | **The Task holds its PRs** (ADR 0053), plus a commit trailer (v2) |
| Needs-you | A flag on the unit, plus asks | A live card marked "needs someone", plus Snooze until needed | Attention is the scarce resource. | **A `needs-you` report and an @mention. No Asks.** (v1) Both products put needs-you on the unit of work. Capy's central queue of asks exists only because it has no inbox. |
| Progress | `working` reports stay in the crew thread | Silent until done or blocked | Watching agents work wastes the person. | **Quiet Workers** (v2) |
| Memory | A paused experiment | None: threads, `AGENTS.md`, skills | Remembered facts go stale. Rules that people can edit last. | **`MEMORY.md` stays capped. "From now on" writes a rule file, and past Tasks are searchable.** (v1) |
| Agent to agent | Background steers that people can't see | Explicit messages and file transfers | Coordination needs a channel. | **In the open:** @mentions and assignment in a Project or Task (v1) |
| Pruning | — | Fork, handoff and the dial removed | Every feature is surface area. | **No forks.** A side chat is a DM with the Agent, and inline replies keep side conversations in the open. (v2) |

**The pattern behind the table.** Capy and Amp both treat a coordinator as a *manager* and a run
as a *contractor*. Neither treats agents as *colleagues*. Haus already does: agents share rooms
with people and with each other. v2 leans into that. An Agent owns an area the way a teammate
does, hears its own room, hands off to other teammates where everyone can see, and keeps its
contractors quiet.

---

## 4. The model

### Nouns

```
Haus (Server)
├── Projects    created by humans; each one is its channel
│   ├── Agents  (v2) each belongs to one Project; loop on the Server, one machine for its tools
│   └── Tasks   places for one piece of work, each in one Project
│       └── Workers   quiet, scoped runs attached to the Task, on a Computer or in the cloud
├── DMs         person ↔ Agent, person ↔ person
└── Drive       Haus/ · projects/<key>/ · agents/<handle>/
```

### Agents

- **The noun stays Agent.** There is no Captain rename and no promote step: every Agent can run
  Workers.
- **One global session and the inbox stay as they are** (ADR 0011, the inbox spec). The Agent is
  the coordinating voice. It starts Tasks, briefs Workers, reads their reports, and talks to
  people.
- **(v2) An Agent belongs to one Project.**
  - It is listed under its Project, and that Project's rules always apply to it.
  - It is the Project's first responder. It hears every message in that Project's channel and its
    Tasks.
  - Anywhere else, in other Projects and their Tasks, it hears only @mentions. DMs always reach
    it.
  - It starts Tasks in its own Project. Work that belongs elsewhere it hands to that Project's
    Agent, in that Project's channel, by @mention or assignment.
  - An Agent in the **Haus project** is a generalist. It can start Tasks in any Project and loads a
    Project's rules when it acts there. Cove lives here.
  - Moving an Agent to another Project is a setting.
  - *Why:* in a team, "who do I ask about security?" needs one answer. Ownership also gives
    cross-agent conversation a real job instead of making it compete with work.

### Tasks

- **A Task belongs to one Project, explicitly,** as a Capy thread or an Amp thread does. Where the
  request came from (a channel message, a DM, a reminder) is only where the Task started. It
  doesn't decide the Project.
- The Project gives the Task its key, and gives its Workers their repos, rules and default place.
- **A Task holds its PRs.** Pull requests and their checks wake the Agent on the Task, as ADR 0053
  built.
- **(v2) Humans can file a Task.** "New task" asks for a Project, a title and an Agent, which
  defaults to the Project's Agent. The Agent picks it up like an assignment. Capy and Amp both let
  people start work directly, and filing work shouldn't require a chat message. Every Task still
  has an Agent working it. This reverses ADR 0053's "only Agents create Tasks".

### Workers

- **A Worker is a scoped run attached to one Task.** It starts blank from the Agent's written brief
  and reads:
  - the Haus `AGENTS.md`
  - the Task's Project `AGENTS.md`
  - the repo's own `AGENTS.md`
  - the Agent's **`WORKER.md`**, on every turn

  `WORKER.md` holds the Agent's standing rules for its Workers: draft PRs, before/after renders, a
  report format. The Agent edits it when told "from now on" about its Workers.
- **It ends with a typed report:** `done | needs-you | failed`, with a summary, an ask, its PRs, and
  Drive files cited by version. The report posts in the Task and reaches the Agent through its
  inbox. A Task can hold several Workers, or none.
- **(v2) Quiet by default.**
  - A Worker never posts progress in the Task.
  - Its card shows live status, its place, and its newest report.
  - The Task gets one message per report.
  - Followers see the Task go unread only for reports and for people's posts.
- **A follow-up keeps context.** Re-tasking a Worker continues its run, as Runs do today.
- **(v2) Commits carry a `Haus-Task: ENG-41` trailer.** `git log` leads back to the Task, and a
  pushed PR attaches itself to the Task.
- **Cloud agents become Workers.** Places are `computer:<name>`, `cursor` and `claude`, under one
  noun and one status set. `haus cloud-agent start --task` becomes
  `haus worker start --task ENG-41 [--on macbook]`. Mapping today's records:
  - a cloud agent work record becomes a Worker
  - its Runs become the Worker's turns
  - its card in the attached-work panel becomes the Worker card
- **Where it runs:**
  - Any Computer whose **"Workers can run here"** switch is on. The person who attached the
    Computer, or an Owner or Admin, sets it.
  - The **default place is set on the Project**, because repos are linked per Project per Computer.
    The Agent can override it per Worker, for example when told "run it on the MacBook". This
    replaces today's per-Computer **Make default** provider setting.
  - A Worker uses **that machine's own logins** for its model runtime and git, so it can run any
    model that machine can.
  - The Agent itself runs on the Server (ADR 0057). The Worker runs on the machine: a fresh Claude
    Code or Codex session in a worktree of the project repo, with a credential scoped to that
    Worker.
  - Not in this round: moving a running Worker between machines.
- **People talk to a Worker directly.**
  - Each Worker card has its own composer. What you type goes into that Worker as a steer, or as a
    follow-up if it's idle.
  - The message also posts in the Task, marked "→ Worker on mini", so the Agent sees it through its
    inbox.
  - A plain post in the Task goes to the Agent.
  - Workers have no inbox.
- **Deliverables go in the Agent's folder**, as in Capy: `agents/<handle>/reports/`, `renders/` and
  `handoffs/`. The Task page shows the files a report cites, at the cited version.

### Projects

- **Only humans create Projects.** "New project" creates the channel; there is no "New channel".
  Every existing channel becomes a Project, and `#all` becomes the Haus project.
- **A Project is its channel.** Its settings, behind the header menu, hold:
  - its key (one per Project), which prefixes its Task numbers
  - its Agents (v2)
  - its repos, with which Computers have each one linked
  - its `AGENTS.md`
  - its default place for Workers

  As in Capy, there is no separate Overview pane.

### Drive

- **A full migration, copied closely from Capy.** Files and the durable files in every Agent
  workspace (`MEMORY.md`, `notes/`, pages) move into Drive. The existing file-browsing UI becomes
  the Drive browser:
  - a Drive page listing scopes: Haus, each Project, each Agent
  - files that open beside the chat
  - History, Compare and Restore
  - every version attributed to the Task, Worker, Agent or person that wrote it

  An Agent's machine-local workspace remains as execution scratch and checkouts, with no human
  surface.
- **Mounted, not pushed.** Computers mount the Drive folders an Agent or Worker can see. Edits save
  as attributed versions, concurrent writes merge or keep both, and mass deletes are held. ADR
  0052's receipt still decides when `MEMORY.md` reaches the session.
- **Everyone can read everything.** There is no privacy layer and no personal folder.
- **Attachments stay as they are.** An Agent or Worker shares a Drive file by reference, a path at
  a version.
- **Layout:**

```
AGENTS.md                        Haus rules
projects/<key>/AGENTS.md         project rules, plus project docs
agents/<handle>/AGENTS.md        the Agent's own rules (replaces the Server "conversation style")
agents/<handle>/WORKER.md        rules every Worker of this Agent reads
agents/<handle>/MEMORY.md        capped memory (ADR 0052), now visible
agents/<handle>/notes/ …         the rest of its durable workspace
agents/<handle>/reports/ renders/ handoffs/   Worker deliverables
```

- **Rule delivery (v2: simpler).**
  - The main session receives, by receipt when they change: the Haus `AGENTS.md`, its home
    Project's `AGENTS.md`, its own `AGENTS.md`, and `MEMORY.md`.
  - A generalist in the Haus project also receives a Project's `AGENTS.md` the first time it acts
    in that Project in a session.
  - A Worker gets its full stack at launch, and `WORKER.md` on every turn.
  - The Agent page shows "Loaded before the first message".
- **Where "from now on" goes.** A rule for the Agent goes in its `AGENTS.md`, a rule for its Workers
  in `WORKER.md`, and a rule for the Project in the Project's `AGENTS.md`. `MEMORY.md` holds facts.
  Both references show that rules people can edit outlast remembered facts.

### Attention

- **No Asks.** [ADR 0038](../adr/0038-inbox-is-unread-not-attention.md) stands.
- A question is an @mention. A `needs-you` report @mentions the person, so the Task goes unread for
  them and reaches their Inbox.
- The Task's sidebar row and its card in the channel show "waiting on Zach".
- Quiet Workers keep everything else out of the way.
- Revisit only if real use shows questions getting lost.

### Human surfaces

**Sidebar**, Agents first as in Capy:

```
 🔍 Search
 📥 Inbox                         3
 ───────────────────────────────────
 Agents
  [🐧 Cap] [🦊 Forge •] [👻 Cove]     ← tiles; the dot means working; click = your DM + its Overview
 ───────────────────────────────────
 Projects                          +   ← humans only
  ▣ Engineering   ENG   🦊             ← the Project's Agents (v2)
  ▣ Security      SEC   🐧
  ▣ Haus                👻             ← was #all; generalists
 ───────────────────────────────────
 Open tasks
  ENG-41 Composer fonts   Forge · 2 workers · mini, cursor
  SEC-12 Token rotation   Cap · waiting on Zach
 ───────────────────────────────────
 ☰ Tasks   ◫ Drive   ∿ Activity   ⚙       ← footer icons
```

Agent DMs are the tiles. Person-to-person DMs are reached from the Inbox and Search.

**Agent page**: your DM on the left, and an **Overview** pane on the right:
- **Working**: its open Tasks, each with its Workers, place and PR state.
- **Drive**: its folder as thumbnails (`MEMORY.md`, `AGENTS.md`, `WORKER.md`, reports).
- **Rules**: the "Loaded before the first message" token breakdown.

A **Tasks** tab lists every Task assigned to it.

**Task page**: the conversation, plus Worker cards. Each card shows its place, status, newest
report, cited files and PR, and has its own composer.

**Project page**: the channel, with settings behind the header menu.

### Runtime

[ADR 0057](../adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) settles where
Agents run, following Capy and Amp:
- **The loop runs on the Server,** in a sandboxed runner. Claude plans use the Claude Agent SDK and
  every other model uses Pi Durable. The session is stored in Postgres.
- **Each Agent has one machine where its tools run:** `bash` and an edit tool, plus the one
  `execute` tool. It can move between turns. v1 machines are Computers.
- **The Agent keeps working with its machine offline.** Only its machine work waits.
- **The Server holds the Agent's model logins.** Workers keep native harnesses and their machine's
  logins.
- **agent-desktop and agent-browser are built in.** User-configured local MCP is descoped.

### Cross-agent communication

Agents coordinate where people can see them:
- One Agent reaches another with an @mention in a Project or Task, or by assigning it a Task.
- A handoff to another Project's Agent happens in that Project's channel (v2).
- An Agent reaches its Workers through the brief, `haus worker send`, and `WORKER.md`.
- Workers report through typed reports in the Task.
- Workers never talk to each other. There are no agent-to-agent DMs and no background steers.

### What is deleted

| Goes | Replaced by |
| --- | --- |
| "Cloud agent" as a noun and CLI family | Workers (`haus worker`) |
| Freestanding channels, "New channel" | Projects, created by humans |
| The Files section, the human Workspace pane, Pages in the workspace | Drive |
| Computer-local `MEMORY.md` and `notes/` as the source of truth | `agents/<handle>/` in Drive |
| Server-held conversation style | `agents/<handle>/AGENTS.md` |
| The Direct messages sidebar section | Agent tiles |
| Per-Computer **Make default** provider | The Project's default place |
| An Agent's lock to one machine for its work | A Server-side session with a movable machine for its tools (ADR 0057), and Workers anywhere they're allowed |
| (v2) An Agent hearing every channel it has joined | Its home Project, plus @mentions |

Kept: Agents with one global session and the inbox, Tasks as places, claims, Reminders, Triggers,
the Inbox (unread only), Activity, harness sub-agents, MCP connections, and Cove.

### Walkthroughs

The cast: Zach and Priya; **Forge**, whose home is Engineering (`ENG`); **Cap**, whose home is
Security (`SEC`); and **Cove**, a generalist in the Haus project. There are two Computers: the
**mini**, Forge's and Cap's home, and Zach's **MacBook**. Both have "Workers can run here" on.
Engineering's default place is the mini.

**1. Six bugs, three machines.**
- Zach, in Engineering: "@Forge Friday's QA list has six composer bugs. Fix them."
- Forge replies once ("On it, ENG-41") and starts **ENG-41 Composer QA fixes** in Engineering.
- In ENG-41 it starts six Workers:
  - three on the mini, Engineering's default
  - two on Cursor, because those bugs need no local state
  - one on the MacBook, because that bug needs the iOS Simulator signed in there
- The Task stays quiet while they work. Each Worker card shows live status, and the sidebar row
  reads "Forge · 6 workers · mini, cursor, macbook".
- Reports arrive one message each. Four are `done`, each with a draft PR and before/after renders
  in `agents/forge/renders/`. One is `failed` with a flaky test, so Forge re-tasks that Worker
  with a narrower brief. One is `needs-you`: "@Zach the iPad baseline moves 2px with the fix. Is
  that intended?" ENG-41 goes unread for Zach, and his sidebar row reads "waiting on Zach".
- Zach answers on that Worker's card: "Yes, match iPhone." The answer goes straight into the
  Worker as a steer and posts in the Task as "Zach → Worker on macbook".
- Every commit carries `Haus-Task: ENG-41`, so the six PRs attach to the Task themselves. Zach
  merges them, then marks ENG-41 done.

**2. A handoff in the open.**
- While working ENG-41, a Worker's report notes that the composer debug log prints session
  tokens.
- Security isn't Forge's area, so Forge posts in the Security channel: "@Cap the composer debug
  log prints session tokens since 18.1. Found in ENG-41. Yours?"
- Cap, whose home is Security, hears every message there. It replies and starts **SEC-12 Stop
  logging session tokens** from that message.
- Everyone in Security sees the handoff, and ENG-41 links to SEC-12.
- Cove, a generalist, doesn't answer: nobody @mentioned it.

**3. Zach files a Task.**
- In Security, Zach presses **New task**, types "Rotate the GitHub App private key", and leaves
  the Agent at the Project's default, Cap.
- SEC-13 opens with Cap assigned. Cap takes it like any assignment and posts a plan in the Task.
- No chat message was needed to start the work.

**4. "From now on."**
- In ENG-41 Zach writes: "@Forge from now on, every Worker attaches before/after screenshots."
- Forge adds a line to `agents/forge/WORKER.md`. Drive saves the change as a new version,
  attributed "Forge, from Zach in ENG-41".
- Zach opens the file from Forge's Agent page and uses Compare to see the one-line change.
- Every Forge Worker reads `WORKER.md` on every turn, so the rule applies from the next run.

**5. Who hears what.**
- In Security, Priya and Zach discuss the rotation window. Cap hears it, because Security is its
  home, and stays quiet because nobody asked it anything.
- Forge doesn't hear it, because Security isn't its home.
- Priya writes "@Forge does the composer hold the key anywhere?", and Forge answers in Security.
- Later Zach DMs Cap: "What's your honest read on rotating before Friday?" A side conversation
  with an Agent is a DM. Nothing forks.

---

## 5. Alternatives rejected

- **Port Capy literally:** every conversation a session, Captains as promoted threads, agents
  steering each other in the background. That discards ADR 0011's teammate who remembers your DM,
  and the visible multi-agent room.
- **Port Amp's coordinators:** a per-user Puck, and coordinators that aren't bound to a Project.
  That works for one person. In a team, a personal agent splits the room, and an unbound agent
  blurs who owns what.
- **A place picker in the human composer**, as Amp has. People talk to Agents. The place is the
  Project's default plus the Agent's call, and "run it on the MacBook" is an ordinary request.
- **Take only Drive and rules.** That misses the biggest gap people feel: parallel work they can
  watch, on the machine that has the checkout.
- **Merge the Worker into the Task**, so that Tasks run themselves. Both references keep the unit of
  work and the run separate, and a Task can need several Workers or none.
- **Asks that stay until answered.** Capy needs them because it has no inbox. @mentions,
  `needs-you` reports and quiet Workers cover the case.
- **No `WORKER.md`.** An Agent's standing habits for its Workers span Tasks, and shouldn't be
  pasted into every brief.
- **Progress messages from Workers.** They make people watch agents work.

---

## 6. Ship order

1. **The Tasks rework** (landed, ADR 0053). Threads are deleted, Tasks become places, and cloud
   agents attach to Tasks.
2. **Drive.**
   - Migrate Files and Agent workspaces, and mount Drive on Computers.
   - Add attribution, History and Compare, and the Drive browser.
   - Add `AGENTS.md` layers and "Loaded before the first message".
   - *What you notice:* you can read and fix what an Agent knows and follows, and see who changed
     it.
3. **Agents on the Server** ([ADR 0057](../adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)).
   - Every Agent moves to the Server-side runner at once.
   - The invocation contract, the result ledger, and built-in agent-desktop and agent-browser
     come with it.
   - *What you notice:* an Agent keeps talking when its Computer sleeps, and moves between
     Computers.
4. **Projects.**
   - "New project" creates the channel, and channels become Projects.
   - Project settings: key, Agents, repos with per-Computer links, rules, and the default place.
   - Home Projects, with Agents hearing their own Project plus @mentions, and human-filed Tasks
     (v2).
   - The new sidebar and the Agent page Overview.
   - *What you notice:* the sidebar is about half as long, every effort has one home, and you know
     which Agent to ask.
5. **Workers.**
   - Cloud agents become Workers, with typed reports, `WORKER.md`, and quiet cards.
   - The "Workers can run here" switch, worktree runs on any granted Computer using its logins,
     the direct-steer composer, and the `Haus-Task` trailer.
   - *What you notice:* "fix these six bugs" becomes six Workers spread across the mini, the
     MacBook and the cloud. You hear about each one once, when it's done or needs you.

Each phase that changes prompt text follows the guarded prompt contract in AGENTS.md: a
divergence-register row, a cap raise, and a `tune-agent-behavior` baseline.

---

## 7. v2 decisions (accepted 2026-11-19)

Each is marked (v2) above.

1. **An Agent belongs to one Project.** The Haus project holds generalists.
2. **An Agent hears everything in its home Project and only @mentions elsewhere.** It falls out of decision 1 and cuts noise in multi-agent rooms.
3. **Quiet Workers:** no progress messages, one message per report.
4. **A `Haus-Task` commit trailer.** It's cheap, and PRs attach themselves.
5. **Humans can file a Task assigned to an Agent.** This reverses ADR 0053's "only Agents create
   Tasks". Every Task still has an Agent.
6. **No forks.** A side conversation with an Agent is a DM, and an inline reply stays in the open
   on its message. Neither is a fork, and neither needs a new feature.

## 8. Housekeeping

- **ADR numbers are settled.** 0052 is memory, and the Tasks rework landed as 0053. ADR 0053's
  Status still reads "Not yet implemented" and should say it landed.
- **`specs/workers.md` uses "worker"** in an older sense, for background agent work. Reconcile it
  or rewrite it when Workers land.
- **This proposal is split into four ADRs:**
  [ADR 0054, Drive](../adr/0054-drive-holds-what-agents-know-and-follow.md),
  [ADR 0055, Projects](../adr/0055-projects-own-agents-and-tasks.md) (decisions 1, 2 and 5),
  [ADR 0056, Workers](../adr/0056-agents-run-quiet-workers-anywhere.md) (decisions 3, 4 and 6), and
  [ADR 0057, Runtime](../adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md).
