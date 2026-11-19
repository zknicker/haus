import { afterEach, expect, test } from 'bun:test';
import { chmod, copyFile, readdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
const pushRequests = () => server.requests.filter((request) => request.includes('/push/'));

test('a push sends deletes before puts, renames as a delete plus an add, and records Drive', async () => {
    server = startDriveServer();
    server.write('haus/old-name.md', 'same', 'usr');
    server.write('haus/edit.md', 'v1', 'usr');
    server.write('haus/drop.md', 'gone soon', 'usr');
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.remove('haus/old-name.md');
    await alpha.write('haus/new-name.md', 'same');
    await alpha.write('haus/edit.md', 'v2');
    await alpha.remove('haus/drop.md');
    await alpha.write('agents/alpha/notes/new.md', 'fresh');
    await alpha.write('haus/node_modules/skip.js', 'never');
    await symlink(
        join(alpha.layout.folder, 'haus', 'edit.md'),
        join(alpha.layout.folder, 'haus', 'link.md')
    );

    expect(await alpha.push('run_one')).toEqual({ failed: [], listed: [], sent: 5 });

    expect(pushRequests()).toEqual([
        'POST /api/agent/drive/push/delete',
        'POST /api/agent/drive/push/delete',
        'POST /api/agent/drive/push/put',
        'POST /api/agent/drive/push/put',
        'POST /api/agent/drive/push/put',
        'POST /api/agent/drive/push/close',
    ]);
    expect(server.text('haus/edit.md')).toBe('v2');
    expect(server.text('haus/new-name.md')).toBe('same');
    expect(server.text('agents/alpha/notes/new.md')).toBe('fresh');
    expect(server.head('haus/old-name.md')).toBeNull();
    expect(server.head('haus/drop.md')).toBeNull();
    expect(server.head('haus/node_modules/skip.js')).toBeNull();
    expect(server.head('haus/link.md')).toBeNull();
    expect(await alpha.push('run_two')).toBeNull();
});

test('a request repeated after a lost answer gets the stored outcome and no second copy', async () => {
    server = startDriveServer();
    server.write('haus/plan.md', 'base', 'usr');
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    const before = alpha.layout.stateFile;
    await copyFile(before, `${before}.lost`);
    server.write('haus/plan.md', 'theirs', 'usr');
    await alpha.write('haus/plan.md', 'mine');
    await alpha.push('run_lost');
    await copyFile(`${before}.lost`, before);
    await alpha.write('haus/plan.md', 'mine');
    const copy = server.head('haus/plan.conflict-alpha.md');

    await alpha.push('run_replay');

    expect(server.head('haus/plan.conflict-alpha.md')).toEqual(copy);
    expect(server.head('haus/plan.conflict-alpha-2.md')).toBeNull();
    expect(await alpha.read('haus/plan.conflict-alpha.md')).toBe('mine');
    expect(await alpha.read('haus/plan.md')).toBe('theirs');
});

test('a refused file moves to drive-refused, Drive state returns, and it is not sent again', async () => {
    server = startDriveServer();
    server.write('agents/beta/notes/x.md', 'theirs', 'agt_beta');
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    expect(alpha.write('agents/beta/notes/mine.md', 'not allowed')).rejects.toThrow('EACCES');
    await chmod(join(alpha.layout.folder, 'agents', 'beta', 'notes'), 0o755);
    await alpha.write('agents/beta/notes/mine.md', 'not allowed');
    await alpha.write('elsewhere.md', 'no area');

    const pushed = await alpha.push('run_refused');

    expect(pushed?.listed.map((file) => [file.path, file.reason])).toEqual([
        ['agents/beta/notes/mine.md', 'FORBIDDEN'],
        ['elsewhere.md', 'INVALID_PATH'],
    ]);
    expect(await alpha.read('agents/beta/notes/mine.md')).toBeNull();
    expect(await alpha.readRefused('agents/beta/notes/mine.md')).toBe('not allowed');
    expect(await alpha.readRefused('elsewhere.md')).toBe('no area');
    expect(await alpha.mode('agents/beta/notes')).toBe(0o555);
    expect(await alpha.push('run_after')).toBeNull();
});

test('a delete that met an edit restores the edited file', async () => {
    server = startDriveServer();
    server.write('haus/plan.md', 'v1', 'usr');
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    server.write('haus/plan.md', 'v2', 'usr');
    await alpha.remove('haus/plan.md');

    const pushed = await alpha.push('run_delete');

    expect(pushed?.listed.map((file) => file.outcome)).toEqual(['kept_edit']);
    expect(await alpha.read('haus/plan.md')).toBe('v2');
    expect(await alpha.push('run_after')).toBeNull();
});

test('a push left open by a crash is closed before the next push sends', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.write('haus/a.md', 'a');
    server.failPushes(true);
    await expect(alpha.push('run_crashed')).rejects.toThrow();
    expect((await alpha.state()).openPush).toBe('run_crashed');
    server.failPushes(false);
    server.requests.length = 0;

    await alpha.push('run_next');

    expect(server.requests).toEqual([
        'POST /api/agent/drive/push/close',
        'POST /api/agent/drive/push/put',
        'POST /api/agent/drive/push/close',
    ]);
    expect((await alpha.state()).openPush).toBeNull();
    expect(server.text('haus/a.md')).toBe('a');
});

