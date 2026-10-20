import * as z from 'zod';
import type { RuntimeTurn } from '../driver.ts';
import { EventQueue } from '../event-queue.ts';
import { JsonRpcRequestError } from '../json-rpc.ts';
import type { JsonRpcConnection } from '../json-rpc-connection.ts';
import type { TurnEvent } from '../turn-event.ts';
import { grokRequestFailure } from './grok-failure.ts';
import type { GrokTurnNormalizer } from './grok-turn-normalizer.ts';
import { readGrokTurnUsage } from './grok-usage.ts';

const promptResponseSchema = z.looseObject({ stopReason: z.string() });
const interjectionSchema = z.looseObject({ text: z.string() });

/**
 * One `session/prompt` on a live Grok session. Events stream from the session's notifications
 * and end at the prompt response, which is authoritative: Grok's `turn_completed` notification
 * for the same prompt arrives first and only counts as progress. Aborting `signal` sends
 * `session/cancel`; Grok then answers the prompt with `stopReason: "cancelled"`.
 */
export class GrokTurn implements RuntimeTurn {
    readonly events: AsyncIterable<TurnEvent>;
    /** Resolves once Grok has started streaming this turn, or the turn settled. */
    readonly started: Promise<void>;
    private readonly queue = new EventQueue<TurnEvent>();
    private readonly settledSignal = Promise.withResolvers<void>();
    private readonly startedSignal = Promise.withResolvers<void>();
    private settledFlag = false;
    private readonly steers: Array<{ consumed: boolean; delivered: boolean; text: string }> = [];

    constructor(
        private readonly options: {
            connection: JsonRpcConnection;
            normalizer: GrokTurnNormalizer;
            prompt: string;
            sessionId: string;
            signal: AbortSignal;
        }
    ) {
        this.events = this.queue;
        this.started = this.startedSignal.promise;
        const unsubscribe = options.connection.onNotification((method, params) => {
            if (method === '_x.ai/session/interjection') {
                this.noteInterjected(params);
            }
            const events = options.normalizer.notification(method, params);
            if (events.length > 0) {
                this.startedSignal.resolve();
            }
            for (const event of events) {
                this.queue.push(event);
            }
        });
        void this.settledSignal.promise.then(unsubscribe);
    }

    get settled(): boolean {
        return this.settledFlag;
    }

    /** Sends the prompt; the returned turn settles on its own. */
    begin(): this {
        const { connection, prompt, sessionId, signal } = this.options;
        if (signal.aborted) {
            this.finish([{ type: 'abort' }]);
            return this;
        }
        const onAbort = () => {
            // A closed connection fails the prompt request itself, which settles the turn.
            connection.notify('session/cancel', { sessionId }).catch(() => undefined);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        connection
            .request('session/prompt', { prompt: [{ text: prompt, type: 'text' }], sessionId })
            .then(
                (response) => this.finish(this.responseEvents(response)),
                (error: unknown) => this.finish(this.failureEvents(error))
            )
            .finally(() => signal.removeEventListener('abort', onAbort));
        return this;
    }

    settle(): Promise<void> {
        return this.settledSignal.promise;
    }

    /**
     * Records an interjection before it is sent; Grok confirms it reached the conversation with
     * `_x.ai/session/interjection`, which can race the request's own answer.
     */
    trackSteer(text: string): { delivered(): void } {
        const steer = { consumed: false, delivered: false, text };
        this.steers.push(steer);
        return {
            delivered: () => {
                steer.delivered = true;
            },
        };
    }

    /** Delivered interjections Grok never injected: cancelled with the turn, or still queued. */
    unconsumedSteers(): readonly string[] {
        return this.steers
            .filter((steer) => steer.delivered && !steer.consumed)
            .map((steer) => steer.text);
    }

    private noteInterjected(params: unknown) {
        const text = interjectionSchema.safeParse(params).data?.text;
        const steer = this.steers.find((entry) => !entry.consumed && entry.text === text);
        if (steer) {
            steer.consumed = true;
        }
    }

    private responseEvents(response: unknown): TurnEvent[] {
        const parsed = promptResponseSchema.safeParse(response);
        if (!parsed.success) {
            return [
                {
                    error: new Error('Grok answered session/prompt without a stopReason.'),
                    type: 'error',
                },
            ];
        }
        const usage = readGrokTurnUsage(response);
        const finish: TurnEvent = { claudePlanUsage: null, type: 'turn-finish', usage };
        return parsed.data.stopReason === 'cancelled' ? [finish, { type: 'abort' }] : [finish];
    }

    private failureEvents(error: unknown): TurnEvent[] {
        // Grok answers a cancelled prompt normally; a refused one after cancel is still a cancel.
        if (this.options.signal.aborted && error instanceof JsonRpcRequestError) {
            return [{ type: 'abort' }];
        }
        const failure = grokRequestFailure(error);
        return [...(failure ? [failure] : []), { error, type: 'error' }];
    }

    private finish(settlement: TurnEvent[]): void {
        if (this.settledFlag) {
            return;
        }
        this.settledFlag = true;
        for (const event of [...this.options.normalizer.finish(), ...settlement]) {
            this.queue.push(event);
        }
        this.queue.end();
        this.startedSignal.resolve();
        this.settledSignal.resolve();
    }
}
