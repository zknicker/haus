import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type DriveServer, startDriveServer } from '../../drive/drive-server.fixture.ts';
import { seedWorkerDrive } from './drive-seed.ts';
import { pullWorkerDrive } from './drive-sync.ts';
import { workerLayout } from './layout.ts';
import { removeTree } from './remove-tree.ts';

const agentId = 'agt_alpha';
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
    for (const close of cleanup.splice(0)) {
        await close();
    }
});

test('a new Worker folder seeds clean files from the freshest sibling and downloads only the rest', async () => {
    const { drive, pull, worker } = setUp();
    drive.write('haus/AGENTS.md', 'House rules', 'agt_beta');
    drive.write('haus/stale.md', 'first', 'agt_beta');
    drive.write('haus/gone.md', 'soon gone', 'agt_beta');
    drive.write('agents/alpha/notes.md', 'mine', agentId);
    drive.write('agents/beta/theirs.md', 'theirs', 'agt_beta');
    await pull('wrk_old');
    await pull('wrk_a');
    drive.write('haus/old-only.md', 'only the older folder saw this', 'agt_beta');
    await pull('wrk_old');
    const source = worker('wrk_a').drive;
    await writeFile(join(source, 'haus', 'AGENTS.md'), 'An unpushed edit');
    drive.write('haus/stale.md', 'second', 'agt_beta');
    drive.remove('haus/gone.md');
    drive.write('haus/new.md', 'new', 'agt_beta');
    drive.write('haus/later.md', 'later', 'agt_beta');
    await pull('wrk_a');
    drive.requests.length = 0;

    await pull('wrk_b');

    const seeded = worker('wrk_b').drive;
    const read = (path: string) => readFile(join(seeded, path), 'utf8');
    expect(downloads(drive)).toBe(1);
    expect(await read('haus/AGENTS.md')).toBe('House rules');
    expect(await read('haus/stale.md')).toBe('second');
    expect(await read('haus/new.md')).toBe('new');
    expect(await read('agents/alpha/notes.md')).toBe('mine');
    expect(await read('agents/beta/theirs.md')).toBe('theirs');
    expect(await read('haus/gone.md').catch(() => null)).toBeNull();
    expect((await stat(join(seeded, 'agents/beta/theirs.md'))).mode & 0o200).toBe(0);
    expect((await stat(join(seeded, 'agents/alpha/notes.md'))).mode & 0o200).toBe(0o200);
    expect(await readFile(join(source, 'haus', 'AGENTS.md'), 'utf8')).toBe('An unpushed edit');
});

test('a folder that already exists, or has no sibling, is never seeded', async () => {
    const { drive, pull, worker } = setUp();
    drive.write('haus/AGENTS.md', 'House rules', 'agt_beta');
    expect(await seedWorkerDrive(worker('wrk_a'), agentId)).toBe(0);
    await pull('wrk_a');
    await mkdir(worker('wrk_b').drive, { recursive: true });

    expect(await seedWorkerDrive(worker('wrk_b'), agentId)).toBe(0);
    expect(await seedWorkerDrive(worker('wrk_c'), agentId)).toBe(1);
});

function setUp() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'haus-drive-seed-')));
    const drive = startDriveServer();
    cleanup.push(async () => {
        drive.stop();
        await removeTree(root);
    });
    const worker = (workerId: string) => workerLayout(join(root, 'data'), 'srv_1', workerId);
    const server = { credential: 'computer-credential', serverOrigin: drive.origin };
    const pull = (workerId: string) =>
        pullWorkerDrive({ agentId, layout: worker(workerId), server }, agentId);
    return { drive, pull, worker };
}

function downloads(drive: DriveServer) {
    return drive.requests.filter((request) => request.endsWith('/download')).length;
}
