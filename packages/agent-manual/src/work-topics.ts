import type { ManualNavigationTopic } from './types.ts';

/**
 * Work that takes longer than a reply: Tasks and the Workers that work for them (ADR 0053).
 * The managed prompt says what a Task is; these topics carry the commands and edge cases.
 */
export const workTopics: readonly ManualNavigationTopic[] = [
    {
        body: `# Tasks

A Task is your crew: a fresh agent session with its own chat, started for one piece of work that takes longer than a reply. It runs on one Machine with one model, both fixed at start, and it is active or archived. People follow it in their sidebar and talk to it in its chat. It is unread only for its followers: whoever started it, the author of its origin message, anyone that message mentions, and anyone who has posted in it. You do not follow your own crew; their reports reach you instead. It has a short id like \`k3mq7xta\`, which names it everywhere.

A claim is a different thing: the lock on one message, so two Agents do not work the same request. A Task does not mark work as yours; claim the request first, as always.

**When to start one.** When your reply will not finish the work and someone else can do it from a brief. When your reply is the whole of the work, just reply.

**Starting.** The brief arrives on stdin and is the Task's first message, posted as you: \`haus task start --title "Rotate the signing key" --target "#security" --from <messageId> < brief.md\`. It is all the Task knows of your conversation, so make it complete: what to do, where, and what a finished result looks like. \`--target\` names the chat you are answering in, and a newer message there holds the start, which writes nothing; \`--from\` makes a message there the Task's origin. \`--issue GEN-12\` links and assigns an open Issue of your Project to the Task without changing its state. \`--repo owner/name\` (with \`--ref\`) tells it which repo to check out first. \`--machine\` and \`--model\` default to your crew Machine and crew model, then the Project's default Machine and your own model. \`--request-id\` makes a retry return the same Task. The receipt says the Task is queued and prints its short id. Answer the request where it was asked with a link to the Task, \`[the title](task://k3mq7xta)\`.

**Whose Project.** You start Tasks only in your Project. For work that belongs to another Project, @mention that Project's Agent in its channel with the request; an Issue of another Project is refused with \`TASK_PROJECT_NOT_HOME\`.

**Crew reports.** A Task ends each turn you directed (its brief, or your \`haus task send\`) with a report, which posts in its chat and reaches you as a crew report, batched with your other crew's. A turn that ends with no report sends you a receipt with its last message. A turn a person drove reaches you only when it failed or asks for help without naming a person. The report is already in the Task, so post only what it does not say.

**Messaging a Task.** \`haus task send k3mq7xta < follow-up.md\` posts in its chat as you and wakes it; it is the only way to reach one, since \`message send\` to a Task's target is its own. \`--delivery steer\` (the default) reaches a busy Task at its next tool boundary, \`interrupt\` stops its turn and runs again with your message first, and \`queue\` waits for its next turn. A send to an archived Task brings it back. Agent sends spend the automation chain, so Tasks cannot ping-pong.

**Pull requests.** A Task attaches the pull requests it reports; one opened another way attaches with \`haus task attach-pr k3mq7xta <url>\`. A change after its turn wakes the Task, not you. A merged pull request never ends the Task.

**Reminders.** A one-time reminder on a Task wakes the Task and shows on its page: \`haus reminder schedule --target task:k3mq7xta --title "Deploy Check" --delay-seconds 3600\`. A recurring reminder cannot be set on a Task (\`TASK_RECURRING_REMINDER\`). Archiving a Task cancels its pending reminders.

**Finishing.** \`haus task archive k3mq7xta\` when the work is finished or turns out unneeded; there is no deletion. Archive frees its session; \`haus task unarchive k3mq7xta\` restores it without starting a turn, and the next message wakes a fresh session.

**Listing and reading.** \`haus task list\` shows the active Tasks you started, newest first. \`--all\` shows everyone's, \`--project SEC\` one Project's, and \`--archived\` archived ones. \`haus task show k3mq7xta\` prints the Task, its activity, Machine and model, and what references it. Read its chat with \`haus message read --target task:k3mq7xta\`.

**Referencing.** Link a Task in a message as \`[the title](task://k3mq7xta)\`. Haus links it to the Task and lists your message under its \`Mentioned in\`; a link wakes nobody. A bare code like \`GEN-12\` names an Issue, never a Task.

Errors: \`TASK_NOT_FOUND\` names a short id the Server does not have. \`TASK_START_NOT_CAPTAIN\` means a Task tried to start a Task. \`TASK_ARCHIVED\` means a Task sent to an archived Task; only people and Captains bring one back. \`TASK_PROJECT_NOT_HOME\` means the Project is not yours; ask its Agent in its channel.`,
        id: 'tasks',
        kind: 'overview',
        related: ['claims', 'reminder', 'workers'],
        summary:
            'Start crew with a brief, hear their reports, message them with task send, and archive them.',
        title: 'Tasks',
    },
    {
        body: `# Workers

A Worker is a quiet, scoped run you hand bounded development work to. It belongs to one Task, works in a repository without you, and ends each turn with a report that posts in the Task and wakes you there.

Use one when the work is a real coding change someone else's machine can build (reproduce a failure, make the change, open a pull request) and you would otherwise sit and wait. Keep work you can finish in this turn, and anything needing conversation, for yourself.

\`haus worker start --task <id> --repo <owner/name> --title <text> [--on <place>] [--ref <ref>] [--runtime <claude-code|codex>] [--model <id>]\`

The brief arrives on stdin. Make it complete: the repository paths, the reproduction, and what a finished result looks like, so the Worker rarely needs to ask. \`--title\` names the work for people, and \`--ref\` is the starting branch, tag, or commit, else the repository's default branch. \`--repo\` is required, and any repo works on any place: a Computer with no folder for it clones it once into Haus's own data (see repos). Starting posts nothing: the Worker's card shows on the Task's page, and you say what you started only when that is worth saying. The receipt says the Worker is \`started\` or \`queued\` behind its place's limit, never that it finished launching.

**Your Worker rules ride every turn.** \`drive/agents/<your handle>/WORKER.md\` holds the rules every Worker of yours follows. Haus puts it, with the team and Project AGENTS.md, in each Worker's first turn and sends it again after it changes, so the brief carries only the work (see rules).

**It works for a Task.** Start the Task first (see tasks), then the Worker with \`--task k3mq7xta\`. A start without an active Task you can reach is refused with \`WORKER_TASK_REQUIRED\` or \`WORKER_TASK_CLOSED\`. A Task can hold several Workers; start another only for a genuinely separate assignment.

**Places.** \`haus worker places --task k3mq7xta\` lists where a Worker can run: each Computer with its **Run Workers here** setting, runtimes, repo folders, and free slots, then \`cursor\` and \`claude\`, with the Project's default marked. \`--on\` takes a Computer by name (\`computer:mini\` or \`mini\`, or the \`computer:<id>\` that \`places\` prints when two share a name), or \`cursor\` or \`claude\` for a cloud agent. Without \`--on\` a start runs on the Task's Project default, and a Project with none refuses it (a person sets one at Settings → Projects → (the project) → Workers → Default place). Name a place when the requester asks for one.

**On a Computer.** A Worker on a Computer runs Claude Code or Codex on that machine with the machine's own logins, in a git worktree of that Computer's folder for the repo on its own branch, and records its report with \`haus worker report\`. Closing the Worker removes the worktree once its commits are pushed, and keeps unpushed work, which its card shows. \`--runtime\` picks the harness, else the first ready one, and \`--model\` its model, else the runtime's default. Its deliverables land in your Drive area under \`agents/<handle>/reports/<shortId>/\`, \`renders/<shortId>/\`, or \`handoffs/<shortId>/\`, each revision naming the Worker, and its report cites them. A cloud agent's model is the one an Owner or Admin picks at Settings → Models.

**Refusals.** A refused start writes nothing, and its message says what to do. \`WORKER_PLACE_REQUIRED\` means there is no \`--on\` and no usable default, or the Project's default cannot take a Worker now; it lists the usable places. \`WORKER_PLACE_OFF\` means that Computer's **Run Workers here** setting is off, which also refuses follow-ups there. \`WORKER_PLACE_NO_ACCESS\` means that Computer has not allowed you (topic \`computers\`); a Worker you already started there keeps running. \`WORKER_PLACE_UNAVAILABLE\` means the place cannot take a Worker now: the Computer is offline, or no online Computer has that cloud agent connected. \`WORKER_PLACE_AMBIGUOUS\` means two Computers share the name; use the \`computer:<id>\` form. \`WORKER_RUNTIME_UNAVAILABLE\` means the runtime is not signed in there; drop \`--runtime\` or pick another place. \`WORKER_MODEL_UNAVAILABLE\` means that runtime there cannot run the \`--model\` you named; it lists the models it can, and leaving \`--model\` out picks one of them. \`WORKER_OPTION_CLOUD\` means \`--runtime\` and \`--model\` are for Computer places only. For anything a person must change, ask the person who attached that Computer, whom the message names.

**Launch approval.** A start spends provider time on someone's repository. When the Server, the requester, or your brief wants a person to approve, @mention them with the repository, ref, and a one-line brief, and wait for an explicit yes in reply before \`start\`.

**Freshness hold.** Like \`haus message send\`, a start is held when newer messages arrived in the Task since you last read it. Nothing is started; read them, and run the same command again if the work still belongs.

**Reports.** Each turn ends with one report: \`done\`, \`needs-you\` with its ask (and the person it is for, when the Worker names one), or \`failed\`. It posts in the Task as your message, so do not repeat it, and reaches you as a \`worker_report\` inbox item; several reports on one Task arrive together. A turn that ended with nothing to report reaches you as a failure Haus recorded, such as \`no-report\`, and posts nothing, so tell the Task what matters. When a pull request a Worker reported later becomes ready for review, or its checks pass or fail, another attention says what changed and gives the URL.

**Follow-ups.** \`haus worker send --worker <workerId>\` queues instructions from stdin as the Worker's next turn. It posts nothing. A working turn is never steered: follow-ups wait for it to settle, then run together, in order. Answer a needs-you report this way. Add \`--interrupt\` when the new instructions replace the working turn and anything queued behind it. People can send a Worker follow-ups from its card too.

**Stop.** \`haus worker stop --worker <workerId>\` stops the working or queued turn and drops queued follow-ups; a stopped turn reports nothing. A later \`send\` starts a new turn. Anyone who can read the Task can stop a Worker from its card. Archiving the Task stops its Workers and delivers each one's final outcome to you.

**Stalls.** A cloud turn that cannot take a follow-up wakes you once with \`followup-auto-interrupt-failed\` and keeps retrying underneath: wait, stop, or \`send --interrupt\`.

\`haus worker inspect\` lists your Workers, newest first; \`--task <id>\` narrows to one Task. \`--worker <workerId>\` reads one Worker with its turns, inputs, reports, and pull requests, and \`--report\` prints a turn's full provider result (\`--turn <turnId>\` for an older one).

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
