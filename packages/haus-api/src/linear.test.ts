import { describe, expect, test } from 'bun:test';
import {
    linearIdentitySchema,
    linearSaveIdentityCredentialsInputSchema,
    linearStartInstallInputSchema,
    linearWorkspaceSchema,
} from './linear.ts';
import { linearIssueResultSchema } from './linear-issues.ts';
import { linearIssueChangedEventSchema, linearUpdatedEventSchema } from './realtime-events.ts';

const workspace = {
    connectionId: 'mcp_linear',
    defaultAgentId: null,
    id: 'lnw_0123456789abcdef',
    lastDeliveryAt: null,
    memberTeamIds: ['team-1'],
    name: 'Haus',
    organizationId: 'org-1',
    removedAt: null,
    status: 'active',
    teams: [{ id: 'team-1', key: 'DES', name: 'Design' }],
    teamsSyncedAt: '2026-10-15T12:00:00.000Z',
    urlKey: 'haus-chat',
};

describe('linear contracts', () => {
    test('a workspace tombstone has no connection', () => {
        expect(
            linearWorkspaceSchema.parse({
                ...workspace,
                connectionId: null,
                removedAt: '2026-10-15T13:00:00.000Z',
                status: 'removed',
            }).connectionId
        ).toBeNull();
        expect(linearWorkspaceSchema.safeParse({ ...workspace, status: 'gone' }).success).toBe(
            false
        );
    });

    test('a draft identity has no Linear handle yet', () => {
        expect(
            linearIdentitySchema.parse({
                agentId: 'agt_juniper',
                credentialsSaved: false,
                memberTeamIds: [],
                guidedFlow: {
                    appName: 'Juniper',
                    avatarUrl: null,
                    callbackUrl: 'https://haus.chat/linear/oauth/callback',
                    appsUrl: 'https://linear.app/settings/api/applications',
                    createAppPrefillsWebhook: true,
                    createAppUrl: 'https://linear.app/settings/api/applications/new',
                    identityId: 'lni_0123456789abcdef',
                    webhookEvents: ['agent_session_events'],
                    webhookUrl: 'https://haus.chat/api/linear/webhook/lni_0123456789abcdef',
                },
                handle: null,
                id: 'lni_0123456789abcdef',
                lastDeliveryAt: null,
                status: 'draft',
                workspaceId: workspace.id,
            }).status
        ).toBe('draft');
    });

    test('identity credentials never carry a client secret', () => {
        expect(
            linearSaveIdentityCredentialsInputSchema.safeParse({
                clientId: 'client',
                clientSecret: 'nope',
                identityId: 'lni_0123456789abcdef',
                serverId: 'srv_1',
                webhookSigningSecret: 'lin_wh_1',
            }).success
        ).toBe(false);
    });

    test('install without a connection connects a new workspace', () => {
        expect(linearStartInstallInputSchema.parse({ serverId: 'srv_1' })).toEqual({
            serverId: 'srv_1',
        });
    });

    test('an issue chip is available or names why not', () => {
        expect(
            linearIssueResultSchema.parse({
                reason: 'workspace_not_connected',
                status: 'unavailable',
            }).status
        ).toBe('unavailable');
        expect(
            linearIssueResultSchema.safeParse({ issue: null, status: 'unavailable' }).success
        ).toBe(false);
    });

    test('realtime notices name the connection', () => {
        expect(() => linearUpdatedEventSchema.parse({ serverId: 'srv_1' })).toThrow();
        expect(
            linearIssueChangedEventSchema.parse({
                connectionId: 'mcp_linear',
                identifier: 'DES-142',
                issueId: 'issue-1',
                serverId: 'srv_1',
            }).identifier
        ).toBe('DES-142');
    });
});
