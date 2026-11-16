import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { makeTestRuntime } from '@haus/effect';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { seedPullRequestReadings } from '../src/cloud-agents/pull-request-readings.ts';
import { ingestGithubDelivery } from '../src/github/delivery-ingest.ts';
import type { GithubApp } from '../src/github/github-app.ts';
import { refreshPullRequestReadings } from '../src/github/pull-request-refresh.ts';
import { markGithubTriggersProblem } from '../src/github/trigger-problems.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { ServerPostCommitWork } from '../src/server-post-commit-work.ts';
import { TriggerRateLimiter } from '../src/triggers/trigger-rate-limit.ts';
import { checkSuitePayload, pullRequestPayload } from './github-delivery-fixtures.ts';
import { createFakeGithub } from './github-fake.ts';
import { type GithubTriggerWorld, seedGithubTriggerWorld } from './github-trigger-seed.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const url = 'https://github.com/Acme/Api/pull/1423';
const headSha = 'ec26c3e57ca3a959ca5aad62de7213c562f8c821';
const runtime = makeTestRuntime();

let app: GithubApp;
let connection: HausConnection;
let harness: HausServerHarness;
let requests: string[];
let respond: (path: string) => Response;
let world: GithubTriggerWorld;

beforeAll(async () => {
    harness = await startHausServerHarness();
    world = await seedGithubTriggerWorld(harness, 'pull-request-readings');
    connection = await connectHausDatabase(harness.databaseUrl);
    const fake = await createFakeGithub();
    app = {
        ...fake.app,
        transport: {
            fetch: ((input: RequestInfo | URL) => {
                const path = new URL(String(input)).pathname;
                requests.push(path);
                return Promise.resolve(respond(path));
            }) as typeof fetch,
        },
    };
});

beforeEach(async () => {
    requests = [];
    respond = mergedPullRequest;
    await harness.sql`delete from cloud_agent_pull_requests`;
    await seedPullRequestReadings(connection.db, {
        branches: [
            {
                branch: 'fix-login',
                pullRequest: {
                    additions: 4,
                    changedFiles: 1,
                    deletions: 2,
                    number: 1423,
                    observedAt: '2026-11-01T12:00:00.000Z',
                    state: 'open',
                },
                pullRequestUrl: url,
                repository: 'github.com/acme/api',
            },
        ],
        now: new Date('2026-11-01T12:00:00.000Z'),
        serverId: world.serverId,
    });
});

afterAll(async () => {
    world?.owner.close();
    await connection?.close();
    await harness?.close();
    await runtime.dispose();
});

test('a Run snapshot seeds a Computer reading and asks for one GitHub read', async () => {
    expect(await reading()).toMatchObject({
        checks: 'unknown',
        number: 1423,
        repository: 'acme/api',
        review: 'unknown',
        source: 'computer',
        state: 'open',
    });
    expect((await reading())?.refresh_requested_at).not.toBeNull();
});

test('a read replaces the frozen snapshot with what GitHub says now', async () => {
    await refresh();
    expect(await reading()).toMatchObject({
        additions: 10,
        changed_files: 3,
        checks: 'passing',
        deletions: 1,
        head_sha: headSha,
        refresh_requested_at: null,
        review: 'approved',
        source: 'github',
        state: 'merged',
        title: 'Fix flaky login test',
    });
    expect((await reading())?.settled_at).toEqual(new Date('2026-11-02T09:00:00.000Z'));
});

test('a mark written by Postgres itself, with microseconds, clears after its read', async () => {
    // Migration 0113 marked every backfilled row with now(), which keeps microseconds.
    await harness.sql`
        update cloud_agent_pull_requests
        set refresh_requested_at = '2026-11-01 12:00:00.123456+00'
    `;
    await refresh();
    expect((await reading())?.refresh_requested_at).toBeNull();
    expect((await reading())?.source).toBe('github');
});

