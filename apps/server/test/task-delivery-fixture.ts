import { randomBytes } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable, agentsTable } from '../src/postgres/schema.ts';
import { assignTask } from '../src/tasks/task-assign.ts';
import { insertGeneralTaskKey } from '../src/tasks/task-key-ledger.ts';
import { type Seed, seedAgent } from './agent-inbox-harness.ts';

export type TaskBoard = Awaited<ReturnType<typeof seedTaskBoard>>;

export async function seedTaskBoard(db: HausDatabase) {
    const seed = await seedAgent(db);
    return { keyId: await insertGeneralTaskKey(db, seed.serverId), seed };
}

export async function assignNewTask(
    db: HausDatabase,
    delivery: AgentDelivery,
    board: TaskBoard,
    title: string
) {
    const { seed } = board;
    const taskId = await insertTaskPlace(db, board, title);
    return await assignTask(db, { kind: 'user', userId: seed.userId }, delivery, {
        assignee: { agentId: seed.agentId, kind: 'agent' },
        expectedVersion: 1,
        serverId: seed.serverId,
        taskId,
    });
}

export async function insertTaskPlace(
    db: HausDatabase,
    { keyId, seed }: TaskBoard,
    title: string
): Promise<string> {
    const messageId = createOpaqueId('msg');
    const chatId = createOpaqueId('cht');
    const taskId = createOpaqueId('tsk');
    await db.execute(sql`
        with channel as (
            update chats set last_message_sequence = last_message_sequence + 1
            where server_id = ${seed.serverId} and id = ${seed.channelId}
            returning last_message_sequence
        )
        insert into chat_messages (id, server_id, chat_id, author_user_id, content, nonce, sequence)
        select ${messageId}, ${seed.serverId}, ${seed.channelId}, ${seed.userId},
            ${`Origin for ${title}`}, ${messageId}, channel.last_message_sequence
        from channel
    `);
    await db.execute(sql`
        insert into chats (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id)
        values (${chatId}, ${seed.serverId}, 'task', ${seed.channelId}, 'channel', ${messageId})
    `);
    await db.execute(sql`
        with entry as (
            update task_keys set next_number = next_number + 1
            where server_id = ${seed.serverId} and id = ${keyId}
            returning next_number - 1 as number
        )
        insert into tasks (id, server_id, key_id, number, title, priority, chat_id, created_by_user_id)
        select ${taskId}, ${seed.serverId}, ${keyId}, entry.number, ${title}, 'high', ${chatId},
            ${seed.userId}
        from entry
    `);
    return taskId;
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
