import { captainChatRoute } from '../agent-panel/captain-chat-route.ts';
import { Sidebar } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { Add01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import {
    resolveSelectedCaptainId,
    resolveSelectedChatId,
} from '../../routes/app/server-route-state.ts';
import { CreateAgentDialog } from '../members/create-agent-dialog.tsx';
import { serverChatRoute, taskRoute } from '../servers/server-routes.ts';
import { ListedChatNavigationRow } from '../shell/chat-navigation-row.tsx';
import { NewProjectDialog } from '../shell/new-project-dialog.tsx';
import { ShellSidebarPageContent } from '../shell/shell-sidebar.tsx';
import { SortableChannelList } from '../shell/sortable-channel-list.tsx';
import { CaptainTiles } from './captain-tiles.tsx';
import { CapySection } from './capy-section.tsx';
import { OpenTaskNavigationRow, PersonNavigationRow } from './capy-sidebar-rows.tsx';
import type { CapySidebarSection } from './sidebar-layout.ts';
import { useCapySidebarSections } from './use-capy-sidebar.ts';
import { useUnreadRowWalk } from './use-unread-row-walk.ts';

export function CapySidebar({
    canManage,
    serverId,
    slug,
}: {
    canManage: boolean;
    serverId: string;
    slug: string;
}) {
    const sections = useCapySidebarSections(serverId);
    const { pathname } = useLocation();
    const navigate = useSidebarNavigate();
    const [creating, setCreating] = React.useState<'captain' | 'project' | null>(null);
    const openNewProject = React.useCallback(() => setCreating('project'), []);
    const openNewCaptain = React.useCallback(() => setCreating('captain'), []);
    const selection = {
        pathname,
        selectedAgentDmId: resolveSelectedCaptainId(pathname, slug),
        selectedChatId: resolveSelectedChatId(pathname, slug),
    };

    return (
        <>
            <UnreadRowWalkKeys sections={sections} serverId={serverId} slug={slug} />
            <ShellSidebarPageContent>
                <div className="capy-sidebar flex flex-col gap-6 pt-2">
                    {sections?.map((section) => (
                        <CapySidebarSectionView
                            key={section.kind}
                            onCreateCaptain={canManage ? openNewCaptain : undefined}
                            onCreateProject={openNewProject}
                            section={section}
                            selection={selection}
                            serverId={serverId}
                            slug={slug}
                        />
                    ))}
                </div>
            </ShellSidebarPageContent>
            <CreateAgentDialog
                onCreated={(agentId) => {
                    setCreating(null);
                    navigate(captainChatRoute(slug, agentId));
                }}
                onOpenChange={(open) => setCreating(open ? 'captain' : null)}
                open={creating === 'captain'}
                serverId={serverId}
            />
            <NewProjectDialog
                onClose={() => setCreating(null)}
                onCreated={(chatId) => navigate(serverChatRoute(slug, chatId))}
                open={creating === 'project'}
                serverId={serverId}
            />
        </>
    );
}

function CapySidebarSectionView({
    onCreateCaptain,
    onCreateProject,
    section,
    selection,
    serverId,
    slug,
}: {
    onCreateCaptain: (() => void) | undefined;
    onCreateProject: () => void;
    section: CapySidebarSection;
    selection: {
        pathname: string;
        selectedAgentDmId: string | undefined;
        selectedChatId: string | undefined;
    };
    serverId: string;
    slug: string;
}) {
    switch (section.kind) {
        case 'captains':
            return (
                <CaptainTiles
                    action={
                        onCreateCaptain ? (
                            <AddButton label="New Captain" onPress={onCreateCaptain} />
                        ) : undefined
                    }
                    agentDmChatIds={section.agentDmChatIds}
                    agentIds={section.agentIds}
                    selectedAgentDmId={selection.selectedAgentDmId}
                    selectedChatId={selection.selectedChatId}
                    serverId={serverId}
                    slug={slug}
                />
            );
        case 'projects':
            return (
                <CapySection
                    action={<AddButton label="New project" onPress={onCreateProject} />}
                    label="Projects"
                >
                    {section.teamRoomId ? (
                        <Sidebar.Menu aria-label="Team room">
                            <ListedChatNavigationRow
                                chatId={section.teamRoomId}
                                isCurrent={section.teamRoomId === selection.selectedChatId}
                                serverId={serverId}
                                slug={slug}
                            />
                        </Sidebar.Menu>
                    ) : null}
                    {section.chatIds.length > 0 ? (
                        <SortableChannelList
                            channelIds={section.chatIds}
                            key={serverId}
                            label="Projects"
                            noun="project"
                            selectedChatId={selection.selectedChatId}
                            serverId={serverId}
                            slug={slug}
                        />
                    ) : null}
                </CapySection>
            );
        case 'open-tasks':
            return (
                <CapySection label="Tasks">
                    <Sidebar.Menu aria-label="Tasks">
                        {section.tasks.map((task) => (
                            <OpenTaskNavigationRow
                                isCurrent={selection.pathname === taskRoute(slug, task.shortId)}
                                key={task.taskId}
                                serverId={serverId}
                                slug={slug}
                                taskId={task.taskId}
                            />
                        ))}
                    </Sidebar.Menu>
                </CapySection>
            );
        case 'people':
            return (
                <CapySection label="People">
                    <Sidebar.Menu aria-label="People">
                        {section.chatIds.map((chatId) => (
                            <PersonNavigationRow
                                chatId={chatId}
                                isCurrent={chatId === selection.selectedChatId}
                                key={chatId}
                                serverId={serverId}
                                slug={slug}
                            />
                        ))}
                    </Sidebar.Menu>
                </CapySection>
            );
    }
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <Button aria-label={label} isIconOnly onPress={onPress} size="sm" variant="ghost">
            <Icon aria-hidden="true" icon={Add01Icon} size={16} />
        </Button>
    );
}

function UnreadRowWalkKeys(props: Parameters<typeof useUnreadRowWalk>[0]) {
    useUnreadRowWalk(props);
    return null;
}
