import { Button, ProgressBar, Tooltip, toast } from '@heroui/react';
import {
    ArrowLeft01Icon,
    ArrowRight01Icon,
    Cancel01Icon,
    LinkSquare02Icon,
    ReloadIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { BrowserWorkspaceAddress } from './browser-workspace-address.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

export function BrowserWorkspaceToolbar({ tab }: { tab: BrowserTab }) {
    const workspace = useBrowserWorkspace();
    const [address, setAddress] = React.useState(tab.url === 'about:blank' ? '' : tab.url);
    const [focused, setFocused] = React.useState(false);
    React.useEffect(() => {
        if (!focused) {
            setAddress(tab.url === 'about:blank' ? '' : tab.url);
        }
    }, [tab.url, focused]);
    const navigate = (url: string) => {
        setAddress(url);
        workspace?.command({ kind: 'navigate', action: 'url', url });
    };
    const reloadLabel = tab.loading ? 'Stop loading' : 'Reload page';
    return (
        <form
            className="browser-toolbar relative flex shrink-0 items-center gap-2 px-3 py-2"
            onSubmit={(event) => {
                event.preventDefault();
                const value = address.trim();
                if (value) {
                    navigate(resolveBrowserAddress(value));
                }
            }}
        >
            <div className="flex shrink-0 items-center gap-1">
                <Tooltip>
                    <Button
                        aria-label="Browser back"
                        isDisabled={!tab.canGoBack}
                        isIconOnly
                        onPress={() => workspace?.command({ kind: 'navigate', action: 'back' })}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon icon={ArrowLeft01Icon} size={16} />
                    </Button>
                    <Tooltip.Content placement="top">Back</Tooltip.Content>
                </Tooltip>
                <Tooltip>
                    <Button
                        aria-label="Browser forward"
                        isDisabled={!tab.canGoForward}
                        isIconOnly
                        onPress={() => workspace?.command({ kind: 'navigate', action: 'forward' })}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon icon={ArrowRight01Icon} size={16} />
                    </Button>
                    <Tooltip.Content placement="top">Forward</Tooltip.Content>
                </Tooltip>
                <Tooltip>
                    <Button
                        aria-label={reloadLabel}
                        isIconOnly
                        onPress={() =>
                            workspace?.command({
                                kind: 'navigate',
                                action: tab.loading ? 'stop' : 'reload',
                            })
                        }
                        size="sm"
                        variant="ghost"
                    >
                        <Icon icon={tab.loading ? Cancel01Icon : ReloadIcon} size={16} />
                    </Button>
                    <Tooltip.Content placement="top">{reloadLabel}</Tooltip.Content>
                </Tooltip>
            </div>
            <BrowserWorkspaceAddress
                address={address}
                autoFocus={tab.url === 'about:blank'}
                history={workspace?.history ?? []}
                onBlur={() => setFocused(false)}
                onChange={setAddress}
                onFocus={() => setFocused(true)}
                onNavigate={(value) => navigate(resolveBrowserAddress(value))}
            />
            <div className="flex shrink-0 justify-end">
                <Tooltip>
                    <Button
                        aria-label="Open in default browser"
                        isDisabled={tab.url === 'about:blank'}
                        isIconOnly
                        onPress={() => {
                            void getDesktopBridge()
                                ?.openExternal(tab.url)
                                .catch((error: Error) =>
                                    toast.danger('Could not open the browser', {
                                        description: error.message,
                                    })
                                );
                        }}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon icon={LinkSquare02Icon} size={16} />
                    </Button>
                    <Tooltip.Content placement="top">Open in default browser</Tooltip.Content>
                </Tooltip>
            </div>
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

export function resolveBrowserAddress(value: string) {
    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
        return value;
    }
    if (!/\s/.test(value) && (value.includes('.') || value.startsWith('localhost'))) {
        return `https://${value}`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
