import { expect, test } from 'bun:test';

import type { CloudAgentWork } from '@haus/api';
import { agentCloudAgentListReceiptSchema } from '@haus/api';

import { findCloudAgentWork } from '../src/cloud-agents/cloud-agent-shape.ts';
import { readCloudAgentWorkAttentions } from '../src/cloud-agents/read-cloud-agent-work-attentions.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test("a Run's full report persists and round-trips through findCloudAgentWork", async () => {
    const runner = await fixture.mintRunner('run_cloud_report');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-report' }));
    const work = created.body.work as CloudAgentWork;
    const runId = created.body.runId as string;
    const report = { clipped: false, text: 'Fixed the flaky test and opened a pull request.' };

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T12:05:00.000Z',
                report,
                runId,
                status: 'completed',
                summary: 'Opened a pull request.',
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'completed');
    socket.close();

    expect(await fixture.readRun(runId)).toMatchObject({ report });

    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        const projected = await findCloudAgentWork(connection.db, fixture.serverId, work.id);
        expect(projected?.runs[0]?.report).toEqual(report);
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
    const work = created.body.work as CloudAgentWork;
    const runId = created.body.runId as string;

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T12:05:00.000Z',
                // The report is longer than the summary it was cut from.
                report: { clipped: false, text: 'Opened a pull request. Also ran the full suite.' },
                runId,
                status: 'completed',
                summary: 'Opened a pull request.',
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'completed');
    socket.close();

    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        const attentions = await readCloudAgentWorkAttentions(connection.db, fixture.serverId, [
            runId,
        ]);
        expect(attentions.get(runId)?.hasFullReport).toBe(true);
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
    const work = created.body.work as CloudAgentWork;
    const runId = created.body.runId as string;
    const text = 'Opened a pull request.';

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T12:05:00.000Z',
                // `summary` is exactly `report.text` here: nothing more to read.
                report: { clipped: false, text },
                runId,
                status: 'completed',
                summary: text,
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'completed');
    socket.close();

    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        const attentions = await readCloudAgentWorkAttentions(connection.db, fixture.serverId, [
            runId,
        ]);
        expect(attentions.get(runId)?.hasFullReport).toBe(false);
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
    const work = created.body.work as CloudAgentWork;
    const runId = created.body.runId as string;
    const report = { clipped: false, text: 'Opened a pull request. Ran the full suite too.' };

    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T12:05:00.000Z',
                report,
                runId,
                status: 'completed',
                summary: 'Opened a pull request.',
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'completed');
    socket.close();

    const listedAll = await fetchWorks(runner.token);
    expect(listedAll.find((row) => row.id === work.id)?.runs[0]?.report).toBeNull();

    const listedOne = await fetchWorks(runner.token, work.id);
    expect(listedOne[0]?.runs[0]?.report).toEqual(report);
});

async function fetchWorks(token: string, workId?: string) {
    const url = new URL('/api/agent/cloud-agents', fixture.harness.url);
    if (workId) {
        url.searchParams.set('workId', workId);
    }
    const listed = agentCloudAgentListReceiptSchema.parse(
        await (await fetch(url, { headers: { authorization: `Bearer ${token}` } })).json()
    );
    return listed.works;
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
        const work = created.body.work as CloudAgentWork;
        const runId = created.body.runId as string;

        const socket = await fixture.attachComputer();
        socket.send(
            JSON.stringify({
                observation: {
                    // A field a future Computer sends that this Server's pinned
                    // @haus/api build has never heard of.
                    futureProviderField: 'a-value-this-server-does-not-model-yet',
                    observedAt: '2026-09-04T12:05:00.000Z',
                    rawStatus: 'FINISHED',
                    runId,
                    status: 'completed',
                    summary: 'Opened a pull request.',
                    workId: work.id,
                },
                type: 'cloud-agent-observation',
            })
        );
        await fixture.waitForWorkStatus(work.id, 'completed');
        socket.close();

        // Every recognized field on the same frame was still applied: the
        // unrecognized key cost nothing beyond itself.
        expect(await fixture.readRun(runId)).toMatchObject({
            raw_status: 'FINISHED',
            status: 'completed',
            summary: 'Opened a pull request.',
        });
    }
);
