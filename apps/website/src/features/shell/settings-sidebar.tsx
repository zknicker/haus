import { Sidebar } from '@heroui-pro/react';
import { SearchField } from '@heroui/react';
import { Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { serverSettingsSectionRoute } from '../servers/server-routes.ts';
import { type SettingsRouteTab, settingsNavGroups } from '../settings/layout/navigation.ts';
import { SettingsEmptyState } from '../settings/layout/settings-empty.tsx';
import {
    SettingsRailRouter,
    useSettingsRailNavigate,
    useSettingsExit,
    useSettingsRailTabId,
} from './settings-rail-router.tsx';
import { ShellSidebarPageContent } from './shell-sidebar.tsx';
import { SidebarBackToChatRow } from './sidebar-settings-action.tsx';

/** Settings navigation sidebar for the Server settings routes, led by a Back to chat row. */
export function SettingsSidebar({
    backRoute,
    canOperate,
    currentSection,
    slug,
}: {
    backRoute: string;
    canOperate: boolean;
    currentSection: SettingsRouteTab | undefined;
    slug: string;
}) {
    const [query, setQuery] = React.useState('');
    const groups = settingsNavGroups({ canOperate, query });
    const railTabId = useSettingsRailTabId();
    const exitSettings = useSettingsExit(slug, backRoute);
    return (
        <SettingsRailRouter>
            <ShellSidebarPageContent className="settings-rail" sourceTabId={railTabId}>
                <SidebarBackToChatRow onBack={exitSettings} route={backRoute} />
                <SettingsSearch
                    firstRoute={firstRoute(groups, slug)}
                    onChange={setQuery}
                    query={query}
                />
                {groups.map((group) => (
                    <Sidebar.Group key={group.id}>
                        <Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
                        <Sidebar.Menu aria-label={group.label}>
                            {group.matches.map(({ item, row }) => (
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
                                        {row ? <Sidebar.MenuChip>{row}</Sidebar.MenuChip> : null}
                                    </Sidebar.MenuItemContent>
                                </Sidebar.MenuItem>
                            ))}
                        </Sidebar.Menu>
                    </Sidebar.Group>
                ))}
                {groups.length === 0 ? (
                    <SettingsEmptyState role="status" title="No settings match" />
                ) : null}
            </ShellSidebarPageContent>
        </SettingsRailRouter>
    );
}

function SettingsSearch({
    firstRoute,
    onChange,
    query,
}: {
    firstRoute: string | null;
    onChange: (query: string) => void;
    query: string;
}) {
    const navigate = useSettingsRailNavigate();
    return (
        <Sidebar.Group>
            <SearchField
                aria-label="Search settings"
                fullWidth
                onChange={onChange}
                onSubmit={() => {
                    if (firstRoute) {
                        navigate(firstRoute);
                        onChange('');
                    }
                }}
                value={query}
            >
                <SearchField.Group>
                    {/* The rail's own glyph, so it draws at the nav icons' weight. */}
                    <SearchField.SearchIcon>
                        <Icon icon={Search01Icon} />
                    </SearchField.SearchIcon>
                    <SearchField.Input placeholder="Search settings" />
                    <SearchField.ClearButton />
                </SearchField.Group>
            </SearchField>
        </Sidebar.Group>
    );
}

function firstRoute(groups: ReturnType<typeof settingsNavGroups>, slug: string) {
    const first = groups[0]?.matches[0];
    return first ? serverSettingsSectionRoute(slug, first.item.id) : null;
}