test('a case-only rename with an edit lands the new name and keeps the bytes', async () => {
    server = startDriveServer();
    server.write('haus/notes.md', 'v1', 'usr');
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await rename(
        join(alpha.layout.folder, 'haus', 'notes.md'),
        join(alpha.layout.folder, 'haus', 'Notes.md')
    );
    await alpha.write('haus/Notes.md', 'v2');

    expect(await alpha.push('run_case')).toMatchObject({ failed: [], sent: 2 });

    expect(server.head('haus/notes.md')).toBeNull();
    expect(server.text('haus/Notes.md')).toBe('v2');
    expect(await readdir(join(alpha.layout.folder, 'haus'))).toEqual(['Notes.md']);
    expect(await alpha.push('run_after')).toBeNull();
});

test('a file that became a folder deletes the file and sends what the folder holds', async () => {
    server = startDriveServer();
    server.write('haus/notes', 'flat', 'usr');
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.remove('haus/notes');
    await alpha.write('haus/notes/today.md', 'nested');

    expect(await alpha.push('run_folder')).toMatchObject({ failed: [], sent: 2 });

    expect(server.head('haus/notes')).toBeNull();
    expect(server.text('haus/notes/today.md')).toBe('nested');
    expect(await alpha.push('run_after')).toBeNull();
});

test('a file deleted and created again with the same bytes is a new create', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    await alpha.write('haus/idea.md', 'same');
    await alpha.push('run_create');
    await alpha.remove('haus/idea.md');
    await alpha.push('run_delete');
    await alpha.write('haus/idea.md', 'same');

    await alpha.push('run_recreate');

    expect(server.text('haus/idea.md')).toBe('same');
});

test('a relaunched run with nothing left to send still closes its push', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.write('haus/a.md', 'a');
    await alpha.push('run_once');
    const state = JSON.parse(await readFile(alpha.layout.stateFile, 'utf8'));
    await writeFile(alpha.layout.stateFile, JSON.stringify({ ...state, openPush: 'run_once' }));
    server.requests.length = 0;

    expect(await alpha.push('run_once')).toMatchObject({ sent: 0 });

    expect(server.requests).toEqual(['POST /api/agent/drive/push/close']);
    expect((await alpha.state()).openPush).toBeNull();
});

test('a second refusal at one path keeps both refused versions', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    await alpha.pull();
    await alpha.write('stray.txt', 'first draft');
    await alpha.push('run_first');
    await alpha.write('stray.txt', 'second draft');

    await alpha.push('run_second');

    expect(await alpha.readRefused('stray.txt')).toBe('first draft');
    expect(await alpha.readRefused('stray.txt.2')).toBe('second draft');
});

test('a decomposed file name is pushed and recorded under its composed path', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    const decomposed = 'café.md';
    await alpha.write(`haus/${decomposed}`, 'menu');

    expect(await alpha.push('run_nfd')).toMatchObject({ failed: [], sent: 1 });

    expect(server.text('haus/café.md')).toBe('menu');
    expect(Object.keys((await alpha.state()).files)).toEqual(['haus/café.md']);
    expect(await alpha.push('run_after')).toBeNull();
});
