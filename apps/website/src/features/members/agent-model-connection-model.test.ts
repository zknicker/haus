import { expect, test } from 'bun:test';
import { testConnection } from '../settings/models/connections/model-connection.fixture.ts';
import {
    agentConnectionChoice,
    agentConnectionIssue,
    connectionIdForKey,
} from './agent-model-connection-model.ts';

const claudeTeam = testConnection({ id: 'mcn_team', label: 'Team plan' });
const claudeSide = testConnection({
    id: 'mcn_side',
    isDefault: false,
    label: 'Side plan',
    position: 1,
});
const chatgpt = testConnection({
    authKind: 'oauth',
    id: 'mcn_gpt',
    label: 'ChatGPT plan',
    provider: 'chatgpt',
    webSearch: true,
});
const connections = [chatgpt, claudeSide, claudeTeam];

test("the select offers only the model provider's connections, default first", () => {
    const choice = agentConnectionChoice(
        { desiredModelId: 'claude-opus-4-1', modelConnectionId: 'mcn_side' },
        connections
    );
    expect(choice.kind === 'choose' && choice.options.map((option) => option.id)).toEqual([
        'mcn_team',
        'mcn_side',
    ]);
    expect(choice).toMatchObject({
        defaultLabel: 'Team plan',
        providerName: 'Claude',
        selectedKey: 'mcn_side',
    });
    expect(
        agentConnectionChoice({ desiredModelId: 'gpt-5.1', modelConnectionId: null }, connections)
    ).toMatchObject({ selectedKey: 'default', providerName: 'ChatGPT' });
});

test('a chosen connection for another provider reads as the default', () => {
    expect(
        agentConnectionChoice(
            { desiredModelId: 'gpt-5.1', modelConnectionId: 'mcn_team' },
            connections
        )
    ).toMatchObject({ selectedKey: 'default' });
});

test('a provider with no connection says so', () => {
    expect(
        agentConnectionChoice(
            { desiredModelId: 'gemini-2.5-pro', modelConnectionId: null },
            connections
        )
    ).toEqual({ kind: 'none', provider: 'gemini', providerName: 'Gemini' });
});

test('the issue is the connection the Agent actually runs on, only when it failed', () => {
    const failedSide = { ...claudeSide, status: 'failed' as const, statusDetail: 'Token revoked.' };
    const withFailure = [claudeTeam, failedSide];
    expect(
        agentConnectionIssue(
            { desiredModelId: 'claude-sonnet-4-5', modelConnectionId: 'mcn_side' },
            withFailure
        )
    ).toEqual({ connection: failedSide, providerName: 'Claude' });
    expect(
        agentConnectionIssue(
            { desiredModelId: 'claude-sonnet-4-5', modelConnectionId: null },
            withFailure
        )
    ).toBeNull();
});

test('the Default key saves as no choice', () => {
    expect(connectionIdForKey('default')).toBeNull();
    expect(connectionIdForKey('mcn_side')).toBe('mcn_side');
});
