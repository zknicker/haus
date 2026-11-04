import type { AgentTrigger, GithubTriggerEvent, GithubTriggerProblem } from '@haus/api';
import { formatUtcTime } from '../agent-format.ts';

// How `haus trigger` prints a Trigger. A webhook is reached at its URL; a
// GitHub Trigger has none, so it prints its installation, scope, events, and
// any problem instead. Neither view ever carries a secret.

type GithubAgentTrigger = Extract<AgentTrigger, { kind: 'github' }>;

/** One header line per Trigger, plus detail lines for a GitHub Trigger. */
export function describeTrigger(trigger: AgentTrigger): string {
    const fired = trigger.lastFiredAt
        ? `${trigger.fireCount} fires, last ${formatUtcTime(trigger.lastFiredAt)}`
        : 'never fired';
    if (trigger.kind === 'webhook') {
        return `${trigger.id} [webhook · ${trigger.status}] "${trigger.title}" — ${fired}, anchored in ${trigger.anchorTarget} — ${trigger.url}`;
    }
    const problem = trigger.github.problem
        ? ` · degraded: ${problemLabel(trigger.github.problem)}`
        : '';
    return [
        `${trigger.id} [github · ${trigger.status}${problem}] "${trigger.title}" — ${fired}, anchored in ${trigger.anchorTarget} — GitHub ${trigger.github.installationLogin}`,
        ...githubDetailLines(trigger),
    ].join('\n');
}

/** What the human has to do about a problem; the Agent cannot fix any of them itself. */
export function problemFix(problem: GithubTriggerProblem): string {
    switch (problem) {
        case 'installation_removed':
            return 'The Haus GitHub App was uninstalled or removed from Haus. A GitHub org owner reinstalls it, and a Haus Owner or Admin adds it under Settings → Connections → GitHub.';
        case 'installation_suspended':
            return 'A GitHub org owner suspended the Haus App. They unsuspend it on GitHub.';
        case 'repositories_unavailable':
            return 'A selected repository left the installation or the GitHub user’s access. Ask a GitHub org owner to grant it again, or recreate the Trigger without it.';
        case 'permissions_missing':
            return 'The installation lacks a permission these events need. A GitHub org owner accepts the Haus App’s permission update on GitHub.';
        case 'agent_access_revoked':
            return 'You lost access to the GitHub connection. A Haus Owner or Admin grants it again under Settings → Connections → GitHub.';
        case 'sign_in_required':
            return 'The GitHub connection needs to sign in again. A Haus Owner or Admin signs in under Settings → Connections → GitHub.';
        default:
            return problem satisfies never;
    }
}

function githubDetailLines(trigger: GithubAgentTrigger): string[] {
    const { github } = trigger;
    const scope =
        github.repositories.scope === 'installation'
            ? `every repository you can reach in ${github.installationLogin}`
            : github.repositories.names.join(', ');
    return [
        `  repositories: ${scope}`,
        `  events: ${github.events.map((entry) => describeEvent(entry)).join('; ')}`,
        `  suppressed over the rate limit: ${github.suppressedCount}`,
    ];
}

/** `workflow_run completed conclusions=failure branches=main`, filters in a stable order. */
export function describeEvent(entry: GithubTriggerEvent): string {
    const parts: string[] = [entry.event];
    if ('actions' in entry) {
        parts.push(entry.actions.join(','));
    }
    for (const [name, value] of Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) {
        if (name === 'event' || name === 'actions' || value === undefined) {
            continue;
        }
        parts.push(`${name}=${Array.isArray(value) ? value.join(',') : String(value)}`);
    }
    return parts.join(' ');
}

function problemLabel(problem: GithubTriggerProblem): string {
    return problem.replaceAll('_', ' ');
}
