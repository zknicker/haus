---
status: accepted
summary: Humans create Projects, and each Project is its channel; there are no freestanding channels. A Project carries one key, repos, rules, its Agents, and the default place for Workers. Every Task belongs to one Project explicitly. Each Agent belongs to one Project, hears everything there and in the team room `#all`, and only @mentions elsewhere. `#all` is the only channel that is not a Project. Humans can file a Task assigned to an Agent. Amends ADR 0053. Accepted 2026-11-19, not yet implemented. Amended 2026-11-26 by ADR 0062: the Project key prefixes Issues, not Tasks; home Captains stop hearing the Project's Tasks ambiently; the Captain tile opens the shared Captain chat instead of a DM; and the default place for Workers becomes the default Machine for Tasks.
read_when:
  - creating, configuring, or listing channels or Projects, or changing Project keys
  - deciding which Project a Task belongs to, or who can create a Task
  - changing which messages reach an Agent (ordinary delivery, mutes, mentions) across channels
  - changing an Agent's home Project, the team room `#all`, or handoffs between Agents
  - changing the sidebar, Agent tiles, or the Agent page Overview
---

# ADR 0055: Projects Own Agents and Tasks

## Status

Accepted 2026-11-19. Not yet implemented. Proposed to be amended 2026-11-22 by
[ADR 0060](0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md) in decisions 2 and 4:
a Project carries no repos, because repos belong to the Server. Part of the direction in
[the Capy and Amp proposal](../proposals/capy-product-model.md), with
[ADR 0054](0054-drive-holds-what-agents-know-and-follow.md) (Drive) and
[ADR 0056](0056-agents-run-quiet-workers-anywhere.md) (Workers). Amends
[ADR 0053](0053-channels-and-tasks-are-the-only-places.md) and
[ADR 0011](0011-agents-own-one-global-session.md).

Amended 2026-11-19: Zach decided in the UI track that the App has no Inbox page. Home is the
prompt box, each sidebar row carries its own unread state, and the Agent inbox (delivery) is
unchanged. Decision 10 reads accordingly.

Amended 2026-11-19 by [ADR 0059](0059-haus-starts-empty-without-cove.md): Cove is deleted, so
decision 9 no longer places it in the Haus project, and a new Server's Haus project holds no Agent.

Amended 2026-11-20 by [ADR 0059](0059-haus-starts-empty-without-cove.md) after a council review:
`#all` stays the everyone channel and is not a Project (decision 1), and generalists are withdrawn
(decision 9). An existing Server's Haus project becomes an ordinary `#general` Project.

