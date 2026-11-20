import { describe, expect, test } from 'bun:test';
import type { ModelSignIn } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installRealtimeTestDom } from '../../test-support/realtime-stream-harness.tsx';
import { mountCallHook, type RecordedCall } from '../../test-support/trpc-call-harness.tsx';
import { useCancelModelSignIn, useModelSignIn, useStartModelSignIn } from './use-model-sign-in.ts';

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

function mountHook<T>(useHook: () => T, answer?: (call: RecordedCall) => unknown) {
    return mountCallHook(useHook, answer, (queryClient) =>
        queryClient.setQueryData(listKey, { connections: [], runnerModels: null })
    );
}

describe('reconnect', () => {
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

    test('a code the Server sent before the start answer still shows once the sign-in opens', async () => {
        const code: ModelSignIn = {
            ...signIn,
            state: 'code',
            userCode: 'ABCD-1234',
            verificationUri: 'https://auth.openai.com/codex/device',
        };
        const { harness, hook, mounted } = await mountHook(
            () => {
                const [signInId, setSignInId] = React.useState<string | null>(null);
                const start = useStartModelSignIn(serverId);
                const read = useModelSignIn(serverId, signInId);
                return { read, setSignInId, start };
            },
            (call) => (call.path === 'modelConnections.startSignIn' ? signIn : code)
        );
        await harness.act(async () => {
            const started = await hook().start.mutateAsync({
                label: 'ChatGPT plan',
                provider: 'chatgpt',
                serverId,
            });
            hook().setSignInId(started.signInId);
        });
        expect(harness.calls.map((call) => call.path)).toEqual([
            'modelConnections.startSignIn',
            'modelConnections.signIn',
        ]);
        expect(hook().read.data).toEqual(code);
        await mounted.unmount();
    });

    test('a sign-in that starts after its dialog closed is cancelled at once', async () => {
        let answerStart: (value: ModelSignIn) => void = () => undefined;
        const started = new Promise<ModelSignIn>((resolve) => {
            answerStart = resolve;
        });
        const { harness, hook, mounted } = await mountHook(
            () => useStartModelSignIn(serverId),
            (call) =>
                call.path === 'modelConnections.startSignIn'
                    ? started
                    : { cancelled: true, signIn: { ...signIn, state: 'cancelled' } }
        );
        const opened = hook().start({ label: 'ChatGPT plan', provider: 'chatgpt', serverId });
        await mounted.unmount();
        answerStart(signIn);
        expect(await opened).toBeNull();
        expect(harness.calls).toEqual([
            mutation('modelConnections.startSignIn', {
                label: 'ChatGPT plan',
                provider: 'chatgpt',
                serverId,
            }),
            mutation('modelConnections.cancelSignIn', { serverId, signInId: 'msi_1' }),
        ]);
    });

    test('an accepted cancel shows the cancelled sign-in; a refused one refetches it and the list', async () => {
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
        harness.queryClient.setQueryData(listKey, { connections: [], runnerModels: null });
        answer = { cancelled: false, reason: 'finished' };
        await harness.act(() => hook().mutateAsync({ serverId, signInId: 'msi_1' }));
        expect(harness.queryClient.getQueryData<ModelSignIn>(key)).toEqual(storing);
        expect(harness.queryClient.getQueryState(key)?.isInvalidated).toBe(true);
        expect(harness.queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
        await mounted.unmount();
    });
});
