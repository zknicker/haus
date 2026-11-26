import { afterAll, beforeAll, expect, test } from 'bun:test';
import { testSqlAgentHome } from './agent-home.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { createTestProject } from './project.fixture.ts';
import { startTestTask } from './task-place-fixture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
const agentId = 'agt_delete_dependents';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('delete-dependents'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Delete Dependents',
        slug: 'delete-dependents',
    });
    serverId = server.id;
    await harness.sql`INSERT INTO agents (id, server_id, handle, display_name, home_timezone, home_project_id)
        VALUES (${agentId}, ${serverId}, 'dependents-agent', 'Dependents Agent', 'UTC', ${await testSqlAgentHome(harness.sql, serverId)})`;
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

test('deletes Triggers anchored in the channel aggregate with the channel', async () => {
    const channel = await createTestProject(owner, {
        agentIds: [],
        name: 'automations',
        serverId,
    });
    await insertTrigger('trg_dependents_armed', channel.id, null);
    await insertTrigger('trg_dependents_tombstone', channel.id, new Date());
    await harness.sql`INSERT INTO trigger_fires
        (id, server_id, trigger_id, payload, payload_bytes, received_at)
        VALUES ('trf_dependents', ${serverId}, 'trg_dependents_armed', '', 0, now())`;

    await expect(
        owner.trpc.chat.deleteChannel.mutate({
            chatId: channel.id,
            confirmation: 'automations',
            serverId,
        })
    ).resolves.toEqual({ chatId: channel.id, serverId });

    const remaining = (await harness.sql`
        select
            (select count(*)::int from chats where id = ${channel.id}) as chats,
            (select count(*)::int from triggers where anchor_chat_id = ${channel.id}) as triggers,
            (select count(*)::int from trigger_fires where id = 'trf_dependents') as fires
    `) as Array<{ chats: number; fires: number; triggers: number }>;
    expect(remaining).toEqual([{ chats: 0, fires: 0, triggers: 0 }]);
});

test('archiving then deleting a Project deletes its Tasks and their Chats; cloud work stays', async () => {
    const channel = await createTestProject(owner, {
        agentIds: [],
        name: 'tasks-go',
        serverId,
    });
    const open = await startTestTask(harness, owner, {
        channelId: channel.id,
        serverId,
        title: 'Open when the Channel goes',
    });
    const done = await startTestTask(harness, owner, {
        channelId: channel.id,
        serverId,
        title: 'Done before the Channel goes',
    });
    const progress = await owner.trpc.chat.send.mutate({
        chatId: open.chatId,
        content: 'Progress inside the Task',
        nonce: 'tasks-go-progress',
        serverId,
    });
    expect(
        await harness.sql`
            select count(*)::int as count from task_follows where task_chat_id = ${open.chatId}
        `
    ).toEqual([{ count: 1 }]);
    await harness.sql`
        insert into agent_task_follows (server_id, agent_id, task_chat_id, task_chat_kind)
        values (${serverId}, ${agentId}, ${open.chatId}, 'task')
    `;
    await harness.sql`INSERT INTO reminders
        (id, server_id, owner_agent_id, anchor_chat_id, anchor_message_id, title,
         fire_at, timezone, status, created_at, updated_at)
        VALUES ('rem_tasks_go', ${serverId}, ${agentId}, ${open.chatId}, ${progress.message.id},
            'Check the Task', now() + interval '1 hour', 'UTC', 'scheduled', now(), now())`;
    await harness.sql`
        insert into workers
            (id, server_id, agent_id, origin_chat_id, carrier_computer_id, launch_message_id, place,
             repository, title, task_id, status, terminal_at)
        values ('caw_tasksgo000000001', ${serverId}, ${agentId}, ${open.chatId}, 'cmp_tasks_go',
            ${progress.message.id}, 'cursor', 'acme/api', 'Task work', ${open.id}, 'completed', now())
    `;
    await harness.sql`
        insert into task_pull_requests (server_id, task_id, repository, number)
        values (${serverId}, ${open.id}, 'acme/api', 7)
    `;
    await owner.trpc.task.archive.mutate({
        expectedVersion: (await owner.trpc.task.get.query({ serverId, taskId: done.id })).version,
        serverId,
        taskId: done.id,
    });

    await owner.trpc.chat.archiveChannel.mutate({ chatId: channel.id, serverId });
    await expect(
        owner.trpc.chat.deleteChannel.mutate({
            chatId: channel.id,
            confirmation: 'tasks-go',
            serverId,
        })
    ).resolves.toEqual({ chatId: channel.id, serverId });

    expect(
        await harness.sql`
            select count(*)::int as count from chats
            where id in (${channel.id}, ${open.chatId}, ${done.chatId})
        `
    ).toEqual([{ count: 0 }]);
    expect(
        await harness.sql`select count(*)::int as count from tasks where id in (${open.id}, ${done.id})`
    ).toEqual([{ count: 0 }]);
    await expect(owner.trpc.task.get.query({ serverId, taskId: open.id })).rejects.toThrow(
        'No task exists with that id on this Server.'
    );
    expect(
        await harness.sql`
            select
                (select count(*)::int from chat_messages where chat_id = ${open.chatId}) as messages,
                (select count(*)::int from task_follows where task_chat_id = ${open.chatId}) as follows,
                (select count(*)::int from agent_task_follows where task_chat_id = ${open.chatId})
                    as agent_follows,
                (select count(*)::int from reminders where id = 'rem_tasks_go') as reminders,
                (select count(*)::int from workers
                    where id = 'caw_tasksgo000000001' and task_id is null and closed_at is not null) as work,
                (select count(*)::int from task_pull_requests where task_id = ${open.id}) as pulls
        `
    ).toEqual([{ agent_follows: 0, follows: 0, messages: 0, pulls: 0, reminders: 0, work: 1 }]);
});

