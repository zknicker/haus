import { Sidebar } from '@heroui-pro/react';
import { Icon } from '../../components/ui/icon.tsx';
import { SettingsComputersGroup } from '../computers/settings-computers-group.tsx';
import { serverSettingsSectionRoute } from '../servers/server-routes.ts';
import {
    type SettingsRouteTab,
    settingsNavItems,
    settingsNavSections,
} from '../settings/layout/navigation.ts';
import { SettingsRailRouter, useSettingsRailTabId } from './settings-rail-router.tsx';
import { ShellSidebarPageContent } from './shell-sidebar.tsx';
import { SidebarBackToChatRow } from './sidebar-settings-action.tsx';

/**
 * Settings navigation sidebar for the Server settings routes. `backRoute` null drops the
 * back-to-chat row: desktop tabs and ⌘[ cover going back (ADR 0039); the web keeps it.
 */
export function SettingsSidebar({
    backRoute,
    canOperate,
    currentSection,
    serverId,
    slug,
}: {
    backRoute: string | null;
    canOperate: boolean;
    currentSection: SettingsRouteTab | undefined;
    serverId: string;
    slug: string;
}) {
    const itemById = new Map(settingsNavItems.map((item) => [item.id, item]));
    const railTabId = useSettingsRailTabId();
    return (
        <SettingsRailRouter>
            <ShellSidebarPageContent sourceTabId={railTabId}>
                {backRoute ? <SidebarBackToChatRow route={backRoute} /> : null}
                {settingsNavSections.map((section) => {
                    const items = section.itemIds
                        .map((id) => itemById.get(id))
                        .filter((item) => item !== undefined);
                    if (items.length === 0) {
                        return null;
                    }
                    return (
                        <Sidebar.Group key={section.id}>
                            <Sidebar.GroupLabel>{section.label}</Sidebar.GroupLabel>
                            <Sidebar.Menu aria-label={section.label}>
                                {items.map((item) => (
                                    <Sidebar.MenuItem
                                        href={serverSettingsSectionRoute(slug, item.id)}
                                        id={item.id}
                                        isCurrent={item.id === currentSection}
                                        key={item.id}
                                        textValue={item.label}
                                    >
                                        <Sidebar.MenuIcon>
                                            <Icon aria-hidden="true" icon={item.icon} />
                                        </Sidebar.MenuIcon>
                                        <Sidebar.MenuItemContent>
                                            <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
                                        </Sidebar.MenuItemContent>
                                    </Sidebar.MenuItem>
                                ))}
                            </Sidebar.Menu>
                        </Sidebar.Group>
                    );
                })}
                {canOperate ? (
                    <SettingsComputersGroup
                        currentSection={currentSection}
                        serverId={serverId}
                        slug={slug}
                    />
                ) : null}
            </ShellSidebarPageContent>
        </SettingsRailRouter>
    );
}
