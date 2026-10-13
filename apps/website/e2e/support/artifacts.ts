import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { assertOpaqueId, runPsql } from './server.ts';

interface SeededFile {
    agent?: boolean;
    key: string;
    path: string;
    size: number;
    title: string;
    type: string;
}

/** Root files keep their earlier titles; the drive adds folders, one file by an Agent. */
const seededFiles: readonly SeededFile[] = [
    { key: 'concept', path: 'concept.png', size: 2048, title: 'Concept render', type: 'image/png' },
    { key: 'report', path: 'notes.txt', size: 512, title: 'Project notes', type: 'text/plain' },
    { key: 'large', path: 'large.png', size: 1_048_576, title: 'Large image', type: 'image/png' },
    {
        key: 'archive',
        path: 'source.zip',
        size: 4096,
        title: 'Source archive',
        type: 'application/zip',
    },
    { key: 'audio', path: 'draft.mp3', size: 8192, title: 'Audio draft', type: 'audio/mpeg' },
    { key: 'readme', path: 'readme.md', size: 256, title: 'Release notes', type: 'text/markdown' },
    { key: 'log', path: 'server.log', size: 2_000_000, title: 'Server log', type: 'text/plain' },
    {
        key: 'kitreadme',
        path: 'starter-kit/README.md',
        size: 300,
        title: 'README.md',
        type: 'text/markdown',
    },
    {
        key: 'logo',
        path: 'starter-kit/assets/logo.png',
        size: 1024,
        title: 'logo.png',
        type: 'image/png',
    },
    {
        agent: true,
        key: 'tmcheck',
        path: 'starter-kit/scripts/tm_check.py',
        size: 900,
        title: 'tm_check.py',
        type: 'text/x-python',
    },
    {
        key: 'setup',
        path: 'starter-kit/scripts/setup.sh',
        size: 400,
        title: 'setup.sh',
        type: 'text/x-shellscript',
    },
    { key: 'guide', path: 'docs/guide.md', size: 700, title: 'guide.md', type: 'text/markdown' },
];

/** The seeded Agent that created `starter-kit/scripts/tm_check.py`. */
export const seededArtifactAgent = 'Drive Helper';

export async function seedArtifactLibrary(page: Page, databaseUrl: string, serverId: string) {
    assertOpaqueId(serverId);
    const userId = seedMember(databaseUrl, serverId);
    const agentId = `agt_${serverId}_drive`;
    const computerId = `cmp_${createHash('sha256').update(serverId).digest('hex').slice(0, 16)}`;
    runPsql(
        databaseUrl,
        // The App lists Agents assigned to a Computer; an offline one is enough to name the creator.
        `insert into computers (id, server_id, attached_by_user_id, credential_hash, health)
         values ('${computerId}', '${serverId}', '${userId}', md5(random()::text) || md5(random()::text), 'offline');
         insert into agents (id, server_id, computer_id, handle, display_name, home_timezone, desired_runtime_id, desired_model_id)
         values ('${agentId}', '${serverId}', '${computerId}', 'drive-helper', '${seededArtifactAgent}', 'America/New_York', 'codex', 'gpt-5.6-sol')`
    );
    for (const file of seededFiles) {
        const id = `art_${serverId}_${file.key}`;
        const creator = file.agent ? `'${agentId}', null` : `null, '${userId}'`;
        const author = file.agent
            ? `'${agentId}', null, 'agent:${agentId}'`
            : `null, '${userId}', 'human:${userId}'`;
        runPsql(
            databaseUrl,
            `insert into artifacts (id, server_id, path, path_key, creator_agent_id, creator_user_id, current_revision_id, next_revision)
            values ('${id}', '${serverId}', '${file.path}', lower('${file.path}'), ${creator}, '${id}_r2', 3);
            insert into artifact_revisions (id, artifact_id, server_id, author_agent_id, author_user_id, author_key, byte_size, content_type, filename, object_key, request_id, reserved_bytes, revision_number, sha256, state, title)
            select '${id}_r' || n, '${id}', '${serverId}', ${author}, ${file.size}, '${file.type}', '${file.path.split('/').at(-1)}', 'test/${id}/' || n, '${id}_request_' || n, 0, n, repeat('a', 64), 'ready', '${file.title}' from generate_series(1, 2) n;`
        );
    }
    await routeFileTransport(page);
    return { conceptId: `art_${serverId}_concept` };
}

