import type { ManualNavigationTopic } from './types.ts';

/**
 * Work that takes longer than a reply: Tasks and the cloud agents that work for them (ADR 0053).
 * The managed prompt says what a Task is; these topics carry the commands and edge cases.
 */
export const workTopics: readonly ManualNavigationTopic[] = [
    {
        body: `# Tasks

A Task is how people follow work that takes longer than a reply: a title, a state (\`todo\`, \`open\`, \`done\`, \`canceled\`), its own conversation, and the cloud agents and pull requests doing the work. While it is open it sits in everyone's sidebar with its state; todo Tasks are not listed. It is unread only for its followers: the author of its origin message, anyone that message mentions, anyone who has posted in it, and its assignee. When it is done or canceled, it leaves the sidebar. Its key reads like \`SEC-12\`: the key of the channel it started in and a number.

A claim is a different thing: the lock on one message, so two Agents do not work the same request. A Task does not mark work as yours; claim the request first, as always.

**When to start one.** When your reply will not finish the work: it needs more steps, more time, or a cloud agent. When your reply is the whole of the work, just reply.

**Starting.** A Task starts from a message in a channel, usually the request itself: \`haus task start --target "#security" --from <messageId> --title "Rotate the signing key"\`. It starts \`open\` and assigned to you unless you add \`--state todo\` or \`--assignee @kit\`; \`--description -\` reads a description from stdin, and \`--priority\` and \`--due\` set the rest. The receipt names the Task's target, \`task:SEC-12\`. A start is not idempotent, so check \`haus task list\` before repeating one that went unanswered. Answer the request where it was asked with the Task's key, so the requester can follow it.

**No suitable message.** A request in a DM, a reminder or trigger fire, or your own finding has no channel message to start from. Post one in the channel where the work belongs (for a fire, its anchor channel), mention whoever asked, and start the Task from it; answer a DM request with the Task's key. Tasks never start in a DM: the Server refuses with \`TASK_ORIGIN_DM\`. Several Tasks can start from one message: when you find five issues, post one message and start five Tasks from it. Tasks have no parents or children.

**Working it.** Talk about the work in the Task: \`haus message send --target task:SEC-12\`, and read it with \`haus message read --target task:SEC-12\`. Progress, questions (with an @mention of whoever must answer), and the result go there, where followers see them as unread. People see the Task under the message that started it, with its state and latest line, so do not repeat the result in the channel: the Task's key in your reply when you start it is all the channel needs.

**One at a time.** Work Tasks others assign you one at a time: pick by priority, then age, set that one \`open\` with \`haus task state SEC-12 open\`, and leave the rest \`todo\` until it is done or blocked. Tasks you started yourself, such as several from one findings message, can run side by side.

**Cloud agents and pull requests.** A cloud agent needs a Task: \`haus cloud-agent start --task SEC-12 ...\` (see cloud-agents). Its run notices wake you on the Task, and so does its pull request becoming ready for review or its checks finishing after the run settled. A pull request opened another way attaches with \`haus task attach-pr SEC-12 <url>\`. A merged pull request never ends the Task.

**Reminders.** A one-time reminder on a Task wakes you on that Task and shows on its page, like "checks back at 7:35": \`haus reminder schedule --target task:SEC-12 --title "Deploy Check" --delay-seconds 3600\`. A recurring reminder cannot be set on a Task (\`TASK_RECURRING_REMINDER\`); anchor it in a channel, and a fire that turns up real work starts a Task. Closing a Task cancels its pending reminders, and reopening does not restore them.

**Finishing.** \`haus task state SEC-12 done\` when the work is finished, \`canceled\` when it turns out unneeded; there is no deletion. If a check must happen after the work lands (a deploy, a backfill), keep the Task open with a one-time reminder until the check passes. Posting in a done or canceled Task reopens it.

**Waiting on a person.** @mention them in the Task with one question and take other work; the Task stays \`open\`, so it stays in their sidebar. Leave it until they answer: do not ask again. Their reply wakes you.

**Listing and reading.** \`haus task list\` shows your todo and open Tasks, most urgent then oldest first. \`--key SEC\` shows everyone's with that key, \`--assignee @zero\` or \`--assignee none\` someone else's or nobody's, \`--all\` every assignee, and \`--state done,canceled\` closed work. \`haus task show SEC-12\` prints the Task, its target, its description, the messages that mention it, and its Reminders.

**Assigning and editing.** \`haus task assign SEC-12 @kit\` takes a handle, \`me\`, or \`none\`; the assignee follows the Task, and an Agent you assign is woken. \`haus task update SEC-12 --priority urgent\` changes \`--title\`, \`--description\`, \`--priority\`, \`--labels\` (the whole set, or \`none\`), or \`--due\` (a date, or \`none\`). A due date sorts and badges; it wakes nothing. Without \`--expected-version <n>\` the last write wins; \`haus task show\` prints the version.

**Referencing.** Write the bare key in a message, \`SEC-12\` exactly as printed, outside code and links. Haus links it to the Task and lists your message under its \`Mentioned in\`.

Errors: \`TASK_NOT_FOUND\` names a key the Server does not have. \`TASK_CONFLICT\` means the Task changed after the version you named; read it again. \`TASK_ORIGIN_DM\` means the origin message is in a DM. \`INVALID_ARG\` names the handle or label that resolved to nothing.`,
        id: 'tasks',
        kind: 'overview',
        related: ['claims', 'reminder', 'cloud-agents'],
        summary:
            'Start a Task from a channel message for work a reply will not finish, work it there, and close it.',
        title: 'Tasks',
    },
    {
        body: `# Cloud agents

A Cloud Agent is a provider-hosted agent you hand bounded development work to. You start it for a Task, it works in a repository without you, and its result reaches you on that Task when the run settles.

Use one when the work is a real coding change in a repository someone else's machine can build — reproduce a failure, make the change, open a pull request — and you would otherwise sit and wait. Keep work you can finish in this turn, and anything needing conversation, for yourself.

\`haus cloud-agent start --task <KEY-n> --repo <owner/name> --ref <ref> --title <text> --say <text>\`

The instructions for the cloud agent arrive on stdin. Write them as a complete brief: name the repository paths, the reproduction, and what a finished result looks like, so the cloud agent rarely needs to ask. \`--say\` is your own message to the Task and becomes the Message content, so say what you delegated and why in your own words. \`--title\` names the work for humans, and \`--ref\` is the starting branch, tag, or commit. When the launch answers a reminder or trigger fire, add \`--cause <fireId>\` as on \`haus message send\`.

**It works for a Task.** Cloud work attaches to a Task and reports there: start the Task first (see tasks), then launch with \`--task SEC-12\`. The work's card shows on the Task's page, and a launch without a Task is refused with \`CLOUD_AGENT_TASK_REQUIRED\`. A Task can hold several cloud agents; start another only for a genuinely separate assignment.

**Launch approval.** A launch spends provider time on someone's repository. When the Server, the requester, or your brief wants a human to approve launches, @mention that human with the repository, starting ref, and a one-line brief, and wait for an explicit yes in reply before \`start\`. Silence, a reaction, or "sounds interesting" is not a yes. There is no approval card; their reply wakes you.

Launch fails before anything is created when the input is wrong, the Computer has no Cloud Agent provider, the Task is missing or unreachable, or — for Claude — the Computer's pinned cloud environment no longer exists or is archived. That last one is a fix for whoever administers the Computer, in Computer settings; there is nothing to retry or reconfigure from the CLI. Once the work is recorded it stays recorded: a provider that refuses the launch settles that same work as failed rather than erasing it.

**Freshness hold.** Like \`haus message send\`, a launch is held when newer messages arrived in the Task since you last read it. Nothing is posted or launched, and the newer messages are shown. If the launch still belongs there, run the same command again; if they move or cancel it, follow them.

For revisions, corrections, or another step in the same assignment, send instructions on stdin with \`haus cloud-agent send --work <workId>\`. Reuse the Work ID from the start receipt. This continues the same hosted agent on the same Task, preserving its repository context and earlier results. A Claude agent takes the follow-up right away, even mid-turn on the work ahead of it, the same way a message sent mid-turn reaches you; a Cursor agent queues it until its active run finishes, since Cursor cannot take a second prompt at once. Either way Haus never fails a follow-up just because the provider stayed busy. Add \`--interrupt\` when the new instructions replace active work and any older queued prompts.

\`haus cloud-agent inspect\` lists work you delegated, newest \`updatedAt\` first. Add \`--work <workId>\` to read that work. Its \`runs\` are newest first. A follow-up that is \`queued\` with \`providerRunId\` null is still waiting for the provider to accept it. A \`queued\` run with a \`providerRunId\` is already accepted. For Cursor, waiting behind a run that Haus is still tracking can last for that whole run, however long it takes. A send that still keeps failing a couple of minutes in gets one automatic interrupt to clear whatever holds the session busy, most often background work the provider agent left running, then one retry right away. If that delivers, nothing else happens. If it doesn't, the inbox item \`followup-auto-interrupt-failed\` wakes you once (a sparse reminder only if it is still stuck much later), with the last error attached, and the follow-up keeps retrying underneath that notice. Nothing is forced: wait if the work is likely to finish on its own, \`haus cloud-agent stop --work <workId>\` to give up on it, \`send --interrupt\` to replace it with new instructions now, or read the error and decide it needs a fresh \`haus cloud-agent start\` instead. Haus wakes you on the Task when an accepted run settles, or in a later turn if you are busy, and again when its pull request becomes ready for review or its checks finish after the run settled; inspect when you need evidence.

**Linking work elsewhere.** The start receipt and \`haus cloud-agent inspect\` print a \`Link:\` line for each work. To show that work in another conversation, paste the link as printed into \`haus message send\`; that Message gets the same live card, and anyone who can read it can see the work. Never write a work link by hand. Linking moves nothing: the Task, the Work ID, and where completion arrives stay the same.

\`haus cloud-agent stop --work <workId>\` asks the provider to stop work you started and discards its queued prompts. Owners and Admins can cancel it too. Cancellation is recorded immediately and the active run settles as cancelled when the provider stops. The earlier \`cancel\` command remains an alias for existing callers. A later \`send\` continues the same work with a new run.

**Provider and model.** Cursor and Claude are the Cloud Agent providers. A launch uses the Computer's default provider, which an Owner or Admin picks at Settings → Devices → (your device) → Cloud Agents; add \`--provider cursor\` or \`--provider claude\` only when the requester asks for one. An Owner or Admin picks each provider's model once per Server at Settings → Models; the default is Auto (Cursor's per-run router, or Claude's account default). You cannot choose or override the model: no command flag or start input carries one.

**Questions.** A Claude cloud agent can stop to ask a question. That settles its run as \`pending_input\` and your inbox attention carries the question as its summary. Answer it yourself when the request already settles it; otherwise ask the requester in the Task and pass their answer on. Send the answer with \`haus cloud-agent send --work <workId>\`, which resumes the same session.

When the run settles you receive one inbox attention on the Task carrying its status, summary, branches, and any pull-request URL, and the report names that pull request's number, state, and diff counts when Haus could read them, so you can judge the size of the change before opening it. \`summary\` is only a capped head, up to 2000 characters; the stored report behind it runs to 64 KiB. When more exists, the attention line adds \`More: haus cloud-agent inspect --work <id> --report\`, which prints that Run's full report, verbatim, with a trailing \`[clipped at 64 KiB]\` marker in the rare case even that cap was hit. When its pull request later becomes ready for review, or its checks pass or fail, another attention says what changed and gives the URL. As the coordinating Agent, keep review rounds, revision requests, and progress in the Task, and @mention the requester there only for a real state change: a pull request ready, a blocker that needs them, the work done, with a concise outcome and a link to the work.`,
        aliases: ['cloud agent model', 'cursor', 'claude cloud'],
        id: 'cloud-agents',
        kind: 'overview',
        related: ['agent', 'tasks', 'haus-cli-overview', 'recipes/decision/when-to-ask-human'],
        summary:
            'Delegate bounded repository work for a Task to a provider-hosted agent and report the result there.',
        title: 'Cloud agents',
    },
];
