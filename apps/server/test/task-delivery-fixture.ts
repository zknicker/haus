import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { insertGeneralBoard } from '../src/boards/board-create.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable, agentsTable } from '../src/postgres/schema.ts';
import { createTask } from '../src/tasks/task-create.ts';
import { type Seed, seedAgent } from './agent-inbox-harness.ts';

export type TaskBoard = Awaited<ReturnType<typeof seedTaskBoard>>;

/** One seeded Agent and human on a Server with its General board. */
export async function seedTaskBoard(db: HausDatabase) {
    const seed = await seedAgent(db);
    return { boardId: await insertGeneralBoard(db, seed.serverId), seed };
}

/** A new high-priority Task the human assigns to the seeded Agent. */
export function assignNewTask(
    db: HausDatabase,
    delivery: AgentDelivery,
    { boardId, seed }: TaskBoard,
    title: string
) {
    return createTask(db, { kind: 'user', userId: seed.userId }, delivery, {
        assignee: { agentId: seed.agentId, kind: 'agent' },
        boardId,
        priority: 'high',
        serverId: seed.serverId,
        title,
    });
}

/** A second Agent on the seeded Server. */
export async function addPeerAgent(db: HausDatabase, seed: Seed): Promise<string> {
    const peerId = createOpaqueId('agt');
    await db.insert(agentsTable).values({
        displayName: 'Peer',
        handle: `peer-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: peerId,
        serverId: seed.serverId,
    });
    return peerId;
}

/** The Agent's `task_assignment` inbox rows. */
export async function taskInboxRows(db: HausDatabase, seed: Seed) {
    return await db
        .select({
            dedupeKey: agentInboxTable.dedupeKey,
            mentioned: agentInboxTable.mentioned,
            state: agentInboxTable.state,
        })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, seed.agentId),
                eq(agentInboxTable.source, 'task_assignment')
            )
        );
}
