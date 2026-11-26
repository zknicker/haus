import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { startTask } from '../src/tasks/task-start.ts';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { taskFixture } from './task-fixture.ts';
import { startTestTask } from './task-place-fixture.ts';

const agentId = 'agt_task_api';
const agent = { agentId, kind: 'agent' } as const;
let allChatId: string;
let projectChatId: string;
let connection: HausConnection;
let fixture: ReturnType<typeof taskFixture>;
let harness: HausServerHarness;
let owner: HausClient;
let ownerUserId: string;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    fixture = taskFixture(harness);
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = await fixture.signIn('user_task_api_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task API Server',
        slug: 'task-api-server',
    });
    serverId = server.id;
    allChatId = server.channels[0]?.id ?? '';
    ownerUserId = server.viewerUserId;
    await fixture.addAgent(serverId, agentId, 'task-agent');
    projectChatId = (await owner.trpc.project.create.mutate({ name: 'ops', serverId })).chat.id;
});

afterAll(async () => {
    owner?.close();
    await connection?.close();
    await harness?.close();
});

async function send(content: string) {
    const nonce = `task-api-${crypto.randomUUID()}`;
    return (await owner.trpc.chat.send.mutate({ chatId: allChatId, content, nonce, serverId }))
        .message;
}

describe('short ids and versions', () => {
    test('gives every Task its own short id, unique under concurrent starts', async () => {
        const origins = await Promise.all(Array.from({ length: 8 }, (_, i) => send(`Work ${i}`)));
        const started = await Promise.all(
            origins.map((origin, index) =>
                startTask(connection.db, agent, {
                    originChatId: allChatId,
                    originMessageId: origin.id,
                    serverId,
                    title: `Parallel ${index}`,
                })
            )
        );
        const shortIds = started.map(({ task }) => task.shortId);
        expect(new Set(shortIds).size).toBe(8);
        expect(shortIds.every((shortId) => /^[0-9a-hjkmnp-tv-z]{8}$/u.test(shortId))).toBe(true);
        expect(started[0]?.task).toMatchObject({
            archivedAt: null,
            createdBy: agent,
            description: '',
            version: 1,
        });
        const [ledger] = await owner.trpc.taskKey.list.query({ serverId });
        expect(ledger).toMatchObject({ key: 'GEN', nextNumber: 1 });
    });

    test('every mutation fails closed on a stale expectedVersion', async () => {
        const task = await startTestTask(harness, owner, {
            channelId: allChatId,
            serverId,
            title: 'Edit',
        });
        const edited = await owner.trpc.task.update.mutate({
            expectedVersion: 1,
            patch: { title: 'Edited' },
            serverId,
            taskId: task.id,
        });
        expect(edited.task).toMatchObject({ title: 'Edited', version: 2 });
        const stale = { expectedVersion: 1, serverId, taskId: task.id };
        await expect(
            owner.trpc.task.update.mutate({ ...stale, patch: { title: 'Lost' } })
        ).rejects.toThrow(/changed/);
        await expect(owner.trpc.task.archive.mutate(stale)).rejects.toThrow(/changed/);
        await expect(owner.trpc.task.unarchive.mutate(stale)).rejects.toThrow(/changed/);
    });
});

describe('archive', () => {
    test('archive sets archivedAt once, and unarchive clears it', async () => {
        const task = await startTestTask(harness, owner, {
            channelId: projectChatId,
            serverId,
            title: 'Ship',
        });
        const at = { serverId, taskId: task.id };
        const archived = await owner.trpc.task.archive.mutate({ ...at, expectedVersion: 1 });
        const { archivedAt } = archived.task;
        expect(archivedAt).not.toBeNull();
        const again = await owner.trpc.task.archive.mutate({ ...at, expectedVersion: 2 });
        expect(again.task).toMatchObject({ archivedAt, version: 2 });
        expect(
            (await owner.trpc.task.list.query({ archived: true, serverId })).map(({ id }) => id)
        ).toContain(task.id);
        expect(
            (await owner.trpc.task.listActive.query({ serverId })).map(({ id }) => id)
        ).not.toContain(task.id);

        const restored = await owner.trpc.task.unarchive.mutate({ ...at, expectedVersion: 2 });
        expect(restored.task).toMatchObject({ archivedAt: null, version: 3 });
        expect(
            (await owner.trpc.task.listActive.query({ serverId })).map(({ id }) => id)
        ).toContain(task.id);
    });

    test('a post in an archived Task leaves it archived', async () => {
        const task = await startTestTask(harness, owner, {
            channelId: projectChatId,
            serverId,
            title: 'Stay archived',
        });
        await owner.trpc.task.archive.mutate({ expectedVersion: 1, serverId, taskId: task.id });
        await owner.trpc.chat.send.mutate({
            chatId: task.chatId,
            content: 'Still here',
            nonce: `task-api-${crypto.randomUUID()}`,
            serverId,
        });
        const detail = await owner.trpc.task.get.query({ serverId, taskId: task.id });
        expect(detail).toMatchObject({ followed: true, version: 2 });
        expect(detail.archivedAt).not.toBeNull();
    });

    test('a chatless Task is read-only history', async () => {
        await harness.sql`
            insert into tasks (id, server_id, short_id, title, archived_at,
                created_by_user_id, project_id)
            select 'tsk_task_api_history', ${serverId}, 'h1st0ry0', 'Old', now(),
                ${ownerUserId}, projects.chat_id
            from task_keys join projects on projects.task_key_id = task_keys.id
            where task_keys.server_id = ${serverId} and task_keys.key = 'GEN'
        `;
        const history = await owner.trpc.task.get.query({ serverId, shortId: 'h1st0ry0' });
        expect(history).toMatchObject({ chatId: null, origin: null });
        const at = { expectedVersion: 1, serverId, taskId: history.id };
        await expect(owner.trpc.task.unarchive.mutate(at)).rejects.toThrow(/read-only history/);
        await expect(
            owner.trpc.task.update.mutate({ ...at, patch: { title: 'New' } })
        ).rejects.toThrow(/read-only history/);
    });
});

describe('reads', () => {
    test('get by short id with Mentioned in, and list by Project', async () => {
        const task = await startTestTask(harness, owner, {
            channelId: allChatId,
            serverId,
            title: 'Rotate the staging credentials',
        });
        const mention = await send(`Tracking [the rotation](task://${task.id})`);
        const detail = await owner.trpc.task.get.query({ serverId, shortId: task.shortId });
        expect(detail.id).toBe(task.id);
        expect(detail.origin).toEqual({ chatId: allChatId, messageId: task.originMessageId });
        expect(detail.mentions).toEqual([
            expect.objectContaining({ chatId: allChatId, messageId: mention.id }),
        ]);
        expect(detail.reminders).toEqual([]);
        await expect(owner.trpc.task.get.query({ serverId, shortId: 'zzzzzzzz' })).rejects.toThrow(
            /zzzzzzzz/
        );

        const inProject = await owner.trpc.task.list.query({
            projectId: task.projectId,
            serverId,
        });
        expect(inProject.map(({ id }) => id)).toContain(task.id);
        expect(inProject.every((each) => each.projectId === task.projectId)).toBe(true);
    });
});
