import type { WorkerOutcome, WorkerReportDraft, WorkerTurnExit, WorkerTurnStatus } from '@haus/api';

type Decided =
    | { draft: WorkerReportDraft; kind: 'report' }
    | Exclude<WorkerOutcome, { kind: 'report' }>;

export function decideComputerTurn(input: {
    detail: string | null;
    draft: WorkerReportDraft | null;
    exit: WorkerTurnExit;
    stopRequested: boolean;
}) {
    const { detail, draft, exit, stopRequested } = input;
    const failed = (reason: 'harness-error' | 'launch-refused' | 'no-report') =>
        ({ detail, kind: 'failed', reason }) as const;
    switch (exit) {
        case 'crashed-before-launch':
            return failed('harness-error');
        case 'refused':
            return failed('launch-refused');
        case 'exited':
        case 'uncertain':
            if (draft) {
                return { draft, kind: 'report' } satisfies Decided;
            }
            return stopRequested ? ({ kind: 'stopped' } satisfies Decided) : failed('no-report');
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
