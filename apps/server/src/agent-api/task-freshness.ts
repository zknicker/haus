import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { type TaskWorkThreadRow, taskWorkThreadChatId } from '../tasks/task-work-thread.ts';
import { readFreshnessScope, unseenAttention } from './freshness-attention.ts';

/**
 * Whether the task's work Thread holds context from someone else that this
 * Agent has not seen: the Thread anchored on a top-level task, or the Thread a
 * Thread task sits in. A Thread counts every reply (`unseenAttention`).
 */
export async function hasUnseenTaskThreadContext(
    db: HausDatabase,
    runner: ResolvedRunner,
    task: TaskWorkThreadRow
) {
    const scope = await readFreshnessScope(db, runner, taskWorkThreadChatId(task));
    if (!scope || scope.latest <= scope.after) {
        return false;
    }
    const [newer] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(unseenAttention(scope, scope.after))
        .limit(1);
    return Boolean(newer);
}
