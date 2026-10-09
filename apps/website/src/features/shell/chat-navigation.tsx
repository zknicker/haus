import { Button } from '@heroui/react';
import { Sidebar } from '@heroui-pro/react';
import { Plus } from '@hugeicons/core-free-icons';
import { ArrowDown01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useAgentIds } from '../../hooks/members/use-agents.ts';
import { useChatNavigationLayout } from '../../hooks/servers/use-chats.ts';
import { SidebarNavigateProvider } from '../../hooks/shell/sidebar-navigate.tsx';
import { cn } from '../../lib/utils.ts';
import { activityRoute, inboxRoute, tasksRoute } from '../servers/server-routes.ts';
import { AgentDmNavigationRow } from './agent-dm-navigation-row.tsx';
import { ListedChatNavigationRow } from './chat-navigation-row.tsx';
import { useCommandMenu } from './command-menu-provider.tsx';
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
                            onPreload={() => onPreloadSection('inbox')}
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
                            href={activityRoute(slug)}
                            isCurrent={location.pathname.startsWith(activityRoute(slug))}
                            label="Activity"
                            onPreload={() => onPreloadSection('activity')}
                            tab="activity"
                        />
                    </Sidebar.Menu>
                </Sidebar.Group>
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

function ChatGroup({
    action,
    children,
    label,
}: {
    action?: React.ReactNode;
    children: React.ReactNode;
    label: string;
}) {
    const [collapsed, setCollapsed] = React.useState(false);

    return (
        <Sidebar.Group>
            {/* The label is the disclosure, so a long channel list can be folded
                away without spending a row on a control. */}
            <div className="group/section flex w-full items-center justify-between">
                <button
                    aria-expanded={!collapsed}
                    // ps mirrors the literal 0.5rem HeroUI pads menu rows with,
                    // so the caret keeps the icons' left edge at any density.
                    className="flex min-w-0 cursor-[var(--cursor-interactive)] items-center gap-0.5 rounded-lg ps-[0.5rem]"
                    onClick={() => setCollapsed((current) => !current)}
                    type="button"
                >
                    {/* Caret leads the label: it points at what it folds, and
                        keeps the disclosure on the sidebar's left rhythm. */}
                    <Icon
                        aria-hidden="true"
                        className={cn(
                            'shrink-0 text-muted transition-transform',
                            collapsed && '-rotate-90'
                        )}
                        icon={ArrowDown01Icon}
                        size={12}
                        style={{ height: 12, width: 12 }}
                    />
                    <Sidebar.GroupLabel className="px-0">{label}</Sidebar.GroupLabel>
                </button>
                {/* Quiet chrome: the action only appears on hover or focus,
                    the way HeroUI's own menu actions behave. */}
                <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/section:opacity-100">
                    {action}
                </span>
            </div>
            <div className={collapsed ? 'hidden' : undefined}>{children}</div>
        </Sidebar.Group>
    );
}
