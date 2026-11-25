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
    let moved = false;
    server = startDriveServer({
        route: (request, url) =>
            moved && url.pathname.endsWith('/push/put') ? answerBaseGone(request) : null,
    });
    server.write('haus/a.md', 'v1', 'usr');
    alpha = writerFolder(server, 'agt_alpha');
    await alpha.pull();
    server.move('haus/a.md', 'haus/b.md');
    moved = true;
    await alpha.write('haus/a.md', 'mine');

    expect(await alpha.push('run_moved')).toMatchObject({ failed: [] });

    expect((await alpha.names('haus')).sort()).toEqual(['a.conflict-alpha.md', 'b.md']);
    expect(await alpha.read('haus/b.md')).toBe('v1');
    expect(await alpha.read('haus/a.conflict-alpha.md')).toBe('mine');
    moved = false;
    expect(await alpha.push('run_after')).toBeNull();
    expect(server.text('haus/b.md')).toBe('v1');
});

async function answerBaseGone(request: Request) {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const copy = server.write('haus/a.conflict-alpha.md', bytes, 'agt_alpha');
    return Response.json({
        copy,
        current: server.head('haus/b.md'),
        outcome: 'kept_both',
        path: 'haus/a.md',
        reason: 'base_gone',
    });
}
