import { beforeAll, expect, test } from 'bun:test';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

const { publish, state } = artifactDriveFixture('artifact-folders');

beforeAll(async () => {
    for (const [path, minute] of [
        ['starter-kit/README.md', 1],
        ['starter-kit/scripts/tm_check.py', 2],
        ['starter-kit/scripts/build.sh', 3],
        ['starter-kit/assets/logo.png', 4],
        ['notes.md', 5],
    ] as const) {
        const published = await publish({
            contentType: path.endsWith('.png') ? 'image/png' : 'text/plain',
            path,
        });
        await state.harness.sql`
            update artifact_revisions set created_at = ${new Date(Date.UTC(2026, 9, 1, 0, minute))}
            where id = ${published.artifact.revision_id}
        `;
    }
});

test('paths are unique by case- and normalization-folded key', async () => {
    await expect(publish({ path: 'NOTES.md' })).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
    });
    const composed = await publish({ path: 'café.md' });
    await expect(publish({ path: 'Café.md' })).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
        current: { artifact_id: composed.artifact.artifact_id },
    });
});

test('a file never sits where a folder is needed, nor a folder where a file is', async () => {
    await expect(publish({ path: 'notes.md/today.md' })).rejects.toMatchObject({
        code: 'PATH_CONFLICT',
        status: 409,
    });
    await expect(publish({ path: 'starter-kit/scripts' })).rejects.toMatchObject({
        code: 'PATH_CONFLICT',
    });
    await expect(publish({ path: 'Starter-Kit' })).rejects.toMatchObject({
        code: 'PATH_CONFLICT',
    });
});

test('new files adopt the existing casing of their folders', async () => {
    const placed = await publish({ path: 'STARTER-KIT/Scripts/lint.sh' });
    expect(placed.artifact.path).toBe('starter-kit/scripts/lint.sh');
    expect(placed.artifact.filename).toBe('lint.sh');
    await state.owner.trpc.artifact.delete.mutate({
        artifact_id: placed.artifact.artifact_id,
        serverId: state.serverId,
    });
});

test('a folder lists its child folders with counts and its own files', async () => {
    const root = await list({});
    expect(root.folders).toEqual([
        {
            file_count: 4,
            name: 'starter-kit',
            path: 'starter-kit',
            updated_at: '2026-10-01T00:04:00.000Z',
        },
    ]);
    expect(root.artifacts.map((item) => item.path)).toContain('notes.md');
    expect(root.artifacts.some((item) => item.path.includes('/'))).toBe(false);
    const kit = await list({ prefix: 'Starter-Kit' });
    expect(kit.folders.map((folder) => [folder.path, folder.file_count])).toEqual([
        ['starter-kit/assets', 1],
        ['starter-kit/scripts', 2],
    ]);
    expect(kit.artifacts.map((item) => item.path)).toEqual(['starter-kit/README.md']);
    const images = await list({ kind: 'images', prefix: 'starter-kit' });
    expect(images.folders.map((folder) => folder.path)).toEqual(['starter-kit/assets']);
    expect(images.artifacts).toEqual([]);
    expect((await list({ prefix: 'missing' })).folders).toEqual([]);
});

test('recursive listing pages every file under a prefix in stable path order', async () => {
    const first = await list({ limit: 2, order: 'path', prefix: 'starter-kit', recursive: true });
    expect(first.folders).toEqual([]);
    expect(first.artifacts.map((item) => item.path)).toEqual([
        'starter-kit/assets/logo.png',
        'starter-kit/README.md',
    ]);
    expect(first.next_offset).toBe(2);
    const second = await list({
        limit: 2,
        offset: 2,
        order: 'path',
        prefix: 'starter-kit',
        recursive: true,
    });
    expect(second.artifacts.map((item) => item.path)).toEqual([
        'starter-kit/scripts/build.sh',
        'starter-kit/scripts/tm_check.py',
    ]);
    expect(second.next_offset).toBeNull();
    const search = await list({ query: 'tm_check', recursive: true });
    expect(search.artifacts.map((item) => item.path)).toEqual(['starter-kit/scripts/tm_check.py']);
});

function list(input: Partial<Parameters<typeof state.owner.trpc.artifact.list.query>[0]>) {
    return state.owner.trpc.artifact.list.query({ serverId: state.serverId, ...input });
}
