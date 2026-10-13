import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComputerSecretsOperation, ComputerSecretsStatus, OnePasswordItem } from '@haus/api';
import type { SecretsKeychain } from './keychain.ts';
import { secretsVarlockBin } from './runtime.ts';
import {
    connectSecrets,
    disconnectSecrets,
    readSecretsStatus,
    refreshSecretItems,
    type SecretsHost,
    secretsPaths,
} from './store.ts';

const token = `ops_${'a'.repeat(40)}`;
const vault = { id: 'vaultid0000000000000000001', name: 'Agents' };
const apiKey: OnePasswordItem = {
    field: 'credential',
    id: 'item0000000000000000000001',
    title: 'Dummy API Key',
};
const connect: Extract<ComputerSecretsOperation, { kind: 'connect' }> = {
    account: 'my.1password.com',
    items: [apiKey],
    kind: 'connect',
    serviceAccountName: 'Haus Computer Mac mini 2026-10-13',
    token,
    vault,
};
const notConnected: ComputerSecretsStatus = { connected: false, provider: '1password' };

let dataRoot: string;
let stored: Map<string, string>;
let installs: number;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-secrets-'));
    stored = new Map();
    installs = 0;
});

afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

function host(overrides: Partial<SecretsHost> = {}): SecretsHost {
    const keychain: SecretsKeychain = {
        delete: async (account) => {
            stored.delete(account);
        },
        path: '/tmp/test.keychain-db',
        read: async (account) => stored.get(account) ?? null,
        write: async (account, value) => {
            stored.set(account, value);
        },
    };
    return {
        dataRoot,
        installRuntime: async (root) => {
            installs += 1;
            await mkdir(join(root, 'node_modules', '.bin'), { recursive: true });
            await writeFile(secretsVarlockBin(root), '#!/bin/sh\n');
        },
        keychain,
        serverId: 'srv_1',
        ...overrides,
    };
}

describe('Computer Secrets store', () => {
    test('reports not connected before any connect', async () => {
        expect(await readSecretsStatus(host())).toEqual(notConnected);
    });

    test('connect keeps the token in the keychain only and reports names', async () => {
        const status = await connectSecrets(host(), connect);
        expect(status).toMatchObject({
            account: 'my.1password.com',
            connected: true,
            issue: null,
            items: [{ envName: 'DUMMY_API_KEY', title: 'Dummy API Key' }],
            serviceAccountName: 'Haus Computer Mac mini 2026-10-13',
            vault,
        });
        expect(stored.get('srv_1')).toBe(token);

        const paths = secretsPaths(dataRoot, 'srv_1');
        for (const file of [paths.state, paths.wrapper, join(paths.schemaDir, '.env.schema')]) {
            expect(await readFile(file, 'utf8')).not.toContain(token);
        }
        expect(await readFile(paths.wrapper, 'utf8')).toContain(secretsVarlockBin(paths.root));
        expect((await stat(paths.wrapper)).mode & 0o777).toBe(0o700);
        expect(JSON.stringify(status)).not.toContain(token);
    });

    test('a Computer that cannot install the runtime stores nothing', async () => {
        const failing = host({
            installRuntime: () => Promise.reject(new Error('Could not install Varlock')),
        });
        await expect(connectSecrets(failing, connect)).rejects.toThrow('install Varlock');
        expect(stored.size).toBe(0);
        expect(await readSecretsStatus(host())).toEqual(notConnected);
    });

    test('flags a missing runtime instead of claiming readiness', async () => {
        await connectSecrets(host(), connect);
        await rm(join(secretsPaths(dataRoot, 'srv_1').root, 'node_modules'), {
            recursive: true,
        });
        expect(await readSecretsStatus(host())).toMatchObject({
            connected: true,
            issue: 'runtime-missing',
        });
    });

    test('refresh replaces the items, keeps the token, and reinstalls a missing runtime', async () => {
        await connectSecrets(host(), connect);
        const status = await refreshSecretItems(host(), {
            items: [apiKey, { field: 'password', id: 'item0000000000000000000002', title: 'npm' }],
            kind: 'refresh-items',
            vaultId: vault.id,
        });
        expect(status).toMatchObject({
            connected: true,
            items: [
                { envName: 'DUMMY_API_KEY', title: 'Dummy API Key' },
                { envName: 'NPM', title: 'npm' },
            ],
            serviceAccountName: connect.serviceAccountName,
        });
        expect(installs).toBe(2);
        expect(stored.get('srv_1')).toBe(token);
        const schema = await readFile(
            join(secretsPaths(dataRoot, 'srv_1').schemaDir, '.env.schema'),
            'utf8'
        );
        expect(schema).toContain(`NPM=op("op://${vault.id}/item0000000000000000000002/password")`);
    });

    test('refresh refuses another vault and a Computer with no connection', async () => {
        const refresh: Extract<ComputerSecretsOperation, { kind: 'refresh-items' }> = {
            items: [],
            kind: 'refresh-items',
            vaultId: vault.id,
        };
        await expect(refreshSecretItems(host(), refresh)).rejects.toThrow('not connected');
        await connectSecrets(host(), connect);
        await expect(
            refreshSecretItems(host(), { ...refresh, vaultId: 'othervault0000000000000001' })
        ).rejects.toThrow('not the one connected');
    });

    test('disconnect forgets the token and the generated files', async () => {
        await connectSecrets(host(), connect);
        expect(await disconnectSecrets(host())).toEqual(notConnected);
        expect(stored.size).toBe(0);
        await expect(stat(secretsPaths(dataRoot, 'srv_1').root)).rejects.toThrow();
    });
});
