import type { ManualNavigationTopic } from './types.ts';

/**
 * Work that takes longer than a reply: Tasks and the Workers that work for them (ADR 0053).
 * The managed prompt says what a Task is; these topics carry the commands and edge cases.
 */
export const workTopics: readonly ManualNavigationTopic[] = [
    {
        body: `# Tasks

A Task is how people follow work that takes longer than a reply: a title, a state (\`todo\`, \`open\`, \`done\`, \`canceled\`), its own conversation, and the Workers and pull requests doing the work. While it is open it sits in everyone's sidebar with its state; todo Tasks are not listed. It is unread only for its followers: the author of its origin message, anyone that message mentions, anyone who has posted in it, and its assignee. When it is done or canceled, it leaves the sidebar. Its key reads like \`SEC-12\`: its Project's key and a number.

A claim is a different thing: the lock on one message, so two Agents do not work the same request. A Task does not mark work as yours; claim the request first, as always.

**When to start one.** When your reply will not finish the work: it needs more steps, more time, or a Worker. When your reply is the whole of the work, just reply.

**Starting.** A Task starts from the message that asked for it, in a channel or a DM: \`haus task start --target "#security" --from <messageId> --title "Rotate the signing key"\`. It belongs to a Project and takes that Project's key: the one \`--project SEC\` names, else the origin's channel, else for a DM or \`#all\` your Project. It starts \`open\` and assigned to you unless you add \`--state todo\` or \`--assignee @kit\`; \`--description -\` reads a description from stdin, and \`--priority\` and \`--due\` set the rest. The receipt names the Task's target, \`task:SEC-12\`. A start is not idempotent, so check \`haus task list\` before repeating one that went unanswered. Answer the request where it was asked with the Task's key, so the requester can follow it.

**Whose Project.** You start Tasks only in your Project. For work that belongs to another Project, @mention that Project's Agent in its channel with the request; the Server refuses your start there with \`TASK_PROJECT_NOT_HOME\`.

**No suitable message.** A reminder or trigger fire, or your own finding, has no message to start from. Post one in the channel of the Project where the work belongs (for a fire, its anchor channel), mention whoever asked, and start the Task from it. Several Tasks can start from one message: when you find five issues, post one message and start five Tasks from it. Tasks have no parents or children.

**Working it.** Talk about the work in the Task: \`haus message send --target task:SEC-12\`, and read it with \`haus message read --target task:SEC-12\`. Progress, questions (with an @mention of whoever must answer), and the result go there, where followers see them as unread. People see the Task under the message that started it, with its state and latest line, so do not repeat the result in the channel: the Task's key in your reply when you start it is all the channel needs.

**One at a time.** Work Tasks others assign you one at a time: pick by priority, then age, set that one \`open\` with \`haus task state SEC-12 open\`, and leave the rest \`todo\` until it is done or blocked. Tasks you started yourself, such as several from one findings message, can run side by side.

**Workers and pull requests.** A Worker needs a Task: \`haus worker start --task SEC-12 ...\` (see workers). Its reports post in the Task and wake you there, and so does a pull request it reported becoming ready for review or finishing its checks. A pull request opened another way attaches with \`haus task attach-pr SEC-12 <url>\`. A merged pull request never ends the Task.

**Reminders.** A one-time reminder on a Task wakes you on that Task and shows on its page, like "checks back at 7:35": \`haus reminder schedule --target task:SEC-12 --title "Deploy Check" --delay-seconds 3600\`. A recurring reminder cannot be set on a Task (\`TASK_RECURRING_REMINDER\`); anchor it in a channel, and a fire that turns up real work starts a Task. Closing a Task cancels its pending reminders, and reopening does not restore them.

**Finishing.** \`haus task state SEC-12 done\` when the work is finished, \`canceled\` when it turns out unneeded; there is no deletion. If a check must happen after the work lands (a deploy, a backfill), keep the Task open with a one-time reminder until the check passes. Posting in a done or canceled Task reopens it.

**Waiting on a person.** @mention them in the Task with one question and take other work; the Task stays \`open\`, so it stays in their sidebar. Leave it until they answer: do not ask again. Their reply wakes you.

**Listing and reading.** \`haus task list\` shows your todo and open Tasks, most urgent then oldest first. \`--key SEC\` shows everyone's with that key, \`--assignee @zero\` or \`--assignee none\` someone else's or nobody's, \`--all\` every assignee, and \`--state done,canceled\` closed work. \`haus task show SEC-12\` prints the Task, its target, its description, the messages that mention it, and its Reminders.

**Assigning and editing.** \`haus task assign SEC-12 @kit\` takes a handle, \`me\`, or \`none\`; the assignee follows the Task, and an Agent you assign is woken. \`haus task update SEC-12 --priority urgent\` changes \`--title\`, \`--description\`, \`--priority\`, \`--labels\` (the whole set, or \`none\`), or \`--due\` (a date, or \`none\`). A due date sorts and badges; it wakes nothing. Without \`--expected-version <n>\` the last write wins; \`haus task show\` prints the version.

**Referencing.** Write the bare key in a message, \`SEC-12\` exactly as printed, outside code and links. Haus links it to the Task and lists your message under its \`Mentioned in\`.

Errors: \`TASK_NOT_FOUND\` names a key the Server does not have. \`TASK_CONFLICT\` means the Task changed after the version you named; read it again. \`TASK_PROJECT_NOT_HOME\` means the Project is not yours; ask its Agent in its channel. \`INVALID_ARG\` names the handle or label that resolved to nothing.`,
        id: 'tasks',
        kind: 'overview',
        related: ['claims', 'reminder', 'workers'],
        summary:
            'Start a Task from the asking message for work a reply will not finish, work it there, and close it.',
        title: 'Tasks',
    },
    {
        body: `# Workers

A Worker is a quiet, scoped run you hand bounded development work to. It belongs to one Task, works in a repository without you, and ends each turn with a report that posts in the Task and wakes you there.

Use one when the work is a real coding change someone else's machine can build (reproduce a failure, make the change, open a pull request) and you would otherwise sit and wait. Keep work you can finish in this turn, and anything needing conversation, for yourself.

\`haus worker start --task <KEY-n> --repo <owner/name> --title <text> [--on <place>] [--ref <ref>] [--runtime <claude-code|codex>] [--model <id>]\`

The brief arrives on stdin. Make it complete: the repository paths, the reproduction, and what a finished result looks like, so the Worker rarely needs to ask. \`--title\` names the work for people, and \`--ref\` is the starting branch, tag, or commit, else the repository's default branch. \`--repo\` is required, and any repo works on any place: a Computer with no folder for it clones it once into Haus's own data (see repos). Starting posts nothing: the Worker's card shows on the Task's page, and you say what you started only when that is worth saying. The receipt says the Worker is \`started\` or \`queued\` behind its place's limit, never that it finished launching.

**Your Worker rules ride every turn.** \`drive/agents/<your handle>/WORKER.md\` holds the rules every Worker of yours follows. Haus puts it, with the team and Project AGENTS.md, in each Worker's first turn and sends it again after it changes, so the brief carries only the work (see rules).

**It works for a Task.** Start the Task first (see tasks), then the Worker with \`--task SEC-12\`. A start without an open Task you can reach is refused with \`WORKER_TASK_REQUIRED\` or \`WORKER_TASK_CLOSED\`. A Task can hold several Workers; start another only for a genuinely separate assignment.

**Places.** \`haus worker places --task SEC-12\` lists where a Worker can run: each Computer with its **Workers can run here** switch, runtimes, repo folders, and free slots, then \`cursor\` and \`claude\`, with the Project's default marked. \`--on\` takes a Computer by name (\`computer:mini\` or \`mini\`, or the \`computer:<id>\` that \`places\` prints when two share a name), or \`cursor\` or \`claude\` for a cloud agent. Without \`--on\` a start runs on the Task's Project default, else on your Computer's ready cloud default (Settings → Devices → (your device) → Cloud Agents → Make default). Name a place when the requester asks for one.

**On a Computer.** A Worker on a Computer runs Claude Code or Codex on that machine with the machine's own logins, in a git worktree of that Computer's folder for the repo on its own branch, and records its report with \`haus worker report\`. Closing the Worker removes the worktree once its commits are pushed, and keeps unpushed work, which its card shows. \`--runtime\` picks the harness, else the first ready one, and \`--model\` its model, else the runtime's default. Its deliverables land in your Drive area under \`agents/<handle>/reports/<KEY-n>/\`, \`renders/<KEY-n>/\`, or \`handoffs/<KEY-n>/\`, each revision naming the Worker, and its report cites them. A cloud agent's model is the one an Owner or Admin picks at Settings → Models.

**Refusals.** A refused start writes nothing, and its message says what to do. \`WORKER_PLACE_REQUIRED\` means there is no \`--on\` and no usable default, or the Project's default cannot take a Worker now; it lists the usable places. \`WORKER_PLACE_OFF\` means that Computer's **Workers can run here** switch is off, which also refuses follow-ups there. \`WORKER_PLACE_UNAVAILABLE\` means the place cannot take a Worker now: the Computer is offline, or no online Computer has that cloud agent connected. \`WORKER_PLACE_AMBIGUOUS\` means two Computers share the name; use the \`computer:<id>\` form. \`WORKER_RUNTIME_UNAVAILABLE\` means the runtime is not signed in there; drop \`--runtime\` or pick another place. \`WORKER_MODEL_UNAVAILABLE\` means that runtime there cannot run the \`--model\` you named; it lists the models it can, and leaving \`--model\` out picks one of them. \`WORKER_OPTION_CLOUD\` means \`--runtime\` and \`--model\` are for Computer places only. For anything a person must change, ask the person who attached that Computer, an Owner, or an Admin.

**Launch approval.** A start spends provider time on someone's repository. When the Server, the requester, or your brief wants a person to approve, @mention them with the repository, ref, and a one-line brief, and wait for an explicit yes in reply before \`start\`.

**Freshness hold.** Like \`haus message send\`, a start is held when newer messages arrived in the Task since you last read it. Nothing is started; read them, and run the same command again if the work still belongs.

**Reports.** Each turn ends with one report: \`done\`, \`needs-you\` with its ask (and the person it is for, when the Worker names one), or \`failed\`. It posts in the Task as your message, so do not repeat it, and reaches you as a \`worker_report\` inbox item; several reports on one Task arrive together. A turn that ended with nothing to report reaches you as a failure Haus recorded, such as \`no-report\`, and posts nothing, so tell the Task what matters. When a pull request a Worker reported later becomes ready for review, or its checks pass or fail, another attention says what changed and gives the URL.

**Follow-ups.** \`haus worker send --worker <workerId>\` queues instructions from stdin as the Worker's next turn. It posts nothing. A working turn is never steered: follow-ups wait for it to settle, then run together, in order. Answer a needs-you report this way. Add \`--interrupt\` when the new instructions replace the working turn and anything queued behind it. People can send a Worker follow-ups from its card too.

**Stop.** \`haus worker stop --worker <workerId>\` stops the working or queued turn and drops queued follow-ups; a stopped turn reports nothing. A later \`send\` starts a new turn. Anyone who can read the Task can stop a Worker from its card. Closing the Task stops its Workers and delivers each one's final outcome to you.

**Stalls.** A cloud turn that cannot take a follow-up wakes you once with \`followup-auto-interrupt-failed\` and keeps retrying underneath: wait, stop, or \`send --interrupt\`.

\`haus worker inspect\` lists your Workers, newest first; \`--task <KEY-n>\` narrows to one Task. \`--worker <workerId>\` reads one Worker with its turns, inputs, reports, and pull requests, and \`--report\` prints a turn's full provider result (\`--turn <turnId>\` for an older one).

As the coordinating Agent, keep review rounds, revision requests, and progress in the Task, and @mention the requester there only for a real state change: a pull request ready, a blocker that needs them, the work done.`,
        aliases: ['cloud agent model', 'cursor', 'claude cloud', 'workers can run here'],
        id: 'workers',
        kind: 'overview',
        related: [
            'agent',
            'tasks',
            'repos',
            'rules',
            'haus-cli-overview',
            'recipes/decision/when-to-ask-human',
        ],
        summary:
            'Delegate bounded repository work for a Task to a Computer or a cloud agent, and get its report there.',
        title: 'Workers',
    },
];
