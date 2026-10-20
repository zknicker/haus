/** A single-consumer async iterable fed by push; `end` lets the consumer drain and stop. */
export class AsyncQueue<T> implements AsyncIterable<T> {
    private readonly items: T[] = [];
    private waiter: ((result: IteratorResult<T>) => void) | null = null;
    private ended = false;

    push(item: T): void {
        if (this.ended) {
            return;
        }
        if (this.waiter) {
            const resolve = this.waiter;
            this.waiter = null;
            resolve({ done: false, value: item });
            return;
        }
        this.items.push(item);
    }

    end(): void {
        this.ended = true;
        if (this.waiter && this.items.length === 0) {
            const resolve = this.waiter;
            this.waiter = null;
            resolve({ done: true, value: undefined });
        }
    }

    get isEnded(): boolean {
        return this.ended;
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
