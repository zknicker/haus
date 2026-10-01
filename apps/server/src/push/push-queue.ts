/**
 * Runs push tasks at most `concurrency` at a time, so a burst of messages
 * cannot fan out into unbounded database reads and APNs requests. A task may
 * wait `delayMs` before it becomes runnable; the wait holds no concurrency
 * slot. A backlog — waiting plus delayed tasks — past `maxBacklog` drops new
 * tasks (push is best-effort) instead of growing without bound. Tasks must
 * handle their own errors.
 */
export interface PushQueue {
    /** Resolves once every delayed, queued, and running task has settled. */
    drain(): Promise<void>;
    /** Queues a task; false when the backlog is full and it was dropped. */
    enqueue(task: () => Promise<void>, delayMs?: number): boolean;
}

export function createPushQueue(options: { concurrency: number; maxBacklog: number }): PushQueue {
    const waiting: Array<() => Promise<void>> = [];
    let delayed = 0;
    let running = 0;
    let idle: Array<() => void> = [];

    const isIdle = () => running === 0 && waiting.length === 0 && delayed === 0;

    const settleIdle = () => {
        if (isIdle()) {
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
            if (isIdle()) {
                return Promise.resolve();
            }
            return new Promise((resolve) => idle.push(resolve));
        },
        enqueue(task, delayMs = 0) {
            if (waiting.length + delayed >= options.maxBacklog) {
                return false;
            }
            if (delayMs <= 0) {
                waiting.push(task);
                pump();
                return true;
            }
            delayed += 1;
            setTimeout(() => {
                delayed -= 1;
                waiting.push(task);
                pump();
            }, delayMs);
            return true;
        },
    };
}
