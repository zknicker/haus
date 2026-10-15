import type { LinearTriggerGroup, LinearTriggerProblem, LinearTriggerView } from '@haus/api';

// `linear` Triggers render read-only until their authoring lands
// (specs/linear-triggers.md#app-ui).

const problemTitles: Record<LinearTriggerProblem, string> = {
    agent_access_revoked: 'Agent access revoked',
    references_unavailable: 'References unavailable',
    sign_in_required: 'Sign in required',
    teams_unavailable: 'Teams unavailable',
    workspace_removed: 'Workspace removed',
};

/** The short name a list row's chip shows. */
export function linearProblemTitle(problem: LinearTriggerProblem) {
    return problemTitles[problem];
}

/** What fixes each problem, as the detail panel's banner says it. */
export function linearProblemFix(
    problem: LinearTriggerProblem,
    names: { agentName: string; workspaceName: string }
) {
    switch (problem) {
        case 'workspace_removed':
            return `${names.workspaceName} was removed from Haus. Delete this trigger, or connect the workspace again and recreate it.`;
        case 'sign_in_required':
            return `Reconnect ${names.workspaceName} in Settings → Connections → Linear.`;
        case 'agent_access_revoked':
            return `Give ${names.agentName} access to Linear again in Settings → Connections → Linear.`;
        case 'teams_unavailable':
            return 'The Haus app lost access to a team this trigger listens to. A Linear admin can grant it again.';
        default:
            return 'A label, state, or project this trigger names no longer exists in Linear.';
    }
}

const eventLabels: Record<LinearTriggerGroup['event'], string> = {
    comment: 'Comment',
    issue: 'Issue',
    project: 'Project',
};

/** "Issue created" or "Comment created or updated": a group's row title. */
export function linearGroupTitle(group: LinearTriggerGroup) {
    // Every action verb ends in "e": create, update, remove.
    const actions = group.actions.map((action) => `${action}d`);
    return `${eventLabels[group.event]} ${joinOr(actions)}`;
}

/**
 * A group's filters by display name, one clause each; an Agent reads by its
 * name. Unknown ids fall back to the id itself rather than disappearing.
 */
export function linearGroupSummary(
    group: LinearTriggerGroup,
    display: LinearTriggerView['display'],
    agentName: (agentId: string) => string
): string {
    const name = (id: string) => display[id] ?? id;
    const names = (ids: readonly string[] | undefined) => (ids ? joinOr(ids.map(name)) : null);
    const agents = (refs: readonly { agent: string }[] | undefined) =>
        refs ? joinOr(refs.map((ref) => agentName(ref.agent))) : null;
    const actors = (refs: readonly ({ agent: string } | { linearUser: string })[] | undefined) =>
        refs
            ? joinOr(
                  refs.map((ref) => ('agent' in ref ? agentName(ref.agent) : name(ref.linearUser)))
              )
            : null;
    const clauses: [string, string | null][] = [
        ['Teams', names(group.teams)],
        ['Projects', names(group.projects)],
        ['Labels', names(group.labels)],
        ['Not labels', names(group.labelsIgnore)],
        ['Assignee', names(group.assignees)],
        ['Delegate', agents(group.delegates)],
        ['By', actors(group.actors)],
        ['Not by', actors(group.actorsIgnore)],
    ];
    if (group.event === 'issue') {
        clauses.unshift(
            ['Changed', group.changed ? group.changed.join(', ') : null],
            ['From', names(group.stateFrom)],
            ['To', names(group.stateTo)],
            ['State type', group.stateTypes ? joinOr(group.stateTypes) : null]
        );
    } else if (group.event === 'comment') {
        clauses.push(['On issues delegated to', agents(group.onIssueDelegatedTo)]);
    } else {
        clauses.unshift(
            ['Changed', group.changed ? group.changed.join(', ') : null],
            ['Status', names(group.projectStatuses)]
        );
    }
    const text = clauses
        .filter((clause): clause is [string, string] => clause[1] !== null)
        .map(([label, value]) => `${label}: ${value}`)
        .join('\n');
    return text || 'Any';
}

function joinOr(values: readonly string[]) {
    if (values.length <= 1) {
        return values[0] ?? '';
    }
    return `${values.slice(0, -1).join(', ')} or ${values.at(-1)}`;
}
