import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { AgentApiClient } from '../agent-cli/agent-api-client.ts';
import { AgentCliError } from '../agent-cli/agent-error.ts';
import { ARTIFACT_SUBCOMMANDS } from '../agent-cli/commands/agent-artifact.ts';
import { parseArgs } from '../agent-cli/parse.ts';
import { startLoopbackProxy } from '../proxy.ts';

const publish = ARTIFACT_SUBCOMMANDS.find((sub) => sub.name === 'publish');
const publishCommand = { ...publish, section: 'artifact' } as Parameters<typeof parseArgs>[0];
const token = `grta_${'a'.repeat(43)}`;
const artifact = {
    artifact_id: 'art_report',
    content_type: 'text/plain',
    created_at: '2026-10-13T00:00:00.000Z',
    creator: { type: 'agent', agent_id: 'agt_wren' },
    filename: 'notes.txt',
    name: 'notes',
    revision_id: 'rev_report',
    revision_number: 1,
    sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    size_bytes: 5,
    stable_url: 'https://haus.chat/s/demo/artifacts/art_report',
    title: 'Notes',
    updated_at: '2026-10-13T00:00:00.000Z',
    version_url: 'https://haus.chat/s/demo/artifacts/art_report?revision=rev_report',
};

afterEach(() => {
    for (const key of ['HAUS_AGENT_ID', 'HAUS_SERVER_URL', 'HAUS_AGENT_TOKEN_FILE'] as const) {
        delete process.env[key];
    }
});

test('artifact publish reads a zstd Server response through the Computer proxy', async () => {
    const seen: { acceptEncoding: string | null; bytes: Uint8Array } = {
        acceptEncoding: null,
        bytes: new Uint8Array(),
    };
    const origin = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            seen.acceptEncoding = request.headers.get('accept-encoding');
            seen.bytes = new Uint8Array(await request.arrayBuffer());
            const compressed = Bun.zstdCompressSync(Buffer.from(JSON.stringify({ artifact })));
            return new Response(compressed, {
                status: 201,
                headers: {
                    'content-encoding': 'zstd',
                    'content-type': 'application/json',
                },
            });
        },
    });
    const proxy = startLoopbackProxy({
        proxyToken: token,
        runnerToken: 'runner',
        serverOrigin: `http://127.0.0.1:${origin.port}`,
    });
    const directory = mkdtempSync(join(tmpdir(), 'haus-publish-'));
    const file = join(directory, 'notes.txt');
    const tokenFile = join(directory, 'token');
    writeFileSync(file, 'hello');
    writeFileSync(tokenFile, token);
    process.env.HAUS_AGENT_ID = 'agt_wren';
    process.env.HAUS_SERVER_URL = proxy.url;
    process.env.HAUS_AGENT_TOKEN_FILE = tokenFile;
    const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
        const code = await publish?.run(
            parseArgs(publishCommand, [
                '--path',
                file,
                '--title',
                'Notes',
                '--name',
                'notes',
                '--request-id',
                'publish-zstd-1',
            ])
        );
        expect(code).toBe(0);
        expect(stdout.mock.calls.map((call) => String(call[0])).join('')).toBe(
            `${JSON.stringify({ artifact }, null, 2)}\n`
        );
        expect(seen.acceptEncoding).toBe('gzip, deflate, br');
        expect(Buffer.from(seen.bytes).toString()).toBe('hello');
    } finally {
        stdout.mockRestore();
        proxy.close();
        origin.stop(true);
        rmSync(directory, { recursive: true, force: true });
    }
});

test('a lost publish response names the request id and forbids a fresh publish', async () => {
    const origin = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch() {
            return new Response(Uint8Array.from([0, 1, 2, 3]), {
                status: 201,
                headers: {
                    'content-encoding': 'zstd',
                    'content-type': 'application/json',
                },
            });
        },
    });
    const proxy = startLoopbackProxy({
        proxyToken: token,
        runnerToken: 'runner',
        serverOrigin: `http://127.0.0.1:${origin.port}`,
    });
    const directory = mkdtempSync(join(tmpdir(), 'haus-publish-lost-'));
    const file = join(directory, 'notes.txt');
    const tokenFile = join(directory, 'token');
    writeFileSync(file, 'hello');
    writeFileSync(tokenFile, token);
    process.env.HAUS_AGENT_ID = 'agt_wren';
    process.env.HAUS_SERVER_URL = proxy.url;
    process.env.HAUS_AGENT_TOKEN_FILE = tokenFile;
    try {
        await publish?.run(
            parseArgs(publishCommand, [
                '--path',
                file,
                '--title',
                'Notes',
                '--request-id',
                'publish-lost-1',
            ])
        );
        throw new Error('publish should have failed');
    } catch (error) {
        expect(error).toBeInstanceOf(AgentCliError);
        expect(error).toMatchObject({
            code: 'ARTIFACT_PUBLISH_UNCONFIRMED',
            options: {
                retryable: true,
                nextAction:
                    'Retry this same file and metadata with --request-id publish-lost-1. Do not publish again without that id.',
            },
        });
    } finally {
        proxy.close();
        origin.stop(true);
        rmSync(directory, { recursive: true, force: true });
    }
});

test('a rejected publish reports the Server error', async () => {
    const origin = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch() {
            return new Response(Bun.zstdCompressSync(Buffer.from('name taken art_existing')), {
                status: 409,
                headers: {
                    'content-encoding': 'zstd',
                    'content-type': 'text/plain',
                },
            });
        },
    });
    const proxy = startLoopbackProxy({
        proxyToken: token,
        runnerToken: 'runner',
        serverOrigin: `http://127.0.0.1:${origin.port}`,
    });
    const directory = mkdtempSync(join(tmpdir(), 'haus-publish-reject-'));
    const file = join(directory, 'notes.txt');
    const tokenFile = join(directory, 'token');
    writeFileSync(file, 'hello');
    writeFileSync(tokenFile, token);
    process.env.HAUS_AGENT_ID = 'agt_wren';
    process.env.HAUS_SERVER_URL = proxy.url;
    process.env.HAUS_AGENT_TOKEN_FILE = tokenFile;
    try {
        await publish?.run(
            parseArgs(publishCommand, [
                '--path',
                file,
                '--title',
                'Notes',
                '--request-id',
                'publish-reject-1',
            ])
        );
        throw new Error('publish should have failed');
    } catch (error) {
        expect(error).toBeInstanceOf(AgentCliError);
        expect(error).toMatchObject({
            code: 'ARTIFACT_PUBLISH_FAILED',
            message: 'Publishing failed (409): name taken art_existing',
        });
    } finally {
        proxy.close();
        origin.stop(true);
        rmSync(directory, { recursive: true, force: true });
    }
});

test('the shared CLI client reads zstd without advertising it', async () => {
    const seen = { acceptEncoding: '' };
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch(request) {
            seen.acceptEncoding = request.headers.get('accept-encoding') ?? '';
            return new Response(Bun.zstdCompressSync(Buffer.from(JSON.stringify({ ok: true }))), {
                headers: {
                    'content-encoding': 'zstd',
                    'content-type': 'application/json',
                },
            });
        },
    });
    try {
        const client = new AgentApiClient({
            agentId: 'agt_wren',
            serverUrl: `http://127.0.0.1:${server.port}`,
            token,
            tokenFile: '/tmp/token',
        });
        await expect(
            client.request('/api/agent/ping', z.object({ ok: z.literal(true) }))
        ).resolves.toEqual({ ok: true });
        expect(seen.acceptEncoding).toBe('gzip, deflate, br');
    } finally {
        server.stop(true);
    }
});
