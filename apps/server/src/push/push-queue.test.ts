import { expect, test } from 'bun:test';
import { createPushQueue } from './push-queue.ts';

test('runs at most `concurrency` tasks at once and drains them all', async () => {
    const queue = createPushQueue({ concurrency: 4, maxBacklog: 100 });
    let running = 0;
    let peak = 0;
    let finished = 0;
    for (let index = 0; index < 10; index += 1) {
        queue.enqueue(async () => {
            running += 1;
            peak = Math.max(peak, running);
            await Bun.sleep(10);
            running -= 1;
            finished += 1;
        });
    }
    await queue.drain();
    expect(peak).toBe(4);
    expect(finished).toBe(10);
});

test('a full backlog drops new tasks; a failing task does not stall the queue', async () => {
    const queue = createPushQueue({ concurrency: 1, maxBacklog: 1 });
    let ran = 0;
    const count = async () => {
        ran += 1;
    };
    expect(queue.enqueue(() => Promise.reject(new Error('boom')))).toBe(true);
    expect(queue.enqueue(count)).toBe(true);
    expect(queue.enqueue(count)).toBe(false);
    await queue.drain();
    expect(ran).toBe(1);
    await queue.drain();
});

test('a delayed task waits without holding a slot, and drain waits for it', async () => {
    const queue = createPushQueue({ concurrency: 1, maxBacklog: 10 });
    const order: string[] = [];
    queue.enqueue(async () => {
        order.push('delayed');
    }, 50);
    queue.enqueue(async () => {
        order.push('now');
    });
    await queue.drain();
    expect(order).toEqual(['now', 'delayed']);

    // A delayed task counts toward the backlog while it waits.
    const full = createPushQueue({ concurrency: 1, maxBacklog: 1 });
    expect(full.enqueue(() => Promise.resolve(), 20)).toBe(true);
    expect(full.enqueue(() => Promise.resolve())).toBe(false);
    await full.drain();
});
