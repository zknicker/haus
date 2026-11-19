import { afterEach, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
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
const alphaFolder = () => {
    const folder = writerFolder(server, 'agt_alpha');
    folders.push(folder);
    return folder;
};

test('a first pull fetches every area, records each file, and locks other Agents areas', async () => {
    server = startDriveServer();
    server.write('haus/AGENTS.md', 'be kind', 'usr');
    server.write('agents/alpha/MEMORY.md', 'mine', 'agt_alpha');
    server.write('agents/beta/notes/x.md', 'theirs', 'agt_beta');
    const alpha = alphaFolder();

    expect(await alpha.pull()).toEqual({
        advanced: true,
        applied: 3,
        blocked: 0,
        kept: 0,
        skipped: 0,
    });

    expect(await alpha.read('haus/AGENTS.md')).toBe('be kind');
    expect(await alpha.read('agents/beta/notes/x.md')).toBe('theirs');
    expect(await alpha.mode('agents/beta/notes/x.md')).toBe(0o444);
    expect(await alpha.mode('agents/beta/notes')).toBe(0o555);
    expect(await alpha.mode('agents/beta')).toBe(0o555);
    expect(await alpha.mode('agents/alpha/MEMORY.md')).toBe(0o644);
    const state = await alpha.state();
    expect(state.counters).toEqual({ 'agent:agt_alpha': 1, 'agent:agt_beta': 1, haus: 1 });
    expect(Object.keys(state.files).sort()).toEqual([
        'agents/alpha/MEMORY.md',
        'agents/beta/notes/x.md',
        'haus/AGENTS.md',
    ]);
});

test('a pull updates unedited files and keeps edited ones with their base', async () => {
    server = startDriveServer();
    const plan = server.write('haus/plan.md', 'v1', 'usr');
    server.write('haus/notes.md', 'n1', 'usr');
    server.write('haus/gone.md', 'g1', 'usr');
    server.write('haus/edited-gone.md', 'e1', 'usr');
    const alpha = alphaFolder();
    await alpha.pull();
    await alpha.write('haus/plan.md', 'my edit');
    await alpha.write('haus/edited-gone.md', 'my edit too');
    server.write('haus/plan.md', 'v2', 'usr');
    server.write('haus/notes.md', 'n2', 'usr');
    server.remove('haus/gone.md');
    server.remove('haus/edited-gone.md');

    expect(await alpha.pull()).toMatchObject({ advanced: true, applied: 2, kept: 2 });

    expect(await alpha.read('haus/notes.md')).toBe('n2');
    expect(await alpha.read('haus/gone.md')).toBeNull();
    expect(await alpha.read('haus/plan.md')).toBe('my edit');
    expect(await alpha.read('haus/edited-gone.md')).toBe('my edit too');
    expect((await alpha.state()).files['haus/plan.md']?.revision_id).toBe(plan.revision_id);
});

test('a local file with the incoming bytes is adopted, record or not, without a download', async () => {
    server = startDriveServer();
    const memory = server.write('agents/alpha/MEMORY.md', 'seeded', 'agt_alpha');
    const alpha = alphaFolder();
    await alpha.write('agents/alpha/MEMORY.md', 'seeded');

    await alpha.pull();

    expect((await alpha.state()).files['agents/alpha/MEMORY.md']?.revision_id).toBe(
        memory.revision_id
    );
    expect(server.requests.filter((request) => request.includes('/download'))).toEqual([]);
});

test('a pull that fails midway keeps what it applied, advances nothing, and pushes cleanly', async () => {
    server = startDriveServer({ pageSize: 1 });
    server.write('haus/a.md', 'a1', 'usr');
    server.write('haus/b.md', 'b1', 'usr');
    server.write('haus/c.md', 'c1', 'usr');
    const alpha = alphaFolder();
    await alpha.pull();
    server.write('haus/a.md', 'a2', 'usr');
    server.write('haus/b.md', 'b2', 'usr');
    const c2 = server.write('haus/c.md', 'c2', 'usr');
    server.failDownload(c2.revision_id);

    await expect(alpha.pull()).rejects.toThrow('Downloading');

    expect(await alpha.read('haus/a.md')).toBe('a2');
    expect(await alpha.read('haus/b.md')).toBe('b2');
    expect(await alpha.read('haus/c.md')).toBe('c1');
    expect((await alpha.state()).counters.haus).toBe(3);

    await alpha.write('haus/b.md', 'b2 then mine');
    await alpha.write('haus/c.md', 'c1 then mine');
    server.healDownloads();
    await alpha.push('run_after_failed_pull');

    expect(server.text('haus/b.md')).toBe('b2 then mine');
    expect(server.text('haus/c.md')).toBe('c2');
    expect(server.text('haus/c.conflict-alpha.md')).toBe('c1 then mine');

    expect(await alpha.pull()).toMatchObject({ advanced: true, blocked: 0 });
    expect(await alpha.read('haus/c.md')).toBe('c2');
    expect(await alpha.read('haus/c.conflict-alpha.md')).toBe('c1 then mine');
    expect(await alpha.pull()).toMatchObject({ applied: 0, kept: 0 });
});

test('a crash between a file and its record is repaired by the next pull', async () => {
    server = startDriveServer();
    server.write('haus/a.md', 'a1', 'usr');
    const alpha = alphaFolder();
    await alpha.pull();
    const a2 = server.write('haus/a.md', 'a2', 'usr');
    await alpha.write('haus/a.md', 'a2');

    expect(await alpha.pull()).toMatchObject({ applied: 1 });

    expect((await alpha.state()).files['haus/a.md']?.revision_id).toBe(a2.revision_id);
    expect(await alpha.push('run_next')).toBeNull();
    expect(server.requests.filter((request) => request.includes('/download'))).toHaveLength(1);
});

test('a folder removed under its bookkeeping starts again from zero', async () => {
    server = startDriveServer();
    server.write('haus/a.md', 'a1', 'usr');
    const alpha = alphaFolder();
    await alpha.pull();
    await rm(alpha.layout.folder, { recursive: true });

    expect(await alpha.pull()).toMatchObject({ applied: 1 });
    expect(await alpha.read('haus/a.md')).toBe('a1');
});

test('a local folder where Drive has a file blocks only that change and holds the counters', async () => {
    server = startDriveServer();
    server.write('haus/a.md', 'a1', 'usr');
    server.write('haus/report', 'r1', 'usr');
    const alpha = alphaFolder();
    await mkdir(join(alpha.layout.folder, 'haus', 'report'), { recursive: true });
    await writeFile(join(alpha.layout.folder, 'haus', 'report', 'draft.md'), 'local');

    expect(await alpha.pull()).toMatchObject({ advanced: false, applied: 1, blocked: 1 });
    expect(await alpha.read('haus/a.md')).toBe('a1');
    expect(await alpha.state()).toMatchObject({ counters: {} });
});
