import type { WorkerOutcome, WorkerReportDraft, WorkerTurnExit, WorkerTurnStatus } from '@haus/api';

type Decided =
    | { draft: WorkerReportDraft; kind: 'report' }
    | Exclude<WorkerOutcome, { kind: 'report' }>;

const failed = (reason: 'harness-error' | 'launch-refused' | 'no-report') =>
    ({ detail: null, kind: 'failed', reason }) as const;

export function decideComputerTurn(input: {
    draft: WorkerReportDraft | null;
    exit: WorkerTurnExit;
    stopRequested: boolean;
}) {
    const { draft, exit, stopRequested } = input;
    switch (exit) {
        case 'crashed-before-launch':
            return failed('harness-error');
        case 'refused':
            return failed('launch-refused');
        case 'exited':
            if (draft) {
                return { draft, kind: 'report' } satisfies Decided;
            }
            return stopRequested ? ({ kind: 'stopped' } satisfies Decided) : failed('no-report');
        case 'uncertain':
            return draft ? ({ draft, kind: 'report' } satisfies Decided) : failed('no-report');
        case 'stopped':
            return draft
                ? ({ draft, kind: 'report' } satisfies Decided)
                : ({ kind: 'stopped' } satisfies Decided);
    }
}

export function settledStatusOf(outcome: WorkerOutcome) {
    if (outcome.kind === 'stopped') {
        return 'cancelled' satisfies WorkerTurnStatus;
    }
    if (outcome.kind === 'failed') {
        return 'failed' satisfies WorkerTurnStatus;
    }
    return (
        outcome.report.outcome === 'needs-you' ? 'pending_input' : 'completed'
    ) satisfies WorkerTurnStatus;
}
