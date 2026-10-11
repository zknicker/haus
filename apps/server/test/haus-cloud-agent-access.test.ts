import { expect, test } from 'bun:test';
import type { CloudAgentWork } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('the delegating Agent and an Admin cancel; an ordinary Member cannot', async () => {
    const runner = await fixture.mintRunner('run_cloud_cancel');
    const agentCancelled = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-cancel-agent' })
    );
    const agentWork = agentCancelled.body.work as CloudAgentWork;
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
    const humanWork = humanCancelled.body.work as CloudAgentWork;
    await expect(
        fixture.peer.trpc.cloudAgentWork.cancel.mutate({
            serverId: fixture.serverId,
            workId: humanWork.id,
        })
    ).rejects.toThrow(/Owners and Admins/i);
    await expect(
        fixture.owner.trpc.cloudAgentWork.cancel.mutate({
            serverId: fixture.serverId,
            workId: humanWork.id,
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
                runId: humanCancelled.body.runId,
                status: 'cancelled',
                workId: humanWork.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitForWorkStatus(humanWork.id, 'cancelled');
    await expect(
        fixture.owner.trpc.cloudAgentWork.cancel.mutate({
            serverId: fixture.serverId,
            workId: humanWork.id,
        })
    ).rejects.toThrow(/already settled/i);
    expect((await fixture.postCancel(runner, humanWork.id)).status).toBe(409);
    socket.close();
});

test('listActive shows queued and running work to members with Chat access only', async () => {
    const runner = await fixture.mintRunner('run_cloud_list');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-list' }));
    const work = created.body.work as CloudAgentWork;

    const forOwner = (
        await fixture.owner.trpc.cloudAgentWork.listActive.query({ serverId: fixture.serverId })
    ).find((row) => row.work.id === work.id);
    expect(forOwner).toMatchObject({
        chatKind: 'channel',
        chatName: 'product',
        chatPeerUserId: null,
        conversationChatId: fixture.channelId,
        message: { author: { kind: 'agent' }, body: { kind: 'cloud-agent-work' } },
        threadAnchorMessage: null,
        threadChatId: `cht_thr_${(created.body.messageId as string).slice('msg_'.length)}`,
        work: { status: 'queued' },
    });
    await expect(
        fixture.outsider.trpc.cloudAgentWork.listActive.query({ serverId: fixture.serverId })
    ).resolves.toEqual([]);

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T14:00:00.000Z',
                runId: created.body.runId,
                status: 'failed',
                summary: 'The provider refused the launch.',
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'failed');
    expect(
        (
            await fixture.owner.trpc.cloudAgentWork.listActive.query({ serverId: fixture.serverId })
        ).map((row) => row.work.id)
    ).not.toContain(work.id);
    const history = await fixture.owner.trpc.cloudAgentWork.listForChat.query({
        serverId: fixture.serverId,
        chatId: fixture.channelId,
    });
    expect(history.find((row) => row.work.id === work.id)).toMatchObject({
        anchorMessageId: work.messageId,
        work: { status: 'failed' },
    });
    await expect(
        fixture.outsider.trpc.cloudAgentWork.listForChat.query({
            serverId: fixture.serverId,
            chatId: fixture.channelId,
        })
    ).rejects.toThrow();
    socket.close();
});

test('a Task Thread lists every delegation under its anchor without leaking other work', async () => {
    const task = await fixture.owner.trpc.task.create.mutate({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
        content: 'Review both halves',
        nonce: 'cloud-multiple-task',
    });
    const runner = await fixture.mintRunner('run_cloud_multiple');
    const first = await fixture.postStart(
        runner,
        fixture.startBody({
            target: `#product:${task.task.messageId}`,
            nonce: 'cloud-multiple-one',
            title: 'First review',
        })
    );
    const second = await fixture.postStart(
        runner,
        fixture.startBody({
            target: `#product:${task.task.messageId}`,
            nonce: 'cloud-multiple-two',
            title: 'Second review',
        })
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const rows = await fixture.owner.trpc.cloudAgentWork.listForChat.query({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
    });
    expect(
        rows
            .filter((row) => row.anchorMessageId === task.task.messageId)
            .map((row) => row.work.title)
    ).toEqual(['First review', 'Second review']);
    await expect(
        fixture.outsider.trpc.cloudAgentWork.listForChat.query({
            chatId: first.body.chatId ?? '',
            serverId: fixture.serverId,
        })
    ).rejects.toThrow();
});

test('reconnect hands the Computer every non-terminal work it still owns', async () => {
    const runner = await fixture.mintRunner('run_cloud_reconcile');
    // The Task created above posted in #product; a launch there must have read it.
    await fixture.readTarget(runner, '#product');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-reconcile' })
    );
    const work = created.body.work as CloudAgentWork;
    await fixture.postCancel(runner, work.id);

    const socket = new WebSocket(fixture.computerSocketUrl());
    await fixture.opened(socket);
    const frames: Array<{ type?: string; work?: unknown[] }> = [];
    socket.addEventListener('message', (event) => {
        frames.push(JSON.parse(String(event.data)));
    });
    socket.send(JSON.stringify(fixture.bootstrapFrame()));

    const reconcile = await fixture.waitFor(() =>
        frames.find((frame) => frame.type === 'cloud-agent-reconcile')
    );
    expect(reconcile.work).toContainEqual({
        cancelRequested: true,
        provider: 'cursor',
        providerAgentId: null,
        providerRunId: null,
        runId: created.body.runId,
        status: 'queued',
        workId: work.id,
    });
    socket.close();
});
