import { Navigate } from 'react-router-dom';
import { useProjectChat } from '../../../hooks/projects/use-project-chat.ts';
import { useProjects } from '../../../hooks/projects/use-projects.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { serverSettingsSectionRoute } from '../../servers/server-routes.ts';
import { PageTopbar } from '../../shell/shell-topbar.tsx';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { ProjectBandMenu } from './project-band-menu.tsx';
import { ProjectCaptainsSection } from './project-captains-section.tsx';
import { ProjectGeneralSection } from './project-general-section.tsx';
import { ProjectHeader } from './project-header.tsx';
import { ProjectReposSection } from './project-repos-section.tsx';
import { ProjectWorkersSection } from './project-workers-section.tsx';

export function ProjectPage({ projectId, serverId }: { projectId: string; serverId: string }) {
    const { server } = useServerContext();
    const projects = useProjects(serverId);
    const project = projects.data?.find(
        (candidate) => candidate.chatId === projectId && !candidate.isHaus
    );
    const chat = useProjectChat(serverId, projectId);

    if (projects.data && !project) {
        return <Navigate replace to={serverSettingsSectionRoute(server.slug, 'projects')} />;
    }
    if (projects.error && !projects.data) {
        return (
            <SettingsPageColumn>
                <p className="text-danger text-sm" role="alert">
                    Couldn’t load this project. Try opening this page again.
                </p>
            </SettingsPageColumn>
        );
    }
    if (!(project && chat)) {
        return null;
    }
    const isArchived = Boolean(chat.archivedAt);

    return (
        <>
            <PageTopbar>
                <ProjectBandMenu chat={chat} slug={server.slug} />
            </PageTopbar>
            <SettingsPageColumn>
                <ProjectHeader chat={chat} project={project} />
                <ProjectGeneralSection chat={chat} project={project} />
                <ProjectCaptainsSection
                    isDisabled={isArchived}
                    projectId={project.chatId}
                    serverId={serverId}
                />
                <ProjectWorkersSection isDisabled={isArchived} project={project} />
                <ProjectReposSection slug={server.slug} />
            </SettingsPageColumn>
        </>
    );
}
