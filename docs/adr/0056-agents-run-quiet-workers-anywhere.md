---
status: accepted
summary: Agents run Workers, scoped parallel runs attached to a Task, on any Computer that allows them or on Cursor or Claude in the cloud. Workers replace cloud agents. Each one reads the rule stack plus its Agent's WORKER.md, uses its machine's own logins, stays quiet while working, and ends with a typed report (done, needs-you, failed). People can steer a Worker directly from its card. Commits carry a Haus-Task trailer. Agents coordinate only in the open, and there are no forks. Accepted 2026-11-19, not yet implemented.
read_when:
  - changing cloud agents, Workers, Runs, or `haus cloud-agent` / `haus worker`
  - changing where delegated work runs, the Project default place, or per-Computer Worker access
  - changing what a Worker reads, how it reports, or what it posts in a Task
  - changing how people or Agents talk to a running Worker
  - changing agent-to-agent communication, commit trailers, or Worker deliverables
---

# ADR 0056: Agents Run Quiet Workers Anywhere

## Status

Accepted 2026-11-19. Not yet implemented. Part of the direction in
[the Capy and Amp proposal](../proposals/capy-product-model.md), with
[ADR 0054](0054-drive-holds-what-agents-know-and-follow.md) (Drive) and
[ADR 0055](0055-projects-own-agents-and-tasks.md) (Projects). Amends
[ADR 0053](0053-channels-and-tasks-are-the-only-places.md),
[ADR 0044](0044-cloud-agent-work-is-referenced-not-embedded.md), and
[ADR 0011](0011-agents-own-one-global-session.md).

## Context

An Agent runs one turn at a time (ADR 0011). That is right for a teammate's voice and wrong for a
backlog. Its only parallelism is cloud agents on Cursor or Claude, which cannot use the checkout
or the logins on the mini or the MacBook. Work that needs another machine needs another Agent.
Cloud agent cards report a free-text summary, and the default provider is a per-Computer setting
unrelated to where a Project's repos live.

Capy and Amp converged on the same answer: a persistent coordinator, and disposable scoped runs
that work where the work is and report back. Capy's crew report with a typed tool call and read a
Captain's `CREW.md` every turn. Amp picks a machine per thread, defaults it per project, and keeps
runs silent until they finish or are blocked.

## Decision

1. **A Worker is a scoped run attached to one Task.** It starts blank from its Agent's written
   brief. A Task can hold several Workers, or none. Re-tasking a Worker continues its run with its
   context.

2. **Workers replace cloud agents.** Places are `computer:<name>`, `cursor` and `claude`, under one
   noun and one status set. `haus cloud-agent start --task` becomes
   `haus worker start --task ENG-41 [--on macbook]`. A cloud agent work record becomes a Worker,
   its Runs become the Worker's turns, and its card in the Task's attached-work panel becomes the
   Worker card.

3. **What a Worker reads.** The Haus `AGENTS.md`, its Task's Project `AGENTS.md`, the repo's own
   `AGENTS.md`, and its Agent's `WORKER.md` on every turn
   ([ADR 0054](0054-drive-holds-what-agents-know-and-follow.md)). `WORKER.md` holds the Agent's
   standing rules for its Workers, such as draft PRs, before and after renders, or a report format.

4. **A typed report ends each run:** `done`, `needs-you` or `failed`, with a summary, an ask, its
   PRs, and Drive files cited by version. It posts in the Task and reaches the Agent through its
   inbox. A `needs-you` report @mentions the person it needs.

5. **Quiet by default.** A Worker never posts progress in the Task. Its card shows live status,
   place and newest report. The Task gets one message per report, and followers see it go unread
   only for reports and people's posts.

6. **Where it runs.** On any Computer whose "Workers can run here" switch is on; the person who
   attached the Computer, or an Owner or Admin, sets it. The default place is set on the Project
   ([ADR 0055](0055-projects-own-agents-and-tasks.md)), because repos are linked per Project per
   Computer. The Agent can override it per Worker, for example when asked to run it on the
   MacBook.

