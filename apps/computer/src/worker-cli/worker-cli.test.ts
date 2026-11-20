import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentApiClient } from '../agent-cli/agent-api-client.ts';
import { type DriveServer, startDriveServer } from '../drive/drive-server.fixture.ts';
import { runWorkerCli } from './worker-cli.ts';

const token = `turn-token-${'t'.repeat(32)}`;
let server: DriveServer;
let root: string;
const reports: Array<{ authorization: string | null; body: unknown }> = [];

afterEach(async () => {
    server.stop();
    reports.splice(0);
    await rm(root, { force: true, recursive: true });
});

function worker(stdin = '') {
    root = mkdtempSync(join(tmpdir(), 'haus-worker-cli-'));
    server = startDriveServer({
        route: (request, url) =>
            url.pathname === '/api/worker/report' ? recordReport(request) : null,
    });
    const written: Array<string | Uint8Array> = [];
    const deps = {
        client: new AgentApiClient({ serverUrl: server.origin, token }),
        fetch,
        readStdin: () => Promise.resolve(stdin),
        reportFile: join(root, 'report', 'receipt.json'),
        stdinIsTty: false,
        write: (output: string | Uint8Array) => written.push(output),
    };
    return {
        run: (...argv: string[]) => runWorkerCli(argv, () => deps),
        stdout: () =>
            written
                .map((part) => (typeof part === 'string' ? part : new TextDecoder().decode(part)))
                .join(''),
    };
}

describe('the Worker haus', () => {
    test('records a report with the turn credential and keeps its receipt', async () => {
        const cli = worker('Which staging database should the migration use?\n');
        const code = await cli.run(
            'worker',
            'report',
            '--outcome',
            'needs-you',
            '--ask',
            'Pick the database.',
            '--pr',
            'https://github.com/acme/app/pull/7'
        );

        expect(code).toBe(0);
        expect(reports).toEqual([
            {
                authorization: `Bearer ${token}`,
                body: {
                    ask: 'Pick the database.',
                    outcome: 'needs-you',
                    person: null,
                    pullRequestUrls: ['https://github.com/acme/app/pull/7'],
                    text: 'Which staging database should the migration use?',
                },
            },
        ]);
        expect(
            JSON.parse(await readFile(join(root, 'report', 'receipt.json'), 'utf8'))
        ).toMatchObject({
            draft: { pullRequestUrls: ['https://github.com/acme/app/pull/7'] },
            turnId: 'wkt_1',
        });
        expect(cli.stdout()).toBe(
            'Recorded your needs-you report for this turn.\nIt posts in the Task when the turn ends. Run haus worker report again to replace it.\n'
        );
    });

    test('a needs-you report without its ask never reaches the Server', async () => {
        const cli = worker('Stuck.');
        expect(await cli.run('worker', 'report', '--outcome', 'needs-you')).toBe(1);
        expect(reports).toEqual([]);
    });

    test('reads a Drive file by path', async () => {
        const cli = worker();
        server.write('haus/AGENTS.md', 'House rules', 'agt_beta');
        expect(await cli.run('drive', 'view', 'haus/AGENTS.md')).toBe(0);
        expect(cli.stdout()).toBe('House rules');
    });

    test('every other command is outside a Worker scope', async () => {
        const cli = worker('hello');
        expect(await cli.run('message', 'send', '--target', '#all')).toBe(2);
        expect(await cli.run('worker', 'start', '--task', 'SEC-12')).toBe(2);
        expect(await cli.run('drive', 'versions', 'haus/AGENTS.md')).toBe(2);
        expect(reports).toEqual([]);
        expect(server.requests).toEqual([]);
    });
});

async function recordReport(request: Request) {
    const body = (await request.json()) as Record<string, unknown>;
    reports.push({ authorization: request.headers.get('authorization'), body });
    const { person: _person, ...draft } = body;
    return Response.json({ draft: { ...draft, personId: null }, turnId: 'wkt_1' });
}
