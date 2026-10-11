import {
    type GithubInstallation,
    type GithubInstallCandidate,
    githubTriggerEventPermission,
    type Trigger,
} from '@haus/api';

/** "All repositories" or a count of what the connection's user can reach. */
export function githubRepositoryScopeLabel(
    installation: Pick<GithubInstallation, 'accessibleRepositoryCount' | 'repositorySelection'>
) {
    if (installation.repositorySelection === 'all') {
        return 'All repositories';
    }
    const count = installation.accessibleRepositoryCount;
    return count === 1 ? '1 repository' : `${count} repositories`;
}

/** An unbound installation reports its selection, not a count Haus has not synced. */
export function githubCandidateDescription(candidate: GithubInstallCandidate) {
    return candidate.repositorySelection === 'all' ? 'All repositories' : 'Selected repositories';
}

/** Every App permission a Trigger event can need; one missing means an update is pending. */
const triggerPermissions = [...new Set(Object.values(githubTriggerEventPermission))];

/**
 * The one exceptional state an installation row names. Active with every
 * permission is the norm and carries no chip.
 */
export function githubInstallationStatus(
    installation: Pick<GithubInstallation, 'permissions' | 'status'>
): string | null {
    if (installation.status === 'removed') {
        return 'Removed';
    }
    if (installation.status === 'suspended') {
        return 'Suspended';
    }
    const missing = triggerPermissions.some((permission) => !installation.permissions[permission]);
    return missing ? 'Permissions update needed' : null;
}

/** Where an owner changes repositories, permissions, or suspension on GitHub. */
export function githubInstallationSettingsUrl(
    installation: Pick<GithubInstallation, 'account' | 'githubInstallationId'>
) {
    const id = installation.githubInstallationId;
    return installation.account.type === 'Organization'
        ? `https://github.com/organizations/${encodeURIComponent(installation.account.login)}/settings/installations/${id}`
        : `https://github.com/settings/installations/${id}`;
}

/** The undeleted Triggers that listen through this installation. */
export function triggersOnInstallation(triggers: readonly Trigger[], installationId: string) {
    return triggers.filter(
        (trigger) => trigger.kind === 'github' && trigger.github.installationId === installationId
    );
}

/** The removal confirmation names every Trigger that stops firing. */
export function githubRemovalBody(login: string, dependents: readonly Trigger[]) {
    const stays = `The Haus App stays installed on ${login} until an owner uninstalls it on GitHub.`;
    if (dependents.length === 0) {
        return `No Triggers use this installation. ${stays}`;
    }
    const names = dependents.map((trigger) => trigger.title).join(', ');
    const verb = dependents.length === 1 ? 'stops' : 'stop';
    return `${names} ${verb} firing, and ${dependents.length === 1 ? 'its Agent is' : 'their Agents are'} told why. ${stays}`;
}

export interface GithubSetupNotice {
    description: string;
    status: 'accent' | 'danger' | 'success';
    title: string;
}

const refusalNotices: Record<string, Omit<GithubSetupNotice, 'status'>> = {
    github_admin_required: {
        description: 'Only a Server Owner or Admin can add a GitHub installation.',
        title: 'Not added',
    },
    github_installation_already_bound: {
        description: 'That installation already belongs to another Haus Server or connection.',
        title: 'Already in use',
    },
    github_installation_not_found: {
        description: 'GitHub did not report the installation. Try Install on GitHub again.',
        title: 'Installation not found',
    },
    github_owner_required: {
        description:
            'Only an owner of the GitHub account can add its installation. Ask an owner to sign in and add it.',
        title: 'Owner required',
    },
    github_sign_in_required: {
        description: 'Sign in to GitHub again, then add the installation.',
        title: 'Sign in required',
    },
    github_unavailable: {
        description: 'GitHub did not answer. Use Add existing installation to try again.',
        title: 'GitHub unavailable',
    },
};

/** What the setup redirect's outcome means, in the connection page's words. */
export function githubSetupNotice(outcome: string): GithubSetupNotice {
    if (outcome === 'bound') {
        return {
            description: 'Agents with access to this connection can use it now.',
            status: 'success',
            title: 'Installation added',
        };
    }
    if (outcome === 'requested') {
        return {
            description:
                'GitHub sent your request to an owner of that account. Once they install the Haus App, add it here.',
            status: 'accent',
            title: 'Install requested',
        };
    }
    const notice = refusalNotices[outcome] ?? {
        description: 'The installation was not added. Try Install on GitHub again.',
        title: 'Not added',
    };
    return { ...notice, status: 'danger' };
}
