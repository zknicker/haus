---
status: accepted
summary: A Task is one fresh agent session with its own chat, a Machine and a model, active or archived, with Capy's activity status (working, waiting, idle, failed, plus needs-you) and no state, priority, due date, labels, assignee or code. An Issue is the backlog card, coded with its Project's key (GEN-12), with fixed states, one assignee (a person, a Captain or a Task) from which the woken agent is derived, compare-and-swap claiming, sub-issues, comments and activity. A Captain stays its own kind on the shared agent base, with one shared Captain chat (owner, visibility, per-person member and subscribed flags) that replaces per-person Captain DMs, and it never archives. Messages reach a Task as steer, interrupt or queue, and a message to an archived Task unarchives and wakes it. Workers and the Cursor and Claude cloud hand-off are deleted. No migration or compatibility code. Supersedes ADRs 0056, 0041 and 0044; amends 0053, 0055, 0057, 0058 and 0060. Accepted 2026-11-26.
read_when:
  - changing what a Task is, how one starts, its chat, its Machine, its model, its activity status, archive or unarchive
  - adding or changing Issues, their states, assignee, claiming, sub-issues, comments, activity, or Issue codes
  - changing the Captain chat, Captain DMs, a Captain's owner or visibility, or what a Captain hears
  - changing crew briefs, crew reports, how Tasks message each other, or message delivery modes
  - changing runner session kinds, the runner admission cap, per-Computer concurrency, the desktop lease, or background processes
  - deleting Workers, `haus worker`, or the Cursor and Claude cloud hand-off
  - deciding whether a change needs migration or compatibility code
  - comparing a Haus noun, field, state or verb with Capy's API
---

# ADR 0062: Tasks Are Agent Sessions, Issues Are the Backlog

## Status

Accepted 2026-11-26. Not yet implemented; the release order below builds it. Supersedes
[ADR 0056](0056-agents-run-quiet-workers-anywhere.md) (Workers),
[ADR 0041](0041-cloud-agent-cards-mirror-cursor.md) and
[ADR 0044](0044-cloud-agent-work-is-referenced-not-embedded.md) (cloud agent work). Amends
[ADR 0053](0053-channels-and-tasks-are-the-only-places.md),
[ADR 0055](0055-projects-own-agents-and-tasks.md),
[ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md),
[ADR 0058](0058-the-ui-uses-capy-names.md) and
[ADR 0060](0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md). The contracts are
[specs/tasks.md](../../specs/tasks.md) and [specs/issues.md](../../specs/issues.md).

## Context

A Haus Task today is three things at once. It is a place (a `task` Chat under its Project,
`apps/server/src/postgres/schema/chats.ts:37`), a backlog card (state, priority, assignee, due
date and labels on the same row, `apps/server/src/postgres/schema/tasks.ts:29-53`), and the
anchor for Workers, the parallel runs a Captain starts on a Computer or in a vendor cloud
([ADR 0056](0056-agents-run-quiet-workers-anywhere.md)). Nobody can talk to a Worker directly:
it has no chat, its follow-ups ride a card, and its only voice is a typed report. All 191
production Worker runs used the Cursor or Claude cloud hand-off, so the Computer path has never
run in production ([ADR 0060](0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md)
context).

