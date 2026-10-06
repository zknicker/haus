import type { AgentTurnActivitySummary } from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Cause, Clock, Data, Effect, Exit } from 'effect';
import type {
    ComputerAgentActivityCategory,
    ComputerAgentActivityUpdate,
} from './agent-activity.ts';

export type AgentActivityTerminalPhase = 'completed' | 'failed' | 'interrupted';

interface ActivityOperation {
    readonly category: ComputerAgentActivityCategory;
    readonly operationId?: string;
    readonly toolRef?: string;
}

interface StartActivityOperation extends ActivityOperation {
    readonly key: string;
}

interface RunActivityOperation<A> extends ActivityOperation {
    readonly key?: string;
    readonly outcomeFromResult?: (value: A) => AgentActivityTerminalPhase;
}

interface ActivityCounts {
    completed: number;
    failed: number;
    interrupted: number;
}

class AgentActivityOperationError extends Data.TaggedError('AgentActivityOperationError')<{
    readonly cause: unknown;
}> {}

const aggregateCategories = [
    'browsing',
    'checking_messages',
    'editing_files',
    'reading_files',
    'running_command',
    'searching_web',
    'updating_instructions',
    'using_tool',
] as const satisfies readonly ComputerAgentActivityCategory[];

const aggregateCategorySet = new Set<ComputerAgentActivityCategory>(aggregateCategories);

/** Owns the semantic activity emitted by one Agent turn. */
export class AgentActivityRun {
    private readonly active = new Map<string, ActivityOperation>();
    private readonly counts = new Map<ComputerAgentActivityCategory, ActivityCounts>();
    private closed = false;
    private sequence = 0;

    constructor(
        private readonly runtime: EffectRuntime<never>,
        private readonly emit: (activity: ComputerAgentActivityUpdate) => void
    ) {}

    around<A, E, R>(
        effect: Effect.Effect<A, E, R>,
        operation: RunActivityOperation<A>
    ): Effect.Effect<A, E, R> {
        const key = operation.key ?? `activity:${++this.sequence}`;
        return this.startEffect({ ...operation, key }).pipe(
            Effect.zipRight(
                effect.pipe(
                    Effect.onExit((exit) =>
                        this.finishEffect(key, activityOutcome(exit, operation.outcomeFromResult))
                    )
                )
            )
        );
    }

    runPromise<A>(
        operation: RunActivityOperation<A>,
        run: (signal: AbortSignal) => Promise<A>
    ): Promise<A> {
        const effect = Effect.tryPromise({
            catch: (cause) => new AgentActivityOperationError({ cause }),
            try: run,
        });
        return settle(this.runtime, this.around(effect, operation), {
            mapFailure: (failure) => failure.cause,
        });
    }

    start(operation: StartActivityOperation): Promise<void> {
        return settle(this.runtime, this.startEffect(operation));
    }

    finish(key: string, outcome: AgentActivityTerminalPhase): Promise<void> {
        return settle(this.runtime, this.finishEffect(key, outcome));
    }

    close(outcome: AgentActivityTerminalPhase): Promise<void> {
        this.closed = true;
        return settle(
            this.runtime,
            Effect.forEach([...this.active.keys()], (key) => this.finishEffect(key, outcome), {
                discard: true,
            })
        );
    }

    isActive(key: string): boolean {
        return this.active.has(key);
    }

    snapshot(): AgentTurnActivitySummary {
        return {
            operations: aggregateCategories.flatMap((category) => {
                const counts = this.counts.get(category);
                return counts ? [{ category, ...counts }] : [];
            }),
        };
    }

    private startEffect(operation: StartActivityOperation): Effect.Effect<void> {
        return Clock.currentTimeMillis.pipe(
            Effect.flatMap((occurredAt) =>
                Effect.sync(() => {
                    if (this.closed || this.active.has(operation.key)) {
                        return;
                    }
                    this.active.set(operation.key, operation);
                    this.emit({
                        category: operation.category,
                        occurredAt: new Date(occurredAt).toISOString(),
                        phase: 'started',
                        ...(operation.operationId ? { operationId: operation.operationId } : {}),
                        ...(operation.toolRef ? { toolRef: operation.toolRef } : {}),
                    });
                })
            )
        );
    }

    private finishEffect(key: string, phase: AgentActivityTerminalPhase): Effect.Effect<void> {
        return Clock.currentTimeMillis.pipe(
            Effect.flatMap((occurredAt) =>
                Effect.sync(() => {
                    const operation = this.active.get(key);
                    if (!operation) {
                        return;
                    }
                    this.active.delete(key);
                    this.record(operation.category, phase);
                    this.emit({
                        category: operation.category,
                        occurredAt: new Date(occurredAt).toISOString(),
                        phase,
                        ...(operation.operationId ? { operationId: operation.operationId } : {}),
                        ...(operation.toolRef ? { toolRef: operation.toolRef } : {}),
                    });
                })
            )
        );
    }

    private record(category: ComputerAgentActivityCategory, phase: AgentActivityTerminalPhase) {
        if (!aggregateCategorySet.has(category)) {
            return;
        }
        const counts = this.counts.get(category) ?? {
            completed: 0,
            failed: 0,
            interrupted: 0,
        };
        counts[phase] += 1;
        this.counts.set(category, counts);
    }
}

function activityOutcome<A, E>(
    exit: Exit.Exit<A, E>,
    fromResult?: (value: A) => AgentActivityTerminalPhase
): AgentActivityTerminalPhase {
    if (Exit.isSuccess(exit)) {
        try {
            return fromResult?.(exit.value) ?? 'completed';
        } catch {
            return 'failed';
        }
    }
    return Cause.isInterruptedOnly(exit.cause) ? 'interrupted' : 'failed';
}
