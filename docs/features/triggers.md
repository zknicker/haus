---
summary: Agent-owned Triggers — secret-authenticated webhook wakes, GitHub App event wakes, and Linear workspace event wakes anchored to a Chat, created from the Agent profile's Automations tab or by the Agent itself, answered by the Agent's own marked message, with bounded payloads and retained Agent-wide fire history.
read_when:
  - changing Trigger creation, secrets, firing, payload bounds, or fire history
  - changing what a GitHub Trigger listens to, its cap, or how its fires read
  - changing what a Linear Trigger listens to, its cap, or how its fires read
  - changing the Automations tab's Trigger walkthrough, detail view, or controls
  - changing how a Trigger fire appears in a conversation
  - deciding whether new work is a Reminder (time) or a Trigger (outside event)
---

# Triggers

A Trigger is a private URL that wakes one Agent when an outside system POSTs to
it. One Agent owns it, it is anchored to a conversation, and the hosted Server
fires it even while that Agent's Computer is offline.

Triggers answer outside events. Reminders answer the clock. A Trigger has no
schedule and no recurrence; anything time-based is a
[reminder](reminders.md).

## Creating one from the App

Server Owners and Admins create Triggers on an Agent's profile, under
**Automations**. **New trigger** opens a short walkthrough:

1. **Name** the Trigger. This is the title everyone sees on the row and on the
   mark beside every message the Agent sends because of it.
2. **Instruction** — what the Agent should do each time it fires. Optional, but
   it is the only standing direction the Agent has when a fire arrives.
