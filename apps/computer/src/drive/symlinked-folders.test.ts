import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { readdir, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writerFolder } from './drive-folder.test-utils.ts';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';

let server: DriveServer;
let outside: string;
const folders: ReturnType<typeof writerFolder>[] = [];
afterEach(async () => {
    server.stop();
    for (const folder of folders.splice(0)) {
        await folder.cleanup();
    }
    await rm(outside, { force: true, recursive: true });
});

async function linkedNotes() {
    server = startDriveServer();
    server.write('haus/notes/a.md', 'a', 'usr');
    const alpha = writerFolder(server, 'agt_alpha');
    folders.push(alpha);
    await alpha.pull();
    outside = join(mkdtempSync(join(tmpdir(), 'haus-drive-outside-')), 'notes');
    await rename(join(alpha.layout.folder, 'haus', 'notes'), outside);
    await symlink(outside, join(alpha.layout.folder, 'haus', 'notes'));
    return alpha;
}

test('a Drive delete under a symlinked folder never removes the file it points at', async () => {
    const alpha = await linkedNotes();
    server.remove('haus/notes/a.md');

    const pulled = await alpha.pull();

    expect(await readdir(outside)).toEqual(['a.md']);
    expect(pulled.held.map((file) => file.path)).toEqual(['haus/notes/a.md']);
    expect(pulled.advanced).toBe(false);
});

test('a Drive put under a symlinked folder is never written through the link', async () => {
    const alpha = await linkedNotes();
    server.write('haus/notes/b.md', 'b', 'usr');

    const pulled = await alpha.pull();

    expect(await readdir(outside)).toEqual(['a.md']);
    expect(pulled.held.map((file) => file.path)).toEqual(['haus/notes/b.md']);
});

test('a push leaves Drive files under a symlinked folder alone and reports them', async () => {
    const alpha = await linkedNotes();

    const pushed = await alpha.push('run_linked');

    expect(server.text('haus/notes/a.md')).toBe('a');
    expect(pushed?.failed.map((file) => file.path)).toEqual(['haus/notes/a.md']);
    expect(server.requests.filter((request) => request.endsWith('/push/delete'))).toEqual([]);
});
