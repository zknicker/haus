import { afterEach, expect, test } from 'bun:test';
import { writerFolder } from './drive-folder.test-utils.ts';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';
import { folderFiles } from './folder-files.ts';

let server: DriveServer;
let alpha: ReturnType<typeof writerFolder>;
afterEach(async () => {
    server.stop();
    await alpha.cleanup();
});

test('a respell onto a path another file holds keeps both files', async () => {
    server = startDriveServer();
    alpha = writerFolder(server, 'agt_alpha');
    await alpha.write('haus/a.md', 'mine');
    await alpha.write('haus/b.md', 'other');

    const moves = await folderFiles(alpha.layout).respell('haus/a.md', 'haus/b.md', null);

    expect(moves).toBeNull();
    expect(await alpha.read('haus/a.md')).toBe('mine');
    expect(await alpha.read('haus/b.md')).toBe('other');
});

test('an edit to a file a person moved lands as a copy and the moved file is kept', async () => {
    server = startDriveServer();
    server.write('haus/a.md', 'v1', 'usr');
    alpha = writerFolder(server, 'agt_alpha');
    await alpha.pull();
    server.move('haus/a.md', 'haus/b.md');
    await alpha.write('haus/a.md', 'mine');

    expect(await alpha.push('run_moved')).toMatchObject({ failed: [] });

    expect((await alpha.names('haus')).sort()).toEqual(['a.conflict-alpha.md', 'b.md']);
    expect(await alpha.read('haus/b.md')).toBe('v1');
    expect(await alpha.read('haus/a.conflict-alpha.md')).toBe('mine');
    expect(await alpha.push('run_after')).toBeNull();
    expect(server.text('haus/b.md')).toBe('v1');
    expect(server.head('haus/a.md')).toBeNull();
});

test('an edit to a moved file never overwrites an unsynced local file at the moved-to path', async () => {
    server = startDriveServer();
    server.write('haus/a.md', 'v1', 'usr');
    alpha = writerFolder(server, 'agt_alpha');
    await alpha.pull();
    server.move('haus/a.md', 'haus/b.md');
    await alpha.write('haus/a.md', 'mine');
    await alpha.write('haus/b.md', 'unsynced b');

    expect(await alpha.push('run_moved')).toMatchObject({ failed: [], sent: 2 });

    expect((await alpha.names('haus')).sort()).toEqual([
        'a.conflict-alpha.md',
        'b.conflict-alpha.md',
        'b.md',
    ]);
    expect(await alpha.read('haus/a.conflict-alpha.md')).toBe('mine');
    expect(await alpha.read('haus/b.conflict-alpha.md')).toBe('unsynced b');
    expect(await alpha.read('haus/b.md')).toBe('v1');
    expect(await alpha.push('run_after')).toBeNull();
    expect(server.text('haus/b.conflict-alpha.md')).toBe('unsynced b');
});