/**
 * e2e has no R2 bucket, so member uploads are answered here: each publish
 * becomes a real artifact row (or a new revision with `replace=true`, else a
 * 409 conflict), and the library reads it back from the real Server.
 */
export async function routeArtifactUploads(page: Page, databaseUrl: string, serverId: string) {
    assertOpaqueId(serverId);
    const userId = seedMember(databaseUrl, serverId);
    let sequence = 0;
    await page.route('**/artifacts/*/publish?*', async (route) => {
        const url = new URL(route.request().url());
        const path = url.searchParams.get('path') ?? '';
        const replace = url.searchParams.get('replace') === 'true';
        const type = url.searchParams.get('content_type') ?? 'application/octet-stream';
        const size = route.request().postDataBuffer()?.length ?? 0;
        const quoted = path.replaceAll("'", "''");
        const existing = runPsql(
            databaseUrl,
            `select id || '|' || next_revision from artifacts where server_id = '${serverId}' and path_key = lower('${quoted}') and deleted_at is null`
        );
        if (existing && !replace) {
            await route.fulfill({
                json: { code: 'REVISION_CONFLICT', current: null, message: 'Path is taken.' },
                status: 409,
            });
            return;
        }
        sequence += 1;
        const [id = `art_${serverId}_upload_${sequence}`, next = '1'] = existing
            ? existing.split('|')
            : [];
        const revision = `${id}_u${sequence}`;
        const name = quoted.split('/').at(-1);
        runPsql(
            databaseUrl,
            `${existing ? '' : `insert into artifacts (id, server_id, path, path_key, creator_user_id, next_revision) values ('${id}', '${serverId}', '${quoted}', lower('${quoted}'), '${userId}', 1);`}
            insert into artifact_revisions (id, artifact_id, server_id, author_user_id, author_key, byte_size, content_type, filename, object_key, request_id, reserved_bytes, revision_number, sha256, state, title)
            values ('${revision}', '${id}', '${serverId}', '${userId}', 'human:${userId}', ${size}, '${type}', '${name}', 'test/${revision}', '${revision}_request', 0, ${next}, repeat('b', 64), 'ready', '${name}');
            update artifacts set current_revision_id = '${revision}', next_revision = ${Number(next) + 1} where id = '${id}';`
        );
        const now = new Date().toISOString();
        await route.fulfill({
            json: {
                artifact: {
                    artifact_id: id,
                    content_type: type,
                    created_at: now,
                    creator: { type: 'user', user_id: userId },
                    filename: path.split('/').at(-1),
                    path,
                    revision_id: revision,
                    revision_number: Number(next),
                    sha256: 'b'.repeat(64),
                    size_bytes: size,
                    stable_url: `${url.origin}/artifacts/${id}`,
                    title: path.split('/').at(-1),
                    updated_at: now,
                    version_url: `${url.origin}/artifacts/${id}?revision=${revision}`,
                },
            },
        });
    });
}

/** Markdown and plain text the seeded text revisions read back as. */
export const seededArtifactText = {
    readme: '# Release notes\n\nShipped **inline text previews** for shared files.',
    notes: 'Plain project notes, revision two.',
} as const;

function seedMember(databaseUrl: string, serverId: string) {
    const userId = runPsql(
        databaseUrl,
        `select user_id from server_memberships where server_id = '${serverId}' limit 1`
    );
    assertOpaqueId(userId);
    return userId;
}

// File transport is isolated here; metadata, membership, search and revisions use the real Server.
async function routeFileTransport(page: Page) {
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
}

const fileTransport: Record<string, (page: Page, request: string) => unknown> = {
    'artifact.download': (page) => ({
        download_url: new URL('/prototypes/cove-avatar.png', page.url()).href,
    }),
    'artifact.text': (_page, request) => ({
        status: 'text',
        text: request.includes('_readme_') ? seededArtifactText.readme : seededArtifactText.notes,
    }),
};
