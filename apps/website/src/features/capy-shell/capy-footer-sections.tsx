import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import {
    Activity03Icon,
    CheckListIcon,
    Folder01Icon,
    WorkflowSquare10Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { TooltipLink } from '../../components/ui/tooltip-link.tsx';
import { useOpenAgentProfileWith } from '../../hooks/agents/use-open-agent-profile.ts';
import { useDesktopPageOpeners } from '../../hooks/desktop-tabs/use-desktop-page-openers.ts';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { preloadServerSection } from '../../routes/app/server-route-modules.ts';
import { activityRoute, tasksRoute } from '../servers/server-routes.ts';

export function CapyFooterSections({ serverId, slug }: { serverId: string; slug: string }) {
    const preloadActivity = usePreloadActivity(serverId);
    return (
        <nav aria-label="Sections" className="flex items-center">
            <FooterLink
                href={tasksRoute(slug)}
                icon={CheckListIcon}
                label="Tasks"
                onPreload={preloadTasks}
            />
            <FooterLink
                href={`/s/${slug}/artifacts`}
                icon={Folder01Icon}
                label="Drive"
                onPreload={preloadDrive}
            />
            <AutomationsMenu serverId={serverId} slug={slug} />
            <FooterLink
                href={activityRoute(slug)}
                icon={Activity03Icon}
                label="Activity"
                onPreload={preloadActivity}
            />
        </nav>
    );
}

function AutomationsMenu({ serverId, slug }: { serverId: string; slug: string }) {
    const sidebarNavigate = useSidebarNavigate();
    const openers = useDesktopPageOpeners();
    const openAgentProfile = useOpenAgentProfileWith(openers?.openPage ?? sidebarNavigate, slug);
    const captains = useAgentAppearances(serverId);
    return (
        <Dropdown>
            <Tooltip>
                <Button aria-label="Automations" isIconOnly size="sm" variant="ghost">
                    <Icon aria-hidden="true" className="text-muted" icon={WorkflowSquare10Icon} />
                </Button>
                <Tooltip.Content>Automations</Tooltip.Content>
            </Tooltip>
            <Dropdown.Popover placement="top end">
                <Dropdown.Menu
                    aria-label="Automations"
                    disabledKeys={['none']}
                    onAction={(key) => openAgentProfile(String(key), { section: 'automations' })}
                >
                    {captains.length === 0 ? (
                        <Dropdown.Item id="none" textValue="No Captains yet">
                            <Label>No Captains yet</Label>
                        </Dropdown.Item>
                    ) : null}
                    {captains.map((captain) => (
                        <Dropdown.Item
                            id={captain.id}
                            key={captain.id}
                            textValue={captain.displayName}
                        >
                            <EntityAvatar
                                name={captain.displayName}
                                size={20}
                                src={captain.avatarUrl}
                            />
                            <Label>{captain.displayName}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function FooterLink({
    href,
    icon,
    label,
    onPreload: preload,
}: {
    href: string;
    icon: IconSvgElement;
    label: string;
    onPreload: () => void;
}) {
    const { pathname } = useLocation();
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);
    return (
        <Tooltip>
            <TooltipLink
                aria-current={
                    pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined
                }
                aria-label={label}
                className="button button--icon-only button--sm button--ghost"
                onFocus={preload}
                onMouseEnter={preload}
                ref={pressRef}
                to={href}
            >
                <Icon aria-hidden="true" className="text-muted" icon={icon} />
            </TooltipLink>
            <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip>
    );
}

function usePreloadActivity(serverId: string) {
    const utils = hausTrpc.useUtils();
    return React.useCallback(() => {
        preloadServerSection('activity');
        preloadServerSection('inbox');
        void utils.stats.live.prefetch({ serverId }, queryPolicy.syncedSnapshot);
    }, [serverId, utils]);
}

function preloadTasks() {
    preloadServerSection('tasks');
}

function preloadDrive() {
    preloadServerSection('artifacts');
}
