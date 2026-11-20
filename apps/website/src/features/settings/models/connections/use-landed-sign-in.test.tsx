import { expect, test } from 'bun:test';
import type { ModelSignIn } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../../../lib/haus-server.tsx';
import { installRealtimeTestDom } from '../../../../test-support/realtime-stream-harness.tsx';
import { createCallHarness } from '../../../../test-support/trpc-call-harness.tsx';
import { useLandedSignIn } from './use-landed-sign-in.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const connected: ModelSignIn = {
    connectionId: 'mcn_plan',
    expiresAt: '2026-11-19T12:15:00.000Z',
    label: 'ChatGPT plan',
    provider: 'chatgpt',
    signInId: 'msi_1',
    state: 'connected',
};

test('a landed sign-in announces itself once, even when its tab hides and shows again', async () => {
    const harness = createCallHarness(() => connected);
    harness.queryClient.setQueryData(
        getQueryKey(hausTrpc.modelConnections.signIn, { serverId, signInId: 'msi_1' }, 'query'),
        connected
    );
    const announced: string[] = [];
    const tab: { show: (visible: boolean) => void } = { show: () => undefined };
    function Tab() {
        const [visible, setVisible] = React.useState(true);
        tab.show = setVisible;
        return (
            <React.Activity mode={visible ? 'visible' : 'hidden'}>
                <Landing />
            </React.Activity>
        );
    }
    function Landing() {
        const signIn = hausTrpc.modelConnections.signIn.useQuery({ serverId, signInId: 'msi_1' });
        useLandedSignIn(signIn.data, (connectionId, label) =>
            announced.push(`${connectionId} ${label}`)
        );
        return null;
    }
    const mounted = await harness.mount(<Tab />);
    await harness.act(() => tab.show(false));
    await harness.act(() => tab.show(true));
    expect(announced).toEqual(['mcn_plan ChatGPT plan']);
    await mounted.unmount();
});
