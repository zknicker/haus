import type { AgentDreamFollowUp, AgentDreamFollowUpRequester } from '@haus/api';
import { and, asc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentDreamSummariesTable,
    agentsTable,
    chatMessagesTable,
    remindersTable,
    serverMembershipsTable,
    usersTable,
} from '../postgres/schema.ts';

/** Most follow-ups one page of dreams reads; a run schedules a handful. */
const followUpScanLimit = 500;
const followUpsPerDream = 20;

interface DreamWindow {
    finishedAt: Date;
    runId: string;
    startedAt: Date;
}

export interface DreamEnrichment {
    followUps: AgentDreamFollowUp[];
    summary: string | null;
}

/**
 * What each dream's Agent wrote about the run (`haus heartbeat learned`) and the
 * reminders it created between the run's start and finish. Two bounded reads per page.
 */
export async function readDreamEnrichments(
    db: HausDatabase,
    input: { agentId: string; dreams: readonly DreamWindow[]; serverId: string }
): Promise<Map<string, DreamEnrichment>> {
    const enrichments = new Map<string, DreamEnrichment>(
        input.dreams.map((dream) => [dream.runId, { followUps: [], summary: null }])
    );
    if (input.dreams.length === 0) {
        return enrichments;
    }
    const summaries = await db
        .select({
            runId: agentDreamSummariesTable.runId,
            summary: agentDreamSummariesTable.summary,
        })
        .from(agentDreamSummariesTable)
        .where(
            and(
                eq(agentDreamSummariesTable.serverId, input.serverId),
                eq(agentDreamSummariesTable.agentId, input.agentId),
                inArray(
                    agentDreamSummariesTable.runId,
                    input.dreams.map((dream) => dream.runId)
                )
            )
        );
    for (const row of summaries) {
        const entry = enrichments.get(row.runId);
        if (entry) {
            entry.summary = row.summary;
        }
    }

    const earliest = Math.min(...input.dreams.map((dream) => dream.startedAt.getTime()));
    const latest = Math.max(...input.dreams.map((dream) => dream.finishedAt.getTime()));
    const reminders = await db
        .select({
            anchorChatId: remindersTable.anchorChatId,
            anchorMessageId: remindersTable.anchorMessageId,
            createdAt: remindersTable.createdAt,
            fireAt: remindersTable.fireAt,
            id: remindersTable.id,
            title: remindersTable.title,
        })
        .from(remindersTable)
        .where(
            and(
                eq(remindersTable.serverId, input.serverId),
                eq(remindersTable.ownerAgentId, input.agentId),
                ne(remindersTable.status, 'canceled'),
                gte(remindersTable.createdAt, new Date(earliest)),
                lte(remindersTable.createdAt, new Date(latest))
            )
        )
        .orderBy(asc(remindersTable.createdAt), asc(remindersTable.id))
        .limit(followUpScanLimit);
    const requesters = await readRequesters(
        db,
        input.serverId,
        reminders.map((reminder) => reminder.anchorMessageId)
    );
    for (const reminder of reminders) {
        for (const dream of input.dreams) {
            const entry = enrichments.get(dream.runId);
            if (
                entry &&
                entry.followUps.length < followUpsPerDream &&
                reminder.createdAt >= dream.startedAt &&
                reminder.createdAt <= dream.finishedAt
            ) {
                entry.followUps.push({
                    anchorChatId: reminder.anchorChatId,
                    fireAt: reminder.fireAt.toISOString(),
                    reminderId: reminder.id,
                    requester: requesters.get(reminder.anchorMessageId) ?? null,
                    title: reminder.title,
                });
            }
        }
    }
    return enrichments;
}

/** The author of each anchor message, in one read: who the follow-up is for. */
async function readRequesters(
    db: HausDatabase,
    serverId: string,
    messageIds: readonly string[]
): Promise<Map<string, AgentDreamFollowUpRequester>> {
    const requesters = new Map<string, AgentDreamFollowUpRequester>();
    if (messageIds.length === 0) {
        return requesters;
    }
    const rows = await db
        .select({
            agentHandle: agentsTable.handle,
            agentName: agentsTable.displayName,
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserId: chatMessagesTable.authorUserId,
            humanHandle: serverMembershipsTable.handle,
            humanName: usersTable.displayName,
            messageId: chatMessagesTable.id,
        })
        .from(chatMessagesTable)
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, chatMessagesTable.serverId),
                eq(agentsTable.id, chatMessagesTable.authorAgentId)
            )
        )
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, chatMessagesTable.serverId),
                eq(serverMembershipsTable.userId, chatMessagesTable.authorUserId)
            )
        )
        .leftJoin(usersTable, eq(usersTable.id, chatMessagesTable.authorUserId))
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                inArray(chatMessagesTable.id, [...new Set(messageIds)])
            )
        );
    for (const row of rows) {
        if (row.authorAgentId && row.agentName) {
            requesters.set(row.messageId, {
                displayName: row.agentName,
                handle: row.agentHandle,
                kind: 'agent',
            });
        } else if (row.authorUserId && (row.humanName || row.humanHandle)) {
            requesters.set(row.messageId, {
                displayName: row.humanName ?? row.humanHandle ?? '',
                handle: row.humanHandle,
                kind: 'human',
            });
        }
    }
    return requesters;
}
