import { createHash } from 'node:crypto';
import type { SQL } from 'bun';
import { and, eq, notExists } from 'drizzle-orm';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { chatsTable, projectsTable, taskKeysTable } from '../src/postgres/schema.ts';
import { allocateProjectKey, insertProjectKey } from '../src/projects/project-key.ts';

const homeChannelName = 'general';

export async function testAgentHome(db: HausDatabase, serverId: string) {
    const [general] = await db
        .select({ id: chatsTable.id, projectId: projectsTable.chatId })
        .from(chatsTable)
        .leftJoin(
            projectsTable,
            and(
                eq(projectsTable.serverId, chatsTable.serverId),
                eq(projectsTable.chatId, chatsTable.id)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.kind, 'channel'),
                eq(chatsTable.name, homeChannelName)
            )
        )
        .limit(1);
    if (general?.projectId) {
        return general.projectId;
    }
    const chatId = general?.id ?? createOpaqueId('cht');
    if (!general) {
        await db
            .insert(chatsTable)
            .values({ id: chatId, kind: 'channel', name: homeChannelName, serverId });
    }
    const taskKeyId = await freeGeneralKey(db, serverId);
    await db.insert(projectsTable).values({ chatId, serverId, taskKeyId });
    return chatId;
}

export async function testProject(db: HausDatabase, serverId: string, chatId: string) {
    const [project] = await db
        .select({ id: projectsTable.chatId })
        .from(projectsTable)
        .where(and(eq(projectsTable.serverId, serverId), eq(projectsTable.chatId, chatId)))
        .limit(1);
    if (!project) {
        const key = await allocateProjectKey(db, serverId, 'TEST');
        const taskKeyId = await insertProjectKey(db, { key, serverId });
        await db.insert(projectsTable).values({ chatId, serverId, taskKeyId });
    }
    return chatId;
}

export async function testSqlAgentHome(sql: SQL, serverId: string) {
    const [general] = (await sql`
        select projects.chat_id as id
        from projects
        join chats on chats.server_id = projects.server_id and chats.id = projects.chat_id
        where projects.server_id = ${serverId} and chats.name = ${homeChannelName}
    `) as { id: string }[];
    if (general) {
        return general.id;
    }
    const digest = createHash('sha256').update(serverId).digest('hex').slice(0, 16);
    const chatId = `cht_${digest}`;
    await sql`
        insert into task_keys (id, server_id, key) values (${`tky_${digest}`}, ${serverId}, 'GEN')
        on conflict do nothing
    `;
    await sql`
        insert into chats (id, server_id, kind, name)
        values (${chatId}, ${serverId}, 'channel', ${homeChannelName})
        on conflict do nothing
    `;
    await sql`
        insert into projects (chat_id, server_id, task_key_id)
        select ${chatId}, ${serverId}, id from task_keys where server_id = ${serverId} and key = 'GEN'
        on conflict do nothing
    `;
    return chatId;
}

async function freeGeneralKey(db: HausDatabase, serverId: string) {
    const [general] = await db
        .select({ id: taskKeysTable.id })
        .from(taskKeysTable)
        .where(
            and(
                eq(taskKeysTable.serverId, serverId),
                eq(taskKeysTable.key, 'GEN'),
                notExists(
                    db
                        .select({ id: projectsTable.chatId })
                        .from(projectsTable)
                        .where(eq(projectsTable.taskKeyId, taskKeysTable.id))
                )
            )
        )
        .limit(1);
    if (general) {
        return general.id;
    }
    const key = await allocateProjectKey(db, serverId, homeChannelName);
    return await insertProjectKey(db, { key, serverId });
}
