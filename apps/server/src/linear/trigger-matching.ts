import type { LinearTriggerGroup, LinearTriggerGroups } from '@haus/api';
import type { LinearProjection } from './event-projection/types.ts';

// The `linear` Trigger matcher (specs/linear-triggers.md#matching). Pure: it
// reads only the projection's stable ids, the workspace actor's team access,
// and the Trigger's owner. Values OR within a list, filters AND within a
// group, groups OR. A missing value fails an include and never matches an
// exclusion.

export interface LinearMatchContext {
    /** The workspace actor's team ids. */
    accessTeamIds: ReadonlySet<string>;
    ownerAgentId: string;
}

/** Why a delivery does not fire a Trigger, as preview reports it. */
export type LinearUnmatchedReason = 'no_group_matched' | 'own_change' | 'team_outside_access';

export type LinearMatch =
    | { groups: number[]; kind: 'matched' }
    /** It matched, but the owning Agent caused it: never fires (self-suppression). */
    | { groups: number[]; kind: 'own_change' }
    | { kind: 'unmatched'; reason: Exclude<LinearUnmatchedReason, 'own_change'> };

/** The filterable facts of the issue (or project) a delivery is about. */
interface Subject {
    assigneeId: string | null;
    delegateAgentId: string | null;
    labelIds: string[];
    projectId: string | null;
    teamIds: string[];
}

export function matchLinearTrigger(
    groups: LinearTriggerGroups,
    projection: LinearProjection,
    context: LinearMatchContext
): LinearMatch {
    const subject = subjectOf(projection);
    if (!subject.teamIds.some((teamId) => context.accessTeamIds.has(teamId))) {
        return { kind: 'unmatched', reason: 'team_outside_access' };
    }
    const matched = groups.flatMap((group, index) =>
        matchesGroup(group, projection, subject) ? [index] : []
    );
    if (matched.length === 0) {
        return { kind: 'unmatched', reason: 'no_group_matched' };
    }
    return projection.haus.agentActor === context.ownerAgentId
        ? { groups: matched, kind: 'own_change' }
        : { groups: matched, kind: 'matched' };
}

function matchesGroup(group: LinearTriggerGroup, projection: LinearProjection, subject: Subject) {
    if (group.event !== projection.event) {
        return false;
    }
    if (!(group.actions as readonly string[]).includes(projection.action)) {
        return false;
    }
    return commonFilters(group, projection, subject) && eventFilters(group, projection, subject);
}

function commonFilters(group: LinearTriggerGroup, projection: LinearProjection, subject: Subject) {
    const actorMatches = (entry: NonNullable<LinearTriggerGroup['actors']>[number]) =>
        'agent' in entry
            ? projection.haus.agentActor !== null && projection.haus.agentActor === entry.agent
            : projection.actor.id !== null && projection.actor.id === entry.linearUser;
    return (
        includes(group.teams, subject.teamIds) &&
        includes(group.projects, present(subject.projectId)) &&
        includes(group.labels, subject.labelIds) &&
        excludes(group.labelsIgnore, subject.labelIds) &&
        includes(
            group.delegates?.map((entry) => entry.agent),
            present(subject.delegateAgentId)
        ) &&
        includes(group.assignees, present(subject.assigneeId)) &&
        (group.actors === undefined || group.actors.some(actorMatches)) &&
        (group.actorsIgnore === undefined || !group.actorsIgnore.some(actorMatches))
    );
}

function eventFilters(group: LinearTriggerGroup, projection: LinearProjection, subject: Subject) {
    if (group.event === 'issue' && projection.event === 'issue') {
        return issueFilters(group, projection);
    }
    if (group.event === 'comment' && projection.event === 'comment') {
        return includes(
            group.onIssueDelegatedTo?.map((entry) => entry.agent),
            present(subject.delegateAgentId)
        );
    }
    if (group.event === 'project' && projection.event === 'project') {
        const { project } = projection;
        if (projection.action === 'update' && project.changed.length === 0) {
            return false;
        }
        return (
            includes(group.changed, project.changed) &&
            includes(group.projectStatuses, present(project.status?.id ?? null))
        );
    }
    return false;
}

/**
 * `stateTo` matches the state an issue arrived in: on create, or when the
 * state changed. An update whose changed keys are all outside the vocabulary
 * never matches.
 */
function issueFilters(
    group: Extract<LinearTriggerGroup, { event: 'issue' }>,
    projection: Extract<LinearProjection, { event: 'issue' }>
) {
    const { issue } = projection;
    if (projection.action === 'update' && issue.changed.length === 0) {
        return false;
    }
    const arrivedIn =
        projection.action === 'create' || issue.previousState !== null
            ? present(issue.state?.id ?? null)
            : [];
    return (
        includes(group.changed, issue.changed) &&
        includes(group.stateFrom, present(issue.previousState?.id ?? null)) &&
        includes(group.stateTo, arrivedIn) &&
        includes(group.stateTypes, present(issue.state?.type ?? null))
    );
}

function subjectOf(projection: LinearProjection): Subject {
    switch (projection.event) {
        case 'issue':
            return issueSubject(projection.issue, projection.team.id);
        case 'comment':
            return issueSubject(projection.comment.issue, projection.comment.issue.team.id);
        case 'project':
            return {
                assigneeId: null,
                delegateAgentId: null,
                labelIds: [],
                projectId: projection.project.id,
                teamIds: projection.project.teamIds,
            };
        default:
            return {
                assigneeId: null,
                delegateAgentId: null,
                labelIds: [],
                projectId: null,
                teamIds: [],
            };
    }
}

function issueSubject(
    issue: {
        assignee: { id: string | null } | null;
        delegate: { agentId: string | null };
        labels: { id: string }[];
        project: { id: string | null } | null;
    },
    teamId: string | null
): Subject {
    return {
        assigneeId: issue.assignee?.id ?? null,
        delegateAgentId: issue.delegate.agentId,
        labelIds: issue.labels.map((label) => label.id),
        projectId: issue.project?.id ?? null,
        teamIds: present(teamId),
    };
}

/** An absent list matches anything; otherwise some value must be listed. */
function includes(list: readonly string[] | undefined, values: readonly string[]): boolean {
    return list === undefined || values.some((value) => list.includes(value));
}

/** An absent list excludes nothing; otherwise no value may be listed. */
function excludes(list: readonly string[] | undefined, values: readonly string[]): boolean {
    return list === undefined || !values.some((value) => list.includes(value));
}

function present(value: string | null): string[] {
    return value === null ? [] : [value];
}
