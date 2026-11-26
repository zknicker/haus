import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import { TaskInvariantError } from './task-errors.ts';

export async function readTaskIdOfAgent(
    db: Pick<HausDatabase, 'select'>,
    input: { agentId: string; serverId: string }
) {
    const [task] = await db
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.agentId, input.agentId)))
        .limit(1);
    if (!task) {
        throw new TaskInvariantError('Only a Task reports its turn. Captains answer in chat.');
    }
    return task.id;
}
