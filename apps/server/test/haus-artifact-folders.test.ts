import { beforeAll, expect, test } from 'bun:test';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

const { publish, state } = artifactDriveFixture('artifact-folders');
const starterKit = [
    'haus/starter-kit/README.md',
    'haus/starter-kit/scripts/tm_check.py',
    'haus/starter-kit/scripts/build.sh',
    'haus/starter-kit/assets/logo.png',
] as const;

beforeAll(async () => {
    for (const [path, minute] of [
        ['haus/starter-kit/README.md', 1],
        ['haus/starter-kit/scripts/tm_check.py', 2],
        ['haus/starter-kit/scripts/build.sh', 3],
        ['haus/starter-kit/assets/logo.png', 4],
        ['haus/notes.md', 5],
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
    await expect(publish({ path: 'haus/NOTES.md' })).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
    });
    const composed = await publish({ path: 'haus/café.md' });
    await expect(publish({ path: 'haus/Café.md' })).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
        current: { artifact_id: composed.artifact.artifact_id },
    });
});

test('a file never sits where a folder is needed, nor a folder where a file is', async () => {
    await expect(publish({ path: 'haus/notes.md/today.md' })).rejects.toMatchObject({
        code: 'PATH_CONFLICT',
        status: 409,
    });
    await expect(publish({ path: 'haus/starter-kit/scripts' })).rejects.toMatchObject({
        code: 'PATH_CONFLICT',
    });
    await expect(publish({ path: 'haus/Starter-Kit' })).rejects.toMatchObject({
        code: 'PATH_CONFLICT',
    });
});

test('new files adopt the existing casing of their folders and the area', async () => {
    const placed = await publish({ path: 'HAUS/STARTER-KIT/Scripts/lint.sh' });
    expect(placed.artifact.path).toBe('haus/starter-kit/scripts/lint.sh');
    expect(placed.artifact.filename).toBe('lint.sh');
    await state.owner.trpc.artifact.delete.mutate({
        artifact_id: placed.artifact.artifact_id,
        serverId: state.serverId,
    });
});

test('the Drive root lists the area folders', async () => {
    const root = await state.owner.trpc.artifact.list.query({ serverId: state.serverId });
    expect(root.folders.map((folder) => [folder.path, folder.file_count])).toEqual([['haus', 6]]);
    expect(root.artifacts).toEqual([]);
});

test('a folder lists its child folders with counts and its own files', async () => {
    const root = await listInHaus({});
    expect(root.folders).toEqual([
        {
            file_count: 4,
            name: 'starter-kit',
            path: 'haus/starter-kit',
            size_bytes: bodyBytes(...starterKit),
            updated_at: '2026-10-01T00:04:00.000Z',
        },
    ]);
    expect(root.artifacts.map((item) => item.path)).toContain('haus/notes.md');
    expect(root.artifacts.some((item) => item.path.split('/').length > 2)).toBe(false);
    expect(root.summary).toEqual({
        folders: 1,
        files_in_folders: 4,
        files: 2,
        size_bytes: bodyBytes(...starterKit, 'haus/notes.md', 'haus/café.md'),
    });
    const kit = await listInHaus({ prefix: 'Starter-Kit' });
    expect(kit.folders.map((folder) => [folder.path, folder.file_count])).toEqual([
        ['haus/starter-kit/assets', 1],
        ['haus/starter-kit/scripts', 2],
    ]);
    expect(kit.artifacts.map((item) => item.path)).toEqual(['haus/starter-kit/README.md']);
    expect(kit.summary).toEqual({
        folders: 2,
        files_in_folders: 3,
        files: 1,
        size_bytes: bodyBytes(...starterKit),
    });
    const images = await listInHaus({ kind: 'images', prefix: 'starter-kit' });
    expect(images.folders.map((folder) => folder.path)).toEqual(['haus/starter-kit/assets']);
    expect(images.artifacts).toEqual([]);
    expect(images.summary).toEqual({
        folders: 1,
        files_in_folders: 1,
        files: 0,
        size_bytes: bodyBytes('haus/starter-kit/assets/logo.png'),
    });
    const missing = await listInHaus({ prefix: 'missing' });
    expect(missing.folders).toEqual([]);
    expect(missing.summary).toEqual({ folders: 0, files_in_folders: 0, files: 0, size_bytes: 0 });
});

