import { describe, expect, test } from 'bun:test';
import type { RunnerModelConnection } from '@haus/api';
import { claudeLaunchFacts, claudeLaunchKey } from './claude-launch.ts';

const plan: RunnerModelConnection = {
    credential: { kind: 'setup-token', token: 'sk-ant-oat01-first' },
    id: 'mc_claude',
    label: 'Max plan',
    provider: 'claude',
    serverId: 'srv_1',
    webSearch: true,
};

function launch(connection: RunnerModelConnection) {
    return {
        agentDir: '/data/agents/agt_1',
        connection,
        instructions: 'You are Blippy.\n',
        modelId: 'claude-opus-4-5',
        reasoningEffort: 'default' as const,
    };
}

describe('Claude launch per connection', () => {
    test('the launch environment carries the run’s connection token and nothing from the runner', () => {
        expect(claudeLaunchFacts(launch(plan), 'fingerprint').environment).toEqual({
            CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-first',
            CLAUDE_CONFIG_DIR: '/data/agents/agt_1/claude',
            HOME: '/data/agents/agt_1/home',
            PATH: process.env.PATH,
        });
    });

    test('a changed token or another connection changes the warm-pool launch key', () => {
        const key = (connection: RunnerModelConnection) =>
            claudeLaunchKey(claudeLaunchFacts(launch(connection), 'fingerprint'));
        const rotated: RunnerModelConnection = {
            ...plan,
            credential: { kind: 'setup-token', token: 'sk-ant-oat01-second' },
        };

        expect(key({ ...plan })).toBe(key(plan));
        expect(new Set([key(plan), key(rotated), key({ ...plan, id: 'mc_other' })]).size).toBe(3);
    });

    test('a Claude run refuses a connection that is not a setup-token', () => {
        expect(() =>
            claudeLaunchFacts(
                launch({ ...plan, credential: { key: 'sk-or-key-0001', kind: 'api-key' } }),
                'fingerprint'
            )
        ).toThrow('A Claude run needs a setup-token connection, not api-key.');
    });
});
