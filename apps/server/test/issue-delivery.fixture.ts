import { randomBytes } from 'node:crypto';
import { GENERAL_TASK_KEY, type IssueActor, type IssuePriority } from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createIssue } from '../src/issues/issue-create.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable, agentsTable, projectsTable } from '../src/postgres/schema.ts';
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

export async function assignNewIssue(
    db: HausDatabase,
    { seed }: TaskBoard,
    title: string,
    options: { actor?: IssueActor; priority?: IssuePriority } = {}
) {
    return await createIssue(db, options.actor ?? { kind: 'user', userId: seed.userId }, {
        assignee: { agentId: seed.agentId, kind: 'captain' },
        priority: options.priority ?? 'high',
        projectId: seed.channelId,
        serverId: seed.serverId,
        title,
    });
}

export async function insertTaskPlace(
    db: HausDatabase,
    { seed }: TaskBoard,
    title: string,
    startedBy: { agentId: string } | null = null
) {
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
            created_by_agent_id, project_id, origin_chat_id, origin_message_id)
        values (${taskId}, ${seed.serverId}, ${randomShortId()}, ${title}, ${chatId},
            ${startedBy ? null : seed.userId}, ${startedBy?.agentId ?? null},
            ${seed.channelId}, ${seed.channelId}, ${messageId})
    `);
    return taskId;
}

export async function addPeerAgent(db: HausDatabase, seed: Seed) {
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

export async function issueInboxRows(db: HausDatabase, agentId: string) {
    return await db
        .select({
            content: agentInboxTable.content,
            dedupeKey: agentInboxTable.dedupeKey,
            mentioned: agentInboxTable.mentioned,
            source: agentInboxTable.source,
            state: agentInboxTable.state,
        })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, agentId),
                inArray(agentInboxTable.source, ['issue_assignment', 'issue_event'])
            )
        )
        .orderBy(agentInboxTable.createdAt, agentInboxTable.id);
}
