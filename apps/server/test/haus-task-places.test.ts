import { beforeAll, describe, expect, test } from 'bun:test';
import { messageNotificationReason } from '@haus/api';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { messageCreatedTopic } from '../src/realtime/topics.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import type { HausClient } from './haus-client.ts';
import { captureTopic } from './realtime-capture.ts';

const fixture = agentCreationFixture();
let runner: { token: string };
let bea: HausClient;
let cal: HausClient;
let calUserId: string;
let originId: string;
let first: { chatId: string; shortId: string; taskId: string };
let second: { chatId: string; shortId: string; taskId: string };

interface Reply {
    body: Record<string, any>;
    status: number;
}

async function call(path: string, body: unknown): Promise<Reply> {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return { body: (await response.json()) as Record<string, any>, status: response.status };
}

async function start(title: string) {
    const body = {
        brief: `${title}.`,
        from: originId,
        machine: fixture.computerId,
        target: '#product',
        title,
    };
    const first = await call('/api/agent/tasks/start', body);
    const started = first.body.state === 'held' ? await call('/api/agent/tasks/start', body) : first;
    expect(started.status).toBe(200);
    const detail = await fixture.owner.trpc.task.get.query({
        shortId: started.body.task.shortId,
        serverId: fixture.serverId,
    });
    expect(started.body.target).toBe(`task:${detail.shortId}`);
    return { chatId: detail.chatId ?? '', shortId: detail.shortId, taskId: detail.id };
}

async function join(subject: string, email: string) {
    const client = await fixture.signIn(subject, [email]);
    const { token } = await fixture.owner.trpc.invitation.create.mutate({
        email,
        serverId: fixture.serverId,
    });
    await client.trpc.invitation.accept.mutate({ token });
    return client;
}

function send(client: HausClient, chatId: string, content: string) {
    return client.trpc.chat.send.mutate({
        chatId,
        content,
        nonce: createOpaqueId('non'),
        serverId: fixture.serverId,
    });
}

beforeAll(async () => {
    const { owner, serverId } = fixture;
    runner = await fixture.mintRunner('run_task_places');
    bea = await join('user_task_places_bea', 'bea@haus.test');
    cal = await join('user_task_places_cal', 'cal@haus.test');
    calUserId = await fixture.readUserId('user_task_places_cal');
    await fixture.harness.sql`
        insert into channel_participants (chat_id, server_id, user_id)
        values (${fixture.channelId}, ${serverId}, ${calUserId})
    `;
    const product = await owner.trpc.project.update.mutate({
        chatId: fixture.channelId,
        key: 'SEC',
        serverId,
    });
    expect(product.project).toMatchObject({ key: 'SEC', keyEditable: true });
    originId = (await send(owner, fixture.channelId, 'Two problems in the deploy')).message.id;
    first = await start('Rotate the key');
    second = await start('Fix the health check');
});

describe('start', () => {
    test('gives several Tasks on one Message their own short ids and takes no number', async () => {
        expect(first.shortId).not.toBe(second.shortId);
        const keys = await fixture.owner.trpc.taskKey.list.query({ serverId: fixture.serverId });
        expect(keys.find((entry) => entry.key === 'SEC')?.nextNumber).toBe(1);
        const detail = await fixture.owner.trpc.task.get.query({
            serverId: fixture.serverId,
            taskId: first.taskId,
        });
        expect(detail).toMatchObject({
            archivedAt: null,
            createdBy: { agentId: fixture.orbitAgentId, kind: 'agent' },
            origin: { chatId: fixture.channelId, messageId: originId },
        });
    });

    test('refuses an origin Message that is not in the target', async () => {
        const dm = await fixture.owner.trpc.chat.send.mutate({
            agentId: fixture.orbitAgentId,
            content: 'Can you look into the deploy?',
            nonce: 'task_places_dm',
            serverId: fixture.serverId,
            targetKind: 'agent-dm',
        });
        const refused = await call('/api/agent/tasks/start', {
            brief: 'Wrong place.',
            from: dm.message.id,
            machine: fixture.computerId,
            target: '#product',
            title: 'Wrong place',
        });
        expect(refused).toMatchObject({
            body: { code: 'INVALID_ARG', message: 'The origin Message is not in that Chat.' },
            status: 400,
        });
    });

    test('a Task Chat is never listed as a Channel', async () => {
        const chats = await fixture.owner.trpc.chat.list.query({ serverId: fixture.serverId });
        expect(chats.some((chat) => chat.id === first.chatId)).toBe(false);
    });
});

