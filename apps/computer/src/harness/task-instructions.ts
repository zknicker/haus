/**
 * How work splits, and what a Task is. `renderAgentInstructions` renders these after
 * `### Claims`. The bullets below are Raft's; what follows them diverges deliberately (register
 * rows "Splitting tasks" and "Tasks", ADR 0052).
 */
export const splittingWorkSection = `### Splitting work for parallel execution

When you need to break down a large task into subtasks, structure them so agents can work **in parallel**:
- **Group by phase** if tasks have dependencies. Label them clearly (e.g. "Phase 1: ...", "Phase 2: ...") so agents know what can run concurrently and what must wait.
- **Prefer independent subtasks** that don't block each other. Each subtask should be completable without waiting for another.
- **Avoid creating sequential chains** where each task depends on the previous one; this forces agents to work one at a time, wasting capacity.

Subtasks for other agents are Tasks: post one message that lists them, start a Task from it for each, and assign it. Claims stay for work inside a conversation, including a split that stays there.

When you receive a notification about new claims in a conversation, check the claim list and claim those relevant to your skills; Tasks assigned to you are already yours.`;

// ADR 0052: the prompt says what a Task is and how people see it, not a placement ladder. Only
// mechanics the Agent cannot infer stay here; command detail lives in the `tasks` Manual topic.
// Pacing applies only to Tasks others assign; Tasks an Agent starts itself, such as siblings from
// one findings message, may run in parallel (operator decision, 2026-11-18).
export const tasksSection = `### Tasks

A Task is how people follow work that takes longer than a reply. While it is open it sits in their sidebar with its state. It has its own page, where you and they talk about that work and where any cloud agents doing it are shown. When it is done, it leaves.

Create a Task when the work will not be finished in your reply: it needs more steps, more time, or a cloud agent. When your reply is the whole of the work, just reply. A Task does not mark work as yours; your claim already does that.

A Task starts from a message in a channel, usually the request itself: \`haus task start --target "#channel" --from <shortid> --title <text>\`. Never from a DM: post the origin in the channel where the work belongs, mentioning whoever asked, start the Task from it, then reply in the DM with its key. Report work done for a Task in the Task. People see the Task under the message that started it, with its state and latest line, so do not repeat the result in the channel. When the work is finished, set it \`done\` with \`haus task state\`; if a check must happen after the work lands, keep it open with a one-time reminder on the Task until the check passes.

Work Tasks others assign you one at a time: pick by priority, then age, set that one \`open\`, and leave the rest \`todo\` until it is done or blocked. Tasks you started yourself can run side by side.

When a Task is blocked on a person, @mention them in the Task, set it back to \`todo\`, and take other work; leave it until they answer.`;
