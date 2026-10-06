import { randomBytes } from 'node:crypto';
import type { AgentActivityFrame, AgentCommand, AgentTurnSummary } from '@haus/api';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    chatsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';

export function activityFrame(
    seed: Pick<AgentActivityFrame, 'agentId'>,
    runId: string,
    producerSequence: number
): AgentActivityFrame {
    return {
        agentId: seed.agentId,
        category: 'using_tool',
        occurredAt: '2020-01-01T00:00:00.000Z',
        phase: 'started',
        producerSequence,
        runId,
        type: 'agent-activity',
    };
}

export function summary(
    seed: Pick<AgentActivityFrame, 'agentId'>,
    runId: string
): AgentTurnSummary {
    return {
        activity: { operations: [] },
        agentId: seed.agentId,
        endedAt: '2026-08-11T12:00:00.000Z',
        messageCount: 0,
        modelId: 'gpt-test',
        outputProduced: false,
        runId,
        runtimeId: 'codex',
        startedAt: '2026-08-11T11:59:00.000Z',
        status: 'completed',
        summary: 'done',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}

class FakeTransport implements DeliveryTransport {
    readonly online = new Set<string>();
    readonly sent: AgentCommand[] = [];

    isOnline(computerId: string) {
        return this.online.has(computerId);
    }

    send(computerId: string, frame: AgentCommand) {
        if (!this.online.has(computerId)) {
            return false;
        }
        this.sent.push(frame);
        return true;
    }
}

export interface Seed {
    agentId: string;
    chatId: string;
    computerId: string;
    serverId: string;
}

export async function seedActivity(db: HausDatabase): Promise<Seed> {
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const chatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await db.insert(serversTable).values({
        displayName: 'Activity',
        id: serverId,
        slug: `activity-${randomBytes(4).toString('hex')}`,
    });
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
        health: 'healthy',
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
    await db.insert(chatsTable).values({
        dmAgentId: agentId,
        dmMemberOneStint: 1,
        dmMemberOneUserId: userId,
        id: chatId,
        kind: 'dm',
        serverId,
    });
    return { agentId, chatId, computerId, serverId };
}

export async function startRun(db: HausDatabase, seed: Seed) {
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(db, transport);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'activity work',
        dedupeKey: createOpaqueId('msg'),
        serverId: seed.serverId,
    });
    const frame = transport.sent.find(
        (item): item is Extract<AgentCommand, { type: 'start' }> => item.type === 'start'
    );
    if (!frame) {
        throw new Error('The test run did not start.');
    }
    return { delivery, frame, transport };
}
