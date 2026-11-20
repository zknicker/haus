import { describe, expect, test } from 'bun:test';
import type { ModelConnectionsRead, ModelSignIn } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { testConnection } from '../../features/settings/models/connections/model-connection.fixture.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installRealtimeTestDom } from '../../test-support/realtime-stream-harness.tsx';
import { createCallHarness, type RecordedCall } from '../../test-support/trpc-call-harness.tsx';
import { useModelConnectionEdits, useSaveModelCredential } from './use-model-connections.ts';
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
    test('Connect sends the pasted credential, refreshes the list, and keeps no copy of it', async () => {
        const { harness, hook, mounted } = await mountHook(
            () => useSaveModelCredential(serverId),
            () => testConnection()
        );
        await harness.act(() =>
            hook().save({
                credential: { kind: 'setup-token', token: 'sk-ant-oat01-token' },
                label: 'Claude plan',
                provider: 'claude',
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
        expect(harness.queryClient.getMutationCache().getAll()).toEqual([]);
        expect(hook().isPending).toBe(false);
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

describe('row edits', () => {
    test('a new edit clears the failure an earlier one left on the row', async () => {
        const { harness, hook, mounted } = await mountHook(
            () => useModelConnectionEdits(serverId),
            (call) => {
                if (call.path === 'modelConnections.makeDefault') {
                    throw new Error('Haus could not reorder the connections.');
                }
                return testConnection({ id: 'mcn_team' });
            }
        );
        const target = { connectionId: 'mcn_team', serverId };
        await harness.act(() =>
            hook()
                .makeDefault.mutateAsync(target)
                .catch(() => undefined)
        );
        expect(hook().makeDefault.error?.message).toBe('Haus could not reorder the connections.');
        await harness.act(() => hook().setWebSearch.mutateAsync({ ...target, enabled: true }));
        expect(
            [hook().makeDefault, hook().remove, hook().setWebSearch].map(
                (edit) => edit.error?.message ?? null
            )
        ).toEqual([null, null, null]);
        await mounted.unmount();
    });
});

describe('web search', () => {
    test('the switch shows the pick at once and a refusal puts the old value back', async () => {
        const gemini = testConnection({
            authKind: 'api-key',
            id: 'mcn_gemini',
            label: 'Gemini key',
            provider: 'gemini',
            webSearch: true,
        });
        let refuse: (cause: Error) => void = () => undefined;
        const { harness, hook, mounted } = await mountHook(
            () => useModelConnectionEdits(serverId),
            () =>
                new Promise((_resolve, reject) => {
                    refuse = reject;
                })
        );
        const webSearch = () =>
            harness.queryClient
                .getQueryData<ModelConnectionsRead>(listKey)
                ?.connections.map((connection) => connection.webSearch);
        harness.queryClient.setQueryData(listKey, { agentLoop: 'runner', connections: [gemini] });
        const saving = hook().setWebSearch.mutateAsync({
            connectionId: 'mcn_gemini',
            enabled: false,
            serverId,
        });
        await harness.act(() => Promise.resolve());
        expect(webSearch()).toEqual([false]);
        refuse(new Error('The Server refused.'));
        await harness.act(() => saving.catch(() => undefined));
        expect(webSearch()).toEqual([true]);
        await mounted.unmount();
    });
});

describe('reconnect', () => {
    test('a pasted Reconnect replaces the credential in place and keeps no copy of it', async () => {
        const { harness, hook, mounted } = await mountHook(
            () => useSaveModelCredential(serverId),
            () => testConnection({ id: 'mcn_team', label: 'Team plan' })
        );
        await harness.act(() =>
            hook().save({
                connectionId: 'mcn_team',
                credential: { kind: 'setup-token', token: 'sk-ant-oat01-renewed' },
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
        expect(harness.queryClient.getMutationCache().getAll()).toEqual([]);
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
        harness.queryClient.setQueryData(listKey, { agentLoop: 'runner', connections: [] });
        answer = { cancelled: false, reason: 'finished' };
        await harness.act(() => hook().mutateAsync({ serverId, signInId: 'msi_1' }));
        expect(harness.queryClient.getQueryData<ModelSignIn>(key)).toEqual(storing);
        expect(harness.queryClient.getQueryState(key)?.isInvalidated).toBe(true);
        expect(harness.queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
        await mounted.unmount();
    });
});
