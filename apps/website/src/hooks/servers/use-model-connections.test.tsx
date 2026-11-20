import { describe, expect, test } from 'bun:test';
import type { ModelConnectionsRead } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { testConnection } from '../../features/settings/models/connections/model-connection.fixture.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installRealtimeTestDom } from '../../test-support/realtime-stream-harness.tsx';
import { mountCallHook, type RecordedCall } from '../../test-support/trpc-call-harness.tsx';
import { useModelConnectionEdits, useSaveModelCredential } from './use-model-connections.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const listKey = getQueryKey(hausTrpc.modelConnections.list, { serverId }, 'query');
const mutation = (path: string, input: unknown) => ({ input, path, type: 'mutation' });

function mountHook<T>(useHook: () => T, answer?: (call: RecordedCall) => unknown) {
    return mountCallHook(useHook, answer, (queryClient) =>
        queryClient.setQueryData(listKey, { agentLoop: 'runner', connections: [] })
    );
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
});
