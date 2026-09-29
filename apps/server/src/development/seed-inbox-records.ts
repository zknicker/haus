import { and, eq, sql } from 'drizzle-orm';
import { followAgentThread } from '../agent-api/attention.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    chatsTable,
    cloudAgentRunsTable,
    cloudAgentWorkTable,
    messageTasksTable,
} from '../postgres/schema.ts';
import { ensureThreadRecord } from '../threads/ensure-thread.ts';
import { threadChatIdForAnchor } from '../threads/thread-id.ts';
import type { InboxSeedContext } from './seed-inbox-context.ts';
import { appendSeedMessages } from './seed-inbox-messages.ts';

const repository = 'zknicker/haus';

/**
 * Blippy's claim on a message nobody promoted, stamped tracked the way a run
 * that settled without finishing stamps it. Tier reads `tracked` from the
 * stamp and liveness reads false, which is exactly a stalled claim.
 */
export async function seedStalledClaim(
    tx: HausDatabase,
    context: InboxSeedContext,
    input: { anchorMessageId: string; claimedAt: Date; trackedAt: Date }
): Promise<void> {
    const [numbered] = await tx
        .update(chatsTable)
        .set({ lastTaskNumber: sql`${chatsTable.lastTaskNumber} + 1` })
        .where(and(eq(chatsTable.serverId, context.serverId), eq(chatsTable.id, context.allChatId)))
        .returning({ number: chatsTable.lastTaskNumber });
    if (!numbered) {
        throw new Error('The development Inbox seed found no #all Chat to number a task in.');
    }
    await tx.insert(messageTasksTable).values({
        assigneeAgentId: context.blippyId,
        chatId: context.allChatId,
        claimedAt: input.claimedAt,
        createdAt: input.claimedAt,
        createdByAgentId: context.blippyId,
        messageId: input.anchorMessageId,
        number: numbered.number,
        origin: 'claimed',
        serverId: context.serverId,
        status: 'in_progress',
        trackedAt: input.trackedAt,
        updatedAt: input.trackedAt,
    });
}

interface SeedCloudAgentWork {
    activityAt: Date;
    activitySummary: string;
    content: string;
    createdAt: Date;
    nonce: string;
    providerAgentId: string;
    providerRunId: string;
    rawStatus: string;
    runSummary: string;
    startedAt: Date;
    terminalAt: Date;
    title: string;
}

/**
 * The settled Cloud Agent work Blippy delegated from #product, with its branch
 * and pull request retained. It is written the way `createCloudAgentWork`
 * writes one — the Agent-authored Message carrying the `cloud-agent-work` body,
 * its child Thread, the work record, and its provider Run.
 */
export async function seedCloudAgentWork(
    tx: HausDatabase,
    context: InboxSeedContext,
    work: SeedCloudAgentWork
): Promise<void> {
    const messageId = createOpaqueId('msg');
    await appendSeedMessages(tx, {
        chatId: context.productChatId,
        messages: [
            {
                authorAgentId: context.blippyId,
                bodyKind: 'cloud-agent-work',
                content: work.content,
                createdAt: work.createdAt,
                id: messageId,
                nonce: work.nonce,
            },
        ],
        serverId: context.serverId,
    });
    await ensureThreadRecord(tx, {
        anchorMessageId: messageId,
        parentChatId: context.productChatId,
        serverId: context.serverId,
    });
    await followAgentThread(tx, {
        agentId: context.blippyId,
        serverId: context.serverId,
        threadChatId: threadChatIdForAnchor(messageId),
    });
    await insertCloudAgentWork(tx, context, work, messageId);
}

async function insertCloudAgentWork(
    tx: HausDatabase,
    context: InboxSeedContext,
    work: SeedCloudAgentWork,
    messageId: string
): Promise<void> {
    const workId = createOpaqueId('caw');
    await tx.insert(cloudAgentWorkTable).values({
        activityAt: work.activityAt,
        activitySummary: work.activitySummary,
        agentId: context.blippyId,
        chatId: context.productChatId,
        computerId: context.computerId,
        createdAt: work.createdAt,
        id: workId,
        messageId,
        provider: 'cursor',
        providerAgentId: work.providerAgentId,
        providerUrl: `https://cursor.com/agents/${work.providerAgentId}`,
        repository,
        serverId: context.serverId,
        startedAt: work.startedAt,
        startingRef: 'main',
        status: 'completed',
        terminalAt: work.terminalAt,
        title: work.title,
        updatedAt: work.terminalAt,
    });
    await tx.insert(cloudAgentRunsTable).values({
        branches: [
            {
                branch: 'cloud/sidebar-inbox-badge',
                pullRequestUrl: `https://github.com/${repository}/pull/482`,
                repository,
            },
        ],
        createdAt: work.createdAt,
        id: createOpaqueId('car'),
        observedAt: work.activityAt,
        providerRunId: work.providerRunId,
        rawStatus: work.rawStatus,
        serverId: context.serverId,
        startedAt: work.startedAt,
        status: 'completed',
        summary: work.runSummary,
        terminalAt: work.terminalAt,
        usage: { costUsd: 0.42, inputTokens: 184_000, outputTokens: 12_400 },
        workId,
    });
}
