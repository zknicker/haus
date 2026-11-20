import { expect, test } from 'bun:test';
import { getQueryKey } from '@trpc/react-query';
import { testAgent } from '../../features/members/agent-fixtures.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installRealtimeTestDom } from '../../test-support/realtime-stream-harness.tsx';
import { createCallHarness } from '../../test-support/trpc-call-harness.tsx';
import { useAgentModelConnection } from './use-agent-model-connection.ts';

installRealtimeTestDom();

test("choosing Default clears the Agent's connection and refreshes its read", async () => {
    const harness = createCallHarness(() => ({ agentId: 'agt_1', modelConnectionId: null }));
    const agentKey = getQueryKey(
        hausTrpc.agent.get,
        { agentId: 'agt_1', serverId: 'srv_1' },
        'query'
    );
    harness.queryClient.setQueryData(agentKey, testAgent({ modelConnectionId: 'mcn_team' }));
    let assign: ((connectionId: string | null) => Promise<unknown>) | null = null;
    function Probe() {
        ({ assign } = useAgentModelConnection('srv_1', 'agt_1'));
        return null;
    }
    const mounted = await harness.mount(<Probe />);
    await harness.act(async () => {
        await assign?.(null);
    });
    expect(harness.calls).toEqual([
        {
            input: { agentId: 'agt_1', connectionId: null, serverId: 'srv_1' },
            path: 'modelConnections.assignAgent',
            type: 'mutation',
        },
    ]);
    expect(harness.queryClient.getQueryState(agentKey)?.isInvalidated).toBe(true);
    await mounted.unmount();
});
