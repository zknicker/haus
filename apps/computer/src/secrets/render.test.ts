import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OnePasswordItem } from '@haus/api';
import {
    envNameForTitle,
    renderSecretsSchema,
    renderSecretsWrapper,
    secretBindings,
} from './render.ts';
import { secretsRuntimePlugin } from './runtime.ts';

const vaultId = 'vaultid0000000000000000001';
const apiKey: OnePasswordItem = {
    field: 'credential',
    id: 'item0000000000000000000001',
    title: 'Dummy API Key',
};

describe('envNameForTitle', () => {
    test('derives a shell-safe name from an item title', () => {
        expect(envNameForTitle('Dummy API Key')).toBe('DUMMY_API_KEY');
        expect(envNameForTitle('  stripe/live: key!  ')).toBe('STRIPE_LIVE_KEY');
        expect(envNameForTitle('2fa seed')).toBe('_2FA_SEED');
        expect(envNameForTitle('🔑')).toBe('SECRET');
    });

    test('never shadows names the wrapper or shell own', () => {
        expect(envNameForTitle('path')).toBe('OP_PATH');
        expect(envNameForTitle('haus op token')).toBe('OP_HAUS_OP_TOKEN');
        expect(envNameForTitle('Varlock Env')).toBe('OP_VARLOCK_ENV');
    });
});

describe('secretBindings', () => {
    test('references each item by vault and item id and the field the App chose', () => {
        const bindings = secretBindings(vaultId, [
            { field: 'password', id: 'item0000000000000000000002', title: 'GitHub' },
            apiKey,
        ]);
        expect(bindings).toEqual([
            {
                envName: 'DUMMY_API_KEY',
                reference: `op://${vaultId}/item0000000000000000000001/credential`,
                title: 'Dummy API Key',
            },
            {
                envName: 'GITHUB',
                reference: `op://${vaultId}/item0000000000000000000002/password`,
                title: 'GitHub',
            },
        ]);
    });

    test('suffixes colliding names', () => {
        const names = secretBindings(vaultId, [
            { field: 'password', id: 'item0000000000000000000001', title: 'db password' },
            { field: 'password', id: 'item0000000000000000000002', title: 'DB Password' },
            { field: 'password', id: 'item0000000000000000000003', title: 'db-password' },
        ]).map((binding) => binding.envName);
        expect(names.sort()).toEqual(['DB_PASSWORD', 'DB_PASSWORD_2', 'DB_PASSWORD_3']);
    });
});

describe('renderSecretsSchema', () => {
    const schema = renderSecretsSchema(
        secretBindings(vaultId, [{ ...apiKey, title: '@sensitive=false' }])
    );

    test('keeps the token internal and carries no titles in comments', () => {
        expect(schema).toContain(
            '# @type=opServiceAccountToken @sensitive @internal\nHAUS_OP_TOKEN=\n'
        );
        expect(schema).toContain(
            `SENSITIVE_FALSE=op("op://${vaultId}/item0000000000000000000001/credential")`
        );
        expect(schema).not.toContain('@sensitive=false');
    });

    test('resolves through the 1Password SDK, never the op CLI or desktop app', () => {
        expect(schema).toContain(`# @plugin(${secretsRuntimePlugin})`);
        expect(schema).toContain('# @initOp(token=$HAUS_OP_TOKEN, allowAppAuth=false)');
        // The plugin switches to the `op` binary only when this flag is set.
        expect(schema).not.toContain('useCliWithServiceAccount');
    });
});

describe('renderSecretsWrapper', () => {
    const wrapper = renderSecretsWrapper({
        account: 'srv_1',
        bindings: secretBindings(vaultId, [apiKey]),
        keychainPath: "/Users/o'neil/Library/Keychains/login.keychain-db",
        schemaDir: '/data/servers/srv_1/secrets/schema',
        service: 'haus.computer.1password',
        varlockPath: '/data/servers/srv_1/secrets/node_modules/.bin/varlock',
    });

    test('reads the token from the explicit keychain and exports it only to varlock', () => {
        expect(wrapper).toContain(`-w '/Users/o'"'"'neil/Library/Keychains/login.keychain-db'`);
        expect(wrapper).toContain('export HAUS_OP_TOKEN="$token" VARLOCK_TELEMETRY_DISABLED=1');
        expect(wrapper).toContain(
            `exec '/data/servers/srv_1/secrets/node_modules/.bin/varlock' run --path '/data/servers/srv_1/secrets/schema/' --inject vars "$@"`
        );
    });

    test.each([
        [44, 'has no 1Password connection'],
        [36, "this Computer's Keychain is locked"],
    ])('security exit %i fails with a clear message', async (exitCode, message) => {
        const dir = await mkdtemp(join(tmpdir(), 'haus-secrets-wrapper-'));
        try {
            const security = join(dir, 'security');
            await writeFile(security, `#!/bin/sh\nexit ${exitCode}\n`, { mode: 0o700 });
            const script = join(dir, 'haus-secrets');
            await writeFile(
                script,
                renderSecretsWrapper({
                    account: 'srv_1',
                    bindings: [],
                    keychainPath: join(dir, 'login.keychain-db'),
                    schemaDir: dir,
                    securityPath: security,
                    service: 'haus.computer.1password',
                    varlockPath: join(dir, 'varlock-never-runs'),
                }),
                { mode: 0o700 }
            );
            const child = Bun.spawn([script, '--', 'true'], { stderr: 'pipe', stdout: 'ignore' });
            const [stderr, code] = await Promise.all([
                new Response(child.stderr).text(),
                child.exited,
            ]);
            expect(code).toBe(78);
            expect(stderr).toContain(message);
        } finally {
            await rm(dir, { force: true, recursive: true });
        }
    });

    test('lists names without touching the keychain', () => {
        const listing = wrapper.indexOf('--list');
        expect(listing).toBeGreaterThan(-1);
        expect(listing).toBeLessThan(wrapper.indexOf('find-generic-password'));
        expect(wrapper).toContain("printf '%s\\n' 'DUMMY_API_KEY'");
    });
});
