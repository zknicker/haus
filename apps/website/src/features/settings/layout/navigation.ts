import {
    AiBrain01Icon,
    Analytics01Icon,
    ArchiveIcon,
    ComputerIcon,
    Exchange01Icon,
    KeyboardIcon,
    Notification03Icon,
    PaintBoardIcon,
    Plug01Icon,
    PreferenceHorizontalIcon,
    ServerStack01Icon,
    UserCircleIcon,
    UserMultipleIcon,
    ZapIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import { shortcutRegistry } from '../../shortcuts/shortcut-registry.ts';

export const settingsNavItems = [
    {
        access: 'everyone',
        icon: UserCircleIcon,
        id: 'profile',
        kind: 'page',
        label: 'Profile',
        rows: ['Display name', 'Handle', 'Photo', 'Timezone', 'Sign out'],
    },
    {
        access: 'everyone',
        icon: PreferenceHorizontalIcon,
        id: 'preferences',
        kind: 'page',
        label: 'Preferences',
        rows: ['Window layout', 'Show claims in chat', 'Open links in'],
    },
    {
        access: 'everyone',
        icon: PaintBoardIcon,
        id: 'appearance',
        kind: 'page',
        label: 'Appearance',
        rows: ['Mode', 'Theme', 'Create theme', 'Colors', 'Snow'],
    },
    {
        access: 'everyone',
        icon: Notification03Icon,
        id: 'notifications',
        kind: 'page',
        label: 'Notifications',
        rows: ['System notifications', "Notify me when I'm needed", 'Test notification'],
    },
    {
        access: 'everyone',
        icon: KeyboardIcon,
        id: 'shortcuts',
        kind: 'page',
        label: 'Shortcuts',
        rows: ['Keyboard shortcuts', ...shortcutRegistry.map((shortcut) => shortcut.command)],
    },
    {
        access: 'everyone',
        icon: Exchange01Icon,
        id: 'servers',
        kind: 'page',
        label: 'Servers',
        rows: ['Your Servers', 'Switch Server', 'Create Server', 'Join Server'],
    },
    {
        access: 'everyone',
        icon: AiBrain01Icon,
        id: 'models',
        kind: 'page',
        label: 'Models',
        rows: ['Cloud Agents', 'Effort', 'Fast', 'Detected runtimes', 'Reported models'],
    },
    {
        access: 'everyone',
        icon: ZapIcon,
        id: 'skills',
        kind: 'page',
        label: 'Skills',
        rows: ['Skill library', 'Installed skills'],
    },
    {
        access: 'everyone',
        icon: Plug01Icon,
        id: 'connections',
        kind: 'page',
        label: 'Connections',
        rows: ['MCP', 'GitHub', 'Captain access'],
    },
    {
        access: 'operator',
        icon: ComputerIcon,
        id: 'computers',
        kind: 'page',
        label: 'Devices',
        rows: ['Add device', 'Runtimes', 'Browser', 'Secrets', '1Password', 'Updates'],
    },
    {
        access: 'everyone',
        icon: ServerStack01Icon,
        id: 'general',
        kind: 'page',
        label: 'General',
        rows: ['Name', 'Address', 'Server ID', 'Idle compaction', 'Delete Server'],
    },
    {
        access: 'everyone',
        icon: UserMultipleIcon,
        id: 'members',
        kind: 'page',
        label: 'Members',
        rows: ['Invite', 'Invitations', 'Roles', 'Remove member', 'Leave Server'],
    },
    {
        access: 'everyone',
        icon: Analytics01Icon,
        id: 'usage',
        kind: 'page',
        label: 'Usage',
        rows: ['Tokens', 'Processed', 'Cache hit rate', 'Token usage detail'],
    },
    {
        access: 'everyone',
        icon: ArchiveIcon,
        id: 'archived',
        kind: 'link',
        label: 'Archived chats',
        rows: [],
    },
] as const satisfies ReadonlyArray<{
    access: 'everyone' | 'operator';
    icon: IconSvgElement;
    id: string;
    kind: 'link' | 'page';
    label: string;
    rows: readonly string[];
}>;

export type SettingsNavItem = (typeof settingsNavItems)[number];
export type SettingsRouteTab = SettingsNavItem['id'];
export type SettingsNavLinkId = Extract<SettingsNavItem, { kind: 'link' }>['id'];
export type SettingsPageId = Extract<SettingsNavItem, { kind: 'page' }>['id'];

export const settingsPages = settingsNavItems.filter(
    (item): item is Extract<SettingsNavItem, { kind: 'page' }> => item.kind === 'page'
);

export const settingsNavSections = [
    {
        id: 'you',
        itemIds: ['profile', 'preferences', 'appearance', 'notifications', 'shortcuts', 'servers'],
        label: 'You',
    },
    { id: 'captains', itemIds: ['models', 'skills', 'connections'], label: 'Captains' },
    {
        id: 'haus',
        itemIds: ['general', 'members', 'computers', 'usage', 'archived'],
        label: 'Haus',
    },
] as const satisfies ReadonlyArray<{
    id: string;
    itemIds: readonly SettingsRouteTab[];
    label: string;
}>;

export interface SettingsNavMatch {
    item: SettingsNavItem;
    row: string | null;
}

export interface SettingsNavGroup {
    id: string;
    label: string;
    matches: SettingsNavMatch[];
}

export function settingsNavGroups({ canOperate, query }: { canOperate: boolean; query: string }) {
    const needle = query.trim().toLowerCase();
    return settingsNavSections.flatMap((section) => {
        const matches = section.itemIds.flatMap((id) => {
            const item = settingsNavItems.find((candidate) => candidate.id === id);
            if (!item || (item.access === 'operator' && !canOperate)) {
                return [];
            }
            return matchItem(item, needle);
        });
        const group = { id: section.id, label: section.label, matches } satisfies SettingsNavGroup;
        return matches.length > 0 ? [group] : [];
    });
}

function matchItem(item: SettingsNavItem, needle: string) {
    const titleMatches = needle.length === 0 || startsWord(item.label, needle);
    const rows: readonly string[] = item.rows;
    const row = titleMatches
        ? null
        : (rows.find((candidate) => startsWord(candidate, needle)) ?? null);
    const matches: SettingsNavMatch[] = titleMatches || row ? [{ item, row }] : [];
    return matches;
}

function startsWord(text: string, needle: string) {
    const normalized = text.toLowerCase();
    return normalized.startsWith(needle) || normalized.includes(` ${needle}`);
}
