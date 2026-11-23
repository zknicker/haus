import { expect, test } from 'bun:test';
import { withAgentCleanup, withAgentUse } from './agent-use.ts';

test('a cleanup waits for the Agent invocations already running', async () => {
    const order: string[] = [];
    const gate = Promise.withResolvers<void>();
    const using = withAgentUse('agt_one', async () => {
        order.push('use started');
        await gate.promise;
        order.push('use ended');
    });
    const cleaning = withAgentCleanup('agt_one', async () => {
        order.push('cleanup');
    });
    gate.resolve();
    await Promise.all([using, cleaning]);

    expect(order).toEqual(['use started', 'use ended', 'cleanup']);
});

test('an invocation that arrives during a cleanup waits for it to finish', async () => {
    const order: string[] = [];
    const gate = Promise.withResolvers<void>();
    const cleaning = withAgentCleanup('agt_two', async () => {
        order.push('cleanup started');
        await gate.promise;
        order.push('cleanup ended');
    });
    const using = withAgentUse('agt_two', async () => {
        order.push('use');
    });
    gate.resolve();
    await Promise.all([cleaning, using]);

    expect(order).toEqual(['cleanup started', 'cleanup ended', 'use']);
});

test("one Agent's cleanup never holds up another Agent's invocations", async () => {
    const order: string[] = [];
    const gate = Promise.withResolvers<void>();
    const cleaning = withAgentCleanup('agt_three', async () => {
        await gate.promise;
        order.push('cleanup');
    });
    await withAgentUse('agt_four', async () => {
        order.push('other use');
    });
    gate.resolve();
    await cleaning;

    expect(order).toEqual(['other use', 'cleanup']);
});
