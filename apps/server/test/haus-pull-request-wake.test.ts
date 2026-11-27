import { afterAll, beforeAll, expect, test } from 'bun:test';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { buildInboxItems } from '../src/agent-delivery/inbox-items.ts';
import { listInboxItemsByDedupeKeys } from '../src/agent-delivery/store.ts';
import type { GithubApp } from '../src/github/github-app.ts';
import { refreshPullRequestReadings } from '../src/github/pull-request-refresh.ts';
import { attachPullRequestToTask } from '../src/github/task-pull-request-attach.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createFakeGithub } from './github-fake.ts';
import { type GithubTriggerWorld, seedGithubTriggerWorld } from './github-trigger-seed.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { type PullRequestWakeReading, respondAsGithub } from './pull-request-wake-github.ts';
import { seedTaskAgent } from './task-agent.fixture.ts';
import { startTestTask, type TestTask } from './task-place-fixture.ts';

const url = 'https://github.com/Acme/Api/pull/1423';
const headSha = 'ec26c3e57ca3a959ca5aad62de7213c562f8c821';
const pull: PullRequestWakeReading = { checks: 'pending', draft: true };

let app: GithubApp;
let connection: HausConnection;
let delivery: AgentDelivery;
let harness: HausServerHarness;
let crew: { agentId: string; chatId: string; shortId: string; taskId: string };
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
    crew = await seedTaskAgent(harness, {
        captainId: world.agentId,
        computerId: world.computerId,
        projectId: task.projectId,
        serverId: world.serverId,
    });
    await attachPullRequestToTask(
        { app, db: connection.db },
        { serverId: world.serverId, taskId: crew.taskId, url }
    );
    pull.draft = false;
});

afterAll(async () => {
    world?.owner.close();
    await connection?.close();
    await harness?.close();
});

test('a draft turning ready wakes the Task’s own agent in the Task, once', async () => {
    await markAndRefresh();
    expect(await notices()).toEqual([
        { chat_id: crew.chatId, dedupe_key: `acme/api#1423:ready_for_review:${headSha}` },
    ]);
    expect(wakes).toEqual([{ agentId: crew.agentId, serverId: world.serverId }]);
    const rows = await listInboxItemsByDedupeKeys(connection.db, {
        agentId: crew.agentId,
        dedupeKeys: [`acme/api#1423:ready_for_review:${headSha}`],
        runId: 'run_unused',
    });
    expect(rows.map((row) => row.chatId)).toEqual([crew.chatId]);
    expect(await buildInboxItems(connection.db, rows)).toMatchObject([
        {
            content: `Pull request acme/api#1423 is ready for review (head ${headSha.slice(0, 7)}).`,
            pullRequestNotice: {
                change: 'ready_for_review',
                url: 'https://github.com/acme/api/pull/1423',
            },
            senderType: 'system',
            target: `task:${crew.shortId}`,
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
        body: JSON.stringify({ task: task.shortId, url: 'https://github.com/acme/api/pull/77' }),
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
        task: { shortId: task.shortId },
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
        where agent_id = ${crew.agentId} and source = 'pull_request'
        order by created_at
    `) as { chat_id: string; dedupe_key: string }[];
}

async function mintRunner() {
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
