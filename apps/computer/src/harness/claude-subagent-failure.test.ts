import { describe, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { createHarnessForRuntime } from './runtime-harness.ts';

interface StreamState {
    observedTerminalError: string | undefined;
}
type EmitStreamEvent = (message: Record<string, unknown>) => void;

describe('the shipped Claude bridge', () => {
    test('a failed sub-agent stays activity instead of ending the parent turn', async () => {
        const { emitted, emitStreamEvent, terminalErrors } = await loadEmitStreamEvent();

        emitStreamEvent(taskStarted('task-1'));
        emitStreamEvent(taskFailed('task-1', 'Sub-agent hit its turn limit'));

        expect(terminalErrors).toEqual([]);
        expect(emitted.map((part) => part.type)).toEqual(['stream-start', 'raw', 'raw']);
    });

    test('an unannounced task failure still ends the turn', async () => {
        const { emitStreamEvent, terminalErrors } = await loadEmitStreamEvent();

        emitStreamEvent(taskStarted('task-1'));
        emitStreamEvent(taskFailed('task-2', 'Claude Code session failed'));

        expect(terminalErrors).toEqual(['Claude Code session failed']);
    });

    test("a sub-agent message error is not recorded as the parent's terminal error", async () => {
        const { emitted, emitStreamEvent, state } = await loadEmitStreamEvent();

        emitStreamEvent({
            type: 'assistant',
            parent_tool_use_id: 'toolu_agent',
            error: 'rate_limit',
            message: { content: [] },
        });

        expect(state.observedTerminalError).toBeUndefined();
        expect(emitted.at(-1)?.type).toBe('raw');
    });
});

async function loadEmitStreamEvent() {
    const bootstrap = await createHarnessForRuntime('claude-code', 'medium').getBootstrap?.();
    const bridge = bootstrap?.files.find((file) => file.path.endsWith('/bridge.mjs'))?.content;
    if (typeof bridge !== 'string') {
        throw new Error('Missing shipped Claude bridge');
    }
    // Exercise the bundled stream mapper without launching a vendor runtime.
    const start = bridge.indexOf('const UNRECOVERABLE_API_RETRY_STATUSES');
    const end = bridge.indexOf('function finishApprovalStep', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);

    const emitted: Record<string, unknown>[] = [];
    const terminalErrors: (string | undefined)[] = [];
    const state: StreamState = { observedTerminalError: undefined };
    const emitStreamEvent = runInNewContext(
        `${bridge.slice(start, end)}\ncreateEmitStreamEvent(options)`,
        {
            options: {
                emit: (part: Record<string, unknown>) => emitted.push(part),
                emitTerminalError: (message: string | undefined) => terminalErrors.push(message),
                emitWarning: () => undefined,
                onCompactionBoundary: () => undefined,
                state,
                toCommonName: (name: string) => name,
            },
        }
    ) as EmitStreamEvent;
    return { emitted, emitStreamEvent, state, terminalErrors };
}

function taskStarted(taskId: string) {
    return {
        type: 'system',
        subtype: 'task_started',
        task_id: taskId,
        tool_use_id: 'toolu_agent',
        description: 'Research',
        task_type: 'local_agent',
    };
}

function taskFailed(taskId: string, error: string) {
    return {
        type: 'system',
        subtype: 'task_updated',
        task_id: taskId,
        patch: { status: 'failed', error },
    };
}
