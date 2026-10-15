import { Button } from '@heroui/react';
import { Cancel01Icon, File01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import { sidebarActionIconSize } from '../shell/section-header.tsx';
import {
    getArtifactPanelTargetKey,
    getArtifactPanelTargetLabel,
    type HausResourceTarget,
} from './haus-resource-link.ts';

/*
 * Editor-style Workspace pane tabs, owned by chat.
 *
 * Stock HeroUI Tabs cannot express these: its list is a React Aria
 * collection that only accepts Tab children, so a per-tab close control
 * would have to nest a second button inside role="tab" and claw back room
 * for it by overriding the tab's own padding. Here the tab and its close
 * control are siblings, and the pane renders content itself rather than
 * through Tabs.Panel.
 */
export function ArtifactTabStrip({
    activeKey,
    onCloseTarget,
    onSelectTarget,
    targets,
}: {
    activeKey: string | null;
    onCloseTarget: (key: string) => void;
    onSelectTarget: (key: string) => void;
    targets: HausResourceTarget[];
}) {
    return (
        <div
            aria-label="Open workspace items"
            className="flex h-8 w-max min-w-full items-center gap-1"
            role="tablist"
        >
            {targets.map((target) => {
                const key = getArtifactPanelTargetKey(target);
                return (
                    <ArtifactTab
                        active={key === activeKey}
                        key={key}
                        label={getArtifactPanelTargetLabel(target)}
                        onClose={() => onCloseTarget(key)}
                        onSelect={() => onSelectTarget(key)}
                        path={target.path}
                    />
                );
            })}
        </div>
    );
}

function ArtifactTab({
    active,
    label,
    onClose,
    onSelect,
    path,
}: {
    active: boolean;
    label: string;
    onClose: () => void;
    onSelect: () => void;
    path: string;
}) {
    return (
        <div className="relative flex h-8 min-w-0 max-w-40 shrink-0 items-center">
            <button
                aria-selected={active}
                className={cn(
                    'flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg py-0 pr-8 pl-2.5 text-sm outline-none transition-colors focus-visible:bg-surface-secondary',
                    active
                        ? 'bg-surface-secondary text-foreground'
                        : 'text-muted hover:bg-background-hover hover:text-foreground'
                )}
                onClick={onSelect}
                role="tab"
                title={path}
                type="button"
            >
                <Icon aria-hidden="true" className="size-3.5 shrink-0" icon={File01Icon} />
                <span className="min-w-0 truncate">{label}</span>
            </button>
            <span className="absolute right-0 flex items-center">
                <Button
                    aria-label={`Close ${label}`}
                    isIconOnly
                    onPress={onClose}
                    size="sm"
                    variant="ghost"
                >
                    <Icon icon={Cancel01Icon} size={sidebarActionIconSize} />
                </Button>
            </span>
        </div>
    );
}
