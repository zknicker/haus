import { expect, test } from 'bun:test';
import { DeliverySweepError, dispatchEach } from './dispatch-each.ts';

test('one Agent that cannot dispatch never stops the rest of the sweep', async () => {
    const dispatched: string[] = [];
    class StuckItemError extends Error {
        override readonly name = 'StuckItemError';
    }
    const delivery = {
        dispatchAgent(agentId: string) {
            dispatched.push(agentId);
            return agentId === 'agt_stuck'
                ? Promise.reject(new StuckItemError('stuck'))
                : Promise.resolve();
        },
    };

    const failure = await dispatchEach(delivery, [
        { agentId: 'agt_first', serverId: 'srv' },
        { agentId: 'agt_stuck', serverId: 'srv' },
        { agentId: 'agt_last', serverId: 'srv' },
    ]).catch((error: unknown) => error);

    expect(dispatched).toEqual(['agt_first', 'agt_stuck', 'agt_last']);
    expect(failure).toBeInstanceOf(DeliverySweepError);
    expect((failure as DeliverySweepError).failures).toEqual([
        { agentId: 'agt_stuck', failureKind: 'StuckItemError' },
    ]);
});
