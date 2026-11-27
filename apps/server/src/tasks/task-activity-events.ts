import { and, eq } from 'drizzle-orm';
import { onAgentLifecycle } from '../agent-delivery/lifecycle.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';

export function installTaskActivityEvents(
    db: Pick<HausDatabase, 'select'>,
    postCommitWork: Pick<ServerPostCommitWork, 'run'>
) {
    const running = new Set<string>();
    return onAgentLifecycle((event) => {
        const settled = event.phase === 'settled';
        if (!settled && running.has(event.runId)) {
            return;
        }
        if (settled) {
            running.delete(event.runId);
        } else {
            running.add(event.runId);
        }
        void postCommitWork.run('task.activity.publish', async () => {
            const [task] = await db
                .select({
                    chatId: tasksTable.chatId,
                    id: tasksTable.id,
                    serverId: tasksTable.serverId,
                    version: tasksTable.version,
                })
                .from(tasksTable)
                .where(
                    and(
                        eq(tasksTable.serverId, event.serverId),
                        eq(tasksTable.agentId, event.agentId)
                    )
                )
                .limit(1);
            if (task) {
                publishRealtime([prepareTaskUpdatedEvent(task)]);
            }
        });
    });
}
