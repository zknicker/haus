import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';
import { startTestTask } from './task-place-fixture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_projects'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Projects', slug: 'projects' })
    ).id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

function refusedWith(code: 'PROJECT_KEY_FIXED' | 'TASK_KEY_TAKEN') {
    return expect.objectContaining({ data: expect.objectContaining({ project: { code } }) });
}

test('a new Server holds only the Haus project on GEN', async () => {
    expect(await owner.trpc.project.list.query({ serverId })).toEqual([
        expect.objectContaining({ isHaus: true, key: 'GEN', keyEditable: true, name: 'all' }),
    ]);
});

test('a person creates a Project with a chosen key or one the key rule allocates', async () => {
    const chosen = await owner.trpc.project.create.mutate({
        key: 'SEC',
        name: 'security',
        serverId,
    });
    expect(chosen.project).toMatchObject({
        chatId: chosen.chat.id,
        isHaus: false,
        key: 'SEC',
        keyEditable: true,
        name: 'security',
        serverId,
    });
    expect(chosen.chat).toMatchObject({
        kind: 'channel',
        name: 'security',
        participantAgentIds: [],
    });
    expect(chosen.chat.participantUserIds).toHaveLength(1);

    const plan = await owner.trpc.project.create.mutate({ name: 'plan', serverId });
    const planning = await owner.trpc.project.create.mutate({ name: 'planning', serverId });
    const launch = await owner.trpc.project.create.mutate({ name: '2027-launch', serverId });
    const dashes = await owner.trpc.project.create.mutate({ name: '--', serverId });
    expect([plan, planning, launch, dashes].map((created) => created.project.key)).toEqual([
        'PLAN',
        'PLAN2',
        'P202',
        'P2',
    ]);
});

test('a key already in the ledger is TASK_KEY_TAKEN on create and on update', async () => {
    await expect(
        owner.trpc.project.create.mutate({ key: 'GEN', name: 'general-two', serverId })
    ).rejects.toEqual(refusedWith('TASK_KEY_TAKEN'));
    expect(
        (await owner.trpc.project.list.query({ serverId })).some(
            (project) => project.name === 'general-two'
        )
    ).toBe(false);

    const ops = await owner.trpc.project.create.mutate({ name: 'ops', serverId });
    await expect(
        owner.trpc.project.update.mutate({ chatId: ops.chat.id, key: 'GEN', serverId })
    ).rejects.toEqual(refusedWith('TASK_KEY_TAKEN'));
});

test('a key changes in place until a Task carries it, then it is PROJECT_KEY_FIXED', async () => {
    const web = await owner.trpc.project.create.mutate({ name: 'web', serverId });
    const renamed = await owner.trpc.project.update.mutate({
        chatId: web.chat.id,
        key: 'SITE',
        serverId,
    });
    expect(renamed.project).toMatchObject({
        key: 'SITE',
        keyEditable: true,
        taskKeyId: web.project.taskKeyId,
    });

    const task = await startTestTask(harness, owner, {
        channelId: web.chat.id,
        key: 'SITE',
        serverId,
        title: 'Ship the landing page',
    });
    expect(task.key).toBe('SITE-1');
    const [listed] = (await owner.trpc.project.list.query({ serverId })).filter(
        (project) => project.chatId === web.chat.id
    );
    expect(listed).toMatchObject({ key: 'SITE', keyEditable: false });
    await expect(
        owner.trpc.project.update.mutate({ chatId: web.chat.id, key: 'WWW', serverId })
    ).rejects.toEqual(refusedWith('PROJECT_KEY_FIXED'));
    await expect(
        owner.trpc.project.update.mutate({
            chatId: web.chat.id,
            key: 'SITE',
            name: 'site',
            serverId,
        })
    ).resolves.toMatchObject({ project: { key: 'SITE', name: 'site' } });
});

test('creating and each effective change publish project.updated; a no-op publishes nothing', async () => {
    const beforeCreate = captureAllTopics();
    const created = await owner.trpc.project.create.mutate({ name: 'events', serverId });
    const id = created.chat.id;
    await expect(publishedSince(beforeCreate, serverId)).resolves.toEqual([
        expect.objectContaining({ action: 'created', chatId: id, type: 'chat.lifecycle' }),
        { projectId: id, serverId, type: 'project.updated' },
    ]);

    const beforeKey = captureAllTopics();
    await owner.trpc.project.update.mutate({ chatId: id, key: 'EVT', serverId });
    await expect(publishedSince(beforeKey, serverId)).resolves.toEqual([
        { projectId: id, serverId, type: 'project.updated' },
    ]);

    const beforeRename = captureAllTopics();
    await owner.trpc.project.update.mutate({ chatId: id, name: 'events-renamed', serverId });
    await expect(publishedSince(beforeRename, serverId)).resolves.toEqual([
        expect.objectContaining({ action: 'updated', chatId: id, type: 'chat.lifecycle' }),
        { projectId: id, serverId, type: 'project.updated' },
    ]);

    const beforeNoop = captureAllTopics();
    await owner.trpc.project.update.mutate({
        chatId: id,
        key: 'EVT',
        name: 'events-renamed',
        serverId,
    });
    await expect(publishedSince(beforeNoop, serverId)).resolves.toEqual([]);
});

test('a member outside the Project channel cannot change its settings, and nothing commits', async () => {
    harness.humans.setVerifiedEmails('user_projects_outsider', ['outsider-projects@haus.test']);
    const outsider = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_projects_outsider')
    );
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'outsider-projects@haus.test',
        serverId,
    });
    await outsider.trpc.invitation.accept.mutate({ token });
    const closed = await owner.trpc.project.create.mutate({ name: 'closed-door', serverId });
    const before = captureAllTopics();

    await expect(
        outsider.trpc.project.update.mutate({
            chatId: closed.chat.id,
            description: 'Rewritten from outside',
            key: 'OUT',
            name: 'taken-over',
            serverId,
        })
    ).rejects.toEqual(
        expect.objectContaining({
            data: expect.objectContaining({ code: 'FORBIDDEN' }),
            message: 'You are not a participant in this Chat.',
        })
    );
    outsider.close();

    expect(
        await harness.sql`
            select chats.name, chats.description, task_keys.key from projects
            join chats on chats.id = projects.chat_id
            join task_keys on task_keys.id = projects.task_key_id
            where projects.chat_id = ${closed.chat.id}
        `
    ).toEqual([{ description: null, key: closed.project.key, name: 'closed-door' }]);
    await expect(publishedSince(before, serverId)).resolves.toEqual([]);
});

test('a taken channel name refuses create and rename', async () => {
    const a = await owner.trpc.project.create.mutate({ name: 'collide-a', serverId });
    await owner.trpc.project.create.mutate({ name: 'collide-b', serverId });
    await expect(owner.trpc.project.create.mutate({ name: 'collide-b', serverId })).rejects.toThrow(
        'A channel already uses that name.'
    );
    await expect(
        owner.trpc.project.update.mutate({ chatId: a.chat.id, name: 'collide-b', serverId })
    ).rejects.toThrow('A channel already uses that name.');
});
