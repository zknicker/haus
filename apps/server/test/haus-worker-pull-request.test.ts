import { expect, test } from 'bun:test';
import type { Worker } from '@haus/api';
import { reportingWorkIds } from '../src/github/pull-request-refresh.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { pullRequestReadingsTable } from '../src/postgres/schema.ts';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test('work reads the live reading while its Run keeps the snapshot it reported', async () => {
    const { work, turnId } = await reportPullRequest();
    await fixture.harness.sql`
        update pull_request_readings set state = 'merged', source = 'github'
    `;
    const listed = await fixture.owner.trpc.worker.listForChat.query({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
    });

    expect(listed.find((row) => row.worker.id === work.id)?.worker.pullRequest).toMatchObject({
        checks: 'unknown',
        number: 12,
        repository: 'haus/haus',
        state: 'merged',
    });
    expect((await fixture.readBranches(turnId))[0]?.pullRequest?.state).toBe('draft');

    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        const [row] = await connection.db.select().from(pullRequestReadingsTable);
        expect(row && (await reportingWorkIds(connection.db, row))).toEqual([work.id]);
    } finally {
        await connection.close();
    }
});

async function reportPullRequest() {
    const runner = await fixture.mintRunner('run_cloud_pull_request');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-pull' }));
    const work = created.body.worker as Worker;
    const turnId = created.body.turnId as string;
    const socket = await fixture.attachComputer();
    socket.send(
        JSON.stringify({
            observation: {
                branches: [
                    {
                        branch: 'cloud/fix-flake',
                        pullRequest: {
                            additions: 34,
                            changedFiles: 1,
                            deletions: 0,
                            number: 12,
                            observedAt: '2026-09-04T12:04:00.000Z',
                            state: 'draft',
                        },
                        pullRequestUrl: 'https://github.com/haus/haus/pull/12',
                        repository: 'haus/haus',
                    },
                ],
                observedAt: '2026-09-04T12:04:00.000Z',
                turnId,
                status: 'running',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitFor(async () => (await fixture.readBranches(turnId))[0]?.pullRequest);
    socket.close();
    return { turnId, work };
}
