import { expect, test } from 'bun:test';
import { modelProviderAuthKinds } from '@haus/api';
import { TRPCClientError } from '@trpc/client';
import {
    connectFlows,
    connectLabel,
    connectionActions,
    connectionErrorMessage,
    connectionFact,
    connectionFailure,
    connectionInfo,
    connectionName,
    connectionsByProvider,
    nextConnectionLabel,
    pastedCredential,
    signInCloseStep,
} from './model-connection-model.ts';
import { testConnection } from './model-connection.fixture.ts';

test('every provider gets a card in product order, its connections default first', () => {
    const groups = connectionsByProvider([
        testConnection({ id: 'mcn_side', isDefault: false, label: 'Side', position: 1 }),
        testConnection({ id: 'mcn_key', label: 'Key', provider: 'gemini', authKind: 'api-key' }),
        testConnection({ id: 'mcn_team', label: 'Team', position: 0 }),
    ]);
    expect(
        groups.map((group) => [group.provider, group.connections.map((item) => item.id)])
    ).toEqual([
        ['claude', ['mcn_team', 'mcn_side']],
        ['chatgpt', []],
        ['xai', []],
        ['gemini', ['mcn_key']],
        ['openrouter', []],
    ]);
});

test('each provider offers exactly the sign-in kinds the Server accepts', () => {
    for (const [provider, flows] of Object.entries(connectFlows)) {
        expect(flows.map((flow) => flow.kind)).toEqual([
            ...modelProviderAuthKinds[provider as keyof typeof modelProviderAuthKinds],
        ]);
    }
});

test('an xAI sign-in reads as SuperGrok, the plan people sign into; an xAI key stays xAI', () => {
    const [signIn, apiKey] = connectFlows.xai;
    expect(signIn && connectionName({ authKind: signIn.kind, provider: 'xai' })).toBe('SuperGrok');
    expect(apiKey && connectionName({ authKind: apiKey.kind, provider: 'xai' })).toBe('xAI');
    expect(connectionName({ authKind: 'oauth', provider: 'chatgpt' })).toBe('ChatGPT');
    expect(connectionInfo({ authKind: 'oauth', provider: 'xai' })).toBe(
        'Signed in to SuperGrok with a device code. The Server keeps the login encrypted and refreshes it.'
    );
    expect(connectionInfo({ authKind: 'api-key', provider: 'xai' })).toBe(
        'A pasted API key. The Server keeps it encrypted and never shows it again.'
    );
});

test('the fact says whether a connection works and marks the default', () => {
    expect(connectionFact({ isDefault: true, status: 'ready' })).toBe('Default · Connected');
    expect(connectionFact({ isDefault: false, status: 'ready' })).toBe('Connected');
    expect(connectionFact({ isDefault: false, status: 'failed' })).toBe('Failed');
    expect(connectionFailure({ status: 'failed', statusDetail: 'Token revoked.' })).toBe(
        'Token revoked.'
    );
    expect(connectionFailure({ status: 'failed', statusDetail: null })).toBe(
        'The provider refused this connection.'
    );
    expect(connectionFailure({ status: 'ready', statusDetail: null })).toBeNull();
});

test('the row menu ends with Remove and drops Make default on the default', () => {
    expect(connectionActions({ isDefault: true })).toEqual(['rename', 'reconnect', 'remove']);
    expect(connectionActions({ isDefault: false })).toEqual([
        'rename',
        'make-default',
        'reconnect',
        'remove',
    ]);
});

test('a second connection offers the next free name', () => {
    expect(nextConnectionLabel('Claude plan', [])).toBe('Claude plan');
    expect(nextConnectionLabel('Claude plan', ['claude plan', 'Claude plan 2'])).toBe(
        'Claude plan 3'
    );
});

test('Connect suggests a free name; Reconnect keeps the connection its own name', () => {
    const [plan] = connectFlows.chatgpt;
    if (!plan) {
        throw new Error('ChatGPT has a sign-in flow.');
    }
    expect(connectLabel(plan, undefined, ['ChatGPT plan'])).toBe('ChatGPT plan 2');
    expect(
        connectLabel(plan, testConnection({ label: 'ChatGPT plan', provider: 'chatgpt' }), [
            'ChatGPT plan',
            'Work plan',
        ])
    ).toBe('ChatGPT plan');
});

test('a pasted secret becomes the credential of its kind, or a hint', () => {
    expect(pastedCredential('setup-token', '  sk-ant-oat01-abc  ')).toEqual({
        credential: { kind: 'setup-token', token: 'sk-ant-oat01-abc' },
        ok: true,
    });
    expect(pastedCredential('api-key', 'xai-12345678')).toEqual({
        credential: { key: 'xai-12345678', kind: 'api-key' },
        ok: true,
    });
    expect(pastedCredential('api-key', 'short')).toEqual({
        message: 'Paste the full API key.',
        ok: false,
    });
});

test('an offline runner reads as its own instruction; other refusals keep their words', () => {
    const refusal = (data: unknown, message: string) =>
        TRPCClientError.from({ error: { code: -32_000, data, message } });
    expect(
        connectionErrorMessage(
            refusal(
                { code: 'SERVICE_UNAVAILABLE', modelConnection: { code: 'runner-not-connected' } },
                'The runner is not connected, so sign-in cannot start.'
            )
        )
    ).toBe('The runner is not connected. Start it and try again.');
    expect(
        connectionErrorMessage(
            refusal({ code: 'CONFLICT' }, 'This provider already has a connection named "Team".')
        )
    ).toBe('This provider already has a connection named "Team".');
});

test('closing cancels a sign-in still waiting on the person, and waits out one being stored', () => {
    const base = {
        expiresAt: '2026-11-19T12:15:00.000Z',
        label: 'SuperGrok',
        provider: 'xai' as const,
        signInId: 'msi_1',
    };
    expect(signInCloseStep({ ...base, state: 'waiting-for-code' })).toBe('cancel');
    expect(
        signInCloseStep({
            ...base,
            state: 'code',
            userCode: 'ABCD',
            verificationUri: 'https://accounts.x.ai/device',
        })
    ).toBe('cancel');
    expect(signInCloseStep({ ...base, state: 'storing' })).toBe('wait');
    expect(signInCloseStep({ ...base, detail: 'Expired.', state: 'failed' })).toBe('close');
    expect(signInCloseStep(undefined)).toBe('close');
});
