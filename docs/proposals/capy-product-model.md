---
summary: Proposal (not a decision) to adopt Capy's connected product model in a Haus shape — every Agent works like a Capy Captain, it runs crew Jobs on any Computer or in the cloud, Projects absorb Boards and give each project one channel, and one Drive holds files, memory and layered AGENTS.md rules. Channels remain the place where agents talk to each other in the open. Covers how Capy fits together, where today's Haus pieces fight, the target model, alternatives, phases and open questions.
read_when:
  - deciding Haus's product direction for projects, crew or parallel agent work, Drive, or layered instructions
  - changing Boards, Files, Cloud Agent work, Open Threads, the sidebar, or the Agent profile page in a way that moves toward or away from this model
  - comparing Haus with Capy, Captains, crew threads, or Capy Drive
---

# Proposal: a Capy-shaped Haus

Status: proposal, 2026-11-18. Nothing here is decided. It is meant to be grilled, and then split
into ADRs.

Research inputs (outside the repo) are in the shared notes folder: `capy-bundle-findings.md` (Capy
0.9.2 client bundle), `capy-docs-findings.md` (public docs and the full changelog), plus
screenshots of the installed app (Captains Cap and Forge, project Engineering).

## The pitch in five lines

1. **Every Haus Agent is already a Captain.** It has a persona, memory, and one long-lived
   session. What it lacks is a **crew**. Add one: **Jobs**, parallel workers that start from a
   brief and report back in a typed way.
2. **Jobs run wherever the work is.** The Agent lives on its home Computer, and its Jobs run on
   any attached Computer (the mini, the MacBook) or a cloud provider. Cloud Agent work becomes one
   kind of Job.
3. **Projects absorb Boards, and each project gets one channel.** A project is a room plus its
   Tasks, its Drive folder, its rules and its repos. Freestanding channels go away.
4. **One Drive.** Files, Agent memory, `AGENTS.md`/`CREW.md` rules, attachments and reports
   become one versioned tree that people and Agents both read. What an Agent knows and follows is
   finally visible.
5. **Channels stay the agents' common room.** Agents coordinate where humans can see it: in
   project rooms, Threads and Tasks. There are no hidden agent-to-agent DMs and no background
   messaging bus. This is the part of Haus that Capy lacks, and we keep it.

The result has fewer nouns than today's Haus, not more (see [What is deleted](#what-is-deleted)).

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

- You create a Captain directly, by promoting a thread ("when you keep asking it to start other
  threads"), or by promoting a folder, whose threads become its crew. Demoting a Captain releases
  its crew.
- A Captain is scoped to one project, and its crew must be in the same project. It always acts as
  its owner.
- **Crew report with a typed tool call**, not free text: `message_agent` with no `to` and `state`
  set to `final` or `needs_you`. This becomes a `thread_completion` event with `{outcome, summary,
  ask, needs: captain|person, pullRequests[], attachments, references}`. A `working` report stays
  in the crew thread and never wakes the Captain. Subagents use a separate `task_completion`.
- The Captain's Drive holds `AGENTS.md` (its own rules; crew does not read it), `CREW.md` (read by
  every crew thread on every turn), `NOTES.md` (its plan), `DIGEST.md`, and the folders
  `reports/`, `renders/` and `handoffs/`. Crew leave deliverables there, and reports cite them **by
  version**. In the app, Cap's Overview pane shows "Drive 19" with `reports/OVER-2.md` and
  `renders/OVER-2/*.png`.
- **"Crew runs on"** picks the cloud or one paired device for the whole crew. Threads can move
  between cloud and devices with their branch ("Continue on").
- The daily loop Capy teaches: one Captain per area, feed it lists, Linear or Slack items, and
  automations, read only "Needs you", answer in one line, teach with "from now on" rules that the
  Captain writes into `CREW.md`, and a human merges every PR.

### Projects, Issues, Drive, Instructions

- **Project**: repos (primary and lazy), setup and snapshots, env and secrets, MCP servers,
  members, and the **code** that prefixes thread numbers (`ENG-1`, `OVER-2`). A thread can never
  change project.
- **Issues**: Capy's own tracker, not a Linear sync. Statuses run backlog → canceled, with custom
  states on top, plus priority, sub-issues, blocks, comments and linked PRs and threads. **An
  assignee can be a person or an agent (`kind: user|jam`)**, so Captains create and own issues.
  The thread that owns an issue wakes on its activity. **(?)** Whether assigning an issue spawns a
  thread on its own is unclear; there is no endpoint for it.
