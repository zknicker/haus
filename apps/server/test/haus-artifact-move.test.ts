import { expect, test } from 'bun:test';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

const { publish, state } = artifactDriveFixture('artifact-move');

test('a file move changes only its path: id, revisions, and links stay', async () => {
    const original = await publish({ path: 'haus/drafts/plan.md' });
    const moved = await move('haus/drafts/plan.md', 'haus/final/plan-v1.md');
    expect(moved).toEqual({
        from: 'haus/drafts/plan.md',
        kind: 'file',
        moved_count: 1,
        to: 'haus/final/plan-v1.md',
    });
    const current = await get(original.artifact.artifact_id);
    expect(current).toMatchObject({
        artifact_id: original.artifact.artifact_id,
        filename: 'plan-v1.md',
        path: 'haus/final/plan-v1.md',
        revision_id: original.artifact.revision_id,
        stable_url: original.artifact.stable_url,
    });
    expect(await move('haus/final/plan-v1.md', 'haus/final/Plan-V1.md')).toMatchObject({
        to: 'haus/final/Plan-V1.md',
    });
});

test('a folder moves every file under it in one step', async () => {
    const kept = await publish({ path: 'haus/kit/scripts/run.sh' });
    await publish({ path: 'haus/kit/README.md' });
    await publish({ path: 'haus/kitchen/menu.md' });
    expect(await move('haus/Kit', 'haus/starter-kit')).toEqual({
        from: 'haus/kit',
        kind: 'folder',
        moved_count: 2,
        to: 'haus/starter-kit',
    });
    expect((await get(kept.artifact.artifact_id)).path).toBe('haus/starter-kit/scripts/run.sh');
    const listed = await state.owner.trpc.artifact.list.query({
        order: 'path',
        recursive: true,
        serverId: state.serverId,
    });
    const paths = listed.artifacts.map((item) => item.path);
    expect(paths).toContain('haus/starter-kit/README.md');
    expect(paths).toContain('haus/kitchen/menu.md');
    expect(paths.some((path) => path.startsWith('haus/kit/'))).toBe(false);
    expect(await move('haus/starter-kit/scripts', 'haus/scripts')).toMatchObject({
        moved_count: 1,
    });
});

test('moves refuse taken destinations, self-nesting, and file-folder clashes', async () => {
    await publish({ path: 'haus/a/one.md' });
    await publish({ path: 'haus/a/two.md' });
    await publish({ path: 'haus/b/one.md' });
    await publish({ path: 'haus/loose.md' });
    await expectMove('haus/a/one.md', 'haus/B/ONE.md', 'PATH_TAKEN');
    await expectMove('haus/a', 'haus/b', 'PATH_TAKEN');
    await expectMove('haus/a/one.md', 'haus/b', 'PATH_TAKEN');
    await expectMove('haus/a', 'haus/a/inner', 'PATH_CONFLICT');
    await expectMove('haus/a/one.md', 'haus/loose.md/one.md', 'PATH_CONFLICT');
    await expectMove('haus/missing', 'haus/elsewhere', 'NOT_FOUND');
    await expectMove('haus/a', 'elsewhere', 'INVALID_PATH');
    // A folder move may not stretch a file's path past the 1,024-character limit.
    await publish({ path: `haus/deep/${'d'.repeat(250)}/${'f'.repeat(250)}.md` });
    const longFolder = `haus/${Array.from({ length: 4 }, () => 'x'.repeat(200)).join('/')}`;
    await expectMove('haus/deep', longFolder, 'INVALID_PATH');
    await expect(
        state.owner.trpc.artifact.move.mutate({
            from: '/a',
            serverId: state.serverId,
            to: 'c',
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
});

test('base_revision_id guards a file move and is refused for a folder move', async () => {
    const first = await publish({ path: 'haus/guarded/doc.md', body: 'one' });
    await publish({ path: 'haus/guarded/doc.md', body: 'two', base: first.artifact.revision_id });
    await expect(
        state.owner.trpc.artifact.move.mutate({
            base_revision_id: first.artifact.revision_id,
            from: 'haus/guarded/doc.md',
            serverId: state.serverId,
            to: 'haus/guarded/moved.md',
        })
    ).rejects.toMatchObject({
        data: { artifact: { code: 'REVISION_CONFLICT', current: { revision_number: 2 } } },
    });
    await expect(
        state.owner.trpc.artifact.move.mutate({
            base_revision_id: first.artifact.revision_id,
            from: 'haus/guarded',
            serverId: state.serverId,
            to: 'haus/kept',
        })
    ).rejects.toMatchObject({ data: { artifact: { code: 'INVALID_ARG' } } });
});

function move(from: string, to: string) {
    return state.owner.trpc.artifact.move.mutate({ from, serverId: state.serverId, to });
}
async function expectMove(from: string, to: string, code: string) {
    await expect(move(from, to)).rejects.toMatchObject({ data: { artifact: { code } } });
}
async function get(artifactId: string) {
    return (
        await state.owner.trpc.artifact.get.query({
            artifact_id: artifactId,
            serverId: state.serverId,
        })
    ).artifact;
}
