import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { WorkerUpdatedEvent, TaskUpdatedEvent } from '@haus/api';
import { workerUpdatedTopic, taskUpdatedTopic } from '../src/realtime/topics.ts';
import { captureTopic, type TopicCapture } from './realtime-capture.ts';
import { startTestTask } from './task-place-fixture.ts';
import { workerLinkHelpers } from './worker-link-helpers.ts';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();
const { agentPost } = workerLinkHelpers(fixture);
let taskEvents: TopicCapture<TaskUpdatedEvent>;
let workEvents: TopicCapture<WorkerUpdatedEvent>;

beforeAll(() => {
    taskEvents = captureTopic(taskUpdatedTopic);
    workEvents = captureTopic(workerUpdatedTopic);
});

afterAll(() => {
    taskEvents?.stop();
    workEvents?.stop();
});

test('the Agent Task list shows active or archived Tasks, mine or all, and one Project', async () => {
    const archived = await startTestTask(fixture.harness, fixture.owner, {
        channelId: fixture.channelId,
        serverId: fixture.serverId,
        title: 'Already shipped',
    });
    await fixture.harness.sql`update tasks set archived_at = now() where id = ${archived.id}`;
    const runner = await fixture.mintRunner('run_task_list_state');
    const shortIds = async (query: string) => {
        const response = await fetch(new URL(`/api/agent/tasks?${query}`, fixture.harness.url), {
            headers: { authorization: `Bearer ${runner.token}` },
        });
        expect(response.status).toBe(200);
        const body = (await response.json()) as { tasks: { shortId: string }[] };
        return body.tasks.map((task) => task.shortId);
    };
    const [project] = (await fixture.harness.sql`
        select task_keys.key from projects
        join task_keys on task_keys.id = projects.task_key_id
        where projects.chat_id = ${fixture.task.projectId}
    `) as { key: string }[];

    expect(await shortIds('all=true')).toContain(fixture.task.shortId);
    expect(await shortIds('all=true')).not.toContain(archived.shortId);
    expect(await shortIds('all=true&archived=true')).toContain(archived.shortId);
    expect(await shortIds('all=true&archived=true')).not.toContain(fixture.task.shortId);
    expect(await shortIds('archived=true')).toEqual([]);
    expect(await shortIds(`all=true&project=${project?.key}`)).toContain(fixture.task.shortId);

    const unknown = await fetch(
        new URL('/api/agent/tasks?all=true&project=ZZZ', fixture.harness.url),
        { headers: { authorization: `Bearer ${runner.token}` } }
    );
    expect(unknown.status).toBe(400);
});

test('a reminder set on a Task shows on it, naming the Agent that set it', async () => {
    const runner = await fixture.mintRunner('run_task_reminder_setby');
    await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.task.chatId,
        content: 'Watching the flaky test.',
        nonce: 'surfaces-reminder-post',
        serverId: fixture.serverId,
    });
    const scheduled = await agentPost(runner, '/api/agent/reminders/schedule', {
        commandId: 'surfaces-reminder',
        fireAt: new Date(Date.now() + 3_600_000).toISOString(),
        target: `task:${fixture.task.shortId}`,
        title: 'Check back on the flaky test',
    });
    expect(scheduled.status).toBe(200);
    const detail = await fixture.owner.trpc.task.get.query({
        serverId: fixture.serverId,
        taskId: fixture.task.id,
    });
    expect(detail.reminders).toEqual([
        expect.objectContaining({
            anchorChatId: fixture.task.chatId,
            kind: 'once',
            setBy: { agentId: fixture.orbitAgentId, displayName: 'Orbit' },
            title: 'Check back on the flaky test',
        }),
    ]);
});

test('starting a Worker on a Task names the Task in its event and its Happening now row', async () => {
    const runner = await fixture.mintRunner('run_surfaces_launch');
    await fixture.readTarget(runner, `task:${fixture.task.shortId}`);
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'surfaces-launch' })
    );
    expect(started.status).toBe(200);
    const workerId = started.body.worker?.id ?? '';

    const workEvent = await workEvents.next((event) => event.workerId === workerId);
    expect(workEvent.taskId).toBe(fixture.task.id);

    const rows = await fixture.owner.trpc.worker.listActive.query({
        serverId: fixture.serverId,
    });
    expect(rows.find((row) => row.worker.id === workerId)).toMatchObject({
        taskId: fixture.task.id,
        taskShortId: fixture.task.shortId,
    });
});

test('attaching a pull request to a Task announces the Task', async () => {
    const runner = await fixture.mintRunner('run_surfaces_attach_pr');
    const attached = await agentPost(runner, '/api/agent/tasks/attach-pr', {
        task: fixture.task.shortId,
        url: 'https://github.com/haus/haus/pull/42',
    });
    expect(attached.status).toBe(200);
    expect(await taskEvents.next((event) => event.taskId === fixture.task.id)).toMatchObject({
        chatId: fixture.task.chatId,
        serverId: fixture.serverId,
    });
});
