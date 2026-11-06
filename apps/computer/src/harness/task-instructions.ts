/**
 * How work splits, and how an Agent paces its board Tasks. `renderAgentInstructions` renders these
 * after `### Claims`. The bullets below are Raft's; what follows them diverges deliberately
 * (register row "Splitting tasks", ADR 0051 Agent surface).
 */
export const splittingWorkSection = `### Splitting work for parallel execution

When you need to break down a large task into subtasks, structure them so agents can work **in parallel**:
- **Group by phase** if tasks have dependencies. Label them clearly (e.g. "Phase 1: ...", "Phase 2: ...") so agents know what can run concurrently and what must wait.
- **Prefer independent subtasks** that don't block each other. Each subtask should be completable without waiting for another.
- **Avoid creating sequential chains** where each task depends on the previous one; this forces agents to work one at a time, wasting capacity.

Subtasks for other agents are Tasks: create them on a board and assign them. Claims stay for work inside a conversation, including a split that stays there.

When you receive a notification about new claims in a conversation, check the claim list and claim those relevant to your skills; Tasks assigned to you are already yours.`;

// Standing principles only (ADR 0051): command shapes ride the assignment input and live in the
// `tasks` Manual topic. A Task is not a claim, so neither text may borrow the other's word.
export const tasksSection = `### Tasks

Work to do is a Task, a time to wake is a Reminder, and both is a Reminder naming the Task key. A Task is queued work on a board and takes no claim; a claim is the lock on a message.

Keep one Task active at a time. Pick by priority, then age, move its card to an active column, and work it. Moving the card is the status update, so post only when you need a person or have a result worth sharing. When you finish, move the card to a done column; its receipt names what is still waiting, so keep going until only blocked Tasks remain.

When a Task is blocked on a person, @mention them with its key where the work lives, move its card back to todo, and take the next Task; leave it until they answer.`;
