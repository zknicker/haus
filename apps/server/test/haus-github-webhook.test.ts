import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
    fixtureInstallationId,
    installationPayload,
    pushPayload,
    workflowRunPayload,
} from './github-delivery-fixtures.ts';
import { createFakeGithub, type FakeGithub } from './github-fake.ts';
import {
    type GithubTriggerWorld,
    insertGithubTrigger,
    postGithubDelivery,
    seedGithubTriggerWorld,
} from './github-trigger-seed.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// The app webhook end to end: signature, dedupe, routing by installation and
// repository access, matching, and the fires and wakes it commits.

let github: FakeGithub;
let harness: HausServerHarness;
let world: GithubTriggerWorld;
let secret: string;
let ciTriggerId: string;

beforeAll(async () => {
    github = await createFakeGithub();
    secret = github.app.config.webhookSecret;
    harness = await startHausServerHarness({ githubApp: github.app });
    world = await seedGithubTriggerWorld(harness, 'github-webhook');
    ciTriggerId = await insertGithubTrigger(harness, world, {
        events: [{ actions: ['completed'], conclusions: ['failure'], event: 'workflow_run' }],
        repositoryIds: [7001],
    });
});

afterAll(async () => {
    world?.owner.close();
    await harness?.close();
});

test('missing headers answer 400 and a bad or absent signature 401', async () => {
    const payload = workflowRunPayload();
    expect(
        await postGithubDelivery(harness, { event: 'workflow_run', guid: '', payload, secret })
    ).toEqual({ body: { code: 'invalid_github_headers' }, status: 400 });
    expect(
        await postGithubDelivery(harness, {
            event: 'workflow_run',
            guid: randomUUID(),
            payload,
            secret,
            signature: null,
        })
    ).toEqual({ body: { code: 'invalid_github_headers' }, status: 400 });
    expect(
        await postGithubDelivery(harness, {
            event: 'workflow_run',
            guid: randomUUID(),
            payload,
            secret: 'x'.repeat(32),
        })
    ).toEqual({ body: { code: 'invalid_signature' }, status: 401 });
    expect(
        await postGithubDelivery(harness, {
            event: 'workflow_run',
            guid: randomUUID(),
            payload,
            secret,
            signature: 'sha256=00',
        })
    ).toEqual({ body: { code: 'invalid_signature' }, status: 401 });
    expect(await firesOf(ciTriggerId)).toBe(0);
});

test('a signed body that is not JSON answers 415, and an oversized one 413', async () => {
    expect(
        await postGithubDelivery(harness, {
            body: 'payload=%7B%7D',
            event: 'workflow_run',
            guid: randomUUID(),
            secret,
        })
    ).toEqual({ body: { code: 'unsupported_media_type' }, status: 415 });
    expect(
        await postGithubDelivery(harness, {
            body: `{"pad":"${'p'.repeat(10 * 1024 * 1024)}"}`,
            event: 'workflow_run',
            guid: randomUUID(),
            secret,
        })
    ).toEqual({ body: { code: 'payload_too_large' }, status: 413 });
});

test('a matching delivery fires once with a projection, and its replay is a duplicate', async () => {
    const guid = randomUUID();
    const first = await postGithubDelivery(harness, {
        event: 'workflow_run',
        guid,
        payload: workflowRunPayload(),
        secret,
    });
    expect(first).toEqual({ body: { routed: 1 }, status: 202 });
    const replay = await postGithubDelivery(harness, {
        event: 'workflow_run',
        guid,
        payload: workflowRunPayload(),
        secret,
    });
    expect(replay).toEqual({ body: { duplicate: true }, status: 200 });

    const fires = (await harness.sql`
        select id, dedupe_key, content_type, payload from trigger_fires where trigger_id = ${ciTriggerId}
    `) as { content_type: string; dedupe_key: string; id: string; payload: string }[];
    expect(fires).toHaveLength(1);
    expect(fires[0]?.dedupe_key).toBe(`gh:${guid}`);
    expect(fires[0]?.content_type).toBe('application/json');
    expect(JSON.parse(fires[0]?.payload ?? '{}')).toMatchObject({
        event: 'workflow_run',
        installation: { account: 'acme' },
        workflow_run: { conclusion: 'failure', run_number: 562 },
    });
    const [inbox] = (await harness.sql`
        select source, content from agent_inbox where dedupe_key = ${fires[0]?.id ?? ''}
    `) as { content: string; source: string }[];
    expect(inbox?.source).toBe('trigger');
    expect(inbox?.content).toContain(
        'GitHub: workflow_run completed · failure · main · acme/api #562'
    );
    expect(inbox?.content).toContain(`github-event=workflow_run.completed; delivery=${guid}`);
    const [delivery] = await harness.sql`
        select state, routed_count, source from github_webhook_deliveries where delivery_guid = ${guid}
    `;
    expect(delivery).toEqual({ routed_count: 1, source: 'webhook', state: 'done' });
});

