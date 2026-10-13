import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type ComputerSecretsOperation,
    type ComputerSecretsStatus,
    computerSecretItemSchema,
    onePasswordAccountSchema,
    onePasswordServiceAccountNameSchema,
    onePasswordVaultSchema,
} from '@haus/api';
import { z } from 'zod';
import { type SecretsKeychain, secretsKeychainService } from './keychain.ts';
import { renderSecretsSchema, renderSecretsWrapper, secretBindings } from './render.ts';
import { isSecretsRuntimeInstalled, secretsVarlockBin } from './runtime.ts';

/** Everything Computer Secrets touches outside its own directory, injectable for tests. */
export interface SecretsHost {
    dataRoot: string;
    installRuntime(root: string): Promise<void>;
    keychain: SecretsKeychain;
    serverId: string;
}

type ConnectOperation = Extract<ComputerSecretsOperation, { kind: 'connect' }>;
type RefreshOperation = Extract<ComputerSecretsOperation, { kind: 'refresh-items' }>;

const timestampSchema = z.iso.datetime({ offset: true });
const stateSchema = z
    .object({
        account: onePasswordAccountSchema,
        connectedAt: timestampSchema,
        items: z.array(computerSecretItemSchema).max(200),
        itemsRefreshedAt: timestampSchema,
        serviceAccountName: onePasswordServiceAccountNameSchema,
        vault: onePasswordVaultSchema,
    })
    .strict();
type SecretsState = z.infer<typeof stateSchema>;

/**
 * One attachment's Computer Secrets files. Scoped per Server so one Server's
 * Owner can never grant another Server's Agents a vault on a shared machine.
 * The root doubles as the Varlock install, so the schema finds its plugin in
 * `node_modules` one directory up.
 */
export function secretsPaths(dataRoot: string, serverId: string) {
    const root = join(dataRoot, 'servers', serverId, 'secrets');
    return {
        binDir: join(root, 'bin'),
        root,
        schemaDir: join(root, 'schema'),
        state: join(root, 'state.json'),
        wrapper: join(root, 'bin', 'haus-secrets'),
    };
}

export async function readSecretsStatus(
    host: Pick<SecretsHost, 'dataRoot' | 'serverId'>
): Promise<ComputerSecretsStatus> {
    const paths = secretsPaths(host.dataRoot, host.serverId);
    const state = await readState(paths.state);
    if (!state) {
        return { connected: false, provider: '1password' };
    }
    return {
        ...state,
        connected: true,
        issue: isSecretsRuntimeInstalled(paths.root) ? null : 'runtime-missing',
        provider: '1password',
    };
}

/**
 * Connects one vault from the item list the desktop App sent. Installs the
 * pinned Varlock runtime first, so a Computer that cannot run it stores
 * nothing; then keeps the token in the Keychain and writes the schema, the
 * `haus-secrets` wrapper, and the state. Reconnecting replaces all of them.
 */
export async function connectSecrets(
    host: SecretsHost,
    operation: ConnectOperation
): Promise<ComputerSecretsStatus> {
    const paths = secretsPaths(host.dataRoot, host.serverId);
    await host.installRuntime(paths.root);
    await host.keychain.write(host.serverId, operation.token);
    const now = new Date().toISOString();
    try {
        await writeConnection(host, operation.items, {
            account: operation.account,
            connectedAt: now,
            items: [],
            itemsRefreshedAt: now,
            serviceAccountName: operation.serviceAccountName,
            vault: operation.vault,
        });
    } catch (error) {
        // Without state the Computer reports "not connected", so no token may outlive it.
        await host.keychain.delete(host.serverId);
        await rm(paths.state, { force: true });
        throw error;
    }
    return readSecretsStatus(host);
}

/**
 * Replaces the item list for the connected vault (a new item was added or one
 * renamed). The token and service account stay as they are. Also reinstalls
 * the runtime when it went missing.
 */
export async function refreshSecretItems(
    host: SecretsHost,
    operation: RefreshOperation
): Promise<ComputerSecretsStatus> {
    const paths = secretsPaths(host.dataRoot, host.serverId);
    const state = await readState(paths.state);
    if (!state) {
        throw new Error('1Password is not connected on this Computer.');
    }
    if (state.vault.id !== operation.vaultId) {
        throw new Error('That vault is not the one connected on this Computer.');
    }
    await host.installRuntime(paths.root);
    await writeConnection(host, operation.items, {
        ...state,
        itemsRefreshedAt: new Date().toISOString(),
    });
    return readSecretsStatus(host);
}

/**
 * Forgets the token and every generated file. 1Password's CLI cannot delete a
 * service account, so the Owner revokes it on 1password.com by its name.
 */
export async function disconnectSecrets(host: SecretsHost): Promise<ComputerSecretsStatus> {
    await host.keychain.delete(host.serverId);
    await rm(secretsPaths(host.dataRoot, host.serverId).root, { force: true, recursive: true });
    return readSecretsStatus(host);
}

async function writeConnection(
    host: SecretsHost,
    items: ConnectOperation['items'],
    state: SecretsState
) {
    const paths = secretsPaths(host.dataRoot, host.serverId);
    const bindings = secretBindings(state.vault.id, items);
    await mkdir(paths.schemaDir, { mode: 0o700, recursive: true });
    await mkdir(paths.binDir, { mode: 0o700, recursive: true });
    await writeFile(join(paths.schemaDir, '.env.schema'), renderSecretsSchema(bindings), {
        mode: 0o600,
    });
    await writeFile(
        paths.wrapper,
        renderSecretsWrapper({
            account: host.serverId,
            bindings,
            keychainPath: host.keychain.path,
            schemaDir: paths.schemaDir,
            service: secretsKeychainService,
            varlockPath: secretsVarlockBin(paths.root),
        }),
        { mode: 0o700 }
    );
    await chmod(paths.wrapper, 0o700);
    const next: SecretsState = {
        ...state,
        items: bindings.map(({ envName, title }) => ({ envName, title })),
    };
    await writeFile(paths.state, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
}

async function readState(path: string): Promise<SecretsState | null> {
    let raw: string;
    try {
        raw = await readFile(path, 'utf8');
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    return stateSchema.parse(JSON.parse(raw));
}
