import { expect, test } from 'bun:test';
import { readHausReleaseDiscovery } from './haus-release-route.ts';

const snapshot = {
    components: {
        agent: '1.0.0',
        computer: '1.2.0',
        desktopApp: '1.3.0',
        ios: { buildNumber: 4, version: '1.4.0' },
        server: '1.5.0',
    },
    date: '2026-08-28',
    schemaVersion: 1 as const,
    sourceRevision: 'a'.repeat(40),
    version: '2.0.0',
};

test('proxies the latest release with the truthful running Server identity', async () => {
    const result = await readHausReleaseDiscovery({
        fetchSnapshot: async () => Response.json(snapshot),
        releaseIdentity: {
            contentDigest: 'b'.repeat(64),
            productVersion: '1.9.0',
            releaseId: '1.5.0+git.aaaaaaaaaaaa',
            serverVersion: '1.5.0',
            sourceRevision: 'a'.repeat(40),
        },
    });
    expect(result).toEqual({
        ok: true,
        value: { latest: snapshot, running: { agent: null, server: '1.5.0' } },
    });
});

test('keeps development runtime identity unknown and fails closed upstream', async () => {
    const unavailable = await readHausReleaseDiscovery({
        fetchSnapshot: async () => new Response(null, { status: 503 }),
    });
    expect(unavailable).toEqual({
        error: { code: 'release_snapshot_unavailable', status: 503 },
        ok: false,
    });
});
