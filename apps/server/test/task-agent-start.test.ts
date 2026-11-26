import { beforeAll, describe, expect, test } from 'bun:test';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import type { HausClient } from './haus-client.ts';

const fixture = agentCreationFixture();
let orbit: { token: string };
let kit: { token: string };
let peer: { token: string };
let bea: HausClient;
let opsId: string;

interface StartReply {
    code?: string;
    message?: string;
    state?: string;
    target?: string;
    task?: { shortId: string; title: string };
}

async function call(as: { token: string }, path: string, body: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${as.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return {
        body: (await response.json()) as StartReply & Record<string, unknown>,
        status: response.status,
    };
}

function start(body: Record<string, unknown>, as = orbit) {
    return call(as, '/api/agent/tasks/start', { machine: fixture.computerId, ...body });
}

async function startedTask(body: Record<string, unknown>) {
    const reply = await start(body);
    expect(reply.status).toBe(200);
    expect(reply.body.state).toBe('started');
    const shortId = reply.body.task?.shortId ?? '';
    return await fixture.owner.trpc.task.get.query({ serverId: fixture.serverId, shortId });
}

beforeAll(async () => {
    const { owner, serverId } = fixture;
    const kitAgentId = await fixture.createAgent('Kit', 'kit');
    await owner.trpc.agent.setHome.mutate({
        agentId: kitAgentId,
        projectId: fixture.channelId,
        serverId,
    });
    opsId = (await owner.trpc.project.create.mutate({ key: 'OPS', name: 'ops', serverId })).chat.id;
    await owner.trpc.agent.setHome.mutate({
        agentId: fixture.peerAgentId,
        projectId: opsId,
        serverId,
    });
    orbit = await fixture.mintRunner('run_task_start_orbit');
    kit = await fixture.mintRunner('run_task_start_kit', kitAgentId);
    peer = await fixture.mintRunner('run_task_start_peer', fixture.peerAgentId, opsId);
    bea = await fixture.signIn('user_task_start_bea', ['bea-task-start@haus.test']);
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'bea-task-start@haus.test',
        serverId,
    });
    await bea.trpc.invitation.accept.mutate({ token });
});

describe('a person starts a Task', () => {
    test('the prompt is its first message and first turn, and the person is its starter', async () => {
        const request = {
            computerId: fixture.computerId,
            model: 'gpt-5.6-sol',
            projectId: fixture.channelId,
            prompt: 'Find why the nightly export is slow',
            requestId: 'req-person-start',
            serverId: fixture.serverId,
        };
        const { task } = await fixture.owner.trpc.task.start.mutate(request);
        expect(task).toMatchObject({
            captainId: null,
            computerId: fixture.computerId,
            createdBy: { kind: 'user', userId: fixture.ownerUserId },
            title: 'Find why the nightly export is slow',
            titleCustom: false,
        });
        expect((await fixture.owner.trpc.task.start.mutate(request)).task.id).toBe(task.id);
        const page = await fixture.owner.trpc.chat.messages.query({
            chatId: task.chatId ?? '',
            serverId: fixture.serverId,
        });
        expect(page.messages.map((message) => message.content)).toEqual([request.prompt]);
        expect(
            await fixture.harness.sql`
                select source, state from agent_inbox where agent_id = ${task.agentId}
            `
        ).toEqual([{ source: 'human', state: 'queued' }]);
        const detail = await fixture.owner.trpc.task.get.query({
            serverId: fixture.serverId,
            taskId: task.id,
        });
        expect(detail.followed).toBe(true);
    });

    test('a person’s Task needs a Machine they attached or one open to All Captains', async () => {
        await fixture.harness.sql`
            update computers set attached_by_user_id = ${await fixture.readUserId('user_task_start_bea')}
            where id = ${fixture.computerId}
        `;
        await expect(
            fixture.owner.trpc.task.start.mutate({
                computerId: fixture.computerId,
                model: 'gpt-5.6-sol',
                projectId: fixture.channelId,
                prompt: 'Not on my Machine',
                requestId: 'req-person-refused',
                serverId: fixture.serverId,
            })
        ).rejects.toThrow('Machine you attached');
        await fixture.harness.sql`
            update computers set attached_by_user_id = ${fixture.ownerUserId}
            where id = ${fixture.computerId}
        `;
    });
});

