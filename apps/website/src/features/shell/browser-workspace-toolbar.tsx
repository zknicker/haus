import { Button, Kbd, ProgressBar, Toolbar, Tooltip, toast } from '@heroui/react';
import { LinkSquare02Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { formatBrowserDisplayUrl, resolveBrowserAddress } from './browser-address.ts';
import { BrowserWorkspaceAddress } from './browser-workspace-address.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import {
    BrowserToolbarButton,
    BrowserWorkspaceNavigation,
} from './browser-workspace-navigation.tsx';

export function BrowserWorkspaceToolbar({ tab }: { tab: BrowserTab }) {
    const workspace = useBrowserWorkspace();
    const blank = tab.url === 'about:blank';
    // null while the field is at rest; the resting label always follows the live tab URL.
    const [draft, setDraft] = React.useState<string | null>(null);
    const address = draft ?? formatBrowserDisplayUrl(tab.url);
    const navigate = (value: string) => {
        setDraft(null);
        workspace?.command({ kind: 'navigate', action: 'url', url: resolveBrowserAddress(value) });
    };
    return (
        <form
            className="browser-toolbar relative grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 px-2 py-1.25"
            onSubmit={(event) => {
                event.preventDefault();
                const value = address.trim();
                if (value) {
                    navigate(value);
                }
            }}
        >
            <BrowserWorkspaceNavigation tab={tab} />
            <BrowserWorkspaceAddress
                address={address}
                autoFocus={blank}
                editing={draft !== null}
                history={workspace?.history ?? []}
                onChange={setDraft}
                onEdit={() => setDraft(blank ? '' : tab.url)}
                onNavigate={navigate}
                onRest={() => setDraft(null)}
            />
            <Toolbar aria-label="Page actions" className="justify-self-end">
                {tab.zoomFactor === 1 ? null : (
                    <Tooltip>
                        <Button
                            aria-label={`Zoom ${Math.round(tab.zoomFactor * 100)}%, reset zoom`}
                            onPress={() =>
                                workspace?.command({ kind: 'navigate', action: 'zoom-reset' })
                            }
                            size="sm"
                            variant="ghost"
                        >
                            <span className="tabular-nums">
                                {Math.round(tab.zoomFactor * 100)}%
                            </span>
                        </Button>
                        <Tooltip.Content placement="top">
                            Reset zoom
                            <Kbd>⌘0</Kbd>
                        </Tooltip.Content>
                    </Tooltip>
                )}
                <BrowserToolbarButton
                    icon={<Icon icon={LinkSquare02Icon} size={16} />}
                    isDisabled={blank}
                    label="Open in default browser"
                    onPress={() => {
                        void getDesktopBridge()
                            ?.openExternal(tab.url)
                            .catch((error: Error) =>
                                toast.danger('Could not open the browser', {
                                    description: error.message,
                                })
                            );
                    }}
                />
            </Toolbar>
            <div
                aria-hidden={!tab.loading}
                className="browser-loading-line"
                data-loading={tab.loading}
            >
                <ProgressBar aria-label="Loading page" isIndeterminate>
                    <ProgressBar.Track>
                        <ProgressBar.Fill />
                    </ProgressBar.Track>
                </ProgressBar>
            </div>
        </form>
    );
}
