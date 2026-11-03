import { expect, test } from 'bun:test';
import { artifactPublicTokenPattern } from '@haus/api';
import { deleteArtifact } from '../src/artifacts/delete.ts';
import { moveArtifacts } from '../src/artifacts/move.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';
import { createHausClient } from './haus-client.ts';

/**
 * Public links (specs/artifact-public-links.md): an opt-in `/f/<token>` URL that serves a file's
 * current revision to anyone, with safe content types, until it is disabled or the file is deleted.
 */
const { publish, state, storage } = artifactDriveFixture('artifact-public-links');
const favicon = () =>
    Bun.file(new URL('../../website/public/favicon-32.png', import.meta.url)).bytes();

test('sharing creates one unguessable link that follows the current revision across moves', async () => {
    const first = await publish({
        body: await favicon(),
        contentType: 'image/png',
        path: 'pod/a.png',
    });
    const artifactId = first.artifact.artifact_id;
    const target = { artifact_id: artifactId, serverId: state.serverId };
    expect(await state.owner.trpc.artifact.publicLink.query(target)).toEqual({
        artifact_id: artifactId,
        link: null,
    });
    const { link } = await state.owner.trpc.artifact.share.mutate(target);
    if (!link) {
        throw new Error('share returned no link');
    }
    const url = new URL(link.url);
    expect(url.origin).toBe(state.harness.appOrigin);
    const token = url.pathname.replace('/f/', '');
    expect(token).toMatch(artifactPublicTokenPattern);
    expect(url.pathname).not.toContain(artifactId);
    expect(link).toMatchObject({ can_disable: true, creator: { type: 'user' } });
    // Sharing again reuses the live link.
    expect((await state.owner.trpc.artifact.share.mutate(target)).link?.url).toBe(link.url);

    const image = await get(token);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('content-disposition')).toStartWith('inline; filename="a.png"');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    expect(image.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(image.headers.get('cache-control')).toBe('public, max-age=60');
    expect(image.headers.get('content-security-policy')).toContain('sandbox');
    expect(image.headers.get('etag')).toBe(`"${first.artifact.sha256}"`);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(await favicon());
    const cached = await get(token, { 'if-none-match': `"${first.artifact.sha256}"` });
    expect(cached.status).toBe(304);
    const head = await fetch(new URL(`/f/${token}`, state.harness.url), { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toBe('image/png');
    // HEAD reports the object's real size, not Fastify's empty-body zero.
    expect(head.headers.get('content-length')).toBe(String((await favicon()).byteLength));

    const thumbnail = await get(`${token}/thumbnail`);
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get('content-type')).toBe('image/webp');
    await thumbnail.arrayBuffer();

    // A new revision and a rename keep the link and serve the latest bytes.
    await publish({
        base: first.artifact.revision_id,
        body: 'second',
        contentType: 'text/plain',
        path: 'pod/a.png',
    });
    await moveArtifacts(state.connection.db, state.actor, state.harness.appOrigin, {
        from: 'pod/a.png',
        to: 'pod/renamed.txt',
    });
    const latest = await get(token);
    expect(await latest.text()).toBe('second');
    expect(latest.headers.get('content-disposition')).toStartWith('inline; filename="renamed.txt"');

    const page = await state.owner.trpc.artifact.list.query({
        prefix: 'pod',
        serverId: state.serverId,
    });
    expect(page.public_links[artifactId]?.url).toBe(link.url);
});

test('disabling answers 404 at once and re-enabling issues a new token', async () => {
    const created = await publish({ body: 'notes', path: 'pod/notes.txt' });
    const target = { artifact_id: created.artifact.artifact_id, serverId: state.serverId };
    const first = await tokenOf(state.owner.trpc.artifact.share.mutate(target));
    expect((await get(first)).status).toBe(200);
    await state.owner.trpc.artifact.unshare.mutate(target);
    const gone = await get(first);
    expect(gone.status).toBe(404);
    expect(await gone.text()).toBe('Not found');
    expect((await state.owner.trpc.artifact.publicLink.query(target)).link).toBeNull();
    const second = await tokenOf(state.owner.trpc.artifact.share.mutate(target));
    expect(second).not.toBe(first);
    expect((await get(first)).status).toBe(404);
    expect((await get(second)).status).toBe(200);
});

test('deleting the file kills its link; every miss looks the same', async () => {
    const created = await publish({ body: 'gone soon', path: 'pod/doomed.txt' });
    const target = { artifact_id: created.artifact.artifact_id, serverId: state.serverId };
    const token = await tokenOf(state.owner.trpc.artifact.share.mutate(target));
    await deleteArtifact(state.connection.db, state.actor, storage, target.artifact_id);
    const misses = await Promise.all(
        [token, `${token}/thumbnail`, 'A'.repeat(32), 'short', `${token}x`].map((path) => get(path))
    );
    for (const miss of misses) {
        expect(miss.status).toBe(404);
        expect(await miss.text()).toBe('Not found');
    }
});

test('user content is never served as HTML; unknown types download', async () => {
    const cases = [
        [
            'pod/page.html',
            'text/html',
            '<script>alert(1)</script>',
            'text/plain; charset=utf-8',
            'inline',
        ],
        ['pod/data.json', 'application/json', '{}', 'text/plain; charset=utf-8', 'inline'],
        [
            'pod/art.svg',
            'image/svg+xml',
            '<svg xmlns="http://www.w3.org/2000/svg"/>',
            'image/svg+xml',
            'inline',
        ],
        ['pod/print.pdf', 'application/pdf', '%PDF-1.4', 'application/pdf', 'inline'],
        [
            'pod/blob.bin',
            'application/x-msdownload',
            'MZ',
            'application/octet-stream',
            'attachment',
        ],
        [
            'pod/fake.png',
            'text/html; charset=utf-8',
            '<html>',
            'text/plain; charset=utf-8',
            'inline',
        ],
    ] as const;
    for (const [path, stored, body, served, disposition] of cases) {
        const created = await publish({ body, contentType: stored.split(';')[0], path });
        const token = await tokenOf(
            state.owner.trpc.artifact.share.mutate({
                artifact_id: created.artifact.artifact_id,
                serverId: state.serverId,
            })
        );
        const response = await get(token);
        expect(response.headers.get('content-type')).toBe(served);
        expect(response.headers.get('content-disposition')).toStartWith(`${disposition};`);
        expect(response.headers.get('content-type')).not.toContain('html');
        expect(await response.text()).toBe(body);
    }
});

test('only Server members can create or read a link', async () => {
    const created = await publish({ body: 'private', path: 'pod/private.txt' });
    const outsider = createHausClient(
        state.harness,
        await state.harness.humans.mintSessionToken('artifact-public-links_outsider')
    );
    const target = { artifact_id: created.artifact.artifact_id, serverId: state.serverId };
    await expect(outsider.trpc.artifact.share.mutate(target)).rejects.toThrow();
    await expect(outsider.trpc.artifact.publicLink.query(target)).rejects.toThrow();
    outsider.close();
});

async function tokenOf(result: Promise<{ link: { url: string } | null }>) {
    const { link } = await result;
    if (!link) {
        throw new Error('share returned no link');
    }
    return new URL(link.url).pathname.replace('/f/', '');
}

function get(path: string, headers: Record<string, string> = {}) {
    return fetch(new URL(`/f/${path}`, state.harness.url), { headers });
}
