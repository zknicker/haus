import { describe, expect, test } from 'bun:test';
import type { LinearIdentity, LinearIdentityDraft } from '@haus/api';
import {
    linearIdentityClientIdEditable,
    linearIdentityCredentialsInput,
    linearIdentityFlowMode,
    linearIdentityFlowSteps,
    linearIdentityFlowValues,
    linearIdentityRegisterHint,
} from './linear-identity-flow-model.ts';
import {
    identityForAgent,
    linearIdentityRow,
    linearWorkspaceStatus,
} from './linear-identity-model.ts';

const now = Date.parse('2026-10-15T12:00:00.000Z');

const draft: LinearIdentityDraft = {
    appName: 'Juniper',
    avatarUrl: 'https://haus.chat/api/avatars/av_1',
    callbackUrl: 'https://haus.chat/linear/oauth/callback',
    createAppPrefillsWebhook: true,
    createAppUrl: 'https://linear.app/settings/api/applications/new',
    identityId: 'lni_0123456789abcdef',
    webhookEvents: ['agent_session_events', 'permission_changes', 'oauth_app_revoked'],
    webhookUrl: 'https://haus.chat/api/linear/webhook/lni_0123456789abcdef',
};

function identity(overrides: Partial<LinearIdentity> = {}): LinearIdentity {
    return {
        agentId: 'agent_juniper',
        credentialsSaved: true,
        guidedFlow: draft,
        handle: 'juniper',
        id: 'lni_0123456789abcdef',
        lastDeliveryAt: null,
        status: 'active',
        workspaceId: 'lnw_0123456789abcdef',
        ...overrides,
    };
}

describe('linearIdentityRow', () => {
    test('an Agent without an identity posts via Haus and can be given one', () => {
        expect(linearIdentityRow('Juniper', null)).toEqual({
            actions: ['give', 'connect-existing'],
            description: 'Posts as Juniper via Haus',
            status: null,
        });
        expect(linearIdentityRow('Juniper', identity({ status: 'removed' })).actions).toEqual([
            'give',
            'connect-existing',
        ]);
    });

    test('a draft still posts via Haus and resumes its setup', () => {
        const row = linearIdentityRow('Juniper', identity({ handle: null, status: 'draft' }));
        expect(row.description).toBe('Posts as Juniper via Haus');
        expect(row.status?.label).toBe('Setup not finished');
        expect(row.actions).toEqual(['continue', 'remove']);
        const unsaved = identity({ credentialsSaved: false, handle: null, status: 'draft' });
        expect(linearIdentityRow('Juniper', unsaved).actions).toEqual([
            'continue',
            'connect-existing',
            'remove',
        ]);
    });

    test('an active identity names its handle and last delivery with no chip', () => {
        const row = linearIdentityRow(
            'Juniper',
            identity({ lastDeliveryAt: '2026-10-15T09:00:00.000Z' }),
            now
        );
        expect(row).toEqual({
            actions: ['rotate-secret', 'remove'],
            description: 'Linear identity: @juniper · Last delivery 3h ago',
            status: null,
        });
    });

    test('degraded identities name their state and offer the fix', () => {
        expect(linearIdentityRow('J', identity({ status: 'inactive' })).status?.label).toBe(
            'Inactive'
        );
        const signIn = linearIdentityRow('J', identity({ status: 'refresh_required' }));
        expect(signIn.status).toEqual({ color: 'warning', label: 'Sign in required' });
        expect(signIn.actions).toEqual(['reinstall', 'rotate-secret', 'remove']);
        expect(linearIdentityRow('J', identity({ status: 'revoked' })).status?.color).toBe(
            'danger'
        );
    });

    test('a removed identity never shadows a live one', () => {
        const removed = identity({ id: 'lni_removed00000000', status: 'removed' });
        const live = identity({ id: 'lni_live000000000000', status: 'draft' });
        expect(identityForAgent([removed, live], 'agent_juniper')?.id).toBe(live.id);
        expect(identityForAgent([removed], 'agent_juniper')).toBeNull();
    });

    test('an active workspace carries no chip', () => {
        expect(linearWorkspaceStatus('active')).toBeNull();
        expect(linearWorkspaceStatus('refresh_required')?.label).toBe('Sign in required');
    });
});

