import { expect, test } from 'bun:test';
import { AgentApiClient } from '../agent-api-client.ts';
import { DRIVE_SUBCOMMANDS } from './agent-drive.ts';
import { resolveArtifactId } from './artifact-target.ts';

const artifact = {
    artifact_id: 'art_frompath',
    content_type: 'text/markdown',
    created_at: '2026-11-19T00:00:00.000Z',
    creator: { type: 'agent', agent_id: 'agt_wren' },
    filename: 'q4.md',
    path: 'haus/reports/q4.md',
    revision_id: 'rev_q4',
    revision_number: 1,
    sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    size_bytes: 5,
    stable_url: 'https://haus.chat/s/demo/artifacts/art_frompath',
    title: 'Q4',
    updated_at: '2026-11-19T00:00:00.000Z',
    version_url: 'https://haus.chat/s/demo/artifacts/art_frompath?revision=rev_q4',
};

async function withDrive(run: (client: AgentApiClient, lookups: string[]) => Promise<void>) {
    const lookups: string[] = [];
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch(request) {
            lookups.push(new URL(request.url).searchParams.get('path') ?? '');
            return Response.json({ artifact });
        },
    });
    try {
        const client = new AgentApiClient({
            serverUrl: `http://127.0.0.1:${server.port}`,
            token: `grta_${'a'.repeat(43)}`,
        });
        await run(client, lookups);
    } finally {
        server.stop(true);
    }
}

test('targets resolve ids and pasted links without a lookup', async () => {
    await withDrive(async (client, lookups) => {
        expect(await resolveArtifactId(client, 'art_abc123')).toBe('art_abc123');
        expect(
            await resolveArtifactId(
                client,
                'https://haus.chat/s/demo/artifacts/art_xyz789?revision=rev_1'
            )
        ).toBe('art_xyz789');
        expect(lookups).toEqual([]);
    });
});

test('Drive paths, drive:// citations, and drive/ folder paths look up the same path', async () => {
    await withDrive(async (client, lookups) => {
        for (const target of [
            'haus/reports/q4.md',
            'drive://haus/reports/q4.md',
            'drive/haus/reports/q4.md',
        ]) {
            expect(await resolveArtifactId(client, target)).toBe('art_frompath');
        }
        expect(lookups).toEqual(['haus/reports/q4.md', 'haus/reports/q4.md', 'haus/reports/q4.md']);
    });
});

test('an invalid path is refused before any request', async () => {
    await withDrive(async (client, lookups) => {
        await expect(resolveArtifactId(client, 'haus/../up')).rejects.toThrow(
            /not a valid path in Drive/u
        );
        expect(lookups).toEqual([]);
    });
});

test('the drive family is versions, view, share, always JSON', () => {
    expect(DRIVE_SUBCOMMANDS.map((sub) => sub.name)).toEqual(['versions', 'view', 'share']);
    for (const sub of DRIVE_SUBCOMMANDS) {
        expect(sub.usage).toStartWith(`haus drive ${sub.name} `);
        expect(sub.flags.map((flag) => flag.name)).not.toContain('--json');
    }
});
