import { afterEach, expect, test } from 'bun:test';
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

test('two folders that edit different lines of one file both land in one merged revision', async () => {
    server = startDriveServer();
    server.write('haus/plan.md', 'goal\nowner\ndate', 'usr');
    const alpha = folderOf('agt_alpha');
    const beta = folderOf('agt_beta');
    await alpha.pull();
    await beta.pull();
    await alpha.write('haus/plan.md', 'goal: ship\nowner\ndate');
    await beta.write('haus/plan.md', 'goal\nowner\ndate: friday');

    await alpha.push('run_alpha');
    const pushed = await beta.push('run_beta');
    await alpha.pull();

    expect(pushed).toEqual({
        failed: [],
        listed: [],
        pushClosed: false,
        refused: [],
        sent: 1,
        unrestored: [],
    });
    expect(server.text('haus/plan.md')).toBe('goal: ship\nowner\ndate: friday');
    expect(await beta.read('haus/plan.md')).toBe('goal: ship\nowner\ndate: friday');
    expect(await alpha.read('haus/plan.md')).toBe('goal: ship\nowner\ndate: friday');
});

test('two folders that edit the same line keep both versions and list the file once', async () => {
    server = startDriveServer();
    server.write('haus/plan.md', 'goal\nowner', 'usr');
    const alpha = folderOf('agt_alpha');
    const beta = folderOf('agt_beta');
    await alpha.pull();
    await beta.pull();
    await alpha.write('haus/plan.md', 'goal: ship\nowner');
    await beta.write('haus/plan.md', 'goal: wait\nowner');

    await alpha.push('run_alpha');
    const pushed = await beta.push('run_beta');

    expect(pushed?.listed).toEqual([
        {
            copyPath: 'haus/plan.conflict-beta.md',
            currentAuthorHandle: 'alpha',
            currentRevisionId: server.head('haus/plan.md')?.revision_id ?? null,
            outcome: 'kept_both',
            path: 'haus/plan.md',
            reason: 'same_lines',
        },
    ]);
    expect(await beta.read('haus/plan.md')).toBe('goal: ship\nowner');
    expect(await beta.read('haus/plan.conflict-beta.md')).toBe('goal: wait\nowner');
    expect(await beta.push('run_beta_next')).toBeNull();

    await beta.write('haus/plan.md', 'goal: ship, then wait\nowner');
    await beta.remove('haus/plan.conflict-beta.md');
    expect(await beta.push('run_beta_resolve')).toEqual({
        failed: [],
        listed: [],
        pushClosed: false,
        refused: [],
        sent: 2,
        unrestored: [],
    });
    await alpha.pull();
    expect(await alpha.read('haus/plan.md')).toBe('goal: ship, then wait\nowner');
    expect(await alpha.read('haus/plan.conflict-beta.md')).toBeNull();
});

test('two folders that create one path keep both, and the creator of the copy keeps it', async () => {
    server = startDriveServer();
    const alpha = folderOf('agt_alpha');
    const beta = folderOf('agt_beta');
    await alpha.write('haus/brief.md', 'alpha draft');
    await beta.write('haus/brief.md', 'beta draft');

    await alpha.push('run_alpha');
    const pushed = await beta.push('run_beta');

    expect(pushed?.listed.map((file) => file.reason)).toEqual(['both_created']);
    expect(await beta.read('haus/brief.md')).toBe('alpha draft');
    expect(await beta.read('haus/brief.conflict-beta.md')).toBe('beta draft');
});
