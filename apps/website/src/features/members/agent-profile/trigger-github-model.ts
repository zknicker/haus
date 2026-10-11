import {
    type GithubInstallation,
    type GithubTriggerConfigInput,
    type GithubTriggerProblem,
    type GithubTriggerView,
    githubTriggerEventsMax,
    githubTriggerRepositoriesMax,
} from '@haus/api';
import { type GithubEventDraft, githubEventFromDraft } from './trigger-github-events-model.ts';

/** The GitHub half of the create form. */
export interface GithubTriggerDraft {
    events: GithubEventDraft[];
    installationId: string | null;
    repositories: string[];
    scope: 'installation' | 'repositories';
}

export function createGithubTriggerDraft(
    installations: readonly GithubInstallation[]
): GithubTriggerDraft {
    const usable = githubAuthorableInstallations(installations);
    return {
        events: [],
        // One installation is the common case; picking it for the reader saves a step.
        installationId: usable.length === 1 ? (usable[0]?.id ?? null) : null,
        repositories: [],
        scope: 'installation',
    };
}

/** Only an active installation accepts a new Trigger. */
export function githubAuthorableInstallations(installations: readonly GithubInstallation[]) {
    return installations.filter((installation) => installation.status === 'active');
}

/**
 * The wire configuration, or null while the draft is incomplete: an
 * installation, at least one repository when scoped to repositories, and one
 * to ten valid events.
 */
export function githubConfigFromDraft(draft: GithubTriggerDraft): GithubTriggerConfigInput | null {
    if (!draft.installationId) {
        return null;
    }
    if (
        draft.scope === 'repositories' &&
        (draft.repositories.length === 0 ||
            draft.repositories.length > githubTriggerRepositoriesMax)
    ) {
        return null;
    }
    if (draft.events.length === 0 || draft.events.length > githubTriggerEventsMax) {
        return null;
    }
    const events = draft.events.map(githubEventFromDraft);
    if (events.some((entry) => entry === null)) {
        return null;
    }
    return {
        events: events.flatMap((entry) => (entry ? [entry] : [])),
        installationId: draft.installationId,
        repositories:
            draft.scope === 'installation'
                ? { scope: 'installation' }
                : { names: draft.repositories, scope: 'repositories' },
    };
}

export function githubScopeSummary(view: Pick<GithubTriggerView, 'repositories'>) {
    return view.repositories.scope === 'installation'
        ? 'All accessible repositories'
        : view.repositories.names.join(', ');
}

const problemTitles: Record<GithubTriggerProblem, string> = {
    agent_access_revoked: 'Agent access revoked',
    installation_removed: 'Installation removed',
    installation_suspended: 'Installation suspended',
    permissions_missing: 'Permissions missing',
    repositories_unavailable: 'Repositories unavailable',
    sign_in_required: 'Sign in required',
};

/** The short name a list row's chip and the detail banner's title share. */
export function githubProblemTitle(problem: GithubTriggerProblem) {
    return problemTitles[problem];
}

/** What puts a GitHub Trigger's problem right, in one or two sentences. */
export function githubProblemFix(
    problem: GithubTriggerProblem,
    context: { agentName: string; login: string }
): string {
    switch (problem) {
        case 'installation_removed':
            return `The Haus App installation on ${context.login} was removed from Haus. Install it again from Settings → Connections → GitHub, then recreate this trigger.`;
        case 'installation_suspended':
            return `The Haus App is suspended on ${context.login}. An owner of that account must unsuspend it on GitHub.`;
        case 'repositories_unavailable':
            return 'A selected repository is no longer reachable through the installation. Add it back to the installation on GitHub.';
        case 'permissions_missing':
            return `The installation on ${context.login} has not accepted a permission these events need. An owner must accept the Haus App’s permission update on GitHub.`;
        case 'agent_access_revoked':
            return `${context.agentName} no longer has access to the GitHub connection. Turn it back on under the connection’s Agent Access.`;
        case 'sign_in_required':
            return 'GitHub needs a fresh sign-in. Sign in again from Settings → Connections → GitHub.';
        default:
            return problem satisfies never;
    }
}