describe('followers and unread', () => {
    test('seeds the origin author, not the Captain or other Channel members', async () => {
        const followed = async (client: HausClient) =>
            (await client.trpc.task.get.query({ serverId: fixture.serverId, taskId: first.taskId }))
                .followed;
        expect(await followed(fixture.owner)).toBe(true);
        expect(await followed(cal)).toBe(false);
        const agents = await fixture.harness.sql`
            select agent_id from agent_task_follows
            where task_chat_id = ${first.chatId} and task_chat_kind = 'task' and followed
        `;
        expect(agents.map((row: { agent_id: string }) => row.agent_id)).toEqual([]);
    });

    test('a message in a Task names its origin author, whom it notifies without a mention', async () => {
        const created = captureTopic(messageCreatedTopic);
        const sent = await send(cal, second.chatId, 'Health check is green again.');
        const event = await created.next((candidate) => candidate.messageId === sent.message.id);
        created.stop();
        expect(event).toMatchObject({
            messageId: sent.message.id,
            taskId: second.taskId,
            taskOriginAuthorUserId: fixture.ownerUserId,
        });
        expect(messageNotificationReason(event, fixture.ownerUserId)).toBe('reply');
    });

    test('a Task is unread only for its followers, and posting follows', async () => {
        await send(fixture.owner, first.chatId, 'Starting with the staging key.');
        const calPreviews = await cal.trpc.chat.unreadPreviews.query({
            serverId: fixture.serverId,
        });
        expect(calPreviews.previews.some((row) => row.chatId === first.chatId)).toBe(false);

        await send(cal, first.chatId, 'Prod key is in the vault.');
        const adaPreviews = await fixture.owner.trpc.chat.unreadPreviews.query({
            serverId: fixture.serverId,
        });
        expect(adaPreviews.previews.find((row) => row.chatId === first.chatId)).toMatchObject({
            task: { archivedAt: null, projectId: fixture.channelId, shortId: first.shortId },
        });
        const detail = await cal.trpc.task.get.query({
            serverId: fixture.serverId,
            taskId: first.taskId,
        });
        expect(detail.followed).toBe(true);
        const unfollowed = await fixture.owner.trpc.task.setFollow.mutate({
            followed: false,
            serverId: fixture.serverId,
            taskId: first.taskId,
        });
        expect(unfollowed.followed).toBe(false);
        const afterUnfollow = await fixture.owner.trpc.chat.unreadPreviews.query({
            serverId: fixture.serverId,
        });
        expect(afterUnfollow.previews.some((row) => row.chatId === first.chatId)).toBe(false);
    });
});

describe('sidebar, archive, and reminders', () => {
    test('listActive keeps active Tasks in Channels the viewer can see', async () => {
        const shortIds = async (client: HausClient) =>
            (await client.trpc.task.listActive.query({ serverId: fixture.serverId }))
                .map((task) => task.shortId)
                .sort();
        expect(await shortIds(fixture.owner)).toEqual([first.shortId, second.shortId].sort());
        expect(await shortIds(bea)).toEqual([]);
    });

    test('archiving checks the version, cancels one-time reminders, and leaves the sidebar', async () => {
        const anchor = (await send(fixture.owner, second.chatId, 'Check back later.')).message.id;
        const once = createOpaqueId('rem');
        const daily = createOpaqueId('rem');
        for (const [id, repeat] of [
            [once, null],
            [daily, 'daily'],
        ] as const) {
            await fixture.harness.sql`
                insert into reminders (
                    id, server_id, owner_agent_id, anchor_chat_id, anchor_message_id, title,
                    fire_at, timezone, status, repeat, created_at, updated_at
                )
                values (
                    ${id}, ${fixture.serverId}, ${fixture.orbitAgentId}, ${second.chatId},
                    ${anchor}, 'Check back', now() + interval '1 hour', 'UTC', 'scheduled',
                    ${repeat}, now(), now()
                )
            `;
        }
        const current = await fixture.owner.trpc.task.get.query({
            serverId: fixture.serverId,
            taskId: second.taskId,
        });
        await expect(
            fixture.owner.trpc.task.archive.mutate({
                expectedVersion: current.version + 5,
                serverId: fixture.serverId,
                taskId: second.taskId,
            })
        ).rejects.toThrow(/changed/u);
        const { task } = await fixture.owner.trpc.task.archive.mutate({
            expectedVersion: current.version,
            serverId: fixture.serverId,
            taskId: second.taskId,
        });
        expect(task.archivedAt).not.toBeNull();
        const statuses = await fixture.harness.sql`
            select id, status from reminders where anchor_chat_id = ${second.chatId}
        `;
        const byId = new Map(statuses.map((row: { id: string; status: string }) => [row.id, row]));
        expect(byId.get(once)?.status).toBe('canceled');
        expect(byId.get(daily)?.status).toBe('scheduled');
    });

    test('posting in an archived Task leaves it archived and its reminders canceled', async () => {
        await send(fixture.owner, second.chatId, 'One more thing.');
        const after = await fixture.owner.trpc.task.get.query({
            serverId: fixture.serverId,
            taskId: second.taskId,
        });
        expect(after.archivedAt).not.toBeNull();
        const active = (
            await fixture.owner.trpc.task.listActive.query({ serverId: fixture.serverId })
        ).map((task) => task.shortId);
        expect(active).toEqual([first.shortId]);
        const canceled = await fixture.harness.sql`
            select count(*)::integer as count from reminders
            where anchor_chat_id = ${second.chatId} and status = 'canceled'
        `;
        expect(canceled[0]?.count).toBe(1);
    });

    test('an Agent archives by short id, and archiving again changes nothing', async () => {
        const archived = await call('/api/agent/tasks/archive', { task: second.shortId });
        expect(archived).toMatchObject({
            body: { task: { shortId: second.shortId } },
            status: 200,
        });
        expect(archived.body.task.archivedAt).not.toBeNull();
    });
});

test('the Channel previews each Task under its origin Message', async () => {
    const page = await fixture.owner.trpc.chat.messages.query({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
    });
    const previews = page.tasks.filter((task) => task.originMessageId === originId);
    expect(previews.map((task) => task.shortId).sort()).toEqual(
        [first.shortId, second.shortId].sort()
    );
    const preview = previews.find((task) => task.shortId === first.shortId);
    expect(preview).toMatchObject({ archivedAt: null, messageCount: 3, title: 'Rotate the key' });
    expect(preview?.recentMessages.map((message) => message.content)).toEqual([
        'Rotate the key.',
        'Starting with the staging key.',
        'Prod key is in the vault.',
    ]);
});

test('search names a Task Chat message by its Task short id', async () => {
    const [hit] = await fixture.owner.trpc.chat.search.query({
        query: 'vault',
        serverId: fixture.serverId,
    });
    expect(hit).toMatchObject({ chatId: first.chatId, taskShortId: first.shortId });
});
