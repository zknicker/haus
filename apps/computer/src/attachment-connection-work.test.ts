import { expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { AttachmentConnectionWork } from './attachment-connection-work.ts';

test('connection loops use the Effect clock and stop with the connection scope', async () => {
    const runtime = makeTestRuntime();
    const work = await AttachmentConnectionWork.make(runtime);
    let runs = 0;
    work.startLoop(
        '5 seconds',
        async () => {
            runs += 1;
        },
        () => undefined
    );

    await runtime.runPromise(TestClock.adjust('4 seconds'));
    expect(runs).toBe(0);
    await runtime.runPromise(TestClock.adjust('1 second'));
    expect(runs).toBe(1);
    await work.close();
    await runtime.runPromise(TestClock.adjust('1 hour'));
    expect(runs).toBe(1);
    await runtime.dispose();
});
