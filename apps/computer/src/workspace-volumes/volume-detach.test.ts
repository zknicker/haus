import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeHdiutil, holderListing } from './disk-fixtures.ts';
import { parseMountpoints } from './disk-image.ts';
import { detachWorkspaceVolume, WorkspaceDetachError } from './volume-detach.ts';

let root: string;
let mountpoint: string;
const codexTree = holderListing([63_640, 'node'], [63_647, 'codex']);

beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'haus-volume-detach-')));
    mountpoint = join(root, 'workspace');
    await mkdir(mountpoint);
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('waits for the stopped session tree to exit, then retries a busy detach', async () => {
    const host = fakeHdiutil({
        detach: (attempt) => (attempt === 1 ? 'busy' : 'ok'),
        holders: (poll) => (poll < 2 ? codexTree : ''),
        mounted: [mountpoint],
    });

    const outcome = await detachWorkspaceVolume({
        disk: host.disk,
        mountpoint,
        onBusy: 'force',
        pacing: host.pacing,
    });

    expect(outcome).toEqual({ attempts: 2, kind: 'detached' });
    expect(host.sleeps).toEqual([250, 250, 250]);
    expect(host.calls.some((call) => call.includes('-force'))).toBe(false);
    expect(host.mounted.has(mountpoint)).toBe(false);
});

test('forces a volume that stays busy after every retry and names its holders', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = fakeHdiutil({
        detach: (_attempt, force) => (force ? 'ok' : 'busy'),
        holders: () => codexTree,
        mounted: [mountpoint],
    });
    try {
        const outcome = await detachWorkspaceVolume({
            disk: host.disk,
            mountpoint,
            onBusy: 'force',
            pacing: host.pacing,
        });

        expect(outcome).toEqual({
            attempts: 5,
            holders: [
                { command: 'node', pid: 63_640 },
                { command: 'codex', pid: 63_647 },
            ],
            kind: 'forced',
        });
        expect(host.calls.at(-1)).toEqual(['hdiutil', 'detach', '-force', mountpoint]);
        expect(host.sleeps).toEqual([250, 250, 250, 250, 250, 500, 1000, 2000]);
        expect(String(warn.mock.calls[0]?.[0])).toContain('node[63640], codex[63647]');
    } finally {
        warn.mockRestore();
    }
});

test('the fail policy leaves a busy volume mounted and never forces', async () => {
    const host = fakeHdiutil({
        detach: () => 'busy',
        holders: () => codexTree,
        mounted: [mountpoint],
    });

    const detach = detachWorkspaceVolume({
        disk: host.disk,
        mountpoint,
        onBusy: 'fail',
        pacing: host.pacing,
    });

    await expect(detach).rejects.toBeInstanceOf(WorkspaceDetachError);
    await expect(detach).rejects.toThrow('codex[63647]');
    expect(host.calls.some((call) => call.includes('-force'))).toBe(false);
    expect(host.mounted.has(mountpoint)).toBe(true);
});

test('a detach failure other than busy is not retried or forced', async () => {
    const host = fakeHdiutil({ detach: () => 'missing', mounted: [mountpoint] });

    await expect(
        detachWorkspaceVolume({
            disk: host.disk,
            mountpoint,
            onBusy: 'force',
            pacing: host.pacing,
        })
    ).rejects.toThrow('No such file');
    expect(host.calls.filter((call) => call[1] === 'detach')).toHaveLength(1);
});

test('mount table parsing keeps mountpoints with spaces', () => {
    expect(
        parseMountpoints(
            [
                '/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)',
                '/dev/disk29s1 on /Users/me/My Haus/agents/agt_x/workspace (apfs, local, nobrowse)',
            ].join('\n')
        )
    ).toEqual(['/', '/Users/me/My Haus/agents/agt_x/workspace']);
});
