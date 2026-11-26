import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
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
        expect(shellCommandOf(['/bin/sh', '-ec', 'haus message check', 'sh', 'one'])).toEqual({
            command: "/bin/sh -ec 'haus message check' sh one",
            script: 'haus message check',
        });
        expect(shellCommandOf(['bash', '-l', '-c', 'haus message check'])).toEqual({
            command: "bash -l -c 'haus message check'",
            script: 'haus message check',
        });
        expect(shellCommandOf(['bash', 'script.sh', '-c', 'haus'])).toEqual({
            command: 'bash script.sh -c haus',
            script: 'bash script.sh -c haus',
        });
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
            sessionGeneration: 1,
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
        expect(piped).toEqual(hausNotAlone);
    });

    test('a shell wrapper with trailing arguments still has its script checked for haus', async () => {
        const { run, server } = await startedRun();

        const quoted = await run.tools.shell(
            'call_8',
            { command: ['bash', '-lc', '"haus" message read | cat', 'arg0'] },
            live()
        );
        const read = await run.tools.shell(
            'call_9',
            { command: ['bash', '-lc', 'haus message read'] },
            live()
        );
        const zsh = await run.tools.shell(
            'call_10',
            { command: ['/bin/zsh', '-c', "'haus' send x", 'x'] },
            live()
        );
        const listed = run.tools.shell('call_11', { command: ['ls', '-la'] }, live());

        expect(quoted).toEqual(hausNotAlone);
        expect(read).toEqual({
            content: [
                {
                    text: 'Error: --target is required.\nCode: INVALID_ARG\nExit code: 1',
                    type: 'text',
                },
            ],
            isError: true,
        });
        expect(zsh).toEqual({
            content: [
                {
                    text: 'Error: `haus send x` is not a haus command.\nCode: UNKNOWN_HAUS_COMMAND\nNext action: Run `haus help` for the command list.',
                    type: 'text',
                },
            ],
            isError: true,
        });
        expect(server.requests.map((request) => request.path)).toEqual([]);
        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { command: 'ls -la', kind: 'bash' },
            runId: 'run_1',
            seq: 0,
            sessionGeneration: 1,
            timeoutMs: 120_000,
            toolCallId: 'call_11',
            type: 'invocation-request',
        });
        server.answer({ outcome: 'completed', runId: 'run_1', seq: 0, toolCallId: 'call_11' });
        expect((await listed).invocation).toBe('completed');
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
            sessionGeneration: 1,
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

    test('view_image returns inline bytes and attachment payloads as images', async () => {
        const big = Buffer.alloc(9000, 7);
        const { run, server } = await startedRun({
            '/api/agent/invocation-payloads/att_1': () =>
                new Response(big, { headers: { 'content-type': 'image/png' } }),
        });

        const inline = run.tools.viewImage('call_6', { path: 'chart.png' }, live());
        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { kind: 'view-image', path: 'chart.png' },
            runId: 'run_1',
            seq: 0,
            sessionGeneration: 1,
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
                sha256: createHash('sha256').update(big).digest('hex'),
                sizeBytes: big.byteLength,
            },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'call_7',
        });
        expect(await attached).toEqual({
            content: [{ data: big.toString('base64'), mimeType: 'image/png', type: 'image' }],
            invocation: 'completed',
            isError: false,
        });
    });
});

const hausNotAlone = {
    content: [
        {
            text: 'Error: haus must run as its own command, not inside a pipeline, list, substitution, or redirection, and with literal arguments.\nCode: HAUS_NOT_ALONE\nNext action: run `haus` as its own command.',
            type: 'text',
        },
    ],
    isError: true,
} as const;
