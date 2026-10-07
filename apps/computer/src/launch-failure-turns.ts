import { type RuntimeFailureFields, runtimeFailureFields } from './runtime-failure.ts';
import type { RuntimeTurnOutcome } from './turn-failure-report.ts';

/** The compact failed-turn report fields a launch builds before any runtime starts. */
export type LaunchFailureReport = Partial<RuntimeFailureFields> & {
    messageCount: 0;
    startedAt: string;
    status: 'failed';
    summary: string;
};

export function runtimeNotInstalledReport(
    runtimeId: string,
    startedAt: string
): LaunchFailureReport {
    return {
        failureCode: 'runtime-not-installed',
        failureKind: 'configuration',
        messageCount: 0,
        startedAt,
        status: 'failed',
        summary: `Runtime "${runtimeId}" is not installed.`,
    };
}

/** The raw mint error stays in the local trace; only kind, code, and its hash leave. */
export function runnerMintFailureReport(error: unknown, startedAt: string): LaunchFailureReport {
    return {
        ...runtimeFailureFields(error, { code: 'runner-credential-failed', kind: 'transport' }),
        messageCount: 0,
        startedAt,
        status: 'failed',
        summary: 'Computer could not obtain runner authority for this turn.',
    };
}

/** The fake runtime reports only an exit status; its failure has no classifiable text. */
export function fakeRuntimeOutcome(status: RuntimeTurnOutcome['status']): RuntimeTurnOutcome {
    return status === 'failed'
        ? { failureCode: 'provider-error', failureKind: 'unknown', status }
        : { status };
}
