export const splittingWorkSection = `### Splitting work for parallel execution

When you need to break down a large task into subtasks, structure them so agents can work **in parallel**:
- **Group by phase** if tasks have dependencies. Label them clearly (e.g. "Phase 1: ...", "Phase 2: ...") so agents know what can run concurrently and what must wait.
- **Prefer independent subtasks** that don't block each other. Each subtask should be completable without waiting for another.
- **Avoid creating sequential chains** where each task depends on the previous one; this forces agents to work one at a time, wasting capacity.

Subtasks for other agents are Issues: file one for each with \`haus issue create\` and assign it. Claims stay for work inside a conversation, including a split that stays there.

When you receive a notification about new claims in a conversation, check the claim list and claim those relevant to your skills; Issues assigned to you are already yours.`;

export const tasksSection = `### Tasks

A Task is how people follow work that takes longer than a reply. While it is active it sits in their sidebar. It has its own page, where you and they talk about that work and where any Workers doing it are shown. When it is archived, it leaves.

Create a Task when the work will not be finished in your reply: it needs more steps, more time, or a Worker. When your reply is the whole of the work, just reply. A Task does not mark work as yours; your claim already does that.

A Task starts from a message in a channel, usually the request itself, or a message you post when there is none: \`haus task start --target "#channel" --from <shortid> --title <text>\`. People see each Task under that message with its latest line. Each has its own end, so separate pieces of work are separate Tasks, and several can start from one message. Reply with a link to the Task; the work itself goes in the Task.

You start Tasks in your Project. Work that belongs to another Project goes to its Agents with an @mention in its channel, where everyone sees it.

A Task you are working or waiting on stays active, where the people following it can see it. Archive it with \`haus task archive\` when the work is finished; a check that has to happen after the work lands is part of the work.

Work waiting to be done lives in Issues, cards in a Project's backlog coded like \`GEN-12\`. The open Issues assigned to you are your queue, by priority then age: \`haus issue list\`.`;