test('a later snapshot never overwrites a GitHub reading', async () => {
    await refresh();
    await seedPullRequestReadings(connection.db, {
        branches: [
            {
                branch: 'fix-login',
                pullRequest: {
                    additions: 1,
                    changedFiles: 1,
                    deletions: 1,
                    number: 1423,
                    observedAt: '2026-12-01T12:00:00.000Z',
                    state: 'open',
                },
                pullRequestUrl: url,
                repository: 'github.com/acme/api',
            },
        ],
        now: new Date('2026-12-01T12:00:00.000Z'),
        serverId: world.serverId,
    });
    expect(await reading()).toMatchObject({ source: 'github', state: 'merged' });
});

test('webhooks mark a known pull request by number or head, whatever the Triggers', async () => {
    await refresh();
    await ingest('pull_request', pullRequestPayload({ action: 'closed' }));
    expect((await reading())?.refresh_requested_at).not.toBeNull();

    await refresh();
    expect((await reading())?.refresh_requested_at).toBeNull();
    await ingest('check_suite', checkSuitePayload('failure'));
    expect((await reading())?.refresh_requested_at).not.toBeNull();
});

test('a webhook for a pull request no work reported marks nothing', async () => {
    await refresh();
    await ingest('check_suite', {
        ...checkSuitePayload(),
        check_suite: { head_sha: 'f'.repeat(40), pull_requests: [{ number: 9 }] },
    });
    expect((await reading())?.refresh_requested_at).toBeNull();
});

test('a rate limit keeps the mark and the last reading for the next pass', async () => {
    respond = (path) =>
        path.endsWith('/access_tokens') ? tokenResponse() : new Response(null, { status: 503 });
    await refresh();
    expect(await reading()).toMatchObject({ source: 'computer', state: 'open' });
    expect((await reading())?.refresh_requested_at).not.toBeNull();
});

test('a pull request GitHub no longer shows keeps its reading and stops asking', async () => {
    respond = (path) =>
        path.endsWith('/access_tokens') ? tokenResponse() : new Response(null, { status: 404 });
    await refresh();
    expect(await reading()).toMatchObject({ source: 'computer', state: 'open' });
    expect((await reading())?.refresh_requested_at).toBeNull();
});

test('a repository no installation covers stays a Computer reading, unread', async () => {
    await harness.sql`
        update cloud_agent_pull_requests set repository = 'elsewhere/api'
    `;
    await refresh();
    expect(requests).toEqual([]);
    expect(await reading('elsewhere/api')).toMatchObject({
        refresh_requested_at: null,
        source: 'computer',
    });
});

async function refresh() {
    await refreshPullRequestReadings(
        { app, db: connection.db },
        { now: new Date(Date.now() + 60_000) }
    );
}

async function reading(repository = 'acme/api') {
    const [row] = (await harness.sql`
        select * from cloud_agent_pull_requests
        where server_id = ${world.serverId} and repository = ${repository} and number = 1423
    `) as Record<string, unknown>[];
    return row;
}

async function ingest(event: string, payload: unknown) {
    await ingestGithubDelivery(
        {
            clock: { now: () => new Date() },
            db: connection.db,
            delivery: new AgentDelivery(connection.db, {
                isOnline: () => false,
                send: () => false,
            }),
            limiter: new TriggerRateLimiter(),
            markProblem: markGithubTriggersProblem,
            postCommitWork: new ServerPostCommitWork(runtime),
            reconcile: () => Promise.resolve(),
            runtime,
        },
        { event, guid: randomUUID(), payload, source: 'webhook' }
    );
}

function tokenResponse() {
    return Response.json({
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        token: 'ghs_installation',
    });
}

function mergedPullRequest(path: string) {
    if (path.endsWith('/access_tokens')) {
        return tokenResponse();
    }
    if (path.endsWith('/pulls/1423')) {
        return Response.json({
            additions: 10,
            changed_files: 3,
            closed_at: '2026-11-02T09:00:00Z',
            deletions: 1,
            draft: false,
            head: { sha: headSha },
            merged_at: '2026-11-02T09:00:00Z',
            state: 'closed',
            title: 'Fix flaky login test',
        });
    }
    if (path.endsWith('/reviews')) {
        return Response.json([{ state: 'APPROVED', user: { id: 7 } }]);
    }
    if (path.endsWith('/check-runs')) {
        return Response.json({ check_runs: [{ conclusion: 'success', status: 'completed' }] });
    }
    return Response.json({ statuses: [] });
}
