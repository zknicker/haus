'use strict';

const { describe, expect, test } = require('bun:test');
const {
    createServiceAccount,
    filterVaults,
    listItems,
    listVaults,
    toSecretItems,
} = require('./onepassword.cjs');

const vault = (id, name) => ({ id, name });
const agents = vault('zzzzzzzzzzzzzzzzzzzzzzzzz7', 'Agents');
const itemList = [
    { category: 'API_CREDENTIAL', id: 'item0000000000000000000001', title: 'Dummy API Key' },
    { category: 'LOGIN', id: 'item0000000000000000000002', title: 'GitHub' },
    { category: 'SECURE_NOTE', id: 'item0000000000000000000003', title: 'Notes' },
    { category: 'PASSWORD', id: 'NOT-AN-ID', title: 'Bad id' },
];
const expectedItems = [
    { field: 'credential', id: 'item0000000000000000000001', title: 'Dummy API Key' },
    { field: 'password', id: 'item0000000000000000000002', title: 'GitHub' },
];

describe('filterVaults', () => {
    test('drops vaults a service account cannot be granted and sorts by name', () => {
        expect(
            filterVaults([
                vault('zzzzzzzzzzzzzzzzzzzzzzzzz1', 'Shared'),
                vault('zzzzzzzzzzzzzzzzzzzzzzzzz2', 'Private'),
                vault('zzzzzzzzzzzzzzzzzzzzzzzzz3', 'Employee'),
                vault('zzzzzzzzzzzzzzzzzzzzzzzzz4', 'personal'),
                vault('zzzzzzzzzzzzzzzzzzzzzzzzz5', 'Infra: prod'),
                vault('NOT AN ID', 'Bad id'),
                vault('zzzzzzzzzzzzzzzzzzzzzzzzz6', 'Haus Prototype'),
                agents,
            ])
        ).toEqual([agents, vault('zzzzzzzzzzzzzzzzzzzzzzzzz6', 'Haus Prototype')]);
    });
});

describe('toSecretItems', () => {
    test('keeps supported categories as ids, titles, and the field to inject', () => {
        expect(toSecretItems(itemList)).toEqual(expectedItems);
    });

    test('drops entries without an id instead of matching the string "undefined"', () => {
        expect(toSecretItems([{ category: 'PASSWORD', title: 'No id' }])).toEqual([]);
        expect(filterVaults([{ name: 'Agents' }])).toEqual([]);
    });
});

describe('listVaults', () => {
    test('uses the first signed-in account', async () => {
        const calls = [];
        const result = await listVaults((args) => {
            calls.push(args);
            return Promise.resolve(
                args[0] === 'account'
                    ? JSON.stringify([{ url: 'example.1password.com' }])
                    : JSON.stringify([agents])
            );
        });
        expect(result).toEqual({
            account: 'example.1password.com',
            status: 'ok',
            vaults: [agents],
        });
        expect(calls[1]).toEqual([
            'vault',
            'list',
            '--account',
            'example.1password.com',
            '--format',
            'json',
        ]);
    });

    test('explains a missing CLI and a disabled desktop integration', async () => {
        expect(
            await listVaults(() =>
                Promise.reject(Object.assign(new Error('x'), { code: 'ENOENT' }))
            )
        ).toMatchObject({ reason: 'op-missing', status: 'unavailable' });
        expect(
            await listVaults(() =>
                Promise.reject(
                    Object.assign(new Error('x'), {
                        stderr: '[ERROR] error initializing client: connecting to desktop app: ...',
                    })
                )
            )
        ).toMatchObject({ reason: 'integration-off', status: 'unavailable' });
    });
});

describe('listItems', () => {
    test('lists one vault by id in the chosen account', async () => {
        let args = [];
        const result = await listItems(
            (received) => {
                args = received;
                return Promise.resolve(JSON.stringify(itemList));
            },
            { account: 'example.1password.com', vaultId: agents.id }
        );
        expect(result).toEqual({ items: expectedItems, status: 'ok' });
        expect(args).toEqual([
            'item',
            'list',
            '--vault',
            agents.id,
            '--account',
            'example.1password.com',
            '--format',
            'json',
        ]);
    });

    test('refuses a malformed vault id without running op', async () => {
        let ran = false;
        const result = await listItems(
            () => {
                ran = true;
                return Promise.resolve('[]');
            },
            { account: 'example.1password.com', vaultId: '--vault' }
        );
        expect(result).toMatchObject({ reason: 'invalid-request' });
        expect(ran).toBe(false);
    });
});

describe('createServiceAccount', () => {
    const request = {
        account: 'example.1password.com',
        computerName: "Zach's MacBook <Pro>",
        vault: agents,
    };
    const token = `ops_${'x'.repeat(40)}`;

    test('lists items first, then grants read_items on exactly the chosen vault', async () => {
        const calls = [];
        const result = await createServiceAccount((received) => {
            calls.push(received);
            return Promise.resolve(
                received[0] === 'item' ? JSON.stringify(itemList) : `${token}\n`
            );
        }, request);
        expect(result).toMatchObject({ items: expectedItems, status: 'ok', token });
        expect(result.serviceAccountName).toMatch(
            /^Haus Computer Zachs MacBook Pro \d{4}-\d{2}-\d{2}$/
        );
        expect(calls.map((args) => args[0])).toEqual(['item', 'service-account']);
        expect(calls[1][2]).toBe(result.serviceAccountName);
        expect(calls[1].slice(3)).toEqual([
            '--account',
            'example.1password.com',
            '--vault',
            'Agents:read_items',
            '--raw',
        ]);
    });

    test('a failed item listing creates no service account', async () => {
        const calls = [];
        const result = await createServiceAccount((received) => {
            calls.push(received);
            return Promise.reject(Object.assign(new Error('x'), { stderr: 'dismissed' }));
        }, request);
        expect(result).toMatchObject({ reason: 'denied', status: 'unavailable' });
        expect(calls).toHaveLength(1);
    });

    test('refuses vaults it cannot grant without running op', async () => {
        let ran = false;
        const run = () => {
            ran = true;
            return Promise.resolve('');
        };
        for (const name of ['Private', 'a:b', 'a,b', '']) {
            expect(
                await createServiceAccount(run, { ...request, vault: { ...agents, name } })
            ).toMatchObject({ reason: 'invalid-request' });
        }
        expect(ran).toBe(false);
    });

    test('never returns non-token output', async () => {
        expect(
            await createServiceAccount(
                (args) => Promise.resolve(args[0] === 'item' ? '[]' : 'Service account created'),
                request
            )
        ).toMatchObject({ reason: 'unexpected-output', status: 'unavailable' });
    });
});
