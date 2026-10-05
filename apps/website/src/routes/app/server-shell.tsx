import { AppLayout } from '@heroui-pro/react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppShell, AppShellDragRegion } from '../../components/ui/app-shell.tsx';
import { MessageNotifications } from '../../features/notifications/message-notifications.tsx';
import { AgentLifecycleProvider } from '../../features/servers/agent-lifecycle.tsx';
import { readLastChatId, rememberLastChatId } from '../../features/servers/server-choice.ts';
import { serverSettingsRoute } from '../../features/servers/server-routes.ts';
import { AppSidebar } from '../../features/shell/app-sidebar.tsx';
import { CommandMenu } from '../../features/shell/server-command-menu.tsx';
import { SettingsSidebar } from '../../features/shell/settings-sidebar.tsx';
import { ShellSidebar, ShellSidebarPage } from '../../features/shell/shell-sidebar.tsx';
import { ShellTopbar } from '../../features/shell/shell-topbar.tsx';
import { SidebarSettingsAction } from '../../features/shell/sidebar-settings-action.tsx';
import { WindowBand } from '../../features/shell/window-band.tsx';
import { HausUpdateFooterContainer } from '../../features/updates/haus-update-footer-container.tsx';
import { AgentActivityProvider } from '../../hooks/agents/use-current-agent-activity.tsx';
import { ChatEventListeners } from '../../hooks/servers/chat-events/chat-event-listeners.tsx';
import { SyncHumanIdentity } from '../../hooks/servers/sync-human-identity.tsx';
import { useChats } from '../../hooks/servers/use-chats.ts';
import {
    setAppSidebarOpen,
    useDesktopSidebarToggle,
} from '../../hooks/shell/use-app-sidebar-open.ts';
import { useAppSidebarWidth } from '../../hooks/shell/use-app-sidebar-width.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import { cn } from '../../lib/utils.ts';
import { preloadServerSection } from './server-route-modules.ts';
import {
    resolveActiveSection,
    resolveChatSectionRoute,
    resolveSelectedAgentDmId,
    resolveSelectedChatId,
    resolveSettingsSection,
    resolveSidebarPage,
} from './server-route-state.ts';

/**
 * The Server's chrome: sidebar, command menu, notifications, and the main
 * column around `main`. It reads the location it runs under — the window
 * route on the web, the focused pane's current tab on desktop (ADR 0039) —
 * so the sidebar's selection and its links follow the page you are on.
 */
export function ServerShell({
    main,
    server,
    topbarInWindow,
}: {
    main: React.ReactNode;
    server: ServerDetail;
    /** Desktop: the full-width window band holds the tab rows above the columns. */
    topbarInWindow: boolean;
}) {
    const { slug } = server;
    const location = useLocation();
    const navigate = useNavigate();
    const chats = useChats(server.id);
    const selectedChatId = resolveSelectedChatId(location.pathname, slug);
    const selectedAgentDmId = resolveSelectedAgentDmId(location.pathname, slug);
    const active = resolveActiveSection(location.pathname, slug);

    React.useEffect(() => {
        if (selectedChatId && chats.data?.some((chat) => chat.id === selectedChatId)) {
            rememberLastChatId(slug, selectedChatId);
        }
    }, [chats.data, selectedChatId, slug]);

    const settingsSection = resolveSettingsSection(location.pathname, slug);
    const canOperate = server.role === 'owner' || server.role === 'admin';
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
            // ⌘, is the desktop App menu's Settings… item; the web has no such key.
            shortcut={topbarInWindow ? '⌘,' : undefined}
        />
    );
    return (
        <AppShell className="w-full">
            <ChatEventListeners serverId={server.id}>
                <MessageNotifications key={server.id} server={server} />
            </ChatEventListeners>
            <SyncHumanIdentity serverId={server.id} />
            <AppShellDragRegion />
            <CommandMenu server={server} />
            {topbarInWindow ? (
                <WindowBand>
                    <ShellTopbar />
                </WindowBand>
            ) : null}
            <div className="app-shell-body flex min-h-0 flex-1">
                <AgentLifecycleProvider serverId={server.id}>
                    <AgentActivityProvider serverId={server.id}>
                        <ResizableAppLayout
                            navigate={navigate}
                            sidebar={
                                <ShellSidebar
                                    activePage={activeSidebarPage}
                                    footer={<HausUpdateFooterContainer slug={slug} />}
                                    settingsAction={settingsAction}
                                    settingsSlot={topbarInWindow ? 'footer' : 'titlebar'}
                                    slug={slug}
                                >
                                    <ShellSidebarPage ariaLabel="Server" value="server">
                                        <AppSidebar
                                            currentServer={server}
                                            onPreloadSection={preloadServerSection}
                                            selectedAgentDmId={selectedAgentDmId}
                                            selectedChatId={selectedChatId}
                                        />
                                    </ShellSidebarPage>
                                    <ShellSidebarPage ariaLabel="Settings" value="settings">
                                        <SettingsSidebar
                                            backRoute={chatSectionRoute}
                                            canOperate={canOperate}
                                            currentSection={settingsSection}
                                            serverId={server.id}
                                            slug={slug}
                                        />
                                    </ShellSidebarPage>
                                </ShellSidebar>
                            }
                        >
                            <div className="app-shell-main flex h-full min-h-0 flex-col">
                                {topbarInWindow ? null : <ShellTopbar />}
                                <div className="flex min-h-0 flex-1">{main}</div>
                            </div>
                        </ResizableAppLayout>
                    </AgentActivityProvider>
                </AgentLifecycleProvider>
            </div>
        </AppShell>
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
    const sidebarOpen = useDesktopSidebarToggle();

    return (
        <AppLayout
            className={cn(
                'h-full min-h-0 min-w-0 flex-1',
                sidebarWidth.resizing && 'app-sidebar-resizing'
            )}
            navigate={navigate}
            onSidebarOpenChange={setAppSidebarOpen}
            scrollMode="content"
            sidebar={sidebar}
            sidebarCollapsible="offcanvas"
            sidebarOpen={sidebarOpen}
            style={{ '--app-sidebar-width': `${sidebarWidth.width}px` } as React.CSSProperties}
            toggleShortcut={false}
        >
            {children}
        </AppLayout>
    );
}
