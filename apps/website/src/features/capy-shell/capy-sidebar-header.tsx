import { Button, Kbd, Tooltip } from '@heroui/react';
import { PencilEdit02Icon, Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import { Link } from 'react-router-dom';
import { HausMascot } from '../../components/haus-mascot.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useOptionalServerWorkState } from '../../hooks/agents/use-current-agent-activity.tsx';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { serverRoute } from '../servers/server-routes.ts';
import { resolveAgentActivityGhostTempo } from '../shell/agent-activity-ghost-tempo.ts';
import { useCommandMenu } from '../shell/command-menu-provider.tsx';
import { requestHomePromptFocus } from './home-prompt-focus.ts';

export function CapySidebarActions({ slug }: { slug: string }) {
    const navigate = useSidebarNavigate();
    const { open: openCommandMenu } = useCommandMenu();
    return (
        <div className="app-shell-band flex items-center">
            <HeaderAction
                icon={Search01Icon}
                label="Search"
                onPress={openCommandMenu}
                shortcut="⌘K"
            />
            <HeaderAction
                icon={PencilEdit02Icon}
                label="New task"
                onPress={() => {
                    navigate(serverRoute(slug));
                    requestHomePromptFocus();
                }}
            />
        </div>
    );
}

export function CapySidebarHeader({ slug }: { slug: string }) {
    return (
        <div className="flex h-(--app-shell-band-height) shrink-0 items-center justify-between ps-[calc(var(--spacing-compact)*3+0.5rem)] pe-[calc(var(--spacing-compact)*3)]">
            <HomeMark slug={slug} />
            <CapySidebarActions slug={slug} />
        </div>
    );
}

export function HomeMark({ slug }: { slug: string }) {
    const tempo = resolveAgentActivityGhostTempo(useOptionalServerWorkState());
    return (
        <Link aria-label="Home" className="inline-flex rounded-md" to={serverRoute(slug)}>
            <HausMascot animated aria-hidden="true" fill="iridescent" size={22} tempo={tempo} />
        </Link>
    );
}

function HeaderAction({
    icon,
    label,
    onPress,
    shortcut,
}: {
    icon: IconSvgElement;
    label: string;
    onPress: () => void;
    shortcut?: string;
}) {
    return (
        <Tooltip>
            <Button aria-label={label} isIconOnly onPress={onPress} size="sm" variant="ghost">
                <Icon aria-hidden="true" className="text-muted" icon={icon} />
            </Button>
            <Tooltip.Content>
                {label}
                {shortcut ? <Kbd>{shortcut}</Kbd> : null}
            </Tooltip.Content>
        </Tooltip>
    );
}
