import { Sidebar } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { Plus } from '@hugeicons/core-free-icons';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { SidebarNavigateProvider } from '../../hooks/shell/sidebar-navigate.tsx';
import {
    resolveSelectedAgentDmId,
    resolveSelectedChatId,
} from '../../routes/app/server-route-state.ts';
import { taskRoute } from '../servers/server-routes.ts';
import { ChatGroup } from '../shell/chat-navigation-group.tsx';
import { NewProjectDialog } from '../shell/new-project-dialog.tsx';
import { sidebarActionIconSize } from '../shell/section-header.tsx';
import { ShellSidebarPageContent } from '../shell/shell-sidebar.tsx';
import { CaptainTiles } from './captain-tiles.tsx';
import { CapySidebarHeader } from './capy-sidebar-header.tsx';
import {
    OpenTaskNavigationRow,
    PersonNavigationRow,
    ProjectNavigationRow,
} from './capy-sidebar-rows.tsx';
import type { CapySidebarSection } from './sidebar-layout.ts';
import { useCapySidebarSections } from './use-capy-sidebar.ts';

export function CapySidebar({
    lead,
    serverId,
    slug,
}: {
    lead: 'row' | 'strip';
    serverId: string;
    slug: string;
}) {
    const sections = useCapySidebarSections(serverId);
    const { pathname } = useLocation();
    const [creatingProject, setCreatingProject] = React.useState(false);
    const openNewProject = React.useCallback(() => setCreatingProject(true), []);
    const selection = {
        pathname,
        selectedAgentDmId: resolveSelectedAgentDmId(pathname, slug),
        selectedChatId: resolveSelectedChatId(pathname, slug),
    };

    return (
        <SidebarNavigateProvider>
            {lead === 'row' ? <CapySidebarHeader slug={slug} /> : null}
            <ShellSidebarPageContent>
                {sections?.map((section) => (
                    <CapySidebarSectionView
                        key={section.kind}
                        onCreateProject={openNewProject}
                        section={section}
                        selection={selection}
                        serverId={serverId}
                        slug={slug}
                    />
                ))}
            </ShellSidebarPageContent>
            <NewProjectDialog
                onClose={() => setCreatingProject(false)}
                open={creatingProject}
                serverId={serverId}
                slug={slug}
            />
        </SidebarNavigateProvider>
    );
}

function CapySidebarSectionView({
    onCreateProject,
    section,
    selection,
    serverId,
    slug,
}: {
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
                <ChatGroup
                    action={
                        <Button
                            aria-label="New project"
                            isIconOnly
                            onPress={onCreateProject}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon aria-hidden="true" icon={Plus} size={sidebarActionIconSize} />
                        </Button>
                    }
                    label="Projects"
                >
                    <Sidebar.Menu aria-label="Projects">
                        {section.chatIds.map((chatId) => (
                            <ProjectNavigationRow
                                chatId={chatId}
                                isCurrent={chatId === selection.selectedChatId}
                                key={chatId}
                                serverId={serverId}
                                slug={slug}
                            />
                        ))}
                    </Sidebar.Menu>
                </ChatGroup>
            );
        case 'open-tasks':
            return (
                <ChatGroup label="Open tasks">
                    <Sidebar.Menu aria-label="Open tasks">
                        {section.tasks.map((task) => (
                            <OpenTaskNavigationRow
                                isCurrent={selection.pathname === taskRoute(slug, task.key)}
                                key={task.taskId}
                                serverId={serverId}
                                slug={slug}
                                taskId={task.taskId}
                            />
                        ))}
                    </Sidebar.Menu>
                </ChatGroup>
            );
        case 'people':
            return (
                <ChatGroup label="People">
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
                </ChatGroup>
            );
    }
}
