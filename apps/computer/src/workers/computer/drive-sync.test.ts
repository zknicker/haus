import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workerPushCredentialRequestSchema } from '@haus/api';
import { type DriveServer, startDriveServer } from '../../drive/drive-server.fixture.ts';
import { pushWorkerDrive } from './drive-sync.ts';
import { workerLayout } from './layout.ts';

const agentId = 'agt_alpha';
const pushToken = `hwp_${'p'.repeat(43)}`;
let drive: DriveServer;
let root: string;
afterEach(async () => {
    drive.stop();
    await rm(root, { force: true, recursive: true });
});

function setUp(refusal: { code: string; status: number }) {
    let refusals = 1;
    drive = startDriveServer({
        route: (request, url) => {
            if (url.pathname === '/computer/workers/push-credential') {
                return answerMint(request);
            }
            if (url.pathname.endsWith('/push/put') && refusals > 0) {
                refusals -= 1;
                return Response.json({ code: refusal.code, message: 'not now' }, refusal);
            }
            return null;
        },
        writer: (token) => (token === pushToken ? agentId : token),
    });
    root = realpathSync(mkdtempSync(join(tmpdir(), 'haus-worker-drive-')));
    const layout = workerLayout(join(root, 'data'), 'srv_1', 'wrk_1');
    const folder = { agentId, layout, server: { credential: 'cred', serverOrigin: drive.origin } };
    return {
        push: () => pushWorkerDrive(folder, 'wkt_1'),
        async write(path: string, text: string) {
            const target = join(layout.driveFolder(agentId).folder, ...path.split('/'));
            await mkdir(join(target, '..'), { recursive: true });
            await writeFile(target, text);
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

async function answerMint(request: Request) {
    const body = workerPushCredentialRequestSchema.parse(await request.json());
    return Response.json({
        expiresAt: '2026-11-20T00:00:00.000Z',
        state: 'minted',
        token: pushToken,
        turnId: body.turnId,
    });
}
