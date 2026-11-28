---
status: accepted
summary: A Task is one fresh agent session with its own chat, a Machine and a model, active or archived, with Capy's activity status (working, waiting, idle, failed, plus needs-you) and no state, priority, due date, labels, assignee or code; it has a title and a separate short id. An Issue is the backlog card, coded with its Project's key (GEN-12), with fixed states, one assignee (a person, a Captain or a Task) from which the woken agent is derived, compare-and-swap claiming, sub-issues, comments and activity. A Captain stays its own kind on the shared agent base, with one org-visible Captain chat (a human owner, per-person member and subscribed flags) that replaces per-person Captain DMs, and it never archives. Messages reach a Task as steer (the default), interrupt or queue, and a message from a person or a Captain to an archived Task unarchives and wakes it. A Task's Mac access is always its Captain's or starter's current grant. Workers and the Cursor and Claude cloud hand-off are deleted. Steps 2 to 6 land on main one by one and release together once they work end to end. No migration or compatibility code. Supersedes ADRs 0056, 0041 and 0044; amends 0053, 0055, 0057, 0058 and 0060. Accepted 2026-11-26. Amended 2026-11-28: crew turns end in a content-free crew finish for the Captain, and `haus task report` is deleted; a Task has no drive/ folder and reads and writes Drive through haus drive.
read_when:
  - changing what a Task is, how one starts, its chat, its Machine, its model, its activity status, archive or unarchive
  - adding or changing Issues, their states, assignee, claiming, sub-issues, comments, activity, or Issue codes
  - changing the Captain chat, Captain DMs, a Captain's owner, or what a Captain hears
  - changing crew briefs, crew finishes, how Tasks message each other, or message delivery modes
  - changing a Task's Computer access, runner session kinds, the admission cap, per-Computer concurrency, the desktop lease, or background processes
  - deleting Workers, `haus worker`, or the Cursor and Claude cloud hand-off
  - deciding whether a change needs migration or compatibility code, or when a step of this work releases
  - comparing a Haus noun, field, state or verb with Capy's API
---

# ADR 0062: Tasks Are Agent Sessions, Issues Are the Backlog

## Status

Accepted 2026-11-26, revised the same day after a council review. Not yet implemented; the build
order below builds it. Supersedes [ADR 0056](0056-agents-run-quiet-workers-anywhere.md) (Workers),
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
   active or archived, recorded only in `tasks.archived_at`. Its activity status is Capy's:
   `working`, `waiting`, `idle` or `failed`, plus a `needsYou` flag. It has a title, set
   automatically from its first message and renamable, and a **short id**: its own column of 8
   lowercase Crockford base32 characters, unique per Server, not derived from the `tsk_` id. The
   short id names it in the CLI, in URLs (`/tasks/<shortId>`), in branches
   (`haus/<shortId>-<slug>`) and in commit trailers (`Haus-Task: <shortId>`, plus
   `Haus-Issue: GEN-12` when it works an Issue).

