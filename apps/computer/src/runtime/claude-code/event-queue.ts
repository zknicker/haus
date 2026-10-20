/**
 * A single-consumer async queue: the session pushes as stdout arrives, the executor iterates.
 * Pushes after `end` are dropped; the consumer stopping early never blocks the producer.
 */
export class EventQueue<T> implements AsyncIterable<T> {
    private readonly items: T[] = [];
    private ended = false;
    private wake: (() => void) | undefined;

    get isEnded(): boolean {
        return this.ended;
    }

    push(...items: T[]): void {
        if (this.ended) {
            return;
        }
        this.items.push(...items);
        this.notify();
    }

    end(): void {
        this.ended = true;
        this.notify();
    }

    async *[Symbol.asyncIterator](): AsyncIterator<T> {
        while (true) {
            const next = this.items.shift();
            if (next !== undefined) {
                yield next;
                continue;
            }
            if (this.ended) {
                return;
            }
            await new Promise<void>((resolve) => {
                this.wake = resolve;
            });
        }
    }

    private notify() {
        const wake = this.wake;
        this.wake = undefined;
        wake?.();
    }
}
