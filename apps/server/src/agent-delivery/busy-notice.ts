import {
    type AgentCommand,
    type AgentIssueWakeNotice,
    batchedChatlessInboxSources,
    type WorkerReportsNotice,
    workerReportsPerRun,
} from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, tasksTable } from '../postgres/schema.ts';
import { readTasks } from '../tasks/task-read.ts';
import { chatIdsOf, maxDrainRows, noticeWindow } from './drain-selection.ts';
import { buildInboxItems } from './inbox-items.ts';
import { isNoticelessInboxSource } from './inbox-lanes.ts';
import * as store from './store.ts';
import { readUnreadElsewhere } from './unread-elsewhere.ts';

/**
 * The content-free notice for a busy Agent, when the active run has work it has
 * not been told about: the window of Chat rows, plus a count of queued Issue
 * items and of one Task's queued Worker reports. Neither has its bodies
 * in a notice; they wait for the Agent's next turn (specs/inbox.md).
 */
export async function planBusyNotice(
    tx: HausDatabase,
    input: { agentId: string; runId: string; serverId: string }
): Promise<AgentCommand | null> {
    const { agentId, serverId } = input;
    const listed = (row: store.InboxItemRow) =>
        !isNoticelessInboxSource(row.source) && row.source !== 'worker_report';
    const unnoticed = (await store.listUnnoticedQueuedItems(tx, agentId, maxDrainRows)).filter(
        listed
    );
    const issues = await readIssueItemsNotice(tx, agentId);
    const reports = await readWorkerReportsNotice(tx, { agentId, serverId });
    if (unnoticed.length === 0 && !issues?.fresh && !reports?.fresh) {
        return null;
    }
    const pending = noticeWindow(
        (await store.listQueuedItems(tx, agentId, 1000)).filter(listed),
        unnoticed
    );
    return {
        agentId,
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
        ...(reports ? { workerReports: reports.notice } : {}),
    };
}

/** Every queued Issue item, the ones no notice has named first, so an ack can reach them. */
async function readIssueItemsNotice(
    tx: HausDatabase,
    agentId: string
): Promise<{ fresh: boolean; notice: AgentIssueWakeNotice } | null> {
    const rows = await tx
        .select({
            dedupeKey: agentInboxTable.dedupeKey,
            noticeRunId: agentInboxTable.noticeRunId,
        })
        .from(agentInboxTable)
        .where(
            and(
                store.queuedFor(agentId),
                inArray(agentInboxTable.source, [...batchedChatlessInboxSources])
            )
        )
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

/** The queued reports of the Task whose oldest report no notice has named yet. */
async function readWorkerReportsNotice(
    tx: HausDatabase,
    input: { agentId: string; serverId: string }
): Promise<{ fresh: boolean; notice: WorkerReportsNotice } | null> {
    const rows = await tx
        .select({
            chatId: agentInboxTable.chatId,
            dedupeKey: agentInboxTable.dedupeKey,
            noticeRunId: agentInboxTable.noticeRunId,
        })
        .from(agentInboxTable)
        .where(and(store.queuedFor(input.agentId), eq(agentInboxTable.source, 'worker_report')))
        .orderBy(...store.inboxOrder());
    const chatId = (rows.find((row) => row.noticeRunId === null) ?? rows[0])?.chatId;
    if (!chatId) {
        return null;
    }
    const [task] = await readTasks(tx, {
        serverId: input.serverId,
        where: eq(tasksTable.chatId, chatId),
    });
    if (!task) {
        return null;
    }
    const ofTask = rows.filter((row) => row.chatId === chatId);
    const fresh = ofTask.filter((row) => row.noticeRunId === null);
    const named = [...fresh, ...ofTask.filter((row) => row.noticeRunId !== null)];
    return {
        fresh: fresh.length > 0,
        notice: {
            ids: named.slice(0, workerReportsPerRun).map((row) => row.dedupeKey),
            taskShortId: task.shortId,
            total: ofTask.length,
        },
    };
}
