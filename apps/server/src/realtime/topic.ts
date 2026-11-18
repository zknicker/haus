import EventEmitter, { on } from 'node:events';
import type * as z from 'zod';

/**
 * One typed in-process topic per realtime event type (specs/realtime-events.md,
 * "Topics"). A mutation `prepare`s its event from the rows it is about to
 * commit, so a malformed event fails the write before anything durable
 * happens, and `publish`es it only after commit. Publishing never throws: a
 * committed write always returns its receipt, and a lost notification heals
 * through the App's read recovery.
 */
export interface RealtimeTopic<Event> {
    /**
     * Prepares and publishes in one step, for call sites that run after their
     * commit. A malformed event is logged like any publish failure instead of
     * failing a write that already committed.
     */
    announce(event: Event, options?: RealtimePrepareOptions): void;
    readonly name: string;
    /** Validates the event with its `@haus/api` schema; throws when malformed. */
    prepare(event: Event, options?: RealtimePrepareOptions): PreparedRealtimeEvent<Event>;
    publish(prepared: PreparedRealtimeEvent<Event>): void;
    subscribe(signal?: AbortSignal): AsyncGenerator<RealtimeDelivery<Event>>;
}

export interface RealtimePrepareOptions {
    /** Reader-only events reach only this user; the field never reaches the wire. */
    audienceUserId?: string;
}

export interface RealtimeDelivery<Event> {
    audienceUserId: string | null;
    event: Event;
}

/** A validated event waiting for its transaction to commit. */
export interface PreparedRealtimeEvent<Event = unknown> {
    /** Hands the event to the topic's subscribers; called by `publish` only. */
    readonly deliver: () => void;
    readonly delivery: RealtimeDelivery<Event>;
    readonly topic: string;
}

export function createTopic<Schema extends z.ZodType>(
    name: string,
    schema: Schema
): RealtimeTopic<z.output<Schema>> {
    type Event = z.output<Schema>;
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);

    const prepare = (event: Event, options?: RealtimePrepareOptions) => {
        const delivery: RealtimeDelivery<Event> = {
            audienceUserId: options?.audienceUserId ?? null,
            event: schema.parse(event),
        };
        return {
            deliver: () => {
                emitter.emit(name, delivery);
            },
            delivery,
            topic: name,
        } satisfies PreparedRealtimeEvent<Event>;
    };

    return {
        announce(event, options) {
            try {
                publishRealtime(prepare(event, options));
            } catch (error) {
                reportPublishFailure(name, error);
            }
        },
        name,
        prepare,
        publish(prepared) {
            publishRealtime(prepared);
        },
        async *subscribe(signal) {
            const iterator = signal ? on(emitter, name, { signal }) : on(emitter, name);
            for await (const [delivery] of iterator) {
                yield delivery as RealtimeDelivery<Event>;
            }
        },
    };
}

export type PreparedRealtimeEvents =
    | PreparedRealtimeEvent
    | null
    | undefined
    | readonly (PreparedRealtimeEvent | null | undefined)[];

/**
 * Publishes events collected while a transaction ran, after it resolved. A
 * rolled-back transaction never reaches here, so it publishes nothing.
 */
export function publishRealtime(events: PreparedRealtimeEvents) {
    const list = Array.isArray(events) ? events : [events];
    for (const prepared of list as readonly (PreparedRealtimeEvent | null | undefined)[]) {
        if (!prepared) {
            continue;
        }
        try {
            prepared.deliver();
        } catch (error) {
            reportPublishFailure(prepared.topic, error);
        }
    }
}

function reportPublishFailure(topic: string, error: unknown) {
    console.error('[haus] realtime publish failed', {
        errorClass: error instanceof Error ? error.name : typeof error,
        topic,
    });
}
