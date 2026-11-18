import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settle } from '@haus/effect';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Exit, Scope } from 'effect';
import { makeServerRuntime } from '../server-runtime.ts';
import { skoolHostedDefinition, skoolHostedUrl } from './catalog.ts';
import { startHostedMcps } from './supervisor.ts';
import { hostedMcpFetch } from './transport.ts';

export async function verifyHostedMcp(packageRoot: string) {
    const runtime = makeServerRuntime();
    const scope = await settle(runtime, Scope.make());
    const storageRoot = await mkdtemp(join(tmpdir(), 'haus-mcp-verify-'));
    let client: Client | undefined;
    try {
        const token = 'packaging-fixture';
        const accounts = join(storageRoot, 'skool/accounts');
        await mkdir(accounts, { recursive: true, mode: 0o700 });
        await writeFile(
            join(accounts, 'fixture.json'),
            JSON.stringify({
                token_hash: createHash('sha256').update(token).digest('hex'),
                session: { auth_token: 'fixture', waf_token: 'fixture', cookie_header: 'fixture' },
            }),
            { mode: 0o600 }
        );
        const hosted = await startHostedMcps({
            definitions: [skoolHostedDefinition(packageRoot)],
            storageRoot,
            runtime,
            scope,
        });
        client = new Client(
            { name: 'Haus packaging', version: '1' },
            { versionNegotiation: { mode: 'auto' } }
        );
        await client.connect(
            new StreamableHTTPClientTransport(new URL(skoolHostedUrl), {
                fetch: hostedMcpFetch(hosted, 'skool'),
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            })
        );
        const { tools } = await client.listTools();
        if (
            tools.length !== 10 ||
            !tools.some((tool) => tool.name === 'skool_list_communities') ||
            !tools.some((tool) => tool.name === 'skool_get_lesson')
        ) {
            throw new Error('Packaged Skool catalog is incomplete.');
        }
        const invalid = await hosted.request('skool', '/accounts', { method: 'POST', body: '{}' });
        if (invalid.status !== 400) {
            throw new Error('Packaged provisioning control is unavailable.');
        }
    } finally {
        try {
            await client?.close();
        } finally {
            try {
                await settle(runtime, Scope.close(scope, Exit.succeed(undefined)));
            } finally {
                try {
                    await runtime.dispose();
                } finally {
                    await rm(storageRoot, { recursive: true, force: true });
                }
            }
        }
    }
}
