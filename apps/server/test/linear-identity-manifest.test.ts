import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { identityGuidedFlow } from '../src/haus-api/linear/identity-view.ts';
import { linearCanReachOrigin, linearClientName } from '../src/linear/identity-app-manifest.ts';
import { type JsonSchema, jsonSchemaErrors } from './json-schema-subset.ts';

// Linear's published manifest schema, vendored from
// https://linear.app/.well-known/oauth-app-manifest.schema.json.
const manifestSchema = JSON.parse(
    readFileSync(
        new URL('./fixtures/linear/oauth-app-manifest.schema.json', import.meta.url),
        'utf8'
    )
) as JsonSchema;

const identity = {
    avatarId: 'av_juniper',
    displayName: 'Juniper',
    identityId: 'lni_0123456789abcdef',
};
const workspace = { urlKey: 'acme' };

function manifestOf(url: string): Record<string, unknown> {
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://linear.app');
    expect(parsed.pathname).toBe('/acme/settings/api/applications/new');
    return JSON.parse(parsed.searchParams.get('manifest') ?? 'null');
}

describe('Linear identity app manifest', () => {
    test('a public origin opens Linear fully pre-filled with a schema-valid manifest', () => {
        const flow = identityGuidedFlow({ publicOrigin: 'https://haus.chat' }, workspace, identity);
        const manifest = manifestOf(flow.createAppUrl);
        expect(jsonSchemaErrors(manifestSchema, manifest)).toEqual([]);
        expect(manifest).toEqual({
            developer: { name: 'Haus' },
            display: { iconUrl: 'https://haus.chat/api/avatars/av_juniper' },
            distribution: 'private',
            oauth: {
                client_name: 'Juniper',
                client_uri: 'https://haus.chat',
                grant_types: ['authorization_code'],
                redirect_uris: ['https://haus.chat/linear/oauth/callback'],
            },
            schemaVersion: '1.0.0',
            webhook: {
                enabled: true,
                resourceTypes: ['AgentSessionEvent', 'PermissionChange', 'OAuthAuthorization'],
                url: 'https://haus.chat/api/linear/webhook/lni_0123456789abcdef',
            },
        });
        expect(flow.createAppPrefillsWebhook).toBe(true);
        expect(flow.appName).toBe('Juniper');
    });

    test('an Agent without an avatar sends no icon', () => {
        const flow = identityGuidedFlow({ publicOrigin: 'https://haus.chat' }, workspace, {
            ...identity,
            avatarId: null,
        });
        const manifest = manifestOf(flow.createAppUrl);
        expect(manifest.display).toBeUndefined();
        expect(jsonSchemaErrors(manifestSchema, manifest)).toEqual([]);
    });

    test('a loopback or plain-HTTP origin omits the webhook and icon but keeps the copy values', () => {
        for (const publicOrigin of ['http://localhost:43447', 'https://127.0.0.1:43447']) {
            const flow = identityGuidedFlow({ publicOrigin }, workspace, identity);
            const manifest = manifestOf(flow.createAppUrl);
            expect(jsonSchemaErrors(manifestSchema, manifest)).toEqual([]);
            expect(manifest.webhook).toBeUndefined();
            expect(manifest.display).toBeUndefined();
            expect(flow.createAppPrefillsWebhook).toBe(false);
            expect(flow.webhookUrl).toBe(`${publicOrigin}/api/linear/webhook/lni_0123456789abcdef`);
            expect(flow.avatarUrl).toBe(`${publicOrigin}/api/avatars/av_juniper`);
        }
    });

    test('names Linear would refuse are adjusted deterministically, and the dialog shows the same name', () => {
        expect(linearClientName('  Juniper   Bot ')).toBe('Juniper Bot');
        expect(linearClientName('Linear Helper')).toBe('Helper');
        expect(linearClientName('LiLINEARnear Pal')).toBe('Pal');
        expect(linearClientName('see https://x.dev')).toBe('see x.dev');
        expect(linearClientName('J')).toBe('J (Haus)');
        expect(linearClientName('Linear')).toBe('Haus Agent');
        expect(linearClientName('x'.repeat(100))).toBe('x'.repeat(80));
        for (const displayName of ['Linear', 'J', 'linear https://a.b', 'y'.repeat(90)]) {
            const flow = identityGuidedFlow({ publicOrigin: 'https://haus.chat' }, workspace, {
                ...identity,
                displayName,
            });
            const manifest = manifestOf(flow.createAppUrl);
            expect(jsonSchemaErrors(manifestSchema, manifest)).toEqual([]);
            expect((manifest.oauth as { client_name: string }).client_name).toBe(flow.appName);
        }
    });

    test('only HTTPS public hosts count as reachable by Linear', () => {
        expect(linearCanReachOrigin('https://haus.chat')).toBe(true);
        expect(linearCanReachOrigin('https://mac.tailnet.ts.net')).toBe(true);
        for (const origin of [
            'http://haus.chat',
            'https://localhost',
            'https://app.localhost',
            'https://10.0.0.4',
            'https://192.168.1.2',
            'https://172.20.0.1',
            'https://100.100.1.1',
            'https://[::1]',
            'https://[fd00::1]',
            'https://linear.app',
            'not a url',
        ]) {
            expect(linearCanReachOrigin(origin)).toBe(false);
        }
    });

    test('the subset validator catches what the schema forbids', () => {
        const bad = {
            developer: { name: 'H' },
            oauth: { client_name: 'My Linear app', redirect_uris: [] },
            schemaVersion: '2.0.0',
            webhook: { resourceTypes: ['Nope'], url: 'http://x.dev' },
        };
        expect(jsonSchemaErrors(manifestSchema, bad).length).toBeGreaterThanOrEqual(5);
    });
});
