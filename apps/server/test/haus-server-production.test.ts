import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createHausServerApplication,
    type HausServerApplication,
} from '../src/haus-server-application.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

const appOrigin = 'https://haus.chat';
let application: HausServerApplication;
let cluster: PostgresCluster;
let staticAppRoot: string;
let attachmentRoot: string;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    attachmentRoot = mkdtempSync(join(tmpdir(), 'haus-production-attachments-'));
    staticAppRoot = mkdtempSync(join(tmpdir(), 'haus-static-app-'));
    writeFileSync(
        join(staticAppRoot, 'index.html'),
        '<!doctype html><title>Haus</title><script src="/assets/app.js"></script>'
    );
    writeFileSync(
        join(staticAppRoot, 'privacy.html'),
        '<!doctype html><title>Privacy · Haus</title><h1>Privacy</h1>'
    );
    mkdirSync(join(staticAppRoot, 'assets'));
    writeFileSync(join(staticAppRoot, 'assets', 'app.js'), 'window.__haus = true;');

    application = await createHausServerApplication({
        appOrigin,
        attachmentRoot,
        databaseUrl: cluster.databaseUrl,
        staticAppRoot,
    });
    await application.listen(0);
});

test('serves Haus App assets from the same origin', async () => {
    const address = application.app.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/assets/app.js`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('window.__haus = true;');
});

test('serves the public privacy page with its security policy', async () => {
    const address = application.app.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/privacy`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toContain('<h1>Privacy</h1>');
});

test('serves the trailing-slash privacy URL instead of the Haus App shell', async () => {
    const address = application.app.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/privacy/`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>Privacy · Haus</title>');
});

afterAll(async () => {
    await application.close();
    await cluster.stop();
    rmSync(attachmentRoot, { force: true, recursive: true });
    rmSync(staticAppRoot, { force: true, recursive: true });
});

test('serves Haus App history routes from a loopback-only Server', async () => {
    const address = application.app.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/s/haus-hq`, {
        headers: { accept: 'text/html' },
    });

    expect(address.address).toBe('127.0.0.1');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>Haus</title>');
});
