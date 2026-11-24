import { Button, Kbd, Tooltip } from '@heroui/react';
import { PencilEdit02Icon, Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import { Link } from 'react-router-dom';
import { HausMascot } from '../../components/haus-mascot.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useOptionalServerWorkState } from '../../hooks/agents/use-current-agent-activity.tsx';
import { useHasAgents } from '../../hooks/members/use-agents.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { serverRoute } from '../servers/server-routes.ts';
import { resolveAgentActivityGhostTempo } from '../shell/agent-activity-ghost-tempo.ts';
import { useCommandMenu } from '../shell/command-menu-provider.tsx';
import { requestHomePromptFocus } from './home-prompt-focus.ts';

export function CapySidebarActions({
    canOperate,
    serverId,
    slug,
}: {
    canOperate: boolean;
    serverId: string;
    slug: string;
}) {
    const navigate = useSidebarNavigate();
    const { open: openCommandMenu } = useCommandMenu();
    const noCaptains = useHasAgents(serverId) === false;
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
                    if (!noCaptains) {
                        requestHomePromptFocus();
                    }
                }}
                tooltip={noCaptains ? noCaptainTooltip(canOperate) : undefined}
            />
        </div>
    );
}

export function CapySidebarHeader({
    canOperate,
    serverId,
    slug,
}: {
    canOperate: boolean;
    serverId: string;
    slug: string;
}) {
    return (
        <div className="flex h-(--app-shell-band-height) shrink-0 items-center justify-between ps-[calc(var(--spacing-compact)*3+var(--sidebar-mark-inset)+1px)] pe-[calc(var(--spacing-compact)*3)]">
            <HomeMark slug={slug} />
            <CapySidebarActions canOperate={canOperate} serverId={serverId} slug={slug} />
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

export function noCaptainTooltip(canOperate: boolean) {
    return canOperate
        ? 'New task needs a Captain. Add one from Home.'
        : 'New task needs a Captain. Ask an Owner or Admin to add one.';
}

function HeaderAction({
    icon,
    label,
    onPress,
    shortcut,
    tooltip,
}: {
    icon: IconSvgElement;
    label: string;
    onPress: () => void;
    shortcut?: string;
    tooltip?: string;
}) {
    return (
        <Tooltip>
            <Button aria-label={label} isIconOnly onPress={onPress} size="sm" variant="ghost">
                <Icon aria-hidden="true" className="text-muted" icon={icon} />
            </Button>
            <Tooltip.Content>
                {tooltip ?? label}
                {shortcut ? <Kbd>{shortcut}</Kbd> : null}
            </Tooltip.Content>
        </Tooltip>
    );
}
