import { expect, test } from 'bun:test';
import type { Worker } from '@haus/api';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test('one Worker writes its Message in its Task, record, first Run, and events', async () => {
    const runner = await fixture.mintRunner('run_cloud_create');
    const realtime = captureAllTopics();
    const taskChatId = fixture.task.chatId;

    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-create', content: 'Handing @ada the work in #product.' })
    );
    expect(created.status).toBe(200);
    const work = created.body.worker as Worker;
    expect(created.body).toMatchObject({
        chatId: taskChatId,
        idempotent: false,
        target: `task:${fixture.task.key}`,
        worker: {
            agentId: fixture.orbitAgentId,
            cancelRequestedAt: null,
            chatId: taskChatId,
            computerId: fixture.computerId,
            provider: 'cursor',
            providerAgentId: null,
            repository: 'haus/haus',
            startingRef: 'main',
            status: 'queued',
            terminalAt: null,
            title: 'Fix the flaky delivery test',
        },
    });
    expect(work.turns).toHaveLength(1);
    expect(work.turns[0]).toMatchObject({ turnId: created.body.turnId, status: 'queued' });

    const children = (await fixture.harness.sql`
        select id from tasks where origin_message_id = ${created.body.messageId ?? ''}
    `) as { id: string }[];
    expect(children).toEqual([]);

    const events = await publishedSince(realtime, fixture.serverId);
    realtime.stop();
    expect(events.map((event) => event.type)).toEqual([
        'message.created',
        'task.updated',
        'worker.updated',
    ]);
    expect(events[2]).toEqual({
        chatId: taskChatId,
        messageId: created.body.messageId,
        serverId: fixture.serverId,
        taskId: fixture.task.id,
        type: 'worker.updated',
        workerId: work.id,
    });

    const replay = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-create', content: 'Handing @ada the work in #product.' })
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ idempotent: true, worker: { id: work.id } });
    expect(await fixture.countWork()).toBe(1);

    // The launch Message is ordinary text that links its work (ADR 0044).
    const history = await fixture.owner.trpc.chat.messages.query({
        chatId: taskChatId,
        serverId: fixture.serverId,
    });
    const launch = history.messages.find((message) => message.id === created.body.messageId);
    expect(launch).toMatchObject({
        body: { kind: 'text' },
        content: `Handing [@ada](user://${fixture.ownerUserId}) the work in [#product](chat://${fixture.channelId}).\n\n[Fix the flaky delivery test](worker://${work.id})`,
    });
    expect(launch?.workers.map((linked) => linked.id)).toEqual([work.id]);
});

test('a launch that fails validation creates nothing', async () => {
    const runner = await fixture.mintRunner('run_cloud_invalid');
    const before = await fixture.countWork();

    expect(
        (
            await fixture.postStart(
                runner,
                fixture.startBody({ nonce: 'bad-repo', repository: 'haus' })
            )
        ).status
    ).toBe(400);
    expect(
        (
            await fixture.postStart(
                runner,
                fixture.startBody({ nonce: 'bad-title', title: 'a'.repeat(121) })
            )
        ).status
    ).toBe(400);
    expect(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'bad-say', content: '' })))
            .status
    ).toBe(400);
    const unknownTask = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'bad-task', task: 'ZZZ-404' })
    );
    expect(unknownTask.status).toBe(400);
    expect(unknownTask.body.code).toBe('WORKER_TASK_REQUIRED');
    expect((await fixture.postStart(null, fixture.startBody({ nonce: 'no-runner' }))).status).toBe(
        401
    );

    // A different work under a used nonce is a conflict, not a second Message.
    expect(
        (
            await fixture.postStart(
                runner,
                fixture.startBody({ nonce: 'cloud-create', title: 'Something else' })
            )
        ).status
    ).toBe(409);
    expect(await fixture.countWork()).toBe(before);
});

test('reference expansion rejects oversized content before creating work', async () => {
    const runner = await fixture.mintRunner('run_cloud_expansion');
    const before = await fixture.countWork();
    const result = await fixture.postStart(
        runner,
        fixture.startBody({
            nonce: 'cloud-expansion',
            content: `${'x'.repeat(31_995)} @ada`,
        })
    );
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('INVALID_ARG');
    expect(await fixture.countWork()).toBe(before);
});
