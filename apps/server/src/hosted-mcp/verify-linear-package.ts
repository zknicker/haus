import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linearToolNames } from '@haus/api/linear-actor-meta';
import { settle } from '@haus/effect';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Exit, Scope } from 'effect';
import { makeServerRuntime } from '../server-runtime.ts';
import { linearHostedDefinition } from './catalog.ts';
import { startHostedMcps } from './supervisor.ts';

/**
 * Starts the packaged Linear connector under real supervision and proves the
 * MCP client discovers every contract tool and that a call without actor
 * `_meta` is refused before Linear. No Linear token is involved.
 */
export async function verifyLinearHostedMcp(packageRoot: string) {
    const runtime = makeServerRuntime();
    const scope = await settle(runtime, Scope.make());
    const storageRoot = await mkdtemp(join(tmpdir(), 'haus-mcp-verify-'));
    let client: Client | undefined;
    try {
        const hosted = await startHostedMcps({
            definitions: [linearHostedDefinition(packageRoot)],
            runtime,
            scope,
            storageRoot,
        });
        client = new Client(
            { name: 'Haus packaging', version: '1' },
            { versionNegotiation: { mode: 'auto' } }
        );
        await client.connect(
            // The private socket is the address; the URL is nominal.
            new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
                fetch: Object.assign(
                    (_input: string | URL | Request, init?: RequestInit) =>
                        hosted.request('linear', '/mcp', init),
                    { preconnect: fetch.preconnect }
                ),
            })
        );
        const { tools } = await client.listTools();
        const names = tools.map((tool) => tool.name);
        if (names.join() !== linearToolNames.join()) {
            throw new Error('Packaged Linear catalog does not match the contract.');
        }
        const refused = await client
            .callTool({ arguments: {}, name: 'list_teams' })
            .then(() => false)
            .catch(() => true);
        if (!refused) {
            throw new Error('Packaged Linear connector answered a call without actor metadata.');
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
                    await rm(storageRoot, { force: true, recursive: true });
                }
            }
        }
    }
}
