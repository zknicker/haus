import { afterEach, describe, expect, test } from 'bun:test';
import type { TranscriptContext } from '@earendil-works/pi-ai';
import {
    fauxAssistantMessage,
    fauxText,
    fauxThinking,
    fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';
import { agentDir, collect, fauxHarness, launch, roles } from './pi-faux-run.ts';

afterEach(drainCleanups);

describe('Pi Durable driver', () => {
    test('a turn runs a Haus tool on the machine and streams the answer under our prompt alone', async () => {
        const { run, server } = await startedRun();
        const seen: TranscriptContext[] = [];
        const harness = fauxHarness([
            fauxAssistantMessage(
                [
                    fauxThinking('List them first.'),
                    fauxToolCall('bash', { command: 'ls' }, { id: 'call_1' }),
                ],
                { stopReason: 'toolUse' }
            ),
            (context) => {
                seen.push(context);
                return fauxAssistantMessage([fauxText('Two files.')]);
            },
        ]);
        const driver = harness.factory(launch(await agentDir(), run.tools));
        const session = await driver.openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });

        const turn = await session.startTurn({ prompt: 'What is here?', signal: live() });
        const events = collect(turn.events);
        expect(await server.frame('invocation-request')).toMatchObject({
            operation: { command: 'ls', kind: 'bash' },
            toolCallId: 'call_1',
        });
        server.answer({
            exitCode: 0,
            outcome: 'completed',
            output: { kind: 'text', text: 'a.txt\nb.txt' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'call_1',
        });

        expect(await events).toEqual({
            reasoning: 'List them first.',
            steps: [
                'reasoning-start',
                'reasoning-end',
                {
                    input: { command: 'ls' },
                    toolCallId: 'call_1',
                    toolName: 'bash',
                    type: 'tool-call',
                },
                'step-finish',
                {
                    invocation: 'completed',
                    output: 'a.txt\nb.txt',
                    toolCallId: 'call_1',
                    toolName: 'bash',
                    type: 'tool-result',
                },
                'step-finish',
                { type: 'turn-finish', usage: true },
            ],
            text: 'Two files.',
        });
        expect(turn.unconsumedSteers()).toEqual([]);
        const system = seen[0]?.messages.find((message) => message.role === 'system');
        expect(system).toMatchObject({
            content: '',
            sections: { haus: 'You are Blippy, a Haus Agent.\n' },
        });
        expect(system?.role === 'system' && system.toolsAdded?.map((tool) => tool.name)).toEqual([
            'bash',
            'str_replace_based_edit_tool',
            'execute',
        ]);
        expect(await session.detach()).toBe(session.sessionId);
        expect(harness.warm).toBe(1);
    });

    test('a steer sent while a tool runs joins the run, and nothing comes back unconsumed', async () => {
        const { run, server } = await startedRun();
        const seen: TranscriptContext[] = [];
        const harness = fauxHarness([
            fauxAssistantMessage([fauxToolCall('bash', { command: 'sleep 5' }, { id: 'call_1' })], {
                stopReason: 'toolUse',
            }),
            (context) => {
                seen.push(context);
                return fauxAssistantMessage([fauxText('Counted.')]);
            },
        ]);
        const driver = harness.factory(launch(await agentDir(), run.tools));
        const session = await driver.openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });

        const turn = await session.startTurn({ prompt: 'Wait, then answer.', signal: live() });
        const events = collect(turn.events);
        await server.frame('invocation-request');
        expect(await session.steer('Also count the files.')).toEqual({ delivered: true });
        server.answer({ outcome: 'completed', runId: 'run_1', seq: 0, toolCallId: 'call_1' });

        expect((await events).text).toBe('Counted.');
        expect(roles(seen[0] as TranscriptContext)).toEqual([
            'system',
            'user',
            'assistant',
            'toolResult',
            'user',
        ]);
        expect(seen[0]?.messages.at(-1)).toMatchObject({ content: 'Also count the files.' });
        expect(turn.unconsumedSteers()).toEqual([]);
        expect(await session.steer('Too late.')).toEqual({ delivered: false, reason: 'idle' });
    });

    test('a stop mid-tool cancels the invocation and ends the turn as an abort', async () => {
        const { run, server } = await startedRun();
        const harness = fauxHarness([
            fauxAssistantMessage(
                [fauxToolCall('bash', { command: 'sleep 60' }, { id: 'call_1' })],
                {
                    stopReason: 'toolUse',
                }
            ),
        ]);
        const driver = harness.factory(launch(await agentDir(), run.tools));
        const session = await driver.openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });
        const stop = new AbortController();

        const turn = await session.startTurn({ prompt: 'Sleep.', signal: stop.signal });
        const events = collect(turn.events);
        await server.frame('invocation-request');
        stop.abort();
        expect(await server.frame('invocation-cancel')).toMatchObject({ toolCallId: 'call_1' });
        server.answer({ outcome: 'cancelled', runId: 'run_1', seq: 0, toolCallId: 'call_1' });

        expect((await events).steps.at(-1)).toBe('abort');
    });

    test('GPT models get shell, apply_patch, and view_image', async () => {
        const { run } = await startedRun();
        const seen: TranscriptContext[] = [];
        const harness = fauxHarness([
            (context) => {
                seen.push(context);
                return fauxAssistantMessage([fauxText('Ready.')]);
            },
        ]);
        const session = await harness
            .factory(launch(await agentDir(), run.tools, 'gpt-faux'))
            .openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });

        await collect((await session.startTurn({ prompt: 'Hi.', signal: live() })).events);

        const system = seen[0]?.messages.find((message) => message.role === 'system');
        expect(system?.role === 'system' && system.toolsAdded?.map((tool) => tool.name)).toEqual([
            'shell',
            'apply_patch',
            'view_image',
            'execute',
        ]);
    });
});
