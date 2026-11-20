import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { writerFolder } from './drive-folder.test-utils.ts';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';

let server: DriveServer;
const folders: ReturnType<typeof writerFolder>[] = [];
afterEach(async () => {
    server.stop();
    for (const folder of folders.splice(0)) {
        await folder.cleanup();
    }
});
const folderOf = (agentId: string) => {
    const folder = writerFolder(server, agentId);
    folders.push(folder);
    return folder;
};

test('a replayed outcome never leaves the folder behind a change its pull skipped', async () => {
    server = startDriveServer();
    server.write('haus/a.md', 'v1', 'usr');
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.write('haus/a.md', 'mine');
    server.loseNextAnswers(1);
    await expect(alpha.push('run_lost')).rejects.toThrow();
    server.write('haus/a.md', 'theirs later', 'usr');

    await alpha.pull();
    await alpha.push('run_restart');

    expect(await alpha.read('haus/a.md')).toBe('theirs later');
    const heads = {
        drive: server.head('haus/a.md')?.revision_id,
        folder: (await alpha.state()).files['haus/a.md']?.revision_id,
    };
    expect(heads.folder).toBeDefined();
    expect(heads.folder).toBe(heads.drive as string);
    expect(await alpha.push('run_after')).toBeNull();
    expect(await alpha.pull()).toMatchObject({ applied: 0, kept: 0 });
});

test('a create whose answer was lost replays after a pull instead of making a second copy', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    const beta = folderOf('agt_beta');
    await beta.write('haus/brief.md', 'beta draft');
    await beta.push('run_beta');
    await alpha.write('haus/brief.md', 'alpha draft');
    server.loseNextAnswers(1);
    await expect(alpha.push('run_lost')).rejects.toThrow();

    await alpha.pull();
    await alpha.push('run_restart');

    expect(server.head('haus/brief.conflict-alpha-2.md')).toBeNull();
    expect(await alpha.read('haus/brief.md')).toBe('beta draft');
    expect(await alpha.read('haus/brief.conflict-alpha.md')).toBe('alpha draft');
    expect(await alpha.push('run_after')).toBeNull();
});

test('a full Drive stops the push and the edit goes in the next push, never refused', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.write('haus/a.md', 'big plan');
    server.fillStorage(true);

    await expect(alpha.push('run_full')).rejects.toThrow('full');

    expect(await alpha.read('haus/a.md')).toBe('big plan');
    expect(await alpha.readRefused('haus/a.md')).toBeNull();
    server.fillStorage(false);
    await alpha.push('run_freed');
    expect(server.text('haus/a.md')).toBe('big plan');
});

test('a create whose stored request id the Server calls reused gets a fresh one next push', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.write('haus/a.md', 'first');
    await alpha.push('run_a');
    await alpha.write('haus/b.md', 'second');
    const state = await alpha.state();
    const reused = {
        request_id: server.requestIds[0] ?? '',
        sha256: createHash('sha256').update('second').digest('hex'),
    };
    await writeFile(
        alpha.layout.stateFile,
        JSON.stringify({ ...state, pendingCreates: { 'haus/b.md': reused } })
    );

    const pushed = await alpha.push('run_b');

    expect(pushed?.failed.map((file) => file.path)).toEqual(['haus/b.md']);
    expect((await alpha.state()).pendingCreates).toEqual({});
    await alpha.push('run_b_again');
    expect(server.text('haus/b.md')).toBe('second');
});
