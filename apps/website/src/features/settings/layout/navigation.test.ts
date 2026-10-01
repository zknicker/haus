import assert from 'node:assert/strict';
import test from 'node:test';
import {
    settingsNavItems,
    settingsNavLinkIds,
    settingsNavSections,
    staticSettingsNavItems,
} from './navigation.ts';

test('settings navigation uses current agent configuration vocabulary', () => {
    const labels: string[] = settingsNavItems.map((item) => item.label);
    assert.ok(!labels.includes('Memory'));
    assert.ok(!labels.includes('Tools'));
    assert.ok(!labels.includes('Channels'));
    assert.ok(!labels.includes('MCP'));
    assert.ok(!labels.includes('Agent'));
    assert.ok(!labels.includes('NOTES.md'));
    assert.ok(!labels.includes('SOUL.md'));
    assert.ok(!labels.includes('Toolsets'));
    assert.ok(!labels.includes('Connectors'));
    assert.ok(!labels.includes('McpServers'));
});

test('settings navigation exposes Server administration', () => {
    assert.ok(settingsNavItems.some((item) => item.id === 'server' && item.label === 'Server'));
    assert.ok(settingsNavItems.some((item) => item.id === 'members' && item.label === 'Members'));
});

test('switching, creating, and joining Servers live in Settings', () => {
    assert.ok(settingsNavItems.some((item) => item.id === 'servers' && item.label === 'Servers'));
    const personal = settingsNavSections.find((section) => section.id === 'personal');
    // Which Servers you belong to is about you, not about this Server.
    assert.ok((personal?.itemIds as readonly string[]).includes('servers'));
});

/**
 * Sections group by who a setting belongs to. A section that mixed subjects is
 * what this replaced, so the grouping itself is the contract — not just the
 * item list.
 */
test('settings navigation groups by subject, and every item belongs to one', () => {
    const sectionIds: string[] = settingsNavSections.map((section) => section.id);
    assert.deepEqual(sectionIds, ['personal', 'server']);

    const grouped: string[] = settingsNavSections
        .flatMap((section) => section.itemIds as readonly string[])
        .slice()
        .sort();
    const all: string[] = settingsNavItems.map((item) => item.id).sort();
    assert.deepEqual(grouped, all);
});

test('device and Server settings are not filed together', () => {
    const itemIds = (id: string): string[] => {
        const section = settingsNavSections.find((candidate) => candidate.id === id);
        return [...((section?.itemIds ?? []) as readonly string[])].sort();
    };
    const account = itemIds('personal');
    assert.ok(account.includes('preferences'));
    assert.ok(!account.includes('server'));
    assert.deepEqual(itemIds('server'), [
        'archived',
        'connections',
        'members',
        'models',
        'server',
        'skills',
        'usage',
    ]);
    assert.ok(!settingsNavItems.some((item) => (item.id as string) === 'browser'));
});

/**
 * Usage renders inside Settings so the rail stays while you read it. Archived
 * chats is a chat list with its own standalone route; the rail only links out.
 */
test('Usage is a settings page and Archived chats is a link-out', () => {
    assert.deepEqual([...settingsNavLinkIds], ['archived']);
    const staticIds: string[] = staticSettingsNavItems.map((item) => item.id);
    assert.ok(staticIds.includes('usage'));
    assert.ok(!staticIds.includes('archived'));
    // The dashboard never came back as a settings section under its old name.
    const ids: string[] = settingsNavItems.map((item) => item.id);
    assert.ok(!ids.includes('stats'));
});
