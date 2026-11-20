import type { Agent } from '@haus/api';
import * as React from 'react';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
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
    const chats = useChats(serverId).data;
    const captains = hausTrpc.agent.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: selectCaptainChoices }
    ).data;
    const devices = hausTrpc.computer.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, enabled: canManage, select: countDevices }
    ).data;
    const deviceCount = canManage ? devices : null;
    const projects = React.useMemo(() => {
        if (!chats) {
            return undefined;
        }
        const channels = new Map(
            chats.filter((chat) => chat.kind === 'channel').map((chat) => [chat.id, chat])
        );
        return orderChannelIds([...channels.keys()], storedChannelOrder(serverId)).flatMap(
            (id) => channels.get(id) ?? []
        );
    }, [chats, serverId]);
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
            <div className="relative isolate flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-[8vh]">
                <div className="relative w-full max-w-xl">
                    {state.kind === 'ready' ? (
                        <HomeComposer
                            captains={state.captains}
                            initialProjectId={state.initialProjectId}
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
