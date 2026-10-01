import { Badge, Button, Kbd, ToggleButton, Tooltip } from '@heroui/react';
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
 * pane (Command-Shift-B either way). While a split-mode pane hides tabs, a
 * badge counts them and hovering lists them in place of the tooltip; pressing
 * one reveals the pane on it. The tree never changes shape, so the button
 * keeps focus across a toggle; the card stays armed (it renders nothing with
 * no list) so pressing Hide under a resting pointer still opens the list.
 */
function SidePaneToggle() {
    const workspace = useBrowserWorkspace();
    if (!workspace) {
        return null;
    }
    const hidden = workspace.mode === 'split' && !workspace.sidePaneShown ? workspace.tabs : [];
    const tooltip = workspace.sidePaneShown ? 'Hide tabs' : 'Show tabs';
    return (
        <HoverCard closeDelay={200} openDelay={400}>
            <HoverCard.Trigger>
                <Badge.Anchor>
                    <Tooltip isDisabled={hidden.length > 0}>
                        {/* A fixed name: aria-pressed carries the state, the tooltip the action. */}
                        <ToggleButton
                            aria-label="Side pane tabs"
                            isIconOnly
                            isSelected={workspace.sidePaneShown}
                            onChange={workspace.toggleSidePane}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon aria-hidden="true" icon={PanelRightIcon} size={16} />
                        </ToggleButton>
                        <Tooltip.Content>
                            {tooltip}
                            <Kbd>⇧⌘B</Kbd>
                        </Tooltip.Content>
                    </Tooltip>
                    {hidden.length > 0 ? (
                        <Badge aria-hidden="true" size="sm">
                            {hidden.length}
                        </Badge>
                    ) : null}
                </Badge.Anchor>
            </HoverCard.Trigger>
            {hidden.length > 0 ? (
                <HoverCard.Content
                    aria-label="Open tabs"
                    className="dark hover-card__content--tooltip"
                    placement="bottom"
                >
                    <nav aria-label="Open tabs" className="workspace-open-tabs">
                        <p className="workspace-open-tabs__title">Open tabs</p>
                        <WorkspaceTabVariant value="list">
                            {hidden.map((ref) => (
                                <WorkspaceTabItem key={workspaceTabId(ref)} tabRef={ref} />
                            ))}
                        </WorkspaceTabVariant>
                    </nav>
                </HoverCard.Content>
            ) : null}
        </HoverCard>
    );
}
