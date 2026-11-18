import { afterAll, beforeAll, expect, test } from 'bun:test';

import type { CloudAgentWorkUpdatedEvent, TaskUpdatedEvent } from '@haus/api';

import { cloudAgentWorkUpdatedTopic, taskUpdatedTopic } from '../src/realtime/topics.ts';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';
import { cloudAgentLinkHelpers } from './cloud-agent-link-helpers.ts';
import { captureTopic, type TopicCapture } from './realtime-capture.ts';
import { startTestTask } from './task-place-fixture.ts';

const fixture = cloudAgentFixture();
const { agentPost } = cloudAgentLinkHelpers(fixture);
let taskEvents: TopicCapture<TaskUpdatedEvent>;
let workEvents: TopicCapture<CloudAgentWorkUpdatedEvent>;

beforeAll(() => {
    taskEvents = captureTopic(taskUpdatedTopic);
    workEvents = captureTopic(cloudAgentWorkUpdatedTopic);
});

afterAll(() => {
    taskEvents?.stop();
    workEvents?.stop();
});

test('the Agent Task list filters by state, repeated or comma-separated, and by key', async () => {
    const closed = await startTestTask(fixture.harness, fixture.owner, {
        channelId: fixture.channelId,
        serverId: fixture.serverId,
        title: 'Already shipped',
    });
    await fixture.harness
        .sql`update tasks set state = 'done', completed_at = now() where id = ${closed.id}`;
    await fixture.harness.sql`update tasks set state = 'open' where id = ${fixture.task.id}`;
    const runner = await fixture.mintRunner('run_task_list_state');
    const keys = async (query: string) => {
        const response = await fetch(new URL(`/api/agent/tasks?${query}`, fixture.harness.url), {
            headers: { authorization: `Bearer ${runner.token}` },
        });
        expect(response.status).toBe(200);
        const body = (await response.json()) as { tasks: { key: string }[] };
        return body.tasks.map((task) => task.key).sort();
    };
    const ledger = fixture.task.key.split('-')[0] ?? '';

    expect(await keys('state=done')).toEqual([closed.key]);
    expect(await keys('state=done&state=open')).toEqual([fixture.task.key, closed.key].sort());
    expect(await keys(`state=open,done&key=${ledger}`)).toEqual(
        [fixture.task.key, closed.key].sort()
    );
    expect(await keys('category=done')).not.toContain(closed.key);

    const unknown = await fetch(new URL('/api/agent/tasks?key=ZZZ', fixture.harness.url), {
        headers: { authorization: `Bearer ${runner.token}` },
    });
    expect(unknown.status).toBe(404);
});

test('a reminder set on a Task shows on it, naming the Agent that set it', async () => {
    const runner = await fixture.mintRunner('run_task_reminder_setby');
    const scheduled = await agentPost(runner, '/api/agent/reminders/schedule', {
        commandId: 'surfaces-reminder',
        fireAt: new Date(Date.now() + 3_600_000).toISOString(),
        target: `task:${fixture.task.key}`,
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

test('launching work on a Task announces the Task, and work events and rows name it', async () => {
    const runner = await fixture.mintRunner('run_surfaces_launch');
    await fixture.readTarget(runner, `task:${fixture.task.key}`);
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'surfaces-launch' })
    );
    expect(started.status).toBe(200);
    const workId = started.body.work?.id ?? '';

    await taskEvents.next((event) => event.taskId === fixture.task.id);
    const workEvent = await workEvents.next((event) => event.workId === workId);
    expect(workEvent.taskId).toBe(fixture.task.id);

    const rows = await fixture.owner.trpc.cloudAgentWork.listActive.query({
        serverId: fixture.serverId,
    });
    expect(rows.find((row) => row.work.id === workId)).toMatchObject({
        taskId: fixture.task.id,
        taskKey: fixture.task.key,
    });
});

test('attaching a pull request to a Task announces the Task', async () => {
    const runner = await fixture.mintRunner('run_surfaces_attach_pr');
    const attached = await agentPost(runner, '/api/agent/tasks/attach-pr', {
        key: fixture.task.key,
        url: 'https://github.com/haus/haus/pull/42',
    });
    expect(attached.status).toBe(200);
    expect(await taskEvents.next((event) => event.taskId === fixture.task.id)).toMatchObject({
        chatId: fixture.task.chatId,
        serverId: fixture.serverId,
    });
});
