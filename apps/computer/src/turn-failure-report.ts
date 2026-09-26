import { settle } from '@haus/effect';
import { Effect } from 'effect';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { AgentSessionResumeRejectedError, HarnessTurnFailedError } from './harness/executor.ts';
import { classifyRuntimeFailure, type RuntimeFailureKind } from './runtime-failure.ts';

/**
 * Classifies a failed Harness turn and logs one concise line. Raw provider text stays in the
 * Agent's trace; only the compact kind crosses to the Server.
 */
export async function reportHarnessTurnFailure(
    runtime: DaemonRuntime,
    turn: { agentId: string; runId: string; runtimeId: string },
    error: unknown
) {
    const failure = error instanceof HarnessTurnFailedError ? error.cause : error;
    const failureKind: RuntimeFailureKind =
        failure instanceof AgentSessionResumeRejectedError
            ? 'session-resume'
            : classifyRuntimeFailure(failure);
    await settle(
        runtime,
        Effect.logWarning('Harness turn failed.').pipe(
            Effect.annotateLogs({ ...turn, event: 'harness-turn-failed', failureKind })
        )
    );
    return {
        failureKind,
        status: 'failed' as const,
        tokenUsage: error instanceof HarnessTurnFailedError ? error.tokenUsage : null,
    };
}
