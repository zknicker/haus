import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { allocateEventCursor } from '../src/chats/allocate-event-cursor.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentChatReadsTable,
    agentsTable,
    agentThreadFollowsTable,
    channelAgentParticipantsTable,
    chatEventsTable,
    chatMessagesTable,
    chatsTable,
} from '../src/postgres/schema.ts';
import { FakeTransport, type Seed, seedAgent } from './agent-inbox-harness.ts';

/** A seeded Agent already joined to `#product`, as the inbox and read position see it. */
export async function seedReader(db: HausDatabase): Promise<Seed> {
    const seed = await seedAgent(db);
    await db.insert(channelAgentParticipantsTable).values({
        agentId: seed.agentId,
        chatId: seed.channelId,
        serverId: seed.serverId,
    });
    return seed;
}

/**
 * One durable message as a real send writes it: the next Chat sequence, the
 * `message.created` event, and — for a recipient — a queued inbox row.
 */
export async function postMessage(
    db: HausDatabase,
    seed: Seed,
    input: {
        agentId?: string;
        chatId: string;
        content?: string;
        mentioned?: boolean;
        recipient?: boolean;
    }
): Promise<{ id: string; sequence: number }> {
    const [chat] = await db
        .update(chatsTable)
        .set({
            lastActivityAt: sql`now()`,
            lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1`,
        })
        .where(and(eq(chatsTable.serverId, seed.serverId), eq(chatsTable.id, input.chatId)))
        .returning({ sequence: chatsTable.lastMessageSequence });
    if (!chat) {
        throw new Error('No such Chat.');
    }
    const id = createOpaqueId('msg');
    await db.insert(chatMessagesTable).values({
        authorAgentId: input.agentId ?? null,
        authorUserId: input.agentId ? null : seed.userId,
        chatId: input.chatId,
        content: input.content ?? 'hello',
        id,
        nonce: createOpaqueId('nonce'),
        replyRootMessageId: id,
        sequence: chat.sequence,
        serverId: seed.serverId,
    });
    await db.insert(chatEventsTable).values({
        chatId: input.chatId,
        cursor: await allocateEventCursor(db, seed.serverId),
        id: createOpaqueId('evt'),
        messageId: id,
        sequence: chat.sequence,
        serverId: seed.serverId,
        type: 'message.created',
    });
    if (input.recipient || input.mentioned) {
        await new AgentDelivery(db, new FakeTransport()).deliver({
            addressedReason: input.mentioned ? 'mention' : null,
            agentId: seed.agentId,
            chatId: input.chatId,
            content: input.content ?? 'hello',
            dedupeKey: id,
            mentioned: input.mentioned ?? false,
            sequence: chat.sequence,
            serverId: seed.serverId,
            source: 'human',
        });
    }
    return { id, sequence: chat.sequence };
}

/** A Thread on `anchorId` in `parentChatId`, optionally followed by the seeded Agent. */
export async function addThread(
    db: HausDatabase,
    seed: Seed,
    input: { anchorId: string; followed: boolean; parentChatId: string }
): Promise<string> {
    const threadId = createOpaqueId('cht');
    await db.insert(chatsTable).values({
        anchorMessageId: input.anchorId,
        id: threadId,
        kind: 'thread',
        parentChatId: input.parentChatId,
        parentChatKind: 'channel',
        serverId: seed.serverId,
    });
    if (input.followed) {
        await db.insert(agentThreadFollowsTable).values({
            agentId: seed.agentId,
            serverId: seed.serverId,
            threadChatId: threadId,
        });
    }
    return threadId;
}

/** A second Agent on the same Server, for messages the reader did not write. */
export async function addPeerAgent(db: HausDatabase, seed: Seed): Promise<string> {
    const id = createOpaqueId('agt');
    await db.insert(agentsTable).values({
        computerId: seed.computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Peer',
        handle: `peer-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id,
        serverId: seed.serverId,
    });
    return id;
}

export async function setReadPosition(
    db: HausDatabase,
    seed: Seed,
    chatId: string,
    sequence: number
) {
    await db
        .insert(agentChatReadsTable)
        .values({ agentId: seed.agentId, chatId, sequence, serverId: seed.serverId })
        .onConflictDoUpdate({
            set: { sequence },
            target: [
                agentChatReadsTable.serverId,
                agentChatReadsTable.agentId,
                agentChatReadsTable.chatId,
            ],
        });
}

export async function readPosition(db: HausDatabase, seed: Seed, chatId: string) {
    const [row] = await db
        .select({ sequence: agentChatReadsTable.sequence })
        .from(agentChatReadsTable)
        .where(
            and(
                eq(agentChatReadsTable.serverId, seed.serverId),
                eq(agentChatReadsTable.agentId, seed.agentId),
                eq(agentChatReadsTable.chatId, chatId)
            )
        );
    return row?.sequence ?? null;
}

export function readerRunner(seed: Seed, runId = 'run_reader'): ResolvedRunner {
    return {
        agentId: seed.agentId,
        capabilities: [],
        chatId: seed.channelId,
        computerId: seed.computerId,
        runId,
        runnerId: 'rnr_reader',
        serverId: seed.serverId,
    };
}
