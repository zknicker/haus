import { expect, test } from 'bun:test';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
} from '../../test-support/realtime-stream-harness.tsx';
import { useOpenComputerUseRequests } from './use-computer-use-requests.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const chatId = 'cht_ops';
const path = 'computerUse.onRequestUpdated';
const requests = [
    request('cur_open', 'requested'),
    request('cur_allowed', 'allowed'),
    request('cur_denied', 'denied'),
];
let seen: readonly { id: string }[] = [];

function Requests() {
    seen = useOpenComputerUseRequests(serverId, chatId);
    return null;
}

test('only open requests show, and each request update refetches the chat’s requests', async () => {
    const harness = createRealtimeHarness(() => ({ requests }));
    harness.queryClient.setQueryData(
        getQueryKey(hausTrpc.computerUse.requests, { chatId, serverId }, 'query'),
        { requests }
    );
    const mounted = await harness.mount(<Requests />);
    expect(seen.map(({ id }) => id)).toEqual(['cur_open']);
    expect(harness.openPaths()).toEqual([path]);
    expect(harness.streams.at(-1)?.input).toEqual({ chatId, serverId });

    harness.start(path);
    harness.ops.splice(0);
    harness.emit(path, {
        chatId,
        emittedAt: '2026-11-20T12:00:00.000Z',
        requestId: 'cur_open',
        serverId,
        type: 'computerUse.requestUpdated',
    });

    expect(invalidated(harness.ops)).toEqual([
        { input: { chatId, serverId }, path: 'computerUse.requests' },
    ]);
    await mounted.unmount();
});

function request(id: string, state: 'allowed' | 'denied' | 'requested') {
    return {
        agentId: 'agt_tiny',
        canDecide: true,
        chatId,
        command: 'click',
        computerId: 'cmp_studio',
        computerName: 'Studio Mac',
        decidedAt: state === 'requested' ? null : '2026-11-20T12:00:00.000Z',
        decidedByName: state === 'requested' ? null : 'Zach',
        detail: '@s8f3k2p9:e8',
        id,
        requestedAt: '2026-11-20T11:59:00.000Z',
        standing: false,
        state,
        waitingForName: 'Zach',
    };
}
