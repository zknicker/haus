import {
    type CloudAgentRun,
    type CloudAgentWork,
    deriveCloudAgentJob,
    isTerminalCloudAgentStatus,
} from '@haus/api';

const at = '2026-09-04T12:00:00.000Z';

/**
 * Test-only Cloud Agent work. Unless the caller passes `runs`, one Run mirrors
 * the work's own lifecycle, and unless it passes `job`, the job is derived from
 * the Runs the same way the Server derives it.
 */
export function cloudAgentWorkFixture(overrides: Partial<CloudAgentWork> = {}): CloudAgentWork {
    const base = {
        activity: null,
        agentId: 'agt_one',
        cancelRequestedAt: null,
        cancelRequestedBy: null,
        chatId: 'cht_one',
        computerId: 'cmp_one',
        createdAt: at,
        id: 'caw_one',
        messageId: 'msg_one',
        provider: 'cursor' as const,
        providerAgentId: null,
        providerUrl: null,
        repository: 'haus/haus',
        startedAt: at,
        startingRef: null,
        status: 'running' as const,
        terminalAt: null,
        title: 'Fix the failing migration',
        updatedAt: at,
        ...overrides,
    };
    const runs = overrides.runs ?? [
        cloudAgentRunFixture({
            startedAt: base.status === 'queued' ? null : base.startedAt,
            status: base.status,
            terminalAt: base.terminalAt,
        }),
    ];
    return { ...base, job: overrides.job ?? deriveCloudAgentJob({ ...base, runs }), runs };
}

export function cloudAgentRunFixture(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
    const status = overrides.status ?? 'completed';
    return {
        branches: [],
        createdAt: at,
        errorCode: null,
        model: { droppedParams: [], fallbackFrom: null, id: null, params: [] },
        // A queued Run is still in Haus's local queue; any other one reached Cursor.
        providerRunId: status === 'queued' ? null : 'run_cursor',
        rawStatus: null,
        runId: 'car_one',
        startedAt: status === 'queued' ? null : at,
        status,
        summary: null,
        terminalAt: isTerminalCloudAgentStatus(status) ? at : null,
        usage: null,
        ...overrides,
    };
}
