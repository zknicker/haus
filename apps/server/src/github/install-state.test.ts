import { describe, expect, test } from 'bun:test';
import { GithubInstallStates } from './install-state.ts';

const attempt = { connectionId: 'mcp_github', serverId: 'srv_one', userId: 'usr_owner' };

describe('GithubInstallStates', () => {
    test('a state is 32 random bytes and is consumed exactly once', () => {
        const states = new GithubInstallStates();
        const state = states.create(attempt);
        expect(Buffer.from(state, 'base64url')).toHaveLength(32);
        expect(states.consume(state)).toEqual(attempt);
        expect(states.consume(state)).toBeNull();
        expect(states.consume('never-issued')).toBeNull();
    });

    test('a state expires after 15 minutes', () => {
        let now = 0;
        const states = new GithubInstallStates(() => now);
        const fresh = states.create(attempt);
        const stale = states.create(attempt);
        now = 15 * 60_000 - 1;
        expect(states.consume(fresh)).toEqual(attempt);
        now = 15 * 60_000;
        expect(states.consume(stale)).toBeNull();
    });
});
