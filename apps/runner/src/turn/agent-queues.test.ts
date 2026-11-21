import { expect, test } from 'bun:test';
import { agentQueues } from './agent-queues.ts';

test('an Agent is busy from the moment work is queued until the last queued item settles', async () => {
    const { busy, enqueue } = agentQueues();
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    expect(busy('agt_a')).toBe(false);
    const ran = [enqueue('agt_a', () => first.promise), enqueue('agt_a', () => second.promise)];
    expect(busy('agt_a')).toBe(true);
    expect(busy('agt_b')).toBe(false);
    first.resolve();
    await ran[0];
    expect(busy('agt_a')).toBe(true);
    second.resolve();
    await ran[1];
    expect(busy('agt_a')).toBe(false);
});

test('a failed item still frees the Agent and does not block the next one', async () => {
    const { busy, enqueue } = agentQueues();
    const failed = enqueue('agt_a', () => Promise.reject(new Error('boom')));
    await expect(failed).rejects.toThrow('boom');
    expect(busy('agt_a')).toBe(false);
    const order: string[] = [];
    await enqueue('agt_a', () => {
        order.push('next');
        return Promise.resolve();
    });
    expect(order).toEqual(['next']);
});
