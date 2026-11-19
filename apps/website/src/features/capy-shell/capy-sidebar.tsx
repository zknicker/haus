import { Sidebar } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { Plus } from '@hugeicons/core-free-icons';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { SidebarNavigateProvider } from '../../hooks/shell/sidebar-navigate.tsx';
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
import type { CapySidebarSection, CaptainTile } from './sidebar-model.ts';
import { useCapySidebar } from './use-capy-sidebar.ts';

export function CapySidebar({
    lead,
    serverId,
    slug,
}: {
    lead: 'row' | 'strip';
    serverId: string;
    slug: string;
}) {
    const sections = useCapySidebar(serverId);
    const { pathname } = useLocation();
    const [creatingProject, setCreatingProject] = React.useState(false);
    const captains = React.useMemo(
        () => new Map(captainTilesOf(sections).map((tile) => [tile.agentId, tile])),
        [sections]
    );

    return (
        <SidebarNavigateProvider>
            {lead === 'row' ? <CapySidebarHeader slug={slug} /> : null}
            <ShellSidebarPageContent>
                {sections?.map((section) => (
                    <CapySidebarSectionView
                        captains={captains}
                        currentPath={pathname}
                        key={section.kind}
                        onCreateProject={() => setCreatingProject(true)}
                        section={section}
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
    captains,
    currentPath,
    onCreateProject,
    section,
    serverId,
    slug,
}: {
    captains: ReadonlyMap<string, CaptainTile>;
    currentPath: string;
    onCreateProject: () => void;
    section: CapySidebarSection;
    serverId: string;
    slug: string;
}) {
    const rowProps = { currentPath, serverId, slug };
    switch (section.kind) {
        case 'captains':
            return <CaptainTiles {...rowProps} tiles={section.tiles} />;
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
                        {section.rows.map((row) => (
                            <ProjectNavigationRow
                                {...rowProps}
                                captains={captains}
                                key={row.chatId}
                                row={row}
                            />
                        ))}
                    </Sidebar.Menu>
                </ChatGroup>
            );
        case 'open-tasks':
            return (
                <ChatGroup label="Open tasks">
                    <Sidebar.Menu aria-label="Open tasks">
                        {section.rows.map((row) => (
                            <OpenTaskNavigationRow {...rowProps} key={row.taskId} row={row} />
                        ))}
                    </Sidebar.Menu>
                </ChatGroup>
            );
        case 'people':
            return (
                <ChatGroup label="People">
                    <Sidebar.Menu aria-label="People">
                        {section.rows.map((row) => (
                            <PersonNavigationRow {...rowProps} key={row.chatId} row={row} />
                        ))}
                    </Sidebar.Menu>
                </ChatGroup>
            );
    }
}

function captainTilesOf(sections: readonly CapySidebarSection[] | null) {
    const captains = sections?.find((section) => section.kind === 'captains');
    return captains?.kind === 'captains' ? captains.tiles : [];
}
