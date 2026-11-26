import { randomBytes } from 'node:crypto';
import { GENERAL_TASK_KEY } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable, agentsTable, projectsTable } from '../src/postgres/schema.ts';
import {
    encodeTaskAssignment,
    taskAssignmentKey,
} from '../src/tasks/task-assignment-envelope.ts';
import { insertTaskKeyEntry } from '../src/tasks/task-key-ledger.ts';
import { randomShortId } from '../src/tasks/task-short-id.ts';
import { testAgentHome } from './agent-home.ts';
import { type Seed, seedAgent } from './agent-inbox-harness.ts';

export type TaskBoard = Awaited<ReturnType<typeof seedTaskBoard>>;

export async function seedTaskBoard(db: HausDatabase) {
    const seed = await seedAgent(db);
    const keyId = await insertTaskKeyEntry(db, { key: GENERAL_TASK_KEY, serverId: seed.serverId });
    await db
        .insert(projectsTable)
        .values({ chatId: seed.channelId, serverId: seed.serverId, taskKeyId: keyId });
    return { keyId, seed };
}

/**
 * Queues one `task_assignment` for the seeded Agent on a new Task, as the lane's
 * producer did before Tasks lost their assignee (ADR 0062): the lane stays until
 * `issue_assignment` replaces it. `assigner` defaults to the seeded person.
 */
export async function assignNewTask(
    db: HausDatabase,
    delivery: AgentDelivery,
    board: TaskBoard,
    title: string,
    assigner: { agentId: string } | null = null
) {
    const { seed } = board;
    const taskId = await insertTaskPlace(db, board, title);
    const [entry] = (await db.execute(sql`
        update task_keys set next_number = next_number + 1
        where server_id = ${seed.serverId} and id = ${board.keyId}
        returning key, next_number - 1 as number
    `)) as unknown as { key: string; number: number }[];
    const [handle] = assigner
        ? await db
              .select({ handle: agentsTable.handle })
              .from(agentsTable)
              .where(eq(agentsTable.id, assigner.agentId))
        : [{ handle: seed.humanHandle }];
    const dedupeKey = taskAssignmentKey(taskId, 1);
    await db.transaction(async (tx) => {
        await delivery.enqueue(tx, {
            agentId: seed.agentId,
            chatId: null,
            content: encodeTaskAssignment({
                assignedBy: handle?.handle ?? null,
                assignedByAgent: assigner !== null,
                id: dedupeKey,
                key: `${entry?.key}-${entry?.number}`,
                priority: 'high',
                taskId,
                title,
            }),
            dedupeKey,
            mentioned: true,
            serverId: seed.serverId,
            source: 'task_assignment',
        });
    });
    return {
        task: { id: taskId },
        wakes: [{ agentId: seed.agentId, serverId: seed.serverId }],
    };
}

export async function insertTaskPlace(
    db: HausDatabase,
    { seed }: TaskBoard,
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
        insert into chats (id, server_id, kind, parent_chat_id, parent_chat_kind)
        values (${chatId}, ${seed.serverId}, 'task', ${seed.channelId}, 'channel')
    `);
    await db.execute(sql`
        insert into tasks (id, server_id, short_id, title, chat_id, created_by_user_id,
            project_id, origin_chat_id, origin_message_id)
        values (${taskId}, ${seed.serverId}, ${randomShortId()}, ${title}, ${chatId},
            ${seed.userId}, ${seed.channelId}, ${seed.channelId}, ${messageId})
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
        homeProjectId: await testAgentHome(db, seed.serverId),
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
