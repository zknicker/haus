import { expect, test } from 'bun:test';
import {
    agentCommandSchema,
    agentExecutionOutlineSchema,
    agentExecutionOutlinesInputSchema,
    EXECUTION_OUTLINE_LABEL_MAX_CHARS,
    EXECUTION_OUTLINES_MAX_RUNS,
} from './index.ts';

const ids = (count: number) => Array.from({ length: count }, (_, index) => `run_${index}`);

test('an outlines request names 1 to 50 distinct runs and rides the Computer command union', () => {
    const input = { agentId: 'agt_1', serverId: 'srv_1' };
    expect(agentExecutionOutlinesInputSchema.safeParse({ ...input, runIds: [] }).success).toBe(
        false
    );
    expect(
        agentExecutionOutlinesInputSchema.safeParse({ ...input, runIds: ['run_a', 'run_a'] })
            .success
    ).toBe(false);
    expect(
        agentExecutionOutlinesInputSchema.safeParse({
            ...input,
            runIds: ids(EXECUTION_OUTLINES_MAX_RUNS + 1),
        }).success
    ).toBe(false);
    expect(
        agentCommandSchema.parse({
            agentId: 'agt_1',
            requestId: 'req_1',
            runIds: ids(EXECUTION_OUTLINES_MAX_RUNS),
            type: 'agent-execution-outlines-request',
        }).type
    ).toBe('agent-execution-outlines-request');
});

test('an outline step carries no free-text body fields', () => {
    const outline = {
        durationMs: 10,
        runId: 'run_1',
        startedAt: '2026-10-01T10:00:00.000Z',
        status: 'completed',
        steps: [
            {
                depth: 0,
                id: 'call_1',
                kind: 'tool',
                label: 'bash',
                startOffsetMs: 0,
                status: 'completed',
                toolKind: 'shell',
            },
        ],
    };
    expect(agentExecutionOutlineSchema.safeParse(outline).success).toBe(true);
    const withOutput = { ...outline, steps: [{ ...outline.steps[0], output: 'secret' }] };
    expect(agentExecutionOutlineSchema.safeParse(withOutput).success).toBe(false);
    const longLabel = {
        ...outline,
        steps: [{ ...outline.steps[0], label: 'x'.repeat(EXECUTION_OUTLINE_LABEL_MAX_CHARS + 1) }],
    };
    expect(agentExecutionOutlineSchema.safeParse(longLabel).success).toBe(false);
});

test('exactly the tool steps of an outline carry a tool kind', () => {
    const step = {
        depth: 0,
        id: 'call_1',
        kind: 'tool',
        label: 'Read README.md',
        startOffsetMs: 0,
        status: 'completed',
        toolKind: 'file-read',
    } as const;
    const outline = (steps: unknown[]) => ({
        durationMs: 10,
        runId: 'run_1',
        startedAt: '2026-10-01T10:00:00.000Z',
        status: 'completed',
        steps,
    });
    expect(agentExecutionOutlineSchema.safeParse(outline([step])).success).toBe(true);
    const { toolKind: _kind, ...untyped } = step;
    expect(agentExecutionOutlineSchema.safeParse(outline([untyped])).success).toBe(false);
    expect(
        agentExecutionOutlineSchema.safeParse(outline([{ ...step, kind: 'reasoning' }])).success
    ).toBe(false);
    expect(
        agentExecutionOutlineSchema.safeParse(outline([{ ...step, toolKind: 'spreadsheet' }]))
            .success
    ).toBe(false);
});
