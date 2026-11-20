import { expect, test } from 'bun:test';
import { EventQueue } from './event-queue.ts';

test('a waiting consumer receives pushes in order and stops after end drains the queue', async () => {
    const queue = new EventQueue<number>();
    const received: number[] = [];
    const consumed = (async () => {
        for await (const item of queue) {
            received.push(item);
        }
    })();
    queue.push(1);
    await Bun.sleep(0);
    queue.push(2, 3);
    queue.end();
    queue.push(4);
    await consumed;
    expect(received).toEqual([1, 2, 3]);
});

test('a consumer that stops early ends the queue and drops later pushes', async () => {
    const queue = new EventQueue<number>();
    queue.push(1, 2);
    for await (const item of queue) {
        expect(item).toBe(1);
        break;
    }
    queue.push(3);
    const rest: number[] = [];
    for await (const item of queue) {
        rest.push(item);
    }
    expect(rest).toEqual([]);
});
