import { expect, test } from 'bun:test';
import { publishAgentLifecycle, subscribeToAgentLifecycle } from './lifecycle.ts';

test('publishes a validated semantic lifecycle event', async () => {
    const controller = new AbortController();
    const iterator = subscribeToAgentLifecycle(controller.signal)[Symbol.asyncIterator]();
    const next = iterator.next();

    publishAgentLifecycle({
        agentId: 'agt_test',
        chatId: 'cht_test',
        phase: 'reading',
        runId: 'run_test',
        serverId: 'srv_test',
    });

    expect(await next).toMatchObject({
        done: false,
        value: {
            agentId: 'agt_test',
            chatId: 'cht_test',
            phase: 'reading',
            runId: 'run_test',
            serverId: 'srv_test',
        },
    });
    controller.abort();
});
