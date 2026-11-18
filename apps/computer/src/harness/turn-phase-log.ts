import { settle } from '@haus/effect';
import { Effect } from 'effect';
import type { HarnessTurnInput } from './executor.ts';

/** Startup phases cover wedges before the stream watchdog can observe an event. */
export function createTurnPhaseLog(
    input: Pick<HarnessTurnInput, 'runtime' | 'agentId' | 'runtimeId'>
) {
    const startedAt = Date.now();
    return (phase: string) =>
        settle(
            input.runtime,
            Effect.logInfo('Harness turn reached a lifecycle phase.').pipe(
                Effect.annotateLogs({
                    agentId: input.agentId,
                    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
                    event: 'harness-turn-phase',
                    phase,
                    runtimeId: input.runtimeId,
                })
            )
        );
}