describe('linear identity flow', () => {
    test('copy and paste are current together until the save lands, then install', () => {
        const before = linearIdentityFlowSteps({
            credentialsSaved: false,
            draftReady: true,
            mode: 'create',
        });
        expect(before.map((step) => step.status)).toEqual(['current', 'current', 'upcoming']);
        expect(before[0]?.title).toBe('Create the app in Linear');
        const after = linearIdentityFlowSteps({
            credentialsSaved: true,
            draftReady: true,
            mode: 'existing',
        });
        expect(after.map((step) => step.status)).toEqual(['done', 'done', 'current']);
        expect(after[0]?.title).toBe("Check the app's settings");
        expect(
            linearIdentityFlowSteps({
                credentialsSaved: false,
                draftReady: false,
                mode: 'create',
            })[0]?.status
        ).toBe('upcoming');
    });

    test('creating lists every value; checking an existing app lists only URLs and events', () => {
        expect(linearIdentityFlowValues(draft, 'create').map((value) => value.label)).toEqual([
            'App name',
            'Avatar',
            'Callback URL',
            'Webhook URL',
            'Webhook events',
        ]);
        const existing = linearIdentityFlowValues(draft, 'existing');
        expect(existing.map((value) => value.label)).toEqual([
            'Callback URL',
            'Webhook URL',
            'Webhook events',
        ]);
        expect(existing[2]?.value).toBe(
            'Agent session events, Permission changes, OAuth app revoked'
        );
    });

    test('creating says Linear opens pre-filled and only the two credentials come back', () => {
        const full = linearIdentityRegisterHint(draft, 'create');
        expect(full).toContain('everything below filled in');
        expect(full).toContain('client ID and webhook signing secret');
        const local = linearIdentityRegisterHint(
            { ...draft, createAppPrefillsWebhook: false },
            'create'
        );
        expect(local).toContain('add the webhook URL and events yourself');
        expect(linearIdentityRegisterHint(draft, 'existing')).toContain('match these');
    });

    test('both pasted values are required and bounded', () => {
        const fresh = { credentialsSaved: false, status: 'draft' } as const;
        expect(
            linearIdentityCredentialsInput(fresh, {
                clientId: ' client ',
                webhookSigningSecret: 'secret',
            })
        ).toEqual({ clientId: 'client', webhookSigningSecret: 'secret' });
        expect(
            linearIdentityCredentialsInput(fresh, { clientId: '  ', webhookSigningSecret: 's' })
        ).toBeNull();
        expect(
            linearIdentityCredentialsInput(fresh, {
                clientId: 'client',
                webhookSigningSecret: 'x'.repeat(201),
            })
        ).toBeNull();
    });

    test('saved credentials stay editable: a draft takes a new client id, any secret rotates', () => {
        const savedDraft = { credentialsSaved: true, status: 'draft' } as const;
        expect(
            linearIdentityCredentialsInput(savedDraft, {
                clientId: 'other',
                webhookSigningSecret: 'secret',
            })
        ).toEqual({ clientId: 'other', webhookSigningSecret: 'secret' });
        expect(
            linearIdentityCredentialsInput(savedDraft, {
                clientId: '',
                webhookSigningSecret: 'rotated',
            })
        ).toEqual({ webhookSigningSecret: 'rotated' });
        const installed = { credentialsSaved: true, status: 'active' } as const;
        expect(linearIdentityClientIdEditable(installed)).toBe(false);
        expect(
            linearIdentityCredentialsInput(installed, {
                clientId: '',
                webhookSigningSecret: 'rotated',
            })
        ).toEqual({ webhookSigningSecret: 'rotated' });
        expect(
            linearIdentityCredentialsInput(installed, {
                clientId: 'other',
                webhookSigningSecret: 'rotated',
            })
        ).toBeNull();
    });

    test('resuming never offers to create an app that already has saved credentials', () => {
        expect(linearIdentityFlowMode('continue', { credentialsSaved: false })).toBe('create');
        expect(linearIdentityFlowMode('continue', { credentialsSaved: true })).toBe('existing');
        expect(linearIdentityFlowMode('connect-existing', null)).toBe('existing');
        expect(linearIdentityFlowMode('rotate-secret', { credentialsSaved: true })).toBe(
            'existing'
        );
        expect(linearIdentityFlowMode('give', null)).toBe('create');
    });
});
