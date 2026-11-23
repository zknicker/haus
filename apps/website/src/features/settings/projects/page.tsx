import { useProjects } from '../../../hooks/projects/use-projects.ts';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';

export function ProjectsSettings() {
    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Projects" />
        </SettingsPageColumn>
    );
}

export function ProjectSettings({ projectId, serverId }: { projectId: string; serverId: string }) {
    const project = useProjects(serverId).data?.find((candidate) => candidate.chatId === projectId);
    return (
        <SettingsPageColumn>
            <SettingsPageHeader title={project?.name ?? ''} />
        </SettingsPageColumn>
    );
}
