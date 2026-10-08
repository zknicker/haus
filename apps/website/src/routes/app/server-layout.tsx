import * as React from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { ConnectionNotice } from '../../features/servers/connection-notice.tsx';
import { CommandMenuProvider } from '../../features/shell/command-menu-provider.tsx';
import { ShellFrame, SidePaneProvider } from '../../features/shell/shell-side-pane.tsx';
import { TopbarProvider } from '../../features/shell/shell-topbar.tsx';
import { HausUpdateProvider } from '../../features/updates/use-haus-update.ts';
import { useDesktopDockBadge } from '../../hooks/desktop/use-desktop-dock-badge.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useIdleChatWarming } from '../../hooks/servers/use-idle-chat-warming.ts';
import { useServer } from '../../hooks/servers/use-server.ts';
import { useShellVariantSync } from '../../hooks/shell/use-shell-variant.ts';
import { useUnfocusableAppMain } from '../../hooks/shell/use-unfocusable-app-main.ts';
import { isElectronDesktopApp } from '../../lib/desktop-bridge.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import { DesktopServerLayout } from './desktop-server-layout.tsx';
import { preloadServerRoutes } from './server-route-modules.ts';
import { ServerShell } from './server-shell.tsx';

/**
 * The Server shell route (`/s/:slug`). The web renders one routed page through
 * the window router's `Outlet`. Desktop renders equal-page tabs (ADR 0039):
 * each tab routes the same page table on its own, so the window route only
 * seeds a new window and mirrors the focused tab.
 */
export function ServerLayout() {
    const { slug = '' } = useParams();
    const server = useServer(slug);
    const chats = useChats(server.data?.id);
    const currentServerSlug = server.data?.slug;

    useDesktopDockBadge((chats.data ?? []).reduce((total, chat) => total + chat.unreadCount, 0));
    useUnfocusableAppMain();
    useIdleChatWarming(server.data?.id, chats.data);
    // Desktop: the window layout's full-width band holds the tab rows. The web
    // has no layout and keeps its topbar in the main column.
    const topbarInWindow = useShellVariantSync() !== null;

    React.useEffect(() => {
        if (!currentServerSlug) {
            return;
        }
        if (typeof window.requestIdleCallback === 'function') {
            const idleId = window.requestIdleCallback(preloadServerRoutes, { timeout: 1500 });
            return () => window.cancelIdleCallback(idleId);
        }

        const timeoutId = window.setTimeout(preloadServerRoutes, 250);
        return () => window.clearTimeout(timeoutId);
    }, [currentServerSlug]);

    if (server.error && !server.data) {
        return (
            <main className="flex h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
                <h1 className="font-semibold text-foreground text-lg">Server unavailable</h1>
                <p className="max-w-sm text-muted text-sm">{server.error.message}</p>
            </main>
        );
    }

    if (!server.data) {
        return null;
    }

    const canOperate = server.data.role === 'owner' || server.data.role === 'admin';
    return (
        <HausUpdateProvider canOperate={canOperate} serverId={server.data.id}>
            <TopbarProvider>
                <CommandMenuProvider>
                    {isElectronDesktopApp() ? (
                        <DesktopServerLayout
                            server={server.data}
                            serverError={Boolean(server.error)}
                        />
                    ) : (
                        <WebServerLayout
                            server={server.data}
                            serverError={Boolean(server.error)}
                            topbarInWindow={topbarInWindow}
                        />
                    )}
                </CommandMenuProvider>
            </TopbarProvider>
        </HausUpdateProvider>
    );
}

/** The web's one routed page, beside the chat side pane that hosts Threads, Files, and artifacts. */
function WebServerLayout({
    server,
    serverError,
    topbarInWindow,
}: {
    server: ServerDetail;
    serverError: boolean;
    topbarInWindow: boolean;
}) {
    return (
        <ServerShell
            main={
                <div className="flex min-h-0 min-w-0 flex-1">
                    <SidePaneProvider>
                        <ShellFrame>
                            <ConnectionNotice serverError={serverError} serverId={server.id} />
                            <Outlet context={{ server }} />
                        </ShellFrame>
                    </SidePaneProvider>
                </div>
            }
            server={server}
            topbarInWindow={topbarInWindow}
        />
    );
}
