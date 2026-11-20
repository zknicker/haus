export type HomeState<Project, Captain> =
    | { kind: 'loading' }
    | { kind: 'first-run'; needsCaptain: boolean; needsProject: boolean }
    | {
          captains: readonly Captain[];
          initialProjectId: string;
          kind: 'ready';
          projects: readonly Project[];
      };

export function homeState<Project extends { id: string }, Captain>({
    captains,
    lastChatId,
    projects,
}: {
    captains: readonly Captain[] | undefined;
    lastChatId: string | null;
    projects: readonly Project[] | undefined;
}) {
    if (!(projects && captains)) {
        return { kind: 'loading' } satisfies HomeState<Project, Captain>;
    }
    const initialProject = projects.find((project) => project.id === lastChatId) ?? projects[0];
    if (!initialProject || captains.length === 0) {
        return {
            kind: 'first-run',
            needsCaptain: captains.length === 0,
            needsProject: projects.length === 0,
        } satisfies HomeState<Project, Captain>;
    }
    return {
        captains,
        initialProjectId: initialProject.id,
        kind: 'ready',
        projects,
    } satisfies HomeState<Project, Captain>;
}

export type FirstRunAction = 'captain' | 'project';

export function firstRunCopy({
    canManage,
    needsCaptain,
    needsProject,
}: {
    canManage: boolean;
    needsCaptain: boolean;
    needsProject: boolean;
}) {
    const actions: FirstRunAction[] = [
        ...(needsProject ? ['project' as const] : []),
        ...(needsCaptain && canManage ? ['captain' as const] : []),
    ];
    const captainNote = needsCaptain && !canManage ? ' An Owner or Admin adds Captains.' : '';
    if (needsProject && needsCaptain) {
        return {
            actions,
            description: canManage
                ? 'Create a project for the work, then add a Captain to do it.'
                : `Create a project for the work.${captainNote}`,
            title: 'Set up your Haus',
        };
    }
    if (needsProject) {
        return {
            actions,
            description: 'Projects hold the work your Captains take on.',
            title: 'Create your first project',
        };
    }
    return {
        actions,
        description: canManage ? 'Captains take on the work you ask for here.' : captainNote.trim(),
        title: canManage ? 'Add your first Captain' : 'No Captains yet',
    };
}
