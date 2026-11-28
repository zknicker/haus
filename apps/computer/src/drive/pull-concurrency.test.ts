import { afterEach, expect, test } from 'bun:test';
import { writerFolder } from './drive-folder.test-utils.ts';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';
import { areas, changeOf } from './drive-wire.fixture.ts';

let server: DriveServer;
let alpha: ReturnType<typeof writerFolder>;
afterEach(async () => {
    server.stop();
    await alpha.cleanup();
});

test('a first pull downloads eight files at a time and lands every one', async () => {
    const texts = new Map<string, string>();
    const gated: (() => void)[] = [];
    let started = 0;
    let peak = 0;
    server = startDriveServer({
        route: (_request, url) => {
            const text = texts.get(url.pathname.slice('/blob/'.length));
            if (text === undefined) {
                return null;
            }
            started += 1;
            const answered = new Promise<Response>((resolve) =>
                gated.push(() => resolve(new Response(text)))
            );
            peak = Math.max(peak, gated.length);
            if (gated.length === 8 || started === texts.size) {
                for (const release of gated.splice(0)) {
                    release();
                }
            }
            return answered;
        },
    });
    for (let index = 0; index < 20; index += 1) {
        const path = `haus/notes/${index}.md`;
        texts.set(server.write(path, `note ${index}`, 'usr').revision_id, `note ${index}`);
    }
    alpha = writerFolder(server, 'agt_alpha');

    expect(await alpha.pull()).toMatchObject({ advanced: true, applied: 20, blocked: 0 });

    expect(peak).toBe(8);
    expect(await alpha.read('haus/notes/0.md')).toBe('note 0');
    expect(await alpha.read('haus/notes/19.md')).toBe('note 19');
    expect((await alpha.state()).counters.haus).toBe(20);
});

test('a held download among parallel ones blocks the counters and every other file lands', async () => {
    let corrupt = '';
    server = startDriveServer({
        route: (_request, url) =>
            url.pathname === `/blob/${corrupt}` ? new Response('not these bytes') : null,
    });
    for (let index = 0; index < 12; index += 1) {
        const written = server.write(`haus/notes/${index}.md`, `note ${index}`, 'usr');
        corrupt = index === 5 ? written.revision_id : corrupt;
    }
    alpha = writerFolder(server, 'agt_alpha');

    const pulled = await alpha.pull();

    expect(pulled).toMatchObject({ advanced: false, applied: 11, blocked: 1 });
    expect(pulled.held.map((file) => file.path)).toEqual(['haus/notes/5.md']);
    expect(await alpha.read('haus/notes/5.md')).toBeNull();
    expect(await alpha.read('haus/notes/11.md')).toBe('note 11');
    expect((await alpha.state()).counters).toEqual({});
    corrupt = '';
    expect(await alpha.pull()).toMatchObject({ advanced: true, applied: 1, held: [] });
    expect(await alpha.read('haus/notes/5.md')).toBe('note 5');
});

test('a failed download stops the pull before later changes apply, though their bodies arrived', async () => {
    server = startDriveServer();
    const revisions = Array.from(
        { length: 6 },
        (_, index) => server.write(`haus/notes/${index}.md`, `note ${index}`, 'usr').revision_id
    );
    server.failDownload(revisions[2] ?? '');
    alpha = writerFolder(server, 'agt_alpha');

    await expect(alpha.pull()).rejects.toThrow('Downloading');

    expect(server.requests.filter((request) => request.startsWith('GET /blob/'))).toHaveLength(6);
    expect(await alpha.read('haus/notes/1.md')).toBe('note 1');
    expect(await alpha.read('haus/notes/2.md')).toBeNull();
    expect(await alpha.read('haus/notes/3.md')).toBeNull();
    expect((await alpha.state()).counters).toEqual({});
    server.healDownloads();
    expect(await alpha.pull()).toMatchObject({ advanced: true, applied: 4 });
    expect(await alpha.read('haus/notes/5.md')).toBe('note 5');
});

test('two changes to one path apply in sequence order when the later download lands first', async () => {
    const laterRequested = Promise.withResolvers<void>();
    server = startDriveServer({
        route: (_request, url) => {
            if (url.pathname === '/api/agent/drive/changes') {
                return Response.json({
                    areas: areas.map((area) => ({ ...area, counter: area.area === 'haus' ? 2 : 0 })),
                    changes: [first, later].map((revision, index) =>
                        changeOf({
                            area: 'haus',
                            artifact_id: revision.artifact_id,
                            path: revision.path,
                            revision,
                            sequence: index + 1,
                        })
                    ),
                    complete: true,
                    until: { 'agent:agt_alpha': 0, 'agent:agt_beta': 0, haus: 2 },
                });
            }
            if (url.pathname === `/blob/${first.revision_id}`) {
                return laterRequested.promise.then(() => new Response('first'));
            }
            if (url.pathname === `/blob/${later.revision_id}`) {
                laterRequested.resolve();
            }
            return null;
        },
    });
    const first = server.write('haus/plan.md', 'first', 'usr');
    const later = server.write('haus/plan.md', 'later', 'usr');
    alpha = writerFolder(server, 'agt_alpha');

    expect(await alpha.pull()).toMatchObject({ advanced: true, applied: 2 });

    expect(await alpha.read('haus/plan.md')).toBe('later');
    expect((await alpha.state()).files['haus/plan.md']?.revision_id).toBe(later.revision_id);
});
