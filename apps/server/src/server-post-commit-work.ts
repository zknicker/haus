import { type EffectRuntime, settle } from '@haus/effect';
import { Data, Effect } from 'effect';
import type { AgentDelivery } from './agent-delivery/delivery.ts';

interface AgentWake {
    agentId: string;
    serverId: string;
}

class PostCommitWorkError extends Data.TaggedError('PostCommitWorkError')<{
    readonly cause: unknown;
    readonly operation: string;
}> {}

/** Owns best-effort work launched only after its durable transaction commits. */
export class ServerPostCommitWork {
    private closePromise: Promise<void> | null = null;
    private closing = false;
    private readonly tasks = new Set<Promise<void>>();

    constructor(private readonly runtime: EffectRuntime<never>) {}

    close(): Promise<void> {
        this.closing = true;
        this.closePromise ??= Promise.all([...this.tasks]).then(() => undefined);
        return this.closePromise;
    }

    run(operation: string, work: () => Promise<unknown>): Promise<void> {
        if (this.closing) {
            return Promise.resolve();
        }
        const effect = Effect.tryPromise({
            catch: (cause) => new PostCommitWorkError({ cause, operation }),
            try: work,
        }).pipe(
            Effect.catchTag('PostCommitWorkError', (error) =>
                Effect.logWarning(
                    'Post-commit work failed; durable retry remains authoritative.'
                ).pipe(
                    Effect.annotateLogs({
                        failureKind: failureKind(error.cause),
                        operation: error.operation,
                    })
                )
            ),
            Effect.asVoid
        );
        const task = settle(this.runtime, effect);
        this.tasks.add(task);
        void task.then(
            () => this.tasks.delete(task),
            () => this.tasks.delete(task)
        );
        return task;
    }

    wakeAgents(delivery: Pick<AgentDelivery, 'dispatchAgent'>, wakes: readonly AgentWake[]) {
        return this.dispatchAll(wakes, (wake) =>
            delivery.dispatchAgent(wake.agentId, wake.serverId)
        );
    }

    /** Wakes a send's recipients; a Task sent `interrupt` has its live turn aborted first. */
    wakeRecipients(
        delivery: Pick<AgentDelivery, 'dispatchAgent' | 'interrupt'>,
        sent: { interrupts: readonly AgentWake[]; wakes: readonly AgentWake[] }
    ) {
        const interrupted = new Set(sent.interrupts.map((wake) => wake.agentId));
        return this.dispatchAll(sent.wakes, (wake) =>
            interrupted.has(wake.agentId)
                ? delivery.interrupt(wake)
                : delivery.dispatchAgent(wake.agentId, wake.serverId)
        );
    }

    private dispatchAll(wakes: readonly AgentWake[], dispatch: (wake: AgentWake) => Promise<void>) {
        return this.run('agent.dispatch-after-commit', async () => {
            const results = await Promise.allSettled(wakes.map(dispatch));
            const failure = results.find(
                (result): result is PromiseRejectedResult => result.status === 'rejected'
            );
            if (failure) {
                throw failure.reason;
            }
        });
    }
}

function failureKind(cause: unknown): string {
    if (cause instanceof Error) {
        return cause.name;
    }
    if (typeof cause === 'object' && cause !== null && '_tag' in cause) {
        return typeof cause._tag === 'string' ? cause._tag : 'object';
    }
    return typeof cause;
}
