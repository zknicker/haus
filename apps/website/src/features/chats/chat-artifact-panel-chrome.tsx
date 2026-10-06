import { Button, Dropdown, Label, ScrollShadow, Separator } from '@heroui/react';
import {
    File01Icon,
    Link01Icon,
    MoreHorizontalIcon,
    PlusSignIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import { shellBandIconSize } from '../shell/section-header.tsx';
import { ArtifactPanelSourceMenu } from './chat-artifact-panel-source-menu.tsx';
import { ArtifactTabStrip } from './chat-artifact-tab-strip.tsx';
import { formatHausResourceLink, type HausResourceTarget } from './haus-resource-link.ts';

// One chrome row: tabs, the active target's options, add, hide. The pane
// intentionally has no second path/toolbar row — target navigation lives in
// the content browsers themselves. In the tabs layout this row renders
// inside the shell toolbar, aligned over the pane; in the sidebar layout the
// pane hosts it directly.
export function ArtifactPanelChrome({
    activeKey,
    activeTarget,
    agentId,
    className,
    // Hidden when a toolbar-hosted toggle button plays the hide role instead.
    closeButtonHidden = false,
    onClose,
    onCloseTarget,
    onOpenTarget,
    onSelectTarget,
    targets,
}: {
    activeKey: string | null;
    activeTarget?: HausResourceTarget;
    agentId: string;
    className?: string;
    closeButtonHidden?: boolean;
    onClose: () => void;
    onCloseTarget: (key: string) => void;
    onOpenTarget: (target: HausResourceTarget) => void;
    onSelectTarget: (key: string) => void;
    targets: HausResourceTarget[];
}) {
    return (
        <div className={cn('flex h-full min-w-0 flex-1 items-center gap-2 px-3', className)}>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <ScrollShadow
                    className="h-8 min-w-0 flex-1"
                    hideScrollBar
                    orientation="horizontal"
                    size={24}
                >
                    <ArtifactTabStrip
                        activeKey={activeKey}
                        onCloseTarget={onCloseTarget}
                        onSelectTarget={onSelectTarget}
                        targets={targets}
                    />
                </ScrollShadow>
                <ArtifactPanelSourceMenu agentId={agentId} onOpenTarget={onOpenTarget} />
            </div>
            {activeTarget ? <ArtifactOptionsMenu target={activeTarget} /> : null}
            {closeButtonHidden ? null : (
                <Button
                    aria-label="Hide artifacts"
                    isIconOnly
                    onPress={onClose}
                    size="sm"
                    variant="ghost"
                >
                    <Icon className="rotate-45" icon={PlusSignIcon} size={shellBandIconSize} />
                </Button>
            )}
        </div>
    );
}

export function ArtifactOptionsMenu({ target }: { target: HausResourceTarget }) {
    return (
        <Dropdown>
            <Button aria-label="Artifact options" isIconOnly size="sm" variant="ghost">
                <Icon className="size-3.5" icon={MoreHorizontalIcon} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    onAction={(key) => {
                        if (key === 'copy-link') {
                            void copyArtifactText(formatHausResourceLink(target));
                        } else if (key === 'copy-path') {
                            void copyArtifactText(target.path);
                        }
                    }}
                >
                    <Dropdown.Item id="copy-link" textValue="Copy link">
                        <Icon icon={Link01Icon} size={16} />
                        <Label>Copy link</Label>
                    </Dropdown.Item>
                    {/* Explicit: this menu also opens from a Toolbar (the artifact
                        page), whose context would otherwise turn it vertical. */}
                    <Separator orientation="horizontal" />
                    <Dropdown.Item id="copy-path" textValue="Copy path">
                        <Icon icon={File01Icon} size={16} />
                        <Label>Copy path</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

async function copyArtifactText(value: string) {
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch {
            // Fall through to the textarea copy path for stricter webviews.
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.append(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
    } finally {
        textarea.remove();
    }
}
