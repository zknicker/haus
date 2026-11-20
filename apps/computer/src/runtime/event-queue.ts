/**
 * A single-consumer async queue a driver's turn pushes `TurnEvent`s into as native output
 * arrives, and the executor iterates. `end` lets the consumer drain what is queued and stop.
 * Pushes after `end` are dropped, and a consumer that stops early ends the queue, so the
 * producer never blocks or buffers for nobody.
 */
export class EventQueue<T> implements AsyncIterable<T> {
    private readonly items: T[] = [];
    private ended = false;
    private waiter: ((result: IteratorResult<T>) => void) | null = null;

    push(...items: T[]): void {
        if (this.ended) {
            return;
        }
        this.items.push(...items);
        if (this.waiter && this.items.length > 0) {
            const resolve = this.waiter;
            this.waiter = null;
            resolve({ done: false, value: this.items.shift() as T });
        }
    }

    end(): void {
        this.ended = true;
        if (this.waiter && this.items.length === 0) {
            const resolve = this.waiter;
            this.waiter = null;
            resolve({ done: true, value: undefined });
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
            next: () => {
                if (this.items.length > 0) {
                    return Promise.resolve({ done: false, value: this.items.shift() as T });
                }
                if (this.ended) {
                    return Promise.resolve({ done: true, value: undefined });
                }
                return new Promise((resolve) => {
                    this.waiter = resolve;
                });
            },
            return: () => {
                this.end();
                this.items.length = 0;
                return Promise.resolve({ done: true, value: undefined });
            },
        };
    }
}
