import type { Agent, Chat } from '@haus/api';
import { Button } from '@heroui/react';
import { Sidebar } from '@heroui-pro/react';
import { Plus } from '@hugeicons/core-free-icons';
import { ArrowDown01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { loadChannelIconCatalog } from '../../components/chats/channel-icon-catalog.ts';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import { inboxRoute, tasksRoute } from '../servers/server-routes.ts';
import { AgentDmNavigationRow } from './agent-dm-navigation-row.tsx';
import { ChatNavigationRow, chatNavigationName } from './chat-navigation-row.tsx';
import { useCommandMenu } from './command-menu-provider.tsx';
import { RouteTabIcon } from './route-tab-presentation.tsx';
import { sidebarActionIconSize } from './section-header.tsx';
import { ShellSidebarPageContent, useSidebarSurface } from './shell-sidebar.tsx';
import { SidebarInboxRow } from './sidebar-inbox-row.tsx';
import { SortableChannelList } from './sortable-channel-list.tsx';

export function ChatNavigation({
    agents,
    chats,
    needsYouCount = 0,
    onChangeChannelColor,
    onCreateAgent,
    onCreateChannel,
    onPreloadSection,
    selectedAgentDmId,
    selectedChatId,
    serverId,
    slug,
}: {
    agents: Agent[];
    chats: Chat[];
    /** The Inbox's "Needs you" total; 0 while it is unknown, which shows no badge. */
    needsYouCount?: number;
    onChangeChannelColor?: (chat: Chat, color: string) => void;
    onCreateAgent?: () => void;
    onCreateChannel: () => void;
    onPreloadSection: (section: 'inbox' | 'search' | 'tasks') => void;
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
    // Channel glyphs live in a lazily imported catalog. Warm it as soon as the
    // chat list mounts so rows and the picker have it before they need it.
    React.useEffect(() => {
        // The hash fallback already covers a failed load; this warm-up just
        // needs to kick the retryable import off.
        loadChannelIconCatalog().catch(() => undefined);
    }, []);
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const channels = chats.filter((chat) => chat.kind === 'channel');
    const humanDirectMessages = chats.filter((chat) => chat.kind === 'dm' && !chat.peerAgentId);
    const agentDirectMessages = agents.map((agent) => ({
        agent,
        chat: chats.find((chat) => chat.kind === 'dm' && chat.peerAgentId === agent.id) ?? null,
    }));

    return (
        <ShellSidebarPageContent>
            <Sidebar.Group>
                {/* One menu so Inbox, Search, and Tasks share one row anatomy
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
                        needsYouCount={needsYouCount}
                        onPreload={() => onPreloadSection('inbox')}
                        slug={slug}
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
                    <Sidebar.MenuItem
                        href={tasksRoute(slug)}
                        id="tasks"
                        isCurrent={location.pathname.startsWith(tasksRoute(slug))}
                        onHoverStart={() => onPreloadSection('tasks')}
                        textValue="Tasks"
                    >
                        <Sidebar.MenuIcon>
                            <RouteTabIcon size={16} tab="tasks" />
                        </Sidebar.MenuIcon>
                        <Sidebar.MenuItemContent>
                            <Sidebar.MenuLabel>Tasks</Sidebar.MenuLabel>
                        </Sidebar.MenuItemContent>
                    </Sidebar.MenuItem>
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
                    agents={agentById}
                    channels={channels}
                    key={serverId}
                    onChangeChannelColor={onChangeChannelColor}
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
                    {agentDirectMessages.map(({ agent, chat }) => (
                        <AgentDmNavigationRow
                            agent={agent}
                            chat={chat}
                            key={agent.id}
                            selectedAgentDmId={selectedAgentDmId}
                            selectedChatId={selectedChatId}
                            slug={slug}
                        />
                    ))}
                    {humanDirectMessages.map((chat) => (
                        <ChatNavigationRow
                            agent={null}
                            chat={chat}
                            key={chat.id}
                            name={chatNavigationName(chat, null)}
                            onChangeChannelColor={onChangeChannelColor}
                            selectedChatId={selectedChatId}
                            slug={slug}
                        />
                    ))}
                </Sidebar.Menu>
            </ChatGroup>
        </ShellSidebarPageContent>
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
