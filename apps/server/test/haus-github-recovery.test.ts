import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { eq } from 'drizzle-orm';
import type { GithubDelivery, GithubIngestOutcome } from '../src/github/delivery-ingest.ts';
import { maxRecoveryAttempts, sweepGithubDeliveries } from '../src/github/delivery-recovery.ts';
import type { GithubApp } from '../src/github/github-app.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { githubDeliveryCursorTable, githubWebhookDeliveriesTable } from '../src/postgres/schema.ts';
import { workflowRunPayload } from './github-delivery-fixtures.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Recovery against a recorded-shape delivery log: newest-first pages linked by
// `Link`, entries GitHub calls "OK" that Haus never finished, redeliveries
// that share a guid, overlap with work already done, and the retention gap.

const runtime = makeTestRuntime();
const hour = 3_600_000;
const appId = 123_456;
const now = new Date('2026-10-11T12:00:00.000Z');

let cluster: PostgresCluster;
let connection: HausConnection;
let pages: Record<string, LogEntry[]>;
let requests: string[];
let failingDetail: Set<number>;

interface LogEntry {
    delivered_at: string;
    guid: string;
    id: number;
    status: string;
}

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
    await runtime.dispose();
});

beforeEach(async () => {
    await connection.db.delete(githubWebhookDeliveriesTable);
    await connection.db.delete(githubDeliveryCursorTable);
    requests = [];
    failingDetail = new Set();
});

function entry(id: number, ageMs: number, status = 'OK', guid = `guid-${id}`): LogEntry {
    return { delivered_at: new Date(now.getTime() - ageMs).toISOString(), guid, id, status };
}

const app: GithubApp = {
    config: {
        appId: String(appId),
        clientId: 'client',
        clientSecret: 'secret',
        privateKey: 'unused',
        slug: 'haus-test',
        webhookSecret: 'w'.repeat(32),
    },
    signer: { jwt: () => Promise.resolve('eyJ.test.jwt') },
    transport: {
        fetch: ((input: RequestInfo | URL) => {
            const url = new URL(String(input));
            requests.push(`${url.pathname}${url.search}`);
            const detail = /^\/app\/hook\/deliveries\/(\d+)$/u.exec(url.pathname);
            if (detail) {
                const id = Number(detail[1]);
                if (failingDetail.has(id)) {
                    return Promise.resolve(new Response(null, { status: 502 }));
                }
                const found = Object.values(pages)
                    .flat()
                    .find((candidate) => candidate.id === id);
                return Promise.resolve(
                    Response.json({
                        event: 'workflow_run',
                        guid: found?.guid,
                        id,
                        request: { headers: {}, payload: workflowRunPayload() },
                    })
                );
            }
            const cursor = url.searchParams.get('cursor') ?? 'first';
            const next = { first: 'p2', p2: 'p3', p3: 'p4' }[cursor];
            return Promise.resolve(
                Response.json(pages[cursor] ?? [], {
                    headers: next
                        ? {
                              link: `<https://api.github.com/app/hook/deliveries?per_page=100&cursor=${next}>; rel="next"`,
                          }
                        : {},
                })
            );
        }) as typeof fetch,
    },
};

function sweep(
    ingested: GithubDelivery[],
    options: {
        attempts?: Map<string, number>;
        outcome?: (delivery: GithubDelivery) => GithubIngestOutcome;
    } = {}
) {
    return sweepGithubDeliveries({
        app,
        attempts: options.attempts,
        clock: { now: () => now },
        db: connection.db,
        ingest: (delivery) => {
            ingested.push(delivery);
            return Promise.resolve(options.outcome?.(delivery) ?? { kind: 'accepted', routed: 0 });
        },
        runtime,
    });
}

async function cursor() {
    const [row] = await connection.db.select().from(githubDeliveryCursorTable);
    return row;
}

test('pages until a page is wholly older than the cutoff and ingests every unfinished guid', async () => {
    await connection.db.insert(githubDeliveryCursorTable).values({
        appId,
        watermark: new Date(now.getTime() - 2 * hour),
    });
    await connection.db.insert(githubWebhookDeliveriesTable).values({
        deliveryGuid: 'guid-2',
        event: 'workflow_run',
        receivedAt: now,
        source: 'webhook',
        state: 'done',
    });
    pages = {
        first: [entry(1, 1000, 'OK'), entry(2, 2000), entry(3, 3000, 'Invalid HTTP Response: 500')],
        // A redelivery reuses its guid; GitHub's order is not trusted within a page.
        p2: [
            entry(4, 2.5 * hour, 'OK'),
            entry(5, 4000, 'timed out', 'guid-1'),
            entry(6, 2.9 * hour),
        ],
        p3: [entry(7, 3.2 * hour), entry(8, 3.5 * hour)],
        p4: [entry(9, 5000)],
    };
    const ingested: GithubDelivery[] = [];
    const result = await sweep(ingested);

    expect(ingested.map((delivery) => delivery.guid)).toEqual([
        'guid-1',
        'guid-3',
        'guid-4',
        'guid-6',
    ]);
    expect(ingested.every((delivery) => delivery.source === 'recovery')).toBe(true);
    expect(ingested[0]?.event).toBe('workflow_run');
    expect(result).toEqual({ abandoned: 0, failed: 0, gap: null, ingested: 4, pages: 3 });
    expect(requests).not.toContain('/app/hook/deliveries/2');
    expect(requests.some((request) => request.includes('cursor=p4'))).toBe(false);
    expect(await cursor()).toMatchObject({ lastSweptAt: now, watermark: now });
});

