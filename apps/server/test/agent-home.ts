import type { SQL } from 'bun';
import { and, eq, notExists } from 'drizzle-orm';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { chatsTable, projectsTable, taskKeysTable } from '../src/postgres/schema.ts';
import { allocateProjectKey, insertProjectKey } from '../src/projects/project-key.ts';

export async function testAgentHome(db: HausDatabase, serverId: string) {
    const [haus] = await db
        .select({ id: chatsTable.id, projectId: projectsTable.chatId })
        .from(chatsTable)
        .leftJoin(
            projectsTable,
            and(
                eq(projectsTable.serverId, chatsTable.serverId),
                eq(projectsTable.chatId, chatsTable.id)
            )
        )
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.isAll, true)))
        .limit(1);
    if (haus?.projectId) {
        return haus.projectId;
    }
    const chatId = haus?.id ?? createOpaqueId('cht');
    if (!haus) {
        await db
            .insert(chatsTable)
            .values({ id: chatId, isAll: true, kind: 'channel', name: 'haus', serverId });
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
    const key = await allocateProjectKey(db, serverId, 'haus');
    return await insertProjectKey(db, { key, serverId });
}

export async function testSqlAgentHome(sql: SQL, serverId: string) {
    const [haus] = (await sql`
        select id from chats where server_id = ${serverId} and is_all
    `) as { id: string }[];
    if (haus) {
        return haus.id;
    }
    const chatId = createOpaqueId('cht');
    const taskKeyId = createOpaqueId('tky');
    await sql`insert into task_keys (id, server_id, key) values (${taskKeyId}, ${serverId}, 'HAUS')`;
    await sql`
        insert into chats (id, server_id, kind, name, is_all)
        values (${chatId}, ${serverId}, 'channel', 'haus', true)
    `;
    await sql`
        insert into projects (chat_id, server_id, task_key_id)
        values (${chatId}, ${serverId}, ${taskKeyId})
    `;
    return chatId;
}
