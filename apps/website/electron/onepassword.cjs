'use strict';

const { appWindowOf } = require('./trusted-renderer.cjs');
const { describeOpFailure, parseJsonArray, runOp, unavailable } = require('./onepassword-cli.cjs');

/**
 * Connect 1Password (Computer Secrets). Desktop main runs the local `op` CLI
 * under desktop-app auth, so the Computer never needs it: main lists vaults,
 * lists the chosen vault's items (ids, titles, and the field to inject; never
 * values), and creates one read-only service account. The renderer relays the
 * token once, with the item list, straight to Server.
 */

/** Vaults a service account can never be granted (1Password's built-in personal and shared vaults). */
const excludedVaultNames = new Set(['employee', 'personal', 'private', 'shared']);

/** The one field Haus injects per supported item category; other categories are skipped. */
const categoryFields = { API_CREDENTIAL: 'credential', LOGIN: 'password', PASSWORD: 'password' };

/** `RegExp.test` would coerce `undefined` to a matching "undefined", so check the type first. */
const isOpId = (value) => typeof value === 'string' && /^[a-z0-9]{8,64}$/.test(value);
const maxItems = 200;

function registerOnePassword({ appUrl, BrowserWindow, ipcMain, run = runOp }) {
    const assertAppWindow = (event) =>
        appWindowOf(event, {
            appUrl,
            BrowserWindow,
            message: 'Only a Haus window can connect 1Password.',
        });

    ipcMain.handle('desktop:1password:vaults', (event) => {
        assertAppWindow(event);
        return listVaults(run);
    });
    ipcMain.handle('desktop:1password:items', (event, request) => {
        assertAppWindow(event);
        return listItems(run, request);
    });
    ipcMain.handle('desktop:1password:create-service-account', (event, request) => {
        assertAppWindow(event);
        return createServiceAccount(run, request);
    });
}

/** Resolves to `{ status: 'ok', account, vaults }` or an `unavailable` reply. */
async function listVaults(run) {
    try {
        const accounts = parseJsonArray(await run(['account', 'list', '--format', 'json']));
        const account = accounts.find((candidate) => typeof candidate?.url === 'string')?.url;
        if (!account) {
            return unavailable('no-account', 'Sign in to the 1Password app, then try again.');
        }
        const vaults = filterVaults(
            parseJsonArray(await run(['vault', 'list', '--account', account, '--format', 'json']))
        );
        return { account, status: 'ok', vaults };
    } catch (error) {
        return describeOpFailure(error);
    }
}

/** Resolves to `{ status: 'ok', items }` for one vault, as its owner sees it. */
async function listItems(run, request) {
    const account = typeof request?.account === 'string' ? request.account : '';
    const vaultId = typeof request?.vaultId === 'string' ? request.vaultId : '';
    if (!(isAccount(account) && isOpId(vaultId))) {
        return unavailable('invalid-request', 'Choose a vault again.');
    }
    try {
        return { items: await readItems(run, account, vaultId), status: 'ok' };
    } catch (error) {
        return describeOpFailure(error);
    }
}

/**
 * Lists the vault's items, then creates a read-only service account for it.
 * Each call creates a real service account in the owner's 1Password account;
 * only the owner's explicit Connect reaches here. Listing first means a
 * failure before creation leaves nothing to revoke.
 */
async function createServiceAccount(run, request) {
    const account = typeof request?.account === 'string' ? request.account : '';
    const vault = request?.vault;
    if (!(isAccount(account) && isOpId(vault?.id) && isGrantableVaultName(vault?.name))) {
        return unavailable('invalid-request', 'Choose a vault again.');
    }
    const name = serviceAccountName(request?.computerName);
    try {
        const items = await readItems(run, account, vault.id);
        const token = (
            await run([
                'service-account',
                'create',
                name,
                '--account',
                account,
                '--vault',
                `${vault.name}:read_items`,
                '--raw',
            ])
        ).trim();
        if (!/^ops_[A-Za-z0-9+/=_-]{20,}$/.test(token)) {
            return unavailable(
                'unexpected-output',
                '1Password did not return a service account token.'
            );
        }
        return { items, serviceAccountName: name, status: 'ok', token };
    } catch (error) {
        return describeOpFailure(error);
    }
}

async function readItems(run, account, vaultId) {
    return toSecretItems(
        parseJsonArray(
            await run([
                'item',
                'list',
                '--vault',
                vaultId,
                '--account',
                account,
                '--format',
                'json',
            ])
        )
    );
}

/** Keeps supported categories as `{ id, title, field }`; drops everything else, values included. */
function toSecretItems(entries) {
    return entries
        .flatMap((entry) => {
            const field = categoryFields[entry?.category];
            const title = typeof entry?.title === 'string' ? entry.title.trim().slice(0, 200) : '';
            return field && isOpId(entry?.id) && title ? [{ field, id: entry.id, title }] : [];
        })
        .slice(0, maxItems);
}

function filterVaults(vaults) {
    return vaults
        .filter((vault) => isOpId(vault?.id) && isGrantableVaultName(vault?.name))
        .map((vault) => ({ id: vault.id, name: vault.name.trim() }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function isAccount(value) {
    return /^[a-z0-9.-]{1,253}$/i.test(value);
}

function isGrantableVaultName(name) {
    return (
        typeof name === 'string' &&
        name.trim().length > 0 &&
        name.length <= 200 &&
        // `--vault name:permissions` cannot express these characters.
        /^[^:,\n]+$/.test(name) &&
        !excludedVaultNames.has(name.trim().toLowerCase())
    );
}

function serviceAccountName(computerName) {
    const label =
        typeof computerName === 'string'
            ? computerName
                  .replaceAll(/[^A-Za-z0-9 ._-]/g, '')
                  .trim()
                  .slice(0, 60)
            : '';
    const date = new Date().toISOString().slice(0, 10);
    return `Haus Computer ${label || 'Secrets'} ${date}`;
}

module.exports = {
    createServiceAccount,
    filterVaults,
    listItems,
    listVaults,
    registerOnePassword,
    serviceAccountName,
    toSecretItems,
};
