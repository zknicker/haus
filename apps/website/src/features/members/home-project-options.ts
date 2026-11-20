import type { Project } from '@haus/api';

export function homeProjectOptions(projects: readonly Project[]) {
    return projects
        .filter((project) => !(project.isHaus || project.archived))
        .map((project) => ({ id: project.chatId, label: `#${project.name}` }));
}
