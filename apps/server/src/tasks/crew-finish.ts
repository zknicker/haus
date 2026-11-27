import type { CrewFinish } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { inboxWork } from '../agent-delivery/inbox-work.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import { taskNeedsYouSql } from './task-activity.ts';

/**
 * A crew Task's turn settled: its Captain gets one `crew_finish` item naming the Task and how
 * the turn ended (specs/inbox.md#crew-finishes). An interrupted turn has a successor, so it
 * sends nothing.
 */
export async function settleCrewTurn(
    tx: HausDatabase,
    input: {
        agentId: string;
        runId: string;
        serverId: string;
        status: 'completed' | 'failed' | 'interrupted';
    }
) {
    if (input.status === 'interrupted') {
        return null;
    }
    const [task] = await tx
        .select({
            captainId: tasksTable.captainId,
            id: tasksTable.id,
            needsYou: taskNeedsYouSql,
            shortId: tasksTable.shortId,
            title: tasksTable.title,
        })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.agentId, input.agentId)))
        .limit(1);
    if (!task?.captainId) {
        return null;
    }
    const finish: CrewFinish = {
        ending: turnEnding(input.status, task.needsYou),
        id: `crew-finish:${task.id}:${input.runId}`,
        taskShortId: task.shortId,
        title: task.title,
    };
    await inboxWork.enqueue(tx, {
        agentId: task.captainId,
        chatId: null,
        content: JSON.stringify(finish),
        dedupeKey: finish.id,
        mentioned: true,
        serverId: input.serverId,
        source: 'crew_finish',
    });
    return { agentId: task.captainId, serverId: input.serverId };
}

function turnEnding(status: 'completed' | 'failed', needsYou: boolean) {
    if (status === 'failed') {
        return 'failed' as const;
    }
    return needsYou ? ('waiting' as const) : ('finished' as const);
}
