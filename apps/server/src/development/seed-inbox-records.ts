import { formatWorkerLink } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { recordWorkerLinks } from '../chats/worker-links.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    chatsTable,
    workerTurnsTable,
    workersTable,
    messageClaimsTable,
} from '../postgres/schema.ts';
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
        .set({ lastClaimNumber: sql`${chatsTable.lastClaimNumber} + 1` })
        .where(and(eq(chatsTable.serverId, context.serverId), eq(chatsTable.id, context.allChatId)))
        .returning({ number: chatsTable.lastClaimNumber });
    if (!numbered) {
        throw new Error('The development Inbox seed found no #all Chat to number a claim in.');
    }
    await tx.insert(messageClaimsTable).values({
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

interface SeedWorker {
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

export async function seedWorker(
    tx: HausDatabase,
    context: InboxSeedContext,
    work: SeedWorker
): Promise<void> {
    const messageId = createOpaqueId('msg');
    const workerId = createOpaqueId('caw');
    await appendSeedMessages(tx, {
        chatId: context.productChatId,
        messages: [
            {
                authorAgentId: context.blippyId,
                content: `${work.content}\n\n${formatWorkerLink(work.title, workerId)}`,
                createdAt: work.createdAt,
                id: messageId,
                nonce: work.nonce,
            },
        ],
        serverId: context.serverId,
    });
    await insertWorker(tx, context, work, { messageId, workerId });
    await recordWorkerLinks(tx, {
        chatId: context.productChatId,
        links: [{ ordinal: 0, workerId }],
        messageId,
        serverId: context.serverId,
    });
}

async function insertWorker(
    tx: HausDatabase,
    context: InboxSeedContext,
    work: SeedWorker,
    { messageId, workerId }: { messageId: string; workerId: string }
): Promise<void> {
    await tx.insert(workersTable).values({
        activityAt: work.activityAt,
        activitySummary: work.activitySummary,
        agentId: context.blippyId,
        carrierComputerId: context.computerId,
        closedAt: work.terminalAt,
        createdAt: work.createdAt,
        id: workerId,
        launchMessageId: messageId,
        originChatId: context.productChatId,
        place: 'cursor',
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
    await tx.insert(workerTurnsTable).values({
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
        workerId,
    });
}
