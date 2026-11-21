import type { Agent, Chat } from '@haus/api';
import * as React from 'react';
import { useChatListSelection } from '../../hooks/servers/use-chats.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { ComputerDiskNotices } from '../computers/computer-disk-notices.tsx';
import { HomeBackground } from '../home-background/home-background.tsx';
import { readLastChatId } from '../servers/server-choice.ts';
import { orderChannelIds } from '../shell/channel-order.ts';
import { PageBand } from '../shell/page-band.tsx';
import { HomeComposer } from './home-composer.tsx';
import { HomeFirstRun } from './home-first-run.tsx';
import { homeState } from './home-state.ts';
import { storedChannelOrder } from './use-capy-sidebar.ts';

export function CapyHomePage({
    canManage,
    serverId,
    slug,
}: {
    canManage: boolean;
    serverId: string;
    slug: string;
}) {
    useWindowTitle('Home');
    const captains = hausTrpc.agent.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: selectCaptainChoices }
    ).data;
    const needsDeviceCount = canManage && captains?.length === 0;
    const devices = hausTrpc.computer.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, enabled: needsDeviceCount, select: countDevices }
    );
    const deviceCount = needsDeviceCount && !devices.isError ? devices.data : null;
    const selectProjects = React.useCallback(
        (chats: Chat[]) => homeProjects(chats, storedChannelOrder(serverId)),
        [serverId]
    );
    const projects = useChatListSelection(serverId, selectProjects);
    const state = homeState({
        captains,
        deviceCount,
        lastChatId: readLastChatId(slug),
        projects,
    });

    return (
        <>
            <PageBand>
                <PageBand.Trail current="Home" />
            </PageBand>
            <HomeBackground />
            <div className="relative isolate flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-[8vh]">
                <div className="relative flex w-full max-w-xl flex-col gap-4">
                    <ComputerDiskNotices />
                    {state.kind === 'ready' ? (
                        <HomeComposer
                            captains={state.captains}
                            initialProjectId={state.initialProjectId}
                            key={serverId}
                            projects={state.projects}
                            serverId={serverId}
                            slug={slug}
                        />
                    ) : null}
                    {state.kind === 'first-run' ? (
                        <HomeFirstRun
                            canManage={canManage}
                            needsCaptain={state.needsCaptain}
                            needsDevice={state.needsDevice}
                            needsProject={state.needsProject}
                            serverId={serverId}
                            slug={slug}
                        />
                    ) : null}
                </div>
            </div>
        </>
    );
}

function countDevices(devices: readonly unknown[]) {
    return devices.length;
}

function selectCaptainChoices(agents: Agent[]) {
    return agents.map((agent) => ({
        avatarUrl: agent.avatarUrl,
        displayName: agent.displayName,
        id: agent.id,
    }));
}

function homeProjects(chats: Chat[], storedOrder: readonly string[]) {
    const channels = new Map(
        chats
            .filter((chat) => chat.kind === 'channel' && !chat.isAll)
            .map((chat) => [
                chat.id,
                {
                    color: chat.color,
                    icon: chat.icon,
                    id: chat.id,
                    name: chat.name,
                    participantAgentIds: chat.participantAgentIds,
                },
            ])
    );
    return orderChannelIds([...channels.keys()], storedOrder).flatMap(
        (id) => channels.get(id) ?? []
    );
}
