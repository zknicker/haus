import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CloudAgentWork } from '@haus/api';
import { reportingWorkIds } from '../src/github/pull-request-refresh.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { cloudAgentPullRequestsTable } from '../src/postgres/schema.ts';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('work reads the live reading while its Run keeps the snapshot it reported', async () => {
    const { work, runId } = await reportPullRequest();
    await fixture.harness.sql`
        update cloud_agent_pull_requests set state = 'merged', source = 'github'
    `;
    const listed = await fixture.owner.trpc.cloudAgentWork.listForChat.query({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
    });

    expect(listed.find((row) => row.work.id === work.id)?.work.pullRequest).toMatchObject({
        checks: 'unknown',
        number: 12,
        repository: 'haus/haus',
        state: 'merged',
    });
    expect((await fixture.readBranches(runId))[0]?.pullRequest?.state).toBe('draft');

    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        const [row] = await connection.db.select().from(cloudAgentPullRequestsTable);
        expect(row && (await reportingWorkIds(connection.db, row))).toEqual([work.id]);
    } finally {
        await connection.close();
    }
});

test('migration 0113 backfills a reading from the stored Run snapshot', async () => {
    const migration = await readFile(
        join(import.meta.dir, '../drizzle/postgres/0113_cloud-agent-pull-requests.sql'),
        'utf8'
    );
    await fixture.harness.sql`delete from cloud_agent_pull_requests`;
    await fixture.harness.sql.unsafe(migration.split('--> statement-breakpoint').at(-1) as string);

    const [seeded] = (await fixture.harness.sql`
        select * from cloud_agent_pull_requests
    `) as Record<string, unknown>[];
    expect(seeded).toMatchObject({
        additions: 34,
        number: 12,
        repository: 'haus/haus',
        source: 'computer',
        state: 'draft',
    });
    expect(seeded?.refresh_requested_at).not.toBeNull();
});

async function reportPullRequest() {
    const runner = await fixture.mintRunner('run_cloud_pull_request');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-pull' }));
    const work = created.body.work as CloudAgentWork;
    const runId = created.body.runId as string;
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
                runId,
                status: 'running',
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitFor(async () => (await fixture.readBranches(runId))[0]?.pullRequest);
    socket.close();
    return { runId, work };
}
