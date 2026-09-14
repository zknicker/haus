import type { AgentCommand, ComputerInventory, ComputerInventoryRefreshResult } from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Deferred, Effect } from 'effect';
import { createOpaqueId } from '../postgres/opaque-id.ts';

type Runtimes = ComputerInventory['runtimes'];

export class InventoryRefreshReplies {
    private readonly pending = new Map<
        string,
        {
            deferred: Deferred.Deferred<Runtimes, Error>;
            requestId: string;
            result: Promise<Runtimes>;
        }
    >();

    constructor(
        private readonly options: {
            runtime: EffectRuntime<never>;
            send(computerId: string, frame: AgentCommand): boolean;
            timeoutMs?: number;
        }
    ) {}

    request(computerId: string): Promise<Runtimes> {
        const existing = this.pending.get(computerId);
        if (existing) {
            return existing.result;
        }
        const requestId = createOpaqueId('req');
        const deferred = this.options.runtime.runSync(Deferred.make<Runtimes, Error>());
        const result = settle(
            this.options.runtime,
            Effect.raceFirst(
                Deferred.await(deferred),
                Effect.sleep(this.options.timeoutMs ?? 30_000).pipe(
                    Effect.andThen(
                        Effect.fail(
                            new Error(
                                'The Computer did not answer. Update Haus Computer and try again.'
                            )
                        )
                    )
                )
            ).pipe(
                Effect.ensuring(
                    Effect.sync(() => {
                        if (this.pending.get(computerId)?.requestId === requestId) {
                            this.pending.delete(computerId);
                        }
                    })
                )
            )
        );
        this.pending.set(computerId, { deferred, requestId, result });
        try {
            if (!this.options.send(computerId, { requestId, type: 'inventory-refresh-request' })) {
                this.disconnect(computerId);
            }
        } catch {
            this.disconnect(computerId);
        }
        return result;
    }

    accept(computerId: string, reply: ComputerInventoryRefreshResult): boolean {
        const pending = this.pending.get(computerId);
        if (!pending || pending.requestId !== reply.requestId) {
            return false;
        }
        this.pending.delete(computerId);
        this.options.runtime.runSync(
            reply.status === 'refreshed'
                ? Deferred.succeed(pending.deferred, reply.runtimes)
                : Deferred.fail(pending.deferred, new Error(reply.error))
        );
        return true;
    }

    disconnect(computerId: string): void {
        const pending = this.pending.get(computerId);
        if (pending) {
            this.pending.delete(computerId);
            this.options.runtime.runSync(
                Deferred.fail(pending.deferred, new Error('The selected Computer is offline.'))
            );
        }
    }
}
