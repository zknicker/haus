export interface ClaudeSlot {
    release(): void;
    readonly waitedMs: number | null;
}

interface Waiter {
    admit(): void;
}

export class ClaudeSlots {
    private held = 0;
    private readonly waiters: Waiter[] = [];

    constructor(
        private readonly options: {
            evict: () => void;
            limit: number;
            now?: () => number;
        }
    ) {}

    get inUse() {
        return this.held;
    }

    get waiting() {
        return this.waiters.length;
    }

    async acquire(signal?: AbortSignal) {
        signal?.throwIfAborted();
        if (this.held < this.options.limit && this.waiters.length === 0) {
            this.held += 1;
            return this.slot(null);
        }
        const now = this.options.now ?? (() => performance.now());
        const askedAt = now();
        await this.queue(signal);
        return this.slot(Math.max(0, Math.round(now() - askedAt)));
    }

    parked() {
        if (this.waiters.length > 0) {
            this.options.evict();
        }
    }

    private queue(signal: AbortSignal | undefined) {
        const admitted = Promise.withResolvers<void>();
        const onAbort = () => {
            this.waiters.splice(this.waiters.indexOf(waiter), 1);
            admitted.reject(signal?.reason);
        };
        const waiter: Waiter = {
            admit() {
                signal?.removeEventListener('abort', onAbort);
                admitted.resolve();
            },
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        this.waiters.push(waiter);
        this.options.evict();
        return admitted.promise;
    }

    private slot(waitedMs: number | null) {
        let released = false;
        const slot: ClaudeSlot = {
            release: () => {
                if (released) {
                    return;
                }
                released = true;
                const next = this.waiters.shift();
                if (next) {
                    next.admit();
                } else {
                    this.held -= 1;
                }
            },
            waitedMs,
        };
        return slot;
    }
}
