import type { Agent, Project } from '@haus/api';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Link } from 'react-router-dom';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChatAppearances } from '../../../hooks/servers/use-chats.ts';
import { settingsProjectRoute } from '../../servers/server-routes.ts';
import { SettingsFact } from '../layout/settings-text.tsx';
import { workerPlaceLabel } from './worker-place-options.ts';

export function ProjectRow({ project, slug }: { project: Project; slug: string }) {
    const chat = useChatAppearances(project.serverId).get(project.chatId);

    return (
        <ItemCard<'a'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left"
            render={(props) => <Link {...props} to={settingsProjectRoute(slug, project.chatId)} />}
        >
            <PressableFeedback.Highlight />
            <ChannelIconBox color={chat?.color ?? null} icon={chat?.icon ?? null} size="topbar" />
            <ItemCard.Content>
                <ItemCard.Title>#{project.name}</ItemCard.Title>
                <ItemCard.Description>{project.key}</ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action className="flex items-center gap-4">
                <ProjectCaptainFaces agentIds={project.homeAgentIds} serverId={project.serverId} />
                <SettingsFact className="w-28 truncate">
                    {workerPlaceLabel(project.defaultWorkerPlace)}
                </SettingsFact>
                <Icon aria-hidden="true" className="text-muted" icon={ArrowRight01Icon} size={16} />
            </ItemCard.Action>
        </ItemCard>
    );
}

function ProjectCaptainFaces({
    agentIds,
    serverId,
}: {
    agentIds: readonly string[];
    serverId: string;
}) {
    const agents = useAgents(serverId).data ?? noAgents;
    const captains = agentIds.flatMap((agentId) => {
        const agent = agents.find((candidate) => candidate.id === agentId);
        return agent ? [agent] : [];
    });
    if (captains.length === 0) {
        return <SettingsFact className="w-24 text-end">No Captains</SettingsFact>;
    }
    const visible = captains.slice(0, visibleCaptainCount);
    const remaining = captains.length - visible.length;

    return (
        <span className="flex w-24 items-center justify-end gap-1">
            <ul
                aria-label={`Captains: ${captains.map((agent) => agent.displayName).join(', ')}`}
                className="m-0 flex list-none items-center gap-1 p-0"
            >
                {visible.map((agent) => (
                    <li key={agent.id}>
                        <EntityAvatar name={agent.displayName} size={20} src={agent.avatarUrl} />
                    </li>
                ))}
            </ul>
            {remaining > 0 ? (
                <SettingsFact className="tabular-nums">+{remaining}</SettingsFact>
            ) : null}
        </span>
    );
}

const visibleCaptainCount = 3;
const noAgents: readonly Agent[] = [];
