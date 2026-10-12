import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settle } from '@haus/effect';
import { Exit, Scope } from 'effect';
import { makeServerRuntime } from '../server-runtime.ts';
import { skoolHostedUrl } from './catalog.ts';
import { startHostedMcps } from './supervisor.ts';
import { hostedMcpFetch } from './transport.ts';

const roots: string[] = [];
afterAll(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function open(definitions: Parameters<typeof startHostedMcps>[0]['definitions']) {
    const runtime = makeServerRuntime();
    const scope = await settle(runtime, Scope.make());
    const storageRoot = await mkdtemp(join(tmpdir(), 'haus-hosted-test-'));
    roots.push(storageRoot);
    let closing: Promise<void> | undefined;
    const close = () => {
        closing ??= settle(runtime, Scope.close(scope, Exit.succeed(undefined))).then(() =>
            runtime.dispose()
        );
        return closing;
    };
    try {
        return {
            access: await startHostedMcps({ definitions, storageRoot, runtime, scope }),
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}

function fixture(id = 'skool') {
    return {
        id,
        command: [
            process.execPath,
            new URL('./test-fixture.ts', import.meta.url).pathname,
        ] as const,
        cwd: tmpdir(),
        environment: { PATH: process.env.PATH },
    };
}

test('private transport survives connector crashes and Server shutdown reaps it', async () => {
    const owned = await open([fixture()]);
    try {
        const pid: number = await (await owned.access.request('skool', '/mcp')).json();
        expect(owned.access.health()).toEqual([{ id: 'skool', status: 'ready', restarts: 0 }]);
        await expect(hostedMcpFetch(owned.access, 'skool')('https://example.com')).rejects.toThrow(
            'unavailable'
        );
        expect(await (await hostedMcpFetch(owned.access, 'skool')(skoolHostedUrl)).json()).toBe(
            pid
        );
        const worker: number = await (await owned.access.request('skool', '/worker')).json();
        process.kill(pid, 'SIGKILL');
        let replacement = pid;
        for (let attempt = 0; attempt < 40 && replacement === pid; attempt++) {
            await Bun.sleep(100);
            if (owned.access.health()[0]?.status === 'ready') {
                replacement = await (await owned.access.request('skool', '/mcp')).json();
            }
        }
        expect(replacement).not.toBe(pid);
        expect(() => process.kill(worker, 0)).toThrow();
        expect(owned.access.health()[0]?.restarts).toBe(1);
        await owned.close();
        expect(() => process.kill(replacement, 0)).toThrow();
        expect(owned.access.health()[0]?.status).toBe('stopped');
    } finally {
        await owned.close();
    }
}, 15_000);

test('a later startup failure releases connectors that already started', async () => {
    await expect(
        open([fixture(), { ...fixture('broken'), command: ['/missing/haus-connector'] }])
    ).rejects.toThrow();
    const root = roots.at(-1);
    if (!root) {
        throw new Error('No fixture storage was created.');
    }
    const pid = Number(await readFile(join(root, 'skool/fixture-pid'), 'utf8'));
    expect(() => process.kill(pid, 0)).toThrow();
}, 15_000);

test('one connector failure degrades health while other connectors continue serving', async () => {
    const owned = await open([fixture(), fixture('second')]);
    try {
        const pid: number = await (await owned.access.request('skool', '/mcp')).json();
        const second: number = await (await owned.access.request('second', '/mcp')).json();
        process.kill(pid, 'SIGKILL');
        for (
            let attempt = 0;
            attempt < 20 && owned.access.health()[0]?.status === 'ready';
            attempt++
        ) {
            await Bun.sleep(10);
        }
        expect(owned.access.health()[0]?.status).toBe('starting');
        expect(await (await owned.access.request('second', '/mcp')).json()).toBe(second);
        await expect(owned.access.request('skool', '/mcp')).rejects.toThrow('unavailable');
    } finally {
        await owned.close();
    }
});
