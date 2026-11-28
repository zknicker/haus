import { afterEach, expect, test } from 'bun:test';
import { AgentApiClient } from '../agent-api-client.ts';
import { runDriveView } from './agent-drive-view.ts';

const servers: { stop(force: boolean): void }[] = [];
afterEach(() => {
    for (const server of servers.splice(0)) {
        server.stop(true);
    }
});

function driveWith(bytes: Uint8Array) {
    const requests: string[] = [];
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch(request) {
            const url = new URL(request.url);
            requests.push(`${url.pathname}${url.search}`);
            if (url.pathname === '/bytes') {
                return new Response(bytes);
            }
            return Response.json({ download_url: new URL('/bytes', url).href });
        },
    });
    servers.push(server);
    const written: string[] = [];
    const saved = new Map<string, Buffer>();
    return {
        deps: {
            client: new AgentApiClient({
                serverUrl: `http://127.0.0.1:${server.port}`,
                token: `grta_${'a'.repeat(43)}`,
            }),
            fetchBytes: async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer()),
            write: (text: string) => written.push(text),
            writeFile: (path: string, data: Buffer) => {
                saved.set(path, data);
                return Promise.resolve();
            },
        },
        requests,
        saved,
        written,
    };
}

test('drive view prints a text file at a fixed revision', async () => {
    const drive = driveWith(new TextEncoder().encode('# Rules\nShip small.'));

    await runDriveView(
        {
            flags: {},
            help: false,
            positionals: ['art_rules01'],
            values: { '--revision-id': 'rev_2' },
        },
        drive.deps
    );

    expect(drive.requests).toEqual([
        '/api/agent/artifacts/art_rules01/download?revision_id=rev_2',
        '/bytes',
    ]);
    expect(drive.written).toEqual(['# Rules\nShip small.\n']);
});

test('drive view refuses to print a binary file and saves it with --output', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    const drive = driveWith(png);
    const args = { flags: {}, help: false, positionals: ['art_chart01'], values: {} };

    await expect(runDriveView(args, drive.deps)).rejects.toThrow('is not text');
    await runDriveView({ ...args, values: { '--output': './chart.png' } }, drive.deps);

    expect(drive.saved.get('./chart.png')).toEqual(Buffer.from(png));
    expect(drive.written).toEqual(['Saved art_chart01 to ./chart.png.\n']);
});
