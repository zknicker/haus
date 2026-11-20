import { afterAll, beforeAll, expect, test } from 'bun:test';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { buildInboxItems } from '../src/agent-delivery/inbox-items.ts';
import { listInboxItemsByDedupeKeys } from '../src/agent-delivery/store.ts';
import type { GithubApp } from '../src/github/github-app.ts';
import { refreshPullRequestReadings } from '../src/github/pull-request-refresh.ts';
import { attachPullRequestToTask } from '../src/github/task-pull-request-attach.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { seedPullRequestReadings } from '../src/workers/pull-request-readings.ts';
import { createFakeGithub } from './github-fake.ts';
import { type GithubTriggerWorld, seedGithubTriggerWorld } from './github-trigger-seed.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { type PullRequestWakeReading, respondAsGithub } from './pull-request-wake-github.ts';
import { startTestTask, type TestTask } from './task-place-fixture.ts';

const url = 'https://github.com/Acme/Api/pull/1423';
const headSha = 'ec26c3e57ca3a959ca5aad62de7213c562f8c821';
const pull: PullRequestWakeReading = { checks: 'pending', draft: false };

let app: GithubApp;
let connection: HausConnection;
let delivery: AgentDelivery;
let harness: HausServerHarness;
let runId: string;
let task: TestTask;
let wakes: { agentId: string; serverId: string }[];
let world: GithubTriggerWorld;

beforeAll(async () => {
    harness = await startHausServerHarness();
    world = await seedGithubTriggerWorld(harness, 'pull-request-wake');
    connection = await connectHausDatabase(harness.databaseUrl);
    delivery = new AgentDelivery(connection.db, { isOnline: () => false, send: () => false });
    const fake = await createFakeGithub();
    app = {
        ...fake.app,
        transport: {
            fetch: ((input: RequestInfo | URL) =>
                Promise.resolve(
                    respondAsGithub(new URL(String(input)).pathname, pull, headSha)
                )) as typeof fetch,
        },
    };
    task = await startTestTask(harness, world.owner, {
        channelId: world.channelId,
        originMessageId: world.anchorMessageId,
        serverId: world.serverId,
        title: 'Fix the flaky login test',
    });
    runId = await insertSettledWork();
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
                    state: 'draft',
                },
                pullRequestUrl: url,
                repository: 'github.com/acme/api',
            },
        ],
        now: new Date('2026-11-01T12:00:00.000Z'),
        serverId: world.serverId,
    });
    await harness.sql`update pull_request_readings set checks = 'pending'`;
});

afterAll(async () => {
    world?.owner.close();
    await connection?.close();
    await harness?.close();
});

test('nothing wakes while the newest Run is still working', async () => {
    await harness.sql`update worker_turns set status = 'running', terminal_at = null where id = ${runId}`;
    await refresh();
    expect(await notices()).toEqual([]);
    expect(wakes).toEqual([]);
    await harness.sql`
        update pull_request_readings set state = 'draft', checks = 'pending', refresh_requested_at = now()
    `;
    await harness.sql`update worker_turns set status = 'completed', terminal_at = now(), outcome = '{"kind":"stopped"}'::jsonb where id = ${runId}`;
});

test('a draft turning ready after settlement wakes the Agent in the Task, once', async () => {
    await refresh();
    expect(await notices()).toEqual([
        { chat_id: task.chatId, dedupe_key: `acme/api#1423:ready_for_review:${headSha}` },
    ]);
    expect(wakes).toEqual([{ agentId: world.agentId, serverId: world.serverId }]);
    const rows = await listInboxItemsByDedupeKeys(connection.db, {
        agentId: world.agentId,
        dedupeKeys: [`acme/api#1423:ready_for_review:${headSha}`],
        runId: 'run_unused',
    });
    expect(await buildInboxItems(connection.db, rows)).toMatchObject([
        {
            worker: {
                notice: 'pull_request',
                pullRequestChange: {
                    change: 'ready_for_review',
                    url: 'https://github.com/acme/api/pull/1423',
                },
            },
            target: `task:${task.key}`,
        },
    ]);

    await markAndRefresh();
    expect(await notices()).toHaveLength(1);
    expect(wakes).toEqual([]);
});

test('checks finishing wake once per head, even when the reading repeats', async () => {
    pull.checks = 'passing';
    await markAndRefresh();
    expect((await notices()).map((row) => row.dedupe_key)).toContain(
        `acme/api#1423:checks_passing:${headSha}`
    );
    await harness.sql`update pull_request_readings set checks = 'pending'`;
    await markAndRefresh();
    expect(await notices()).toHaveLength(2);
});

