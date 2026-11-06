import { Button } from '@heroui/react';
import { Sidebar } from '@heroui-pro/react';
import { Plus } from '@hugeicons/core-free-icons';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { usePreloadUnreadPreviews } from '../../hooks/inbox/use-unread-previews.ts';
import { useAgentIds } from '../../hooks/members/use-agents.ts';
import { useChatNavigationLayout } from '../../hooks/servers/use-chats.ts';
import { SidebarNavigateProvider } from '../../hooks/shell/sidebar-navigate.tsx';
import { preloadServerSection } from '../../routes/app/server-route-modules.ts';
import { activityRoute, inboxRoute, tasksRoute } from '../servers/server-routes.ts';
import { AgentDmNavigationRow } from './agent-dm-navigation-row.tsx';
import { ChatGroup } from './chat-navigation-group.tsx';
import { ListedChatNavigationRow } from './chat-navigation-row.tsx';
import { useCommandMenu } from './command-menu-provider.tsx';
import { OpenThreadsSection } from './open-threads-section.tsx';
import { RouteNavigationRow } from './route-navigation-row.tsx';
import { RouteTabIcon } from './route-tab-presentation.tsx';
import { sidebarActionIconSize } from './section-header.tsx';
import { ShellSidebarPageContent, useSidebarSurface } from './shell-sidebar.tsx';
import { SidebarInboxRow } from './sidebar-inbox-row.tsx';
import { SortableChannelList } from './sortable-channel-list.tsx';

/**
 * The Server sidebar. It reads only the list's structure (which chats, in what
 * order); each row reads its own entry, so a message re-renders the rows whose
 * unread count or name changed, not the navigation.
 */
export function ChatNavigation({
    inboxUnreadCount = 0,
    onCreateAgent,
    onCreateChannel,
    onPreloadSection,
    selectedAgentDmId,
    selectedChatId,
    serverId,
    slug,
}: {
    /** How many Chats the Inbox lists as Unread; 0 while unknown, which shows no badge. */
    inboxUnreadCount?: number;
    onCreateAgent?: () => void;
    onCreateChannel: () => void;
    onPreloadSection: (section: 'activity' | 'inbox' | 'search' | 'tasks') => void;
    selectedAgentDmId?: string;
    selectedChatId: string | undefined;
    serverId: string;
    slug: string;
}) {
    const location = useLocation();
    const { open: openCommandMenu } = useCommandMenu();
    // The Haus mark leads the titlebar strip on the web, so Inbox takes its own
    // glyph there; on the macOS desktop the lights lead that strip and the mark
    // stays on this row.
    const inboxMark = useSidebarSurface() === 'macos-desktop' ? 'ghost' : 'inbox';
    const layout = useChatNavigationLayout(serverId);
    const agentIds = useAgentIds(serverId);
    const preloadUnreadPreviews = usePreloadUnreadPreviews(serverId);

    return (
        <SidebarNavigateProvider>
            <ShellSidebarPageContent>
                <Sidebar.Group>
                    {/* One menu so Inbox, Search, Tasks, and Activity share one row anatomy
                    and one pitch. Inbox leads: it is the sidebar's top-left
                    anchor, wearing the Haus mark on the macOS desktop and the
                    route's own glyph on the web, where the mark leads the
                    titlebar strip instead. `shell.css` offsets that lead row by half the
                    shared shell band so its midline meets the content topbar's
                    — the row keeps its own height, fill, and pitch, so Search
                    follows it at the same step every other pair sits at.
                    Search opens the command palette rather than navigating, so
                    it is an action item that names its own shortcut. */}
                    <Sidebar.Menu
                        aria-label="Server"
                        onAction={(key) => {
                            if (key === 'search') {
                                openCommandMenu();
                            }
                        }}
                    >
                        <SidebarInboxRow
                            isCurrent={location.pathname.startsWith(inboxRoute(slug))}
                            mark={inboxMark}
                            onPreload={() => {
                                onPreloadSection('inbox');
                                preloadUnreadPreviews();
                            }}
                            slug={slug}
                            unreadCount={inboxUnreadCount}
                        />
                        <Sidebar.MenuItem
                            id="search"
                            onHoverStart={() => onPreloadSection('search')}
                            textValue="Search"
                        >
                            <Sidebar.MenuIcon>
                                <RouteTabIcon size={16} tab="search" />
                            </Sidebar.MenuIcon>
                            <Sidebar.MenuItemContent>
                                <Sidebar.MenuLabel>Search</Sidebar.MenuLabel>
                            </Sidebar.MenuItemContent>
                        </Sidebar.MenuItem>
                        <RouteNavigationRow
                            href={tasksRoute(slug)}
                            isCurrent={location.pathname.startsWith(tasksRoute(slug))}
                            label="Tasks"
                            onPreload={() => onPreloadSection('tasks')}
                            tab="tasks"
                        />
                        <RouteNavigationRow
                            href={`/s/${slug}/artifacts`}
                            isCurrent={location.pathname.startsWith(`/s/${slug}/artifacts`)}
                            label="Files"
                            onPreload={() => preloadServerSection('artifacts')}
                            tab="artifacts"
                        />
                        <RouteNavigationRow
                            href={activityRoute(slug)}
                            isCurrent={location.pathname.startsWith(activityRoute(slug))}
                            label="Activity"
                            onPreload={() => onPreloadSection('activity')}
                            tab="activity"
                        />
                    </Sidebar.Menu>
                </Sidebar.Group>
                <OpenThreadsSection
                    currentPath={location.pathname}
                    serverId={serverId}
                    slug={slug}
                />
                <ChatGroup
                    action={
                        <Button
                            aria-label="New channel"
                            isIconOnly
                            onPress={onCreateChannel}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon aria-hidden="true" icon={Plus} size={sidebarActionIconSize} />
                        </Button>
                    }
                    label="Channels"
                >
                    <SortableChannelList
                        channelIds={layout.channelIds}
                        key={serverId}
                        selectedChatId={selectedChatId}
                        serverId={serverId}
                        slug={slug}
                    />
                </ChatGroup>
                <ChatGroup
                    action={
                        onCreateAgent ? (
                            <Button
                                aria-label="New agent"
                                isIconOnly
                                onPress={onCreateAgent}
                                size="sm"
                                variant="ghost"
                            >
                                <Icon aria-hidden="true" icon={Plus} size={sidebarActionIconSize} />
                            </Button>
                        ) : undefined
                    }
                    label="Direct messages"
                >
                    <Sidebar.Menu aria-label="Direct messages">
                        {agentIds.map((agentId) => (
                            <AgentDmNavigationRow
                                agentId={agentId}
                                isCurrent={
                                    agentId === selectedAgentDmId ||
                                    (selectedChatId !== undefined &&
                                        layout.agentDmChatIds[agentId] === selectedChatId)
                                }
                                key={agentId}
                                serverId={serverId}
                                slug={slug}
                            />
                        ))}
                        {layout.humanDmIds.map((chatId) => (
                            <ListedChatNavigationRow
                                chatId={chatId}
                                isCurrent={chatId === selectedChatId}
                                key={chatId}
                                serverId={serverId}
                                slug={slug}
                            />
                        ))}
                    </Sidebar.Menu>
                </ChatGroup>
            </ShellSidebarPageContent>
        </SidebarNavigateProvider>
    );
}
