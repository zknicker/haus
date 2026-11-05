'use strict';

const { describe, expect, test } = require('bun:test');
const {
    createServiceAccount,
    filterVaults,
    listItems,
    listVaults,
    toSecondaryFields,
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

/** `op item get` fields for `Dummy API Key`: a username worth keeping, and three to drop. */
const dummyApiKeyFields = [
    { id: 'credential', label: 'credential', type: 'CONCEALED', value: 'secret-value' },
    { id: 'username', label: 'username', type: 'STRING', value: 'alice' },
    { id: 'empty', label: 'Empty', type: 'STRING', value: '' },
    { id: 'expiry', label: 'Expiry', type: 'MENU', value: 'monthly' },
    {
        id: 'notesPlain',
        label: 'notesPlain',
        purpose: 'NOTES',
        type: 'STRING',
        value: 'some notes',
    },
];

function itemGetRun({ onGitHubGet } = {}) {
    return (args) => {
        if (args[1] === 'list') {
            return Promise.resolve(JSON.stringify(itemList));
        }
        if (args[1] === 'get' && args[2] === 'item0000000000000000000001') {
            return Promise.resolve(JSON.stringify({ fields: dummyApiKeyFields }));
        }
        if (args[1] === 'get' && args[2] === 'item0000000000000000000002') {
            return onGitHubGet ? onGitHubGet() : Promise.resolve(JSON.stringify({ fields: [] }));
        }
        return Promise.resolve('{}');
    };
}

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

describe('toSecondaryFields', () => {
    test('keeps CONCEALED and STRING fields with a value, dropping the primary field', () => {
        expect(
            toSecondaryFields('item0000000000000000000001', 'credential', dummyApiKeyFields)
        ).toEqual([
            { fieldId: 'username', itemId: 'item0000000000000000000001', label: 'username' },
        ]);
    });

    test('drops an empty value, an excluded type, and a NOTES-purpose field even when it is STRING', () => {
        expect(
            toSecondaryFields('item0000000000000000000001', 'credential', [
                { id: 'empty', label: 'Empty', type: 'STRING', value: '' },
                { id: 'expiry', label: 'Expiry', type: 'MENU', value: 'monthly' },
                {
                    id: 'notesPlain',
                    label: 'notesPlain',
                    purpose: 'NOTES',
                    type: 'STRING',
                    value: 'some notes',
                },
            ])
        ).toEqual([]);
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
        const calls = [];
        const result = await listItems(
            (received) => {
                calls.push(received);
                return Promise.resolve(JSON.stringify(itemList));
            },
            { account: 'example.1password.com', vaultId: agents.id }
        );
        expect(result).toEqual({ items: expectedItems, secondaryFields: [], status: 'ok' });
        expect(calls[0]).toEqual([
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

    test('enriches items with secondary fields from `op item get`, dropping unusable ones', async () => {
        const result = await listItems(itemGetRun(), {
            account: 'example.1password.com',
            vaultId: agents.id,
        });
        expect(result).toEqual({
            items: expectedItems,
            secondaryFields: [
                { fieldId: 'username', itemId: 'item0000000000000000000001', label: 'username' },
            ],
            status: 'ok',
        });
    });

    test('a failed `op item get` for one item drops only that item’s secondary fields', async () => {
        const result = await listItems(
            itemGetRun({ onGitHubGet: () => Promise.reject(new Error('op item get failed')) }),
            { account: 'example.1password.com', vaultId: agents.id }
        );
        expect(result).toEqual({
            items: expectedItems,
            secondaryFields: [
                { fieldId: 'username', itemId: 'item0000000000000000000001', label: 'username' },
            ],
            status: 'ok',
        });
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
        expect(result).toMatchObject({
            items: expectedItems,
            secondaryFields: [],
            status: 'ok',
            token,
        });
        expect(result.serviceAccountName).toMatch(
            /^Haus Computer Zachs MacBook Pro \d{4}-\d{2}-\d{2}$/
        );
        // One `item list` plus one `item get` per listed item, then the service account.
        expect(calls.map((args) => args[0])).toEqual(['item', 'item', 'item', 'service-account']);
        const serviceAccountCall = calls.at(-1);
        expect(serviceAccountCall[2]).toBe(result.serviceAccountName);
        expect(serviceAccountCall.slice(3)).toEqual([
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
