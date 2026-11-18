import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import type { HausClient } from './haus-client.ts';
import type { HausServerHarness } from './haus-server-harness.ts';

export interface TestTask {
    chatId: string;
    id: string;
    key: string;
    originMessageId: string;
}

/**
 * A todo Task with its own `task` Chat under a Channel Message (ADR 0052),
 * numbered by a key-ledger entry and created by the Server's Owner, written
 * directly: only Agents start Tasks through the product, and these tests are
 * about what a person sees of one. No followers are seeded.
 */
export async function startTestTask(
    harness: Pick<HausServerHarness, 'sql'>,
    owner: HausClient,
    input: {
        channelId: string;
        /** The key-ledger entry's key; the General one by default. */
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
    const [entry] = (await harness.sql`
        update task_keys set next_number = next_number + 1
        where server_id = ${input.serverId} and key = ${input.key ?? 'GEN'}
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
        insert into chats (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id)
        values (${chatId}, ${input.serverId}, 'task', ${input.channelId}, 'channel', ${originMessageId})
    `;
    await harness.sql`
        insert into tasks (id, server_id, key_id, number, title, chat_id, created_by_user_id)
        values (${taskId}, ${input.serverId}, ${entry.id}, ${entry.number}, ${input.title},
            ${chatId}, ${creator.user_id})
    `;
    return { chatId, id: taskId, key: `${entry.key}-${entry.number}`, originMessageId };
}
