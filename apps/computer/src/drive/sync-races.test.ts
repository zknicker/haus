import { afterEach, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writerFolder } from './drive-folder.test-utils.ts';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';

let server: DriveServer;
let alpha: ReturnType<typeof writerFolder>;
let editOn: ((url: URL) => void) | null = null;
afterEach(async () => {
    editOn = null;
    server.stop();
    await alpha.cleanup();
});

function start() {
    server = startDriveServer({
        route: (_request, url) => {
            editOn?.(url);
            return null;
        },
    });
    alpha = writerFolder(server, 'agt_alpha');
}

function editDuring(pathname: string, path: string, text: string) {
    editOn = (url) => {
        if (url.pathname === pathname) {
            editOn = null;
            writeFileSync(join(alpha.layout.folder, ...path.split('/')), text);
        }
    };
}

test('an edit made while a pull downloads keeps its bytes and its base', async () => {
    start();
    const v1 = server.write('haus/a.md', 'v1', 'usr');
    await alpha.pull();
    const v2 = server.write('haus/a.md', 'v2', 'usr');
    editDuring(`/blob/${v2.revision_id}`, 'haus/a.md', 'edited during the pull');

    expect(await alpha.pull()).toMatchObject({ kept: 1 });

    expect(await alpha.read('haus/a.md')).toBe('edited during the pull');
    expect((await alpha.state()).files['haus/a.md']).toMatchObject({
        revision_id: v1.revision_id,
        seen_head: v2.revision_id,
    });
});

test('an edit made while a push waits for a merge is never overwritten by the merge', async () => {
    start();
    const base = server.write('haus/a.md', 'one\ntwo\nthree\n', 'usr');
    await alpha.pull();
    server.write('haus/a.md', 'ONE\ntwo\nthree\n', 'usr');
    await alpha.write('haus/a.md', 'one\ntwo\nTHREE\n');
    editDuring('/api/agent/drive/push/put', 'haus/a.md', 'one\nTWO\nTHREE\n');

    await alpha.push('run_merge');

    expect(server.text('haus/a.md')).toBe('ONE\ntwo\nTHREE\n');
    expect(await alpha.read('haus/a.md')).toBe('one\nTWO\nTHREE\n');
    expect((await alpha.state()).files['haus/a.md']?.revision_id).toBe(base.revision_id);
    await alpha.push('run_next');
    expect(server.text('haus/a.md')).toBe('ONE\nTWO\nTHREE\n');
});

test('an edit made while a push uploads is never recorded as synced', async () => {
    start();
    await alpha.pull();
    await alpha.write('haus/a.md', 'v2');
    editDuring('/api/agent/drive/push/put', 'haus/a.md', 'v3');

    await alpha.push('run_upload');
    await alpha.push('run_next');

    expect(await alpha.read('haus/a.md')).toBe('v3');
    expect(server.text('haus/a.md')).toBe('v3');
});
