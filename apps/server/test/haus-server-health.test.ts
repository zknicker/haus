import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import Fastify from 'fastify';
import { registerHausHealth } from '../src/haus-health.ts';
import {
    createHausServerApplication,
    type HausServerApplication,
} from '../src/haus-server-application.ts';
import type { HostedMcpAccess } from '../src/hosted-mcp/supervisor.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

const appOrigin = 'https://haus.chat';
let application: HausServerApplication;
let cluster: PostgresCluster;
let healthUrl: string;
let attachmentRoot: string;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    attachmentRoot = await mkdtemp(join(tmpdir(), 'haus-health-attachments-'));
    application = await createHausServerApplication({
        appOrigin,
        attachmentRoot,
        databaseUrl: cluster.databaseUrl,
    });
    await application.listen(0);
    const address = application.app.server.address() as AddressInfo;
    healthUrl = `http://127.0.0.1:${address.port}/healthz`;
});

afterAll(async () => {
    await application.close();
    await cluster.stop();
    await rm(attachmentRoot, { force: true, recursive: true });
});

test('reports PostgreSQL failure without exposing connection details', async () => {
    const healthy = await fetch(healthUrl);
    expect(healthy.status).toBe(200);
    expect(await healthy.json()).toMatchObject({
        reminders: { status: 'healthy' },
        status: 'ok',
    });

    await cluster.stop();

    const unavailable = await fetch(healthUrl);
    const body = await unavailable.text();
    expect(unavailable.status).toBe(503);
    expect(JSON.parse(body)).toEqual({
        code: 'postgres_unavailable',
        status: 'unhealthy',
    });
    expect(body).not.toContain('postgres://');
});

test('classifies a hung PostgreSQL probe without hanging the health route', async () => {
    const app = Fastify();
    const runtime = makeTestRuntime();
    const probeStarted = Promise.withResolvers<void>();
    let aborted = false;
    registerHausHealth(
        app,
        runtime,
        (signal) => {
            probeStarted.resolve();
            signal?.addEventListener('abort', () => {
                aborted = true;
            });
            return new Promise(() => undefined);
        },
        10
    );

    const response = app.inject('/healthz');
    try {
        await probeStarted.promise;
        await runtime.runPromise(TestClock.adjust('10 millis'));
        const completed = await response;
        expect(completed.statusCode).toBe(503);
        expect(completed.json()).toEqual({
            code: 'postgres_unavailable',
            status: 'unhealthy',
        });
        expect(aborted).toBe(true);
    } finally {
        await app.close();
        await runtime.dispose();
    }
});

test('reports hosted connector degradation and recovery without exposing credentials', async () => {
    const app = Fastify();
    const runtime = makeTestRuntime();
    let connectors: ReturnType<HostedMcpAccess['health']> = [
        { id: 'skool', status: 'ready', restarts: 0 },
    ];
    registerHausHealth(
        app,
        runtime,
        async () => true,
        5000,
        undefined,
        () => connectors
    );
    try {
        expect((await app.inject('/healthz')).json()).toEqual({
            status: 'ok',
            hostedMcps: connectors,
        });
        connectors = [{ id: 'skool', status: 'starting', restarts: 1 }];
        const degraded = await app.inject('/healthz');
        expect(degraded.statusCode).toBe(200);
        expect(degraded.json()).toEqual({ status: 'degraded', hostedMcps: connectors });
        connectors = [{ id: 'skool', status: 'ready', restarts: 1 }];
        expect((await app.inject('/healthz')).json()).toEqual({
            status: 'ok',
            hostedMcps: connectors,
        });
    } finally {
        await app.close();
        await runtime.dispose();
    }
});
