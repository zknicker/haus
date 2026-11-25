import { afterEach, expect, test } from 'bun:test';
import { writerFolder } from './drive-folder.test-utils.ts';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';

let server: DriveServer;
let alpha: ReturnType<typeof writerFolder>;
afterEach(async () => {
    server.stop();
    await alpha.cleanup();
});

test('a path the disk cannot hold is held and every later change still lands', async () => {
    server = startDriveServer();
    const long = `haus/${Array.from({ length: 4 }, () => 'd'.repeat(240)).join('/')}/x.md`;
    server.write(long, 'too long for APFS', 'usr');
    server.write('haus/later.md', 'later', 'usr');
    alpha = writerFolder(server, 'agt_alpha');

    const pulled = await alpha.pull();

    expect(pulled).toMatchObject({ advanced: false, applied: 1, blocked: 1 });
    expect(pulled.held.map((file) => file.path)).toEqual([long]);
    expect(await alpha.read('haus/later.md')).toBe('later');
});

test('a download that does not match its hash is held and the rest of the pull lands', async () => {
    let corrupt = '';
    server = startDriveServer({
        route: (_request, url) =>
            url.pathname === `/blob/${corrupt}` ? new Response('not these bytes') : null,
    });
    corrupt = server.write('haus/a.md', 'real bytes', 'usr').revision_id;
    server.write('haus/b.md', 'b', 'usr');
    alpha = writerFolder(server, 'agt_alpha');

    const pulled = await alpha.pull();

    expect(pulled.held.map((file) => file.path)).toEqual(['haus/a.md']);
    expect(await alpha.read('haus/a.md')).toBeNull();
    expect(await alpha.read('haus/b.md')).toBe('b');
    corrupt = '';
    expect(await alpha.pull()).toMatchObject({ advanced: true, held: [] });
    expect(await alpha.read('haus/a.md')).toBe('real bytes');
});
