import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildCommandGroups } from '../../commands/server-commands.ts';
import { buildTaskCommandGroup } from '../../commands/task-commands.ts';
import { buildThemeCommandGroup } from '../../commands/theme-commands.ts';
import { useDevMode } from '../../components/dev-mode-provider.tsx';
import { useTheme } from '../../components/theme-provider.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import type { ServerSummary } from '../../lib/haus-server.tsx';
import { serverChatRoute, serverSearchRoute } from '../servers/server-routes.ts';
import { setShowTasksInChat, useShowTasksInChat } from '../tasks/show-tasks-in-chat.ts';
import { type AgentAvatarLookup, CommandMenuShell } from './command-menu.tsx';
import { CommandMenuMessageResults } from './command-menu-messages.tsx';

export function CommandMenu({ server }: { server: ServerSummary }) {
    const { pathname } = useLocation();
    const navigateRoute = useNavigate();
    const { devMode, setDevMode } = useDevMode();
    const { setTheme } = useTheme();
    const showTasksInChat = useShowTasksInChat();
    const openAgentProfile = useOpenAgentProfile();
    const agents = useAgents(server.id);
    const chats = useChats(server.id);
    const agentItems = React.useMemo(() => agents.data ?? [], [agents.data]);
    const chatItems = React.useMemo(() => chats.data ?? [], [chats.data]);
    const navigate = React.useCallback(
        (path: string) => {
            void navigateRoute(path);
        },
        [navigateRoute]
    );
    const commandGroups = React.useMemo(
        () => [
            ...buildCommandGroups({
                agents: agentItems,
                chats: chatItems,
                devMode,
                navigate,
                openAgentProfile,
                pathname,
                role: server.role,
                serverSlug: server.slug,
                setDevMode,
            }),
            buildTaskCommandGroup({ setShowTasksInChat, showTasksInChat }),
            buildThemeCommandGroup(setTheme),
        ],
        [
            agentItems,
            chatItems,
            devMode,
            navigate,
            openAgentProfile,
            pathname,
            server,
            setDevMode,
            setTheme,
            showTasksInChat,
        ]
    );
    const lookupAgentAvatarUrl = React.useMemo<AgentAvatarLookup>(() => {
        const avatarById = new Map(agentItems.map((agent) => [agent.id, agent.avatarUrl]));

        return (agentId) => (agentId ? (avatarById.get(agentId) ?? null) : null);
    }, [agentItems]);

    return (
        <CommandMenuShell commandGroups={commandGroups} lookupAgentAvatarUrl={lookupAgentAvatarUrl}>
            <CommandMenuMessageResults
                onOpenChat={(chatId) => navigate(serverChatRoute(server.slug, chatId))}
                onSeeAll={(query) => navigate(serverSearchRoute(server.slug, query))}
                serverId={server.id}
            />
        </CommandMenuShell>
    );
}
