import type { AgentCommand, AgentTaskAssignmentNotice } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import { chatIdsOf, maxDrainRows, noticeWindow } from './drain-selection.ts';
import { buildInboxItems } from './inbox-items.ts';
import { isNoticelessInboxSource } from './inbox-lanes.ts';
import * as store from './store.ts';
import { readUnreadElsewhere } from './unread-elsewhere.ts';

/**
 * The content-free notice for a busy Agent, when the active run has work it has
 * not been told about: the window of Chat rows, plus a count of queued Task
 * assignments. Assignments have no Chat to list under and their bodies wait for
 * the Agent's next turn, so only their number reaches this run (ADR 0051).
 */
export async function planBusyNotice(
    tx: HausDatabase,
    input: { agentId: string; runId: string; serverId: string }
): Promise<AgentCommand | null> {
    const { agentId, serverId } = input;
    const unnoticed = (await store.listUnnoticedQueuedItems(tx, agentId, maxDrainRows)).filter(
        (row) => !isNoticelessInboxSource(row.source)
    );
    const tasks = await readTaskAssignmentNotice(tx, agentId);
    if (unnoticed.length === 0 && !tasks?.fresh) {
        return null;
    }
    const pending = noticeWindow(
        (await store.listQueuedItems(tx, agentId, 1000)).filter(
            (row) => !isNoticelessInboxSource(row.source)
        ),
        unnoticed
    );
    return {
        agentId,
        inbox: await buildInboxItems(tx, pending),
        runId: input.runId,
        ...(tasks ? { taskAssignments: tasks.notice } : {}),
        totalPending: await store.countQueuedNoticeItems(tx, agentId),
        type: 'notice',
        unreadElsewhere: await readUnreadElsewhere(tx, {
            agentId,
            drainedItemIds: [],
            representedChatIds: chatIdsOf(pending),
            serverId,
        }),
    };
}

/** Every queued assignment, the ones no notice has named first, so an ack can reach them. */
async function readTaskAssignmentNotice(
    tx: HausDatabase,
    agentId: string
): Promise<{ fresh: boolean; notice: AgentTaskAssignmentNotice } | null> {
    const rows = await tx
        .select({
            dedupeKey: agentInboxTable.dedupeKey,
            noticeRunId: agentInboxTable.noticeRunId,
        })
        .from(agentInboxTable)
        .where(and(store.queuedFor(agentId), eq(agentInboxTable.source, 'task_assignment')))
        .orderBy(...store.inboxOrder());
    if (rows.length === 0) {
        return null;
    }
    const fresh = rows.filter((row) => row.noticeRunId === null);
    const named = [...fresh, ...rows.filter((row) => row.noticeRunId !== null)];
    return {
        fresh: fresh.length > 0,
        notice: {
            ids: named.slice(0, maxDrainRows).map((row) => row.dedupeKey),
            total: rows.length,
        },
    };
}
