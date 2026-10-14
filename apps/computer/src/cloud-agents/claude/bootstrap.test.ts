import { expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { prepareClaudeCloudBootstrap } from './bootstrap.ts';

test('setup reuses one private dedicated bootstrap across restart and registers it only with the bound Server', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-bootstrap-'));
    const registrations: string[] = [];
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            expect(new URL(request.url).pathname).toBe('/computer/cloud-agents/bootstrap');
            const input = z
                .object({
                    credentialHash: z.literal('bound-computer'),
                    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
                })
                .parse(await request.json());
            registrations.push(input.token);
            return Response.json({ computerId: 'computer', serverId: 'server' });
        },
    });
    try {
        const computer = {
            dataRoot: root,
            serverId: 'server',
            serverOrigin: server.url.origin,
            credentialHash: 'bound-computer',
        };
        const first = await prepareClaudeCloudBootstrap(computer);
        const afterRestart = await prepareClaudeCloudBootstrap(computer);
        expect(afterRestart).toEqual(first);
        expect(new Set(registrations).size).toBe(1);
        expect(first.headerName).toBe('X-Haus-Cloud-Bootstrap');
        expect(
            (await stat(join(root, 'servers', 'server', 'claude-cloud', 'bootstrap-token'))).mode &
                0o777
        ).toBe(0o600);
    } finally {
        server.stop(true);
        await rm(root, { recursive: true, force: true });
    }
});
