export function createOfflineHold() {
    let held: { promise: Promise<void>; resolve: () => void } | null = null;
    let parked = 0;
    let parking = Promise.withResolvers<void>();

    return {
        hold: () => {
            held ??= Promise.withResolvers<void>();
        },
        parked: () => parked,
        parking: () => parking.promise,
        release: () => {
            held?.resolve();
            held = null;
        },
        async released(signal: AbortSignal) {
            const aborted = abortedPromise(signal);
            while (held && !signal.aborted) {
                parked += 1;
                parking.resolve();
                parking = Promise.withResolvers<void>();
                try {
                    await Promise.race([held.promise, aborted]);
                } finally {
                    parked -= 1;
                }
            }
        },
    };
}

function abortedPromise(signal: AbortSignal) {
    const { promise, resolve } = Promise.withResolvers<void>();
    signal.addEventListener('abort', () => resolve(), { once: true });
    return promise;
}
