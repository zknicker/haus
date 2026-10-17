import { describe, expect, test } from 'bun:test';
import type { LinearIdentityDraft } from '@haus/api';
import {
    linearIdentityClientIdEditable,
    linearIdentityCredentialsInput,
    linearIdentityFlowMode,
    linearIdentityFlowSteps,
    linearIdentityFlowValues,
    linearIdentityRegisterHint,
    linearIdentityValuesShown,
} from './linear-identity-flow-model.ts';

const draft: LinearIdentityDraft = {
    appName: 'Juniper',
    avatarUrl: 'https://haus.chat/api/avatars/av_1',
    callbackUrl: 'https://haus.chat/linear/oauth/callback',
    appsUrl: 'https://linear.app/settings/api/applications',
    createAppPrefillsWebhook: true,
    createAppUrl: 'https://linear.app/settings/api/applications/new',
    identityId: 'lni_0123456789abcdef',
    webhookEvents: ['agent_session_events', 'permission_changes', 'oauth_app_revoked'],
    webhookUrl: 'https://haus.chat/api/linear/webhook/lni_0123456789abcdef',
};

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