- **Drive**: volumes scoped to org, project, user, project+user, automation, or Captain. Content is
  stored by hash and versioned (`autosave | checkpoint`), and **every version records the thread
  and the author**. Drive has History, Compare, Restore, concurrent-write merge, and protection
  against mass deletes. On a machine it mounts as a lazy filesystem, so agents use ordinary file
  tools. Files open beside the chat.
- **Instructions**: an `AGENTS.md` at each scope (Organization, Project, You, You in project,
  Captain), plus repo files. The **"Loaded before the first message"** panel showed this org at
  about 2.8k tokens: Haus 359, Engineering 662, 12 skills 1.7k. Files are capped at about 32k
  characters, and a file that doesn't fit is marked "cut to fit".
- **Automations**: a stored prompt with triggers (cron, GitHub, Slack, Sentry, Linear, webhook, on
  demand), an optional plain-language `run_when` gate, and either a new thread per run or one
  standing thread.
- **Memory**: an experiment, now paused, that stores topic files plus an index in Drive. Durable
  preferences actually live in personal `AGENTS.md` and Captain `NOTES.md`.

### Attention and communication

- There is **no inbox page**. Attention comes from typed **asks** (`kind: conversation |
  environment | mcp | credits | …`, plus text), which **stay open until answered or dismissed**.
  `crewNeedsYou` rolls crew asks up onto the Captain's sidebar row as a blue count. Captains-first
  sidebar sections are `asks | working | recent | settled`.
- **There are no channels.** The unit of collaboration is the thread, and it can have several
  human members. **Agents talk to each other by wake events**: a message to another thread arrives
  as a steer, and the reply wakes the sender. Captains can read and message each other. Capy's own
  docs contradict each other on whether they should do so by default.

### What makes it feel good

Three things work together. **Parallel work you can watch**: each crew thread has a PR, a status,
and the question it is waiting on. **State in files, not in chat**: the plan, rules and reports
live in Drive, so the Captain never has to "remember". **One place to look**: Needs you rolls up to
the Captain. The weak spots are visible too. Agent-to-agent traffic is invisible to humans, there
is no shared room where several agents and several humans think together, and an agent's identity
is fragmented across hundreds of throwaway threads.

---

## 2. Today's Haus, piece by piece

| Capy | Closest Haus piece | Gap |
| --- | --- | --- |
| Captain | **Agent**: persona, `MEMORY.md`, one global session (ADR 0011), DM | No crew. Its rules and memory are hidden in a Computer-local workspace that only Owners and Admins can open. |
| Crew thread | **Cloud Agent work** (Cursor, Claude) | Cloud only and provider-opaque, reports in prose through the inbox, and cannot run on your own Computers. |
| Subagent | Claude Code background sub-agents (cap 4) | Fine as is: invisible helpers for bulk reading. Keep. |
| Thread (agent context) | none | Haus's **Thread** is a *conversation*, a different noun with the same name. |
| Project | **Board** (key `SEC`) and, informally, a **channel** | Two half-projects. A Board has a key and Tasks but no room, files or rules. A channel has a room but no key, tasks or files. |
| Issue | **Task** (ADR 0051): assignable to a person or an Agent | Close already. It lives on a board that is detached from any room. |
| Drive | **Files** (shared, revisioned), **Workspace** (Agent-private, Computer-local), **Attachments**, **Pages** (into the workspace) | Four stores. Revisions carry no thread attribution, and there is no Compare. |
| Instructions | Managed prompt, Server-held conversation style, `MEMORY.md` | No layer people can edit and no project rules. Nobody can see what an Agent loads. |
| Asks / Needs you | Inbox (unread only, ADR 0038), @mention notifications, Open Threads lens (ADR 0051, proposed) | A question you read but didn't answer vanishes from the Inbox. |
| Automations | Triggers (ADR 0027) and Reminders (ADR 0016) | Equivalent enough. Keep. |
| Devices + "Crew runs on" | Computers, with the Agent pinned to one forever | An Agent cannot do work on a machine other than its own. |

### Where they fight each other

1. **Four ways to track work.** Claims, Tasks, Cloud Agent work, and the Open Threads lens all
   answer "what is in motion?". Each has its own status vocabulary (claim tiers, column
   categories, ADR 0041 provider states, the Open Threads rollup).
