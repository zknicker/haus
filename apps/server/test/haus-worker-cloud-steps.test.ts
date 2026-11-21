import { expect, test } from 'bun:test';
import type { Worker } from '@haus/api';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test("a cloud turn's observed steps land on the turn the Worker shows", async () => {
    const runner = await fixture.mintRunner('run_cloud_steps');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-steps' }));
    const work = created.body.worker as Worker;
    const turnId = created.turnId as string;
    const steps = [
        {
            additions: null,
            deletions: null,
            kind: 'run',
            label: 'bun test',
            output: '1 fail',
            state: 'failed',
        },
    ];
    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T12:00:00.000Z',
                providerAgentId: 'bc_one',
                status: 'running',
                steps,
                turnId,
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    const read = () =>
        fixture.owner.trpc.worker.get.query({ serverId: fixture.serverId, workerId: work.id });
    await fixture.waitFor(async () => (await read()).turns[0]?.steps);
    socket.close();

    expect((await read()).turns[0]?.steps).toEqual(steps);
});
