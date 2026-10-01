import { AppLayout } from '@heroui-pro/react';
import * as React from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppShell, AppShellDragRegion } from '../../components/ui/app-shell.tsx';
import { MessageNotifications } from '../../features/notifications/message-notifications.tsx';
import { AgentLifecycleProvider } from '../../features/servers/agent-lifecycle.tsx';
import { ConnectionNotice } from '../../features/servers/connection-notice.tsx';
import { readLastChatId, rememberLastChatId } from '../../features/servers/server-choice.ts';
import { serverSearchRoute, serverSettingsRoute } from '../../features/servers/server-routes.ts';
import { AppSidebar } from '../../features/shell/app-sidebar.tsx';
import { BrowserWorkspaceBody } from '../../features/shell/browser-workspace-body.tsx';
import { BrowserWorkspaceProvider } from '../../features/shell/browser-workspace-context.tsx';
import { CommandMenuProvider } from '../../features/shell/command-menu-provider.tsx';
import { resolvePrimaryTabIdentity } from '../../features/shell/primary-tab-identity.ts';
import { CommandMenu } from '../../features/shell/server-command-menu.tsx';
import { SettingsSidebar } from '../../features/shell/settings-sidebar.tsx';
import { ShellFrame, SidePaneProvider } from '../../features/shell/shell-side-pane.tsx';
import { ShellSidebar, ShellSidebarPage } from '../../features/shell/shell-sidebar.tsx';
import { ShellTopbar, TopbarProvider } from '../../features/shell/shell-topbar.tsx';
import { SidebarSettingsAction } from '../../features/shell/sidebar-settings-action.tsx';
import { WindowBand } from '../../features/shell/window-band.tsx';
import { HausUpdateFooterContainer } from '../../features/updates/haus-update-footer-container.tsx';
import { HausUpdateProvider } from '../../features/updates/use-haus-update.ts';
import { AgentActivityProvider } from '../../hooks/agents/use-current-agent-activity.tsx';
import { useDesktopDockBadge } from '../../hooks/desktop/use-desktop-dock-badge.ts';
import { useDesktopMenuNavigation } from '../../hooks/desktop/use-desktop-menu-navigation.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { ChatEventListeners } from '../../hooks/servers/chat-events/chat-event-listeners.tsx';
import { SyncHumanIdentity } from '../../hooks/servers/sync-human-identity.tsx';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useServer } from '../../hooks/servers/use-server.ts';
import { useAppSidebarWidth } from '../../hooks/shell/use-app-sidebar-width.ts';
import { useShellVariantSync } from '../../hooks/shell/use-shell-variant.ts';
import { useUnfocusableAppMain } from '../../hooks/shell/use-unfocusable-app-main.ts';
import { cn } from '../../lib/utils.ts';
import { preloadServerRoutes, preloadServerSection } from './server-route-modules.ts';
import {
    resolveActiveSection,
    resolveChatSectionRoute,
    resolveSelectedAgentDmId,
    resolveSelectedChatId,
    resolveSettingsSection,
    resolveSidebarPage,
} from './server-route-state.ts';