test('purging a Project deletes a reminder anchored there from a Task in another Project', async () => {
    const origin = await createTestProject(owner, {
        agentIds: [],
        name: 'origin-goes',
        serverId,
    });
    const home = await createTestProject(owner, {
        agentIds: [agentId],
        name: 'task-stays',
        serverId,
    });
    const request = await owner.trpc.chat.send.mutate({
        chatId: origin.id,
        content: 'Please chase the vendor',
        nonce: 'origin-goes-request',
        serverId,
    });
    const task = await startTestTask(harness, owner, {
        channelId: home.id,
        serverId,
        title: 'Chase the vendor',
    });
    await harness.sql`INSERT INTO reminders
        (id, server_id, owner_agent_id, anchor_chat_id, anchor_message_id, title,
         fire_at, timezone, status, created_at, updated_at)
        VALUES ('rem_origin_goes', ${serverId}, ${agentId}, ${task.chatId}, ${request.message.id},
            'Chase again', now() + interval '1 hour', 'UTC', 'scheduled', now(), now())`;

    await expect(
        owner.trpc.chat.deleteChannel.mutate({
            chatId: origin.id,
            confirmation: 'origin-goes',
            serverId,
        })
    ).resolves.toEqual({ chatId: origin.id, serverId });

    expect(
        await harness.sql`
            select
                (select count(*)::int from chats where id = ${origin.id}) as origin,
                (select count(*)::int from chats where id = ${task.chatId}) as task,
                (select count(*)::int from reminders where id = 'rem_origin_goes') as reminders
        `
    ).toEqual([{ origin: 0, reminders: 0, task: 1 }]);
});

test('deleting a Project leaves a retired Agent homed there with no home', async () => {
    const channel = await createTestProject(owner, {
        agentIds: [],
        name: 'retirees',
        serverId,
    });
    await harness.sql`INSERT INTO agents
        (id, server_id, handle, display_name, home_timezone, home_project_id, retired_at)
        VALUES ('agt_delete_retired', ${serverId}, 'retired-one', 'Retired', 'UTC', ${channel.id},
            now())`;

    await expect(
        owner.trpc.chat.deleteChannel.mutate({
            chatId: channel.id,
            confirmation: 'retirees',
            serverId,
        })
    ).resolves.toEqual({ chatId: channel.id, serverId });

    expect(
        await harness.sql`select home_project_id from agents where id = 'agt_delete_retired'`
    ).toEqual([{ home_project_id: null }]);
});

async function insertTrigger(id: string, anchorChatId: string, removedAt: Date | null) {
    await harness.sql`INSERT INTO triggers
        (id, server_id, owner_agent_id, anchor_chat_id, kind, status, title, secret_hash,
         created_at, updated_at, deleted_at)
        VALUES (${id}, ${serverId}, ${agentId}, ${anchorChatId}, 'webhook',
            ${removedAt ? 'disabled' : 'armed'}, 'Anchored trigger', 'unused', now(), now(),
            ${removedAt})`;
}
