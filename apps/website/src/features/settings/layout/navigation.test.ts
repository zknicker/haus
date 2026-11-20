import assert from 'node:assert/strict';
import test from 'node:test';
import { settingsNavGroups, settingsNavItems, settingsPages } from './navigation.ts';

function railShape(input: { canOperate: boolean; query: string }) {
    return settingsNavGroups(input).map((group) => ({
        label: group.label,
        rows: group.matches.map((match) =>
            match.row ? `${match.item.label} · ${match.row}` : match.item.label
        ),
    }));
}

test('the rail groups pages by whose settings they are', () => {
    assert.deepEqual(railShape({ canOperate: true, query: '' }), [
        { label: 'You', rows: ['Profile', 'Preferences', 'Appearance', 'Servers'] },
        { label: 'Captains', rows: ['Models', 'Skills', 'Connections'] },
        { label: 'Haus', rows: ['General', 'Members', 'Devices', 'Usage', 'Archived chats'] },
    ]);
});

test('Devices is an operator page, so members never see it', () => {
    assert.deepEqual(railShape({ canOperate: false, query: '' }).at(-1), {
        label: 'Haus',
        rows: ['General', 'Members', 'Usage', 'Archived chats'],
    });
});

test('every registered item sits in exactly one rail group', () => {
    const grouped = settingsNavGroups({ canOperate: true, query: '' })
        .flatMap((group) => group.matches.map((match) => match.item.id))
        .sort();
    assert.deepEqual(grouped, settingsNavItems.map((item) => item.id).sort());
});

test('search matches page titles, case-insensitively', () => {
    assert.deepEqual(railShape({ canOperate: true, query: '  MEM ' }), [
        { label: 'Haus', rows: ['Members'] },
    ]);
});

test('search matches at the start of a word, not inside one', () => {
    assert.deepEqual(railShape({ canOperate: true, query: 'time' }), [
        { label: 'You', rows: ['Profile · Timezone'] },
    ]);
    assert.deepEqual(railShape({ canOperate: true, query: 'runtimes' }), [
        { label: 'Captains', rows: ['Models · Detected runtimes'] },
        { label: 'Haus', rows: ['Devices · Runtimes'] },
    ]);
    assert.deepEqual(railShape({ canOperate: true, query: 'ember' }), []);
});

test('search finds a page by a row on it and names the row', () => {
    assert.deepEqual(railShape({ canOperate: true, query: 'timezone' }), [
        { label: 'You', rows: ['Profile · Timezone'] },
    ]);
    assert.deepEqual(railShape({ canOperate: true, query: 'server id' }), [
        { label: 'Haus', rows: ['General · Server ID'] },
    ]);
    assert.deepEqual(railShape({ canOperate: false, query: 'chatgpt' }), [
        { label: 'Captains', rows: ['Models · ChatGPT plan'] },
    ]);
});

test('search does not reveal operator pages to members', () => {
    assert.deepEqual(railShape({ canOperate: false, query: '1password' }), []);
    assert.deepEqual(railShape({ canOperate: true, query: '1password' }), [
        { label: 'Haus', rows: ['Devices · 1Password'] },
    ]);
});

test('the command palette lists pages, never link-outs', () => {
    const ids: string[] = settingsPages.map((item) => item.id);
    assert.ok(ids.includes('usage'));
    assert.ok(!ids.includes('archived'));
});
