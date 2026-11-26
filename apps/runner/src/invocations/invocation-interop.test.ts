import { afterEach, describe, expect, test } from 'bun:test';
import {
    type EditorCommand,
    type InvocationOperation,
    type InvocationOutput,
    type InvokeCommand,
    invocationRequestFrameSchema,
    invokeCommandSchema,
} from '@haus/api';
import {
    drainCleanups,
    live,
    runCredential,
    type ServerStandIn,
    startedRun,
} from '../runner-test-server.ts';

afterEach(drainCleanups);

describe('every operation the runner builds is an invoke the Computer accepts', () => {
    test('bash', async () => {
        const { run, server } = await startedRun();

        const pending = run.tools.bash('toolu_1', { command: 'ls -la' }, live());

        expect(await invokeOf(server)).toEqual(
            invoke({ command: 'ls -la', kind: 'bash' }, 120_000)
        );
        complete(server, 'toolu_1', { kind: 'text', text: 'total 0\n' });
        expect(await pending).toEqual({
            content: [{ text: 'total 0\n', type: 'text' }],
            invocation: 'completed',
            isError: false,
        });
    });

    test.each([
        { command: 'view', path: 'notes.md', view_range: [1, 20] },
        { command: 'create', file_text: 'hello\n', path: 'notes.md' },
        { command: 'str_replace', new_str: 'world', old_str: 'hello', path: 'notes.md' },
        { command: 'insert', insert_line: 0, new_str: '# Notes\n', path: 'notes.md' },
    ] satisfies EditorCommand[])('edit $command', async (edit) => {
        const { run, server } = await startedRun();

        const pending = run.tools.edit('toolu_1', edit, live());

        expect(await invokeOf(server)).toEqual(invoke({ edit, kind: 'edit' }, 30_000));
        complete(server, 'toolu_1', { kind: 'text', text: 'done' });
        expect(await pending).toEqual({
            content: [{ text: 'done', type: 'text' }],
            invocation: 'completed',
            isError: false,
        });
    });

    test('file-read for a haus machine path', async () => {
        const { run, server } = await startedRun({
            '/api/agent/attachments/upload': () =>
                Response.json({
                    attachment: {
                        byteSize: 10,
                        filename: 'chart.csv',
                        id: 'att_1',
                        mediaType: 'text/csv',
                    },
                }),
        });

        const pending = run.tools.bash(
            'toolu_1',
            { command: 'haus attachment upload --path ./chart.csv' },
            live()
        );

        expect(await invokeOf(server)).toEqual(
            invoke({ kind: 'file-read', maxBytes: 268_435_456, path: './chart.csv' }, 60_000)
        );
        complete(server, 'toolu_1', {
            base64: Buffer.from('a,b\n1,2\n').toString('base64'),
            kind: 'inline',
            mediaType: 'application/octet-stream',
        });
        expect(await pending).toEqual({
            content: [
                {
                    text: 'Uploaded chart.csv. Attachment ID: att_1\nAttach it to a message: haus message send --target <t> --attachment-id att_1',
                    type: 'text',
                },
            ],
            isError: false,
        });
        expect(server.requests).toEqual([
            {
                authorization: `Bearer ${runCredential}`,
                body: {
                    dataBase64: Buffer.from('a,b\n1,2\n').toString('base64'),
                    filename: 'chart.csv',
                    mediaType: 'text/csv',
                },
                dispatchId: 'run_1:toolu_1:1',
                method: 'POST',
                path: '/api/agent/attachments/upload',
            },
        ]);
    });

    test('file-write for a haus machine path, inline', async () => {
        const { run, server } = await startedRun({
            '/api/agent/attachments/att_1': () =>
                Response.json({
                    attachment: {
                        byteSize: 6,
                        dataBase64: Buffer.from('report').toString('base64'),
                        filename: 'report.txt',
                        id: 'att_1',
                        mediaType: 'text/plain',
                    },
                }),
        });

        const pending = run.tools.bash(
            'toolu_1',
            { command: 'haus attachment view att_1 --output ./report.txt' },
            live()
        );

        expect(await invokeOf(server)).toEqual(
            invoke(
                {
                    bytes: {
                        base64: Buffer.from('report').toString('base64'),
                        kind: 'inline',
                        mediaType: 'application/octet-stream',
                    },
                    kind: 'file-write',
                    mode: 0o600,
                    path: './report.txt',
                },
                60_000
            )
        );
        complete(server, 'toolu_1', { kind: 'text', text: 'Wrote 6 bytes to ./report.txt.' });
        expect(await pending).toEqual({
            content: [{ text: 'Saved attachment to ./report.txt.', type: 'text' }],
            isError: false,
        });
    });

    test('browser from execute', async () => {
        const { run, server } = await startedRun();

        const pending = run.tools.execute(
            'toolu_1',
            {
                code: 'return await tools.call({ name: "browser", args: { args: ["snapshot", "-i"] } });',
            },
            live()
        );

        expect(await invokeOf(server)).toEqual(
            invoke({ args: ['snapshot', '-i'], kind: 'browser' }, 60_000)
        );
        complete(server, 'toolu_1', { kind: 'text', text: '- button "Save" [ref=e1]' });
        const result = await pending;
        expect(result.isError).toBe(false);
        expect(
            JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')
        ).toEqual({ logs: [], result: { exitCode: 0, output: '- button "Save" [ref=e1]' } });
    });
});

async function invokeOf(server: ServerStandIn) {
    const request = invocationRequestFrameSchema.parse(await server.frame('invocation-request'));
    return invokeCommandSchema.parse({
        agentId: request.agentId,
        invocationId: 'inv_1',
        notAfter: '2999-01-01T00:00:00.000Z',
        operation: request.operation,
        runId: request.runId,
        sessionGeneration: request.sessionGeneration,
        timeoutMs: request.timeoutMs,
        type: 'invoke',
    });
}

function invoke(operation: InvocationOperation, timeoutMs: number) {
    return {
        agentId: 'agt_1',
        invocationId: 'inv_1',
        notAfter: '2999-01-01T00:00:00.000Z',
        operation,
        runId: 'run_1',
        sessionGeneration: 1,
        timeoutMs,
        type: 'invoke',
    } satisfies InvokeCommand;
}

function complete(server: ServerStandIn, toolCallId: string, output: InvocationOutput) {
    server.answer({
        exitCode: 0,
        outcome: 'completed',
        output,
        runId: 'run_1',
        seq: 0,
        toolCallId,
    });
}