describe('a Captain starts crew', () => {
    test('one start makes the Task, its chat and its hidden agent, posts the brief and queues it', async () => {
        const origin = await fixture.owner.trpc.chat.send.mutate({
            chatId: fixture.channelId,
            content: '@orbit the signing key leaked',
            nonce: createOpaqueId('non'),
            serverId: fixture.serverId,
        });
        const body = {
            brief: 'Rotate the signing key and update the deploy secret.',
            from: origin.message.id,
            target: '#product',
            title: 'Rotate the signing key',
        };
        const held = await start(body);
        expect(held.body).toMatchObject({ newMessageCount: 1, state: 'held' });
        expect(await fixture.harness.sql`select id from tasks where title = ${body.title}`).toEqual(
            []
        );
        const reply = await start(body);
        expect(reply.status).toBe(200);
        expect(reply.body).toMatchObject({
            state: 'started',
            target: `task:${reply.body.task?.shortId}`,
        });
        const task = await fixture.owner.trpc.task.get.query({
            serverId: fixture.serverId,
            shortId: reply.body.task?.shortId ?? '',
        });
        expect(task).toMatchObject({
            activity: 'working',
            captainId: fixture.orbitAgentId,
            computerId: fixture.computerId,
            model: 'gpt-5.6-sol',
            needsYou: false,
            origin: { chatId: fixture.channelId, messageId: origin.message.id },
            projectId: fixture.channelId,
            title: 'Rotate the signing key',
            titleCustom: true,
        });
        const [agent] = (await fixture.harness.sql`
            select kind, handle, home_project_id, computer_id, desired_model_id, desired_runtime_id
            from agents where id = ${task.agentId}
        `) as Record<string, unknown>[];
        expect(agent).toEqual({
            computer_id: fixture.computerId,
            desired_model_id: 'gpt-5.6-sol',
            desired_runtime_id: 'codex',
            handle: `task-${task.shortId}`,
            home_project_id: null,
            kind: 'task',
        });
        const page = await fixture.owner.trpc.chat.messages.query({
            chatId: task.chatId ?? '',
            serverId: fixture.serverId,
        });
        const brief = page.messages.at(0);
        expect(brief).toMatchObject({
            author: { agentId: fixture.orbitAgentId, kind: 'agent' },
            content: 'Rotate the signing key and update the deploy secret.',
        });
        expect(
            await fixture.harness.sql`
                select dedupe_key, state, chat_id from agent_inbox where agent_id = ${task.agentId}
            `
        ).toEqual([{ chat_id: task.chatId, dedupe_key: brief?.id, state: 'queued' }]);
        expect(
            await fixture.harness.sql`
                select agent_id from agent_task_follows
                where task_chat_id = ${task.chatId} and agent_id = ${fixture.orbitAgentId} and followed
            `
        ).toEqual([]);
    });

    test('without a title the Task is named from the brief, and a retry returns the same Task', async () => {
        const body = {
            brief: 'Audit the billing exports for duplicate rows\n\nStart with November.',
            requestId: 'req-audit-billing',
        };
        const first = await startedTask(body);
        expect(first).toMatchObject({
            title: 'Audit the billing exports for duplicate rows',
            titleCustom: false,
        });
        const again = await startedTask(body);
        expect(again.id).toBe(first.id);
        expect(again.agentId).toBe(first.agentId);
    });

    test('a DM origin starts in the home Project, shown only to that DM’s readers', async () => {
        const { owner, serverId } = fixture;
        const dm = await owner.trpc.chat.send.mutate({
            agentId: fixture.orbitAgentId,
            content: 'Can you look into the deploy?',
            nonce: 'task_start_dm',
            serverId,
            targetKind: 'agent-dm',
        });
        const task = await startedTask({
            brief: 'Look into the deploy.',
            from: dm.message.id,
            target: 'dm:@ada',
        });
        expect(task).toMatchObject({
            origin: { chatId: dm.message.chatId, messageId: dm.message.id },
            projectId: fixture.channelId,
        });
        expect(
            (await bea.trpc.task.get.query({ serverId, shortId: task.shortId })).origin
        ).toBeNull();
    });

    test('--issue links and assigns an open Issue without changing its state', async () => {
        const filed = await call(orbit, '/api/agent/issues/create', {
            title: 'Patch the login bug',
        });
        const code = (filed.body.issue as { code: string }).code;
        const task = await startedTask({ brief: 'Patch the login bug.', issue: code });
        const [issue] = (await fixture.harness.sql`
            select state, assignee_task_id from issues where title = 'Patch the login bug'
        `) as { assignee_task_id: string; state: string }[];
        expect(issue).toEqual({ assignee_task_id: task.id, state: 'todo' });
        expect(
            await fixture.harness
                .sql`select task_id from issue_task_links where task_id = ${task.id}`
        ).toEqual([{ task_id: task.id }]);
    });

    test('--issue refuses another Project’s Issue and one someone else holds', async () => {
        const ops = await call(peer, '/api/agent/issues/create', {
            title: 'Restore the dashboard',
        });
        const elsewhere = await start({
            brief: 'Restore it.',
            issue: (ops.body.issue as { code: string }).code,
        });
        expect(elsewhere).toMatchObject({ body: { code: 'TASK_PROJECT_NOT_HOME' }, status: 403 });

        const held = await call(kit, '/api/agent/issues/create', { title: 'Tune the cache' });
        const code = (held.body.issue as { code: string }).code;
        await call(kit, '/api/agent/issues/update', { assignee: 'me', code, expectAssignee: null });
        const taken = await start({ brief: 'Tune it.', issue: code });
        expect(taken).toMatchObject({ body: { code: 'ISSUE_TAKEN' }, status: 409 });
        expect(await fixture.harness.sql`select id from tasks where title = 'Tune it.'`).toEqual(
            []
        );
    });

    test('a Task never starts a Task, and a start needs a Machine', async () => {
        const task = await startedTask({ brief: 'Draft the release notes.' });
        const taskRunner = await fixture.mintRunner(
            'run_task_start_inner',
            task.agentId ?? '',
            task.chatId ?? '',
            false
        );
        const nested = await start({ brief: 'Help me.' }, taskRunner);
        expect(nested).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
        expect(nested.body.message).toContain('Tasks never start Tasks');

        const noMachine = await call(orbit, '/api/agent/tasks/start', { brief: 'Anything.' });
        expect(noMachine.body.message).toContain('no default Machine');
    });
});
