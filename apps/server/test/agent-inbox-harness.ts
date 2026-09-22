import { randomBytes } from 'node:crypto';
import type { AgentCommand } from '@haus/api';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    chatMessagesTable,
    chatsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';

export class FakeTransport implements DeliveryTransport {
    readonly online = new Set<string>();
    readonly sent: AgentCommand[] = [];

    isOnline(computerId: string): boolean {
        return this.online.has(computerId);
    }

    send(computerId: string, frame: AgentCommand): boolean {
        if (!this.online.has(computerId)) {
            return false;
        }
        this.sent.push(frame);
        return true;
    }

    framesOfType<T extends AgentCommand['type']>(type: T) {
        return this.sent.filter(
            (frame): frame is Extract<AgentCommand, { type: T }> => frame.type === type
        );
    }
}

export interface Seed {
    agentId: string;
    channelId: string;
    computerId: string;
    dmChatId: string;
    humanHandle: string;
    serverId: string;
    userId: string;
}

export async function seedAgent(db: HausDatabase): Promise<Seed> {
    const seed: Seed = {
        agentId: createOpaqueId('agt'),
        channelId: createOpaqueId('cht'),
        computerId: createOpaqueId('cmp'),
        dmChatId: createOpaqueId('cht'),
        humanHandle: `human-${randomBytes(4).toString('hex')}`,
        serverId: createOpaqueId('srv'),
        userId: createOpaqueId('usr'),
    };
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: seed.userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Parity', id: seed.serverId, slug: createOpaqueId('slug') });
    await db.insert(serverMembershipsTable).values({
        handle: seed.humanHandle,
        id: createOpaqueId('mem'),
        role: 'owner',
        serverId: seed.serverId,
        userId: seed.userId,
    });
    await db.insert(computersTable).values({
        attachedByUserId: seed.userId,
        credentialHash: randomBytes(32).toString('hex'),
        id: seed.computerId,
        serverId: seed.serverId,
    });
    await db.insert(agentsTable).values({
        computerId: seed.computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Ada',
        handle: `ada-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: seed.agentId,
        serverId: seed.serverId,
    });
    await db.insert(chatsTable).values({
        dmAgentId: seed.agentId,
        dmMemberOneStint: 1,
        dmMemberOneUserId: seed.userId,
        id: seed.dmChatId,
        kind: 'dm',
        serverId: seed.serverId,
    });
    await db.insert(chatsTable).values({
        id: seed.channelId,
        kind: 'channel',
        name: 'product',
        serverId: seed.serverId,
    });
    return seed;
}

export async function addChannel(db: HausDatabase, seed: Seed, name: string): Promise<string> {
    const chatId = createOpaqueId('cht');
    await db
        .insert(chatsTable)
        .values({ id: chatId, kind: 'channel', name, serverId: seed.serverId });
    return chatId;
}

let messageSequence = 0;

/** One durable human message plus its inbox row, as delivery planning writes them. */
export async function deliverHuman(
    db: HausDatabase,
    delivery: AgentDelivery,
    seed: Seed,
    input: { addressedReason?: 'dm' | 'mention' | 'routing'; chatId: string; content?: string }
): Promise<string> {
    const messageId = createOpaqueId('msg');
    messageSequence += 1;
    await db.insert(chatMessagesTable).values({
        authorUserId: seed.userId,
        chatId: input.chatId,
        content: input.content ?? 'hello',
        id: messageId,
        nonce: createOpaqueId('nonce'),
        sequence: messageSequence,
        serverId: seed.serverId,
    });
    await delivery.deliver({
        addressedReason: input.addressedReason ?? null,
        agentId: seed.agentId,
        chatId: input.chatId,
        content: input.content ?? 'hello',
        dedupeKey: messageId,
        sequence: messageSequence,
        serverId: seed.serverId,
        source: 'human',
    });
    return messageId;
}

/**
 * A Computer that is attached only once the queue is loaded. Every enqueue
 * while it is offline plans nothing, so one wake sees the whole pending set
 * instead of racing a run per message.
 */
export function offlineDelivery(db: HausDatabase, seed: Seed) {
    const transport = new FakeTransport();
    const delivery = new AgentDelivery(db, transport);
    const wake = async () => {
        transport.online.add(seed.computerId);
        await delivery.dispatchAgent(seed.agentId, seed.serverId);
        return transport.framesOfType('start').at(-1);
    };
    return { delivery, transport, wake };
}