export function ServerLayout() {
    const { slug = '' } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const server = useServer(slug);
    const chats = useChats(server.data?.id);
    const agents = useAgents(server.data?.id);
    const currentServerSlug = server.data?.slug;
    const selectedChatId = resolveSelectedChatId(location.pathname, slug);
    const selectedAgentDmId = resolveSelectedAgentDmId(location.pathname, slug);

    const active = resolveActiveSection(location.pathname, slug);
    // Memoized: the workspace context fans this identity out to every tab consumer.
    const primaryTab = React.useMemo(() => {
        const primaryChat =
            chats.data?.find((chat) =>
                selectedChatId
                    ? chat.id === selectedChatId
                    : chat.kind === 'dm' && chat.peerAgentId === selectedAgentDmId
            ) ?? null;
        const peerAgentId = primaryChat ? primaryChat.peerAgentId : selectedAgentDmId;
        return resolvePrimaryTabIdentity({
            agent: agents.data?.find((agent) => agent.id === peerAgentId) ?? null,
            chat: primaryChat,
            section: active,
        });
    }, [active, agents.data, chats.data, selectedAgentDmId, selectedChatId]);

    useDesktopMenuNavigation({
        searchRoute: serverSearchRoute(slug),
        settingsRoute: serverSettingsRoute(slug),
    });
    useDesktopDockBadge((chats.data ?? []).reduce((total, chat) => total + chat.unreadCount, 0));
    useUnfocusableAppMain();
    // Desktop: the window layout's full-width band holds the tab strip. The web
    // has no layout and keeps its topbar in the main column.
    const topbarInWindow = useShellVariantSync() !== null;

    React.useEffect(() => {
        if (
            currentServerSlug &&
            selectedChatId &&
            chats.data?.some((chat) => chat.id === selectedChatId)
        ) {
            rememberLastChatId(currentServerSlug, selectedChatId);
        }
    }, [chats.data, currentServerSlug, selectedChatId]);
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

    const settingsSection = resolveSettingsSection(location.pathname, slug);
    const canOperate = server.data.role === 'owner' || server.data.role === 'admin';
    const activeSidebarPage = resolveSidebarPage(active);
    const chatSectionRoute = resolveChatSectionRoute(
        chats.data ?? [],
        selectedChatId ?? readLastChatId(slug),
        slug
    );
    const settingsAction = (
        <SidebarSettingsAction
            onOpenSettings={() => navigate(serverSettingsRoute(slug))}
            onPreloadSettings={() => preloadServerSection('settings')}
        />
    );
    return (
        <HausUpdateProvider canOperate={canOperate} serverId={server.data.id}>
            <SidePaneProvider>
                <TopbarProvider>
                    <CommandMenuProvider>
                        <BrowserWorkspaceProvider
                            chatRoute={active === 'chat'}
                            key={server.data.id}
                            primaryTab={primaryTab}
                            serverId={server.data.id}
                        >
                            <AppShell className="w-full">
                                <ChatEventListeners serverId={server.data.id}>
                                    <MessageNotifications
                                        key={server.data.id}
                                        server={server.data}
                                    />
                                </ChatEventListeners>
                                <SyncHumanIdentity serverId={server.data.id} />
                                <AppShellDragRegion />
                                <CommandMenu server={server.data} />
                                {topbarInWindow ? (
                                    <WindowBand>
                                        <ShellTopbar trailingAction={settingsAction} />
                                    </WindowBand>
                                ) : null}
                                <div className="app-shell-body flex min-h-0 flex-1">
                                    <AgentLifecycleProvider serverId={server.data.id}>
                                        <AgentActivityProvider serverId={server.data.id}>
                                            <ResizableAppLayout
                                                navigate={navigate}
                                                sidebar={
                                                    <ShellSidebar
                                                        activePage={activeSidebarPage}
                                                        footer={
                                                            <HausUpdateFooterContainer
                                                                slug={slug}
                                                            />
                                                        }
                                                        settingsAction={
                                                            topbarInWindow ? null : settingsAction
                                                        }
                                                        slug={slug}
                                                    >
                                                        <ShellSidebarPage
                                                            ariaLabel="Server"
                                                            value="server"
                                                        >
                                                            <AppSidebar
                                                                currentServer={server.data}
                                                                onPreloadSection={
                                                                    preloadServerSection
                                                                }
                                                                selectedAgentDmId={
                                                                    selectedAgentDmId
                                                                }
                                                                selectedChatId={selectedChatId}
                                                            />
                                                        </ShellSidebarPage>
                                                        <ShellSidebarPage
                                                            ariaLabel="Settings"
                                                            value="settings"
                                                        >
                                                            <SettingsSidebar
                                                                backRoute={chatSectionRoute}
                                                                canOperate={canOperate}
                                                                currentSection={settingsSection}
                                                                serverId={server.data.id}
                                                                slug={slug}
                                                            />
                                                        </ShellSidebarPage>
                                                    </ShellSidebar>
                                                }
                                            >
                                                <div className="app-shell-main flex h-full min-h-0 flex-col">
                                                    {topbarInWindow ? null : <ShellTopbar />}
                                                    <BrowserWorkspaceBody>
                                                        <ShellFrame>
                                                            <ConnectionNotice
                                                                serverError={Boolean(server.error)}
                                                                serverId={server.data.id}
                                                            />
                                                            <Outlet
                                                                context={{ server: server.data }}
                                                            />
                                                        </ShellFrame>
                                                    </BrowserWorkspaceBody>
                                                </div>
                                            </ResizableAppLayout>
                                        </AgentActivityProvider>
                                    </AgentLifecycleProvider>
                                </div>
                            </AppShell>
                        </BrowserWorkspaceProvider>
                    </CommandMenuProvider>
                </TopbarProvider>
            </SidePaneProvider>
        </HausUpdateProvider>
    );
}

/**
 * The one subscriber to the sidebar width store. Width updates arrive at
 * pointermove rate during a drag, so the layout above must not subscribe:
 * `sidebar` and `children` reach this wrapper as element references built by
 * a parent that does not re-render, and React bails out of both subtrees on
 * every drag frame. HeroUI's offcanvas wrapper declares its own
 * `--sidebar-width`, so the resized width rides a product token set here on
 * the AppLayout root; the theme layer wires the component token to read it.
 */
function ResizableAppLayout({
    children,
    navigate,
    sidebar,
}: {
    children: React.ReactNode;
    navigate: (path: string) => void;
    sidebar: React.ReactNode;
}) {
    const sidebarWidth = useAppSidebarWidth();

    return (
        <AppLayout
            className={cn(
                'h-full min-h-0 min-w-0 flex-1',
                sidebarWidth.resizing && 'app-sidebar-resizing'
            )}
            navigate={navigate}
            scrollMode="content"
            sidebar={sidebar}
            sidebarCollapsible="offcanvas"
            sidebarOpen
            style={{ '--app-sidebar-width': `${sidebarWidth.width}px` } as React.CSSProperties}
            toggleShortcut={false}
        >
            {children}
        </AppLayout>
    );
}
