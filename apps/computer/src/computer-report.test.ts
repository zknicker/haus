import { expect, test } from 'bun:test';
import { toReportedAgentState } from './computer-report.ts';

test('reported Agent state preserves reasoning effort', () => {
    expect(
        toReportedAgentState({
            agentId: 'agt_effective',
            hausAgentAppliedAt: null,
            hausAgentStatus: 'current',
            hausAgentVersion: '1.0.0',
            missingResources: [],
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            runtimeId: 'codex',
        })
    ).toEqual({
        agentId: 'agt_effective',
        missingResources: [],
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        runtimeId: 'codex',
    });
});

test('Computer publishes sanitized runtime issues in its existing inventory report', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { recordRuntimeOutcome } = await import('./runtime-issues.ts');
    const { sendEffectiveComputerReport } = await import('./computer-report.ts');
    const { computerInventorySchema } = await import('@haus/api');
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-runtime-report-'));
    const frames: unknown[] = [];
    try {
        await recordRuntimeOutcome({
            dataRoot,
            runtimeId: 'grok-build',
            startedAt: '2026-09-17T17:00:00.000Z',
            status: 'failed',
            failureKind: 'authentication',
        });
        await sendEffectiveComputerReport({
            dataRoot,
            serverId: 'srv_test',
            computerName: 'Test Computer',
            send: (frame) => {
                frames.push(frame);
                return true;
            },
        });
        const report = frames[0] as { inventory: unknown };
        expect(computerInventorySchema.parse(report.inventory).runtimeIssues).toEqual([
            {
                runtimeId: 'grok-build',
                kind: 'authentication',
                observedAt: '2026-09-17T17:00:00.000Z',
            },
        ]);
    } finally {
        await rm(dataRoot, { recursive: true, force: true });
    }
});
