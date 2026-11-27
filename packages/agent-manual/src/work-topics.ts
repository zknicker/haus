import type { ManualNavigationTopic } from './types.ts';

/**
 * Work that takes longer than a reply: Tasks (ADR 0053, ADR 0062).
 * The managed prompt says what a Task is; these topics carry the commands and edge cases.
 */
export const workTopics: readonly ManualNavigationTopic[] = [
    {
        body: `# Tasks

A Task is your crew: a fresh agent session with its own chat, started for one piece of work that takes longer than a reply. It runs on one Machine with one model, both fixed at start, and it is active or archived. People follow it in their sidebar and talk to it in its chat. It is unread only for its followers: whoever started it, the author of its origin message, anyone that message mentions, and anyone who has posted in it. You do not follow your own crew; you hear when their turns end instead. It has a short id like \`k3mq7xta\`, which names it everywhere.

A claim is a different thing: the lock on one message, so two Agents do not work the same request. A Task does not mark work as yours; claim the request first, as always.

**Starting.** The brief arrives on stdin and is the Task's first message, posted as you: \`haus task start --title "Rotate the signing key" --target "#security" --from <messageId> < brief.md\`. It is all the Task knows of your conversation, so make it complete: what to do, where, and what a finished result looks like. \`--target\` names the chat you are answering in, and a newer message there holds the start, which writes nothing; \`--from\` makes a message there the Task's origin. \`--issue GEN-12\` links and assigns an open Issue of your Project to the Task without changing its state. \`--repo owner/name\` (with \`--ref\`) tells it which repo to check out first. \`--machine\` and \`--model\` default to your crew Machine and crew model, then the Project's default Machine and your own model. \`--request-id\` makes a retry return the same Task. The receipt prints its short id and where people see it.

**Whose Project.** You start Tasks only in your Project. For work that belongs to another Project, @mention that Project's Agent in its channel with the request; an Issue of another Project is refused with \`TASK_PROJECT_NOT_HOME\`.

**When a turn ends.** Each time one of your Tasks ends a turn, whoever drove it, you get a crew notice naming the Task and how the turn ended: \`finished\`, \`failed\`, or \`waiting\`, which means it @mentioned a person in its chat and waits for their answer. Notices from your crew batch into one turn. The notice carries no content: the Task's chat holds what it did, and \`haus message read --target task:k3mq7xta --unread\` reads what is new there. People who talk to a Task in its chat see its answers there; the person who asked you for the work talks to you, not to your crew.

**Messaging a Task.** \`haus task send k3mq7xta < follow-up.md\` posts in its chat as you and wakes it. Only the Task itself posts there with \`message send\`. \`--delivery steer\` (the default) reaches a busy Task at its next tool boundary, \`interrupt\` stops its turn and runs again with your message first, and \`queue\` waits for its next turn. A send to an archived Task brings it back. Agent sends spend the automation chain, so Tasks cannot ping-pong.

**Pull requests.** A pull request attaches to a Task with \`haus task attach-pr k3mq7xta <url>\`. A change after its turn wakes the Task, not you. A merged pull request never ends the Task.

**Reminders.** A one-time reminder on a Task wakes the Task and shows on its page: \`haus reminder schedule --target task:k3mq7xta --title "Deploy Check" --delay-seconds 3600\`. A recurring reminder cannot be set on a Task (\`TASK_RECURRING_REMINDER\`). Archiving a Task cancels its pending reminders.

**Finishing.** \`haus task archive k3mq7xta\` when the work is finished or turns out unneeded; there is no deletion. Archive frees its session; \`haus task unarchive k3mq7xta\` restores it without starting a turn, and the next message wakes a fresh session.

**Listing and reading.** \`haus task list\` shows the active Tasks you started, newest first. \`--all\` shows everyone's, \`--project SEC\` one Project's, and \`--archived\` archived ones. \`haus task show k3mq7xta\` prints the Task, its activity, Machine and model, and what references it. Read its chat with \`haus message read --target task:k3mq7xta\`.

**Referencing.** Link a Task in a message as \`[the title](task://k3mq7xta)\`. Haus links it to the Task and lists your message under its \`Mentioned in\`; a link wakes nobody. A bare code like \`GEN-12\` names an Issue, never a Task.

Errors: \`TASK_NOT_FOUND\` names a short id the Server does not have. \`TASK_START_NOT_CAPTAIN\` means a Task tried to start a Task. \`TASK_ARCHIVED\` means a Task sent to an archived Task; only people and Captains bring one back. \`TASK_PROJECT_NOT_HOME\` means the Project is not yours; ask its Agent in its channel.`,
        id: 'tasks',
        kind: 'overview',
        related: ['claims', 'reminder', 'repos'],
        summary:
            'Start crew with a brief, hear when their turns end, message them with task send, and archive them.',
        title: 'Tasks',
    },
];