2. **Two places for "a project".** A person files `SEC-12` on a Board, discusses it in
   `#security`, and the Cloud Agent work lands in a Thread in some third channel. Nothing ties them
   together except an Agent's diligence.
3. **Four file stores, and the important ones are hidden.** The files that steer behavior
   (`MEMORY.md`, notes, skills) live where most members can never look. ADR 0052 already concedes
   this: "the planned Drive work moves MEMORY.md somewhere members can read and edit."
4. **Serialized Agents.** One turn at a time per Agent (ADR 0011) is right for a teammate's voice
   and wrong for a backlog. Today the only parallelism is "make more Agents" or a cloud provider.
5. **"Thread" means a conversation.** Capy's power is in agent contexts. Haus must not rename its
   conversation Thread. The crew needs its own noun.
6. **Machines are a cage.** An Agent's Computer is permanent, so work that needs the MacBook's
   checkout or the mini's GPU can only be done by a different Agent.

---

## 3. Recommended target model

### The object model

Seven nouns a person needs to know, down from about eleven today.

```
Haus (Server)
├── People and Agents          members; an Agent lives on one home Computer
├── Projects  ENG, SEC, …      one room (a channel) · Tasks · Drive folder · rules · repos
│   └── Tasks  ENG-41          work with one assignee, a person or an Agent
│       └── Jobs               crew runs working the Task, anywhere
├── Conversations              project rooms, DMs (person↔Agent), Threads on any message
└── Drive                      one tree: Haus/, projects/, agents/, people/
```

**Agent** keeps ADR 0011: one identity and one global session, so it remembers your DM while
answering in a room. That session is now its *coordinator* voice, the Captain. Every Agent can run
a crew. There is no promote step and no separate Captain noun; Capy needs promotion only because
its default unit is a disposable thread.

**Job** is the crew. It is a separate agent context the Agent launches to work one Task in
parallel. It:

- starts blank from a **written brief** (Capy's rule, and ours already: fork sub-agents are off);
- reads the Haus, project and agent `CREW.md` rules plus the repository's own `AGENTS.md`;
- runs **on any Computer the Agent may use, or on a cloud provider**: `--on mini`,
  `--on macbook`, `--on cursor`, `--on claude`. The project's default is "Crew runs on: mini";
- acts **as its Agent**. Its messages show as "Forge · ENG-41". There are no new member
  identities;
- has exactly one Task. A Job with nothing to track first creates a Task. That is cheap, and it
  is what puts the whole queue on one list;
- ends with a **typed report**: `done | needs-you | failed`, plus summary, ask, PRs, and Drive
  files cited by version. A `working` note stays in the Job's Thread and wakes no one.

**Cloud Agent work becomes a Job whose place is a provider.** ADR 0044's record survives almost
unchanged: standalone, linked from Messages, with a live card. What changes is that the place
widens to include Computers, and the report gains a type. "Job" is a product noun; the internal
`specs/jobs.md` background-jobs concept gets renamed (Server jobs) to make room.

**Project** is a Board that grew a room. It has a key, columns (with ADR 0051's categories), a
channel, a Drive folder, an `AGENTS.md`, optional repos with a per-Computer folder link, and a
default place for Jobs. The fixed General board, `GEN`, becomes the **Haus** project, and `#all`
is its room.

**Task** is ADR 0051 unchanged, except that its board is now its project. It still has no
comments; its discussion happens in the room and in Threads, and Jobs and PRs show on it.

**Thread** stays exactly Haus's: a conversation on a message. A Job's live log and report land in
**its Thread**, on the launch message in the project room. This is ADR 0044's work Thread, made
the rule.

### The multi-machine part (your MacBook/mini point)

This is realistic, because a Job does not need the Agent's workspace or session, only a brief,
rules, a checkout and a runtime:

- **The Agent stays home.** Its session, `MEMORY.md` and skills stay on its home Computer, so
  ADR 0019's ownership boundary holds.
- **Jobs travel.** The Server assigns a Job to a Computer the same way it assigns Agent turns
  today, and mints a runner credential scoped to that Job. The target Computer runs a fresh Claude
  Code or Codex session in a **worktree of the project's repo folder linked on that machine**. It
  reads Drive rules from the Server and writes deliverables back to Drive.
- **Who may use a Computer** stays an Owner/Admin grant ("Agents may run Jobs here"), like Capy's
  per-device agent access. A Computer reports which project repos it has linked, so "Crew runs
  on" shows only machines that can do the work.
- **Not in v1:** moving a running Job between machines ("Continue on"), and moving an Agent's home.
  A Job is short, so stop it and start a new one elsewhere with the same brief.

So the operator shape you described becomes literal. You talk to one Agent, and work happens on
whichever machine has the right checkout, hardware or login.

### How a day works

- **8:40.** Zach opens Haus. The **Inbox** shows two unread rooms and **one Ask**: Forge's Job on
  `ENG-41` wants to know whether the fonts PR should also cover iOS. He answers in one line in the
  card. The Ask closes and the Job resumes.
- **8:45.** In Forge's DM: "Here are 6 bugs from the TestFlight feedback. Fix each as its own
  PR." Forge files `ENG-52…57` in the Engineering project, assigns them to itself, and starts six
  Jobs: four on the mini, and two on the MacBook because they need the signed iOS simulator setup.
  The **Engineering** project's Overview shows six rows going to `Working`.
- **10:10.** Three Jobs report `done` with PRs. Forge reads the reports and posts one line in
  `#eng`: "3 of 6 ready for review: ENG-52, 54, 55." Zach reviews the PRs from the project's
  Overview.
- **11:00.** Zach: "From now on, run the e2e lane before calling a PR ready." Forge writes it into
  `agents/forge/CREW.md`. Every later Job sees it, and Zach can open the file and see the diff.
- **14:00.** Cap, the security Agent, needs Forge's help with a token-rotation change. It does not
  DM Forge. It assigns `ENG-60` to Forge with a line in `#eng` that mentions `@forge`. Zach sees
  the exchange in passing.

### Where channels live

**One room per project, and no freestanding channels.** "New channel" becomes "New project"; a
project with no Tasks and no repos *is* simply a channel with a folder. Existing channels each
become a project. `#all` is the Haus project's room. DMs stay person↔Agent.

Rejected: many channels per project. That brings back the "which channel?" decision and splits a
project's discussion. Where a Slack-like topic split is needed, Threads already do it.

### How cross-agent communication works

The rule is simple: **agents coordinate where people can see them.**

| From → to | Mechanism | Visible where |
| --- | --- | --- |
| Agent → another Agent | @mention in a project room or Thread, or assign it a Task | That room |
| Agent → its Jobs | Brief at launch, `haus job send`, and `CREW.md` rules | The Job's Thread |
| Job → its Agent | Typed report (`done / needs-you / failed`), delivered to the Agent's inbox and posted in the Job's Thread | The Job's Thread and the project Overview |
| Job → a person | `needs-you` with `needs: person`, which becomes an **Ask** | The person's Inbox |
| Job → another Job | Not allowed. They go through the Agent or a Task. | n/a |

There is no background bus and no agent-to-agent DM (CONTEXT.md already forbids those). This is
the opposite of Capy's choice, on purpose. Capy's crew reports are structured and good, so we take
them. Capy's Captain-to-Captain steers are invisible, and they are exactly what makes multi-agent
systems spooky, so we don't.

### Attention: Asks

Capy's best attention idea is that **a question stays open until it is answered**. Haus's Inbox
loses a read-but-unanswered @mention. Proposal: an **Ask** is a typed record that a Job's
`needs-you` report, or an Agent's explicit `haus ask`, creates. It is an Inbox item that clears
when the person **answers it** (replies in the card) or **dismisses** it. Reading never clears it.

This qualifies ADR 0038. The reason ADR 0038 deleted Needs you was that *a human had to mark items
Done*. An Ask is resolved by the answer itself, so it doesn't bring that chore back. An Agent's
avatar tile shows its open Ask count, which rolls up its Jobs' Asks, as Capy does.

### The human surfaces

**Sidebar**

```
 🔍 Search                          
 📥 Inbox                         3   ← unread + Asks + Tasks assigned to you
 ───────────────────────────────────
 Agents
  [🐧 Cap •1] [🦊 Forge] [👻 Cove]     ← tiles; a dot means working, a number counts open Asks;
                                         click = that Agent's page (your DM + Overview)
 ───────────────────────────────────
 Projects                          +
  ▣ Engineering   ENG   6 jobs
  ▣ Security      SEC
  ▣ Finance       FIN
  ▣ Haus                             ← #all
 ───────────────────────────────────
 In motion                            ← ADR 0051's Open Threads lens: Jobs + followed Threads
  ENG-41 Composer fonts   Forge · Ready for review
  ENG-55 Crash on launch  Forge · Working 4m · mini
  SEC-12 Token rotation   Cap · Needs you
 ───────────────────────────────────
 ☰ Tasks   ◫ Drive   ∿ Activity   ⚙         ← footer icons, as in Capy
```

The rows for Files and Search, the Tasks row with its expanding board list, and the Direct messages
section are gone. Agent DMs are the tiles.

**Agent page** (Captain view): clicking a tile opens the **DM on the left** and an **Overview pane
on the right**:

- **Asks**: open questions from this Agent and its Jobs, each answerable in place.
- **Crew**: running and recent Jobs, one row each: `ENG-55 · Crash on launch · Working 4m ·
  mini · PR #812 checks running`.
- **Tasks**: Tasks assigned to it, grouped by category.
- **Drive**: its folder as thumbnails (`MEMORY.md`, `AGENTS.md`, `CREW.md`, `reports/…`), opening
  beside the chat with History and Compare.
- **Rules**: "Loaded before the first message", for example `2.6k tokens · Haus 340 · Forge 410 ·
  MEMORY 1.2k · 9 skills 640`.

The header keeps today's density: avatar, name, role line, model, and home Computer. Settings and
profile go behind the `•••` menu.

**Project page**: the room is the main pane, and the Overview pane holds **Tasks** (a compact
board by category), **Jobs in motion**, **Drive** (the project folder), **Rules** (its
`AGENTS.md`), and **Repos** ("linked on: mini, macbook"). A Tasks tab opens the full board.

### Drive

One tree, built on today's Files contract (paths, compare-and-set writes, revisions):

```
AGENTS.md                         Haus rules (Owners and Admins edit)
projects/eng/AGENTS.md            project rules
projects/eng/…                    docs, reports, room attachments
agents/forge/AGENTS.md            Forge's own rules (Forge and Owners edit), replacing the Server "conversation style"
agents/forge/CREW.md              rules every Forge Job reads
agents/forge/MEMORY.md            ADR 0052's capped memory, now visible
agents/forge/reports/ENG-41.md    Job deliverables, cited by version
people/zach/                      personal; DM attachments land here, visible to you and that Agent
```

Additions to Files:

- Every revision records **the Job, Thread or person that wrote it**.
- **History and Compare** beside the chat.
- Retention extends while a report still cites a revision.

The **Workspace** stays the Agent's machine-local scratch and checkout, an execution detail like
Capy's machine, and the human Workspace pane retires. **Pages** become Drive files.

**Rule delivery.** The Haus `AGENTS.md`, the Agent's `AGENTS.md` and `MEMORY.md` reach the main
session through the ADR 0052 receipt mechanism: delivered in the turn input when they changed. A
project's `AGENTS.md` is delivered the first time a turn acts in that project's room in a session,
and again whenever it changes. A Job gets the full stack at launch, plus a fresh `CREW.md` on every
turn (Capy's rule).

### What is deleted

| Goes | Replaced by |
| --- | --- |
| Boards as their own concept, the board list in the sidebar | Projects (a Board becomes a project, its key is kept) |
| Freestanding channels, "New channel" | Project rooms |
| Files section, human Workspace pane, Pages-in-workspace | Drive |
| Cloud Agent work as a noun; ADR 0041's provider-mirror vocabulary as the status language | Jobs, with places `computer:<name>`, `cursor`, `claude`, and one status set |
| Server-held conversation style | `agents/<handle>/AGENTS.md` |
| Direct messages sidebar section | Agent tiles |
| Attachments as copies that live only on their message | Drive files in the conversation's folder, linked from the message |
| An Agent's permanent tie to one Computer *for work* | A home Computer for its session, and Jobs anywhere it is granted |

Kept as they are: Agents with one global session, Threads, Tasks, claims (still invisible),
Reminders, Triggers, the Inbox, the Activity log, harness sub-agents, MCP connections, and Cove.

---

## 4. The two strongest alternatives

### A. Port Capy literally: threads are sessions, Captains replace Agents

Every conversation becomes an agent context with its own machine, and Captains are promoted
threads. Channels shrink to one per project, used only by humans, and agents coordinate through
background steers.

**Why not.** It discards ADR 0011's central idea, that an Agent is a teammate who remembers your
DM in a room, and replaces it with hundreds of disposable assistants. It removes the visible
multi-agent conversation that makes Haus different, and it means rebuilding the delivery, inbox,
claim and Thread machinery to end up as a worse Capy. The parts of Capy worth having (crew, typed
reports, Drive, rules, projects) do not need thread-as-session.

### B. Take only Drive and rules

Unify Files and memory into Drive, add layered `AGENTS.md`, and change nothing else.

**Why not.** It is cheap and good, and it is Phase 1 below. On its own, though, it misses the gap
you feel most: Agents cannot work in parallel where you can watch, on the machine that has the
checkout. It also leaves four work trackers and two half-projects in place. It adds a fifth store
of truth instead of collapsing the others.

---

## 5. Migration path

Each phase ships something you will notice in a day's use. The order puts the cheapest visible win
first and the biggest infrastructure last.

**Phase 1: Rules you can see.**
- Files becomes Drive, with `AGENTS.md`, `agents/` and `people/` roots.
- `MEMORY.md` moves into `agents/<handle>/` and is delivered by ADR 0052's receipt.
- Haus and agent `AGENTS.md` layers, with "Loaded before the first message" on the Agent page.
- Revision attribution and Compare.
- *What you notice:* you can read and fix what Forge remembers and follows, and see who changed
  it.

**Phase 2: Crew, in the cloud first.**
- Cloud Agent work becomes Jobs: a typed report, one Task per Job, and the Job's Thread as the
  rule.
- The Agent page gets its Overview pane (Asks, Crew, Tasks, Drive), and the Inbox gets Asks.
- `CREW.md` arrives.
- *What you notice:* "fix these six bugs" becomes six watchable rows that report back, and a
  question stays open until you answer it.

**Phase 3: Projects.**
- Boards become projects. Each existing channel joins a project or becomes one, `GEN` becomes Haus,
  and `#all` becomes its room.
- Project `AGENTS.md`, the project Overview, and the new sidebar (tiles, Projects, In motion,
  footer icons).
- Retire the Files row, the board list and the DM section.
- *What you notice:* one place per effort, and a sidebar about half as long.

**Phase 4: Crew on your machines.**
- Jobs on any granted Computer: per-Computer repo links, Job-scoped runner credentials, a
  worktree per Job, and a concurrency cap per Computer.
- "Crew runs on" as a project default and a per-Job override.
- Attachments move into Drive.
- *What you notice:* the mini and the MacBook both do the work, and you never pick an Agent by
  which machine it lives on.

Raft parity: Phases 2 and 3 change prompt text (crew reports, project rules, Asks). Each one
needs its own divergence-register rows and a cap raise per the AGENTS.md prompt contract. The
behavior baseline gates through `tune-agent-behavior`.

---

## 6. Open questions for Zach

1. **Asks.** Is an Inbox item that clears only by answering or dismissing acceptable, given ADR
   0038? (Recommended: yes. The answer is the clearing action, so no Done chore comes back.)
2. **Every channel becomes a project.** Is the folding of all channels into projects too strong?
   Any channels you want kept as a plain room?
3. **Naming.** Keep *Agent* (recommended) or adopt *Captain*? Use *Job* for the crew, or *crew
   run*, or another word? It cannot be *thread*.
4. **Talking to a Job directly.** Capy lets you reply in a crew thread. Recommended: yes. A reply
   in a Job's Thread steers that Job, and its Agent sees the report. The alternative is that
   everything routes through the Agent.
5. **Memory visibility.** Should `agents/<handle>/MEMORY.md` be readable by every member, which
   exposes what the Agent learned in DMs (the leak ADR 0052 closed for dreams), or only by Owners
   and Admins? Or should private lines live under `people/<you>/`?
6. **A personal rules layer.** Do we want a `people/<you>/AGENTS.md` ("how to work with me") that
   every Agent reads when you address it? Capy has one. It costs prompt bytes on every turn where
   you appear.
7. **One Task per Job.** Is it acceptable that a research Job also creates a Task? (Recommended:
   yes, it is what makes "what is in motion?" one list.)
8. **Jobs on other Computers.** Which grant model: per-Computer "Agents may run Jobs here", or per
   Agent per Computer? And should a Job on a Computer use that machine's own runtime logins
   (Computer model access already allows this)?
9. **Open Threads.** Ship ADR 0051's lens now as the future "In motion" list, or hold it until
   Jobs exist so it lands once?