test('a failed fetch holds the watermark at that delivery so the next sweep retries', async () => {
    const watermark = new Date(now.getTime() - 30 * 60 * 1000);
    await connection.db.insert(githubDeliveryCursorTable).values({ appId, watermark });
    pages = { first: [entry(10, 1000), entry(11, 2000)], p2: [entry(12, 3 * hour)] };
    failingDetail.add(10);
    const ingested: GithubDelivery[] = [];
    const result = await sweep(ingested);
    expect(result).toMatchObject({ failed: 1, ingested: 1 });
    expect(ingested.map((delivery) => delivery.guid)).toEqual(['guid-11']);
    expect((await cursor())?.watermark).toEqual(new Date(now.getTime() - 1000));
});

test('a delivery another attempt holds keeps the watermark from passing it', async () => {
    const watermark = new Date(now.getTime() - 30 * 60 * 1000);
    await connection.db.insert(githubDeliveryCursorTable).values({ appId, watermark });
    pages = { first: [entry(13, 1000), entry(14, 20 * 60 * 1000)], p2: [entry(15, 3 * hour)] };
    const result = await sweep([], {
        outcome: (delivery) =>
            delivery.guid === 'guid-14' ? { kind: 'in_progress' } : { kind: 'accepted', routed: 0 },
    });
    expect(result).toMatchObject({ failed: 0, ingested: 1 });
    expect((await cursor())?.watermark).toEqual(new Date(now.getTime() - 20 * 60 * 1000));
});

test('a delivery that keeps failing is abandoned and stops holding the watermark', async () => {
    const watermark = new Date(now.getTime() - 30 * 60 * 1000);
    await connection.db.insert(githubDeliveryCursorTable).values({ appId, watermark });
    pages = { first: [entry(16, 1000), entry(17, 2000)], p2: [entry(18, 3 * hour)] };
    failingDetail.add(17);
    const attempts = new Map<string, number>();
    for (let attempt = 1; attempt < maxRecoveryAttempts; attempt += 1) {
        expect(await sweep([], { attempts })).toMatchObject({ abandoned: 0, failed: 1 });
        expect((await cursor())?.watermark).toEqual(new Date(now.getTime() - 2000));
    }
    expect(await sweep([], { attempts })).toMatchObject({ abandoned: 1, failed: 0 });
    expect((await cursor())?.watermark).toEqual(now);
    const [row] = await connection.db
        .select()
        .from(githubWebhookDeliveriesTable)
        .where(eq(githubWebhookDeliveriesTable.deliveryGuid, 'guid-17'));
    expect(row).toMatchObject({ ignoredReason: 'recovery_abandoned', state: 'done' });
    expect(attempts.size).toBe(0);
});

test('a watermark past retention records the gap and resumes from the retention edge', async () => {
    const watermark = new Date(now.getTime() - 4 * 24 * hour);
    await connection.db.insert(githubDeliveryCursorTable).values({ appId, watermark });
    const edgeAge = 3 * 24 * hour - hour;
    pages = {
        first: [entry(20, 1000), entry(21, edgeAge - 1000)],
        p2: [entry(22, edgeAge + 1000)],
    };
    const ingested: GithubDelivery[] = [];
    const result = await sweep(ingested);
    const edge = new Date(now.getTime() - edgeAge);
    expect(result.gap).toEqual({ from: watermark, to: edge });
    expect(ingested.map((delivery) => delivery.guid)).toEqual(['guid-20', 'guid-21']);
    expect(await cursor()).toMatchObject({ gapFrom: watermark, gapTo: edge, watermark: now });
});

test('a first sweep starts ten minutes back', async () => {
    pages = { first: [entry(30, 5 * 60 * 1000), entry(31, 20 * 60 * 1000)] };
    const ingested: GithubDelivery[] = [];
    await sweep(ingested);
    // The hour of overlap reaches both; the cursor row is created on first use.
    expect(ingested.map((delivery) => delivery.guid)).toEqual(['guid-30', 'guid-31']);
    expect((await cursor())?.watermark).toEqual(now);
});
