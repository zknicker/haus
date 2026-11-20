export interface FirstRunNeeds {
    needsCaptain: boolean;
    needsDevice: boolean;
    needsProject: boolean;
}

export type HomeState<Project, Captain> =
    | { kind: 'loading' }
    | ({ kind: 'first-run' } & FirstRunNeeds)
    | {
          captains: readonly Captain[];
          initialProjectId: string;
          kind: 'ready';
          projects: readonly Project[];
      };

export function homeState<Project extends { id: string }, Captain>({
    captains,
    deviceCount,
    lastChatId,
    projects,
}: {
    captains: readonly Captain[] | undefined;
    deviceCount: number | null | undefined;
    lastChatId: string | null;
    projects: readonly Project[] | undefined;
}) {
    if (!(projects && captains) || (captains.length === 0 && deviceCount === undefined)) {
        return { kind: 'loading' } satisfies HomeState<Project, Captain>;
    }
    const initialProject = projects.find((project) => project.id === lastChatId) ?? projects[0];
    if (!initialProject || captains.length === 0) {
        return {
            kind: 'first-run',
            needsCaptain: captains.length === 0,
            needsDevice: captains.length === 0 && (deviceCount ?? 0) === 0,
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

export type FirstRunAction = 'captain' | 'device' | 'project';

export function firstRunCopy({
    canManage,
    needsCaptain,
    needsDevice,
    needsProject,
}: FirstRunNeeds & { canManage: boolean }) {
    const actions: FirstRunAction[] = [
        ...(needsDevice && canManage ? ['device' as const] : []),
        ...(needsProject ? ['project' as const] : []),
        ...(needsCaptain && !needsDevice && canManage ? ['captain' as const] : []),
    ];
    const projectLine = needsProject ? 'Create a project for the work.' : '';
    return {
        actions,
        description: [projectLine, needsCaptain ? captainLine(canManage, needsDevice) : '']
            .filter(Boolean)
            .join(' '),
        title: firstRunTitle({ canManage, needsCaptain, needsDevice, needsProject }),
    };
}

function captainLine(canManage: boolean, needsDevice: boolean) {
    if (!canManage) {
        return needsDevice
            ? 'An Owner or Admin connects a device and adds Captains.'
            : 'An Owner or Admin adds Captains.';
    }
    return needsDevice
        ? 'A Captain needs a device first, so connect one before adding a Captain.'
        : 'Add a Captain to take on the work you ask for here.';
}

function firstRunTitle({
    canManage,
    needsCaptain,
    needsDevice,
    needsProject,
}: FirstRunNeeds & { canManage: boolean }) {
    if (needsProject && needsCaptain) {
        return 'Set up your Haus';
    }
    if (needsProject) {
        return 'Create your first project';
    }
    if (!canManage) {
        return 'No Captains yet';
    }
    return needsDevice ? 'Connect a device' : 'Add your first Captain';
}
