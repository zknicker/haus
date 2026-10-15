import type { LinearTriggerGroup, LinearTriggerView } from '@haus/api';
import type { LinearIssueFacts, LinearProjection, LinearProjectionCommon } from './types.ts';

type Names = (id: string | undefined) => string | null;
type Common = Omit<LinearProjectionCommon, 'event'>;

/**
 * A plausible projection of a Trigger's first group, marked `test: true`, so a
 * `trigger.test` fire rehearses exactly the shape a real delivery produces.
 * Values come from the group's own stored ids and display names, or are
 * obviously sample data (`SAMPLE-0`).
 */
export function sampleLinearProjection(
    linear: Pick<LinearTriggerView, 'display' | 'groups'>
): LinearProjection {
    const [group] = linear.groups;
    if (!group) {
        throw new Error('A Linear Trigger has at least one group.');
    }
    const name: Names = (id) => (id ? (linear.display[id] ?? null) : null);
    const teamId = group.teams?.[0] ?? null;
    const common: Common = {
        action: group.actions[0] ?? 'create',
        actor: { id: null, name: 'Sample person', type: 'user' },
        createdAt: null,
        haus: { agentActor: null, test: true },
        organization: { id: null, urlKey: null },
        team: { id: teamId, key: name(teamId ?? undefined) },
        url: null,
    };
    switch (group.event) {
        case 'issue':
            return sampleIssue(group, common, name);
        case 'comment':
            return sampleComment(group, common, name);
        default:
            return sampleProject(group, common, name);
    }
}

function sampleIssueFacts(group: LinearTriggerGroup, name: Names): LinearIssueFacts {
    const labelId = group.labels?.[0];
    const projectId = group.projects?.[0];
    return {
        assignee: null,
        delegate: { agentId: group.delegates?.[0]?.agent ?? null, linearUserId: null },
        id: 'sample-issue',
        identifier: 'SAMPLE-0',
        labels: labelId ? [{ id: labelId, name: name(labelId) }] : [],
        project: projectId ? { id: projectId, name: name(projectId) } : null,
        state: null,
        title: 'Sample issue',
        url: null,
    };
}

function sampleIssue(
    group: Extract<LinearTriggerGroup, { event: 'issue' }>,
    common: Common,
    name: Names
): LinearProjection {
    const stateId = group.stateTo?.[0];
    const fromId = group.stateFrom?.[0];
    return {
        ...common,
        event: 'issue',
        issue: {
            ...sampleIssueFacts(group, name),
            changed: common.action === 'update' ? (group.changed ?? ['state']) : [],
            description: 'Sample description.',
            previousLabelIds: null,
            previousState: fromId ? { id: fromId, name: name(fromId), type: null } : null,
            priority: 0,
            state: stateId
                ? { id: stateId, name: name(stateId), type: group.stateTypes?.[0] ?? null }
                : null,
        },
    };
}

function sampleComment(
    group: Extract<LinearTriggerGroup, { event: 'comment' }>,
    common: Common,
    name: Names
): LinearProjection {
    const facts = sampleIssueFacts(group, name);
    const delegateAgentId = group.onIssueDelegatedTo?.[0]?.agent ?? facts.delegate.agentId;
    return {
        ...common,
        comment: {
            body: 'Sample comment.',
            id: 'sample-comment',
            issue: {
                ...facts,
                delegate: { agentId: delegateAgentId, linearUserId: null },
                team: common.team,
            },
            parentId: null,
        },
        event: 'comment',
    };
}

function sampleProject(
    group: Extract<LinearTriggerGroup, { event: 'project' }>,
    common: Common,
    name: Names
): LinearProjection {
    const statusId = group.projectStatuses?.[0];
    const projectId = group.projects?.[0];
    return {
        ...common,
        event: 'project',
        project: {
            changed: common.action === 'update' ? (group.changed ?? ['status']) : [],
            description: 'Sample description.',
            id: projectId ?? 'sample-project',
            lead: null,
            name: name(projectId) ?? 'Sample project',
            status: statusId ? { id: statusId, name: name(statusId) } : null,
            teamIds: common.team.id ? [common.team.id] : [],
            url: null,
        },
    };
}
