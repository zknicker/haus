import { Badge, Button, Separator, ToggleButton, Tooltip } from '@heroui/react';
import { HoverCard } from '@heroui-pro/react';
import {
    AddSquareIcon,
    ArrowExpand01Icon,
    ArrowShrink02Icon,
    PanelRightIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { workspaceTabId } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { WorkspaceTabVariant } from './closable-workspace-tab.tsx';
import { WorkspaceTabItem } from './workspace-tab-item.tsx';

/**
 * The band's layout controls (ADR 0038, after Codex), after a divider from
 * the page's actions: expand the side pane's tabs into one strip (collapse
 * back while pressed), then the side pane toggle. With no closable tab open,
 * a New tab button stands in for both.
 */
export function WorkspaceLayoutControls() {
    const workspace = useBrowserWorkspace();
    if (!workspace) {
        return null;
    }
    const expanded = workspace.mode === 'expanded';
    return (
        <>
            <Separator orientation="vertical" />
            {workspace.tabs.length === 0 ? (
                <Tooltip>
                    <Button
                        aria-label="New tab"
                        isIconOnly
                        onPress={() => workspace.command({ kind: 'new' })}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={AddSquareIcon} size={16} />
                    </Button>
                    <Tooltip.Content>New tab</Tooltip.Content>
                </Tooltip>
            ) : (
                <>
                    <Tooltip>
                        <ToggleButton
                            aria-label="Open as tabs"
                            isIconOnly
                            isSelected={expanded}
                            onChange={workspace.toggleMode}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon
                                aria-hidden="true"
                                icon={expanded ? ArrowShrink02Icon : ArrowExpand01Icon}
                                size={16}
                            />
                        </ToggleButton>
                        <Tooltip.Content>{expanded ? 'Collapse' : 'Expand'}</Tooltip.Content>
                    </Tooltip>
                    <SidePaneToggle />
                </>
            )}
        </>
    );
}

/**
 * Hides or shows the side pane; in expanded mode it collapses back to the
 * pane. While a split-mode pane hides tabs, a badge counts them and hovering
 * lists them; pressing one reveals the pane on it.
 */
function SidePaneToggle() {
    const workspace = useBrowserWorkspace();
    if (!workspace) {
        return null;
    }
    const hidden = workspace.mode === 'split' && !workspace.sidePaneShown ? workspace.tabs : [];
    return (
        <HoverCard closeDelay={200} openDelay={400}>
            <HoverCard.Trigger>
                <Badge.Anchor>
                    <ToggleButton
                        aria-label="Side pane"
                        isIconOnly
                        isSelected={workspace.sidePaneShown}
                        onChange={workspace.toggleSidePane}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={PanelRightIcon} size={16} />
                    </ToggleButton>
                    {hidden.length > 0 ? (
                        <Badge aria-hidden="true" size="sm">
                            {hidden.length}
                        </Badge>
                    ) : null}
                </Badge.Anchor>
            </HoverCard.Trigger>
            <HoverCard.Content
                aria-label={hidden.length > 0 ? 'Open tabs' : undefined}
                placement="bottom"
            >
                {hidden.length > 0 ? (
                    <nav aria-label="Open tabs" className="workspace-open-tabs">
                        <p className="workspace-open-tabs__title">Open tabs</p>
                        <WorkspaceTabVariant value="list">
                            {hidden.map((ref) => (
                                <WorkspaceTabItem key={workspaceTabId(ref)} tabRef={ref} />
                            ))}
                        </WorkspaceTabVariant>
                    </nav>
                ) : (
                    <p className="text-sm">
                        {workspace.sidePaneShown ? 'Hide side pane' : 'Show side pane'}
                    </p>
                )}
            </HoverCard.Content>
        </HoverCard>
    );
}