7. **A Worker uses that machine's own logins** for its model runtime and git, so it can run any
   model that machine can. It runs as a fresh Claude Code or Codex session in a worktree of the
   Project repo, with a credential scoped to that Worker. Workers keep the harness on the machine,
   and a dead machine is a failed Worker. The Agent itself runs on the Server
   ([ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md)). Moving a running
   Worker between machines is out of scope.

8. **People talk to a Worker directly.** Each Worker card has its own composer. What you type goes
   into that Worker as a steer, or as a follow-up when it is idle, and also posts in the Task
   marked with the Worker and its place, so the Agent sees it through its inbox. A plain post in the
   Task goes to the Agent. Workers have no inbox.

9. **Deliverables go in the Agent's folder:** `agents/<handle>/reports/`, `renders/` and
   `handoffs/`. The Task page shows the files a report cites, at the cited version.

10. **Commits carry a `Haus-Task: ENG-41` trailer.** `git log` leads back to the Task, and a pushed
    PR attaches itself to the Task.

11. **Agents coordinate in the open.** One Agent reaches another by @mention in a Project or Task,
    or by assigning it a Task. An Agent reaches its Workers through the brief, `haus worker send`,
    and `WORKER.md`. Workers never talk to each other. There are no agent-to-agent DMs and no
    background steers.

12. **No forks.** A side conversation with an Agent is a DM, and an inline reply stays in the open
    on its message.

## Considered and rejected

- **Port Capy literally:** every conversation a session, Captains as promoted threads, agents
  steering each other in the background. It discards ADR 0011's teammate and the visible room.
- **Merge the Worker into the Task**, so Tasks run themselves. Both references keep the unit of
  work and the run apart, and a Task can need several Workers or none.
- **A place picker in the human composer**, as Amp has. People talk to Agents, and "run it on the
  MacBook" is an ordinary request.
- **Progress messages from Workers.** They make people watch agents work.
- **No `WORKER.md`.** Standing habits for Workers span Tasks and shouldn't be pasted into every
  brief.
- **A Worker inbox.** A Worker is scoped to one Task, so everything sent to it is for it.

## Prior art

Capy: crew threads linked to a Captain, typed `message_agent` reports with `final` or
`needs_you`, `CREW.md` read every turn, deliverables in the Captain's `reports/`, `renders/` and
`handoffs/` cited by version, "Crew runs on" with per-device agent access using the device's own
credentials, and people replying in a crew thread as a steer. Amp: orbs, runners and shared runners
that run as their owner, a project's Default Orb, threads that subscribe to their PR, the
`Amp-Thread-ID` commit trailer, and silence until work finishes or is blocked. Amp also removed
fork. Haus takes the run, the report, the trailer and the silence, and keeps coordination in
channels people can read.

## Consequences

Amended:

- [ADR 0053](0053-channels-and-tasks-are-the-only-places.md): attached cloud agents become
  Workers, and the attached-work card becomes the Worker card with its own composer. Pull request
  cards and the ready-after-settle wake stand.
- [ADR 0044](0044-cloud-agent-work-is-referenced-not-embedded.md): the work record stands as the
  Worker record, and its card reads a typed report.
- [ADR 0011](0011-agents-own-one-global-session.md): one session per Agent stands. Workers are
  separate, scoped sessions that report to it, not sessions of the Agent.

Deleted:

- "Cloud agent" as a noun and the `haus cloud-agent` CLI family.
- The per-Computer **Make default** provider setting, replaced by the Project's default place.
- An Agent's lock to one machine for its work.

Related:

- [ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md) holds the Agent's
  runtime and tools. Workers keep native harnesses and machine logins.

Follow-up:

- Rewrite `specs/cloud-agents.md` as a Workers spec. `specs/workers.md` uses "worker" in an older
  sense; reconcile or retire it.
- Design the Worker credential, the per-Computer switch, and worktree runs on a Computer.
- The prompt's delegation and report text goes through the guarded prompt contract.
