import {
    type Worker,
    type WorkerStatus,
    type WorkerTurn,
    type WorkerTurnStatus,
    deriveWorkerJob,
    isTerminalWorkerTurnStatus,
} from '@haus/api';

const at = '2026-09-04T12:00:00.000Z';

const workerStatusByTurn: Record<WorkerTurnStatus, WorkerStatus> = {
    cancelled: 'stopped',
    completed: 'done',
    expired: 'failed',
    failed: 'failed',
    pending_input: 'needs-you',
    queued: 'queued',
    running: 'working',
};

type WorkerFixtureOverrides = Omit<Partial<Worker>, 'status'> & {
    /** The newest turn's provider status; the Worker's status projects from it. */
    status?: WorkerTurnStatus;
    stopRequestedAt?: string | null;
};

/**
 * Test-only Worker. Unless the caller passes `turns`, one turn mirrors the
 * given provider status, and unless it passes `job`, the job is derived from
 * the turns the same way the Server derives it.
 */
export function workerFixture(overrides: WorkerFixtureOverrides = {}): Worker {
    const { status: turnStatus = 'running', stopRequestedAt = null, ...rest } = overrides;
    const base = {
        activity: null,
        agentId: 'agt_one',
        carrierComputerId: 'cmp_one',
        closedAt: null,
        closingAt: null,
        createdAt: at,
        environmentId: null,
        environmentName: null,
        id: 'caw_one',
        launchMessageId: null,
        originChatId: null,
        place: 'cursor' as const,
        providerAgentId: null,
        providerUrl: null,
        pullRequest: null,
        repository: 'haus/haus',
        startedAt: at,
        startingRef: null,
        taskId: 'tsk_one',
        terminalAt: null,
        title: 'Fix the failing migration',
        updatedAt: at,
        ...rest,
    };
    const turns = overrides.turns ?? [
        workerTurnFixture({
            startedAt: turnStatus === 'queued' ? null : base.startedAt,
            status: turnStatus,
            stopRequestedAt,
            terminalAt: base.terminalAt,
        }),
    ];
    const newestStatus = turns[0]?.status ?? turnStatus;
    return {
        ...base,
        job: overrides.job ?? deriveWorkerJob({ ...base, status: newestStatus, turns }),
        status: workerStatusByTurn[newestStatus],
        turns,
    };
}

export function workerTurnFixture(overrides: Partial<WorkerTurn> = {}): WorkerTurn {
    const status = overrides.status ?? 'completed';
    return {
        acknowledgedAt: status === 'queued' ? null : at,
        branches: [],
        createdAt: at,
        dispatchedAt: status === 'queued' ? null : at,
        errorCode: null,
        input: [],
        model: { droppedParams: [], fallbackFrom: null, id: null, params: [] },
        outcome: null,
        // A queued turn is still in Haus's queue; any other one reached Cursor.
        providerRunId: status === 'queued' ? null : 'run_cursor',
        rawStatus: null,
        report: null,
        stall: null,
        startedAt: status === 'queued' ? null : at,
        status,
        stopRequestedAt: null,
        stopRequestedBy: null,
        summary: null,
        terminalAt: isTerminalWorkerTurnStatus(status) ? at : null,
        turnId: 'car_one',
        usage: null,
        ...overrides,
    };
}