test('attach-pr links a pull request to the Task and seeds its reading', async () => {
    const runner = await mintRunner();
    const response = await fetch(new URL('/api/agent/tasks/attach-pr', harness.url), {
        body: JSON.stringify({ key: task.key, url: 'https://github.com/acme/api/pull/77' }),
        headers: { authorization: `Bearer ${runner}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        pullRequest: {
            number: 77,
            repository: 'acme/api',
            url: 'https://github.com/acme/api/pull/77',
        },
        task: { key: task.key },
    });
    expect(await harness.sql`select task_id from task_pull_requests where number = 77`).toEqual([
        { task_id: task.id },
    ]);
});

test('attaching an unread pull request seeds its reading with one GitHub read', async () => {
    const attached = await attachPullRequestToTask(
        { app, db: connection.db },
        { serverId: world.serverId, taskId: task.id, url: 'https://github.com/acme/api/pull/78' }
    );
    expect(attached).toMatchObject({
        number: 78,
        reading: { headSha, source: 'github', state: 'open' },
        repository: 'acme/api',
    });
    await attachPullRequestToTask(
        { app, db: connection.db },
        { serverId: world.serverId, taskId: task.id, url: 'https://github.com/acme/api/pull/78' }
    );
    expect(await harness.sql`select task_id from task_pull_requests where number = 78`).toEqual([
        { task_id: task.id },
    ]);
});

test('a pull request on a Task with no cloud work wakes its assignee Agent, with no Run', async () => {
    const bare = await startTestTask(harness, world.owner, {
        channelId: world.channelId,
        serverId: world.serverId,
        title: 'Review the vendor patch',
    });
    await harness.sql`update tasks set assignee_agent_id = ${world.agentId} where id = ${bare.id}`;
    pull.draft = true;
    pull.checks = 'pending';
    await attachPullRequestToTask(
        { app, db: connection.db },
        { serverId: world.serverId, taskId: bare.id, url: 'https://github.com/acme/api/pull/1500' }
    );
    pull.draft = false;
    await markAndRefresh();
    const key = `acme/api#1500:ready_for_review:${headSha}`;
    const rows = await listInboxItemsByDedupeKeys(connection.db, {
        agentId: world.agentId,
        dedupeKeys: [key],
        runId: 'run_unused',
    });
    expect(rows.map((row) => ({ chatId: row.chatId, runId: row.workerTurnId }))).toEqual([
        { chatId: bare.chatId, runId: null },
    ]);
    expect(wakes).toContainEqual({ agentId: world.agentId, serverId: world.serverId });
    const [item] = await buildInboxItems(connection.db, rows);
    expect(item).toMatchObject({
        content: `Pull request acme/api#1500 is ready for review (head ${headSha.slice(0, 7)}).`,
        pullRequestNotice: {
            change: 'ready_for_review',
            url: 'https://github.com/acme/api/pull/1500',
        },
        senderType: 'system',
        sequence: 0,
        target: `task:${bare.key}`,
    });
    expect(item?.worker).toBeUndefined();

    await markAndRefresh();
    expect(
        await harness.sql`select count(*)::int as count from agent_inbox where dedupe_key = ${key}`
    ).toEqual([{ count: 1 }]);
});

async function refresh() {
    wakes = [];
    await refreshPullRequestReadings(
        { app, db: connection.db, delivery, wakeAgents: (woken) => wakes.push(...woken) },
        { now: new Date(Date.now() + 60_000) }
    );
}

async function markAndRefresh() {
    await harness.sql`update pull_request_readings set refresh_requested_at = now()`;
    await refresh();
}

async function notices() {
    return (await harness.sql`
        select chat_id, dedupe_key from agent_inbox
        where agent_id = ${world.agentId} and source = 'pull_request'
        order by created_at
    `) as { chat_id: string; dedupe_key: string }[];
}

async function insertSettledWork(): Promise<string> {
    const workId = createOpaqueId('caw');
    const id = createOpaqueId('car');
    await harness.sql`
        insert into workers
            (id, server_id, agent_id, origin_chat_id, carrier_computer_id, launch_message_id, place,
             repository, title, task_id, status, terminal_at)
        values (${workId}, ${world.serverId}, ${world.agentId}, ${task.chatId},
                'cmp_githubtriggers01', ${world.anchorMessageId}, 'cursor', 'acme/api',
                'Fix the flaky login test', ${task.id}, 'completed', now())
    `;
    await harness.sql`
        insert into worker_turns (id, server_id, worker_id, status, terminal_at, branches)
        values (${id}, ${world.serverId}, ${workId}, 'completed', now(),
                ${[{ branch: 'fix-login', pullRequestUrl: url, repository: 'github.com/acme/api' }]}::jsonb)
    `;
    return id;
}

async function mintRunner(): Promise<string> {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({
            agentId: world.agentId,
            chatId: world.channelId,
            credentialHash: 'b'.repeat(64),
            runId: 'run_attach_pr',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { runnerToken: string }).runnerToken;
}
