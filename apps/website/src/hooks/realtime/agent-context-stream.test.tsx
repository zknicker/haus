import { expect, test } from 'bun:test';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
    runRestarts,
} from '../../test-support/realtime-stream-harness.tsx';
import { useAgentContextStream } from './use-agent-context-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const path = 'agent.onContextUpdated';

test('agent.onContextUpdated refreshes the named Agent context, and recovery every one', async () => {
    const harness = createRealtimeHarness();
    function Stream() {
        useAgentContextStream(serverId);
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    harness.ops.splice(0);
    harness.emit(path, { agentId: 'agt_blippy', serverId });
    const onEvent = invalidated(harness.ops.splice(0));
    harness.complete(path);
    expect(runRestarts()).toBe(1);
    harness.start(path);
    const onRecovery = invalidated(harness.ops.splice(0));
    await mounted.unmount();

    expect(onEvent).toEqual([
        { input: { agentId: 'agt_blippy', serverId }, path: 'agent.context' },
    ]);
    expect(onRecovery).toEqual([{ input: { serverId }, path: 'agent.context' }]);
});
