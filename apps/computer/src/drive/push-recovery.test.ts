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
const sha256Of = (text: string) => createHash('sha256').update(text).digest('hex');
const deletesSent = () => server.requests.filter((request) => request.endsWith('/push/delete'));

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

test('a pending create whose file is gone is downloaded by the pull and never pushed as a delete', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    const state = await alpha.state();
    const pending = { request_id: 'dp_stranded', sha256: sha256Of('rules') };
    await writeFile(
        alpha.layout.stateFile,
        JSON.stringify({ ...state, pendingCreates: { 'haus/AGENTS.md': pending } })
    );
    server.write('haus/AGENTS.md', 'rules', 'usr');

    await alpha.pull();
    await alpha.push('run_next');

    expect(await alpha.read('haus/AGENTS.md')).toBe('rules');
    expect(server.text('haus/AGENTS.md')).toBe('rules');
    expect((await alpha.state()).pendingCreates).toEqual({});
    expect(deletesSent()).toEqual([]);
});

test('a record that never reached the folder is restored by the push, not deleted', async () => {
    server = startDriveServer();
    server.write('haus/AGENTS.md', 'rules', 'usr');
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.remove('haus/AGENTS.md');
    const state = await alpha.state();
    const record = state.files['haus/AGENTS.md'];
    await writeFile(
        alpha.layout.stateFile,
        JSON.stringify({
            ...state,
            files: { ...state.files, 'haus/AGENTS.md': { ...record, mtime_ms: -1 } },
        })
    );

    const pushed = await alpha.push('run_next');

    expect(pushed).toMatchObject({ failed: [], sent: 0, unrestored: [] });
    expect(await alpha.read('haus/AGENTS.md')).toBe('rules');
    expect(server.text('haus/AGENTS.md')).toBe('rules');
    expect(deletesSent()).toEqual([]);
    expect(await alpha.push('run_after')).toBeNull();
});

test('a push its run already closed leaves no pending create behind', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.write('haus/notes.md', 'earlier');
    await alpha.push('run_closed');
    await alpha.write('haus/AGENTS.md', 'rules');

    const refused = await alpha.push('run_closed');
    const afterRefusal = await alpha.state();
    await alpha.remove('haus/AGENTS.md');
    server.write('haus/AGENTS.md', 'rules', 'usr');
    await alpha.pull();
    await alpha.push('run_next');

    expect(refused).toMatchObject({ pushClosed: true, sent: 0 });
    expect(afterRefusal).toMatchObject({ openPush: null, pendingCreates: {} });
    expect(await alpha.read('haus/AGENTS.md')).toBe('rules');
    expect(server.text('haus/AGENTS.md')).toBe('rules');
    expect(deletesSent()).toEqual([]);
});

test('a push under a run the Server never dispatched clears itself and the next push lands', async () => {
    server = startDriveServer();
    server.undispatched('compaction-1');
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.write('haus/AGENTS.md', 'rules');

    const refused = await alpha.push('compaction-1');
    const stuck = await alpha.state();
    await alpha.push('run_next');

    expect(refused?.failed.map((file) => file.path)).toEqual(['haus/AGENTS.md']);
    expect(stuck).toMatchObject({ openPush: null, pendingCreates: {} });
    expect(server.text('haus/AGENTS.md')).toBe('rules');
    expect(await alpha.push('run_after')).toBeNull();
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