Amended 2026-11-26 by [ADR 0062](0062-tasks-are-agent-sessions-issues-are-the-backlog.md); see
[the amendment](#amendment-2026-11-26-projects-own-issues).

## Context

A channel is half a project. It has a Task key, but no repos, no rules, and no place for its work
to run. Agents float: each one hears every channel it has joined, so a room with three Agents
hears every message three times, and nobody can say which Agent owns an area. ADR 0053 ties a
Task to the channel its origin Message happened to be in, and lets only Agents create Tasks, so a
person has to write a chat message to file work.

Capy scopes each Captain to one project and teaches "one Captain per area". Amp leaves its
coordinators unbound because it is built for one person, and its Space agent ignores people until
someone @mentions it. Haus is a team, so it takes Capy's ownership and Amp's quiet.

## Decision

1. **Only humans create Projects, and each Project is its channel.** "New project" creates the
   channel; there is no "New channel". Every existing channel becomes a Project except `#all`.
   `#all` stays the everyone channel and is not a Project: it is the team room and the only
   channel that is not a Project, by design. Every Agent hears `#all`; it is for talking to the
   whole team, and work lives in Projects. No Agent is homed there. A Project with no home Agent
   hears only @mentions. There are no generalists.

2. **A Project's settings** sit behind the channel header menu: its key, its Agents, its repos and
   which Computers have each one linked, its `AGENTS.md`
   ([ADR 0054](0054-drive-holds-what-agents-know-and-follow.md)), and the default place for its
   Workers ([ADR 0056](0056-agents-run-quiet-workers-anywhere.md)). There is no separate Overview
   pane.

3. **One key per Project.** It prefixes the Project's Task numbers. Existing keys and numbers carry
   over.

4. **A Task belongs to one Project, explicitly.** The Agent picks it when it starts the Task,
   defaulting to the Project it was asked in, or its home Project when asked in a DM. Where the request came from (a channel message, a
   DM, a reminder) is only where the Task started. The Project gives the Task its key and gives its
   Workers their repos, rules and default place.

5. **Humans can file a Task.** "New task" asks for a Project, a title and an Agent, which defaults
   to the Project's Agent. The Agent picks it up like an assignment. Every Task starts with an Agent
   working it.

6. **An Agent belongs to one Project.** It is listed under it, and that Project's rules always
   apply to it. Moving an Agent to another Project is a setting. Its one global session and the
   machine its tools run on are unchanged ([ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md)).

7. **An Agent hears its own Project and @mentions elsewhere.** It receives every message in its
   Project's channel and Tasks, and is that Project's first responder. It also hears the team room
   `#all`. In other Projects it
   receives @mentions, assignments, and the Tasks and inline reply chains it follows, since
   following is how it stays in work it was pulled into. DMs always reach it. Channel mutes go.
   A Project with no home Agent delivers only @mentions, assignments, follows and DMs; no other
   Agent hears it on its behalf (amended 2026-11-20 by Zach's decision that every Captain belongs
   to a real Project, which retires the 2026-11-19 generalist fallback).

8. **Work stays in its Project.** An Agent starts Tasks in its own Project. Work that belongs
   elsewhere it hands to that Project's Agent in that Project's channel, by @mention or assignment,
   where everyone can see it.

9. **Withdrawn: generalists.** This decision gave the Haus project generalist Agents that could start
   Tasks in any Project. [ADR 0059](0059-haus-starts-empty-without-cove.md) decision 5 withdraws
   it: there are no generalists, and every Agent is homed in a real Project.

10. **The sidebar leads with Agents.** Search, then Agent tiles (a dot means working;
    a click opens your DM with its Overview), then Projects with their Agents' faces, then open
    Tasks, then a footer with Tasks, Drive, Activity and Settings. Agent DMs are the tiles; the
    Direct messages section goes, and person-to-person DMs sit in a People section shown only when
    you have any, and in Search. There is no Inbox page; each row carries its own unread state.

11. **The Agent page** is your DM on the left and an Overview on the right: Working (its open Tasks
    with their Workers, places and PR state), Drive (its folder), and Rules (links to the rule
    files that load for it). A Tasks tab lists every Task assigned to it.

## Amendment 2026-11-26: Projects own Issues

[ADR 0062](0062-tasks-are-agent-sessions-issues-are-the-backlog.md) changes these decisions:

- **Decisions 2 and 3.** A Project's settings name its default Machine for Tasks instead of a
  default Worker place. Its one key prefixes its Issue codes (GEN-12); its Tasks take no number.
  Each Project has an Issue list and board.
- **Decisions 4 and 5.** A Task still belongs to one Project. A person starts a Task in any
  Project; a Captain starts crew only in its home Project. Filing work for someone is filing an
  Issue and assigning it.
- **Decision 7.** A Captain hears its Project's channel, but not its Tasks: it hears a Task only
  when @mentioned, when it follows it, or through its crew's reports. Its own Captain chat always
  reaches it. Captain DMs go.
- **Decision 8.** Work that belongs elsewhere can also be handed off as an unassigned Backlog Issue
  filed in that Project.
- **Decisions 10 and 11.** A Captain tile opens the Captain chat, the Captain page is that chat
  plus its side panel, and its Tasks tab becomes its crew and its Issues.

## Considered and rejected

- **Unbound Agents, as Amp's coordinators are.** That works for one person. In a team it blurs who
  owns what, and every Agent hears every room.
- **A Task's Project taken from its origin Message.** That made an accident of chat placement
  decide the key, repos and rules.
- **Projects created by Agents.** Capy keeps project creation with people, and a Project carries
  repos and machine links that people own.
- **A Project Overview pane.** Capy has none; open Tasks live in the sidebar.
- **Keys shared across channels.** One key per Project keeps a number's home obvious.

## Prior art

Capy: a project is mostly settings (repos, setup, secrets, members, the thread-number code), only
humans create one, and each Captain belongs to one project with its crew. Amp: a thread belongs to
at most one project, a project carries a Default Orb, a Space is bound to at most one project but
can start threads in others, and the Space agent ignores people talking among themselves until
@mentioned. Haus takes Capy's ownership and Amp's mention gating, and keeps channels where several
Agents and people work in the open.

## Consequences

Amended:

- [ADR 0053](0053-channels-and-tasks-are-the-only-places.md): "Only Agents create Tasks" is
  reversed by decision 5. A Task's key comes from its Project, not its origin Message's channel,
  and the shared key ledger becomes one key per Project. Tasks may start from a DM request, filed
  in the right Project.
- [ADR 0011](0011-agents-own-one-global-session.md): one global session stands. What reaches it
  narrows to the home Project, @mentions, assignments and DMs.
- `specs/inbox.md`: ordinary delivery reaches the home Project, not every joined channel.
  ADR 0030's semantic narrowing still applies inside a Project with several Agents.

Deleted:

- Freestanding channels and "New channel", and Agents creating channels.
- Agent channel membership (join, leave, add) and channel mutes. An Agent reads and posts in every
  Project, and what reaches it follows decision 7.
- The Direct messages sidebar section.
- The human Inbox page (amended 2026-11-19). The Agent inbox stays.

Follow-up:

- Done: `specs/projects.md` holds Projects, keys, home Agents and the migration, and
  `specs/tasks.md`, `specs/inbox.md` and `specs/chats.md` follow. At migration an Agent's home is
  the Project it wrote the most in over the last 30 days, and a person moves it after.
- `CONTEXT.md` gains Project and home Project when J2 lands.
- The prompt's placement and handoff text goes through the guarded prompt contract.
