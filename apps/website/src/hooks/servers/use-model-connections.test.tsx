import { describe, expect, test } from 'bun:test';
import type { ModelSignIn } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { testConnection } from '../../features/settings/models/connections/model-connection.fixture.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installRealtimeTestDom } from '../../test-support/realtime-stream-harness.tsx';
import { createCallHarness, type RecordedCall } from '../../test-support/trpc-call-harness.tsx';
import { useModelConnectionEdits } from './use-model-connections.ts';
import { useCancelModelSignIn, useStartModelSignIn } from './use-model-sign-in.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const listKey = getQueryKey(hausTrpc.modelConnections.list, { serverId }, 'query');
const mutation = (path: string, input: unknown) => ({ input, path, type: 'mutation' });
const signIn: ModelSignIn = {
    expiresAt: '2026-11-19T12:15:00.000Z',
    label: 'ChatGPT plan',
    provider: 'chatgpt',
    signInId: 'msi_1',
    state: 'waiting-for-code',
};

async function mountHook<T>(useHook: () => T, answer?: (call: RecordedCall) => unknown) {
    const harness = createCallHarness(answer);
    const box: { current: T | null } = { current: null };
    function Probe() {
        box.current = useHook();
        return null;
    }
    harness.queryClient.setQueryData(listKey, { connections: [] });
    const mounted = await harness.mount(<Probe />);
    const hook = () => {
        if (!box.current) {
            throw new Error('The hook did not mount.');
        }
        return box.current;
    };
    return { harness, hook, mounted };
}

describe('model connection edits', () => {
    test('Connect sends the pasted credential and refreshes the list', async () => {
        const { harness, hook, mounted } = await mountHook(
            () => useModelConnectionEdits(serverId),
            () => testConnection()
        );
        await harness.act(() =>
            hook().add.mutateAsync({
                credential: { kind: 'setup-token', token: 'sk-ant-oat01-token' },
                label: 'Claude plan',
                provider: 'claude',
                serverId,
            })
        );
        expect(harness.calls).toEqual([
            mutation('modelConnections.add', {
                credential: { kind: 'setup-token', token: 'sk-ant-oat01-token' },
                label: 'Claude plan',
                provider: 'claude',
                serverId,
            }),
        ]);
        expect(harness.queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
        await mounted.unmount();
    });

    test('rename, make default, remove and web search each name the one connection', async () => {
        const { harness, hook, mounted } = await mountHook(
            () => useModelConnectionEdits(serverId),
            () => ({ connections: [] })
        );
        const target = { connectionId: 'mcn_team', serverId };
        await harness.act(() => hook().rename.mutateAsync({ ...target, label: 'Team plan' }));
        await harness.act(() => hook().makeDefault.mutateAsync(target));
        await harness.act(() => hook().setWebSearch.mutateAsync({ ...target, enabled: false }));
        await harness.act(() => hook().remove.mutateAsync(target));
        expect(harness.calls).toEqual([
            mutation('modelConnections.rename', { ...target, label: 'Team plan' }),
            mutation('modelConnections.makeDefault', target),
            mutation('modelConnections.setWebSearch', { ...target, enabled: false }),
            mutation('modelConnections.remove', target),
        ]);
        expect(harness.queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
        await mounted.unmount();
    });
});

describe('reconnect', () => {
    test('a pasted Reconnect replaces the credential in place and refreshes the list', async () => {
        const { harness, hook, mounted } = await mountHook(
            () => useModelConnectionEdits(serverId),
            () => testConnection({ id: 'mcn_team', label: 'Team plan' })
        );
        await harness.act(() =>
            hook().replaceCredential.mutateAsync({
                connectionId: 'mcn_team',
                credential: { kind: 'setup-token', token: 'sk-ant-oat01-renewed' },
                serverId,
            })
        );
        expect(harness.calls).toEqual([
            mutation('modelConnections.replaceCredential', {
                connectionId: 'mcn_team',
                credential: { kind: 'setup-token', token: 'sk-ant-oat01-renewed' },
                serverId,
            }),
        ]);
        expect(harness.queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
        await mounted.unmount();
    });

    test('a sign-in Reconnect names the connection it replaces', async () => {
        const { harness, hook, mounted } = await mountHook(
            () => useStartModelSignIn(serverId),
            () => signIn
        );
        await harness.act(() =>
            hook().mutateAsync({
                label: 'ChatGPT plan',
                provider: 'chatgpt',
                replaceConnectionId: 'mcn_plus',
                serverId,
            })
        );
        expect(harness.calls).toEqual([
            mutation('modelConnections.startSignIn', {
                label: 'ChatGPT plan',
                provider: 'chatgpt',
                replaceConnectionId: 'mcn_plus',
                serverId,
            }),
        ]);
        await mounted.unmount();
    });
});

describe('device sign-in', () => {
    test('starting a sign-in fills its read from the Server answer', async () => {
        const { harness, hook, mounted } = await mountHook(
            () => useStartModelSignIn(serverId),
            () => signIn
        );
        await harness.act(() =>
            hook().mutateAsync({ label: 'ChatGPT plan', provider: 'chatgpt', serverId })
        );
        expect(harness.calls).toEqual([
            mutation('modelConnections.startSignIn', {
                label: 'ChatGPT plan',
                provider: 'chatgpt',
                serverId,
            }),
        ]);
        const key = getQueryKey(
            hausTrpc.modelConnections.signIn,
            { serverId, signInId: 'msi_1' },
            'query'
        );
        expect(harness.queryClient.getQueryData<ModelSignIn>(key)).toEqual(signIn);
        await mounted.unmount();
    });

    test('an accepted cancel shows the cancelled sign-in; a refused one leaves it be', async () => {
        const cancelled = { ...signIn, state: 'cancelled' as const };
        let answer: unknown = { cancelled: true, signIn: cancelled };
        const { harness, hook, mounted } = await mountHook(
            () => useCancelModelSignIn(serverId),
            () => answer
        );
        const key = getQueryKey(
            hausTrpc.modelConnections.signIn,
            { serverId, signInId: 'msi_1' },
            'query'
        );
        harness.queryClient.setQueryData(key, signIn);
        await harness.act(() => hook().mutateAsync({ serverId, signInId: 'msi_1' }));
        expect(harness.queryClient.getQueryData<ModelSignIn>(key)).toEqual(cancelled);

        const storing: ModelSignIn = { ...signIn, state: 'storing' };
        harness.queryClient.setQueryData(key, storing);
        answer = { cancelled: false, reason: 'completing' };
        await harness.act(() => hook().mutateAsync({ serverId, signInId: 'msi_1' }));
        expect(harness.queryClient.getQueryData<ModelSignIn>(key)).toEqual(storing);
        await mounted.unmount();
    });
});
