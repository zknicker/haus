import type { IconSvgElement } from '@hugeicons/react';
import {
    AiBrain01Icon,
    Analytics01Icon,
    ArchiveIcon,
    Exchange01Icon,
    Plug01Icon,
    PreferenceHorizontalIcon,
    ServerStack01Icon,
    UserCircleIcon,
    UserMultipleIcon,
    ZapIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { appRoutes } from '../../../lib/app-routes.ts';

/**
 * Personal settings affect the reader; Server settings describe shared
 * membership and capabilities. Machine-specific controls live on each Computer.
 */
export const staticSettingsNavItems = [
    {
        icon: UserCircleIcon,
        id: 'profile',
        label: 'Profile',
        to: appRoutes.settingsProfile,
    },
    {
        icon: PreferenceHorizontalIcon,
        id: 'preferences',
        label: 'Preferences',
        to: appRoutes.settingsPreferences,
    },
    {
        icon: Exchange01Icon,
        id: 'servers',
        label: 'Servers',
        to: appRoutes.settingsServers,
    },
    {
        icon: ServerStack01Icon,
        id: 'server',
        label: 'Server',
        to: appRoutes.settings,
    },
    {
        icon: UserMultipleIcon,
        id: 'members',
        label: 'Members',
        to: appRoutes.settingsMembers,
    },
    {
        icon: Plug01Icon,
        id: 'connections',
        label: 'Connections',
        to: appRoutes.settingsConnections,
    },
    {
        icon: AiBrain01Icon,
        id: 'models',
        label: 'Models',
        to: appRoutes.settingsModels,
    },
    {
        icon: ZapIcon,
        id: 'skills',
        label: 'Skills',
        to: appRoutes.settingsSkills,
    },
    {
        icon: Analytics01Icon,
        id: 'usage',
        label: 'Usage',
        to: appRoutes.settingsUsage,
    },
] as const satisfies ReadonlyArray<{
    icon: IconSvgElement;
    id: string;
    label: string;
    to: string;
}>;

/**
 * Entry points, not settings pages. Archived chats is a chat list with its own
 * standalone route, and the rail links out to it so it still has a home now
 * that the sidebar's Server menu is gone. `SettingsSectionRoute` maps each id
 * to its destination and hands off.
 *
 * It stays out of `staticSettingsNavItems` because the command palette builds
 * its Settings group from that list and already carries its own Archived chats
 * command.
 */
export const settingsNavLinkItems = [
    {
        icon: ArchiveIcon,
        id: 'archived',
        label: 'Archived chats',
        to: appRoutes.archivedChats,
    },
] as const satisfies ReadonlyArray<{
    icon: IconSvgElement;
    id: string;
    label: string;
    to: string;
}>;

export const settingsNavLinkIds = settingsNavLinkItems.map((item) => item.id);
export type SettingsNavLinkId = (typeof settingsNavLinkItems)[number]['id'];

export const settingsNavItems = [...staticSettingsNavItems, ...settingsNavLinkItems];

/**
 * Computers is its own section because its rows come from the roster rather
 * than from this list; the sidebar renders it after these.
 */
export const settingsNavSections = [
    {
        // Which Servers you belong to is about you, not about this Server.
        id: 'personal',
        itemIds: ['profile', 'preferences', 'servers'],
        label: 'Preferences',
    },
    {
        id: 'server',
        // Usage reads the Server's activity after the pages that configure
        // it; Archived chats closes the group as a link-out.
        itemIds: ['server', 'members', 'connections', 'models', 'skills', 'usage', 'archived'],
        label: 'Server',
    },
] as const;

export type SettingsNavItem = (typeof settingsNavItems)[number];
/** Static section ids plus the dynamic Computers section (rows come from the roster). */
export type SettingsRouteTab = SettingsNavItem['id'] | 'computers';
