import { describe, expect, test } from 'bun:test';
import type { LinearIdentity, LinearIdentityDraft } from '@haus/api';
import {
    linearIdentityClientIdEditable,
    linearIdentityCredentialsInput,
    linearIdentityFlowMode,
    linearIdentityFlowSteps,
    linearIdentityFlowValues,
    linearIdentityRegisterHint,
    linearIdentityValuesShown,
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
    test('an Agent without an identity posts via Haus, offers its own, and has no menu', () => {
        expect(linearIdentityRow(null)).toEqual({
            details: [],
            fact: 'Posts via Haus',
            menu: [],
            step: 'give',
        });
        expect(linearIdentityRow(identity({ status: 'removed' })).step).toBe('give');
    });

    test('a draft still posts via Haus and its line offers to finish setup', () => {
        expect(linearIdentityRow(identity({ handle: null, status: 'draft' }))).toEqual({
            details: [],
            fact: 'Posts via Haus',
            menu: [],
            step: 'continue',
        });
    });

    test('an active identity names its handle, which opens its menu, and its last delivery', () => {
        const row = linearIdentityRow(
            identity({ lastDeliveryAt: '2026-10-15T09:00:00.000Z' }),
            now
        );
        expect(row).toEqual({
            details: ['Last delivery 3h ago'],
            fact: 'Posts as @juniper',
            menu: ['rotate-secret', 'remove'],
            step: null,
        });
    });

    test('degraded identities name their state on the line and offer the fix', () => {
        expect(linearIdentityRow(identity({ status: 'inactive' })).details).toContain('Inactive');
        const signIn = linearIdentityRow(identity({ status: 'refresh_required' }));
        expect(signIn.details).toEqual(['Sign in required']);
        expect(signIn.step).toBe('reinstall');
        expect(signIn.menu).toEqual(['rotate-secret', 'remove']);
        expect(linearIdentityRow(identity({ status: 'revoked' })).details).toEqual(['Revoked']);
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
    const stepsOf = (overrides: Partial<Parameters<typeof linearIdentityFlowSteps>[0]> = {}) =>
        linearIdentityFlowSteps({
            credentialsSaved: false,
            editing: null,
            installing: true,
            mode: 'create',
            registered: false,
            ...overrides,
        });
    const statuses = (steps: ReturnType<typeof linearIdentityFlowSteps>) =>
        steps.map((step) => step.status);

    test('exactly one step is current, advancing as each lands', () => {
        const fresh = stepsOf();
        expect(statuses(fresh)).toEqual(['current', 'upcoming', 'upcoming']);
        expect(fresh[0]?.title).toBe('Create the app in Linear');
        const returned = stepsOf({ registered: true });
        expect(statuses(returned)).toEqual(['done', 'current', 'upcoming']);
        expect(returned[0]?.title).toBe('Created in Linear');
        const saved = stepsOf({ credentialsSaved: true });
        expect(statuses(saved)).toEqual(['done', 'done', 'current']);
        expect(saved[1]?.title).toBe('Credentials saved');
    });

    test('editing reopens a done step and every later step waits again', () => {
        const edited = stepsOf({ credentialsSaved: true, editing: 'credentials' });
        expect(statuses(edited)).toEqual(['done', 'current', 'upcoming']);
        const back = stepsOf({ credentialsSaved: true, editing: 'register', mode: 'existing' });
        expect(statuses(back)).toEqual(['current', 'upcoming', 'upcoming']);
        expect(back[0]?.title).toBe("Check the app's settings");
    });

    test('a secret rotation has no install step and lands on the credentials', () => {
        const rotation = stepsOf({ credentialsSaved: true, installing: false, mode: 'existing' });
        expect(rotation.map((step) => step.id)).toEqual(['register', 'credentials']);
        expect(statuses(rotation)).toEqual(['done', 'current']);
    });

    test('creating by hand lists the app icon to save and the events as labels', () => {
        const byHand = linearIdentityFlowValues(
            { ...draft, createAppPrefillsWebhook: false },
            'create'
        );
        expect(byHand.map((value) => `${value.kind}:${value.label}`)).toEqual([
            'copy:App name',
            'download:App icon',
            'copy:Callback URL',
            'copy:Webhook URL',
            'labels:Webhook events',
        ]);
        expect(byHand[4]).toEqual({
            kind: 'labels',
            label: 'Webhook events',
            values: ['Agent session events', 'Permission changes', 'OAuth app revoked'],
        });
    });

    test('a pre-filled create drops the icon; an existing app lists only URLs and events', () => {
        expect(linearIdentityFlowValues(draft, 'create').map((value) => value.label)).toEqual([
            'App name',
            'Callback URL',
            'Webhook URL',
            'Webhook events',
        ]);
        expect(linearIdentityFlowValues(draft, 'existing').map((value) => value.label)).toEqual([
            'Callback URL',
            'Webhook URL',
            'Webhook events',
        ]);
    });

    test('creating says Linear opens pre-filled and only the two credentials come back', () => {
        const full = linearIdentityRegisterHint(draft, 'create');
        expect(full).toContain('app filled in');
        expect(full).toContain('client ID and webhook secret');
        const localDraft = { ...draft, createAppPrefillsWebhook: false };
        const local = linearIdentityRegisterHint(localDraft, 'create');
        expect(local).toContain('add the app icon and webhook below yourself');
        expect(linearIdentityRegisterHint(draft, 'existing')).toContain('match these');
    });

    test('values wait behind a toggle only when Linear pre-fills them all', () => {
        expect(linearIdentityValuesShown(draft, 'create')).toBe(false);
        expect(
            linearIdentityValuesShown({ ...draft, createAppPrefillsWebhook: false }, 'create')
        ).toBe(true);
        expect(linearIdentityValuesShown(draft, 'existing')).toBe(true);
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
