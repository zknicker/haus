import type { AgentCommand, AgentIssueWakeNotice } from '@haus/api';
import { and, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import { chatIdsOf, maxDrainRows, noticeWindow } from './drain-selection.ts';
import { buildInboxItems } from './inbox-items.ts';
import { isNoticelessInboxSource } from './inbox-lanes.ts';
import { readQueueDeliveryIds } from './queue-delivery.ts';
import * as store from './store.ts';
import { readUnreadElsewhere } from './unread-elsewhere.ts';

/**
 * The content-free notice for a busy Agent, when the active run has work it has
 * not been told about: the window of Chat rows, plus a count of queued Issue
 * items and of crew reports. Neither has its bodies
 * in a notice; they wait for the Agent's next turn (specs/inbox.md).
 */
export async function planBusyNotice(
    tx: HausDatabase,
    input: { agentId: string; runId: string; serverId: string }
): Promise<AgentCommand | null> {
    const { agentId, serverId } = input;
    const queued = await readQueueDeliveryIds(tx, agentId);
    const listed = (row: store.InboxItemRow) =>
        !isNoticelessInboxSource(row.source) && !queued.has(row.id);
    const unnoticed = (await store.listUnnoticedQueuedItems(tx, agentId, maxDrainRows)).filter(
        listed
    );
    const issues = await readBatchedNotice(tx, agentId, ['issue_assignment', 'issue_event']);
    const crew = await readBatchedNotice(tx, agentId, ['crew_report']);
    if (unnoticed.length === 0 && !issues?.fresh && !crew?.fresh) {
        return null;
    }
    const pending = noticeWindow(
        (await store.listQueuedItems(tx, agentId, 1000)).filter(listed),
        unnoticed
    );
    return {
        agentId,
        ...(crew ? { crewReports: crew.notice } : {}),
        inbox: await buildInboxItems(tx, pending),
        runId: input.runId,
        ...(issues ? { issueItems: issues.notice } : {}),
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

/**
 * Every queued item of one batched chatless kind (Issue items, crew reports), the ones no notice
 * has named first, so an ack can reach them.
 */
async function readBatchedNotice(
    tx: HausDatabase,
    agentId: string,
    sources: readonly string[]
): Promise<{ fresh: boolean; notice: AgentIssueWakeNotice } | null> {
    const rows = await tx
        .select({
            dedupeKey: agentInboxTable.dedupeKey,
            noticeRunId: agentInboxTable.noticeRunId,
        })
        .from(agentInboxTable)
        .where(and(store.queuedFor(agentId), inArray(agentInboxTable.source, [...sources])))
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

