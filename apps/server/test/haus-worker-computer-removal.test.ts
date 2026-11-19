import { expect, test } from 'bun:test';
import { agentWorkerReceiptSchema } from '@haus/api';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { WorkerComputerRemovedError } from '../src/workers/errors.ts';
import { sendWorker } from '../src/workers/send-worker.ts';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test('removing a Computer keeps its Worker, Runs, links, and cards, and refuses cancel and send', async () => {
    const runner = await fixture.mintRunner('run_computer_removal');
    const active = agentWorkerReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'removal-active' }))).body
    );
    const settled = agentWorkerReceiptSchema.parse(
        (
            await fixture.postStart(
                runner,
                fixture.startBody({ nonce: 'removal-settled', title: 'Settled work' })
            )
        ).body
    );
    const socket = await fixture.attachComputer();
    const observe = (workId: string, runId: string, status: string, observedAt: string) =>
        socket.send(
            JSON.stringify({
                observation: {
                    observedAt,
                    providerAgentId: `cursor_${workId.slice(-6)}`,
                    runId,
                    status,
                    workId,
                },
                type: 'worker-observation',
            })
        );
    observe(active.work.id, active.runId, 'running', '2026-10-11T12:00:00.000Z');
    observe(settled.work.id, settled.runId, 'completed', '2026-10-11T12:00:00.000Z');
    await fixture.waitForWorkStatus(active.work.id, 'running');
    await fixture.waitForWorkStatus(settled.work.id, 'completed');
    socket.close();

    await fixture.owner.trpc.agent.delete.mutate({
        agentId: fixture.orbitAgentId,
        confirmation: 'Orbit',
        serverId: fixture.serverId,
    });
    await fixture.owner.trpc.computer.remove.mutate({
        computerId: fixture.computerId,
        confirmation: 'REMOVE',
        serverId: fixture.serverId,
    });

    const workIds = [active.work.id, settled.work.id].sort();
    const works = (await fixture.harness.sql`
        select id, computer_id, status from cloud_agent_work
        where server_id = ${fixture.serverId} order by id
    `) as { computer_id: string; id: string; status: string }[];
    expect(works.map((row) => row.id)).toEqual(workIds);
    expect(works.every((row) => row.computer_id === fixture.computerId)).toBe(true);
    expect(await fixture.readRun(active.runId)).toMatchObject({ status: 'running' });
    expect(await fixture.readRun(settled.runId)).toMatchObject({ status: 'completed' });
    const links = (await fixture.harness.sql`
        select work_id from cloud_agent_work_links
        where server_id = ${fixture.serverId} order by work_id
    `) as { work_id: string }[];
    expect(links.map((row) => row.work_id)).toEqual(workIds);

    const transcript = await fixture.owner.trpc.chat.messages.query({
        chatId: fixture.task.chatId,
        serverId: fixture.serverId,
    });
    const cards = transcript.messages.flatMap((message) => message.worker.map((work) => work.id));
    expect(cards.sort()).toEqual(workIds);

    const listed = await fixture.owner.trpc.worker.listActive.query({
        serverId: fixture.serverId,
    });
    expect(listed.map((row) => row.work.id)).toEqual([active.work.id]);
    const forChat = await fixture.owner.trpc.worker.listForChat.query({
        chatId: fixture.task.chatId,
        serverId: fixture.serverId,
    });
    expect(forChat.map((row) => row.work.id).sort()).toEqual(workIds);

    await expect(
        fixture.owner.trpc.worker.cancel.mutate({
            serverId: fixture.serverId,
            workId: active.work.id,
        })
    ).rejects.toThrow(/Computer that launched this Worker was removed/);
    await expect(
        fixture.owner.trpc.worker.cancel.mutate({
            serverId: fixture.serverId,
            workId: settled.work.id,
        })
    ).rejects.toThrow(/already settled/i);
    expect(await fixture.readWork(active.work.id)).toMatchObject({
        cancel_requested_by_user_id: null,
        status: 'running',
    });

    // The delegating Agent is retired, so no runner can reach `send`; drive it
    // directly as if that Agent now ran on another Computer.
    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        await expect(
            sendWorker(
                connection.db,
                {
                    agentId: fixture.orbitAgentId,
                    capabilities: [],
                    chatId: fixture.channelId,
                    computerId: `cmp_${'d'.repeat(16)}`,
                    runId: 'run_computer_removal_send',
                    runnerId: 'rnr_computer_removal',
                    serverId: fixture.serverId,
                },
                { nonce: 'removal-send', workId: active.work.id }
            )
        ).rejects.toBeInstanceOf(WorkerComputerRemovedError);
    } finally {
        await connection.close();
    }
    const runs = (await fixture.harness.sql`
        select count(*)::int as total from cloud_agent_runs where work_id = ${active.work.id}
    `) as { total: number }[];
    expect(runs).toEqual([{ total: 1 }]);
});