3. **Trigger type** — choose it in the select: **Webhook**, an outside system
   POSTing to a private URL, or **GitHub**, events in repositories the GitHub
   connection reaches. Linear Triggers are created by the Agent and show
   read-only here ([Linear Triggers](#linear-triggers)).

The Trigger is anchored to your DM with that Agent, so that is where it answers
its fires. Creating it says nothing in that DM — the Trigger appears on the
Automations tab, which is where you arm it, read its history, and rotate its
secret.

The drawer stays open as that Trigger's detail and shows the **webhook card**
once at the top: the URL, the bearer secret, and a ready-made `curl` line, each
with a copy button. The secret appears here and nowhere else — Haus stores
only a hash. Losing it means rotating, not recovering it.

## Managing one

Each row on the Automations tab is one line, the same anatomy as a Reminder
row: a webhook icon, the title, and its activity (`Last fired 3h ago · 4 fires`
or `Never fired`). Only a disabled Trigger carries a status chip; armed is the
norm. Opening a Trigger shows its detail, headed by its title and kind
(`Webhook trigger`):

- **Active** arms or disables it. A disabled Trigger refuses every POST and keeps
  its history.
- **Name** and **Instruction** are editable in place.
- **When to run** shows the kind and, for a webhook, the URL with a copy button
  and **Rotate secret**. Rotating reveals a new secret once in the same card and
  kills the old one immediately.
- **Send test fire** fires the Trigger for real: same wake, same rate limit, no
  secret needed. It is how you check the wiring before handing the URL out.
- **Fire history** lists what has arrived, newest first, with the time, payload
  size, and idempotency key.
- **On iPhone** (Settings > Agents > an Agent > Automations), a Trigger's
  detail is read-only: status, creator, activity, instruction, the chat it is
  anchored on, and its fire history. Creating, editing, arming, rotating, test
  fires, deletion, and the Agent-wide log stay in the desktop and web App.
- **History** opens the Agent-wide fire log. It includes fires from every
  Trigger, links to an Agent answer when one exists, and labels a retained fire
  whose Trigger was removed. It remains the history path after a Trigger's
  detail disappears.
- **Delete** removes the Trigger from active use immediately, retires queued
  wakes, and retains its recent fire history for 30 days. Messages the Agent
  already sent stay in their conversation and keep their lightning mark — the
  Trigger's title and kind are snapshotted onto the message — but their hover
  card and context card lose everything that was read live.
- **Deleting the anchor channel** removes every Trigger anchored in it,
  including removed-Trigger tombstones, and their fire history at once; there
  is no 30-day retention once the conversation itself is gone.

The detail's **Created by** row names who created it — a person's handle, or
the owning Agent.

## Product behavior

- **Two authors, one Trigger.** People create and manage Triggers from the
  Automations tab; an Agent creates and manages its own with `haus trigger
  create` when someone asks for an outside event — a webhook, a CI run, an alert,
  a form, a sensor — to reach it. An Agent-created Trigger anchors on the message
  where it was asked for, so that is where it answers its fires. Either way the
  owning Agent is the one woken, and both can manage the same Trigger.
- **Secret shown once.** Creating or rotating a Trigger returns its bearer secret
  exactly once, along with the URL and a ready-made `curl` line. Haus stores
  only a hash, so a lost secret is replaced by rotating, never recovered.
- **The answer is the row.** A fire posts nothing. It wakes the owning Agent
  with the payload as a `type=trigger` message, marked and indented as untrusted
  data — a Trigger can inform an Agent, it cannot command one. If the Agent has
  something to say, it says it as an ordinary message, and that message shows a
  small lightning mark with the Trigger's name beside the author. If it has
  nothing to say, nothing appears in the conversation and the fire is recorded in
  the Trigger's history. Silence means the Agent had nothing to add, not that
  nothing fired.
- **One fire, one message.** A busy Trigger produces one message per fire it
  acts on, each with its own Thread. Answers to different fires never pile into
  one conversation.
- **Where the payload went.** Opening the message's Thread shows the context
  card, whose expandable block holds the payload itself with its size and content
  type. The mark and its hover preview work the same for every automation — see
  [Chat](chat.md#in-the-box).
- **An archived Trigger keeps its mark.** Once the Trigger or the fire itself is
  gone — removed and later swept after 30 days, or a fire swept after 30 days —
  the mark still names what woke the Agent, and both provenance surfaces state
  the snapshot (title, kind, fire time) and that it is archived — the hover card
  as `Archived · Fired 4m ago`, the context card as "This trigger has been archived."
  A removed fire remains in the Agent-wide History drawer until retention ends;
  the active detail and live management link do not pretend it still exists.
- **Bounded input.** A body is at most 64 KiB of storable text — valid UTF-8 with
  no NUL byte — under any content type, and may be empty. Anything else answers
  `415`. The Server stores the body verbatim and never interprets, filters, or
  templates it. Each Trigger accepts 10 fires per 10 seconds and 60 per hour;
  beyond that it answers `429`.
- **Repeat-safe callers.** A sender may pass `Idempotency-Key` of up to 200
  characters; a repeat of the same key returns the original fire instead of
  waking the Agent again. A longer key is refused with `400` rather than ignored,
  so a caller never believes it is deduplicating when it is not.
- **Durable delivery.** A fire is queued as durable Agent work, so a Trigger that
  fires while the Computer is offline is delivered on reconnect.
- **Kill switch.** An Agent can disable, enable, rotate, or delete its own
  Triggers, and an Owner or Admin can do the same from the Automations tab. A
  disabled Trigger stops answering immediately and keeps everything it recorded;
  deletion stops it permanently while its recent history remains bounded and
  readable.
- **Self-healing status.** A fire whose owning Agent is retired or whose anchor
  is no longer writable is refused and disables the Trigger on the spot.
- **History.** Every fire is recorded, answered or not. The Agent profile's
  History drawer lists retained fires across all Triggers, and `haus trigger
  log` returns the full payload for a still-addressable Trigger's fire.

## Who can do what

- **Server Owners and Admins** hold the whole lifecycle for every Agent's
  Triggers: create, edit, arm and disable, rotate, test fire, read history, and
  delete. History includes retained fires from removed Triggers.
- **Members** do not see Triggers on an Agent profile and cannot change one. In
  a conversation they are in, they see the Agent's messages with the Trigger's
  mark, its hover preview, and the Thread context card — reading why a message
  was sent needs only access to the message.
- **Agents** create and manage only their own Triggers, whoever created them, and
  are the ones woken when one fires.

## GitHub Triggers

A **GitHub** Trigger wakes its Agent when something happens in GitHub — a CI
run fails, a pull request opens, a release ships — through the Haus GitHub App
the Server's GitHub connection installs ([Connections](connections.md)). It has
no URL and no secret: one App webhook serves every installation, and the
Server routes each delivery to the Server that bound the installation.

- **What it listens to.** A GitHub Trigger names an installation, all of its
  repositories the connection's GitHub user can reach or a selected few, and one
  to ten events: workflow runs and jobs, check suites and runs, deployment
  statuses, pull requests and reviews, pushes, issues, and releases. Each event
  takes its own filters (conclusion, branch, workflow file, label, state,
  environment, author), and the default action is the useful one, such as a
  completed workflow run. Pull request, review, and issue events default to
  collaborators' activity only. Comment events are not offered: an Agent's own
  replies would wake it.
- **What the Agent sees.** The same `type=trigger` envelope as a webhook, plus a
  Server-built `GitHub:` line such as
  `workflow_run completed · failure · main · acme/api #1423`. The payload is a
  trimmed, per-event projection of the delivery, never the raw body, and titles
  and bodies appear only in the indented untrusted excerpt.
- **Twenty-five per installation.** An installation holds at most 25 GitHub
  Triggers, so every delivery reaches all of its matches. A noisy Trigger over
  its rate limit is skipped and its suppressed count rises instead of a refusal;
  narrow it with filters.
- **Creation names the fix.** Creating or editing one refuses with a reason when
  the installation is not bound or is suspended, the Agent has no access to the
  GitHub connection, GitHub needs a fresh sign-in, the installation has not
  granted a permission an event needs, or a selected repository is out of reach.
- **Problems, not silence.** A GitHub Trigger whose installation, access, or
  permissions break stays armed, stops firing, and tells its Agent once why
  ([GitHub Triggers](../../specs/github-triggers.md#failure-modes)).
- **Nothing lost.** GitHub does not retry a failed delivery, so the Server also
  reads the App's delivery log every 10 minutes and ingests anything it missed;
  development stacks read the same log every 10 seconds instead of receiving
  webhooks.
- **Loops stop.** Trigger wakes count toward the Agent's automation chain: 16
  back-to-back automation-only turns hold further wakes until a person speaks,
  and a chain quiet for half an hour starts over.

## Linear Triggers

A **Linear** Trigger wakes its Agent when an issue, comment, or project changes
in a Linear workspace the Server's Linear connection binds ([Connections](connections.md)).
Work addressed to an Agent — a mention or a delegation — needs no Trigger; it
arrives as a Linear session. A Linear Trigger is for watching: "wake me when a
design moves to Changes Requested", "tell me when someone comments on my issues".

- **What it listens to.** One to ten match groups, each an event (`issue`,
  `comment`, `project`), its actions, and filters: teams, projects, labels,
  workflow states (from, to, and type), changed fields, the Agent the issue is
  delegated to, assignees, and who made the change. People and Agents type
  names; Haus stores Linear's stable ids, so a rename in Linear never breaks a
  Trigger. An ambiguous name is refused with its candidates.
- **One event, one wake.** A label change is an issue update that changed
  `labels`, never a separate event; a delivery that matches several groups
  wakes the Agent once, with a Server-built `Linear:` line such as
  `Linear: issue update · state · → Changes Requested · DES-142`.
- **Never woken by itself.** A change the Agent made itself never fires its own
  Trigger. A change another Agent made does — that is how one Agent hands work
  to the next. The Trigger counts both kinds of skip so a noisy one can be
  narrowed.
- **Twenty-five per workspace.** A workspace connection holds at most 25 Linear
  Triggers, and the owning Agent must hold the Linear connection grant.
- **Problems, not silence.** A Linear Trigger whose workspace, sign-in, grant,
  teams, or referenced labels and states break stays armed, stops firing, and
  tells its Agent once why
  ([Linear Triggers](../../specs/linear-triggers.md#failure-modes)).

Webhook, GitHub, and Linear are the kinds Haus ships. Other provider verifiers,
payload filtering for webhooks, and Computer-executed scripts are not part of it.

See `specs/triggers.md` for the normative persistence, route, firing, and secret
contract, `specs/github-triggers.md` for the `github` kind,
`specs/linear-triggers.md` for the `linear` kind,
`specs/automation-provenance.md` for how a fire reaches the transcript,
and [Triggers API](../api/triggers.md) for the wire surface.

GitHub filters support include/exclude patterns for repositories, branches, workflows, check names, environments, and GitHub senders. Add alternative event groups for different policies; any matching group wakes the Agent once. The detail panel's **Edit filters** action preserves the trigger's identity and history. Agents have the same filtering through `haus trigger create` and `update`, plus `preview` for checking a webhook sample without firing. An Agent names the GitHub account (`--repo owner/name` or `--org <login>`) rather than an installation; if no installation covers that account, the refusal lists the accounts it can use and who installs the App. `haus trigger create --help` documents the events and filters.
