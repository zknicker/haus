import type { Page } from '@playwright/test';
import { assertOpaqueId, runPsql } from './server.ts';

export const seededArtifactText = {
    readme: '# Release notes\n\nShipped **inline text previews** for shared files.',
    notes: 'Plain project notes, revision two.',
    notesFirst: 'Plain project notes, revision one.',
} as const;

interface Transport {
    databaseUrl: string;
    page: Page;
    userId: string;
}

type TransportInput = Partial<Record<'artifact_id' | 'revision_id', string>>;

export async function routeFileTransport(transport: Transport) {
    await transport.page.route('**/trpc/**', async (route) => {
        const url = new URL(route.request().url());
        const procedures = url.pathname.split('/trpc/')[1]?.split(',') ?? [];
        if (!procedures.some((procedure) => procedure in fileTransport)) {
            await route.continue();
            return;
        }
        const body = route.request().postDataJSON() ?? {};
        const batched = url.searchParams.has('batch');
        const response = await route.fetch();
        const payload = await response.json();
        const replace = (index: number, result: unknown) => {
            const procedure = procedures[index];
            const input: TransportInput = batched ? body[String(index)] : body;
            return procedure && procedure in fileTransport
                ? { result: { data: fileTransport[procedure]?.(transport, input) } }
                : result;
        };
        await route.fulfill({
            json: Array.isArray(payload)
                ? payload.map((result, index) => replace(index, result))
                : replace(0, payload),
        });
    });
}

const fileTransport: Record<string, (transport: Transport, input: TransportInput) => unknown> = {
    'artifact.download': ({ page }) => ({
        download_url: new URL('/prototypes/cove-avatar.png', page.url()).href,
    }),
    'artifact.thumbnail': ({ page }) => ({
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        status: 'ready',
        thumbnail_url: new URL('/prototypes/cove-avatar.png', page.url()).href,
    }),
    'artifact.text': (_transport, input) => ({ status: 'text', text: revisionText(input) }),
    'artifact.restore': restoreRevision,
};

function revisionText({ artifact_id = '', revision_id = '' }: TransportInput) {
    if (artifact_id.endsWith('_readme')) {
        return seededArtifactText.readme;
    }
    return revision_id.includes('_report_r1')
        ? seededArtifactText.notesFirst
        : seededArtifactText.notes;
}

function restoreRevision({ databaseUrl, userId }: Transport, input: TransportInput) {
    const { artifact_id: artifactId, revision_id: revisionId } = input;
    assertOpaqueId(artifactId);
    assertOpaqueId(revisionId);
    const next = runPsql(
        databaseUrl,
        `select next_revision from artifacts where id = '${artifactId}'`
    );
    const restored = `${revisionId}_restored${next}`;
    runPsql(
        databaseUrl,
        `insert into artifact_revisions (id, artifact_id, server_id, author_user_id, author_key, byte_size, content_type, filename, object_key, request_id, reserved_bytes, revision_number, sha256, state, title)
         select '${restored}', artifact_id, server_id, '${userId}', 'human:${userId}', byte_size, content_type, filename, object_key, '${restored}_request', 0, ${next}, sha256, 'ready', title
         from artifact_revisions where id = '${revisionId}';
         update artifacts set current_revision_id = '${restored}', next_revision = ${Number(next) + 1} where id = '${artifactId}';`
    );
    return { artifact: { revision_id: restored, revision_number: Number(next) } };
}
