/** A counting semaphore: a released slot is handed straight to the next waiter. */
export function createSemaphore(limit) {
    const waiting = [];
    let active = 0;

    return {
        acquire() {
            if (active < limit) {
                active += 1;
                return Promise.resolve();
            }
            return new Promise((resolve) => waiting.push(resolve));
        },
        release() {
            const next = waiting.shift();
            if (next) {
                next();
                return;
            }
            active = Math.max(0, active - 1);
        },
    };
}

export async function withTimeout(operation, timeoutMs, label) {
    let timer = null;
    try {
        return await Promise.race([
            operation,
            new Promise((_resolve, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
                    timeoutMs
                );
                timer.unref?.();
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}
