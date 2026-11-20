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
    const observe = (workerId: string, turnId: string, status: string, observedAt: string) =>
        socket.send(
            JSON.stringify({
                observation: {
                    observedAt,
                    providerAgentId: `cursor_${workerId.slice(-6)}`,
                    turnId,
                    status,
                    workerId,
                },
                type: 'worker-observation',
            })
        );
    observe(active.worker.id, active.turnId, 'running', '2026-10-11T12:00:00.000Z');
    observe(settled.worker.id, settled.turnId, 'completed', '2026-10-11T12:00:00.000Z');
    await fixture.waitForWorkStatus(active.worker.id, 'running');
    await fixture.waitForWorkStatus(settled.worker.id, 'completed');
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

    const workerIds = [active.worker.id, settled.worker.id].sort();
    const works = (await fixture.harness.sql`
        select id, carrier_computer_id as computer_id, status from workers
        where server_id = ${fixture.serverId} order by id
    `) as { computer_id: string; id: string; status: string }[];
    expect(works.map((row) => row.id)).toEqual(workerIds);
    expect(works.every((row) => row.computer_id === fixture.computerId)).toBe(true);
    expect(await fixture.readRun(active.turnId)).toMatchObject({ status: 'running' });
    expect(await fixture.readRun(settled.turnId)).toMatchObject({ status: 'completed' });
    const links = (await fixture.harness.sql`
        select worker_id as work_id from worker_history_links
        where server_id = ${fixture.serverId} order by worker_id
    `) as { work_id: string }[];
    expect(links.map((row) => row.work_id)).toEqual(workerIds);

    const transcript = await fixture.owner.trpc.chat.messages.query({
        chatId: fixture.task.chatId,
        serverId: fixture.serverId,
    });
    const cards = transcript.messages.flatMap((message) => message.workers.map((work) => work.id));
    expect(cards.sort()).toEqual(workerIds);

    const listed = await fixture.owner.trpc.worker.listActive.query({
        serverId: fixture.serverId,
    });
    expect(listed.map((row) => row.worker.id)).toEqual([active.worker.id]);
    const forChat = await fixture.owner.trpc.worker.listForChat.query({
        chatId: fixture.task.chatId,
        serverId: fixture.serverId,
    });
    expect(forChat.map((row) => row.worker.id).sort()).toEqual(workerIds);

    await expect(
        fixture.owner.trpc.worker.stop.mutate({
            serverId: fixture.serverId,
            workerId: active.worker.id,
        })
    ).rejects.toThrow(/Computer that launched this Worker was removed/);
    await expect(
        fixture.owner.trpc.worker.stop.mutate({
            serverId: fixture.serverId,
            workerId: settled.worker.id,
        })
    ).rejects.toThrow(/already settled/i);
    expect(await fixture.readWork(active.worker.id)).toMatchObject({
        stop_requested_by_user_id: null,
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
                { nonce: 'removal-send', workerId: active.worker.id }
            )
        ).rejects.toBeInstanceOf(WorkerComputerRemovedError);
    } finally {
        await connection.close();
    }
    const runs = (await fixture.harness.sql`
        select count(*)::int as total from worker_turns where worker_id = ${active.worker.id}
    `) as { total: number }[];
    expect(runs).toEqual([{ total: 1 }]);
});
