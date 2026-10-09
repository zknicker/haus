/**
 * Collects one realtime subscription the way the App consumes it: over the
 * tRPC WebSocket, through the procedure's own authorization and filtering.
 */
export interface StreamCollector<Event> {
    /** Resolves with the error that ended the stream; rejects on timeout. */
    ended(timeoutMs?: number): Promise<StreamError>;
    readonly events: Event[];
    /** Resolves with the next matching event after the last one read. */
    next(match?: (event: Event) => boolean, timeoutMs?: number): Promise<Event>;
    readonly started: Promise<void>;
    stop(): void;
}

export interface StreamError {
    data?: { code?: string; hausRefusal?: string };
    message: string;
}

interface SubscribableProcedure<Input, Event> {
    subscribe(
        input: Input,
        options: {
            onData: (event: Event) => void;
            onError: (error: StreamError) => void;
            onStarted: () => void;
        }
    ): { unsubscribe(): void };
}

export function collectStream<Input, Event>(
    procedure: SubscribableProcedure<Input, Event>,
    input: Input
): StreamCollector<Event> {
    const events: Event[] = [];
    const started = Promise.withResolvers<void>();
    const waiters = new Set<() => void>();
    let failure: StreamError | null = null;
    let cursor = 0;

    const subscription = procedure.subscribe(input, {
        onData: (event) => {
            events.push(event);
            wakeAll();
        },
        onError: (error) => {
            failure = error;
            started.reject(error);
            wakeAll();
        },
        onStarted: () => started.resolve(),
    });
    started.promise.catch(() => undefined);

    function wakeAll() {
        for (const wake of waiters) {
            wake();
        }
    }

    function waitFor<Result>(
        poll: () => Result | null,
        timeoutMs: number,
        label: string
    ): Promise<Result> {
        return new Promise<Result>((resolve, reject) => {
            const check = () => {
                let found: Result | null;
                try {
                    found = poll();
                } catch (error) {
                    waiters.delete(check);
                    clearTimeout(timer);
                    reject(error);
                    return;
                }
                if (found !== null) {
                    waiters.delete(check);
                    clearTimeout(timer);
                    resolve(found);
                }
            };
            const timer = setTimeout(() => {
                waiters.delete(check);
                reject(new Error(`Timed out waiting for ${label}.`));
            }, timeoutMs);
            waiters.add(check);
            check();
        });
    }

    return {
        ended: (timeoutMs = 5000) => waitFor(() => failure, timeoutMs, 'the stream to end'),
        events,
        next: (match = () => true, timeoutMs = 5000) =>
            waitFor(
                () => {
                    if (failure) {
                        throw new Error(`The stream ended: ${failure.message}`);
                    }
                    while (cursor < events.length) {
                        const event = events[cursor] as Event;
                        cursor += 1;
                        if (match(event)) {
                            return { event };
                        }
                    }
                    return null;
                },
                timeoutMs,
                'a realtime event'
            ).then(({ event }) => event),
        started: started.promise,
        stop: () => subscription.unsubscribe(),
    };
}