3. **A Task is a hidden agent.** Its engine is an `agents` row of kind `task`, keyed one to one to
   its `tasks` row, so the runner session, inbox, invocation ledger, working folder and worktrees
   all key on that agent id. Task agents never appear in people lists, rosters, greetings, hearing
   candidates or Computer access lists; the @ picker lists Tasks by title as `task://` links, never
   their agents. The Server scopes a Task's credentials to its own chat, its Project's Issues, and
   Drive reads and writes.

   *Amended 2026-11-28:* a Task agent has no `drive/` folder. The Server sends it no Drive pull,
   push or flush, and it reads with `haus drive view` and writes with `haus drive write`
   ([specs/drive-folder.md](../../specs/drive-folder.md#one-folder-per-writer)).

4. **A Captain stays its own kind on the same base.** Existing agents become kind `captain`. A
   Captain keeps memory, its home Project, hearing its Project chat, its crew, recurring reminders,
   claims and its one session across every chat. It has no number and never archives. It is never
   promoted from a Task. Its **crew Machine** and **crew model** (Capy's "Crew runs on") are its
   own settings, falling back to the Project default.

5. **One shared Captain chat replaces Captain DMs.** Each Captain has exactly one chat of kind
   `captain`, visible to everyone on the Server. Every message shows its author, and the Captain
   sees who sent each one. Each person has `member` and `subscribed` flags on it, which drive the
   sidebar, unread and push. Every Captain has an active human owner: an agent-created Captain
   takes its creating Captain's owner, and when the owner leaves the Server, ownership moves to the
   Server owner. The chat reaches its own Captain and no other agent, even one @mentioned there.
   Person-to-person DMs are unchanged. Agents lose `dm:@human`.

6. **An Issue is the backlog card.** It belongs to one Project and carries that Project's code
   (GEN-12); the Project's key ledger becomes the Issue counter, and numbers are never reused. Its
   states are fixed: Backlog, Todo, In progress, Done, Canceled. It has a priority, one assignee (a
   person, a Captain or a Task), a due date, labels, a parent, comments and an activity timeline,
   and it links the Tasks and pull requests working on it. Nothing changes its state except an
   explicit edit, `haus task start --issue` included. Any Captain or Task may create Issues in its
   own Project.

7. **The woken agent is derived from the assignee.** An active Task assignee wakes that Task. A
   Captain assignee wakes the Captain. There is no stored owner, no ordered owner list, and no
   agent follower. The actor never wakes itself. Assigning in Backlog wakes nobody. Archiving a
   Task hands its open Issues back to its Captain, else to the person who started it, with an
   activity row. A bare `GEN-12` in text is a passive "Mentioned in" link; waking someone takes an
   explicit Issue comment.

8. **Claiming is compare-and-swap.** `haus issue update GEN-12 --assignee me --expect-assignee none`
   fails with `ISSUE_TAKEN` naming the holder. `haus task start --issue GEN-12` checks, creates,
   links, assigns and queues in one transaction, and a retry with the same request id returns the
   same Task.

9. **A Captain works from Issues.** Its queue is `issue_assignment` inbox items, coalesced as
   `task_assignment` is today. It no longer hears every Task chat in its Project. It hears its own
   crew's finished turns, @mentions, and chats it follows.

10. **Crew report back, batched.** A Captain's brief is the first message in a crew Task, authored
    by the Captain. A Captain-directed turn ends with `haus task report --outcome done|needs-you|failed`;
    a turn with no report sends one factual receipt that links the chat. Turns a person drives
    wake the Captain only on failure or an explicit ask. Reports batch across the Captain's whole
    crew, up to 50 within a text budget, deduplicated by Task and turn, and carry the Issue edits
    made in that turn.

    *Amended 2026-11-28:* `haus task report` is deleted. A crew Task works and talks in its own
    chat, and every turn of it that settles, whoever drove it, sends its Captain one content-free
    `crew_finish` item (finished, failed or waiting) that the Captain follows with
    `haus message read --unread`, as Capy's crew threads do. A Task asks a person by @mentioning
    them, which sets `needsYou` ([tasks.md](../../specs/tasks.md#crew-finishes)).

11. **Messages reach a Task three ways, as in Capy.** `steer`, the default, lands at the agent's
    next tool boundary with nothing cancelled, and starts the next turn if the turn ends first.
    `interrupt` aborts the running turn and runs again with the message first. `queue` waits for
    the next turn. `haus task send` is the one way an agent messages a Task; it posts a visible
    message in that Task's chat and spends the automation chain. A message from a person or a
    Captain to an archived Task unarchives it and wakes it. Unarchive (Capy's restore) is also an
    action of its own that starts no turn.

12. **A Task runs on the runner and works on its one Mac.** v1 Machines are the MacBook and the
    Mac mini. A Task's access is always its Captain's current grant (crew) or its starter's
    (person-started), checked at every dispatch and cut off on revoke. It never gets the "own
    Machine" pass Agent access gives a Captain, and a per-call target other than its Machine is
    refused. A Task whose Machine is offline parks at the turn boundary without holding a runner
    slot.

13. **Archive frees, it does not retire.** It ends the process, deletes the session directory,
    kills background processes, releases the desktop lease, and removes clean worktrees, under a
    generation-stamped `archive` reset that leaves the agent id usable. Unpushed worktrees stay and
    are listed on the Device page. Unarchive starts a fresh session from a bounded slice of the
    chat plus the current Issue context, and resumes on a retained worktree if one exists.

14. **The runner and the Macs share capacity safely.** The runner caps live Claude processes,
    warm ones included (step 0, `HAUS_RUNNER_MAX_CLAUDE`), and admits Captain and person-driven
    turns before crew turns, with aging. Task sessions park after about 5 minutes idle. Each
    Computer caps running invocations across sessions, serial within one. The first desktop call
    takes a machine-wide lease for that session, and others are refused with `desktop-busy`.
    Background processes outlive a turn and wake their session when they exit.

15. **Workers and the cloud hand-off go.** `haus worker`, the Worker record, `worker_report`, the
    native Worker drivers, `worker-cli`, the cloud places, the cloud agent settings and the Cursor
    SDK are deleted once Task agents work end to end. `WORKER.md` survives as the Captain's crew
    rules.

16. **No migration or compatibility code.** Breaking changes and protocol bumps are fine, and both
    Macs are upgraded right after a deploy. Specs carry no migration sections, aliases, or phased
    reader and writer rollouts. Production data is fixed by one-off scripts that the orchestrator
    runs with Zach's yes, outside the product code:
    - open Tasks become Issues and old numbers move;
    - existing Tasks get short ids;
    - the shared Captain chats start fresh, and the old Captain DM rows with their reminders,
      Triggers and claims are handled by the script.

## Capy divergences

Haus copies Capy's nouns, fields, states and verbs unless this table names a reason. Sources are
schema names in Capy's OpenAPI contract.

| Capy | Haus | Why |
| --- | --- | --- |
| Threads carry Project codes (`IssueActorEncoded.code`, "SCO-123") | Tasks have no code: title plus a separate short id | A Task is a conversation, not a card. One code per Issue keeps "GEN-12" meaning one thing, as in Linear |
| Issue codes use one org-wide prefix (`IssuePrefixEncoded`) | Each Project's key prefixes its Issues | Haus Projects already own keys, and existing Task numbers live in that ledger |
| Custom org states with `type: open \| closed` (`IssueStateEncoded`) | Five fixed states, each typed open or closed | Agents act on states; a fixed set keeps prompts and queues stable (Zach, Q8) |
| Up to 10 assignees, primary first (`CreateIssueRequest.assignees`) | One assignee | One responsible party; the derived wake needs exactly one |
| The first linked thread is the owner and the only one woken (Cap's tools) | The woken agent is derived from the assignee; links are context | One field to read and write, no stale owner |
| Archiving the owner leaves the assignee on the archived thread | Archive hands open Issues back to the Captain or starter | Keeps the Issue in someone's queue |
| Issue timeline kinds (`IssueTimelineEventEncoded`) | Haus's subset, plus `due_changed` and `labels_changed`; no relation, visibility or custom-state events | Haus has no relations, Issue visibility or custom states, and due date and labels are edits people look for |
| Comment `replyTo`, with `parentCommentId` flattening replies to replies | Copied | Replies stay one level deep |
| Issue `visibility: org \| private` | No Issue visibility | Projects are open by design |
| Thread and Captain `visibility` and `personal` | None in v1: Tasks are as open as their Project, and Captain chats are org-visible | Zach: privacy between users is not a concern |
| `member` and `subscribed` on every thread | On the Captain chat; Task chats keep Haus followers, which act as `subscribed` | Task followers already drive unread and push (`apps/server/src/tasks/task-follows.ts`) |
| `model` per message (`SendMessageRequest.model`) | A Task keeps the model it started with | One harness per session; a Task is short-lived, so a new model is a new Task |
| Issue relations: blocks, blocked by, related | Deferred; sub-issues only | Zach, Q9 |
| `delivery` defaults to `interrupt` (`SendMessageRequest`) | Defaults to `steer` | A casual follow-up, or another agent's `task send`, should not abort a long command |
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
- **Archive as the runner's retire.** Retire bars an agent id for the runner's lifetime
  (`apps/runner/src/turn/agent-sessions.ts:26-28,61-66`), which would make unarchive impossible.
- **Keep the native conversation through archive.** Archive exists to free the mini's disk and
  memory; a bounded replay of the chat is enough context to continue.
- **Private Captain chats.** Nothing needs them while privacy between users is not a concern.

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
  sessions beside Captains, under one admission cap. A Captain's Machine changes in its settings,
  since there is no DM. "Workers keep native harnesses" retires.
- [ADR 0058](0058-the-ui-uses-capy-names.md): the UI says Task, Issue and Captain chat, and Worker
  disappears.
- [ADR 0060](0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md): Task agents work in
  worktrees keyed by their agent id on the `haus/<shortId>-<slug>` branch; archive cleans them.

Prompt: the Agent prompt's Tasks, Workers and DM text, the `task:KEY-n` and `dm:@human` targets,
and the inbox formats change under the guarded prompt contract, with register rows and baseline
evals in steps 3 and 5. Task sessions get their own composed instructions with their own cap.

iPhone: breaks when steps 2 to 6 release, and stays broken until the Capy epic's iPhone work, as
already accepted.

## Build order

Steps 2 to 6 land on main one by one and are **released together once they work end to end**.
No step is released on its own, so no step has to keep production coherent alone; each step still
builds and passes its own tests. Step 7 follows once the release is proven. Step 0 (invocation
late-run fix, Keychain credential, runner Claude cap) ships separately and is not part of this
ADR.

1. **This ADR and its specs.**
2. **Issues.** The record, codes on the ledger, comments, activity, sub-issues, the CLI, API and
   UI. Tasks get short ids and `tasks.archived_at`, and lose state, priority, due date, labels and
   assignee. The one-off script moves existing data.
3. **Captains work from Issues.** `issue_assignment`, no ambient Task hearing, and prompt and
   Manual changes gated by baseline evals.
4. **Mac side.** Per-session keying, the per-Computer concurrency cap, the desktop lease, and
   background processes that wake on exit.
5. **Task agents and the Captain chat.** The `task` agent kind, crew briefs, `crew_report` and
   `haus task report`, `haus task send` with delivery modes, Machine access, archive and
   unarchive, `haus drive write`; the shared Captain chat replaces Captain DMs.
6. **App.** The Home composer starts a Task; the Task page and side panel; the Tasks list (My,
   All, Archived); the Captain page; the Issues list, board and page; the sidebar.
7. **Delete Workers, `worker_report` and the Cursor and Claude cloud hand-off**, once Task agents
   work end to end in production.
