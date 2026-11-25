import { afterEach, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { caseInsensitiveDisk, writerFolder } from './drive-folder.test-utils.ts';
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
const deletesSent = () => server.requests.filter((request) => request.endsWith('/push/delete'));
const caseTest = test.skipIf(!caseInsensitiveDisk);

caseTest(
    'a case-only rename in Drive respells the file and never comes back as a delete',
    async () => {
        server = startDriveServer();
        server.write('haus/Notes.md', 'plan', 'usr');
        const alpha = alphaFolder();
        await alpha.pull();
        server.move('haus/Notes.md', 'haus/notes.md');

        await alpha.pull();
        await alpha.push('run_next');

        expect(await alpha.names('haus')).toEqual(['notes.md']);
        expect(Object.keys((await alpha.state()).files)).toEqual(['haus/notes.md']);
        expect(server.text('haus/notes.md')).toBe('plan');
        expect(deletesSent()).toEqual([]);
    }
);

caseTest(
    'a case-only folder rename in Drive respells the folder and keeps every file',
    async () => {
        server = startDriveServer();
        server.write('haus/docs/a.md', 'a', 'usr');
        server.write('haus/docs/b.md', 'b', 'usr');
        const alpha = alphaFolder();
        await alpha.pull();
        server.move('haus/docs/a.md', 'haus/Docs/a.md');
        server.move('haus/docs/b.md', 'haus/Docs/b.md');

        await alpha.pull();

        expect(await alpha.names('haus')).toEqual(['Docs']);
        expect(Object.keys((await alpha.state()).files).sort()).toEqual([
            'haus/Docs/a.md',
            'haus/Docs/b.md',
        ]);
        expect(await alpha.push('run_next')).toBeNull();
        expect(server.text('haus/Docs/b.md')).toBe('b');
    }
);

caseTest(
    'an Agent folder case rename with an edit keeps the edited file and lands it',
    async () => {
        server = startDriveServer();
        server.write('haus/docs/a.md', 'v1', 'usr');
        const alpha = alphaFolder();
        await alpha.pull();
        await alpha.rename('haus/docs', 'haus/Docs');
        await alpha.write('haus/Docs/a.md', 'v2');

        expect(await alpha.push('run_case')).toMatchObject({ failed: [] });

        expect(await alpha.read('haus/Docs/a.md')).toBe('v2');
        expect(server.text('haus/Docs/a.md')).toBe('v2');
        expect(await alpha.push('run_after')).toBeNull();
    }
);

caseTest('a create Drive spells with other folder casing respells the local folder', async () => {
    server = startDriveServer();
    server.write('haus/OPS/a.md', 'same', 'usr');
    const alpha = alphaFolder();
    await alpha.write('haus/ops/a.md', 'same');

    await alpha.push('run_create');

    expect(await alpha.names('haus')).toEqual(['OPS']);
    expect(Object.keys((await alpha.state()).files)).toEqual(['haus/OPS/a.md']);
    expect(await alpha.push('run_after')).toBeNull();
});

caseTest('a file Drive replaced under another spelling is swapped in, not adopted', async () => {
    server = startDriveServer();
    server.write('haus/Notes.md', 'old file', 'usr');
    const alpha = alphaFolder();
    await alpha.pull();
    server.remove('haus/Notes.md');
    server.write('haus/notes.md', 'new file', 'usr');

    await alpha.pull();

    expect(await alpha.names('haus')).toEqual(['notes.md']);
    expect(await alpha.read('haus/notes.md')).toBe('new file');
    expect(await alpha.push('run_next')).toBeNull();
});

caseTest('a restore lands under Drive spelling and forgets the old one', async () => {
    server = startDriveServer();
    server.write('haus/AGENTS.md', 'rules', 'usr');
    const alpha = alphaFolder();
    await alpha.pull();
    await alpha.remove('haus/AGENTS.md');
    const state = await alpha.state();
    const record = state.files['haus/AGENTS.md'];
    await writeFile(
        alpha.layout.stateFile,
        JSON.stringify({ ...state, files: { 'haus/AGENTS.md': { ...record, mtime_ms: -1 } } })
    );
    server.move('haus/AGENTS.md', 'haus/agents.md');

    await alpha.push('run_restore');
    await alpha.pull();
    await alpha.push('run_after');

    expect(await alpha.names('haus')).toEqual(['agents.md']);
    expect(Object.keys((await alpha.state()).files)).toEqual(['haus/agents.md']);
    expect(server.text('haus/agents.md')).toBe('rules');
    expect(deletesSent()).toEqual([]);
});
