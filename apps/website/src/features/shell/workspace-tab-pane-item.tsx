import { Button, Tooltip } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentLocation, type TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { isTabSelected } from '../../hooks/desktop-tabs/desktop-tabs-selection.ts';
import { revealTab } from './tab-drag/tab-reveal.ts';
import { useTabDragHandlers } from './tab-drag/tab-rows-drag.tsx';
import { parseTabPage, type TabIdentity } from './tab-identity.ts';
import { useTabIdentity, useThreadTabExcerpt } from './use-tab-identity.ts';
import { WorkspaceTab, WorkspaceTabAction, WorkspaceTabLabel } from './workspace-tab.tsx';
import { TabIdentityMark } from './workspace-tab-mark.tsx';

/**
 * One desktop tab in a pane's row (ADR 0039): its page's mark and title, a
 * close button, middle-click to close. A press selects it, Command- and
 * Shift-press multi-select Chrome-style, and it drags (with its selection)
 * from anywhere on it, or moves with Space, arrows, Space: `tab-drag/`.
 */
export function PaneTab({
    dragging,
    tabId,
}: {
    /** It rides the pointer: raised above its row, painted at the pointer by the drag. */
    dragging: boolean;
    tabId: string;
}) {
    const tabs = useDesktopTabs();
    const tab = tabs.tab(tabId);
    if (!tab) {
        return null;
    }
    const location = currentLocation(tab);
    const page = parseTabPage(location);
    return page.kind === 'thread' ? (
        <ThreadPaneTab dragging={dragging} location={location} page={page} tabId={tabId} />
    ) : (
        <PlainPaneTab dragging={dragging} location={location} tabId={tabId} />
    );
}

interface PaneTabProps {
    dragging: boolean;
    location: TabLocation;
    tabId: string;
}

function PlainPaneTab(props: PaneTabProps) {
    return <PaneTabView identity={useTabIdentity(props.location)} {...props} />;
}

/** A Thread tab reads its root message, so only Thread tabs mount the transcript query. */
function ThreadPaneTab({
    page,
    ...props
}: PaneTabProps & {
    page: Extract<ReturnType<typeof parseTabPage>, { kind: 'thread' }>;
}) {
    const excerpt = useThreadTabExcerpt(page);
    return <PaneTabView identity={useTabIdentity(props.location, excerpt)} {...props} />;
}

function PaneTabView({
    dragging,
    identity,
    location,
    tabId,
}: PaneTabProps & { identity: TabIdentity }) {
    const tabs = useDesktopTabs();
    const active = tabs.shownTabIds.includes(tabId);
    // Selected with others but not the shown tab: Chrome's selected-tab tint.
    const selected = !active && isTabSelected(tabs.state, tabId);
    const drag = useTabDragHandlers(tabId);
    const element = React.useRef<HTMLDivElement | null>(null);
    // A dragged tab remounts in the row it enters, already selected; scrolling it into view
    // would shift that row under the pointer.
    const revealed = active && !dragging;
    React.useEffect(() => {
        if (revealed && element.current) {
            revealTab(element.current);
        }
    }, [revealed]);
    const label = identity.label;
    const button = (
        <Button
            aria-pressed={active}
            onKeyDown={(event) => {
                drag.onKeyDown(event);
                event.continuePropagation();
            }}
            onPointerDown={drag.onPointerDown}
            onPress={(event) => {
                // Pointer presses select in the drag's `pressTab` (Chrome's modifier rules).
                if (event.pointerType === 'keyboard' || event.pointerType === 'virtual') {
                    tabs.select(tabId);
                }
            }}
            onPressStart={(event) => event.continuePropagation()}
            size="sm"
            variant="ghost"
        >
            <TabIdentityMark mark={identity.mark} />
            <WorkspaceTabLabel>{label}</WorkspaceTabLabel>
        </Button>
    );
    return (
        <WorkspaceTab
            action={
                <WorkspaceTabAction>
                    <Button
                        aria-label={label ? `Close ${label}` : 'Close tab'}
                        isIconOnly
                        onPress={() => tabs.close([tabId])}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={Cancel01Icon} size={14} />
                    </Button>
                </WorkspaceTabAction>
            }
            active={active}
            data-dragging={dragging}
            data-selected={selected || undefined}
            data-tab-id={tabId}
            kind={parseTabPage(location).kind}
            onAuxClick={(event) => {
                if (event.button === 1) {
                    event.preventDefault();
                    tabs.close([tabId]);
                }
            }}
            ref={element}
        >
            {label ? (
                <Tooltip delay={600}>
                    {button}
                    <Tooltip.Content placement="bottom">
                        <p>{label}</p>
                        {identity.place ? (
                            <p className="text-muted text-xs">{identity.place}</p>
                        ) : null}
                    </Tooltip.Content>
                </Tooltip>
            ) : (
                button
            )}
        </WorkspaceTab>
    );
}
