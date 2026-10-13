import { expect, test } from 'bun:test';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

const { publish, state } = artifactDriveFixture('artifact-move');

test('a file move changes only its path: id, revisions, and links stay', async () => {
    const original = await publish({ path: 'drafts/plan.md' });
    const moved = await move('drafts/plan.md', 'final/plan-v1.md');
    expect(moved).toEqual({
        from: 'drafts/plan.md',
        kind: 'file',
        moved_count: 1,
        to: 'final/plan-v1.md',
    });
    const current = await get(original.artifact.artifact_id);
    expect(current).toMatchObject({
        artifact_id: original.artifact.artifact_id,
        filename: 'plan-v1.md',
        path: 'final/plan-v1.md',
        revision_id: original.artifact.revision_id,
        stable_url: original.artifact.stable_url,
    });
    expect(await move('final/plan-v1.md', 'final/Plan-V1.md')).toMatchObject({
        to: 'final/Plan-V1.md',
    });
});

test('a folder moves every file under it in one step', async () => {
    const kept = await publish({ path: 'kit/scripts/run.sh' });
    await publish({ path: 'kit/README.md' });
    await publish({ path: 'kitchen/menu.md' });
    expect(await move('Kit', 'starter-kit')).toEqual({
        from: 'kit',
        kind: 'folder',
        moved_count: 2,
        to: 'starter-kit',
    });
    expect((await get(kept.artifact.artifact_id)).path).toBe('starter-kit/scripts/run.sh');
    const listed = await state.owner.trpc.artifact.list.query({
        order: 'path',
        recursive: true,
        serverId: state.serverId,
    });
    const paths = listed.artifacts.map((item) => item.path);
    expect(paths).toContain('starter-kit/README.md');
    expect(paths).toContain('kitchen/menu.md');
    expect(paths.some((path) => path.startsWith('kit/'))).toBe(false);
    expect(await move('starter-kit/scripts', 'scripts')).toMatchObject({ moved_count: 1 });
});

test('moves refuse taken destinations, self-nesting, and file-folder clashes', async () => {
    await publish({ path: 'a/one.md' });
    await publish({ path: 'a/two.md' });
    await publish({ path: 'b/one.md' });
    await publish({ path: 'loose.md' });
    await expectMove('a/one.md', 'B/ONE.md', 'PATH_TAKEN');
    await expectMove('a', 'b', 'PATH_TAKEN');
    await expectMove('a/one.md', 'b', 'PATH_TAKEN');
    await expectMove('a', 'a/inner', 'PATH_CONFLICT');
    await expectMove('a/one.md', 'loose.md/one.md', 'PATH_CONFLICT');
    await expectMove('missing', 'elsewhere', 'NOT_FOUND');
    // A folder move may not stretch a file's path past the 1,024-character limit.
    await publish({ path: `deep/${'d'.repeat(250)}/${'f'.repeat(250)}.md` });
    const longFolder = Array.from({ length: 4 }, () => 'x'.repeat(200)).join('/');
    await expectMove('deep', longFolder, 'INVALID_PATH');
    await expect(
        state.owner.trpc.artifact.move.mutate({
            from: '/a',
            serverId: state.serverId,
            to: 'c',
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
});

test('base_revision_id guards a file move and is refused for a folder move', async () => {
    const first = await publish({ path: 'guarded/doc.md', body: 'one' });
    await publish({ path: 'guarded/doc.md', body: 'two', base: first.artifact.revision_id });
    await expect(
        state.owner.trpc.artifact.move.mutate({
            base_revision_id: first.artifact.revision_id,
            from: 'guarded/doc.md',
            serverId: state.serverId,
            to: 'guarded/moved.md',
        })
    ).rejects.toMatchObject({
        data: { artifact: { code: 'REVISION_CONFLICT', current: { revision_number: 2 } } },
    });
    await expect(
        state.owner.trpc.artifact.move.mutate({
            base_revision_id: first.artifact.revision_id,
            from: 'guarded',
            serverId: state.serverId,
            to: 'kept',
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
