const tails = new Map<string, Promise<void>>();

export async function serialized<T>(key: string, operation: () => Promise<T>) {
    const previous = tails.get(key) ?? Promise.resolve();
    const ready = Promise.withResolvers<void>();
    tails.set(key, ready.promise);
    await previous;
    try {
        return await operation();
    } finally {
        ready.resolve();
        if (tails.get(key) === ready.promise) {
            tails.delete(key);
        }
    }
}
