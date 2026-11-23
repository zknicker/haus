import type {
    AgentCommand,
    RepoFolderAnswer,
    RepoFolderOperation,
    RepoFolderResult,
} from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Deferred, Effect } from 'effect';
import { createOpaqueId } from '../postgres/opaque-id.ts';

export class RepoFolderReplies {
    private readonly pending = new Map<
        string,
        { computerId: string; deferred: Deferred.Deferred<RepoFolderAnswer, Error> }
    >();

    constructor(
        private readonly options: {
            runtime: EffectRuntime<never>;
            send(computerId: string, frame: AgentCommand): boolean;
            timeoutMs?: number;
        }
    ) {}

    request(computerId: string, operation: RepoFolderOperation) {
        const requestId = createOpaqueId('req');
        const deferred = this.options.runtime.runSync(Deferred.make<RepoFolderAnswer, Error>());
        const result = settle(
            this.options.runtime,
            Effect.raceFirst(
                Deferred.await(deferred),
                Effect.sleep(this.options.timeoutMs ?? 30_000).pipe(
                    Effect.andThen(
                        Effect.fail(
                            new RepoFolderComputerUnavailableError(
                                'The Computer did not answer. Update Haus Computer and try again.'
                            )
                        )
                    )
                )
            ).pipe(Effect.ensuring(Effect.sync(() => this.pending.delete(requestId))))
        );
        this.pending.set(requestId, { computerId, deferred });
        const sent = (() => {
            try {
                return this.options.send(computerId, {
                    operation,
                    requestId,
                    type: 'repo-folder-request',
                });
            } catch {
                return false;
            }
        })();
        if (!sent) {
            this.fail(requestId, offline());
        }
        return result;
    }

    accept(computerId: string, reply: RepoFolderResult) {
        const pending = this.pending.get(reply.requestId);
        if (pending?.computerId !== computerId) {
            return false;
        }
        this.pending.delete(reply.requestId);
        this.options.runtime.runSync(Deferred.succeed(pending.deferred, reply.answer));
        return true;
    }

    disconnect(computerId: string) {
        for (const [requestId, pending] of this.pending) {
            if (pending.computerId === computerId) {
                this.fail(requestId, offline());
            }
        }
    }

    private fail(requestId: string, error: Error) {
        const pending = this.pending.get(requestId);
        if (pending) {
            this.pending.delete(requestId);
            this.options.runtime.runSync(Deferred.fail(pending.deferred, error));
        }
    }
}

export class RepoFolderComputerUnavailableError extends Error {}

function offline() {
    return new RepoFolderComputerUnavailableError('The Computer is offline.');
}
