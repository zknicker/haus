import type { Page } from '@playwright/test';
import { assertOpaqueId, runPsql } from './server.ts';

export async function seedArtifactLibrary(page: Page, databaseUrl: string, serverId: string) {
    assertOpaqueId(serverId);
    const userId = runPsql(
        databaseUrl,
        `select user_id from server_memberships where server_id = '${serverId}' limit 1`
    );
    assertOpaqueId(userId);
    const files = [
        ['concept', 'Concept render', 'concept.png', 'image/png', 2048],
        ['report', 'Project notes', 'notes.txt', 'text/plain', 512],
        ['large', 'Large image', 'large.png', 'image/png', 1_048_576],
        ['archive', 'Source archive', 'source.zip', 'application/zip', 4096],
        ['audio', 'Audio draft', 'draft.mp3', 'audio/mpeg', 8192],
        ['readme', 'Release notes', 'readme.md', 'text/markdown', 256],
        ['log', 'Server log', 'server.log', 'text/plain', 2_000_000],
    ] as const;
    for (const [name, title, filename, type, size] of files) {
        const id = `art_${serverId}_${name}`;
        runPsql(
            databaseUrl,
            `insert into artifacts (id, server_id, name, creator_user_id, current_revision_id, next_revision)
            values ('${id}', '${serverId}', '${name}', '${userId}', '${id}_r2', 3);
            insert into artifact_revisions (id, artifact_id, server_id, author_user_id, author_key, byte_size, content_type, filename, object_key, request_id, reserved_bytes, revision_number, sha256, state, title)
            select '${id}_r' || n, '${id}', '${serverId}', '${userId}', 'human:${userId}', ${size}, '${type}', '${filename}', 'test/${id}/' || n, '${id}_request_' || n, 0, n, repeat('a', 64), 'ready', '${title}' from generate_series(1, 2) n;`
        );
    }
    // File transport is isolated here; metadata, membership, search and revisions use the real Server.
    await page.route('**/trpc/**', async (route) => {
        const url = new URL(route.request().url());
        const procedures = url.pathname.split('/trpc/')[1]?.split(',') ?? [];
        if (!procedures.some((procedure) => procedure in fileTransport)) {
            await route.continue();
            return;
        }
        const request = `${decodeURIComponent(url.search)} ${route.request().postData() ?? ''}`;
        const response = await route.fetch();
        const payload = await response.json();
        const replace = (procedure: string | undefined, result: unknown) =>
            procedure && procedure in fileTransport
                ? { result: { data: fileTransport[procedure]?.(page, request) } }
                : result;
        await route.fulfill({
            json: Array.isArray(payload)
                ? payload.map((result, index) => replace(procedures[index], result))
                : replace(procedures[0], payload),
        });
    });
    return { conceptId: `art_${serverId}_concept` };
}

/** Markdown and plain text the seeded text revisions read back as. */
export const seededArtifactText = {
    readme: '# Release notes\n\nShipped **inline text previews** for shared files.',
    notes: 'Plain project notes, revision two.',
} as const;

const fileTransport: Record<string, (page: Page, request: string) => unknown> = {
    'artifact.download': (page) => ({
        download_url: new URL('/prototypes/cove-avatar.png', page.url()).href,
    }),
    'artifact.text': (_page, request) => ({
        status: 'text',
        text: request.includes('_readme_') ? seededArtifactText.readme : seededArtifactText.notes,
    }),
};
