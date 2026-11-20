import { afterEach, describe, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { openDispatchLedger } from '../dispatch/ledger.ts';
import type { ToolOutcome } from '../run-context.ts';
import { drainCleanups, live, runCredential, startedRun } from '../runner-test-server.ts';

afterEach(drainCleanups);

describe('haus on the runner', () => {
    test("drive view never writes over another Agent's session on the runner's disk", async () => {
        const { run, runner, server } = await startedRun();
        const otherSession = join(runner.dataDir, 'agents', 'agt_other', 'session.json');
        await mkdir(join(runner.dataDir, 'agents', 'agt_other'), { recursive: true });
        await writeFile(otherSession, JSON.stringify({ sessionId: 'other-agent-secret' }));
        const relativeSession = `../../${basename(runner.dataDir)}/agents/agt_other/session.json`;

        const absolute = await run.tools.bash(
            'toolu_1',
            { command: `haus drive view haus/brief.md --output ${otherSession}` },
            live()
        );
        const relative = await run.tools.bash(
            'toolu_2',
            { command: `haus drive view haus/brief.md --output ${relativeSession}` },
            live()
        );

        expect([absolute, relative]).toEqual([workspaceRefusal, workspaceRefusal]);
        expect(server.requests).toEqual([]);
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

const workspaceRefusal = {
    content: [
        {
            text: [
                'Error: `haus drive view` moves files between Drive and your workspace, which `haus` cannot reach on its own.',
                'Code: HAUS_WORKSPACE_UNREACHABLE',
                'Next action: Read the current version in your `drive/` folder with file commands; `haus drive versions` lists its history.',
            ].join('\n'),
            type: 'text',
        },
    ],
    isError: true,
} satisfies ToolOutcome;
