/**
 * Runs each key's operations one at a time, in call order, so a later write can never land
 * before an earlier one. A failed operation goes to `onError` and never blocks its successors.
 */
export function createKeyedQueue(onError: (error: unknown) => void) {
    const tails = new Map<string, Promise<void>>();
    return {
        run(key: string, operation: () => Promise<void>): Promise<void> {
            const tail = (tails.get(key) ?? Promise.resolve()).then(operation).catch(onError);
            tails.set(key, tail);
            void tail.then(() => {
                if (tails.get(key) === tail) {
                    tails.delete(key);
                }
            });
            return tail;
        },
        /** Resolves once every operation queued for `key` so far has finished. */
        settled(key: string): Promise<void> {
            return tails.get(key) ?? Promise.resolve();
        },
    };
}

export type KeyedQueue = ReturnType<typeof createKeyedQueue>;
