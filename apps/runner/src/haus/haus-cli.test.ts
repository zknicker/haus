import { afterEach, describe, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openDispatchLedger } from '../dispatch/ledger.ts';
import { driveRoutes } from '../runner-drive-routes.ts';
import {
    drainCleanups,
    live,
    runCredential,
    type StandInRoutes,
    startedRun,
} from '../runner-test-server.ts';

afterEach(drainCleanups);

describe('haus on the runner', () => {
    test('drive view prints a Drive file from the Server', async () => {
        const { run } = await startedRun(briefRoutes());

        expect(
            await run.tools.bash('toolu_1', { command: 'haus drive view haus/brief.md' }, live())
        ).toEqual({ content: [{ text: 'Ship it Friday.', type: 'text' }], isError: false });
    });

    test("drive view --output writes to the Agent's machine, never the runner's disk", async () => {
        const { run, runner, server } = await startedRun(briefRoutes());
        const otherSession = join(runner.dataDir, 'agents', 'agt_other', 'session.json');
        await mkdir(join(runner.dataDir, 'agents', 'agt_other'), { recursive: true });
        await writeFile(otherSession, JSON.stringify({ sessionId: 'other-agent-secret' }));

        const viewed = run.tools.bash(
            'toolu_1',
            { command: `haus drive view haus/brief.md --output ${otherSession}` },
            live()
        );

        expect(await server.frame('invocation-request')).toMatchObject({
            operation: { kind: 'file-write', mode: 0o600, path: otherSession },
            toolCallId: 'toolu_1',
        });
        server.answer({
            outcome: 'completed',
            output: { kind: 'text', text: `Wrote 15 bytes to ${otherSession}.` },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });
        expect(await viewed).toEqual({
            content: [{ text: `Saved haus/brief.md to ${otherSession}.`, type: 'text' }],
            isError: false,
        });
        expect(await readFile(otherSession, 'utf8')).toBe(
            JSON.stringify({ sessionId: 'other-agent-secret' })
        );
    });

    test('a 2 MiB attachment view uploads first and the file-write carries its reference', async () => {
        const photo = randomBytes(2 * 1024 * 1024);
        const sha256 = createHash('sha256').update(photo).digest('hex');
        const { run, server } = await startedRun({
            '/api/agent/attachments/att_photo': () =>
                Response.json({
                    attachment: {
                        byteSize: photo.byteLength,
                        dataBase64: photo.toString('base64'),
                        filename: 'photo.jpg',
                        id: 'att_photo',
                        mediaType: 'image/jpeg',
                    },
                }),
            '/api/agent/invocation-payloads': (body) =>
                Response.json({
                    ...(body as object),
                    attachmentId: 'att_upload0000000001',
                    mediaType: 'application/octet-stream',
                }),
        });

        const viewed = run.tools.bash(
            'toolu_1',
            { command: 'haus attachment view att_photo --output ./photo.jpg' },
            live()
        );

        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: {
                bytes: {
                    attachmentId: 'att_upload0000000001',
                    kind: 'attachment',
                    mediaType: 'application/octet-stream',
                    sha256,
                    sizeBytes: 2_097_152,
                },
                kind: 'file-write',
                mode: 0o600,
                path: './photo.jpg',
            },
            runId: 'run_1',
            seq: 0,
            sessionGeneration: 1,
            timeoutMs: 60_000,
            toolCallId: 'toolu_1',
            type: 'invocation-request',
        });
        server.answer({
            outcome: 'completed',
            output: { kind: 'text', text: 'Wrote 2097152 bytes to ./photo.jpg.' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });
        expect(await viewed).toEqual({
            content: [{ text: 'Saved attachment to ./photo.jpg.', type: 'text' }],
            isError: false,
        });
        expect(server.requests.map(({ body, method, path }) => ({ body, method, path }))).toEqual([
            { body: null, method: 'GET', path: '/api/agent/attachments/att_photo' },
            {
                body: { sha256, sizeBytes: 2_097_152 },
                method: 'PUT',
                path: '/api/agent/invocation-payloads?toolCallId=toolu_1&seq=0',
            },
        ]);
        expect(server.requests[1]?.authorization).toBe(`Bearer ${runCredential}`);
    });

    test('a refused upload sends no invocation, writes nothing, and settles the dispatch failed', async () => {
        const photo = randomBytes(800 * 1024);
        const { run, runner } = await startedRun({
            '/api/agent/attachments/att_photo': () =>
                Response.json({
                    attachment: {
                        byteSize: photo.byteLength,
                        dataBase64: photo.toString('base64'),
                        filename: 'photo.jpg',
                        id: 'att_photo',
                        mediaType: 'image/jpeg',
                    },
                }),
            '/api/agent/invocation-payloads': () =>
                Response.json({ error: 'Too large.' }, { status: 413 }),
        });

        expect(
            await run.tools.bash(
                'toolu_1',
                { command: 'haus attachment view att_photo --output ./photo.jpg' },
                live()
            )
        ).toEqual({
            content: [
                {
                    text: [
                        'Saved attachment to ./photo.jpg.',
                        './photo.jpg was not written to the machine.',
                        'The bytes could not reach the Server, so nothing was written. The Server refused the payload upload (HTTP 413).',
                    ].join('\n'),
                    type: 'text',
                },
            ],
            isError: true,
        });
        expect(
            await openDispatchLedger(runner.dataDir).read('agt_1', {
                runId: 'run_1',
                seq: 0,
                toolCallId: 'toolu_1',
            })
        ).toMatchObject({ kind: 'invocation', outcome: 'failed', state: 'finished' });
    });

    test("a trigger payload file is read from the Agent's machine, not the runner's disk", async () => {
        const { run, runner, server } = await startedRun();
        const otherSession = join(runner.dataDir, 'agents', 'agt_other', 'session.json');
        await mkdir(join(runner.dataDir, 'agents', 'agt_other'), { recursive: true });
        await writeFile(otherSession, JSON.stringify({ sessionId: 'other-agent-secret' }));

        const preview = run.tools.bash(
            'toolu_1',
            {
                command: `haus trigger preview --id trg_1 --event push --payload-file ${otherSession}`,
            },
            live()
        );

        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { kind: 'file-read', maxBytes: 268_435_456, path: otherSession },
            runId: 'run_1',
            seq: 0,
            sessionGeneration: 1,
            timeoutMs: 60_000,
            toolCallId: 'toolu_1',
            type: 'invocation-request',
        });
        server.answer({ outcome: 'offline', runId: 'run_1', seq: 0, toolCallId: 'toolu_1' });
        expect(await preview).toEqual({
            content: [
                {
                    text: 'The machine is offline. Nothing ran. `haus` and `execute` still work.',
                    type: 'text',
                },
            ],
            invocation: 'offline',
            isError: true,
        });
        expect(server.requests).toEqual([]);
    });
});

function briefRoutes() {
    return {
        ...driveRoutes('orbit', new Map([['haus/brief.md', 'Ship it Friday.']])),
        '/api/agent/artifacts/by-path': () =>
            Response.json({
                artifact: {
                    artifact_id: 'art_0',
                    content_type: 'text/markdown',
                    created_at: '2026-11-28T00:00:00.000Z',
                    creator: { agent_id: 'agt_cove', type: 'agent' },
                    filename: 'brief.md',
                    path: 'haus/brief.md',
                    revision_id: 'rev_brief',
                    revision_number: 1,
                    sha256: 'a'.repeat(64),
                    size_bytes: 15,
                    stable_url: 'https://haus.chat/s/demo/artifacts/art_0',
                    title: 'brief.md',
                    updated_at: '2026-11-28T00:00:00.000Z',
                    version_url: 'https://haus.chat/s/demo/artifacts/art_0?revision=rev_brief',
                },
            }),
    } satisfies StandInRoutes;
}
