import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { appOrigins } from '../../features/chats/shared-artifact-link.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { serverRoute } from '../../features/servers/server-routes.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useOptionalDesktopTabs } from '../desktop-tabs/desktop-tabs-context.ts';
import { useTabId } from '../desktop-tabs/tab-presence.ts';
import { openDesktopProviderTab } from './desktop-provider-tab.ts';
import { providerReturnPath } from './provider-return-path.ts';
import { awaitWebProviderReturn } from './web-provider-return.ts';

/** One started provider flow: point it at the provider once its URL is known, or drop it. */
export interface ProviderTab {
    cancel(): void;
    go(url: string): void;
}

/**
 * Opens a provider page (an OAuth or install page whose callback lands back
 * on this Server's App pages) so its return comes home: the provider's tab
 * closes and the tab that started the flow shows the returned page, outcome
 * query included. Desktop: a web tab beside this one, watched until it lands
 * on the App (`desktop-provider-tab.ts`). Web: a browser tab opened inside
 * the press, so a popup blocker allows it, whose landing hands its page back
 * over a BroadcastChannel (`web-provider-return.ts`). Whenever the starting
 * tab is gone, the return shows where it landed. Stable for the caller's
 * lifetime; call `begin` inside the press.
 */
export function useProviderTab(): (title: string) => ProviderTab {
    const tabs = useOptionalDesktopTabs();
    const fromTabId = useTabId();
    const navigate = useNavigate();
    const serverPath = serverRoute(useServerContext().server.slug);
    const latest = React.useRef({ fromTabId, navigate, serverPath, tabs });
    latest.current = { fromTabId, navigate, serverPath, tabs };

    return React.useCallback((title: string): ProviderTab => {
        const current = latest.current;
        const bridge = getDesktopBridge();
        if (current.tabs && bridge?.onBrowserState) {
            const { onBrowserState } = bridge;
            const desktopTabs = current.tabs;
            return {
                cancel: () => undefined,
                go: (url) => {
                    openDesktopProviderTab({
                        bridge: { onBrowserState },
                        fromTabId: current.fromTabId,
                        returns: (landed) =>
                            providerReturnPath(landed, {
                                origins: appOrigins(),
                                serverPath: current.serverPath,
                            }),
                        tabs: desktopTabs,
                        title,
                        url,
                    });
                },
            };
        }
        const popup = window.open('about:blank', '_blank');
        if (popup) {
            popup.opener = null;
        }
        return {
            cancel: () => popup?.close(),
            go: (url) => {
                if (popup) {
                    popup.location.href = url;
                } else {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
                awaitWebProviderReturn({
                    serverPath: current.serverPath,
                    show: (path) => {
                        latest.current.navigate(path);
                        window.focus();
                    },
                });
            },
        };
    }, []);
}
