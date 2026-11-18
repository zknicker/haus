import type { AgentCommand, HostSkillFileError, HostSkillFileResult } from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Deferred, Effect } from 'effect';
import { createOpaqueId } from '../postgres/opaque-id.ts';

/**
 * Live relay for operator reads of a host-installed skill's `SKILL.md`. Content
 * exists only in flight between the Computer and the caller; nothing is stored.
 */
export class HostSkillFileReplies {
    private readonly pending = new Map<
        string,
        { computerId: string; deferred: Deferred.Deferred<string, Error> }
    >();

    constructor(
        private readonly options: {
            runtime: EffectRuntime<never>;
            send(computerId: string, frame: AgentCommand): boolean;
            timeoutMs?: number;
        }
    ) {}

    request(computerId: string, sourceId: string): Promise<string> {
        const requestId = createOpaqueId('req');
        const deferred = this.options.runtime.runSync(Deferred.make<string, Error>());
        const result = settle(
            this.options.runtime,
            Effect.raceFirst(
                Deferred.await(deferred),
                Effect.sleep(this.options.timeoutMs ?? 30_000).pipe(
                    Effect.andThen(
                        Effect.fail(
                            new HostSkillFileUnavailableError(
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
                    requestId,
                    sourceId,
                    type: 'host-skill-file-request',
                });
            } catch {
                return false;
            }
        })();
        if (!sent) {
            this.fail(
                requestId,
                new HostSkillFileUnavailableError('The selected Computer is offline.')
            );
        }
        return result;
    }

    accept(computerId: string, reply: HostSkillFileResult): boolean {
        const pending = this.pending.get(reply.requestId);
        if (pending?.computerId !== computerId) {
            return false;
        }
        this.pending.delete(reply.requestId);
        this.options.runtime.runSync(
            reply.status === 'read'
                ? Deferred.succeed(pending.deferred, reply.content)
                : Deferred.fail(pending.deferred, new HostSkillFileFailedError(reply.error))
        );
        return true;
    }

    disconnect(computerId: string): void {
        for (const [requestId, pending] of this.pending) {
            if (pending.computerId === computerId) {
                this.fail(
                    requestId,
                    new HostSkillFileUnavailableError('The selected Computer is offline.')
                );
            }
        }
    }

    private fail(requestId: string, error: Error): void {
        const pending = this.pending.get(requestId);
        if (pending) {
            this.pending.delete(requestId);
            this.options.runtime.runSync(Deferred.fail(pending.deferred, error));
        }
    }
}

/** The Computer could not be reached or did not answer in time. */
export class HostSkillFileUnavailableError extends Error {}

/** The Computer answered with a typed failure for the requested source. */
export class HostSkillFileFailedError extends Error {
    constructor(readonly reason: HostSkillFileError) {
        super(hostSkillFileErrorMessages[reason]);
    }
}

const hostSkillFileErrorMessages: Record<HostSkillFileError, string> = {
    'not-found': 'That host skill is no longer available on this Computer.',
    'too-large': 'That host skill is too large to preview.',
    unreadable: 'The host skill could not be read on this Computer.',
};
