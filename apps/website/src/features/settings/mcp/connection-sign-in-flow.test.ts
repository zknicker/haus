import { describe, expect, test } from 'bun:test';
import { createAndSignIn, type SignInFlow, type SignInPopup } from './connection-sign-in-flow.ts';
import type { McpConnection } from './mcp-server-shared.ts';

const created: McpConnection = {
    accountLabel: null,
    affectedAgents: [],
    auth: 'oauth',
    builtIn: true,
    connected: false,
    headerNames: [],
    icon: null,
    id: 'mcp_new',
    name: 'GitHub account',
    preset: 'github',
    summary: null,
    url: 'https://api.githubcopilot.com/mcp/',
};

function recordingFlow(startResult: () => Promise<unknown>) {
    const events: string[] = [];
    const popup: SignInPopup = {
        close: () => events.push('popup:close'),
        location: {
            set href(url: string) {
                events.push(`popup:${url}`);
            },
        },
    };
    const flow: SignInFlow = {
        onAuthorizing: (connection) => events.push(`authorizing:${connection.id}`),
        onFailed: (message) => events.push(`failed:${message}`),
        onTrustRequired: (connection, origin) => events.push(`trust:${connection.id}:${origin}`),
        openPopup: () => {
            events.push('popup:open');
            return popup;
        },
        openUrl: (url) => events.push(`url:${url}`),
        startOAuth: (connectionId) => {
            events.push(`start:${connectionId}`);
            return startResult() as ReturnType<SignInFlow['startOAuth']>;
        },
    };
    return { events, flow };
}

describe('createAndSignIn', () => {
    test('opens the tab before creating, then signs in to the new connection', async () => {
        const { events, flow } = recordingFlow(async () => ({
            authorizationUrl: 'https://github.com/login/oauth/authorize',
            status: 'ready',
        }));

        await createAndSignIn(
            flow,
            async () => {
                events.push('create');
                return created;
            },
            (connection) => events.push(`created:${connection.id}`)
        );

        expect(events).toEqual([
            'popup:open',
            'create',
            'created:mcp_new',
            'start:mcp_new',
            'authorizing:mcp_new',
            'popup:https://github.com/login/oauth/authorize',
        ]);
    });

    test('closes the tab when the create fails, and never starts sign-in', async () => {
        const { events, flow } = recordingFlow(async () => {
            throw new Error('unreachable');
        });

        await createAndSignIn(
            flow,
            () => Promise.reject(new Error('Preset unavailable')),
            () => events.push('created')
        );

        expect(events).toEqual(['popup:open', 'popup:close', 'failed:Preset unavailable']);
    });

    test('closes the tab when sign-in fails after the create', async () => {
        const { events, flow } = recordingFlow(() => Promise.reject(new Error('Server down')));

        await createAndSignIn(
            flow,
            async () => created,
            () => undefined
        );

        expect(events).toEqual([
            'popup:open',
            'start:mcp_new',
            'popup:close',
            'failed:Server down',
        ]);
    });

    test('closes the tab and asks for trust on an unfamiliar authorization server', async () => {
        const { events, flow } = recordingFlow(async () => ({
            authorizationServerOrigin: 'https://auth.example.com',
            status: 'trust-required',
        }));

        await createAndSignIn(
            flow,
            async () => created,
            () => undefined
        );

        expect(events).toEqual([
            'popup:open',
            'start:mcp_new',
            'popup:close',
            'trust:mcp_new:https://auth.example.com',
        ]);
    });
});
