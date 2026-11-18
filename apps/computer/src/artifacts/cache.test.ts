import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ArtifactMetadata } from '@haus/api';
import { ArtifactCache } from './cache.ts';

const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});
const macTest = process.platform === 'darwin' ? test : test.skip;

macTest('cache reuses a revision, separates Servers and protects active turn files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-cache-'));
    roots.push(root);
    const a = new ArtifactCache(root, 8);
    const b = new ArtifactCache(root, 8);
    let downloads = 0;
    const fetcher: typeof fetch = Object.assign(
        async () => {
            downloads += 1;
            return new Response('1234');
        },
        { preconnect: fetch.preconnect }
    );
    const input = {
        artifact: metadata('first', '1234'),
        downloadUrl: 'https://r2.invalid/file',
        fetcher,
    };
    const first = await a.resolve({ ...input, serverId: 'server-a' });
    expect(await b.resolve({ ...input, serverId: 'server-a' })).toBe(first);
    expect(downloads).toBe(1);
    const other = await b.resolve({ ...input, serverId: 'server-b' });
    expect(other).not.toBe(first);
    expect(downloads).toBe(2);
    await expect(
        a.resolve({ ...input, artifact: metadata('second', '1234'), serverId: 'server-a' })
    ).rejects.toThrow('active turns');
    await a.release();
    await b.release();
    await a.resolve({ ...input, artifact: metadata('second', '1234'), serverId: 'server-a' });
    await a.release();
});

macTest('failed integrity check leaves no partial entry and a retry succeeds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-cache-'));
    roots.push(root);
    const cache = new ArtifactCache(root, 8);
    let corrupt = true;
    const fetcher: typeof fetch = Object.assign(
        async () => new Response(corrupt ? 'xxxx' : '1234'),
        { preconnect: fetch.preconnect }
    );
    const input = {
        serverId: 'server',
        artifact: metadata('first', '1234'),
        downloadUrl: 'https://r2.invalid/file',
        fetcher,
    };
    await expect(cache.resolve(input)).rejects.toThrow('integrity');
    corrupt = false;
    const path = await cache.resolve(input);
    expect(await readFile(path, 'utf8')).toBe('1234');
    await cache.release();
});

function metadata(revision: string, bytes: string): ArtifactMetadata {
    return {
        artifact_id: 'artifact',
        revision_id: revision,
        revision_number: 1,
        path: 'sample.txt',
        title: 'Sample',
        filename: 'sample.txt',
        content_type: 'text/plain',
        size_bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        stable_url: '/sample',
        version_url: '/sample?revision=1',
        created_at: new Date().toISOString(),
        creator: { type: 'agent', agent_id: 'agent' },
        updated_at: new Date().toISOString(),
    };
}
