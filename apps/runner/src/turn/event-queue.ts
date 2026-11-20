export class EventQueue<T> implements AsyncIterable<T> {
    private readonly items: T[] = [];
    private ended = false;
    private waiter: ((result: IteratorResult<T>) => void) | null = null;

    push(...items: T[]) {
        if (this.ended) {
            return;
        }
        const [first, ...rest] = items;
        if (this.waiter && this.items.length === 0 && first !== undefined) {
            const resolve = this.waiter;
            this.waiter = null;
            this.items.push(...rest);
            resolve({ done: false, value: first });
            return;
        }
        this.items.push(...items);
    }

    end() {
        this.ended = true;
        if (this.waiter && this.items.length === 0) {
            const resolve = this.waiter;
            this.waiter = null;
            resolve({ done: true, value: undefined });
        }
    }

    [Symbol.asyncIterator]() {
        const iterator: AsyncIterator<T> = {
            next: () => {
                const next = this.items.shift();
                if (next !== undefined) {
                    return Promise.resolve({ done: false, value: next });
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
        return iterator;
    }
}
