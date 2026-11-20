import { EmptyState } from '@heroui-pro/react';
import { Folder01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { readLastChatId } from '../servers/server-choice.ts';
import { orderChannelIds } from '../shell/channel-order.ts';
import { PageBand } from '../shell/page-band.tsx';
import { HomeComposer } from './home-composer.tsx';
import { storedChannelOrder } from './use-capy-sidebar.ts';

export function CapyHomePage({ serverId, slug }: { serverId: string; slug: string }) {
    useWindowTitle('Home');
    const chats = useChats(serverId).data;
    const captains = useAgentAppearances(serverId);
    const projects = React.useMemo(() => {
        const channels = new Map(
            (chats ?? []).filter((chat) => chat.kind === 'channel').map((chat) => [chat.id, chat])
        );
        return orderChannelIds([...channels.keys()], storedChannelOrder(serverId)).flatMap(
            (id) => channels.get(id) ?? []
        );
    }, [chats, serverId]);
    const lastChatId = readLastChatId(slug);
    const initialProject =
        projects.find((project) => project.id === lastChatId) ??
        projects.find((project) => project.isAll) ??
        projects[0];

    return (
        <>
            <PageBand>
                <PageBand.Trail current="Home" />
            </PageBand>
            <div className="relative isolate flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-[8vh]">
                <div className="relative w-full max-w-xl">
                    {chats && initialProject ? (
                        <HomeComposer
                            captains={captains}
                            initialProjectId={initialProject.id}
                            projects={projects}
                            serverId={serverId}
                            slug={slug}
                        />
                    ) : null}
                    {chats && !initialProject ? <NoProjects /> : null}
                </div>
            </div>
        </>
    );
}

function NoProjects() {
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={Folder01Icon} />
                </EmptyState.Media>
                <EmptyState.Title>No projects yet</EmptyState.Title>
                <EmptyState.Description>
                    Create a project from the sidebar to begin.
                </EmptyState.Description>
            </EmptyState.Header>
        </EmptyState>
    );
}
