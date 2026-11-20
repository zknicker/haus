import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildCapyShellCommandGroup } from '../../commands/capy-shell-commands.ts';
import { buildClaimCommandGroup } from '../../commands/claim-commands.ts';
import { buildCommandGroups } from '../../commands/server-commands.ts';
import { buildThemeCommandGroup } from '../../commands/theme-commands.ts';
import { useDevMode } from '../../components/dev-mode-provider.tsx';
import { useTheme } from '../../components/theme-provider.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useColorThemeDefinition } from '../../hooks/shell/use-color-theme.ts';
import { useCustomThemes } from '../../hooks/shell/use-custom-themes.ts';
import type { ServerSummary } from '../../lib/haus-server.tsx';
import { setCapyShell, useCapyShell } from '../capy-shell/capy-shell-preference.ts';
import { setShowClaimsInChat, useShowClaimsInChat } from '../claims/show-claims-in-chat.ts';
import { serverChatMessageRoute, serverSearchRoute } from '../servers/server-routes.ts';
import { CommandMenuMessageResults } from './command-menu-messages.tsx';
import { type AgentAvatarLookup, CommandMenuShell } from './command-menu.tsx';

export function CommandMenu({ server }: { server: ServerSummary }) {
    const { pathname } = useLocation();
    const navigateRoute = useNavigate();
    const { devMode, setDevMode } = useDevMode();
    const { forcedTheme, setTheme } = useTheme();
    const modeLocked = forcedTheme !== null;
    const { scene } = useColorThemeDefinition();
    const customThemes = useCustomThemes();
    const showClaimsInChat = useShowClaimsInChat();
    const capyShell = useCapyShell();
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
                capyShell,
                chats: chatItems,
                devMode,
                navigate,
                openAgentProfile,
                pathname,
                role: server.role,
                serverSlug: server.slug,
                setDevMode,
            }),
            buildClaimCommandGroup({ setShowClaimsInChat, showClaimsInChat }),
            buildThemeCommandGroup({ customThemes, modeLocked, scene, setTheme }),
            buildCapyShellCommandGroup({ capyShell, setCapyShell }),
        ],
        [
            agentItems,
            capyShell,
            chatItems,
            customThemes,
            devMode,
            modeLocked,
            navigate,
            openAgentProfile,
            pathname,
            scene,
            server,
            setDevMode,
            setTheme,
            showClaimsInChat,
        ]
    );
    const lookupAgentAvatarUrl = React.useMemo<AgentAvatarLookup>(() => {
        const avatarById = new Map(agentItems.map((agent) => [agent.id, agent.avatarUrl]));

        return (agentId) => (agentId ? (avatarById.get(agentId) ?? null) : null);
    }, [agentItems]);

    return (
        <CommandMenuShell commandGroups={commandGroups} lookupAgentAvatarUrl={lookupAgentAvatarUrl}>
            <CommandMenuMessageResults
                onOpenResult={(result) =>
                    navigate(serverChatMessageRoute(server.slug, result.chatId, result.id))
                }
                onSeeAll={(query) => navigate(serverSearchRoute(server.slug, query))}
                serverId={server.id}
            />
        </CommandMenuShell>
    );
}
