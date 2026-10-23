import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneCheckpoints } from './heartbeat-checkpoints.ts';

let root: string;
beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-heartbeat-checkpoints-'));
});
afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('retention deletes checkpoints and daily files older than 14 days and nothing else', async () => {
    const workspace = join(root, 'workspace');
    const checkpoints = join(workspace, 'heartbeat', 'checkpoints');
    const daily = join(workspace, 'heartbeat', 'daily');
    for (const day of ['2026-10-05', '2026-10-06', '2026-10-19']) {
        await mkdir(join(checkpoints, day), { recursive: true });
        await writeFile(join(checkpoints, day, '10-00.md'), day);
    }
    await mkdir(join(checkpoints, 'scratch'), { recursive: true });
    await mkdir(daily, { recursive: true });
    await writeFile(join(daily, '2026-10-05.md'), 'old');
    await writeFile(join(daily, '2026-10-06.md'), 'edge');
    await writeFile(join(daily, 'notes.md'), 'mine');
    await writeFile(join(workspace, 'MEMORY.md'), 'memory');
    await mkdir(join(workspace, 'notes'), { recursive: true });
    await writeFile(join(workspace, 'notes', '2026-01-01.md'), 'a note');

    await pruneCheckpoints(workspace, new Date(2026, 9, 20, 12));

    expect((await readdir(checkpoints)).sort()).toEqual(['2026-10-06', '2026-10-19', 'scratch']);
    expect((await readdir(daily)).sort()).toEqual(['2026-10-06.md', 'notes.md']);
    expect(await readdir(join(workspace, 'notes'))).toEqual(['2026-01-01.md']);
    expect(await Bun.file(join(workspace, 'MEMORY.md')).text()).toBe('memory');
});
