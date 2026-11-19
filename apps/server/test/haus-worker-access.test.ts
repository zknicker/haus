import { expect, test } from 'bun:test';
import type { Worker } from '@haus/api';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test('the delegating Agent and an Admin cancel; an ordinary Member cannot', async () => {
    const runner = await fixture.mintRunner('run_cloud_cancel');
    const agentCancelled = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-cancel-agent' })
    );
    const agentWork = agentCancelled.body.worker as Worker;
    const byAgent = await fixture.postCancel(runner, agentWork.id);
    expect(byAgent.status).toBe(200);
    expect(await fixture.readWork(agentWork.id)).toMatchObject({
        cancel_requested_by_agent_id: fixture.orbitAgentId,
        cancel_requested_by_user_id: null,
        status: 'queued',
    });

    const humanCancelled = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-cancel-human' })
    );
    const humanWork = humanCancelled.body.worker as Worker;
    await expect(
        fixture.peer.trpc.worker.stop.mutate({
            serverId: fixture.serverId,
            workerId: humanWork.id,
        })
    ).rejects.toThrow(/Owners and Admins/i);
    await expect(
        fixture.owner.trpc.worker.stop.mutate({
            serverId: fixture.serverId,
            workerId: humanWork.id,
        })
    ).resolves.toEqual({ cancelRequested: true });
    expect(await fixture.readWork(humanWork.id)).toMatchObject({
        cancel_requested_by_agent_id: null,
        cancel_requested_by_user_id: fixture.ownerUserId,
    });

    // Cancelling settled work is a conflict, not a silent no-op.
    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T13:00:00.000Z',
                turnId: humanCancelled.body.turnId,
                status: 'cancelled',
                workerId: humanWork.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitForWorkStatus(humanWork.id, 'cancelled');
    await expect(
        fixture.owner.trpc.worker.stop.mutate({
            serverId: fixture.serverId,
            workerId: humanWork.id,
        })
    ).rejects.toThrow(/already settled/i);
    expect((await fixture.postCancel(runner, humanWork.id)).status).toBe(409);
    socket.close();
});

test('listActive shows queued and running work to members with Chat access only', async () => {
    const runner = await fixture.mintRunner('run_cloud_list');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-list' }));
    const work = created.body.worker as Worker;

    const forOwner = (
        await fixture.owner.trpc.worker.listActive.query({ serverId: fixture.serverId })
    ).find((row) => row.worker.id === work.id);
    expect(forOwner).toMatchObject({
        agentName: 'Orbit',
        chatKind: 'channel',
        chatName: 'product',
        chatPeerUserId: null,
        conversationChatId: fixture.task.chatId,
        location: {
            chatId: fixture.task.chatId,
            kind: 'message',
            messageId: created.body.messageId,
        },
        worker: { status: 'queued' },
    });
    expect(Object.keys(forOwner ?? {}).sort()).toEqual([
        'agentName',
        'chatKind',
        'chatName',
        'chatPeerUserId',
        'conversationChatId',
        'location',
        'taskId',
        'taskKey',
        'worker',
    ]);
    expect(forOwner).toMatchObject({ taskId: fixture.task.id, taskKey: fixture.task.key });
    await expect(
        fixture.outsider.trpc.worker.listActive.query({ serverId: fixture.serverId })
    ).resolves.toEqual([]);

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T14:00:00.000Z',
                turnId: created.body.turnId,
                status: 'failed',
                summary: 'The provider refused the launch.',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'failed');
    expect(
        (await fixture.owner.trpc.worker.listActive.query({ serverId: fixture.serverId })).map(
            (row) => row.worker.id
        )
    ).not.toContain(work.id);
    const history = await fixture.owner.trpc.worker.listForChat.query({
        serverId: fixture.serverId,
        chatId: fixture.task.chatId,
    });
    expect(history.find((row) => row.worker.id === work.id)).toMatchObject({
        anchorMessageId: work.messageId,
        worker: { status: 'failed' },
    });
    await expect(
        fixture.outsider.trpc.worker.listForChat.query({
            serverId: fixture.serverId,
            chatId: fixture.task.chatId,
        })
    ).rejects.toThrow();
    socket.close();
});

test('a Task lists every Worker attached to it without leaking other work', async () => {
    const runner = await fixture.mintRunner('run_cloud_multiple');
    await fixture.readTarget(runner, `task:${fixture.task.key}`);
    const first = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-multiple-one', title: 'First review' })
    );
    const second = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-multiple-two', title: 'Second review' })
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const rows = await fixture.owner.trpc.worker.listForChat.query({
        chatId: fixture.task.chatId,
        serverId: fixture.serverId,
    });
    const titles = rows.map((row) => row.worker.title);
    expect(titles).toContain('First review');
    expect(titles).toContain('Second review');
    await expect(
        fixture.outsider.trpc.worker.listForChat.query({
            chatId: first.body.chatId ?? '',
            serverId: fixture.serverId,
        })
    ).rejects.toThrow();
});

test('reconnect hands the Computer every non-terminal work it still owns', async () => {
    const runner = await fixture.mintRunner('run_cloud_reconcile');
    // The Claim created above posted in #product; a launch there must have read it.
    await fixture.readTarget(runner, '#product');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-reconcile' })
    );
    const work = created.body.worker as Worker;
    await fixture.postCancel(runner, work.id);

    const socket = new WebSocket(fixture.computerSocketUrl());
    await fixture.opened(socket);
    const frames: Array<{ type?: string; work?: unknown[] }> = [];
    socket.addEventListener('message', (event) => {
        frames.push(JSON.parse(String(event.data)));
    });
    socket.send(JSON.stringify(fixture.bootstrapFrame()));

    const reconcile = await fixture.waitFor(() =>
        frames.find((frame) => frame.type === 'worker-reconcile')
    );
    expect(reconcile.workers).toContainEqual({
        cancelRequested: true,
        provider: 'cursor',
        providerAgentId: null,
        providerRunId: null,
        turnId: created.body.turnId,
        status: 'queued',
        workerId: work.id,
    });
    socket.close();
});
