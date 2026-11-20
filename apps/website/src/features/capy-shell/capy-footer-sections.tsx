import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import {
    Activity03Icon,
    CheckListIcon,
    Folder01Icon,
    WorkflowSquare10Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import * as React from 'react';
import { Focusable } from 'react-aria-components';
import { Link, useLocation } from 'react-router-dom';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { preloadServerSection } from '../../routes/app/server-route-modules.ts';
import { activityRoute, tasksRoute } from '../servers/server-routes.ts';

export function CapyFooterSections({ serverId, slug }: { serverId: string; slug: string }) {
    return (
        <nav aria-label="Sections" className="flex items-center">
            <FooterLink
                href={tasksRoute(slug)}
                icon={CheckListIcon}
                label="Tasks"
                section="tasks"
            />
            <FooterLink
                href={`/s/${slug}/artifacts`}
                icon={Folder01Icon}
                label="Drive"
                section="artifacts"
            />
            <AutomationsMenu serverId={serverId} />
            <FooterLink
                href={activityRoute(slug)}
                icon={Activity03Icon}
                label="Activity"
                section="activity"
            />
        </nav>
    );
}

function AutomationsMenu({ serverId }: { serverId: string }) {
    const openAgentProfile = useOpenAgentProfile();
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
                    onAction={(key) => openAgentProfile(String(key), { section: 'automations' })}
                >
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
    section,
}: {
    href: string;
    icon: IconSvgElement;
    label: string;
    section: 'activity' | 'artifacts' | 'tasks';
}) {
    const { pathname } = useLocation();
    const preload = React.useCallback(() => preloadServerSection(section), [section]);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);
    return (
        <Tooltip>
            <Focusable>
                <Link
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
                </Link>
            </Focusable>
            <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip>
    );
}
