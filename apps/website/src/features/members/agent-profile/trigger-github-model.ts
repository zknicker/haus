import {
    type GithubInstallation,
    type GithubTriggerConfigInput,
    type GithubTriggerProblem,
    type GithubTriggerView,
    githubTriggerEventsMax,
    githubTriggerRepositoriesMax,
    type McpConnection,
} from '@haus/api';
import { type GithubEventDraft, githubEventFromDraft } from './trigger-github-events-model.ts';

/** The GitHub half of the create form. */
export interface GithubTriggerDraft {
    events: GithubEventDraft[];
    installationId: string | null;
    repositories: string[];
    scope: 'installation' | 'repositories';
}

/** Why an active installation cannot take a Trigger for this Agent yet. */
export type GithubInstallationBlocker =
    | 'agent_access_required'
    | 'connect_github'
    | 'sign_in_required';

/** The part of a GitHub connection that decides whether an Agent may author on it. */
type GithubConnectionAccess = Pick<McpConnection, 'connected' | 'id'> & {
    grants: readonly Pick<McpConnection['grants'][number], 'agentId'>[];
};

/** One active installation the form lists, with what stops this Agent using it. */
export interface GithubInstallationOption {
    blocker: GithubInstallationBlocker | null;
    installation: GithubInstallation;
}

/**
 * Mirrors the Server's access-cache freshness window
 * (`githubAccessCacheMaxAgeMs` in apps/server/src/github/delivery-routing.ts).
 * The Server's refusal stays authoritative; this only keeps the form honest.
 */
const githubAccessFreshForMs = 24 * 60 * 60 * 1000;

/**
 * The active installations, each checked the way the Server checks authoring:
 * its GitHub connection is signed in, its access cache is fresh, and the
 * Agent holds a grant on that connection. Suspended and removed installations
 * are not offered at all.
 */
export function githubInstallationOptions(
    data: {
        connections: readonly GithubConnectionAccess[];
        installations: readonly GithubInstallation[];
    },
    context: { agentId: string; now: number }
): GithubInstallationOption[] {
    return data.installations
        .filter((installation) => installation.status === 'active')
        .map((installation) => ({
            blocker: installationBlocker(installation, data.connections, context),
            installation,
        }));
}

export function createGithubTriggerDraft(
    options: readonly GithubInstallationOption[]
): GithubTriggerDraft {
    const usable = options.filter((option) => option.blocker === null);
    return {
        events: [],
        // One installation is the common case; picking it for the reader saves a step.
        installationId: usable.length === 1 ? (usable[0]?.installation.id ?? null) : null,
        repositories: [],
        scope: 'installation',
    };
}

/** What a person does so this Agent can use the installation. */
export function githubInstallationRemedy(
    blocker: GithubInstallationBlocker,
    agentName: string
): string {
    switch (blocker) {
        case 'connect_github':
            return 'Connect GitHub in Settings → Connections';
        case 'sign_in_required':
            return 'Sign in to GitHub again in Settings → Connections';
        case 'agent_access_required':
            return `Grant ${agentName} access under the GitHub connection’s Agent Access`;
        default:
            return blocker satisfies never;
    }
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

function installationBlocker(
    installation: GithubInstallation,
    connections: readonly GithubConnectionAccess[],
    context: { agentId: string; now: number }
): GithubInstallationBlocker | null {
    const connection = connections.find((candidate) => candidate.id === installation.connectionId);
    if (!connection?.connected) {
        return 'connect_github';
    }
    const synced = installation.accessSyncedAt ? Date.parse(installation.accessSyncedAt) : null;
    if (synced === null || context.now - synced > githubAccessFreshForMs) {
        return 'sign_in_required';
    }
    return connection.grants.some((grant) => grant.agentId === context.agentId)
        ? null
        : 'agent_access_required';
}