test('child folders come newest first, with ties broken by path', async () => {
    const added = await publish({ path: 'haus/starter-kit/zeta/new.md' });
    try {
        const kit = await listInHaus({ prefix: 'starter-kit' });
        expect(kit.folders.map((folder) => folder.path)).toEqual([
            'haus/starter-kit/zeta',
            'haus/starter-kit/assets',
            'haus/starter-kit/scripts',
        ]);
        await state.harness.sql`
            update artifact_revisions set created_at = ${new Date(Date.UTC(2026, 9, 1, 0, 4))}
            where id = ${added.artifact.revision_id}
        `;
        const tied = await listInHaus({ prefix: 'starter-kit' });
        expect(tied.folders.map((folder) => folder.path)).toEqual([
            'haus/starter-kit/assets',
            'haus/starter-kit/zeta',
            'haus/starter-kit/scripts',
        ]);
    } finally {
        await state.owner.trpc.artifact.delete.mutate({
            artifact_id: added.artifact.artifact_id,
            serverId: state.serverId,
        });
    }
});

test('the summary counts every matching file, whatever the page or recursion', async () => {
    const first = await listInHaus({ limit: 1 });
    expect(first.artifacts).toHaveLength(1);
    expect(first.next_offset).toBe(1);
    expect(first.folders).toHaveLength(1);
    expect(first.summary).toMatchObject({ folders: 1, files_in_folders: 4, files: 2 });
    const second = await listInHaus({ limit: 1, offset: 1 });
    expect(second.folders).toEqual([]);
    expect(second.summary).toEqual(first.summary);
    const query = await listInHaus({ query: 'scripts' });
    expect(query.folders.map((folder) => [folder.path, folder.file_count])).toEqual([
        ['haus/starter-kit', 2],
    ]);
    expect(query.summary).toEqual({
        folders: 1,
        files_in_folders: 2,
        files: 0,
        size_bytes: bodyBytes(
            'haus/starter-kit/scripts/tm_check.py',
            'haus/starter-kit/scripts/build.sh'
        ),
    });
    const recursive = await listInHaus({ limit: 2, prefix: 'starter-kit', recursive: true });
    expect(recursive.artifacts).toHaveLength(2);
    expect(recursive.summary).toEqual({
        folders: 2,
        files_in_folders: 3,
        files: 1,
        size_bytes: bodyBytes(...starterKit),
    });
});

test('recursive listing pages every file under a prefix in stable path order', async () => {
    const first = await listInHaus({
        limit: 2,
        order: 'path',
        prefix: 'starter-kit',
        recursive: true,
    });
    expect(first.folders).toEqual([]);
    expect(first.artifacts.map((item) => item.path)).toEqual([
        'haus/starter-kit/assets/logo.png',
        'haus/starter-kit/README.md',
    ]);
    expect(first.next_offset).toBe(2);
    const second = await listInHaus({
        limit: 2,
        offset: 2,
        order: 'path',
        prefix: 'starter-kit',
        recursive: true,
    });
    expect(second.artifacts.map((item) => item.path)).toEqual([
        'haus/starter-kit/scripts/build.sh',
        'haus/starter-kit/scripts/tm_check.py',
    ]);
    expect(second.next_offset).toBeNull();
    const search = await listInHaus({ query: 'tm_check', recursive: true });
    expect(search.artifacts.map((item) => item.path)).toEqual([
        'haus/starter-kit/scripts/tm_check.py',
    ]);
});

function listInHaus(input: Partial<Parameters<typeof state.owner.trpc.artifact.list.query>[0]>) {
    const { prefix, ...rest } = input;
    return state.owner.trpc.artifact.list.query({
        prefix: prefix ? `haus/${prefix}` : 'haus',
        serverId: state.serverId,
        ...rest,
    });
}

function bodyBytes(...paths: string[]) {
    return paths.reduce((total, path) => total + Buffer.byteLength(path), 0);
}