test('filter misses, foreign repositories, and unknown installations route nothing', async () => {
    const before = await firesOf(ciTriggerId);
    const miss = randomUUID();
    expect(
        await postGithubDelivery(harness, {
            event: 'workflow_run',
            guid: miss,
            payload: workflowRunPayload({ conclusion: 'success' }),
            secret,
        })
    ).toEqual({ body: { routed: 0 }, status: 202 });

    const foreign = workflowRunPayload();
    foreign.repository = { ...foreign.repository, full_name: 'acme/secret', id: 9999 };
    const foreignGuid = randomUUID();
    expect(
        await postGithubDelivery(harness, {
            event: 'workflow_run',
            guid: foreignGuid,
            payload: foreign,
            secret,
        })
    ).toEqual({ body: { routed: 0 }, status: 202 });

    const stranger = { ...workflowRunPayload(), installation: { id: 777 } };
    const strangerGuid = randomUUID();
    expect(
        await postGithubDelivery(harness, {
            event: 'workflow_run',
            guid: strangerGuid,
            payload: stranger,
            secret,
        })
    ).toEqual({ body: { routed: 0 }, status: 202 });

    expect(await firesOf(ciTriggerId)).toBe(before);
    expect(await ignoredReason(foreignGuid)).toBe('repository_inaccessible');
    expect(await ignoredReason(strangerGuid)).toBe('unknown_installation');
    expect(await ignoredReason(miss)).toBe(null);
});

test('one delivery fires every matching Trigger in one transaction and wakes the owner once', async () => {
    const pushTriggers = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
            insertGithubTrigger(harness, world, {
                events: [{ branches: ['main'], event: 'push' }],
                title: `Push ${index}`,
            })
        )
    );
    const guid = randomUUID();
    expect(
        await postGithubDelivery(harness, { event: 'push', guid, payload: pushPayload(), secret })
    ).toEqual({ body: { routed: 5 }, status: 202 });
    const rows = (await harness.sql`
        select trigger_id from trigger_fires where dedupe_key = ${`gh:${guid}`}
    `) as { trigger_id: string }[];
    expect(rows.map((row) => row.trigger_id).sort()).toEqual([...pushTriggers].sort());
});

test('matches over the rate limit are skipped and counted, never refused', async () => {
    const noisy = await insertGithubTrigger(harness, world, {
        events: [{ event: 'release' }],
        title: 'Noisy',
    });
    const answers: unknown[] = [];
    for (let index = 0; index < 11; index += 1) {
        answers.push(
            (
                await postGithubDelivery(harness, {
                    event: 'release',
                    guid: randomUUID(),
                    payload: { ...pushPayload(), action: 'published', release: { tag_name: 'v1' } },
                    secret,
                })
            ).status
        );
    }
    expect(answers.every((status) => status === 202)).toBe(true);
    expect(await firesOf(noisy)).toBe(10);
    const [config] = await harness.sql`
        select suppressed_count from github_trigger_configs where trigger_id = ${noisy}
    `;
    expect(config).toEqual({ suppressed_count: 1 });
});

test('pings finish, and lifecycle deliveries reconcile the installation', async () => {
    expect(
        await postGithubDelivery(harness, {
            event: 'ping',
            guid: randomUUID(),
            payload: { hook_id: 1, zen: 'Design for failure.' },
            secret,
        })
    ).toEqual({ body: { routed: 0 }, status: 202 });
    github.requests.length = 0;
    github.appStatus.set(fixtureInstallationId, 503);
    expect(
        await postGithubDelivery(harness, {
            event: 'installation',
            guid: randomUUID(),
            payload: installationPayload('suspend'),
            secret,
        })
    ).toEqual({ body: { routed: 0 }, status: 202 });
    expect(github.requests).toContain(`GET /app/installations/${fixtureInstallationId}`);
    github.appStatus.delete(fixtureInstallationId);
});

test('the development sink answers 204 to anything and reads nothing', async () => {
    for (const body of ['not json', `{"pad":"${'p'.repeat(12 * 1024 * 1024)}"}`]) {
        const response = await fetch(new URL('/api/github/sink', harness.url), {
            body,
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(response.status).toBe(204);
    }
});

async function firesOf(triggerId: string) {
    const [row] = (await harness.sql`
        select count(*)::int as total from trigger_fires where trigger_id = ${triggerId}
    `) as { total: number }[];
    return row?.total ?? 0;
}

async function ignoredReason(guid: string) {
    const [row] = (await harness.sql`
        select ignored_reason from github_webhook_deliveries where delivery_guid = ${guid}
    `) as { ignored_reason: string | null }[];
    return row?.ignored_reason ?? null;
}
