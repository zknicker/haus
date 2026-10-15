import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { AgentApiClient } from '../agent-cli/agent-api-client.ts';
import { ARTIFACT_SUBCOMMANDS } from '../agent-cli/commands/agent-artifact.ts';
import { parseArgs } from '../agent-cli/parse.ts';
import { startLoopbackProxy } from '../proxy.ts';

const push = ARTIFACT_SUBCOMMANDS.find((sub) => sub.name === 'push');
const pushCommand = { ...push, section: 'files' } as Parameters<typeof parseArgs>[0];
const token = `grta_${'a'.repeat(43)}`;
const artifact = {
    artifact_id: 'art_report',
    content_type: 'text/plain',
    created_at: '2026-10-13T00:00:00.000Z',
    creator: { type: 'agent', agent_id: 'agt_wren' },
    filename: 'notes.txt',
    path: 'notes.txt',
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

/** Runs `haus files push <file> notes.txt` through the real Computer proxy against `respond`. */
async function pushThroughProxy(
    respond: (request: Request) => Response | Promise<Response>,
    extra: string[] = []
) {
    const origin = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: respond });
    const proxy = startLoopbackProxy({
        proxyToken: token,
        runnerToken: 'runner',
        serverOrigin: `http://127.0.0.1:${origin.port}`,
    });
    const directory = mkdtempSync(join(tmpdir(), 'haus-push-'));
    const file = join(directory, 'notes.txt');
    const tokenFile = join(directory, 'token');
    writeFileSync(file, 'hello');
    writeFileSync(tokenFile, token);
    process.env.HAUS_AGENT_ID = 'agt_wren';
    process.env.HAUS_SERVER_URL = proxy.url;
    process.env.HAUS_AGENT_TOKEN_FILE = tokenFile;
    const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
        const code = await push?.run(parseArgs(pushCommand, [file, 'notes.txt', ...extra]));
        const summary = JSON.parse(stdout.mock.calls.map((call) => String(call[0])).join(''));
        let manifest: unknown = null;
        try {
            manifest = JSON.parse(readFileSync(join(directory, '.haus-artifacts.json'), 'utf8'));
        } catch {
            manifest = null;
        }
        return { code, summary, manifest };
    } finally {
        stdout.mockRestore();
        stderr.mockRestore();
        proxy.close();
        origin.stop(true);
        rmSync(directory, { recursive: true, force: true });
    }
}

test('artifact push reads a zstd Server response through the Computer proxy', async () => {
    const seen = { acceptEncoding: null as string | null, body: '', query: new URLSearchParams() };
    const result = await pushThroughProxy(async (request) => {
        seen.acceptEncoding = request.headers.get('accept-encoding');
        seen.body = await request.text();
        seen.query = new URL(request.url).searchParams;
        return new Response(Bun.zstdCompressSync(Buffer.from(JSON.stringify({ artifact }))), {
            status: 201,
            headers: { 'content-encoding': 'zstd', 'content-type': 'application/json' },
        });
    });
    expect(result.code).toBe(0);
    expect(result.summary.created).toEqual([
        expect.objectContaining({ path: 'notes.txt', revision_id: 'rev_report' }),
    ]);
    expect(seen.acceptEncoding).toBe('gzip, deflate, br');
    expect(seen.body).toBe('hello');
    expect(seen.query.get('path')).toBe('notes.txt');
    expect(seen.query.get('request_id')).toMatch(/^push-[a-f0-9]{40}$/u);
    expect(result.manifest).toEqual({
        folder: null,
        files: {
            'notes.txt': {
                artifact_id: 'art_report',
                path: 'notes.txt',
                revision_id: 'rev_report',
                sha256: artifact.sha256,
            },
        },
        version: 1,
    });
});

test('a lost push response is reported as unconfirmed and leaves the manifest alone', async () => {
    const result = await pushThroughProxy(
        () =>
            new Response(Uint8Array.from([0, 1, 2, 3]), {
                status: 201,
                headers: { 'content-encoding': 'zstd', 'content-type': 'application/json' },
            })
    );
    expect(result.code).toBe(1);
    expect(result.summary.errors).toEqual([
        expect.objectContaining({ code: 'ARTIFACT_PUBLISH_UNCONFIRMED', path: 'notes.txt' }),
    ]);
    expect(result.manifest).toBeNull();
});

test('a taken path is collected as a conflict with the pull command for the current head', async () => {
    const current = { ...artifact, revision_id: 'rev_theirs', revision_number: 3 };
    const result = await pushThroughProxy(() =>
        Response.json(
            { code: 'REVISION_CONFLICT', current, message: '`notes.txt` already exists.' },
            { status: 409 }
        )
    );
    expect(result.code).toBe(1);
    expect(result.summary.conflicts).toEqual([
        expect.objectContaining({
            reason: 'exists',
            base_revision_id: null,
            current: expect.objectContaining({ revision_id: 'rev_theirs', path: 'notes.txt' }),
            pull: expect.stringMatching(/^haus files pull notes\.txt \S+notes\.txt$/u),
        }),
    ]);
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
