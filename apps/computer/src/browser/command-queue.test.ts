import { expect, test } from 'bun:test';
import { BrowserCommandQueue } from './command-queue.ts';

test('commands remain serial and a failure does not poison the queue', async () => {
    const queue = new BrowserCommandQueue();
    const events: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const first = queue.run(async () => {
        events.push('first');
        await gate;
        events.push('failed');
        throw new Error('page unavailable');
    });
    const rejected = first.then(
        () => null,
        (error: unknown) => error
    );
    const second = queue.run(async () => {
        events.push('second');
        return 'ok';
    });
    release();
    expect(await rejected).toEqual(new Error('page unavailable'));
    expect(await second).toBe('ok');
    expect(events).toEqual(['first', 'failed', 'second']);
});
