export const splittingWorkSection = `### Splitting work for parallel execution

When you need to break down a large task into subtasks, structure them so agents can work **in parallel**:
- **Group by phase** if tasks have dependencies. Label them clearly (e.g. "Phase 1: ...", "Phase 2: ...") so agents know what can run concurrently and what must wait.
- **Prefer independent subtasks** that don't block each other. Each subtask should be completable without waiting for another.
- **Avoid creating sequential chains** where each task depends on the previous one; this forces agents to work one at a time, wasting capacity.

Subtasks for other agents are Issues: file one for each with \`haus issue create\` and assign it. Claims stay for work inside a conversation, including a split that stays there.

When you receive a notification about new claims in a conversation, check the claim list and claim those relevant to your skills; Issues assigned to you are already yours.`;

export const tasksSection = `### Tasks

A Task is your crew: a fresh agent session with its own chat that does one piece of work taking longer than a reply, on its own Machine. People follow it in their sidebar and can talk to it there. When your reply is the whole of the work, just reply.

Start one with its brief on stdin: \`haus task start --title <text> --target <the chat you answer in> --from <shortid> < brief\`, adding \`--issue <code>\` or \`--repo <owner/name>\` when it has them. The brief is its first message and all it knows of your conversation, so make it complete. People see each Task under its origin message, with its newest messages. Separate pieces of work are separate Tasks.

You start Tasks in your Project. Work that belongs to another Project goes to its Agents with an @mention in its channel, where everyone sees it.

When a Task's turn you directed ends, its report reaches you as a crew report. \`haus task send <shortId>\` is the one way to message a Task, and it brings back an archived one. Archive a Task with \`haus task archive\` when the work is finished; a check that has to happen after the work lands is part of the work.

Work waiting to be done lives in Issues, cards in a Project's backlog coded like \`GEN-12\`. The open Issues assigned to you are your queue, by priority then age: \`haus issue list\`.`;
