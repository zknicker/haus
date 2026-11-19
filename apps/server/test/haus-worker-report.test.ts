import { expect, test } from 'bun:test';
import type { Worker } from '@haus/api';
import { agentWorkerListReceiptSchema } from '@haus/api';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { readWorkerAttentions } from '../src/workers/read-worker-attentions.ts';
import { findWorker } from '../src/workers/worker-shape.ts';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test("a Run's full report persists and round-trips through findWorker", async () => {
    const runner = await fixture.mintRunner('run_cloud_report');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-report' }));
    const work = created.body.worker as Worker;
    const turnId = created.body.turnId as string;
    const report = { clipped: false, text: 'Fixed the flaky test and opened a pull request.' };

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T12:05:00.000Z',
                report,
                turnId,
                status: 'completed',
                summary: 'Opened a pull request.',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'completed');
    socket.close();

    expect(await fixture.readRun(turnId)).toMatchObject({ report });

    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        const projected = await findWorker(connection.db, fixture.serverId, work.id);
        expect(projected?.turns[0]?.report).toEqual(report);
    } finally {
        await connection.close();
    }
});

test('a drained attention reads hasFullReport from whether the stored report outgrew the summary', async () => {
    const runner = await fixture.mintRunner('run_cloud_report_attention');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-report-attention' })
    );
    const work = created.body.worker as Worker;
    const turnId = created.body.turnId as string;

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T12:05:00.000Z',
                // The report is longer than the summary it was cut from.
                report: { clipped: false, text: 'Opened a pull request. Also ran the full suite.' },
                turnId,
                status: 'completed',
                summary: 'Opened a pull request.',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'completed');
    socket.close();

    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        const attentions = await readWorkerAttentions(connection.db, fixture.serverId, [turnId]);
        expect(attentions.get(turnId)?.hasFullReport).toBe(true);
    } finally {
        await connection.close();
    }
});

test('a drained attention reads hasFullReport as false when the report is no longer than the summary', async () => {
    const runner = await fixture.mintRunner('run_cloud_report_no_more');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-report-no-more' })
    );
    const work = created.body.worker as Worker;
    const turnId = created.body.turnId as string;
    const text = 'Opened a pull request.';

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T12:05:00.000Z',
                // `summary` is exactly `report.text` here: nothing more to read.
                report: { clipped: false, text },
                turnId,
                status: 'completed',
                summary: text,
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'completed');
    socket.close();

    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        const attentions = await readWorkerAttentions(connection.db, fixture.serverId, [turnId]);
        expect(attentions.get(turnId)?.hasFullReport).toBe(false);
    } finally {
        await connection.close();
    }
});

test('a routine list-all fetch strips report text; a single-work fetch keeps it', async () => {
    const runner = await fixture.mintRunner('run_cloud_report_list_strip');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-report-list-strip' })
    );
    const work = created.body.worker as Worker;
    const turnId = created.body.turnId as string;
    const report = { clipped: false, text: 'Opened a pull request. Ran the full suite too.' };

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T12:05:00.000Z',
                report,
                turnId,
                status: 'completed',
                summary: 'Opened a pull request.',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'completed');
    socket.close();

    const listedAll = await fetchWorks(runner.token);
    expect(listedAll.find((row) => row.id === work.id)?.turns[0]?.report).toBeNull();

    const listedOne = await fetchWorks(runner.token, work.id);
    expect(listedOne[0]?.turns[0]?.report).toEqual(report);
});

async function fetchWorks(token: string, workerId?: string) {
    const url = new URL('/api/agent/workers', fixture.harness.url);
    if (workerId) {
        url.searchParams.set('workerId', workerId);
    }
    const listed = agentWorkerListReceiptSchema.parse(
        await (await fetch(url, { headers: { authorization: `Bearer ${token}` } })).json()
    );
    return listed.workers;
}

test(
    'a version-skew observation with an unrecognized key still applies, instead of the whole ' +
        'observation being dropped (guards the .strict() removal this PR depends on: a newer ' +
        'Computer sending a field this pinned Server build does not know yet must not lose the ' +
        'rest of the observation)',
    async () => {
        const runner = await fixture.mintRunner('run_cloud_version_skew');
        const created = await fixture.postStart(
            runner,
            fixture.startBody({ nonce: 'cloud-version-skew' })
        );
        const work = created.body.worker as Worker;
        const turnId = created.body.turnId as string;

        const socket = await fixture.attachComputer();
        socket.send(
            JSON.stringify({
                observation: {
                    // A field a future Computer sends that this Server's pinned
                    // @haus/api build has never heard of.
                    futureProviderField: 'a-value-this-server-does-not-model-yet',
                    observedAt: '2026-09-04T12:05:00.000Z',
                    rawStatus: 'FINISHED',
                    turnId,
                    status: 'completed',
                    summary: 'Opened a pull request.',
                    workerId: work.id,
                },
                type: 'worker-observation',
            })
        );
        await fixture.waitForWorkStatus(work.id, 'completed');
        socket.close();

        // Every recognized field on the same frame was still applied: the
        // unrecognized key cost nothing beyond itself.
        expect(await fixture.readRun(turnId)).toMatchObject({
            raw_status: 'FINISHED',
            status: 'completed',
            summary: 'Opened a pull request.',
        });
    }
);
