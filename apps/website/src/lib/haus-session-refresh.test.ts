import { describe, expect, test } from 'bun:test';
import { refreshRefusedSession } from './haus-session-refresh.ts';

describe('refreshRefusedSession', () => {
    test('refreshes the Server socket with the new App access token', async () => {
        let token = 'old-token';
        const socketToken: { value: string | null } = { value: null };

        const refreshed = await refreshRefusedSession({
            readAccessToken: async () => token,
            reconnect: () => undefined,
            refreshAppSession: async () => {
                token = 'new-token';
            },
            refreshSession: async (nextToken) => {
                socketToken.value = nextToken;
            },
        });

        expect(refreshed).toBe(true);
        expect(socketToken.value).toBe('new-token');
    });

    test('stops when refreshing the App session signs the user out', async () => {
        const refreshed = await refreshRefusedSession({
            readAccessToken: async () => null,
            reconnect: () => undefined,
            refreshAppSession: async () => undefined,
            refreshSession: async () => undefined,
        });

        expect(refreshed).toBe(false);
    });

    test('reconnects when the Server refuses the refreshed socket token', async () => {
        let reconnected = false;

        const refreshed = await refreshRefusedSession({
            readAccessToken: async () => 'new-token',
            reconnect: () => {
                reconnected = true;
            },
            refreshAppSession: async () => undefined,
            refreshSession: async () => {
                throw new Error('FORBIDDEN');
            },
        });

        expect(refreshed).toBe(true);
        expect(reconnected).toBe(true);
    });
});
