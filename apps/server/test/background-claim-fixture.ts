import { randomBytes } from 'node:crypto';
import type { AgentCommand, AgentTurnSummary } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentActivityTable,
    agentsTable,
    chatMessagesTable,
    chatsTable,
    computersTable,
    messageTasksTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { appendServerAgentActivity } from '../src/server-agents/agent-activity.ts';
import { findMessageTask } from '../src/tasks/task-shape.ts';
import { ensureThreadRecord } from '../src/threads/ensure-thread.ts';

/**
 * One Agent, one Computer, one Channel message that Agent claimed: the exact
 * row `haus task claim --message-id` leaves behind, with the delivery seams
 * the background-claim tests drive around it.
 */
export class FakeTransport implements DeliveryTransport {
    readonly online = new Set<string>();
    readonly sent: { computerId: string; frame: AgentCommand }[] = [];

    isOnline(computerId: string): boolean {
        return this.online.has(computerId);
    }

    send(computerId: string, frame: AgentCommand): boolean {
        if (!this.online.has(computerId)) {
            return false;
        }
        this.sent.push({ computerId, frame });
        return true;
    }

    startedRunId(): string {
        const start = this.sent.map((entry) => entry.frame).find((frame) => frame.type === 'start');
        return start?.type === 'start' ? start.runId : '';
    }
}

export interface BackgroundClaim {
    agentId: string;
    chatId: string;
    computerId: string;
    messageId: string;
    serverId: string;
    userId: string;
}

/** A Channel message an Agent claimed, exactly as claim-by-message-id leaves it. */
export async function seedBackgroundClaim(db: HausDatabase): Promise<BackgroundClaim> {
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const chatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Claims', id: serverId, slug: createOpaqueId('slug') });
    await db.insert(serverMembershipsTable).values({
        handle: `human-${randomBytes(4).toString('hex')}`,
        id: createOpaqueId('mem'),
        role: 'owner',
        serverId,
        userId,
    });
    await db.insert(computersTable).values({
        attachedByUserId: userId,
        credentialHash: randomBytes(32).toString('hex'),
        id: computerId,
        serverId,
    });
    await db.insert(agentsTable).values({
        computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Ada',
        handle: `ada-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: agentId,
        serverId,
    });
    await db.insert(chatsTable).values({ id: chatId, kind: 'channel', name: 'dispatch', serverId });
    const claim = { agentId, chatId, computerId, messageId: '', serverId, userId };
    const messageId = await sendHumanMessage(db, claim, 'Audit the delivery boundary');
    await db.insert(messageTasksTable).values({
        assigneeAgentId: agentId,
        chatId,
        claimedAt: new Date(),
        createdByAgentId: agentId,
        messageId,
        number: 1,
        origin: 'claimed',
        serverId,
        status: 'in_progress',
    });
    return { ...claim, messageId };
}

export async function sendHumanMessage(db: HausDatabase, claim: BackgroundClaim, content: string) {
    const id = createOpaqueId('msg');
    const [chat] = await db
        .update(chatsTable)
        .set({ lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1` })
        .where(and(eq(chatsTable.serverId, claim.serverId), eq(chatsTable.id, claim.chatId)))
        .returning({ sequence: chatsTable.lastMessageSequence });
    await db.insert(chatMessagesTable).values({
        authorUserId: claim.userId,
        chatId: claim.chatId,
        content,
        id,
        nonce: createOpaqueId('non'),
        sequence: chat.sequence,
        serverId: claim.serverId,
    });
    return id;
}

/**
 * The Agent's own top-level answer, stamped with the run that produced it.
 * `createdAt` pins the Server clock so ordering against the activity ledger is
 * decided by the test rather than by how fast Postgres ticks.
 */
