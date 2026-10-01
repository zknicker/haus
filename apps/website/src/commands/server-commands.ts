import type { Agent, Chat } from '@haus/api';
import { toast } from '@heroui/react';
import {
    ArchiveIcon,
    CommandIcon,
    ComputerIcon,
    CopyLinkIcon,
    CursorTextIcon,
    UserCircleIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import {
    agentProfileRoute,
    inboxRoute,
    serverArchivedChatsRoute,
    serverChatRoute,
    serverComputersRoute,
    serverRoute,
    serverSearchRoute,
    serverSettingsSectionRoute,
    tasksRoute,
} from '../features/servers/server-routes.ts';
import { staticSettingsNavItems } from '../features/settings/layout/navigation.ts';
import { getRouteTabIcon } from '../features/shell/route-tab-presentation.tsx';
import { writeClipboardText } from '../lib/clipboard.ts';
import { requestChatComposerFocus } from './chat-composer-focus.ts';
import type { AppCommand, AppCommandGroup } from './types.ts';
import { filterCommandGroups } from './types.ts';

export interface CommandContext {
    agents: Agent[];
    chats: Chat[];
    devMode: boolean;
    navigate: (path: string) => void;
    pathname: string;
    role: 'admin' | 'member' | 'owner';
    serverSlug: string;
    setDevMode: (enabled: boolean) => void;
}

export function buildCommandGroups(context: CommandContext): AppCommandGroup[] {
    const currentChatId = getCurrentChatId(context.pathname, context.serverSlug);
    const currentChat = context.chats.find((candidate) => candidate.id === currentChatId) ?? null;

    const groups: AppCommandGroup[] = [
        buildNavigationGroup(context, currentChat),
        ...buildChatGroups(context),
        ...(currentChat ? [buildCurrentChatGroup(context, currentChat)] : []),
        buildSettingsGroup(context),
        buildDeveloperGroup(context),
    ];

    return filterCommandGroups(groups);
}

export function getCurrentChatId(pathname: string, serverSlug: string): string | null {
    const prefix = `/s/${serverSlug}/chats/`;
    return pathname.startsWith(prefix)
        ? decodeURIComponent(pathname.slice(prefix.length).split('/')[0] ?? '')
        : null;
}

function buildNavigationGroup(context: CommandContext, currentChat: Chat | null): AppCommandGroup {
    const routes = [
        {
            icon: getRouteTabIcon('search'),
            id: 'search',
            route: serverSearchRoute(context.serverSlug),
            title: 'Search',
        },
        {
            icon: getRouteTabIcon('chat'),
            id: 'chat',
            route: currentChat
                ? serverChatRoute(context.serverSlug, currentChat.id)
                : serverRoute(context.serverSlug),
            title: 'Chat',
        },
        {
            icon: getRouteTabIcon('inbox'),
            id: 'inbox',
            route: inboxRoute(context.serverSlug),
            title: 'Inbox',
        },
        {
            icon: getRouteTabIcon('tasks'),
            id: 'tasks',
            route: tasksRoute(context.serverSlug),
            title: 'Tasks',
        },
        {
            icon: getRouteTabIcon('members'),
            id: 'members',
            route: serverSettingsSectionRoute(context.serverSlug, 'members'),
            title: 'Members',
        },
        {
            icon: ArchiveIcon,
            id: 'archived',
            route: serverArchivedChatsRoute(context.serverSlug),
            title: 'Archived chats',
        },
    ];

    return {
        commands: routes.map(
            (item): AppCommand => ({
                disabledReason: item.route ? null : 'No Chat is available yet.',
                icon: item.icon,
                id: `navigation.${item.id}`,
                keywords: ['go', 'open', item.id, item.title],
                run: () => {
                    if (item.route) {
                        context.navigate(item.route);
                    }
                },
                title: item.title,
            })
        ),
        id: 'navigation',
        title: 'Navigation',
    };
}

function buildChatGroups(context: CommandContext): AppCommandGroup[] {
    const toCommand = (chat: Chat): AppCommand => {
        const agent = chat.peerAgentId
            ? context.agents.find((candidate) => candidate.id === chat.peerAgentId)
            : null;
        const title =
            chat.kind === 'channel'
                ? (chat.name ?? 'channel')
                : (agent?.displayName ?? shortPeerLabel(chat));

        return {
            icon:
                chat.kind === 'channel'
                    ? { color: chat.color, icon: chat.icon, kind: 'channel' }
                    : {
                          agentId: chat.peerAgentId,
                          fallbackLabel: title,
                          kind: 'agent-avatar',
                      },
            id: `chat.${chat.id}`,
            keywords: [
                'chat',
                chat.kind === 'channel' ? 'channel room' : 'direct message dm',
                title,
                agent?.handle ?? '',
            ],
            run: () => context.navigate(serverChatRoute(context.serverSlug, chat.id)),
            title,
        };
    };

    return [
        {
            commands: context.chats.filter((chat) => chat.kind === 'channel').map(toCommand),
            id: 'channels',
            title: 'Channels',
        },
        {
            commands: context.chats
                .filter((chat) => chat.kind === 'dm' && !chat.peerAgentRetired)
                .map(toCommand),
            id: 'direct-messages',
            title: 'DMs',
        },
    ];
}

function buildCurrentChatGroup(context: CommandContext, currentChat: Chat): AppCommandGroup {
    const agent = currentChat.peerAgentId
        ? context.agents.find((candidate) => candidate.id === currentChat.peerAgentId)
        : null;

    return {
        commands: [
            ...(currentChat.peerAgentRetired
                ? []
                : [
                      {
                          icon: CursorTextIcon,
                          id: 'current-chat.focus-composer',
                          keywords: ['chat', 'composer', 'prompt', 'input', 'message'],
                          run: requestChatComposerFocus,
                          title: 'Focus Composer',
                      } satisfies AppCommand,
                  ]),
            {
                icon: CopyLinkIcon,
                id: 'current-chat.copy-link',
                keywords: ['chat', 'copy', 'link', 'url'],
                run: async () => {
                    await writeClipboardText(window.location.href);
                    toast.success('Chat link copied');
                },
                title: 'Copy Chat Link',
            },
            ...(agent
                ? [
                      {
                          icon: UserCircleIcon,
                          id: 'current-chat.open-agent-profile',
                          keywords: ['chat', 'agent', 'profile', 'assistant'],
                          run: () =>
                              context.navigate(agentProfileRoute(context.serverSlug, agent.id)),
                          title: 'Agent Profile',
                      } satisfies AppCommand,
                  ]
                : []),
        ],
        id: 'current-chat',
        title: 'Current Chat',
    };
}

function buildSettingsGroup(context: CommandContext): AppCommandGroup {
    return {
        commands: staticSettingsNavItems.map((item) => ({
            icon: item.icon,
            id: `settings.${item.id}`,
            keywords: ['settings', 'preferences', item.id, item.label],
            run: () => context.navigate(serverSettingsSectionRoute(context.serverSlug, item.id)),
            title: item.label,
        })),
        id: 'settings',
        title: 'Settings',
    };
}

function buildDeveloperGroup(context: CommandContext): AppCommandGroup {
    return {
        commands: [
            {
                icon: CommandIcon,
                id: 'developer.toggle-dev-mode',
                keywords: ['developer', 'debug', 'dev'],
                run: () => context.setDevMode(!context.devMode),
                title: context.devMode ? 'Turn Dev Mode Off' : 'Turn Dev Mode On',
            },
            ...(context.role === 'member'
                ? []
                : [
                      {
                          icon: ComputerIcon,
                          id: 'developer.computers',
                          keywords: ['developer', 'computer', 'execution', 'health'],
                          run: () => context.navigate(serverComputersRoute(context.serverSlug)),
                          title: 'Computers',
                      } satisfies AppCommand,
                  ]),
        ],
        id: 'developer',
        title: 'Developer',
    };
}

function shortPeerLabel(chat: Chat) {
    const id = chat.peerAgentDisplayName ?? chat.peerUserId ?? 'DM';
    return id.length > 24 ? `${id.slice(0, 21)}…` : id;
}
