import type { AgentCommand, BrowserRequest, BrowserResult } from '@haus/api';
import { type EffectRuntime, settle, type TraceCarrier, tracePromise } from '@haus/effect';
import { Deferred, Effect } from 'effect';
import { createOpaqueId } from '../postgres/opaque-id.ts';

type BrowserReplyValue = NonNullable<BrowserResult['result']>;

interface PendingBrowserReply {
    computerId: string;
    deferred: Deferred.Deferred<BrowserReplyValue, Error>;
    requestId: string;
}

interface BrowserReplyOfficeOptions {
    runtime: EffectRuntime<never>;
    send(computerId: string, frame: AgentCommand): boolean;
    timeoutMs?: number;
}

export class BrowserReplyOffice {
    private readonly pending = new Map<string, PendingBrowserReply>();

    constructor(private readonly options: BrowserReplyOfficeOptions) {}

    request(
        computerId: string,
        operation: BrowserRequest['operation']
    ): Promise<BrowserReplyValue> {
        const reply: PendingBrowserReply = {
            computerId,
            deferred: this.options.runtime.runSync(Deferred.make()),
            requestId: createOpaqueId('req'),
        };
        this.pending.set(reply.requestId, reply);
        return tracePromise(
            this.options.runtime,
            'haus.browser.operation',
            {
                'haus.operation': `browser.${operation.kind}`,
                'haus.request.id': reply.requestId,
            },
            (traceContext) => this.waitForReply(reply, operation, traceContext)
        );
    }

    private waitForReply(
        reply: PendingBrowserReply,
        operation: BrowserRequest['operation'],
        traceContext: TraceCarrier
    ): Promise<BrowserReplyValue> {
        this.sendOrFail(reply, {
            operation,
            requestId: reply.requestId,
            traceContext,
            type: 'browser-request',
        });
        return settle(
            this.options.runtime,
            Effect.raceFirst(
                Deferred.await(reply.deferred),
                Effect.sleep(this.options.timeoutMs ?? 10_000).pipe(
                    Effect.andThen(
                        Effect.fail(new Error('The Computer did not answer the Browser request.'))
                    )
                )
            ).pipe(Effect.ensuring(Effect.sync(() => this.remove(reply))))
        );
    }

    accept(computerId: string, result: BrowserResult): boolean {
        const reply = this.pending.get(result.requestId);
        if (!reply || reply.computerId !== computerId || !this.take(reply)) {
            return false;
        }
        if (result.result) {
            this.succeed(reply.deferred, result.result);
        } else {
            this.fail(reply.deferred, new Error(result.error ?? 'The Browser request failed.'));
        }
        return true;
    }

    disconnect(computerId: string): void {
        for (const reply of this.pending.values()) {
            if (reply.computerId === computerId) {
                this.reject(reply, new Error('The selected Computer went offline.'));
            }
        }
    }

    private sendOrFail(reply: PendingBrowserReply, frame: AgentCommand): void {
        try {
            if (!this.options.send(reply.computerId, frame)) {
                this.reject(reply, new Error('The selected Computer is offline.'));
            }
        } catch (cause) {
            this.reject(reply, asError(cause));
        }
    }

    private reject(reply: PendingBrowserReply, error: Error): void {
        if (this.take(reply)) {
            this.fail(reply.deferred, error);
        }
    }

    private take(reply: PendingBrowserReply): boolean {
        if (this.pending.get(reply.requestId) !== reply) {
            return false;
        }
        this.pending.delete(reply.requestId);
        return true;
    }

    private remove(reply: PendingBrowserReply): void {
        if (this.pending.get(reply.requestId) === reply) {
            this.pending.delete(reply.requestId);
        }
    }

    private fail(deferred: Deferred.Deferred<BrowserReplyValue, Error>, error: Error): void {
        this.options.runtime.runSync(Deferred.fail(deferred, error));
    }

    private succeed(
        deferred: Deferred.Deferred<BrowserReplyValue, Error>,
        value: BrowserReplyValue
    ): void {
        this.options.runtime.runSync(Deferred.succeed(deferred, value));
    }
}

function asError(cause: unknown): Error {
    return cause instanceof Error ? cause : new Error(String(cause));
}
