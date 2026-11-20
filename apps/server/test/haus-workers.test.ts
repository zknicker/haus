import { expect, test } from 'bun:test';
import type { Worker } from '@haus/api';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test('a start answers with the Worker, posts no Message, and publishes worker.updated', async () => {
    const runner = await fixture.mintRunner('run_worker_create');
    const realtime = captureAllTopics();

    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'worker-create' }));

    expect(created.status).toBe(200);
    const worker = created.body.worker as Worker;
    expect(created.body).toMatchObject({
        state: 'started',
        worker: {
            agentId: fixture.orbitAgentId,
            carrierComputerId: fixture.computerId,
            launchMessageId: null,
            originChatId: null,
            place: 'cursor',
            repository: 'haus/haus',
            startingRef: 'main',
            status: 'queued',
            taskId: fixture.task.id,
            title: 'Fix the flaky delivery test',
        },
    });
    const events = await publishedSince(realtime, fixture.serverId);
    realtime.stop();
    expect(events).toEqual([
        {
            chatId: fixture.task.chatId,
            serverId: fixture.serverId,
            taskId: fixture.task.id,
            type: 'worker.updated',
            workerId: worker.id,
        },
    ]);
    const history = await fixture.owner.trpc.chat.messages.query({
        chatId: fixture.task.chatId,
        serverId: fixture.serverId,
    });
    expect(history.messages).toEqual([]);

    const replay = await fixture.postStart(runner, fixture.startBody({ nonce: 'worker-create' }));
    expect(replay.body).toMatchObject({ state: 'started', worker: { id: worker.id } });
    const read = await fixture.owner.trpc.worker.get.query({
        serverId: fixture.serverId,
        workerId: worker.id,
    });
    expect(read.id).toBe(worker.id);
});

test('each refusal names its code and writes nothing', async () => {
    const runner = await fixture.mintRunner('run_worker_refused');
    const before = await fixture.countWork();
    const refused = async (overrides: Record<string, string | undefined>) => {
        const result = await fixture.postStart(runner, fixture.startBody(overrides));
        return [result.status, result.body.code];
    };

    expect(await refused({ nonce: 'no-task', task: undefined })).toEqual([
        400,
        'WORKER_TASK_REQUIRED',
    ]);
    expect(await refused({ nonce: 'bad-task', task: 'ZZZ-404' })).toEqual([
        400,
        'WORKER_TASK_REQUIRED',
    ]);
    expect(await refused({ nonce: 'no-place', place: undefined })).toEqual([
        400,
        'WORKER_PLACE_REQUIRED',
    ]);
    expect(await refused({ nonce: 'bad-repo', repository: 'haus' })).toEqual([400, 'INVALID_ARG']);
    expect(await refused({ nonce: 'worker-create', title: 'Something else' })).toEqual([
        409,
        'WORKER_IDEMPOTENCY_CONFLICT',
    ]);
    expect((await fixture.postStart(null, fixture.startBody({ nonce: 'no-runner' }))).status).toBe(
        401
    );
    expect(await fixture.countWork()).toBe(before);
});

test('the Agent stops its own Worker, and a person who reads the Task can too', async () => {
    const runner = await fixture.mintRunner('run_worker_stop');
    const first = await fixture.postStart(runner, fixture.startBody({ nonce: 'worker-stop-1' }));
    const second = await fixture.postStart(runner, fixture.startBody({ nonce: 'worker-stop-2' }));

    const stopped = await fixture.postCancel(runner, first.body.worker?.id ?? '');
    expect(stopped.status).toBe(200);
    expect(stopped.body.worker.turns[0].stopRequestedBy).toEqual({
        id: fixture.orbitAgentId,
        kind: 'agent',
    });

    const byPeer = await fixture.peer.trpc.worker.stop.mutate({
        serverId: fixture.serverId,
        workerId: second.body.worker?.id ?? '',
    });
    expect(byPeer.worker.turns[0]?.stopRequestedBy).toEqual({
        id: fixture.peerUserId,
        kind: 'user',
    });
});

test('Happening now lists a live Worker, opening its Task, only to people who read that Task', async () => {
    const runner = await fixture.mintRunner('run_worker_active');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'worker-active' }));
    const workerId = created.body.worker?.id;

    const forOwner = (
        await fixture.owner.trpc.worker.listActive.query({ serverId: fixture.serverId })
    ).find((row) => row.worker.id === workerId);
    const forOutsider = (
        await fixture.outsider.trpc.worker.listActive.query({ serverId: fixture.serverId })
    ).find((row) => row.worker.id === workerId);

    expect(forOwner).toMatchObject({
        chatKind: 'channel',
        chatName: 'product',
        conversationChatId: fixture.channelId,
        location: { chatId: fixture.task.chatId, kind: 'task', taskId: fixture.task.id },
        taskKey: fixture.task.key,
    });
    expect(forOutsider).toBeUndefined();
    await expect(
        fixture.outsider.trpc.worker.get.query({
            serverId: fixture.serverId,
            workerId: workerId ?? '',
        })
    ).rejects.toThrow('That Worker does not exist.');
});

test('the Agent profile lists its live Worker, opening its Task', async () => {
    const runner = await fixture.mintRunner('run_worker_automation');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'worker-automation' })
    );
    const rows = await fixture.owner.trpc.worker.listAutomations.query({
        agentId: fixture.orbitAgentId,
        history: false,
        serverId: fixture.serverId,
    });

    expect(rows.find((row) => row.worker.id === created.body.worker?.id)).toMatchObject({
        conversationChatId: fixture.channelId,
        location: { chatId: fixture.task.chatId, kind: 'task', taskId: fixture.task.id },
        notification: 'waiting',
    });
});
