import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import type { HausClient } from './haus-client.ts';
import type { HausServerHarness } from './haus-server-harness.ts';

export interface TestTask {
    chatId: string;
    id: string;
    key: string;
    originMessageId: string;
}

type Sql = HausServerHarness['sql'];

export async function startTestTask(
    harness: Pick<HausServerHarness, 'sql'>,
    owner: HausClient,
    input: {
        channelId: string;
        key?: string;
        originMessageId?: string;
        serverId: string;
        title: string;
    }
): Promise<TestTask> {
    const originMessageId =
        input.originMessageId ??
        (
            await owner.trpc.chat.send.mutate({
                chatId: input.channelId,
                content: `Origin for ${input.title}`,
                nonce: `origin-${createOpaqueId('n')}`,
                serverId: input.serverId,
            })
        ).message.id;
    const project = await taskProject(harness.sql, input.serverId, input.channelId);
    const [entry] = (await harness.sql`
        update task_keys set next_number = next_number + 1
        where server_id = ${input.serverId} and key = ${input.key ?? project.key}
        returning id, key, next_number - 1 as number
    `) as { id: string; key: string; number: number }[];
    const [creator] = (await harness.sql`
        select user_id from server_memberships
        where server_id = ${input.serverId} and role = 'owner' and revoked_at is null
        order by created_at limit 1
    `) as { user_id: string }[];
    if (!(entry && creator)) {
        throw new Error(`Server ${input.serverId} has no such Task key, or no Owner.`);
    }
    const chatId = createOpaqueId('cht');
    const taskId = createOpaqueId('tsk');
    await harness.sql`
        insert into chats (id, server_id, kind, parent_chat_id, parent_chat_kind)
        values (${chatId}, ${input.serverId}, 'task', ${project.id}, 'channel')
    `;
    await harness.sql`
        insert into tasks (id, server_id, key_id, number, title, chat_id, created_by_user_id,
            project_id, origin_chat_id, origin_message_id)
        values (${taskId}, ${input.serverId}, ${entry.id}, ${entry.number}, ${input.title},
            ${chatId}, ${creator.user_id}, ${project.id}, ${input.channelId}, ${originMessageId})
    `;
    return { chatId, id: taskId, key: `${entry.key}-${entry.number}`, originMessageId };
}

async function taskProject(sql: Sql, serverId: string, channelId: string) {
    const [own] = await projectRows(sql, serverId, channelId);
    if (own) {
        return own;
    }
    const [general] = (await sql`
        select projects.chat_id as id, task_keys.key
        from projects
        join chats on chats.server_id = projects.server_id and chats.id = projects.chat_id
        join task_keys on task_keys.id = projects.task_key_id
        where projects.server_id = ${serverId} and chats.name = 'general'
    `) as { id: string; key: string }[];
    if (general) {
        return general;
    }
    const chatId = createOpaqueId('cht');
    const keyId = createOpaqueId('tky');
    await sql`insert into task_keys (id, server_id, key) values (${keyId}, ${serverId}, 'GEN')`;
    await sql`
        insert into chats (id, server_id, kind, name)
        values (${chatId}, ${serverId}, 'channel', 'general')
    `;
    await sql`
        insert into channel_participants (server_id, chat_id, user_id)
        select server_id, ${chatId}, user_id from channel_participants
        where server_id = ${serverId} and chat_id = ${channelId}
    `;
    await sql`
        insert into projects (chat_id, server_id, task_key_id)
        values (${chatId}, ${serverId}, ${keyId})
    `;
    return { id: chatId, key: 'GEN' };
}

async function projectRows(sql: Sql, serverId: string, chatId: string) {
    return (await sql`
        select projects.chat_id as id, task_keys.key
        from projects join task_keys on task_keys.id = projects.task_key_id
        where projects.server_id = ${serverId} and projects.chat_id = ${chatId}
    `) as { id: string; key: string }[];
}