Capy separates these. A thread is one agent session you talk to directly, with no status field
of its own beyond activity. An issue is the card: state, priority, assignees, due date, labels,
sub-issues and a timeline, linking the threads that work on it. A Captain is a long-lived thread
with a name, an avatar and a crew (`CaptainEncoded` in Capy's OpenAPI contract). Haus already
runs every Captain's loop on the Server runner, so the engine for a Task agent exists:
[ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md) shipped in Haus 23.0.0
(#382), and the runner keys every session by agent id
(`apps/runner/src/turn/agent-sessions.ts:7-79`).

Haus is a dev product with one real user. Every past migration in this area carried compatibility
branches that outlived their reason.

## Decision

1. **A Task is one agent session with its own chat.** It is a fresh agent of any supported model,
   started by a person (from Home or a Project) or by a Captain as crew, on one Machine. You talk
   to it directly in its chat. Tasks never start Tasks.

2. **A Task has no backlog fields.** No state, priority, due date, labels, assignee or code. It is
   `active` or `archived`. Its activity status is Capy's: `working`, `waiting`, `idle` or `failed`,
   plus a `needsYou` flag. Its handle is its title plus a short id, the 8-character prefix of its
   `tsk_` id, lowercase base32 and unique per Server. The short id names it in the CLI, in URLs (`/tasks/<shortId>`), in
   branches (`haus/<shortId>-<slug>`) and in commit trailers (`Haus-Task: <shortId>`, plus
   `Haus-Issue: GEN-12` when it works an Issue).

3. **A Task is a hidden agent.** Its engine is an `agents` row of kind `task`, keyed one to one to
   its `tasks` row, so the runner session, inbox, invocation ledger, working folder and worktrees
   all key on that agent id unchanged. Task agents never appear in people lists, rosters,
   greetings, hearing candidates or Computer access lists; the @ picker lists Tasks by title as
   `task://` links, never their agents. The Server scopes a Task's
   credentials to its own chat and its Issue.

4. **A Captain stays its own kind on the same base.** Existing agents become kind `captain`. A
   Captain keeps memory, its home Project, hearing its Project chat, its crew, recurring reminders,
   claims and its one session across every chat. It has no number and never archives. It is never
   promoted from a Task.

5. **One shared Captain chat replaces Captain DMs.** Each Captain has exactly one chat of kind
   `captain`. Every message shows its author, and the Captain sees who sent each one. The chat has a
   human owner and `visibility: org | private` (org by default; private means its owner and its
   members). Each person has `member` and `subscribed` flags on it, which drive unread and push. The
   chat always reaches its Captain and nobody else: it is not under a Project, and no other agent
   hears it unaddressed. Person-to-person DMs are unchanged. Agents lose `dm:@human`.

6. **An Issue is the backlog card.** It belongs to one Project and carries that Project's code
   (GEN-12); the Project's key ledger becomes the Issue counter, and numbers are never reused. Its
   states are fixed: Backlog, Todo, In progress, Done, Canceled. It has a priority, one assignee (a
   person, a Captain or a Task), a due date, labels, a parent, comments and an activity timeline,
   and it links the Tasks and pull requests working on it. State changes only by an explicit edit.

7. **The woken agent is derived from the assignee.** An active Task assignee wakes that Task. A
   Captain assignee wakes the Captain. There is no stored owner and no ordered owner list. The actor
   never wakes itself. Assigning in Backlog wakes nobody. Archiving a Task hands its open Issues
   back to its Captain, else to the person who started it, with an activity row.

8. **Claiming is compare-and-swap.** `haus issue update GEN-12 --assignee me --expect-assignee none`
   fails with `ISSUE_TAKEN` naming the holder. `haus task start --issue GEN-12` checks, creates,
   links, assigns and queues in one transaction, and a retry with the same request id returns the
   same Task.

9. **A Captain works from Issues.** Its queue is `issue_assignment` inbox items, coalesced as
   `task_assignment` is today. It no longer hears every Task chat in its Project. It hears its own
   crew's reports, @mentions, and chats it follows.

10. **Crew report back, batched.** A Captain's brief is the first message in a crew Task, authored
    by the Captain. A Captain-directed turn ends with `haus task report --outcome done|needs-you|failed`;
    a turn with no report sends one factual receipt that links the chat. Turns a person drives wake
    the Captain only on failure or an explicit ask. Reports batch across the Captain's whole crew,
    up to 50 within a text budget, deduplicated by Task and turn, and carry the Issue edits made in
    that turn.

11. **Messages reach a Task three ways, as in Capy.** `steer` lands at the agent's next safe
    boundary with nothing cancelled, `interrupt` cuts the running step and makes the message the
    next input, and `queue` waits until the current work finishes. A message to an archived Task
    unarchives it and wakes it on a fresh session generation, with its chat as context. Tasks reach
    each other with `haus task send`, which posts a visible message in the receiving Task's chat
    and spends the automation chain.

12. **A Task runs on the runner and works on a Mac.** v1 Machines are the MacBook and the Mac
    mini. A crew Task defaults to its Captain's crew Machine and inherits its Captain's Computer
    access, never more. A Task a person starts defaults to its Project's Machine and needs that
    person to be the Computer's attacher, or the Computer to allow All Captains. Access is checked
    at dispatch and fenced on revoke. A Task whose Machine is offline parks at the turn boundary
    without holding a runner slot.

13. **Archive retires.** It kills the process, deletes the session, kills background processes,
    releases the desktop lease, and removes clean worktrees. Unpushed worktrees stay and are listed
    on the Device page.

14. **The runner and the Macs share capacity safely.** The runner caps live Claude processes,
    warm ones included (step 0, `HAUS_RUNNER_MAX_CLAUDE`), and admits Captain and person-driven
    turns before crew turns, with aging. Task sessions park after about 5 minutes idle. Each
    Computer caps running invocations across sessions, serial within one. The first desktop call
    takes a machine-wide lease for that session, and others are refused with `desktop-busy`.
    Background processes outlive a turn and wake their session when they exit.

15. **Workers and the cloud hand-off go.** `haus worker`, the Worker record, the native Worker
    drivers, `worker-cli`, the cloud places, the cloud agent settings and the Cursor SDK are
    deleted once Task agents work end to end. `WORKER.md` survives as the Captain's crew rules.

16. **No migration or compatibility code.** Breaking changes and protocol bumps are fine, and both
    Macs are upgraded right after a deploy. Specs carry no migration sections, aliases, or phased
    reader and writer rollouts. Production data is fixed by one-off scripts that the orchestrator
    runs with Zach's yes, outside the product code: moving open Tasks into Issues, moving old
    numbers, and Captain DM history (started fresh unless Zach asks to copy it).

## Capy divergences

Haus copies Capy's nouns, fields, states and verbs unless this table names a reason. Sources are
schema names in Capy's OpenAPI contract.

| Capy | Haus | Why |
| --- | --- | --- |
| Threads carry Project codes (`IssueActorEncoded.code`, "SCO-123") | Tasks have no code: title plus short id | A Task is a conversation, not a card. One code per Issue keeps "GEN-12" meaning one thing, as in Linear |
| Issue codes use one org-wide prefix (`IssuePrefixEncoded`) | Each Project's key prefixes its Issues | Haus Projects already own keys, and existing Task numbers live in that ledger |
| Custom org states with `type: open \| closed` (`IssueStateEncoded`) | Five fixed states, each typed open or closed | Agents act on states; a fixed set keeps prompts and queues stable (Zach, Q8) |
| Up to 10 assignees, primary first (`CreateIssueRequest.assignees`) | One assignee | One responsible party; the derived wake needs exactly one |
| The first linked thread is the owner and the only one woken (Cap's tools) | The woken agent is derived from the assignee; links are context | One field to read and write, no stale owner |
| Archiving the owner leaves the assignee on the archived thread | Archive hands open Issues back to the Captain or starter | Keeps the Issue in someone's queue |
| Issue `visibility: org \| private` | No Issue visibility | Projects are open by design |
| Thread `visibility` and `personal` | Tasks are as open as their Project; only the Captain chat has `visibility` | Same reason; the Captain chat is where a person's private context lands |
| Issue relations: blocks, blocked by, related | Deferred; sub-issues only | Zach, Q9 |
| `delivery` defaults to `interrupt` (`SendMessageRequest`) | Defaults to `steer` | A Haus chat post reaches a busy agent at its next safe boundary today, and people should not cut work by typing |
| Cancel and send-now on queued messages, message edit versions | Not in v1 | No call site needs them yet |
| Thread `status` includes `archived` | `archived` is its own flag; activity is the four values | Archive is lifecycle, not activity |
| Subagents and tasks inside a thread | None in v1 | Native subagents are off on the runner (`specs/runtime-drivers.md`, Removed) |
| Add an existing thread to a crew (`AddCrewThreadRequest`) | Crew is fixed at start | Not needed in v1 |
| Captain digest read from `DIGEST.md` (`CaptainDigestEncoded`) | Needs you is derived Server state | Costs no turns and cannot go stale |
| A Captain is one thread | A Captain also hears its home Project chat, one session across chats | ADR 0011's teammate stands |
| `machineSize` cloud VMs | A Mac the person attached | Haus Cloud is a later project |

## Considered and rejected

- **Captains are Tasks, one record type.** Considered on 2026-11-26 (`decisions.md` Q18) and
  narrowed: the Captain keeps its own kind on the shared base, because Task rules (archive,
  parking, credential scoping, hidden from rosters) must never catch a Captain.
- **A cross-kind `project_keys` registry for Tasks and Issues.** Tasks take no numbers, so the
  ledger plus a unique `(key_id, number)` on Issues is enough.
- **A separate session table, or a typed session key on the runner.** An agent row gives the
  author, inbox, credentials and Computer keys for free.
- **Keep Workers beside Task agents.** Two parallel-work nouns with different rules.
- **Mentioning a Task in another chat wakes it.** Tasks are reached by `haus task send` and their
  own chat; a reference elsewhere is a link only, so a Task never posts outside its chat.

## Consequences

Superseded: [ADR 0056](0056-agents-run-quiet-workers-anywhere.md),
[ADR 0041](0041-cloud-agent-cards-mirror-cursor.md),
[ADR 0044](0044-cloud-agent-work-is-referenced-not-embedded.md), and the specs
[workers.md](../../specs/workers.md), [cloud-agents.md](../../specs/cloud-agents.md) and
[cloud-agent-run-lifecycle.md](../../specs/cloud-agent-run-lifecycle.md), kept as history until
step 7 deletes the code.

Amended:

- [ADR 0053](0053-channels-and-tasks-are-the-only-places.md): a Task stays a place, now with its
  own agent, and loses its state, key, priority, labels, due date and assignee to the Issue.
  Reopen-on-post becomes unarchive-on-message.
- [ADR 0055](0055-projects-own-agents-and-tasks.md): the Project key prefixes Issues. A Project's
  hearers no longer hear its Tasks ambiently. The Agent tile opens the Captain chat, not a DM.
  The default place for Workers becomes the Project's default Machine for Tasks.
- [ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md): the runner hosts Task
  sessions beside Captains, under one admission cap. "Workers keep native harnesses" retires.
- [ADR 0058](0058-the-ui-uses-capy-names.md): the UI says Task and Issue, and Worker disappears.
- [ADR 0060](0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md): Task agents work in
  worktrees keyed by their agent id on the `haus/<shortId>-<slug>` branch; archive cleans them.

Prompt: the Agent prompt's Tasks, Workers and DM text, the `task:KEY-n` and `dm:@human` targets,
and the inbox formats change under the guarded prompt contract, with register rows and baseline
evals in step 3 and step 5. Task sessions get their own composed instructions with their own cap.

iPhone: breaks at step 2 when Tasks lose their fields, and stays broken until the Capy epic's
iPhone work, as already accepted.

## Release order

Each step ships on its own. Step 0 (invocation late-run fix, Keychain credential, runner Claude
cap) runs in parallel and is not part of this ADR.

1. **This ADR and its specs.**
2. **Issues.** The record, codes on the ledger, comments, activity, sub-issues, the CLI, API and
   UI. Tasks get short ids and lose state, priority, due date and labels. A one-off script moves
   existing data.
3. **Captains work from Issues.** `issue_assignment`, no ambient Task hearing, crew-report
   batching. Prompt and Manual changes, gated by baseline evals.
4. **Mac side.** Per-session keying, the per-Computer concurrency cap, the desktop lease, and
   background processes that wake on exit.
5. **Task agents and the Captain chat.** The `task` agent kind, crew briefs and reports,
   `haus task send` with delivery modes, Machine access, archive as retire; the shared Captain
   chat with owner and visibility replaces Captain DMs.
6. **App.** The Home composer starts a Task; the Task page and side panel; the Tasks list (My,
   All, Archived); the Captain page; the Issues list, board and page; the sidebar.
7. **Delete Workers and the Cursor and Claude cloud hand-off**, once Task agents work end to end.
