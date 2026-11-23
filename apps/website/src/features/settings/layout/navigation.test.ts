import assert from 'node:assert/strict';
import test from 'node:test';
import { settingsNavGroups, settingsNavItems, settingsPageLabel } from './navigation.ts';

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
        {
            label: 'You',
            rows: ['Profile', 'Preferences', 'Appearance', 'Notifications', 'Shortcuts', 'Servers'],
        },
        { label: 'Captains', rows: ['Models', 'Git', 'Skills', 'Connections'] },
        {
            label: 'Haus',
            rows: [
                'General',
                'Members',
                'Projects',
                'Repositories',
                'Devices',
                'Usage',
                'Archived chats',
            ],
        },
    ]);
});

test('Devices is an operator page, so members never see it', () => {
    assert.deepEqual(railShape({ canOperate: false, query: '' }).at(-1), {
        label: 'Haus',
        rows: ['General', 'Members', 'Projects', 'Repositories', 'Usage', 'Archived chats'],
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
    assert.deepEqual(railShape({ canOperate: true, query: 'runtimes' }), []);
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

test('search finds a shortcut by its command and the test notification by name', () => {
    assert.deepEqual(railShape({ canOperate: true, query: 'zoom' }), [
        { label: 'You', rows: ['Shortcuts · Zoom in'] },
    ]);
    assert.deepEqual(railShape({ canOperate: true, query: 'test notification' }), [
        { label: 'You', rows: ['Notifications · Test notification'] },
    ]);
});

test('search finds Projects and Repositories by name', () => {
    assert.deepEqual(railShape({ canOperate: false, query: 'proj' }), [
        { label: 'Haus', rows: ['Projects'] },
    ]);
    assert.deepEqual(railShape({ canOperate: false, query: 'reposit' }), [
        { label: 'Haus', rows: ['Repositories'] },
    ]);
});

test('search does not reveal operator pages to members', () => {
    assert.deepEqual(railShape({ canOperate: false, query: '1password' }), []);
    assert.deepEqual(railShape({ canOperate: true, query: '1password' }), [
        { label: 'Haus', rows: ['Devices · 1Password'] },
    ]);
});

test('search finds the Background rows under Appearance', () => {
    assert.deepEqual(railShape({ canOperate: true, query: 'blur' }), [
        { label: 'You', rows: ['Appearance · Blur'] },
    ]);
    assert.deepEqual(railShape({ canOperate: true, query: 'background' }), [
        { label: 'You', rows: ['Appearance · Background'] },
    ]);
});

test('a page names its window and tab; anything else falls back to Settings', () => {
    assert.equal(settingsPageLabel('archived'), 'Archived chats');
    assert.equal(settingsPageLabel('computers'), 'Devices');
    assert.equal(settingsPageLabel('projects'), 'Projects');
    assert.equal(settingsPageLabel('repos'), 'Repositories');
    assert.equal(settingsPageLabel('retired'), undefined);
    assert.equal(settingsPageLabel(undefined), undefined);
});
