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

type FileTransport = Record<string, (input: TransportInput) => unknown>;

export function libraryFileTransport(transport: Transport) {
    const { page } = transport;
    const handlers: FileTransport = {
        'artifact.download': () => ({
            download_url: new URL('/prototypes/agent-avatar.png', page.url()).href,
        }),
        'artifact.thumbnail': () => ({
            expires_at: new Date(Date.now() + 300_000).toISOString(),
            status: 'ready',
            thumbnail_url: new URL('/prototypes/agent-avatar.png', page.url()).href,
        }),
        'artifact.text': (input) => ({ status: 'text', text: revisionText(input) }),
        'artifact.restore': (input) => restoreRevision(transport, input),
    };
    return handlers;
}

export async function routeAgentPageText(page: Page, html: (revisionId: string) => string) {
    await routeFileTransport(page, {
        'artifact.text': ({ revision_id = '' }) => ({ status: 'text', text: html(revision_id) }),
    });
}

export async function routeFileTransport(page: Page, fileTransport: FileTransport) {
    await page.route('**/trpc/**', async (route) => {
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
                ? { result: { data: fileTransport[procedure]?.(input) } }
                : result;
        };
        await route.fulfill({
            json: Array.isArray(payload)
                ? payload.map((result, index) => replace(index, result))
                : replace(0, payload),
        });
    });
}

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
