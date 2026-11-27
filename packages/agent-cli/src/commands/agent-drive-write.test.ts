import { expect, test } from 'bun:test';
import { AgentApiClient } from '../agent-api-client.ts';
import { runDriveWrite } from './agent-drive-write.ts';

const path = 'agents/orbit/reports/k3mq7xta/report.md';

test('drive write sends stdin as one base64 file and prints its citation', async () => {
    const bodies: unknown[] = [];
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            bodies.push(await request.json());
            return Response.json({
                artifact: {
                    artifact_id: 'art_report',
                    content_type: 'text/markdown',
                    created_at: '2026-11-26T00:00:00.000Z',
                    creator: { agent_id: 'agt_task', type: 'agent' },
                    filename: 'report.md',
                    path,
                    revision_id: 'rev_report',
                    revision_number: 2,
                    sha256: 'a'.repeat(64),
                    size_bytes: 9,
                    stable_url: 'https://haus.chat/s/demo/artifacts/art_report',
                    title: 'report.md',
                    updated_at: '2026-11-26T00:00:00.000Z',
                    version_url:
                        'https://haus.chat/s/demo/artifacts/art_report?revision=rev_report',
                },
                citation: `[report.md](drive://${path})`,
            });
        },
    });
    const written: string[] = [];
    try {
        await runDriveWrite(
            { flags: {}, help: false, positionals: [path], values: {} },
            {
                client: new AgentApiClient({
                    serverUrl: `http://127.0.0.1:${server.port}`,
                    token: `grta_${'a'.repeat(43)}`,
                }),
                readFile: () => Promise.reject(new Error('stdin only')),
                readStdin: () => Promise.resolve(Buffer.from('# Report\n')),
                write: (text) => written.push(text),
            }
        );
    } finally {
        server.stop(true);
    }
    expect(bodies).toMatchObject([
        { contentBase64: Buffer.from('# Report\n').toString('base64'), path },
    ]);
    expect(written).toEqual([
        `Wrote ${path} (revision 2). Cite it: [report.md](drive://${path})\n`,
    ]);
});

test('drive write refuses an empty file before it calls the Server', async () => {
    const client = new AgentApiClient({ serverUrl: 'http://127.0.0.1:9', token: 'grta_unused' });
    await expect(
        runDriveWrite(
            { flags: {}, help: false, positionals: [path], values: {} },
            {
                client,
                readFile: () => Promise.reject(new Error('unused')),
                readStdin: () => Promise.resolve(Buffer.alloc(0)),
                write: () => undefined,
            }
        )
    ).rejects.toThrow('Give the file on stdin or with --from.');
});
