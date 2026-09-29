/**
 * Runs push tasks at most `concurrency` at a time, so a burst of messages
 * cannot fan out into unbounded database reads and APNs requests. A backlog
 * past `maxBacklog` drops new tasks (push is best-effort) instead of growing
 * without bound. Tasks must handle their own errors.
 */
export interface PushQueue {
    /** Resolves once every queued and running task has settled. */
    drain(): Promise<void>;
    /** Queues a task; false when the backlog is full and it was dropped. */
    enqueue(task: () => Promise<void>): boolean;
}

export function createPushQueue(options: { concurrency: number; maxBacklog: number }): PushQueue {
    const waiting: Array<() => Promise<void>> = [];
    let running = 0;
    let idle: Array<() => void> = [];

    const settleIdle = () => {
        if (running === 0 && waiting.length === 0) {
            const resolvers = idle;
            idle = [];
            for (const resolve of resolvers) {
                resolve();
            }
        }
    };

    const pump = () => {
        while (running < options.concurrency && waiting.length > 0) {
            const task = waiting.shift() as () => Promise<void>;
            running += 1;
            void task()
                .catch(() => undefined)
                .finally(() => {
                    running -= 1;
                    pump();
                    settleIdle();
                });
        }
    };

    return {
        drain() {
            if (running === 0 && waiting.length === 0) {
                return Promise.resolve();
            }
            return new Promise((resolve) => idle.push(resolve));
        },
        enqueue(task) {
            if (waiting.length >= options.maxBacklog) {
                return false;
            }
            waiting.push(task);
            pump();
            return true;
        },
    };
}
