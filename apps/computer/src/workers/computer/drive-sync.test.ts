import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workerPushCredentialRequestSchema } from '@haus/api';
import { type DriveServer, startDriveServer } from '../../drive/drive-server.fixture.ts';
import { pullWorkerDrive, pushWorkerDrive } from './drive-sync.ts';
import { workerLayout } from './layout.ts';
import { removeTree } from './remove-tree.ts';

const agentId = 'agt_alpha';
const pushToken = `hwp_${'p'.repeat(43)}`;
let drive: DriveServer;
let root: string;
afterEach(async () => {
    drive.stop();
    await rm(root, { force: true, recursive: true });
});

function setUp(refusal: { code: string; status: number } | null) {
    let refusals = refusal ? 1 : 0;
    drive = startDriveServer({
        route: (request, url) => {
            if (url.pathname === '/computer/workers/push-credential') {
                return answerMint(request);
            }
            if (url.pathname.endsWith('/push/put') && refusals > 0) {
                refusals -= 1;
                return Response.json({ code: refusal?.code, message: 'not now' }, refusal ?? {});
            }
            return null;
        },
        writer: (token) => (token === pushToken ? agentId : token),
    });
    root = realpathSync(mkdtempSync(join(tmpdir(), 'haus-worker-drive-')));
    const layout = workerLayout(join(root, 'data'), 'srv_1', 'wrk_1');
    const folder = { agentId, layout, server: { credential: 'cred', serverOrigin: drive.origin } };
    const local = (path: string) => join(layout.driveFolder(agentId).folder, ...path.split('/'));
    const saved = (path: string) => join(layout.driveFolder(agentId).refused, ...path.split('/'));
    return {
        layout,
        pull: () => pullWorkerDrive(folder, pushToken),
        push: (turnId = 'wkt_1') => pushWorkerDrive(folder, turnId),
        read: (path: string) => readFile(local(path), 'utf8').catch(() => null),
        saved: (path: string) => readFile(saved(path), 'utf8'),
        savedLinks: async (path: string) => (await stat(saved(path))).nlink,
        async write(path: string, text: string) {
            await mkdir(join(local(path), '..'), { recursive: true });
            await writeFile(local(path), text);
        },
    };
}

test.each([
    { code: 'UPLOAD_CONFLICT', status: 409 },
    { code: 'HTTP_408', status: 408 },
    { code: 'HTTP_429', status: 429 },
    { code: 'IDEMPOTENCY_KEY_REUSED', status: 409 },
])(
    'a Worker push that could not send a file ($code) retries instead of finishing',
    async (refusal) => {
        const worker = setUp(refusal);
        await worker.write('agents/alpha/report.md', 'the report');

        expect(await worker.push()).toBe('retry');
        expect(drive.text('agents/alpha/report.md')).toBeNull();

        expect(await worker.push()).toBe('finished');
        expect(drive.text('agents/alpha/report.md')).toBe('the report');
    }
);

test('a Worker whose push was closed sets its unsent files aside outside its folder and tells its Agent', async () => {
    const worker = setUp(null);
    drive.closePush('wkt_1', agentId);
    await worker.write('agents/alpha/report.md', 'the report');

    expect(await worker.push()).toBe('finished');
    await removeTree(worker.layout.root);

    expect(await worker.saved('agents/alpha/report.md')).toBe('the report');
    expect(drive.text('agents/alpha/report.md')).toBeNull();
    expect([...drive.unsentNotes]).toEqual([['wkt_1', ['agents/alpha/report.md']]]);
});

test('a set-aside file is its own copy, so a later edit at the path never changes it', async () => {
    const worker = setUp(null);
    drive.closePush('wkt_1', agentId);
    await worker.write('agents/alpha/report.md', 'the report');

    expect(await worker.push()).toBe('finished');
    await worker.write('agents/alpha/report.md', 'rewritten later');

    expect(await worker.savedLinks('agents/alpha/report.md')).toBe(1);
    expect(await worker.saved('agents/alpha/report.md')).toBe('the report');
});

test('a set-aside file leaves the push, and the next turn never sends it', async () => {
    const worker = setUp(null);
    drive.write('agents/alpha/notes.md', 'v1', agentId);
    await worker.pull();
    drive.closePush('wkt_1', agentId);
    await worker.write('agents/alpha/notes.md', 'my edit');
    await worker.write('agents/alpha/report.md', 'the report');

    expect(await worker.push('wkt_1')).toBe('finished');
    expect(await worker.read('agents/alpha/notes.md')).toBe('v1');
    expect(await worker.read('agents/alpha/report.md')).toBeNull();

    expect(await worker.push('wkt_2')).toBe('finished');
    expect(drive.text('agents/alpha/notes.md')).toBe('v1');
    expect(drive.text('agents/alpha/report.md')).toBeNull();
    expect(await worker.saved('agents/alpha/notes.md')).toBe('my edit');
    expect(await worker.saved('agents/alpha/report.md')).toBe('the report');
    expect([...drive.unsentNotes]).toEqual([
        ['wkt_1', ['agents/alpha/notes.md', 'agents/alpha/report.md']],
    ]);
});

async function answerMint(request: Request) {
    const body = workerPushCredentialRequestSchema.parse(await request.json());
    return Response.json({
        expiresAt: '2026-11-20T00:00:00.000Z',
        state: 'minted',
        token: pushToken,
        turnId: body.turnId,
    });
}
