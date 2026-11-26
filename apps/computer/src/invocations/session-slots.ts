export const computerInvocationLimit = 4;

export function createInvocationSlots(limit: number) {
    let running = 0;
    const waiting: (() => void)[] = [];

    function releaser() {
        let released = false;
        return () => {
            if (released) {
                return;
            }
            released = true;
            const next = waiting.shift();
            if (next) {
                next();
            } else {
                running -= 1;
            }
        };
    }

    return {
        async acquire(signal: AbortSignal) {
            if (signal.aborted) {
                return null;
            }
            if (running < limit) {
                running += 1;
                return releaser();
            }
            const { promise, resolve } = Promise.withResolvers<boolean>();
            const wake = () => {
                signal.removeEventListener('abort', onAbort);
                resolve(true);
            };
            const onAbort = () => {
                waiting.splice(waiting.indexOf(wake), 1);
                resolve(false);
            };
            waiting.push(wake);
            signal.addEventListener('abort', onAbort, { once: true });
            return (await promise) ? releaser() : null;
        },
        running: () => running,
        waiting: () => waiting.length,
    };
}
