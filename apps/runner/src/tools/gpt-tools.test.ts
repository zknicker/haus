import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';
import { shellCommandOf } from './shell-command.ts';

afterEach(drainCleanups);

describe('GPT machine tools', () => {
    test('shell quotes argv into one command and keeps a bash -lc script whole', () => {
        expect(shellCommandOf(['rg', '-n', "it's here", 'src/'])).toEqual({
            command: "rg -n 'it'\\''s here' src/",
            script: "rg -n 'it'\\''s here' src/",
        });
        expect(shellCommandOf(['bash', '-lc', 'ls -la && echo "$HOME"'])).toEqual({
            command: `bash -lc 'ls -la && echo "$HOME"'`,
            script: 'ls -la && echo "$HOME"',
        });
        expect(shellCommandOf(['echo', ''])).toEqual({ command: "echo ''", script: "echo ''" });
    });

    test('shell runs on the machine with workdir as cwd and timeout_ms as the timeout', async () => {
        const { run, server } = await startedRun();

        const ran = run.tools.shell(
            'call_1',
            { command: ['bash', '-lc', 'npm test'], timeout_ms: 5000, workdir: 'repo' },
            live()
        );

        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { command: "bash -lc 'npm test'", cwd: 'repo', kind: 'bash' },
            runId: 'run_1',
            seq: 0,
            timeoutMs: 5000,
            toolCallId: 'call_1',
            type: 'invocation-request',
        });
        server.answer({
            exitCode: 0,
            outcome: 'completed',
            output: { kind: 'text', text: 'ok' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'call_1',
        });
        expect(await ran).toEqual({
            content: [{ text: 'ok', type: 'text' }],
            invocation: 'completed',
            isError: false,
        });
    });

    test('a lone haus inside bash -lc runs in Haus, and haus in a pipeline is refused', async () => {
        const { run, server } = await startedRun();

        const sent = await run.tools.shell(
            'call_2',
            { command: ['bash', '-lc', "haus message send --target '#all' <<< 'ship it'"] },
            live()
        );
        const piped = await run.tools.shell(
            'call_3',
            { command: ['bash', '-lc', 'haus message read | head'] },
            live()
        );

        expect(sent.isError).toBe(false);
        expect(server.requests.map((request) => request.path)).toEqual([
            '/api/agent/messages/send',
        ]);
        expect(piped).toEqual({
            content: [
                {
                    text: 'Error: haus must run as its own command, not inside a pipeline, list, substitution, or redirection, and with literal arguments.\nCode: HAUS_NOT_ALONE\nNext action: run `haus` as its own command.',
                    type: 'text',
                },
            ],
            isError: true,
        });
    });

    test('apply_patch sends the patch as an edit and refuses an empty one', async () => {
        const { run, server } = await startedRun();
        const patch = '*** Begin Patch\n*** Add File: notes.md\n+hello\n*** End Patch';

        const applied = run.tools.applyPatch('call_4', { input: patch }, live());
        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { edit: { command: 'apply_patch', input: patch }, kind: 'edit' },
            runId: 'run_1',
            seq: 0,
            timeoutMs: 30_000,
            toolCallId: 'call_4',
            type: 'invocation-request',
        });
        server.answer({
            outcome: 'completed',
            output: { kind: 'text', text: 'Success. Updated the following files:\nA notes.md' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'call_4',
        });
        expect((await applied).isError).toBe(false);
        expect(await run.tools.applyPatch('call_5', { input: '' }, live())).toEqual({
            content: [
                {
                    text: 'The apply_patch input is invalid. Nothing ran.\n✖ Too small: expected string to have >=1 characters\n  → at input',
                    type: 'text',
                },
            ],
            isError: true,
        });
    });

    test('view_image returns inline bytes as an image and names an attachment it cannot read yet', async () => {
        const { run, server } = await startedRun();

        const inline = run.tools.viewImage('call_6', { path: 'chart.png' }, live());
        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { kind: 'view-image', path: 'chart.png' },
            runId: 'run_1',
            seq: 0,
            timeoutMs: 30_000,
            toolCallId: 'call_6',
            type: 'invocation-request',
        });
        server.answer({
            outcome: 'completed',
            output: { base64: 'iVBORw0K', kind: 'inline', mediaType: 'image/png' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'call_6',
        });
        expect(await inline).toEqual({
            content: [{ data: 'iVBORw0K', mimeType: 'image/png', type: 'image' }],
            invocation: 'completed',
            isError: false,
        });

        const attached = run.tools.viewImage('call_7', { path: 'big.png' }, live());
        await server.frame('invocation-request');
        server.answer({
            outcome: 'completed',
            output: {
                attachmentId: 'att_1',
                kind: 'attachment',
                mediaType: 'image/png',
                sha256: 'a'.repeat(64),
                sizeBytes: 9_000_000,
            },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'call_7',
        });
        expect(await attached).toEqual({
            content: [
                {
                    text: 'The result arrived as attachment att_1 (image/png, 9000000 bytes), which this runner cannot read yet.',
                    type: 'text',
                },
            ],
            invocation: 'completed',
            isError: false,
        });
    });
});