export async function answerInChat(
    db: HausDatabase,
    claim: BackgroundClaim,
    runId: string,
    createdAt?: Date
) {
    const [chat] = await db
        .update(chatsTable)
        .set({ lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1` })
        .where(and(eq(chatsTable.serverId, claim.serverId), eq(chatsTable.id, claim.chatId)))
        .returning({ sequence: chatsTable.lastMessageSequence });
    await db.insert(chatMessagesTable).values({
        authorAgentId: claim.agentId,
        chatId: claim.chatId,
        content: 'Audited; the boundary holds.',
        id: createOpaqueId('msg'),
        nonce: createOpaqueId('non'),
        runId,
        sequence: chat.sequence,
        serverId: claim.serverId,
        sessionGeneration: 1,
        ...(createdAt ? { createdAt } : {}),
    });
}

/** Record one tool-shaped operation on the run's activity ledger. */
export async function recordRunOperation(
    db: HausDatabase,
    claim: BackgroundClaim,
    runId: string,
    recordedAt: Date
) {
    const activity = await appendServerAgentActivity(db, {
        agentId: claim.agentId,
        category: 'running_command',
        phase: 'completed',
        runId,
        serverId: claim.serverId,
    });
    if (!activity) {
        throw new Error('activity was not recorded for the run');
    }
    await db
        .update(agentActivityTable)
        .set({ recordedAt })
        .where(
            and(
                eq(agentActivityTable.serverId, claim.serverId),
                eq(agentActivityTable.id, activity.id)
            )
        );
}

/** A Thread reply on the claim's anchor, from whoever the caller names. */
export async function replyInThread(
    db: HausDatabase,
    claim: BackgroundClaim,
    author: { agentId: string } | { userId: string }
) {
    const thread = await ensureThreadRecord(db, {
        anchorMessageId: claim.messageId,
        parentChatId: claim.chatId,
        serverId: claim.serverId,
    });
    const [chat] = await db
        .update(chatsTable)
        .set({ lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1` })
        .where(and(eq(chatsTable.serverId, claim.serverId), eq(chatsTable.id, thread.id)))
        .returning({ sequence: chatsTable.lastMessageSequence });
    await db.insert(chatMessagesTable).values({
        ...('agentId' in author
            ? { authorAgentId: author.agentId, sessionGeneration: 1 }
            : { authorUserId: author.userId }),
        chatId: thread.id,
        content: 'One more thing.',
        id: createOpaqueId('msg'),
        nonce: createOpaqueId('non'),
        sequence: chat.sequence,
        serverId: claim.serverId,
    });
}

/** A second Agent in the same Channel: the bystander whose chatter must not count. */
export async function seedPeerAgent(db: HausDatabase, claim: BackgroundClaim) {
    const agentId = createOpaqueId('agt');
    await db.insert(agentsTable).values({
        computerId: claim.computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Tiny',
        handle: `tiny-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: agentId,
        serverId: claim.serverId,
    });
    return agentId;
}

export async function beginRun(db: HausDatabase, claim: BackgroundClaim) {
    const transport = new FakeTransport();
    transport.online.add(claim.computerId);
    const delivery = new AgentDelivery(db, transport);
    await delivery.deliver({
        agentId: claim.agentId,
        chatId: claim.chatId,
        content: 'Audit the delivery boundary',
        dedupeKey: claim.messageId,
        serverId: claim.serverId,
    });
    return { delivery, runId: transport.startedRunId(), transport };
}

export async function readTask(db: HausDatabase, claim: BackgroundClaim) {
    return await findMessageTask(db, claim.serverId, claim.messageId);
}

export function turnSummary(
    agentId: string,
    runId: string,
    status: 'completed' | 'failed' | 'interrupted' = 'completed'
): AgentTurnSummary {
    return {
        activity: { operations: [] },
        agentId,
        endedAt: new Date().toISOString(),
        messageCount: 1,
        modelId: 'gpt-test',
        outputProduced: true,
        runId,
        runtimeId: 'fake',
        startedAt: new Date().toISOString(),
        status,
        summary: 'ok',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
