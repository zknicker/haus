import { settle } from '@haus/effect';
import { Effect } from 'effect';
import type { AgentTurnFrame } from './agent-commands.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { HarnessTurnFailedError, type HarnessTurnResult } from './harness/executor.ts';
import {
    isContextWindowOverflow,
    type RuntimeFailureFields,
    runtimeFailureFields,
} from './runtime-failure.ts';

export interface RuntimeTurnOutcome extends Partial<RuntimeFailureFields> {
    status: 'completed' | 'failed' | 'interrupted';
    summary?: string;
    tokenUsage?: AgentTurnFrame['tokenUsage'];
}

/** A turn the harness settled without throwing. */
export function settledTurnOutcome(turn: HarnessTurnResult): RuntimeTurnOutcome {
    if (turn.stalled) {
        // Unlike a Stop, a deterministic stall must back off and count toward degrading.
        return {
            failureCode: 'turn-stalled',
            failureKind: 'timeout',
            status: 'failed',
            summary: 'The Agent turn made no progress and was interrupted (timeout).',
            tokenUsage: turn.tokenUsage,
        };
    }
    return { status: turn.aborted ? 'interrupted' : 'completed', tokenUsage: turn.tokenUsage };
}

/**
 * Classifies a failed Harness turn and logs one concise line. Raw provider text stays in the
 * Agent's trace; only the kind, code, and a hash of the text cross to the Server.
 */
export async function reportHarnessTurnFailure(
    runtime: DaemonRuntime,
    { agentId, runId, runtimeId }: { agentId: string; runId: string; runtimeId: string },
    error: unknown,
    signal?: AbortSignal
): Promise<RuntimeTurnOutcome> {
    // A Stop or Restart during startup surfaces as a creation error, not a runtime failure.
    if (signal?.aborted) {
        return { status: 'interrupted' };
    }
    const turn = { agentId, runId, runtimeId };
    const failure = error instanceof HarnessTurnFailedError ? error.cause : error;
    const fields = runtimeFailureFields(failure);
    await settle(
        runtime,
        Effect.logWarning('Harness turn failed.').pipe(
            Effect.annotateLogs({
                ...turn,
                event: 'harness-turn-failed',
                failureCode: fields.failureCode,
                failureKind: fields.failureKind,
            })
        )
    );
    return {
        ...fields,
        status: 'failed',
        summary: isContextWindowOverflow(failure)
            ? "Context window full — reset this agent's session."
            : undefined,
        tokenUsage: error instanceof HarnessTurnFailedError ? error.tokenUsage : null,
    };
}
