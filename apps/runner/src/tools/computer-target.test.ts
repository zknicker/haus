import { afterEach, describe, expect, test } from 'bun:test';
import type { RunnerUpFrame } from '@haus/api';
import { PiToolBinding, piTools } from '../pi/pi-tools.ts';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';
import { computerTargetDescription } from './computer-target.ts';

afterEach(drainCleanups);

describe('per-call Computer target', () => {
    test('every machine tool call puts its computer on the frame, outside the operation', async () => {
        const { run, server } = await startedRun();
        const calls = [
            () => run.tools.bash('call_1', { command: 'ls', computer: 'macbook' }, live()),
            () => run.tools.shell('call_2', { command: ['ls'], computer: 'macbook' }, live()),
            () =>
                run.tools.edit(
                    'call_3',
                    { command: 'view', computer: 'macbook', path: 'notes.md' },
                    live()
                ),
            () =>
                run.tools.applyPatch(
                    'call_4',
                    {
                        computer: 'macbook',
                        input: '*** Begin Patch\n*** Add File: a.txt\n+hi\n*** End Patch',
                    },
                    live()
                ),
            () => run.tools.viewImage('call_5', { computer: 'macbook', path: 'a.png' }, live()),
        ];

        for (const call of calls) {
            const answered = call();
            const frame = await server.frame('invocation-request');
            expect(frame).toMatchObject({ computer: 'macbook', type: 'invocation-request' });
            expect(Object.keys(operationOf(frame))).not.toContain('computer');
            server.answer(answerFor(frame));
            await answered;
        }
    });

    test('a call without a computer sends a frame with no computer key', async () => {
        const { run, server } = await startedRun();

        const ran = run.tools.bash('call_1', { command: 'ls' }, live());
        const frame = await server.frame('invocation-request');
        server.answer(answerFor(frame));
        await ran;

        expect(Object.keys(frame)).not.toContain('computer');
    });

    test('execute relays browser and desktop with their computer and no computer for the home', async () => {
        const { run, server } = await startedRun();

        const executed = run.tools.execute(
            'call_1',
            {
                code: [
                    'await tools.call({ name: "browser", args: { args: ["snapshot"], computer: "cmp_macbook" } });',
                    'await tools.call({ name: "desktop", args: { args: ["click", "@s1:e8"], computer: "MacBook" } });',
                    'await tools.call({ name: "browser", args: { args: ["snapshot"] } });',
                    'return null;',
                ].join('\n'),
            },
            live()
        );
        const frames: RunnerUpFrame[] = [];
        for (const _call of [0, 1, 2]) {
            const frame = await server.frame('invocation-request');
            frames.push(frame);
            server.answer(answerFor(frame));
        }
        await executed;

        expect(frames).toEqual([
            expect.objectContaining({
                computer: 'cmp_macbook',
                operation: { args: ['snapshot'], kind: 'browser' },
            }),
            expect.objectContaining({
                computer: 'MacBook',
                operation: { args: ['click', '@s1:e8'], kind: 'desktop' },
            }),
            expect.not.objectContaining({ computer: expect.anything() }),
        ]);
    });

    test("an offline answer keeps the Server's text, which names the Computer", async () => {
        const { run, server } = await startedRun();
        const text = 'MacBook is offline. Nothing ran. Your home Computer and `haus` still work.';

        const ran = run.tools.bash('call_1', { command: 'ls', computer: 'MacBook' }, live());
        await server.frame('invocation-request');
        server.answer({
            outcome: 'offline',
            output: { kind: 'text', text },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'call_1',
        });

        expect(await ran).toEqual({
            content: [{ text, type: 'text' }],
            invocation: 'offline',
            isError: true,
        });
    });

    test('a haus upload inside a targeted bash reads its --path on that Computer', async () => {
        const { run, server } = await startedRun();

        const upload = run.tools.bash(
            'call_1',
            { command: 'haus attachment upload --path /tmp/shot.png', computer: 'macbook' },
            live()
        );

        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            computer: 'macbook',
            operation: { kind: 'file-read', maxBytes: 268_435_456, path: '/tmp/shot.png' },
            runId: 'run_1',
            seq: 0,
            sessionGeneration: 1,
            timeoutMs: 60_000,
            toolCallId: 'call_1',
            type: 'invocation-request',
        });
        server.answer({ outcome: 'offline', runId: 'run_1', seq: 0, toolCallId: 'call_1' });
        expect((await upload).invocation).toBe('offline');
    });

    test('every Pi machine tool declares the computer field and the web tools do not', () => {
        const declared = [
            ...piTools('gpt', 'off', new PiToolBinding()),
            ...piTools('text-editor', 'hosted', new PiToolBinding()),
        ].map((tool) => [tool.name, propertiesOf(tool.parameters).computer?.description ?? null]);

        expect(Object.fromEntries(declared)).toEqual({
            apply_patch: computerTargetDescription,
            bash: computerTargetDescription,
            execute: null,
            process_kill: computerTargetDescription,
            process_read: computerTargetDescription,
            shell: computerTargetDescription,
            str_replace_based_edit_tool: computerTargetDescription,
            view_image: computerTargetDescription,
            web_fetch: null,
            web_search: null,
        });
    });
});

function operationOf(frame: RunnerUpFrame) {
    return frame.type === 'invocation-request' ? frame.operation : {};
}

function answerFor(frame: RunnerUpFrame) {
    if (frame.type !== 'invocation-request') {
        throw new Error(`Expected an invocation-request, got ${frame.type}.`);
    }
    return {
        exitCode: 0,
        outcome: 'completed' as const,
        runId: frame.runId,
        seq: frame.seq,
        toolCallId: frame.toolCallId,
    };
}

function propertiesOf(parameters: unknown) {
    const { properties } = parameters as {
        properties: Record<string, { description?: string } | undefined>;
    };
    return properties;
}
